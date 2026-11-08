// MIE 446 Optimization Lab: truss-shape module Web Worker.
// Runs the nested shape-optimization campaign (classical sweep, Nelder-Mead, CMA-ES) off the main thread,
// streams progress and incumbent geometries to the page and honours a cancel message between steps.
import { runCampaign } from './truss-shape.js';

let cancelled = false;
let running = false;

self.onmessage = async (e) => {
  const msg = e.data || {};
  if (msg.type === 'cancel') { cancelled = true; return; }
  if (msg.type !== 'run') return;
  if (running) { self.postMessage({ type: 'error', message: 'a run is already in progress' }); return; }
  running = true;
  cancelled = false;
  try {
    await runCampaign(msg.payload, m => self.postMessage(m), () => cancelled);
  } catch (err) {
    self.postMessage({ type: 'error', message: err && err.message ? err.message : String(err) });
  } finally {
    running = false;
  }
};

self.postMessage({ type: 'ready' });
