// MIE 446 Optimization Lab: module Web Worker for the Monte Carlo reliability study of truss-failsafe.
// Messages in:  { type: 'run', model, A, loads, opts, mc, chunk }   { type: 'cancel' }
// Messages out: { type: 'progress', done, total, stage }  { type: 'result', result }  { type: 'cancelled' }  { type: 'error', message }
import { createReliabilityStudy } from './truss-failsafe.js';

let cancelled = false;
let running = false;

self.onmessage = async (event) => {
  const msg = event.data || {};
  if (msg.type === 'cancel') { cancelled = true; return; }
  if (msg.type !== 'run') return;
  if (running) { self.postMessage({ type: 'error', message: 'a study is already running in this worker' }); return; }
  running = true;
  cancelled = false;
  try {
    const study = createReliabilityStudy(msg.model, msg.A, msg.loads, msg.opts || {}, msg.mc || {});
    const chunk = Math.max(50, Math.floor(msg.chunk || 400));
    self.postMessage({ type: 'progress', done: 0, total: study.total, stage: study.stageLabel });
    while (!study.finished) {
      study.step(chunk);
      self.postMessage({ type: 'progress', done: study.done, total: study.total, stage: study.stageLabel });
      // yield so a cancel message can be processed between chunks
      await new Promise(resolve => setTimeout(resolve, 0));
      if (cancelled) { self.postMessage({ type: 'cancelled' }); running = false; return; }
    }
    self.postMessage({ type: 'result', result: study.result() });
  } catch (err) {
    self.postMessage({ type: 'error', message: err && err.message ? err.message : String(err) });
  }
  running = false;
};
