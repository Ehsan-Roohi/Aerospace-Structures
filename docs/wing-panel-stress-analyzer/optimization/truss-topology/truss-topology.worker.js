// Module Web Worker: runs the baseline solve, the OC optimizer, the plastic-design LP and the exact verifications
// off the main thread and posts progress. Message in: { cmd: 'run', params }. Messages out:
// { type: 'progress', stage, fraction, text } | { type: 'done', result } | { type: 'error', message }.
import { runAll } from './truss-topology.js';

let lastPost = 0;

self.onmessage = (e) => {
  const msg = e.data;
  if (!msg || msg.cmd !== 'run') return;
  try {
    const result = runAll(msg.params, (pr) => {
      const t = Date.now();
      if (t - lastPost > 40 || /done$/.test(pr.stage)) {
        lastPost = t;
        self.postMessage({ type: 'progress', stage: pr.stage, fraction: pr.fraction, text: pr.text });
      }
    });
    self.postMessage({ type: 'done', result });
  } catch (err) {
    self.postMessage({ type: 'error', message: String((err && err.message) || err) });
  }
};

self.postMessage({ type: 'ready' });
