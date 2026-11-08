# LWM prediction service adapter

The Aero comparison workspace shows two recorded Large Wing Model (LWM) benchmarks. Predicting new wings needs
the model itself, which is a PyTorch deep-kernel Gaussian process that must hold its training set and two
checkpoints in memory. This browser build does not run it; browser porting has not been benchmarked. The workspace provides a protocol for a separate model-resident service
through the protocol below. Nothing in the page predicts a geometry the service has not answered.

## Protocol

`GET /domain` returns the model identity (name, repository, pinned commit, number of checkpoints, conditioning),
`resident` (model loaded), `coldLoadSeconds`, `device`, `threads`, and `domain`: closed ranges for `alphaDeg`,
`mach`, `semiSpanOverChord`, `taperRatio`, `sweepDeg` and the list of `sections` the service will accept.

`POST /predict` takes `{"mode": "mean" | "full", "cases": [...]}`. Each case has `id`, `section`, `alphaDeg`,
`mach`, `semiSpanOverChord`, `taperRatio` (default 1) and `sweepDeg` (default 0). Each result has `status`
(`ok`, `out_of_domain`, `unavailable`), `integratedOrder` = `[CLpressure, CmQuarter, rootBendingCoefficient,
CLpaperNormalOnly]`, `integratedMean`, and for `mode: "full"` also `integratedCovariance` (4 x 4) and `stations`
(`eta`, `cl`, `clStd`, `cmQuarter`). The response `timing` carries `coldLoadMs` on the request that loaded the
model and `totalMs` always; per-case `timing.computeMs` is batch compute time divided by request count, not independently measured per-design latency; `timing.cacheHit` reports cache use.

`CLpressure` is the full pressure-force projection and is the headline value; `CLpaperNormalOnly` is the authors'
normal-force approximation and is reported separately. They are never mixed.

## Client behaviour (lwm-client.js)

Canonical-input cache, domain gating from `/domain`, mean screening of all in-domain candidates in one request,
full covariance only for the top k of the chosen objective (`maxCL`, `minAbsCm`, `minRootBending` with a CL
target), and timing bookkeeping (cold load, warm round trips, cache hits). With no endpoint the client is
`offline` and the page states that only recorded benchmarks are shown. The endpoint value `mock` wires the
in-browser mock transport, which replays the two recorded cases and refuses everything else.

## Running

Mock, for adapter and UI tests (no model, no cluster):

```
python3 lwm_service.py --mock ../../wing-comparison/benchmarks.json --port 8765
python3 lwm_service.py --selftest ../../wing-comparison/benchmarks.json
```

Live, on a machine that already holds the model:

```
python3 lwm_service.py --runtime lwm_runtime:adapter --preload --port 8765
```

`lwm_runtime` is a small module you write on that machine. It must expose `load()` (build the LWM instance from
`hwlee924/Large-Wing-Model` at commit `4cca875b84b97571569070a8032ce304db3d7311` with `weights/weights_1` and
`weights/weights_2` and the training CSV the notebook uses), `domain()` (the ranges the model was trained on),
`predict_mean(model, cases)` and `predict_full(model, cases)` returning the result shape above. The authors'
notebook (`large_wing_model_demo.ipynb`) shows the `input_wing` and `lwm.predict(..., target_weights=[...])` calls
to wrap; their code and weights are not copied into this repository.

## What is and is not provided

Provided: protocol, resident caching and timing in the service, the browser client, the mock, a self-test.
Not provided: the model runtime, weights or training data, and no cluster job has been started for this feature.
Recorded reference for cost: the full-covariance inference for the two benchmark wings (about 7400 points) took
44.84 s on 16 CPU threads after model preparation. That is a batch time; per-design latency for mean-only
screening is expected to be much lower but has not been measured here and is not claimed.

## Independent review correction

This release supplies a protocol host and replay backend, **not an implemented or weight-tested LWM runtime**. `--runtime` loads a separately supplied plugin; passing replay tests does not validate live inference. No general-inference or optimization accuracy claim follows. This browser build does not execute LWM; browser porting has not been benchmarked. The mock serves only exact recorded inputs; its broad envelope is not a validated model domain. Timing is measured replay overhead, not model speed. Real plugins must document their domain and provenance, preserve the full joint pressure covariance when integrating uncertainty, and independently validate results before use. Reynolds is not an input and no low-Reynolds validity is inferred.
