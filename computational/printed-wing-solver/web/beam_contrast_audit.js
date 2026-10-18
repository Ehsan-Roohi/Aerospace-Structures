/*
 * Text-contrast audit from COMPUTED styles (WCAG 2 contrast ratio). Test tooling only: it is not part of the
 * built page. test_beam_browser.mjs injects it into Chromium; a reviewer can also paste it into the DevTools
 * console of docs/wing-lab.html and run, for example:
 *   __contrastAudit('#foundations', {text: true}).filter(r => !r.ok)
 * For every visible element it compares the computed text colour with the background composited from the
 * element up to the first opaque ancestor (translucent layers blended; a CSS brightness() filter applied to
 * both). Required ratio: 4.5:1, or 3:1 for large text (>= 24 px, or >= 18.66 px bold). Disabled controls and
 * visually hidden text are skipped. Background images are not analysed; such rows are flagged `image: true`.
 * Browsers never expose :visited colours to scripts, so visited links must be checked in the stylesheet.
 */
window.__contrastAudit = (rootSelector, opts = {}) => {
  const parse = s => { const m = /rgba?\(([^)]+)\)/.exec(s || ''); if (!m) return null; const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number); return {r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1}; };
  const over = (t, b) => ({r: t.r * t.a + b.r * (1 - t.a), g: t.g * t.a + b.g * (1 - t.a), b: t.b * t.a + b.b * (1 - t.a), a: 1});
  const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = c => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const scale = (c, k) => ({r: Math.min(255, c.r * k), g: Math.min(255, c.g * k), b: Math.min(255, c.b * k), a: c.a});
  const canvas = parse(getComputedStyle(document.body).backgroundColor) || {r: 255, g: 255, b: 255, a: 1};
  const ownText = el => [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
  const out = [];
  for (const root of document.querySelectorAll(rootSelector)) {
    const pick = opts.text ? [...root.querySelectorAll('*')].filter(e => !e.closest('svg') && ownText(e))
                           : [...root.querySelectorAll(opts.selector || 'a, button, summary, [role="tab"], select')];
    if (opts.text && ownText(root) && !root.closest('svg')) pick.unshift(root);
    for (const el of pick) {
      if (!el.getClientRects().length || el.disabled || el.closest('[hidden], button:disabled, .sr-only, .companion-sr')) continue;
      if (el.closest('details:not([open])') && !el.closest('summary')) continue;
      const box = el.getBoundingClientRect(); if (box.width <= 2 || box.height <= 2) continue;
      const text = opts.text ? ownText(el) : (el.innerText || el.value || '').trim(); if (!text) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || +cs.opacity === 0 || /rect\(0px,? 0px,? 0px,? 0px\)/.test(cs.clip)) continue;
      const layers = []; let image = false;
      for (let e = el; e; e = e.parentElement) {
        const s = getComputedStyle(e); if (s.backgroundImage !== 'none') image = true;
        const c = parse(s.backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
      }
      let bg = canvas; for (const c of layers.reverse()) bg = c.a >= 1 ? c : over(c, bg);
      let fg = parse(cs.color); if (fg.a < 1) fg = over(fg, bg);
      const m = /brightness\(([\d.]+)\)/.exec(cs.filter); if (m) { fg = scale(fg, +m[1]); bg = scale(bg, +m[1]); }
      const size = parseFloat(cs.fontSize), weight = +cs.fontWeight || 400, large = size >= 24 || (size >= 18.66 && weight >= 700);
      const need = large ? 3 : 4.5, cr = ratio(fg, bg);
      out.push({tag: el.tagName.toLowerCase(), id: el.id, cls: String(el.className.baseVal ?? el.className).split(' ')[0],
        text: text.slice(0, 40).replace(/\s+/g, ' '), color: cs.color,
        background: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`, ratio: +cr.toFixed(2), need, ok: cr >= need, image});
    }
  }
  return out;
};
