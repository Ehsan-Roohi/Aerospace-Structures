/** Print the HW2 handout with typeset equations and verify its page layout.
 * Uses the bundled Node/Playwright runtime; no course-code dependencies.
 * Run from the repository root after the HTML and figures have been created.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const deps = path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const require = createRequire(path.join(deps, 'package.json'));
const { chromium } = require('playwright');
const folder = path.join(root, 'assignments/homework-02');
const stem = 'MIE446_HW2_Control_Forces_Moments';
const qaDir = path.join(root, 'tmp/hw2/handout');
await fs.mkdir(qaDir, { recursive: true });

// A saved official MathJax bundle makes PDF rendering independent of the CDN.
// Set HW2_MATHJAX_PATH when rebuilding on another machine.
const mathjaxPath = process.env.HW2_MATHJAX_PATH || path.join(root, 'tmp/control-atlas/mathjax.js');
let mathjax = null;
try { mathjax = await fs.readFile(mathjaxPath); } catch { /* Use the handout CDN. */ }
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  // Match Letter width less the handout's two 0.65-inch margins.
  const page = await browser.newPage({ viewport: { width: 691, height: 1200 }, deviceScaleFactor: 1.5 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  if (mathjax) {
    await page.route(/https:\/\/.*(?:mathjax|MathJax).*tex-svg(?:\.min)?\.js.*$/,
      route => route.fulfill({ status: 200, contentType: 'application/javascript', body: mathjax }));
  }
  await page.emulateMedia({ media: 'print' });
  await page.goto(pathToFileURL(path.join(folder, stem + '.html')).href, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    if (window.MathJax?.startup?.promise) await window.MathJax.startup.promise;
    if (window.MathJax?.typesetPromise) await window.MathJax.typesetPromise();
  });
  await page.emulateMedia({ media: 'print' });
  const check = await page.evaluate(() => ({
    images: document.images.length,
    brokenImages: [...document.images].filter(i => !i.complete || !i.naturalWidth).map(i => i.src),
    mathElements: document.querySelectorAll('mjx-container, math').length,
    mathErrors: [...document.querySelectorAll('mjx-merror, [data-mjx-error]')].map(e => e.textContent),
    unrenderedMath: document.body.innerText.match(/\\(?:\[|\(|begin\{)/g) || [],
    pageSections: [...document.querySelectorAll('.page')].map((e, i) => ({
      page: i + 1,
      height: Math.round(e.getBoundingClientRect().height),
      width: Math.round(e.getBoundingClientRect().width),
      horizontalOverflow: e.scrollWidth > e.clientWidth + 1,
      heading: e.querySelector('h1,h2')?.textContent,
    })),
  }));
  check.browserErrors = errors;
  const printableHeight = (11 - 0.58 - 0.55) * 96;
  check.overflowPages = check.pageSections.filter(p =>
    p.horizontalOverflow || p.height > printableHeight);
  await fs.writeFile(path.join(qaDir, 'layout-check.json'), JSON.stringify(check, null, 2));
  if (check.brokenImages.length || check.mathErrors.length || check.unrenderedMath.length || errors.length || check.overflowPages.length) {
    throw new Error('Handout rendering failed: ' + JSON.stringify(check));
  }
  await page.pdf({
    path: path.join(folder, stem + '.pdf'),
    format: 'Letter', printBackground: true, preferCSSPageSize: true,
    displayHeaderFooter: false,
  });
  const pages = page.locator('.page');
  for (let i = 0; i < await pages.count(); i++) {
    await pages.nth(i).screenshot({ path: path.join(qaDir, `section-${String(i+1).padStart(2, '0')}.png`) });
  }
  console.log(JSON.stringify(check, null, 2));
  console.log('Saved ' + path.relative(root, path.join(folder, stem + '.pdf')));
} finally {
  await browser.close();
}
