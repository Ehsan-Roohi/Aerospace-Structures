/*
 * Companion tools — external software that students may use next to the MIE 446 Wing Lab.
 * Each tool is shown as an attributed link card; nothing is embedded, imported or copied.
 * Fills every element with data-companion="<id>" (wing Design lab tab, Beam Lab header).
 */
const CompanionTools = (() => {
  'use strict';
  const TOOLS = Object.freeze({
    vinco: Object.freeze({
      name: 'VINCO RC · Wing Geometry Designer',
      owner: 'VINCO RC',
      url: 'https://vinco-rc.com/?generator=wing',
      host: 'vinco-rc.com'
    })
  });

  let serial = 0;
  function vincoCard() {
    const t = TOOLS.vinco, id = `companionVincoTitle${++serial}`;
    return `<article class="companion-card" aria-labelledby="${id}">
  <div class="companion-head">
    <svg viewBox="0 0 48 28" aria-hidden="true"><path d="M2 16 C 10 4, 30 3, 46 12 L 46 14 C 30 19, 12 21, 2 16 Z" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M14 9v10M24 7v12M34 9v8" stroke="currentColor" stroke-width="1.6"/><circle cx="24" cy="14" r="2.4" fill="currentColor"/></svg>
    <div><h3 id="${id}">${t.name}</h3><p class="companion-meta">External companion tool by ${t.owner} · not made by MIE 446 · opens ${t.host} in a new tab</p></div>
  </div>
  <p><b>VINCO RC</b> lets you set up wing geometry: the planform, the airfoil, ribs and the spar (diameter and position), with a 3-D preview. <b>Our Wing Lab</b> does a different job: it checks loads, bending, torsion and stress, and it states the limits of its model.</p>
  <p class="companion-warn">A generated geometry is not a strength check. It does not show that a wing is strong, stable or ready to print.</p>
  <ol class="companion-steps">
    <li>Define the wing geometry in VINCO RC.</li>
    <li>Record the span, root and tip chord, airfoil, and the spar (and rib) locations.</li>
    <li>Enter compatible values in our structural model — only what it can represent.</li>
    <li>Check the model's assumptions and the manufacturing constraints before you build.</li>
  </ol>
  <p class="companion-note">Nothing is transferred automatically: there is no file, CAD or results import between the two tools, and the two models need not describe identical geometry. The site is run by VINCO RC, not by this course.</p>
  <a class="companion-link" href="${t.url}" target="_blank" rel="noopener noreferrer">Open the VINCO RC wing generator<span aria-hidden="true"> ↗</span><span class="companion-sr"> (external site, opens in a new tab)</span></a>
</article>`;
  }

  const RENDER = {vinco: vincoCard};
  function fill(root) {
    const scope = root || (typeof document !== 'undefined' ? document : null);
    if (!scope) return 0;
    let n = 0;
    scope.querySelectorAll('[data-companion]').forEach(slot => {
      const render = Object.prototype.hasOwnProperty.call(RENDER, slot.dataset.companion) ? RENDER[slot.dataset.companion] : null;
      if (render && !slot.dataset.filled) { slot.innerHTML = render(); slot.dataset.filled = 'true'; n++; }
    });
    return n;
  }
  if (typeof document !== 'undefined') fill(document);
  return {TOOLS, vincoCard, fill};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = CompanionTools;
if (typeof window !== 'undefined') window.CompanionTools = CompanionTools;
