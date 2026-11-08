#!/usr/bin/env python3
"""Model-resident prediction service for the Large Wing Model (LWM) behind the Aero comparison workspace.

Protocol (JSON over HTTP, CORS enabled):
  GET  /domain   -> model identity, residency, cold-load time and the valid input domain
  POST /predict  -> {"mode": "mean" | "full", "cases": [{id, section, alphaDeg, mach, semiSpanOverChord, taperRatio, sweepDeg}]}
                    results carry integratedOrder = [CLpressure, CmQuarter, rootBendingCoefficient, CLpaperNormalOnly];
                    mode "full" adds integratedCovariance and span stations. Out-of-domain or unknown cases are
                    answered with status "out_of_domain" / "unavailable", never with invented numbers.

Two back ends:
  --mock benchmarks.json   replays the two recorded benchmark cases only (adapter and UI testing; no model needed)
  --runtime module:name    live model. The module must expose load(), domain(), predict_mean(model, cases) and
                           predict_full(model, cases) wrapping the authors' code (hwlee924/Large-Wing-Model,
                           commit 4cca875b84b97571569070a8032ce304db3d7311, weights_1 and weights_2, training set).
                           This file does not bundle that code or its weights.

The model is loaded once and kept resident; results are cached by canonical input; the first request reports
coldLoadMs, later ones warm compute time. Run with --selftest to exercise the mock end to end.
"""
import argparse, hashlib, importlib, json, sys, threading, time, math
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ORDER = ["CLpressure", "CmQuarter", "rootBendingCoefficient", "CLpaperNormalOnly"]


def canonical(c):
    if not isinstance(c, dict) or set(c) - {'id','section','alphaDeg','mach','semiSpanOverChord','taperRatio','sweepDeg'}:
        raise ValueError('Unknown or unsupported case inputs')
    section = ' '.join(str(c.get('section', '')).upper().split())
    values = [c.get('alphaDeg'), c.get('mach'), c.get('semiSpanOverChord'), c.get('taperRatio',1), c.get('sweepDeg',0)]
    if not section or any(isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) for v in values):
        raise ValueError('Section and finite numeric inputs required')
    return json.dumps([section, *values], separators=(',',':'))


def in_range(v, lo_hi):
    return lo_hi is not None and v is not None and lo_hi[0] - 1e-9 <= float(v) <= lo_hi[1] + 1e-9


def domain_check(domain, c):
    reasons = []
    d = domain["domain"]
    for key, label, default in [("alphaDeg", "alpha", None), ("mach", "Mach", None), ("semiSpanOverChord", "s/c", None), ("taperRatio", "taper", 1.0), ("sweepDeg", "sweep", 0.0)]:
        v = c.get(key, default)
        if not in_range(v, d.get(key)):
            reasons.append(f"{label} {v} outside {d.get(key)}")
    sections = d.get("sections")
    if sections and " ".join(str(c.get("section", "")).upper().split()) not in [" ".join(s.upper().split()) for s in sections]:
        reasons.append(f"section {c.get('section')} not served")
    if domain.get('mock') and canonical(c) not in domain.get('recordedCases', []):
        reasons.append('mock service replays recorded benchmarks only')
    return reasons


class MockBackend:
    """Replays the recorded benchmark predictions; refuses everything else."""

    def __init__(self, path, cold_load_s=None):
        with open(path, encoding="utf-8") as f:
            self.bench = json.load(f)
        self.cold_load_s = cold_load_s
        self.cases = {}
        for c in self.bench["cases"]:
            key = canonical({"section": c["airfoil"].replace("NACA", "NACA ").replace("  ", " "), "alphaDeg": c["conditions"]["effectiveAlphaDeg"], "mach": c["conditions"]["effectiveMach"], "semiSpanOverChord": c["conditions"]["semiSpanOverChord"], "taperRatio": 1, "sweepDeg": 0})
            self.cases[key] = c

    def bounds(self, key):
        values=[c["conditions"][key] for c in self.bench["cases"]]
        return [min(values),max(values)]

    def load(self):
        return {"mock": True}

    def domain(self):
        src = self.bench["source"]
        sections = sorted({c["airfoil"].replace("NACA", "NACA ").replace("  ", " ") for c in self.bench["cases"]})
        return {"service": "lwm-service mock", "mock": True, "device": "none", "threads": 0,
                "model": {"name": src["name"], "repository": src["repository"], "commit": src["commit"], "checkpoints": src["inferenceCheckpoints"], "conditioning": "none"},
                "domain": {"alphaDeg": self.bounds("effectiveAlphaDeg"), "mach": self.bounds("effectiveMach"), "semiSpanOverChord": self.bounds("semiSpanOverChord"), "taperRatio": [1, 1], "sweepDeg": [0, 0], "sections": sections},
                "recordedCases": sorted(self.cases)}

    def _one(self, model, c, full):
        hit = self.cases.get(canonical(c))
        if hit is None:
            return {"status": "unavailable", "reason": "mock service replays recorded benchmarks only"}
        l = hit["lwm"]
        out = {"status": "ok", "integratedOrder": l["integratedOrder"], "integratedMean": l["integratedMean"]}
        if full:
            out["integratedCovariance"] = l["integratedCovariance"]
            out["stations"] = [{"eta": s["eta"], "cl": s["cl"], "clStd": s["clStd"], "cmQuarter": s["cmQuarter"]} for s in l["stations"]]
        return out

    def predict_mean(self, model, cases):
        return [self._one(model, c, False) for c in cases]

    def predict_full(self, model, cases):
        return [self._one(model, c, True) for c in cases]


class RuntimeBackend:
    def __init__(self, spec):
        mod, _, name = spec.partition(":")
        self.module = importlib.import_module(mod)
        self.impl = getattr(self.module, name) if name else self.module
        for fn in ("load", "domain", "predict_mean", "predict_full"):
            if not callable(getattr(self.impl, fn, None)):
                raise SystemExit(f"runtime {spec} lacks {fn}()")
        self.cold_load_s = None

    def load(self):
        return self.impl.load()

    def domain(self):
        d = dict(self.impl.domain())
        d.setdefault("service", "lwm-service"); d.setdefault("mock", False)
        return d

    def predict_mean(self, model, cases):
        return self.impl.predict_mean(model, cases)

    def predict_full(self, model, cases):
        return self.impl.predict_full(model, cases)


def validate_result(out, mode):
    if not isinstance(out, dict) or out.get('status') not in ('ok','unavailable','out_of_domain'):
        raise ValueError('Invalid runtime status')
    if out['status'] != 'ok': return
    m=out.get('integratedMean')
    if out.get('integratedOrder') != ORDER or not isinstance(m,list) or len(m)!=4 or not all(isinstance(v,(int,float)) and math.isfinite(v) for v in m):
        raise ValueError('Invalid integrated order or mean')
    if mode != 'full': return
    c=out.get('integratedCovariance')
    if not isinstance(c,list) or len(c)!=4 or any(not isinstance(row,list) or len(row)!=4 or not all(isinstance(v,(int,float)) and math.isfinite(v) for v in row) for row in c):
        raise ValueError('Invalid covariance shape')
    tol=1e-10*max(1e-30,max(abs(v) for row in c for v in row)); a=[row[:] for row in c]
    if any(abs(c[i][j]-c[j][i])>tol for i in range(4) for j in range(4)): raise ValueError('Asymmetric covariance')
    for k in range(4):
        if a[k][k]<-tol: raise ValueError('Non-positive-semidefinite covariance')
        if a[k][k]<=tol:
            if any(abs(a[j][k])>tol for j in range(k+1,4)): raise ValueError('Non-positive-semidefinite covariance')
            continue
        for i in range(k+1,4):
            for j in range(i,4): a[j][i]=a[i][j]=a[i][j]-a[i][k]*a[j][k]/a[k][k]
    stations=out.get('stations')
    if not isinstance(stations,list) or any(not all(isinstance(t.get(k),(int,float)) and math.isfinite(t[k]) for k in ('eta','cl','clStd')) or not 0<=t['eta']<=1 or t['clStd']<0 for t in stations):
        raise ValueError('Invalid span uncertainty')


class Service:
    def __init__(self, backend):
        self.backend = backend
        self.model = None
        self.cold_load_ms = None
        self.cache = {}
        self.lock = threading.Lock()
        self.requests = 0

    def ensure_loaded(self):
        if self.model is None:
            t0 = time.perf_counter()
            self.model = self.backend.load()
            measured = 1000 * (time.perf_counter() - t0)
            configured = getattr(self.backend, "cold_load_s", None)
            # the mock reports its configured stand-in cold-load time so the UI path can be exercised
            self.cold_load_ms = measured
            return True
        return False

    def domain(self):
        d = self.backend.domain()
        d["resident"] = self.model is not None
        d["coldLoadSeconds"] = None if self.cold_load_ms is None else self.cold_load_ms / 1000
        if isinstance(self.backend, MockBackend) and self.cold_load_ms is None:
            d["coldLoadSeconds"] = self.backend.cold_load_s
        return d

    def predict(self, body):
        if not isinstance(body, dict): raise ValueError('JSON object required')
        mode = body.get("mode", "mean")
        if mode not in ("mean", "full"):
            raise ValueError("mode must be 'mean' or 'full'")
        if not isinstance(body, dict):
            raise ValueError('JSON object required')
        cases = body.get("cases", [])
        if not isinstance(cases, list) or len(cases) > 500:
            raise ValueError("cases must be a list of at most 500 entries")
        for c in cases: canonical(c)
        with self.lock:
            self.requests += 1
            timing = {"totalMs": 0.0, "warm": self.model is not None}
            t0 = time.perf_counter()
            if self.ensure_loaded():
                timing["coldLoadMs"] = self.cold_load_ms
            domain = self.domain()
            results, ask = [None] * len(cases), []
            for i, c in enumerate(cases):
                cid = c.get("id", canonical(c))
                reasons = domain_check(domain, c)
                if reasons:
                    results[i] = {"id": cid, "status": "out_of_domain", "reason": "; ".join(reasons)}
                    continue
                key = (mode, canonical(c))
                if key in self.cache:
                    results[i] = dict(self.cache[key], id=cid, timing={"computeMs": 0.0, "cacheHit": True})
                else:
                    ask.append((i, c, cid, key))
            if ask:
                t1 = time.perf_counter()
                fn = self.backend.predict_full if mode == "full" else self.backend.predict_mean
                outs = fn(self.model, [a[1] for a in ask])
                per = 1000 * (time.perf_counter() - t1) / max(1, len(ask))
                if not isinstance(outs, list) or len(outs) != len(ask): raise ValueError('Incomplete runtime response')
                for out in outs: validate_result(out, mode)
                for (i, c, cid, key), out in zip(ask, outs):
                    rec = dict(out, id=cid, timing={"computeMs": per, "cacheHit": False})
                    if out.get("status") == "ok":
                        self.cache[key] = {k: v for k, v in out.items()}
                    results[i] = rec
            timing["totalMs"] = 1000 * (time.perf_counter() - t0)
            return {"results": results, "timing": timing, "order": ORDER}


def make_handler(service):
    class Handler(BaseHTTPRequestHandler):
        def _send(self, code, obj):
            data = json.dumps(obj, allow_nan=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "content-type")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_OPTIONS(self):
            self._send(204, {})

        def do_GET(self):
            if self.path.split("?")[0] == "/domain":
                return self._send(200, service.domain())
            self._send(404, {"error": "unknown path"})

        def do_POST(self):
            if self.path.split("?")[0] != "/predict":
                return self._send(404, {"error": "unknown path"})
            try:
                n = int(self.headers.get("Content-Length", "0"))
                if n < 0 or n > 1000000: raise ValueError('Request limit is 1 MB')
                body = json.loads(self.rfile.read(n) or b"{}")
                self._send(200, service.predict(body))
            except ValueError as e:
                self._send(400, {"error": str(e)})
            except Exception as e:  # never invent a result
                self._send(500, {"error": f"{type(e).__name__}: {e}"})

        def log_message(self, fmt, *args):
            sys.stderr.write("[lwm-service] " + fmt % args + "\n")
    return Handler


def serve(service, host, port):
    httpd = ThreadingHTTPServer((host, port), make_handler(service))
    print(f"lwm-service listening on http://{host}:{port}  (GET /domain, POST /predict)")
    httpd.serve_forever()


def selftest(bench_path):
    import urllib.request
    service = Service(MockBackend(bench_path))
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(service))
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{port}"
    get = lambda p: json.loads(urllib.request.urlopen(base + p).read())
    post = lambda p, b: json.loads(urllib.request.urlopen(urllib.request.Request(base + p, json.dumps(b).encode(), {"Content-Type": "application/json"})).read())
    d = get("/domain")
    assert d["mock"] is True and d["resident"] is False and d["model"]["commit"].startswith("4cca875"), d
    bench = json.load(open(bench_path, encoding="utf-8"))
    c0 = bench["cases"][0]
    case = {"id": "a", "section": "NACA 0012", "alphaDeg": c0["conditions"]["effectiveAlphaDeg"], "mach": c0["conditions"]["effectiveMach"], "semiSpanOverChord": c0["conditions"]["semiSpanOverChord"], "taperRatio": 1, "sweepDeg": 0}
    r = post("/predict", {"mode": "mean", "cases": [case, dict(case, id="b", semiSpanOverChord=3.5), dict(case, id="c", alphaDeg=20)]})
    assert "coldLoadMs" in r["timing"] and r["timing"]["warm"] is False, r["timing"]
    assert r["results"][0]["status"] == "ok" and abs(r["results"][0]["integratedMean"][0] - c0["lwm"]["integratedMean"][0]) < 1e-12
    assert r["results"][1]["status"] == "out_of_domain" and r["results"][2]["status"] == "out_of_domain", r["results"][1:]
    r2 = post("/predict", {"mode": "full", "cases": [case]})
    assert r2["timing"]["warm"] is True and "coldLoadMs" not in r2["timing"]
    assert r2["results"][0]["integratedCovariance"] == c0["lwm"]["integratedCovariance"] and len(r2["results"][0]["stations"]) == len(c0["lwm"]["stations"])
    r3 = post("/predict", {"mode": "full", "cases": [case]})
    assert r3["results"][0]["timing"]["cacheHit"] is True
    assert get("/domain")["resident"] is True
    httpd.shutdown()
    print("selftest ok: domain, cold/warm timing, recorded replay, refusal of unrecorded and out-of-domain cases, cache hit")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--mock", metavar="BENCHMARKS_JSON", help="replay recorded benchmark cases only")
    ap.add_argument("--runtime", metavar="MODULE[:ATTR]", help="live LWM runtime adapter module")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--preload", action="store_true", help="load the model at start instead of on first request")
    ap.add_argument("--selftest", metavar="BENCHMARKS_JSON", help="run the mock end-to-end check and exit")
    a = ap.parse_args()
    if a.selftest:
        return selftest(a.selftest)
    if bool(a.mock) == bool(a.runtime):
        ap.error("choose exactly one of --mock or --runtime")
    service = Service(MockBackend(a.mock) if a.mock else RuntimeBackend(a.runtime))
    if a.preload:
        service.ensure_loaded()
        print(f"model loaded in {service.cold_load_ms:.0f} ms")
    serve(service, a.host, a.port)


if __name__ == "__main__":
    main()
