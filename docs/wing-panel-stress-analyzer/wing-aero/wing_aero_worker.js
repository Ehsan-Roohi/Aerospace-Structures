/* Wing AeroStruct aerodynamic panel solves in a Web Worker. Development version, not published.
 * Loads aero_bundle.js (wing_airfoils.js + wing_geometry.js + wing_aero_panel.js, concatenated by
 * build_wing_aerostruct.py). Requests:
 *   {id, kind:'sequence', geometry, flow, sequence:'standard'|'fine', options:{targetLift_N}}: the executed
 *     mesh-refinement sequence used for structural loads (WingAeroPanel.runSequence);
 *   {id, kind:'solve', geometry, mesh, flow, options:{targetLift_N}}: one mesh, a quick look only.
 * Replies: {id, kind:'progress', text} | {id, kind:'complete', result} | {id, kind:'error', text}.
 * Prepared models (the solved unit-freestream doublet systems) are cached by geometry and mesh (eight
 * models, one whole sequence), so a new speed, density or angle of attack needs no new linear solve.
 */
importScripts('./aero_bundle.js?v=13eb802302b6');
const aeroCache = new Map();
function handleAeroRequest(msg, post) {
  const id = msg && msg.id;
  try {
    if (!msg || (msg.kind !== 'solve' && msg.kind !== 'sequence')) throw new Error('Unknown aerodynamic request.');
    const options = msg.options || {}, t0 = Date.now(), progress = text => post({ id, kind: 'progress', text });
    if (msg.kind === 'sequence') {
      const result = WingAeroPanel.runSequence(msg.geometry, msg.flow || {}, msg.sequence || 'standard', { cache: aeroCache, progress, targetLift_N: options.targetLift_N ?? null });
      result.timing = { ...result.timing, workerTotalMs: Date.now() - t0 };
      post({ id, kind: 'complete', result });
      return;
    }
    const model = WingAeroPanel.prepare(msg.geometry, msg.mesh || {}, { cache: aeroCache, progress });
    let flow = { ...(msg.flow || {}) }, trim = null;
    if (options.targetLift_N != null) { trim = WingAeroPanel.alphaForLift(model, flow, options.targetLift_N); flow = { ...flow, alphaDeg: trim.alphaDeg }; }
    const compact = WingAeroPanel.compactResult(model, WingAeroPanel.evaluate(model, flow));
    compact.trim = trim;
    compact.modelCacheHit = !!model.lastCacheHit;
    compact.timing = { ...compact.timing, workerTotalMs: Date.now() - t0 };
    post({ id, kind: 'complete', result: compact });
  } catch (error) { post({ id, kind: 'error', text: error && error.message ? error.message : String(error) }); }
}
self.onmessage = event => handleAeroRequest(event.data, message => self.postMessage(message));
