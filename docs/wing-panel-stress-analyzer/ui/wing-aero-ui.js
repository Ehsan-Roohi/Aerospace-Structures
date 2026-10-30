/* Wing AeroStruct aerodynamic panel module: user interface and coupling helpers. Development version, NOT published.
 *
 * Workflow: speed, density, angle of attack (or a target lift) and a mesh sequence (Standard or Fine) run
 * WingAeroPanel.runSequence in a Web Worker (wing-aero/wing_aero_worker.js; main-thread fallback). The page then
 * shows the extrapolated coefficients with their uncertainty, the global-load consistency checks and every mesh of
 * the sequence. "Apply to structure" stores the solved levels (S.aeroLoad); the page derives the extrapolated
 * six-component strip load (WingAeroPanel.combineSequence), solves the spatial beam with it and runs the admission
 * test against the structural axis (WingAeroPanel.admission). A load that is not admitted is not used: the page
 * withholds the coupled structural result and this panel shows why.
 *
 * adapter = { geometry(): normalized geometry, settings(): saved object | null, saveSettings(obj),
 *   structure(): { supported, message } for six-component loads on the current structure,
 *   snapStations(): structural stations (ribs, seams, geometry stations, spar ends, custom-load stations),
 *   applied(): the applied record (S.aeroLoad) | null, apply(record) (may throw), remove(),
 *   geometryKey(geometry): SHA-256 hex of WingAeroPanel.geometryKey(geometry),
 *   disabled(): '' or a reason, workerURL: string | null, download(name, text, mime) optional }
 * Browser: global WingAeroUI. Node: require('./wing_aero_ui.js').
 */
const WingAeroUI = (() => {
  'use strict';
  const DEFAULTS = Object.freeze({ speed: 15, density: 1.225, alphaDeg: 4, viscosity: 1.81e-5, speedOfSound: 340.29, sequence: 'standard' });
  const SEQUENCE_TEXT = Object.freeze({ standard: 'Standard', fine: 'Fine' });
  const SEQUENCE_NOTE = 'Each new sequence solves eight meshes, refining both chord and span. Standard: up to 96 × 16 and 64 × 24 panels (around × spanwise); Fine: up to 192 × 16 and 64 × 48, with a mixed-refinement mesh in each sequence. Fine costs more. Use the on-screen stage and elapsed time; runtime depends on geometry and device.';
  const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v, d = 4) => (v == null || !Number.isFinite(v) ? '–' : Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(3).replace('-', '−') : String(Number(v.toPrecision(d))).replace('-', '−'));
  const pct = v => (Number.isFinite(v) ? `${(100 * v).toFixed(v < 0.1 ? 2 : 1)}&nbsp;%` : '–');
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  // --------------------------------------------------------------- coupling helpers (pure, used by the page and tests)
  // The applied record keeps exactly what the study file stores (see wing_study_io.js checkAeroLoad).
  function recordFromSequence(seq, geometrySha256, label) {
    const f = seq.flow;
    return { kind: 'panelSequence', label: label || `Panel-method pressure load, α ${+f.alphaDeg.toFixed(4)}°, V ${+f.speed.toFixed(4)} m/s, ${seq.sequence} sequence`, sequence: seq.sequence, geometrySha256,
      flow: { speed: f.speed, density: f.density, alphaDeg: f.alphaDeg, viscosity: f.viscosity, speedOfSound: f.speedOfSound },
      levels: seq.levels.map(l => ({ chordPanels: l.chordPanels, spanPanels: l.spanPanels, strips: l.strips.map(r => r.slice()), coefficients: { CL: l.coefficients.CL, CLTrefftz: l.coefficients.CLTrefftz, CDpressure: l.coefficients.CDpressure, CDiTrefftz: l.coefficients.CDiTrefftz, Cm: l.coefficients.Cm }, roundedTip: l.roundedTip ? { length_mm: l.roundedTip.length_mm, start_mm: l.roundedTip.start_mm, strips: l.roundedTip.strips } : null })) };
  }
  // A record viewed as a sequence for WingAeroPanel.combineSequence and admission (q and reference recomputed).
  function sequenceOf(A, geometry, record) {
    const q = 0.5 * record.flow.density * record.flow.speed ** 2;
    return { sequence: record.sequence, levels: record.levels, flow: { ...record.flow, dynamicPressure_Pa: q }, reference: A.references(A.aeroGeometry(geometry)) };
  }
  function delivered(A, geometry, record, snapStations = []) { return A.combineSequence(geometry, sequenceOf(A, geometry, record), { snapStations }); }
  // Global aerodynamic results do not require a spatial-beam load or structural admission. Use the existing
  // sequence estimator verbatim for callers requesting aerodynamic results without a structural transfer.
  function aerodynamicSummary(A, seq) {
    const find = (c, s) => { const l = seq.levels.find(v => v.chordPanels === c && v.spanPanels === s); if (!l) throw new Error(`Missing aerodynamic mesh ${c} x ${s}.`); return l; };
    const est = f => A.sequenceEstimate(seq.sequence, (c, s) => f(find(c, s)));
    const coefficients = Object.fromEntries(['CL', 'CLTrefftz', 'CDpressure', 'CDiTrefftz', 'Cm'].map(k => [k, est(l => l.coefficients[k])]));
    const rootWrench = [0, 1, 2, 3, 4, 5].map(d => est(l => l.strips.reduce((sum, r) => sum + r[2 + d], 0)));
    const lift = { pressure: coefficients.CL.value, trefftz: coefficients.CLTrefftz.value, relativeDifference: Math.abs(coefficients.CL.value - coefficients.CLTrefftz.value) / Math.max(Math.abs(coefficients.CL.value), A.ADMISSION.liftConsistencyFloorCL) };
    const drag = { pressure: coefficients.CDpressure.value, trefftz: coefficients.CDiTrefftz.value, difference: coefficients.CDpressure.value - coefficients.CDiTrefftz.value, combinedUncertainty: coefficients.CDpressure.uncertainty + coefficients.CDiTrefftz.uncertainty };
    return { kind: 'aerodynamicSummary', structuralLoadAvailable: false, sequence: seq.sequence, strips: [], weights: A.sequenceWeights(seq.sequence), coefficients, rootWrench, consistency: { lift, drag } };
  }
  const engineLoad = (combined, label) => {
    if (combined.structuralLoadAvailable === false) throw new Error('This aerodynamic summary contains no structural strip load.');
    return { kind: 'aeroStrips', lineFraction: combined.lineFraction, strips: combined.strips.map(r => r.slice()), label: String(label || 'Aerodynamic panel load').slice(0, 200) };
  };
  // Cut planes of the structural result: the root (all loads, about the root axis node, axis direction) and normal
  // cuts at the admission stations; structuralTorque is the engine's own torque of the aerodynamic part.
  function structuralCuts(A, R) {
    const a = R && R.analysis3D;
    if (!a || a.stressOnly || typeof a.cutAt !== 'function') throw new Error('The admission test needs the spatial-beam result.');
    const L = R.geometry.semiSpan, root = a.cutAt(0), n0 = root.R[0];
    const cuts = [{ y: 0, root: true, reference: a.nodes[0].slice(), normal: n0.slice(), structuralTorque: a.aeroLoad ? dot(a.aeroLoad.appliedWrench.momentAboutRoot, n0) : undefined }];
    for (const f of A.ADMISSION.stations) { const y = f * L, c = a.cutAt(y), ac = a.aeroLoad ? a.aeroLoad.cutAt(y) : null; cuts.push({ y, reference: c.reference.slice(), normal: c.R[0].slice(), structuralTorque: ac ? ac.torque : undefined }); }
    return cuts;
  }
  // Torsion data of the structural result for the twist claim: cuts at k L / n (k = 0 .. n - 1) on the engine's own
  // section planes, the frame elements' torsional compliance per unit projected span, k = (length / projected
  // length) / GJ, and the coupled twist (rad). The twist uncertainty is then integral of U_T k dy (wing_aero_panel.js).
  function structuralTorsion(A, R) {
    const a = R && R.analysis3D;
    if (!a || a.stressOnly || typeof a.cutAt !== 'function' || !Array.isArray(a.elements) || !a.elements.length) throw new Error('The twist assessment needs the spatial-beam result.');
    const L = R.geometry.semiSpan, n = A.ADMISSION.torsionStations;
    const cuts = Array.from({ length: n }, (_, k) => { const y = k * L / n, c = a.cutAt(y); return k === 0 ? { y: 0, root: true, reference: a.nodes[0].slice(), normal: c.R[0].slice() } : { y, reference: c.reference.slice(), normal: c.R[0].slice() }; });
    const elements = a.elements.map(e => ({ y0: e.spanStart, y1: e.spanEnd, k: e.L / (e.spanEnd - e.spanStart) / e.GJ }));
    return { cuts, elements, twist: { y: Array.from(R.y), theta: Array.from(R.twist) } };
  }
  function admit(A, geometry, record, combined, R) {
    if(R?.analysis3D?.stressOnly){
      const a=R.analysis3D,L=R.geometry.semiSpan;
      if(!a.aeroLoad||typeof a.aeroLoad.cutAt!=='function')throw Error('The exact-tip structural result contains no transferred aerodynamic wrench.');
      const cuts=[0,...A.ADMISSION.stations.map(f=>f*L)].map((y,i)=>{const c=a.cutAt(y);return {y,root:i===0,reference:c.reference.slice(),normal:[0,1,0],structuralWrench:a.aeroLoad.cutAt(y)};});
      return A.admission(geometry,sequenceOf(A,geometry,record),combined,cuts,{sectionOnly:true});
    }
    return A.admission(geometry, sequenceOf(A, geometry, record), combined, structuralCuts(A, R), { torsion: structuralTorsion(A, R) });
  }

  let styled = false;
  function injectStyles(doc) {
    if (styled || !doc || !doc.head) return; styled = true;
    const st = doc.createElement('style');
    st.textContent = `.wae{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;min-width:0}.wae .wae-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:6px 10px}
.wae label{display:grid;gap:2px;font-size:13px}.wae input,.wae select{min-width:0;max-width:100%}.wae select{width:100%}.wae .wae-status{margin:0;font-size:13px}.wae .wae-err{color:var(--bad);font-weight:600}
.wae table{border-collapse:collapse;font-size:12.5px;width:100%}.wae td,.wae th{border:1px solid var(--line);padding:2px 6px;text-align:right;white-space:normal}.wae td:first-child,.wae th:first-child{text-align:left}
.wae .wae-warn{border-left:3px solid var(--warn);padding:4px 8px;margin:0;font-size:12.5px}.wae figure{margin:0}.wae figcaption{font-size:12px;color:var(--muted)}
.wae .wae-ok{color:var(--wl-good-text,var(--good));font-weight:600}.wae .wae-warnmark{color:var(--warn);font-weight:700}.wae .wae-no{color:var(--bad);font-weight:600}.wae .wae-box{border:1px solid var(--line);border-radius:8px;padding:6px 8px;display:grid;gap:6px}
.wae .wae-box.ok{border-color:var(--good)}.wae .wae-box.no{border-color:var(--bad)}.wae .wae-box p{margin:0}
.wae .wae-scroll{overflow-x:auto;max-width:100%}.waefig{display:block;width:100%;height:auto;max-width:420px;background:var(--bg);border:1px solid var(--line);border-radius:8px}.waefig text{font:10.5px var(--font-data,monospace);fill:var(--fg)}
.waefig .ax{stroke:var(--muted);stroke-width:1;fill:none}.waefig .s1{stroke:var(--accent);stroke-width:2;fill:none}.waefig .s2{stroke:var(--load);stroke-width:2;fill:none;stroke-dasharray:5 3}.waefig .s3{stroke:var(--muted);stroke-width:1.4;fill:none;stroke-dasharray:2 3}`;
    doc.head.append(st);
  }
  // --------------------------------------------------------------- figures (pure SVG strings)
  // Vertical force per unit span of the delivered (extrapolated) strips (solid) and of the base mesh (dashed).
  function spanwiseFigure(combined, baseStrips, span) {
    const W = 300, H = 180, L = 40, R = 8, T = 10, B = 20;
    const step = rows => rows.flatMap(r => { const q = r[4] / (r[1] - r[0]); return [[r[0], q], [r[1], q]]; });
    const a = step(combined.strips), b = step(baseStrips);
    const ymax = Math.max(1e-12, ...a.map(v => v[1]), ...b.map(v => v[1])) * 1.1, ymin = Math.min(0, ...a.map(v => v[1]), ...b.map(v => v[1]));
    const X = y => L + (W - L - R) * y / span, Y = v => T + (H - T - B) * (ymax - v) / (ymax - ymin);
    const line = (pts, cls) => `<polyline class="${cls}" points="${pts.map(([p, v]) => `${X(p).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')}"/>`;
    return `<svg class="waefig" viewBox="0 0 ${W} ${H}" role="img" aria-label="Vertical aerodynamic force per unit span versus span station"><path class="ax" d="M${L} ${T}V${H - B}H${W - R}M${L} ${Y(0).toFixed(1)}H${W - R}"/>${line(b, 's2')}${line(a, 's1')}<text x="${L - 4}" y="${T + 8}" text-anchor="end">${fmt(ymax, 3)}</text><text x="${L - 4}" y="${(Y(0) + 4).toFixed(1)}" text-anchor="end">0</text><text x="${L}" y="${H - 6}">root</text><text x="${W - R}" y="${H - 6}" text-anchor="end">tip, y = ${fmt(span, 4)} mm</text></svg>`;
  }
  function cpFigure(section) {
    const W = 300, H = 180, L = 36, R = 8, T = 10, B = 20, all = [...section.lower, ...section.upper].map(v => v[1]).filter(Number.isFinite);
    const top = Math.max(1, ...all.map(v => -v)), bot = Math.min(-1, ...all.map(v => -v)); // plotted: -Cp up
    const X = x => L + (W - L - R) * x, Y = v => T + (H - T - B) * (top - v) / (top - bot);
    const line = (pts, cls) => `<polyline class="${cls}" points="${pts.map(([x, cp]) => `${X(x).toFixed(1)},${Y(-cp).toFixed(1)}`).join(' ')}"/>`;
    return `<svg class="waefig" viewBox="0 0 ${W} ${H}" role="img" aria-label="Pressure coefficient along the chord at the selected station, upper and lower surfaces"><path class="ax" d="M${L} ${T}V${H - B}H${W - R}M${L} ${Y(0).toFixed(1)}H${W - R}"/>${line(section.upper, 's1')}${line(section.lower, 's2')}<text x="${L - 4}" y="${(Y(top) + 9).toFixed(1)}" text-anchor="end">${fmt(top, 3)}</text><text x="${L - 4}" y="${(Y(0) + 4).toFixed(1)}" text-anchor="end">0</text><text x="${L - 4}" y="${(Y(bot) - 2).toFixed(1)}" text-anchor="end">${fmt(bot, 3)}</text><text x="${L}" y="${H - 6}">LE</text><text x="${W - R}" y="${H - 6}" text-anchor="end">TE</text></svg><figcaption>−C<sub>p</sub> versus x/c at y = ${fmt(section.y_mm, 4)} mm (local chord ${fmt(section.chord_mm, 4)} mm) on the 64 × 16 base mesh: upper surface solid, lower surface dashed.</figcaption>`;
  }
  // --------------------------------------------------------------- CSV export (pure)
  function csv(record, combined, adm) {
    const lines = [], q = v => (v == null || !Number.isFinite(v) ? '' : String(+v.toPrecision(12)));
    lines.push(`# MIE 446 Wing AeroStruct (development) aerodynamic ${combined.structuralLoadAvailable === false ? 'results' : 'load'}. Lines starting with # are comments.`);
    lines.push(`# ${record.label}`, `# V = ${q(record.flow.speed)} m/s, rho = ${q(record.flow.density)} kg/m^3, alpha = ${q(record.flow.alphaDeg)} deg; ${record.sequence} mesh sequence (${record.levels.length} meshes)`);
    lines.push('# Axes: x aft, y right semi-span, z up; forces N, moments N mm about the aircraft origin, lengths mm.');
    const c = combined.coefficients;
    lines.push('# Provenance: all values are computed for this geometry and flow. No Airfoil Tools polar, experimental target or external reference value is used in extrapolation or admission.');
    lines.push('# U is an empirical mesh-discretization uncertainty estimate, not experimental error, a confidence interval or a guarantee of total accuracy. Cp contours use one solved base mesh, not extrapolated Cp.');
    lines.push(`# Extrapolated (Richardson) with mesh uncertainty U: CL ${q(c.CL.value)} +- ${q(c.CL.uncertainty)}, CL_Trefftz ${q(c.CLTrefftz.value)} +- ${q(c.CLTrefftz.uncertainty)}, CDi_Trefftz ${q(c.CDiTrefftz.value)} +- ${q(c.CDiTrefftz.uncertainty)}, CD_pressure ${q(c.CDpressure.value)} +- ${q(c.CDpressure.uncertainty)}, Cm ${q(c.Cm.value)} +- ${q(c.Cm.uncertainty)}`);
    if (adm) {
      lines.push(`# Admission: ${adm.admitted ? 'ADMITTED' : 'NOT ADMITTED'}; torque ${adm.claims.torque}, twist ${adm.claims.twist}`);
      for (const r of adm.rows) lines.push(r.kind === 'aeroelastic' ? `#   ${r.label}: ${q(r.value)} of the lift (limit ${q(r.tolerance)}): ${r.admitted ? 'consistent' : 'FAILS'}` : r.kind === 'twist' ? `#   ${r.label}: ${r.status}; tip twist ${q(r.value)} rad +- ${q(r.uncertainty)}, bound on |twist| ${q(r.bound)} rad, lift effect of the bound ${q(r.twist.liftEffect)} (limit ${q(r.twist.liftEffectTolerance)}), rigid-wing lift effect of the twist ${q(r.twist.rigidWingEffect)}` : `#   ${r.label}: ${q(r.value)}${r.reference != null ? ' vs '+q(r.reference) : ''} (U ${q(r.uncertainty)}), numerical check ratio ${q(r.measure)} vs limit ${q(r.tolerance)}: ${r.resolved ? 'resolved' : r.admitted ? `${r.status || 'not resolved'}, value withheld` : 'FAILS'}`);
      for (const n of adm.notes || []) lines.push(`# Note: ${n}`);
    }
    if (combined.structuralLoadAvailable === false) lines.push('', '# Aerodynamic results only. No structural strip load was generated for this zero-chord-tip wing.');
    else {
      lines.push('', combined.closedTip ? '# Delivered six-component strip resultants. Conservative sub-strip projection: force density proportional to actual chord; restoring free-couple density proportional to chord squared. All original force and moment components preserved. This is not recovered local panel pressure; torsional response is not computed.' : '# Delivered six-component strip load (extrapolated; carried by the spatial beam as a uniform force intensity on the quarter-chord line plus the couple that restores the strip moment)');
      lines.push('y0_mm,y1_mm,Fx_N,Fy_N,Fz_N,Mx_Nmm,My_Nmm,Mz_Nmm');
      for (const r of combined.strips) lines.push(r.map(q).join(','));
    }
    lines.push('', '# Solved meshes of the sequence (strip forces and moments about the origin) and the extrapolation weight of each');
    lines.push('chordPanels,spanPanels,weight,y0_mm,y1_mm,Fx_N,Fy_N,Fz_N,Mx_Nmm,My_Nmm,Mz_Nmm');
    for (const l of record.levels) { const w = (combined.weights.find(x => x.chordPanels === l.chordPanels && x.spanPanels === l.spanPanels) || { weight: 0 }).weight; for (const r of l.strips) lines.push([l.chordPanels, l.spanPanels, q(w), ...r.map(q)].join(',')); }
    return lines.join('\n') + '\n';
  }
  // --------------------------------------------------------------- main-thread fallback
  const localCache = new Map();
  function runMainThread(request) {
    const A = typeof WingAeroPanel !== 'undefined' ? WingAeroPanel : (typeof require === 'function' ? require('./wing_aero_panel.js') : null);
    if (!A) throw new Error('The aerodynamic panel module is not loaded.');
    return A.runSequence(request.geometry, request.flow, request.sequence, { cache: localCache, targetLift_N: request.options.targetLift_N });
  }
  // --------------------------------------------------------------- admission table (pure HTML)
  const degText = v => `${fmt(v * 180 / Math.PI, 3)}°`;
  function provenanceHelp() {
    return `<details class="wae-provenance"><summary>Where do Value, Extrapolated and U come from?</summary>
      <p>Every value is computed for your wing and flow inputs. No Airfoil Tools polar or measured reference value is read for these tables. Airfoil coordinates define shape, not a target lift or pressure curve.</p>
      <p>At a fixed entered α, lift is a prediction of this model. If you explicitly enter <b>Target lift</b>, the solver instead adjusts α to meet that target; matching it is trimming, not an independent accuracy test. It does not fit the Cp curve to measured data.</p>
      <p><b>Extrapolated</b> estimates the zero-panel-size limit of integrated forces and coefficients using separate chordwise and spanwise mesh sequences. Q<sub>ext</sub> = Q<sub>chord→0</sub> + Q<sub>span→0</sub> − Q<sub>base</sub> + X. X estimates their mixed refinement term when the joint mesh is stored; older files without it omit X. The table below exposes the actual solved meshes and weights; no expected curve is fitted.</p>
      <p><b>U</b> is an empirical mesh-discretization uncertainty estimate: 1.25 × [sum in both directions of max(spread + stability, 0.5|correction|) + 0.5|X|]. Spread compares linear, quadratic and observed-order extrapolations; stability shifts the three-level window. It is not experimental error, a statistical confidence interval, or a bound on all modelling errors.</p>
      <p><b>Admission</b> asks whether numerical load uncertainty and one-way coupling checks meet the stated limits. Force, bending and torque use U/|Value|; pressure versus Trefftz compares two calculations from the same flow solution. Passing does not validate every Cp point or approve structural strength.</p>
      <p>Cp contours and sectional graphs show a solved <b>base mesh</b>, not an extrapolated pressure field. Reynolds number is reported for scope screening; this inviscid solver has no Reynolds-dependent boundary layer, skin-friction drag or stall prediction.</p>
      <p><a href="validation/2026-10-29/index.html" target="_blank" rel="noopener">Independent reference tests and their limitations</a> · <a href="https://www.grc.nasa.gov/www/wind/valid/tutorial/spatconv.html" target="_blank" rel="noopener">NASA: mesh convergence</a>. External validation is documented separately; it is not recomputed against a reference for every new design.</p></details>`;
  }
  function admissionSource(r) {
    return r.kind === 'liftConsistency' ? 'Pressure vs wake/Trefftz; same flow solution. |CLp − CLwake| / max(|CLp|, CL floor)' : r.kind === 'transfer' ? 'Aerodynamic wrench vs structural cut; transfer residual' : r.kind === 'twist' ? 'Structural twist and propagated mesh uncertainty' : r.kind === 'aeroelastic' ? 'Estimated lift change from structural twist; 2π lift slope' : 'Transferred aerodynamic load; U from mesh refinement and transfer interpolation';
  }
  function admissionTable(adm) {
    const basis = '<p class="note">Numerical load checks, not error against experiment. U = estimated mesh uncertainty; the source and check definition are shown per row. Passing is not strength approval.</p>';
    if(adm.mode==='closed-tip-rigid-load-sectional-response')return basis+'<div class="wae-scroll"><table><thead><tr><th>Sectional load check</th><th>Computed value / comparison</th><th>Numerical ratio / limit</th><th>Source / definition</th></tr></thead><tbody>'+adm.rows.map(r=>'<tr><td>'+(r.admitted?'✓ ':'✗ ')+esc(r.label)+'</td><td>'+fmt(r.value)+(r.reference!=null?' vs '+fmt(r.reference):r.kind==='transfer'?'':' ± '+fmt(r.uncertainty||0))+'</td><td>'+pct(r.relative)+' / '+pct(r.tolerance)+'</td><td>'+esc(admissionSource(r))+(r.kind==='force'||r.kind==='bending'?' · U/|Value|':'')+'</td></tr>').join('')+'</tbody></table></div>'+provenanceHelp()+adm.notes.map(n=>'<p class="note">'+esc(n)+'</p>').join('');
    // percentages: whole numbers from 10%, one decimal from 1%, two significant digits below (a 0.011% lift effect is not "0.0%")
    const short = v => (!Number.isFinite(v) ? '∞' : `${v >= 0.1 ? (100 * v).toFixed(0) : v >= 0.01 ? (100 * v).toFixed(1) : Number((100 * v).toPrecision(2))}%`);
    const mark = r => (r.resolved ? '<span class="wae-ok" title="resolved">✓</span>' : r.admitted ? '<span class="wae-warnmark" title="not resolved: value withheld">!</span>' : '<span class="wae-no" title="fails">✗</span>');
    const value = r => r.kind === 'liftConsistency' ? `${fmt(r.value)} vs ${fmt(r.reference)}` : r.kind === 'aeroelastic' ? 'computed twist' : r.kind === 'twist' ? (r.status === 'resolved' ? `${degText(r.value)} ±&nbsp;${degText(r.uncertainty)} (tip)` : `|θ| ≤ ${degText(r.bound)}`) : `${fmt(r.value)} ±&nbsp;${fmt(r.uncertainty, 3)}`;
    const error = r => {
      if (r.kind === 'torque') return `${short(r.relative)} of |T| (limit ${short(r.tolerance)})${r.resolved ? '' : `: ${esc(r.status)}${r.meshSignsAgree ? '' : '; meshes disagree in sign'}`}`;
      if (r.kind === 'twist') return r.status === 'resolved' ? `${short(r.relative)} of |θ| (limit ${short(r.tolerance)})` : `lift effect ${short(r.twist.liftEffect)} (limit ${short(r.twist.liftEffectTolerance)}): ${r.status === 'negligible' ? 'negligible, value withheld' : 'not resolved'}`;
      if (r.kind === 'aeroelastic') return `${short(r.measure)} of lift (limit ${short(r.tolerance)})`;
      return `${short(r.measure)} (limit ${short(r.tolerance)})`;
    };
    const tw = adm.twist;
    return `${basis}<div class="wae-scroll"><table><thead><tr><th>Admission check (N, N·mm)</th><th>Computed value / comparison</th><th>Numerical ratio vs limit</th><th>Source / definition</th></tr></thead><tbody>${adm.rows.map(r => `<tr><td>${mark(r)} ${esc(r.label)}</td><td>${value(r)}</td><td>${error(r)}</td><td>${esc(admissionSource(r))}${['force','bending','torque'].includes(r.kind)?' · U/|Value|':''}</td></tr>`).join('')}</tbody></table></div>${provenanceHelp()}
      <p class="note">✓ resolved; ! not resolved, value withheld; ✗ fails. A torque is resolved only if U ≤ 10% of |T| and every mesh that carries weight in the load gives the same sign; there is no absolute floor. ${tw ? `The twist uncertainty uses this structure's torsional compliance, Δθ(y) = ∫ U<sub>T</sub>/GJ ds. Twist is shown only if every torque is resolved and Δθ ≤ 10% of |θ|; otherwise only the bound on |θ| is reported, and the load is admitted only if that bound, applied as an incidence change with the thin-airfoil lift slope 2π, changes the lift by at most 1% (an area-weighted mean twist of ${degText(tw.meanTolerance)} would do that). One-way coupling: the load is computed on the rigid wing, so the computed twist itself may change the lift by at most 2% (same lift slope); a more flexible wing is refused.` : ''} Torques are about the structural shear-centre axis of the spatial beam. Pressure and Trefftz-plane drag of the extrapolated solution: ${fmt(adm.drag.pressure)} and ${fmt(adm.drag.trefftz)} (reported, not a criterion).</p>`;
  }
  // Explain a refused coupled result without calling valid geometry bad input.
  // This is presentation only: no admission threshold or solved value changes.
  function speedUnits(value) {
    const raw = String(value ?? '').trim(), speed = raw === '' ? NaN : Number(raw);
    return Number.isFinite(speed) && speed > 0
      ? `${Number((3.6 * speed).toPrecision(4))} km/h · input is in m/s`
      : 'Enter speed in m/s; divide km/h by 3.6.';
  }
  function admissionFailure(adm, context = {}) {
    const row = adm.rows?.find(r => r.kind === 'aeroelastic' && !r.admitted);
    const lines = [], number = (v, digits = 3) => Number.isFinite(v) ? String(Number(v.toPrecision(digits))) : 'unavailable';
    if (row) {
      lines.push(`Structural result withheld: the rigid-wing load is not consistent with this flexible wing. The computed twist would change lift by ${number(100 * row.value)}%; the one-way coupling limit is ${number(100 * row.tolerance)}%.`);
      if (Number.isFinite(adm.twist?.tipTheta)) lines.push(`Computed tip twist: ${number(adm.twist.tipTheta * 180 / Math.PI)} degrees. This is a flexibility/model-limit check, not a material-strength failure.`);
      const speed = context.flow?.speed, lift = context.liftN;
      if (Number.isFinite(speed)) lines.push(`Selected airspeed: ${number(speed)} m/s (${number(3.6 * speed)} km/h).${Number.isFinite(lift) ? ` Upward aerodynamic force on this semi-wing: ${number(lift)} N.` : ''}`);
      lines.push('This is not a fixed speed limit: the aerodynamic solution is retained, but this design is too flexible for the one-way structural model under that load. At fixed shape, angle of attack and air density, forces scale with speed squared. For steady level flight, use target lift equal to the actual total aircraft weight to find the required angle of attack; changing speed alone is not a design verification.');
      const validity = context.validity;
      if (validity && !validity.smallDisplacement) lines.push(`The linear structural screening is also exceeded: maximum translation ${number(validity.maxTranslation)} mm (${number(100 * validity.translationRatio)}% of span; limit 5%) and maximum rotation ${number(validity.maxRotation)} rad (limit 0.1 rad).`);
      lines.push('Stiffen the wing, shorten the span, or choose a lower physically justified flight speed. A second bonded spar may help but is not a guaranteed fix: its position also changes the shear-centre torque. The closed skin carries much of the torsion; thicker skin must still leave a valid cavity. After a change, solve Aerodynamics again, apply its loads and review both the coupling and linear screens. A finer panel mesh alone does not fix flexibility.');
    } else {
      lines.push(`Structural result withheld: aerodynamic load admission failed (${(adm.failed || []).join('; ')}).`);
      lines.push(adm.sequence === 'standard' ? 'Select the Fine panel sequence, solve Aerodynamics and try applying its loads again. Review the admission table for the failed quantity.' : 'Review the failed quantity and its uncertainty in the admission table. The finest browser sequence did not establish a reliable coupled result for this case.');
    }
    lines.push('Your inputs and wing geometry are unchanged. The geometry preview remains available; no unaccepted stress or displacement field is shown.');
    return { kind: row ? 'coupling-model-limit' : 'load-admission', title: 'Structural result withheld', message: lines.join('\n\n'), failed: (adm.failed || []).slice() };
  }
  // Verdict sentence of an admission (HTML).
  function admissionVerdict(adm) {
    if(adm.mode==='closed-tip-rigid-load-sectional-response')return {ok:adm.admitted,html:adm.admitted?'Rigid-wing load admitted for nominal normal section stress and pure-bending components. Torsion and aeroelastic feedback are not assessed; exact-apex stress is undefined.':'Sectional load assessment failed: '+esc(adm.failed.join('; '))+'. Choose a finer aerodynamic sequence; no accepted structural field is substituted.'};
    const tw = adm.twist, open = adm.rows.filter(r => r.kind === 'torque' && !r.resolved).map(r => `${esc(r.label.replace(' (shear-centre axis)', ''))}: ${esc(r.status)}`);
    const torqueShown = adm.claims.torque === 'shown', pct = v => { const p = 100 * v; return !Number.isFinite(p) ? '∞' : p >= 100 ? p.toFixed(0) : p >= 1 ? p.toFixed(1) : String(Number(p.toPrecision(2))); };
    const notResolved = torqueShown ? `every torque is resolved, but the twist is not resolved to 10% of itself (worst ${tw ? pct(tw.worstRelative) : '?'}% at the reported stations)` : `the torque about this structure's shear-centre axis is not resolved (${open.join('; ')})`;
    if (adm.admitted && adm.claims.twist === 'shown') return { ok: true, html: 'Aerodynamic load admitted: the coupled structural result is shown, including torque and twist (resolved to 10%).' };
    if (adm.admitted) return { ok: true, html: `Aerodynamic load admitted with ${torqueShown ? 'the twist' : 'torque and twist'} withheld: ${notResolved}. ${tw ? `The twist is only bounded, |θ| ≤ ${degText(tw.maxBound)}, which would change the lift by at most ${pct(tw.liftEffect)}% (limit 1%). ` : ''}${torqueShown ? 'Bending, shear force, normal stress, displacement and torque are shown; twist values are not.' : 'Bending, shear force, normal stress and displacement are shown; torque and twist values are not.'}` };
    const failure = admissionFailure(adm);
    return { ok: false, html: failure.message.split('\n\n').map(p => `<span>${esc(p)}</span>`).join('<br><br>') };
  }
  // --------------------------------------------------------------- mount
  function mount(host, ad) {
    const doc = host.ownerDocument || document; injectStyles(doc);
    const saved = { ...DEFAULTS, ...(ad.settings?.() || {}) };
    const field = (id, label, value, extra = '') => `<label for="${id}">${label}<input id="${id}" type="number" step="any" value="${value}" ${extra}></label>`;
    host.innerHTML = `<div class="wae">
      <p class="note">Attached, incompressible potential flow on the actual wing surface (source and doublet panels, Kutta-condition wake, rounded tip). A sequence of seven meshes is solved and extrapolated; the resulting six-component load is admitted to the structure only if its estimated discretization error is within tolerance.</p>
      <div class="wae-grid">${field('aeroV', 'Speed V (m/s)', saved.speed, 'min="0" aria-describedby="aeroSpeedUnits"').replace('</label>', '<small id="aeroSpeedUnits" aria-live="polite"></small></label>')}${field('aeroRho', 'Air density ρ (kg/m³)', saved.density, 'min="0"')}${field('aeroAlpha', 'Angle of attack α (°)', saved.alphaDeg)}${field('aeroTarget', 'or target lift, both halves (N)', '', 'placeholder="optional"')}
      <label for="aeroSequence">Mesh sequence<select id="aeroSequence"><option value="standard">${SEQUENCE_TEXT.standard}</option><option value="fine">${SEQUENCE_TEXT.fine}</option></select></label></div>
      <p class="note">${SEQUENCE_NOTE}</p>
      <details><summary>Air properties</summary><div class="wae-grid">${field('aeroMu', 'Dynamic viscosity μ (Pa·s)', saved.viscosity)}${field('aeroSound', 'Speed of sound a (m/s)', saved.speedOfSound, 'min="290" max="360"')}</div><p class="note">Used for the Reynolds-number and Mach screens only. The speed of sound must be that of air (290 to 360 m/s); Mach above 0.3 is refused.</p></details>
      <div class="lesson-actions"><button class="btn primary" type="button" id="aeroRun">Solve Aerodynamics</button><button class="btn" type="button" id="aeroApply" disabled>Apply aerodynamic loads to structure</button><button class="btn" type="button" id="aeroRemove" hidden>Remove aerodynamic load</button></div>
      <p class="wae-status" id="aeroStatus" role="status" aria-live="polite"></p>
      <div id="aeroApplied"></div><div id="aeroAdmission"></div><div id="aeroResults"></div></div>`;
    const $ = s => host.querySelector(s), status = (t, bad = false) => { $('#aeroStatus').innerHTML = bad ? `<span class="wae-err">${esc(t)}</span>` : esc(t); };
    const updateSpeedUnits = () => { $('#aeroSpeedUnits').textContent = speedUnits($('#aeroV').value); };
    $('#aeroV').addEventListener('input', updateSpeedUnits);
    updateSpeedUnits();
    $('#aeroSequence').value = saved.sequence === 'fine' ? 'fine' : 'standard';
    let worker = null, workerFailed = !ad.workerURL || typeof Worker === 'undefined', seq = 0, last = null, lastCombined = null, lastKey = '', running = false, lastAdmission = null;
    const pending = new Map();
    const A = () => (typeof WingAeroPanel !== 'undefined' ? WingAeroPanel : null);
    function getWorker() {
      if (workerFailed) return null;
      if (worker) return worker;
      try {
        worker = new Worker(ad.workerURL);
        worker.onmessage = ev => { const m = ev.data || {}, p = pending.get(m.id); if (!p) return; if (m.kind === 'progress') { status(m.text); return; } pending.delete(m.id); if (m.kind === 'complete') p.resolve(m.result); else p.reject(new Error(m.text || 'Aerodynamic solve failed.')); };
        worker.onerror = ev => { ev.preventDefault?.(); workerFailed = true; worker?.terminate(); worker = null; for (const [, p] of pending) p.retry(); pending.clear(); };
        return worker;
      } catch (e) { workerFailed = true; return null; }
    }
    function request() {
      const num = (id, label) => { const raw = String($(id).value).trim(), v = raw === '' ? NaN : Number(raw); if (!Number.isFinite(v)) throw new Error(`${label}: enter a finite number.`); return v; };
      const target = String($('#aeroTarget').value).trim();
      const flow = { speed: num('#aeroV', 'Speed'), density: num('#aeroRho', 'Density'), alphaDeg: num('#aeroAlpha', 'Angle of attack'), viscosity: num('#aeroMu', 'Viscosity'), speedOfSound: num('#aeroSound', 'Speed of sound') };
      A()?.normalizeFlow(flow); // the solver's own checks, before any work starts
      return { geometry: ad.geometry(), flow, sequence: $('#aeroSequence').value === 'fine' ? 'fine' : 'standard', options: { targetLift_N: target === '' ? null : num('#aeroTarget', 'Target lift') } };
    }
    function solve(req) {
      return new Promise((resolve, reject) => {
        const local = () => { try { status('Solving on the page (Worker unavailable); the page may pause for a few seconds…'); resolve(runMainThread(req)); } catch (e) { reject(e); } };
        const w = getWorker();
        if (!w) { setTimeout(local, 0); return; }
        const id = ++seq; pending.set(id, { resolve, reject, retry: local });
        w.postMessage({ id, kind: 'sequence', geometry: JSON.parse(JSON.stringify(req.geometry)), flow: req.flow, sequence: req.sequence, options: req.options });
      });
    }
    const busy = on => { running = on; $('#aeroRun').disabled = on; syncButtons(); };
    function syncButtons() {
      const st = ad.structure?.() || { supported: true }, fresh = last && lastKey && ad.geometryKey && ad.geometryKey(ad.geometry()) === lastKey;
      $('#aeroApply').disabled = running || !fresh || !st.supported || lastCombined?.structuralLoadAvailable === false || !!ad.disabled?.();
      $('#aeroApply').title = !st.supported ? st.message : lastCombined?.structuralLoadAvailable === false ? 'Structural load transfer is unavailable for an exact zero-chord tip.' : 'Transfer the aerodynamic load and run the structural admission checks.';
      $('#aeroRemove').hidden = !ad.applied?.();
    }
    async function compute() {
      if (running) return;
      const blocked = ad.disabled?.(); if (blocked) { status(blocked, true); return; }
      let req; try { req = request(); } catch (e) { status(e.message, true); return; }
      const setting = { speed: req.flow.speed, density: req.flow.density, alphaDeg: req.flow.alphaDeg, sequence: req.sequence };
      if (req.flow.viscosity !== DEFAULTS.viscosity) setting.viscosity = req.flow.viscosity;
      if (req.flow.speedOfSound !== DEFAULTS.speedOfSound) setting.speedOfSound = req.flow.speedOfSound;
      ad.saveSettings?.(setting);
      busy(true); status('Building the panel meshes and influence systems…');
      const t0 = Date.now();
      try {
        const result = await solve(req), key = ad.geometryKey ? ad.geometryKey(req.geometry) : '';
        lastCombined = A().combineSequence(req.geometry, result, { snapStations: ad.snapStations ? ad.snapStations() : [] });
        last = result; lastKey = key;
        if (last.trim) $('#aeroAlpha').value = +last.trim.alphaDeg.toFixed(4);
        const support = ad.structure?.();
        status(`Solved the ${result.sequence} sequence (${result.levels.length} meshes, ${result.levels.reduce((t, l) => t + l.panels, 0)} panels in total) in ${((Date.now() - t0) / 1000).toFixed(1)} s${result.levels.every(l => l.modelCacheHit) ? ' (influence systems reused)' : ''}. ${lastCombined.structuralLoadAvailable === false ? 'Aerodynamic results are available. Structural load transfer is unavailable for a zero-chord tip.' : support?.supported === false ? support.message : 'Press Apply aerodynamic loads to structure to run the admission test (it re-solves the structure).'}`);
        render();
      } catch (e) { status(e.message, true); }
      finally { busy(false); }
    }
    function render() {
      const r = last, c = lastCombined, cf = c.coefficients, base = r.base, st = ad.structure?.() || { supported: true };
      const row = (k, est, unit = '') => `<tr><td>${k}</td><td>${fmt(est.value)} ±&nbsp;${fmt(est.uncertainty, 2)}${unit ? `&nbsp;${unit}` : ''}</td><td>${fmt(est.finest)}</td></tr>`;
      const levelRows = r.levels.map(l => { const w = (c.weights.find(x => x.chordPanels === l.chordPanels && x.spanPanels === l.spanPanels) || { weight: 0 }).weight, F = l.strips.reduce((t, s) => t + s[4], 0), M = l.strips.reduce((t, s) => t + s[5], 0);
        return `<tr><td>${2 * l.chordPanels} × ${l.spanPanels}</td><td>${l.panels}</td><td>${fmt(l.coefficients.CL)}</td><td>${fmt(F)}</td><td>${fmt(M)}</td><td>${fmt(w, 3)}</td></tr>`; }).join('');
      const lc = c.consistency.lift, dc = c.consistency.drag;
      $('#aeroResults').innerHTML = `
        ${r.trim ? `<p class="note">Target lift reached at α = ${fmt(r.trim.alphaDeg, 5)}° on the extrapolated pressure lift (residual ${fmt(r.trim.residual_N, 2)} N).</p>` : ''}
        ${provenanceHelp()}
        <div class="wae-scroll"><table><thead><tr><th>Computed result (both halves unless stated)</th><th>Extrapolated ± U (mesh)</th><th>Finest-direction combination</th></tr></thead><tbody>
        ${row('Lift coefficient C<sub>L</sub>, pressure integral', cf.CL)}
        ${row('C<sub>L</sub>, Trefftz plane', cf.CLTrefftz)}
        ${row('Induced drag C<sub>Di</sub>, Trefftz plane', cf.CDiTrefftz)}
        ${row('Pressure drag C<sub>D,p</sub> (equals C<sub>Di</sub> in exact potential flow)', cf.CDpressure)}
        ${row('Pitching moment C<sub>m</sub> about ¼ MAC (nose-up +)', cf.Cm)}
        ${['x', 'y', 'z'].map((k, i) => row(`Semi-wing force F<sub>${k}</sub> (N)`, c.rootWrench[i])).join('')}
        ${['x', 'y', 'z'].map((k, i) => row(`Semi-wing moment M<sub>${k}</sub> about the root origin (N·mm)`, c.rootWrench[3 + i])).join('')}
        </tbody></table></div>
        <p class="note">Global consistency of the extrapolated solution: pressure and Trefftz-plane lift differ by ${pct(lc.relativeDifference)} (criterion 2%); pressure and induced drag differ by ${fmt(dc.difference, 2)} (combined U ${fmt(dc.combinedUncertainty, 2)}). Reynolds number (MAC) ${fmt(base.flow.reynoldsMac, 3)}, Mach ${fmt(base.flow.mach, 3)}, q ${fmt(base.flow.dynamicPressure_Pa)} Pa.</p>
        ${base.warnings.map(w => `<p class="wae-warn">${esc(w)}</p>`).join('')}
        <div class="callout"><b>Use as structural load</b>
          <p class="note">${c.structuralLoadAvailable === false ? 'Cp, pressure, lift and coefficients are available for this closed-tip wing. Transfer to the spatial-beam structural model is unavailable; no structural load has been generated.' : `The extrapolated load is ${c.strips.length} spanwise strips, each with its full force vector and moment (six components; nothing is dropped). ${c.closedTip ? 'The exact-tip model uses a conservative sub-strip projection: force density follows actual chord, and restoring couple density follows chord squared. Every force and moment resultant is preserved. This is not recovered local Cp. Nominal normal stress and pure-bending translation are assessed; torsion, full displacement and aeroelastic feedback are not assessed.' : 'The spatial beam carries a strip as a uniform force on the quarter-chord line plus the couple that restores the strip moment exactly.'}`}</p>
          ${st.supported ? '' : `<p class="wae-err">${esc(st.message)}</p>`}</div>
        <figure>${spanwiseFigure(c.structuralLoadAvailable === false ? { ...c, strips: base.stripLoads } : c, base.stripLoads, base.reference.span_mm / 2)}<figcaption>Strip-average vertical force per unit span F<sub>z</sub>/Δy (N/mm): ${c.structuralLoadAvailable === false ? 'base aerodynamic mesh; no structural load generated' : 'delivered extrapolated strips (solid) and the base mesh (dashed)'}.</figcaption></figure>
        <label for="aeroStation">Chordwise Cp station (base mesh)<select id="aeroStation">${base.strips.map((s, j) => `<option value="${j}"${j === 0 ? ' selected' : ''}>y = ${fmt(s.yMid, 4)} mm (η = ${fmt(s.yMid / (base.reference.span_mm / 2), 3)})</option>`).join('')}</select></label>
        <figure id="aeroCp">${base.chordwise ? cpFigure(base.chordwise[0]) : ''}</figure>
        <details><summary>Meshes of the sequence</summary><div class="wae-scroll"><table><thead><tr><th>Mesh (around × spanwise)</th><th>Panels</th><th>C<sub>L</sub></th><th>F<sub>z</sub> (N)</th><th>M<sub>x</sub> (N·mm)</th><th>Weight</th></tr></thead><tbody>${levelRows}</tbody></table></div>
          <p class="note">Chordwise refinement at ${r.definition.baseSpan} strips and spanwise refinement at ${r.definition.baseChord} panels per surface. The delivered load uses the displayed fixed mesh weights: separate quadratic extrapolations plus a mixed refinement correction when its joint mesh is stored. U is an empirical mesh uncertainty estimate, not a measured error or a guarantee. See the provenance explanation and independent reference tests.</p></details>
        ${ad.download ? `<div class="lesson-actions"><button class="btn" type="button" id="aeroCsv">${c.structuralLoadAvailable === false ? 'Download aerodynamic results (CSV)' : 'Download aerodynamic load (CSV)'}</button></div>` : ''}
        <details><summary>Method and scope</summary><p class="note">${esc(base.scope.method)} ${esc(base.scope.flow)}</p><p class="note">Not modelled: ${esc(base.scope.excluded.join('; '))}.</p><p class="note">${esc(base.scope.claim)}</p></details>`;
      $('#aeroStation').onchange = () => { const j = +$('#aeroStation').value; $('#aeroCp').innerHTML = cpFigure(base.chordwise[j]); };
      if ($('#aeroCsv')) $('#aeroCsv').onclick = () => { const rec = recordFromSequence(last, lastKey); ad.download(`wing-aerostruct-alpha${fmt(r.flow.alphaDeg, 4)}-V${fmt(r.flow.speed, 4)}.csv`.replace(/[^A-Za-z0-9_.-]/g, '_'), csv(rec, lastCombined, lastAdmission), 'text/csv'); status('Aerodynamic load CSV prepared.'); };
      syncButtons();
    }
    function apply() {
      try {
        if (!last) throw new Error('Press Solve Aerodynamics first.');
        if (lastCombined?.structuralLoadAvailable === false) throw new Error('Aerodynamic results are available, but transfer to the spatial-beam structural model is unavailable for an exact zero-chord tip.');
        const key = ad.geometryKey(ad.geometry());
        if (key !== lastKey) throw new Error('The wing shape changed after this aerodynamic solve. Press Solve Aerodynamics again before applying the load.');
        const st = ad.structure?.(); if (st && !st.supported) throw new Error(st.message);
        const record = recordFromSequence(last, lastKey);
        // before the solve: showAdmission replaces this line with the outcome when the admission test has run
        status(`Aerodynamic load applied (α = ${fmt(last.flow.alphaDeg, 4)}°, V = ${fmt(last.flow.speed, 4)} m/s, ${last.sequence} sequence). The structural response is being solved; the load assessment follows.`);
        ad.apply(record);
        refresh();
      } catch (e) { status(e.message, true); }
    }
    $('#aeroRun').onclick = compute;
    $('#aeroApply').onclick = apply;
    $('#aeroRemove').onclick = () => { try { ad.remove(); lastAdmission = null; $('#aeroAdmission').innerHTML = ''; status('Aerodynamic load removed from the structure.'); refresh(); } catch (e) { status(e.message, true); } };
    function showAdmission(adm, message = '') {
      lastAdmission = adm || null;
      const box = $('#aeroAdmission');
      if (!adm) { box.innerHTML = message ? `<div class="wae-box no"><p class="wae-err">${esc(message)}</p></div>` : ''; return; }
      const v = admissionVerdict(adm);
      box.innerHTML = `<div class="wae-box ${v.ok ? 'ok' : 'no'}"><p class="${v.ok ? 'wae-ok' : 'wae-no'}">${v.html}</p>${admissionTable(adm)}</div>`;
      if(adm.mode==='closed-tip-rigid-load-sectional-response'){status(adm.admitted?'Sectional response solved: nominal normal stress and pure-bending components; torsion and aeroelastic feedback not assessed.':'Sectional load assessment failed; see the checks below.',!adm.admitted);return;}
      status(`Admission test (${adm.sequence} sequence): ${!adm.admitted ? 'coupled structural result withheld; aerodynamic solution retained' : adm.claims.twist === 'shown' ? 'admitted with torque and twist' : adm.claims.torque === 'shown' ? 'admitted with the twist withheld' : 'admitted with torque and twist withheld'}. See the table below.`, false);
    }
    function refresh() {
      const s = { ...DEFAULTS, ...(ad.settings?.() || {}) };
      $('#aeroV').value = s.speed; $('#aeroRho').value = s.density; $('#aeroAlpha').value = s.alphaDeg; $('#aeroMu').value = s.viscosity; $('#aeroSound').value = s.speedOfSound;
      updateSpeedUnits();
      $('#aeroSequence').value = s.sequence === 'fine' ? 'fine' : 'standard';
      syncApplied();
    }
    function reset() {
      if (running) throw new Error('Wait for the aerodynamic solve to finish before opening the course example.');
      last = null; lastCombined = null; lastKey = ''; lastAdmission = null;
      $('#aeroResults').innerHTML = ''; $('#aeroAdmission').innerHTML = ''; $('#aeroTarget').value = '';
      status('Set the flow conditions, then press Solve Aerodynamics.');
      refresh();
    }
    // Applied-load banner, stale-shape warning and buttons only (the flow fields keep what the user is typing).
    function syncApplied() {
      let rec = null, key = '';
      try { rec = ad.applied?.(); key = ad.geometryKey ? ad.geometryKey(ad.geometry()) : ''; } catch (e) { rec = ad.applied?.() || null; key = ''; }
      $('#aeroApplied').innerHTML = rec ? `<div class="wae-box"><p><b>Applied:</b> ${esc(rec.label)}.</p>${rec.geometrySha256 !== key ? '<p class="wae-err">The wing shape changed after this load was solved: the structural solve refuses it until you press Solve Aerodynamics again and apply the loads, or remove it.</p>' : ''}</div>` : '';
      if (!rec) { lastAdmission = null; $('#aeroAdmission').innerHTML = ''; }
      if (last && key !== lastKey) status('The wing shape changed since the last aerodynamic solve: press Solve Aerodynamics again before applying its load.');
      syncButtons();
    }
    refresh();
    return { refresh, reset, syncApplied, compute, apply, showAdmission, destroy: () => { worker?.terminate(); worker = null; host.innerHTML = ''; }, get result() { return last; }, get combined() { return lastCombined; }, get admission() { return lastAdmission; }, get solvedKey() { return lastKey; }, get running() { return running; } };
  }
  return Object.freeze({ mount, DEFAULTS, SEQUENCE_TEXT, SEQUENCE_NOTE, spanwiseFigure, cpFigure, csv, runMainThread, recordFromSequence, sequenceOf, delivered, aerodynamicSummary, engineLoad, structuralCuts, structuralTorsion, admit, provenanceHelp, admissionSource, admissionTable, admissionVerdict, admissionFailure, speedUnits });
})();
if (typeof module !== 'undefined' && module.exports) module.exports = WingAeroUI;
