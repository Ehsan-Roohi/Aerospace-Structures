/* Independent SVG lesson. No aircraft mesh, solver inputs or WebGL state is modified. */
(function (root) {
  'use strict';
  // Normalised deflection under a uniform load on a constant-EI clamped-free beam.
  const bendShape = u => u * u * (6 - 4 * u + u * u) / 3;
  const twistShape = u => u; // constant torque and constant GJ
  const point = (x, y, cx, cy, angle) => {
    const c = Math.cos(angle), s = Math.sin(angle);
    return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
  };
  if (typeof module === 'object' && module.exports) module.exports = {bendShape, twistShape, point};
  if (!root.document) return;
  const d = root.document, box = d.querySelector('#deform-figures');
  if (!box) return;
  let mode = 'both', playing = false, frame = null, start = 0;
  const slider = d.querySelector('#deform-scale'), play = d.querySelector('#deform-play');
  const stop = () => { playing = false; if (frame != null) root.cancelAnimationFrame(frame); frame = null;
    play.setAttribute('aria-pressed', 'false'); play.textContent = 'Animate load cycle'; };
  const svg = (label, body) => `<svg viewBox="0 0 600 340" role="img" aria-label="${label}" style="width:100%;height:auto;background:var(--sheet-2);border:1px solid var(--rule);border-radius:4px;font:16px Arial,sans-serif;color:var(--ink)">
    <defs><marker id="${label.startsWith('Bending')?'bend':'twist'}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10Z" fill="${label.startsWith('Bending')?'#2582bd':'#bd4238'}"/></marker></defs>${body}</svg>`;
  function render() {
    const a = +slider.value / 100, b = mode === 'torsion' ? 0 : a, t = mode === 'bending' ? 0 : a;
    d.querySelector('#deform-value').textContent = `${Math.round(a * 100)}%`;
    const X = u => 95 + 420 * u, Y = u => 220 - 90 * b * bendShape(u);
    const pts = Array.from({length:41}, (_, i) => `${X(i/40).toFixed(2)},${Y(i/40).toFixed(2)}`).join(' ');
    const arrows = Array.from({length:7}, (_, i) => {const u=(i+1)/8, x=X(u), y=Y(u); return `<path d="M${x} ${y-12}v-45"/>`;}).join('');
    const bend = svg('Bending: curved span and upward tip displacement', `<g fill="currentColor"><text x="20" y="30" font-weight="bold">BENDING — look from the front</text><text x="20" y="56">A cantilever half-wing under upward distributed load</text></g>
      <rect x="55" y="155" width="40" height="110" fill="var(--rule)"/><text x="22" y="291" fill="currentColor">Fixed root</text>
      <path d="M95 220H515" fill="none" stroke="var(--ink-2)" stroke-width="3" stroke-dasharray="7 6"/>
      <polyline points="${pts}" fill="none" stroke="#2582bd" stroke-width="9"/>
      <g fill="none" stroke="#2582bd" stroke-width="2" style="color:#2582bd" marker-end="url(#bend-arrow)">${arrows}</g>
      <g fill="currentColor"><text x="185" y="94">Lift / net upward load</text><text x="145" y="250">Original spanwise centreline</text><text x="430" y="290">Tip</text></g>
      <path d="M535 220V${Y(1)}" stroke="#2582bd" stroke-width="2"/><path d="M529 220H541M529 ${Y(1)}H541" stroke="#2582bd" stroke-width="2"/>
      <text x="365" y="250" fill="#2582bd">Tip displacement w</text>
      <text x="20" y="315" fill="currentColor">Curvature: |κ| = |M|/(EI). Root displacement and slope = 0.</text>`);
    const angle = 18 * t, radians = angle * Math.PI / 180;
    const foil = 'M90 190 C105 155 190 153 360 190 C190 211 105 211 90 190 Z';
    const LE=point(90,190,198,190,radians), TE=point(360,190,198,190,radians);
    const torsion = svg('Torsion: airfoil rotation about a spanwise axis', `<g fill="currentColor"><text x="20" y="30" font-weight="bold">TORSION — look along the span</text><text x="20" y="56">Tip section compared with its untwisted shape</text></g>
      <path d="${foil}" fill="none" stroke="var(--ink-2)" stroke-width="2" stroke-dasharray="7 6"/>
      <g transform="rotate(${angle} 198 190)"><path d="${foil}" fill="#d1524530" stroke="#bd4238" stroke-width="3"/><path d="M90 190H360" stroke="#bd4238" stroke-width="1"/></g>
      <circle cx="198" cy="190" r="6" fill="var(--ink)"/><path d="M198 105V180" stroke="var(--ink-2)"/>
      <text x="100" y="94" fill="currentColor">Illustrative spanwise twist axis ⊙</text>
      <text x="${LE[0]-35}" y="${LE[1]+35}" fill="currentColor">LE</text><text x="${TE[0]+5}" y="${TE[1]+5}" fill="currentColor">TE</text>
      <path d="M440 150C510 105 510 225 440 205" fill="none" stroke="#bd4238" stroke-width="3" style="color:#bd4238" marker-end="url(#twist-arrow)"/>
      <text x="415" y="230" fill="#bd4238">Tip torque T</text>
      <text x="85" y="270" fill="#bd4238">Nose-up tip twist θ = ${angle.toFixed(1)}° (exaggerated)</text>
      <text x="20" y="300" fill="currentColor">dθ/dy = T/(GJ); root θ = 0; θ grows toward the tip.</text>
      <text x="20" y="320" fill="currentColor">Axis location is illustrative, not the computed D.520 shear centre.</text>`);
    box.innerHTML = bend + torsion;
    d.querySelector('#deform-caption').textContent = mode === 'both' ? 'Both can occur together: a wing may bend upward while each airfoil section also rotates. These two panels isolate the mechanisms; they do not compute their aerodynamic coupling.' : mode === 'bending' ? 'Bending only: the span curves; the torsion panel stays untwisted. A front-view bending rotation is not a change of airfoil incidence about the span axis.' : 'Torsion only: the span stays straight in the bending panel, while the tip airfoil rotates relative to the root.';
  }
  d.querySelectorAll('[data-deform]').forEach(button => button.addEventListener('click', () => {
    mode = button.dataset.deform;
    d.querySelectorAll('[data-deform]').forEach(b => {b.setAttribute('aria-pressed', String(b === button)); b.classList.toggle('ghost', b !== button);});
    render();
  }));
  slider.addEventListener('input', () => {stop(); render();});
  play.addEventListener('click', () => {
    if (playing) {stop(); return;}
    playing = true; start = root.performance.now(); play.setAttribute('aria-pressed','true'); play.textContent = 'Pause load cycle';
    const tick = now => {if (!playing) return; slider.value = String(50 - 50*Math.cos((now-start)*Math.PI/2500)); render(); frame = root.requestAnimationFrame(tick);};
    frame = root.requestAnimationFrame(tick);
  });
  d.addEventListener('visibilitychange', () => {if (d.hidden) stop();});
  root.addEventListener('hashchange', () => {if (root.location.hash !== '#model') stop();});
  d.querySelectorAll('nav.tabs button').forEach(b => b.addEventListener('click', () => {if (b.id !== 't-model') stop();}));
  render();
})(typeof window === 'object' ? window : globalThis);
