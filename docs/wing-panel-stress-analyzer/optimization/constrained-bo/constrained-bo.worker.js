// MIE 446 Optimization Lab: module Web Worker for the constrained Bayesian optimization page.
// Runs the whole demonstration campaign (BO, same budget cap grid and random search, reference optimum and the
// exact teaching overlays) off the main thread and posts progress after every exact evaluation.
//
// Messages in:  { type: 'run', spec, budget, seed, delayMs, compare, gridN }   start a campaign
//               { type: 'cancel' }                                            stop after the current evaluation
//               { type: 'ping' }                                              liveness check, answered by 'pong'
// Messages out: { type: 'progress', method: 'bo' | 'grid' | 'random', k, total, overall, overallTotal, record, bestF, elapsedMs }
//               { type: 'phase', text }      { type: 'done', payload }      { type: 'cancelled' }      { type: 'error', message }
//
// Adapter note: another app with an expensive solver can reuse this protocol by replacing makeProblem's
// spec with its own problem description and keeping evaluate pure and synchronous inside the worker.

import { runCampaign } from './constrained-bo.js';

let cancelled = false;
let running = false;

self.onmessage = async (event) => {
  const msg = event.data || {};
  if (msg.type === 'cancel') { cancelled = true; return; }
  if (msg.type === 'ping') { self.postMessage({ type: 'pong' }); return; }
  if (msg.type !== 'run') return;
  if (running) { self.postMessage({ type: 'error', message: 'A run is already in progress in this worker.' }); return; }
  running = true;
  cancelled = false;
  try {
    await runCampaign(msg, m => self.postMessage(m), () => cancelled);
  } catch (err) {
    self.postMessage({ type: 'error', message: err && err.message ? err.message : String(err) });
  } finally {
    running = false;
  }
};
