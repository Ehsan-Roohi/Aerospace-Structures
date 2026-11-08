// MIE 446 Optimization Lab, module "pareto-nsga2": module Web Worker.
// Runs NSGA-II generation by generation, posts a progress message after every generation and can be
// cancelled with a { type: 'cancel' } message (the page may also terminate the worker directly).
// Messages in:  { type: 'run', spec, options, reference: true|false, referenceGrid: [n1, n2] }
//               { type: 'cancel' }
// Messages out: { type: 'progress', gen, generations, hv, nFeasible, frontSize, evaluations }
//               { type: 'done', result, reference, elapsedMs }
//               { type: 'cancelled' } | { type: 'error', message }

import { makeProblem, createNsga2, referenceFrontByGrid } from './pareto-nsga2.js';

let cancelled = false;
let running = false;

// Zero-delay yield so a cancel message can be processed between generations (MessageChannel is not
// subject to the nested setTimeout clamping).
function yieldToEvents() {
  return new Promise(resolve => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => { ch.port1.close(); resolve(); };
    ch.port2.postMessage(0);
  });
}

self.onmessage = async (evt) => {
  const msg = evt.data || {};
  if (msg.type === 'cancel') { cancelled = true; return; }
  if (msg.type !== 'run') return;
  if (running) { self.postMessage({ type: 'error', message: 'a run is already in progress' }); return; }
  running = true;
  cancelled = false;
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  try {
    const problem = makeProblem(msg.spec);
    const opt = createNsga2(problem, msg.options || {});
    self.postMessage({ type: 'progress', ...opt.progress() });
    while (!opt.done) {
      const p = opt.step();
      self.postMessage({ type: 'progress', ...p });
      await yieldToEvents();
      if (cancelled) { self.postMessage({ type: 'cancelled' }); running = false; return; }
    }
    const result = opt.result();
    let reference = null;
    if (msg.reference && problem.n === 2) {
      const grid = Array.isArray(msg.referenceGrid) ? msg.referenceGrid : [200, 200];
      self.postMessage({ type: 'stage', text: `Running the exact reference sweep (${grid[0]} x ${grid[1]} evaluations)...` });
      await yieldToEvents();
      if (cancelled) { self.postMessage({ type: 'cancelled' }); running = false; return; }
      reference = referenceFrontByGrid(problem, grid[0], grid[1]);
    }
    const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    self.postMessage({ type: 'done', result, reference, elapsedMs: t1 - t0 });
  } catch (err) {
    self.postMessage({ type: 'error', message: err && err.message ? err.message : String(err) });
  } finally {
    running = false;
  }
};
