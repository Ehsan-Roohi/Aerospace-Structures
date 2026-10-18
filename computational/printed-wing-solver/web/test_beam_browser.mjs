// REAL-BROWSER check of the generated page (Chromium via Playwright), unlike the jsdom DOM tests.
// Includes WCAG text-contrast checks from computed colours (beam_contrast_audit.js): the VINCO button in
// the Beam Lab header and in the wing Design lab tab (normal, hover, keyboard focus; visited via its CSS rule),
// and every piece of Beam Lab text in every tab, in light, dark and both forced data-theme paths.
// Optional: needs Playwright. Not run by the jsdom suites.
//   PLAYWRIGHT_MODULE=/path/to/node_modules/playwright/index.mjs \
//   node computational/printed-wing-solver/web/test_beam_browser.mjs [page-url] [screenshot-dir]
// The default page is docs/wing-lab.html. The wing and D.520 workspaces need WebGL and three.js
// from the CDN; if the CDN is unreachable, set BEAM_THREE_DIR to a local three@0.128.0 package
// (a temporary test copy of the page is then pointed at it) or the WebGL part is reported as skipped.
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url));
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
let pageUrl=process.argv[2]||pathToFileURL(path.join(here,'../../../docs/wing-lab.html')).href;
const shots=process.argv[3]||path.join(tmpdir(),'beam-lab-shots');mkdirSync(shots,{recursive:true});
if(process.env.BEAM_THREE_DIR&&pageUrl.startsWith('file:')) {
  const three=process.env.BEAM_THREE_DIR;
  let html=readFileSync(fileURLToPath(pageUrl),'utf8')
    .replace('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',pathToFileURL(path.join(three,'build/three.min.js')).href)
    .replace('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js',pathToFileURL(path.join(three,'examples/js/controls/OrbitControls.js')).href);
  const copy=path.join(tmpdir(),'wing-lab-local-three.html');writeFileSync(copy,html);pageUrl=pathToFileURL(copy).href;
}
const failures=[], notes=[];
// Contrast audit from computed styles (same file a reviewer can paste into the DevTools console).
const AUDIT=readFileSync(path.join(here,'beam_contrast_audit.js'),'utf8');
const audit=(page,root,opts={})=>page.evaluate(([r,o])=>window.__contrastAudit(r,o),[root,opts]);
const fmtFail=r=>`${r.tag}${r.id?'#'+r.id:''}.${r.cls} "${r.text}" ${r.color} on ${r.background} = ${r.ratio}:1 (needs ${r.need}:1)`;
const check=(cond,msg)=>{if(!cond)failures.push(msg);};
const browser=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
async function openPage(width,height,scheme,extra={},query='') {
  const ctx=await browser.newContext({viewport:{width,height},colorScheme:scheme,deviceScaleFactor:1,...extra});
  const page=await ctx.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&!/ERR_|Failed to load resource/.test(m.text()))errors.push(m.text());});
  await page.goto(pageUrl+query,{waitUntil:'load'});
  await page.waitForFunction(()=>window.BeamLab&&document.querySelector('#beamChip').textContent==='Solved');
  await page.addScriptTag({content:AUDIT});
  return {ctx,page,errors};
}
// Elements that stick out of the viewport, ignoring content inside horizontal scrollers.
const overflowProbe=()=>{
  const W=document.documentElement.clientWidth, bad=[];
  const scroller=el=>{for(let p=el.parentElement;p;p=p.parentElement){const s=getComputedStyle(p).overflowX;if(s==='auto'||s==='scroll')return true;}return false;};
  for(const el of document.querySelectorAll('#foundations *')) {
    if(!el.getClientRects().length) continue;
    const shut=el.closest('details:not([open])');if(shut&&!el.closest('summary'))continue;   // closed disclosure: not visible
    const r=el.getBoundingClientRect();
    if(r.width>0&&(r.right>W+1||r.left<-1)&&!scroller(el)) bad.push(`${el.tagName.toLowerCase()}#${el.id}.${String(el.className.baseVal??el.className).split(' ')[0]} ${Math.round(r.left)}–${Math.round(r.right)}`);
  }
  return {doc:document.documentElement.scrollWidth,vw:W,bad:bad.slice(0,8)};
};
const smallTargets=()=>[...document.querySelectorAll('#foundations button, #foundations select, #foundations input:not([type=checkbox]):not([type=file]), #foundations summary')]
  .filter(el=>el.getClientRects().length&&!el.closest('[hidden]')&&!el.classList.contains('sr-only'))
  .map(el=>({el,r:el.getBoundingClientRect()})).filter(({r})=>r.height>0&&r.height<36).map(({el,r})=>`${el.tagName.toLowerCase()}${el.id?'#'+el.id:''} ${Math.round(r.height)}px`).slice(0,10);
const TABS=['diagrams','cut','solution','modes','compare','report','learn'];
for(const [width,height] of [[390,844],[768,1024],[1440,900]]) for(const scheme of ['light','dark']) {
  const {ctx,page,errors}=await openPage(width,height,scheme);
  await page.screenshot({path:path.join(shots,`beam_${width}_${scheme}_top.png`)});
  for(const tab of TABS) {
    await page.click(`[data-tab="${tab}"]`);
    if(tab==='cut') await page.evaluate(()=>window.BeamLab.setCut(150));
    if(tab==='compare'){await page.click('#beamSaveA');await page.selectOption('#beamShape','tube');await page.click('#beamSolve');await page.click('#beamSaveB');}
    await page.waitForTimeout(150);
    const o=await page.evaluate(overflowProbe);
    check(o.doc<=o.vw,`${width} ${scheme} ${tab}: page scrolls horizontally (${o.doc} > ${o.vw})`);
    check(!o.bad.length,`${width} ${scheme} ${tab}: elements outside the viewport: ${o.bad.join('; ')}`);
    if(scheme==='light') await (await page.$('.bl-results')).screenshot({path:path.join(shots,`beam_${width}_${tab}.png`)});
  }
  if(width===390) {const small=await page.evaluate(smallTargets);check(!small.length,`390: small touch targets: ${small.join(', ')}`);}
  check(!errors.length,`${width} ${scheme}: console errors: ${errors.join(' | ')}`);
  await ctx.close();
}
// Interactions with real pointer events and layout.
{
  const {ctx,page,errors}=await openPage(1440,900,'light');
  const box=await (await page.$('#beamPicture svg')).boundingBox();
  const geo=await page.evaluate(()=>{const s=document.querySelector('#beamPicture svg');return {x0:+s.dataset.x0,x1:+s.dataset.x1,W:+s.dataset.w,L:+s.dataset.length};});
  const px=x=>box.x+(geo.x0+(geo.x1-geo.x0)*x/geo.L)*box.width/geo.W;
  await page.click('[data-place="roller"]');
  await page.mouse.move(px(225),box.y+box.height/2);await page.waitForTimeout(80);
  check(await page.$('#beamPicture .bl-ghost'),'placement ghost follows the pointer');
  await page.mouse.click(px(225),box.y+box.height/2);
  check(await page.$eval('#beamInteriorList [data-field="x"]',el=>+el.value)===225,'click on the beam places a roller at x = 225 mm');
  await page.keyboard.press('Escape');
  await page.click('#beamSolve');
  // The default cantilever plus the placed roller: both supports are FE constraints of the solved model.
  check(await page.evaluate(()=>{const r=window.BeamLab.state().solved.result;return r.reactions.length===2&&r.reactions[1].x===225&&Math.abs(r.equilibrium.force)<1e-6;}),'placed support assembled into the solved model');
  await page.click('[data-tab="cut"]');
  const handle=await (await page.$('#beamPicture svg')).boundingBox();
  await page.mouse.move(px(100),handle.y+20);await page.mouse.down();await page.mouse.move(px(320),handle.y+20,{steps:6});await page.mouse.up();
  await page.waitForTimeout(80);
  const cx=await page.evaluate(()=>window.BeamLab.state().cut.x);check(Math.abs(cx-320)<3,`dragging the cut line moves the cut (x = ${cx})`);
  await page.focus('[data-tab="diagrams"]');await page.keyboard.press('ArrowRight');
  check(await page.evaluate(()=>document.activeElement.dataset.tab==='cut'),'arrow keys move between result tabs');
  await page.keyboard.press('Tab');
  const outline=await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle);check(outline!=='none','keyboard focus is visible');
  // Print flow: report only, light colours, at least one page.
  await page.click('[data-tab="report"]');await page.fill('#beamExplain','Largest stress at the clamp.');
  await page.evaluate(()=>{window.print=()=>{window.__printed=true;};});
  await page.click('#beamPrintBtn');
  check(await page.evaluate(()=>window.__printed===true&&document.body.classList.contains('beam-printing')),'print dialog requested in report mode');
  await page.emulateMedia({media:'print'});
  const vis=await page.evaluate(()=>({report:getComputedStyle(document.querySelector('#beamPrint')).display,app:getComputedStyle(document.querySelector('.bl-app')).display}));
  check(vis.report==='block'&&vis.app==='none','print shows the report only');
  await page.pdf({path:path.join(shots,'beam_report.pdf'),format:'A4',printBackground:true});
  await page.screenshot({path:path.join(shots,'beam_print_preview.png'),fullPage:true});
  await page.emulateMedia({media:'screen'});
  check(!errors.length,`interaction console errors: ${errors.join(' | ')}`);
  await ctx.close();
}
// Link-styled buttons and all Beam Lab text: real computed colours and WCAG contrast, in every theme path
// (system light/dark, and the page's data-theme forced either way), at phone and desktop widths, with the
// VINCO popover open. A colour equal to its background (the bug this guards) has contrast 1:1.
{
  const LINK='.bl-companion a.companion-link';
  for(const width of [390,1440]) for(const [scheme,forced] of [['light',null],['dark',null],['dark','light'],['light','dark']]) {
    const tag=`${width} ${scheme}${forced?` + data-theme=${forced}`:''}`;
    const {ctx,page,errors}=await openPage(width,900,scheme,{},'?beamCase=hw2b-roller-pin');
    if(forced) await page.evaluate(t=>{document.documentElement.dataset.theme=t;},forced);
    if(width<700) await page.click('#beamNavToggle');
    await page.click('.bl-companion > summary');
    const colours=()=>page.$eval(LINK,a=>{const c=getComputedStyle(a),r=a.getBoundingClientRect();return {color:c.color,background:c.backgroundColor,outline:c.outlineStyle,inView:r.left>=0&&r.right<=document.documentElement.clientWidth&&r.width>40,text:a.innerText};});
    const linkOk=async state=>{
      const c=await colours(), res=await audit(page,LINK,{text:true});
      check(c.color!==c.background,`${tag} ${state}: VINCO button text is the colour of its background (${c.color} on ${c.background})`);
      check(/Open the VINCO RC wing generator/.test(c.text)&&c.inView,`${tag} ${state}: VINCO button label visible inside the viewport`);
      check(res.some(r=>r.tag==='a')&&res.every(r=>r.ok),`${tag} ${state}: VINCO button contrast ${res.map(fmtFail).join('; ')||'not measured'}`);
      return c;
    };
    const normal=await linkOk('normal');
    await page.hover(LINK);await page.waitForTimeout(60);
    const hover=await linkOk('hover');check(hover.color===normal.color&&hover.background===normal.background,`${tag}: hover keeps the button colours`);
    await page.focus('.bl-companion > summary');await page.keyboard.press('Tab');
    check(await page.evaluate(sel=>document.activeElement.matches(sel+':focus-visible'),LINK),`${tag}: Tab reaches the VINCO button with a visible focus state`);
    const focus=await linkOk('focus');check(focus.outline!=='none',`${tag}: focus ring drawn on the VINCO button`);
    if(width===1440&&scheme==='light'&&!forced) await (await page.$('.bl-companion-pop')).screenshot({path:path.join(shots,'vinco_header_open_light.png')});
    if(width===1440&&scheme==='dark'&&!forced) await (await page.$('.bl-companion-pop')).screenshot({path:path.join(shots,'vinco_header_open_dark.png')});
    // Hover never lowers the contrast of the other buttons either (filled buttons darken in light themes).
    await page.click('.bl-companion > summary');                       // close the popover: it covers the model tools
    for(const sel of ['#beamSolve','[data-stage="beam"]','#beamAddSupport','[data-place="pin"]','[data-tab="cut"]']) {
      await page.hover(sel);await page.waitForTimeout(40);
      const rows=await page.evaluate(q=>{const el=document.querySelector(q);el.setAttribute('data-audit','1');const r=window.__contrastAudit('[data-audit="1"]',{text:true});el.removeAttribute('data-audit');return r;},sel);
      check(rows.length&&rows.every(r=>r.ok),`${tag}: hover contrast of ${sel}: ${rows.map(fmtFail).join('; ')||'not measured'}`);
    }
    await page.click('.bl-companion > summary');                       // open again for the text audit below
    // :visited colours are hidden from scripts by every browser, so the stylesheet rule itself is checked.
    const visited=await page.evaluate(()=>{for(const sh of document.styleSheets){let rules;try{rules=sh.cssRules;}catch(e){continue;}
      for(const r of rules) if(r.selectorText&&r.selectorText.includes('a.companion-link:visited')) return {color:r.style.getPropertyValue('color').trim(),background:r.style.getPropertyValue('background-color').trim()};}return null;});
    check(visited&&visited.color==='var(--accent-ink)'&&visited.background==='var(--accent)',`${tag}: a visited VINCO link keeps the button colours`);
    // Every piece of Beam Lab text in every result tab (popover still open), and no horizontal overflow.
    const textOk=async where=>{const bad=(await audit(page,'#foundations',{text:true})).filter(r=>!r.ok);
      check(!bad.length,`${tag} ${where}: low-contrast text: ${bad.slice(0,4).map(fmtFail).join('; ')}`);};
    for(const t of TABS) {
      await page.click(`[data-tab="${t}"]`);await page.waitForTimeout(60);
      if(t==='compare') {await page.click('#beamEqualMassBtn');await page.waitForTimeout(60);}   // highlighted table row
      await textOk(t);
    }
    // The status bar's other states: pending (edited inputs) and not solved (a mechanism).
    await page.fill('#beamGeometry [name="E"]','2500');await page.waitForTimeout(60);await textOk('pending');
    await page.selectOption('#beamleftSupport','free');await page.selectOption('#beamrightSupport','free');await page.click('#beamSolve');
    await page.waitForTimeout(60);await textOk('not solved');
    const o=await page.evaluate(overflowProbe);check(o.doc<=o.vw&&!o.bad.length,`${tag}: popover open, page overflows: ${o.bad.join('; ')}`);
    check(!errors.length,`${tag}: console errors: ${errors.join(' | ')}`);
    await ctx.close();
  }
}
// Reduced motion disables the mode animation.
{
  const {ctx,page}=await openPage(1024,800,'light',{reducedMotion:'reduce'});
  await page.click('[data-tab="modes"]');
  check(await page.$eval('#beamAnimate',b=>b.disabled),'mode animation disabled for reduced motion');
  await ctx.close();
}
// The Design lab copy of the VINCO card (outside the Beam Lab): text, button, hover and keyboard focus.
async function designTabContrast(page,tag) {
  const LINK='#tab-design .companion-card a.companion-link';
  const bad=(await audit(page,'#tab-design .companion-card',{text:true})).filter(r=>!r.ok);
  check(!bad.length,`${tag} Design tab: low-contrast text in the VINCO card: ${bad.map(fmtFail).join('; ')}`);
  for(const state of ['hover','focus']) {
    if(state==='hover') {await page.hover(LINK);await page.waitForTimeout(60);}
    else {await page.focus(LINK);await page.keyboard.press('Shift+Tab');await page.keyboard.press('Tab');
      check(await page.evaluate(sel=>document.activeElement.matches(sel+':focus-visible'),LINK),`${tag} Design tab: keyboard focus reaches the VINCO button`);}
    const res=await audit(page,LINK,{text:true});
    check(res.some(r=>r.tag==='a')&&res.every(r=>r.ok),`${tag} Design tab ${state}: VINCO button contrast ${res.map(fmtFail).join('; ')||'not measured'}`);
  }
  preexisting(await audit(page,'#app'),`wing ${tag}`);
}
// Controls outside the Beam Lab that were already below 4.5:1 before this change are reported, not failed.
function preexisting(rows,where) {
  const low=rows.filter(r=>!r.ok&&!/companion/.test(r.cls));
  if(low.length) notes.push(`Pre-existing ${where}: ${[...new Set(low.map(r=>`${r.cls||r.tag} "${r.text}" ${r.ratio}:1${r.image?' (over a gradient; estimate)':''}`))].join('; ')}`);
}
// Wing and D.520 workspaces (WebGL) and return-to-beam state.
{
  const {ctx,page,errors}=await openPage(1440,900,'light');
  const ready=await page.evaluate(()=>document.documentElement.dataset.wingReady==='true');
  if(!ready) notes.push('WebGL wing workspace not tested: three.js did not load (set BEAM_THREE_DIR or allow the CDN).');
  else {
    const before=await page.textContent('#beamKpis');
    await page.click('[data-stage="shell"]');
    await page.waitForFunction(()=>!document.querySelector('#app').hidden&&document.querySelector('#stateChip').textContent!=='Starting',null,{timeout:60000});
    check(await page.evaluate(()=>{const c=document.querySelector('#gl');const gl=c.getContext('webgl2')||c.getContext('webgl');return !!gl&&c.width>0;}),'wing WebGL canvas is live');
    await page.click('[data-tab="design"]');
    const link=await page.$eval('#tab-design .companion-card a',a=>({href:a.getAttribute('href'),target:a.target,rel:a.rel}));
    check(link.href==='https://vinco-rc.com/?generator=wing'&&link.target==='_blank'&&link.rel==='noopener noreferrer','VINCO card in the Design lab tab');
    await designTabContrast(page,'1440 light');
    await page.screenshot({path:path.join(shots,'wing_design_tab.png')});
    await page.click('#backFoundations');
    check(await page.evaluate(()=>!document.querySelector('#foundations').hidden&&document.querySelector('#app').hidden),'back to the Beam Lab');
    check((await page.textContent('#beamKpis'))===before,'beam study preserved after visiting the wing');
    await page.click('[data-stage="metal"]');
    await page.waitForFunction(()=>{const m=document.querySelector('#metalLab');return m&&!m.hidden;},null,{timeout:60000});
    await page.waitForTimeout(1500);
    await page.screenshot({path:path.join(shots,'d520_1440.png')});
    preexisting(await audit(page,'#metalLab'),'D.520 light');
    await page.click('#mBackBeams');
    check(await page.evaluate(()=>!document.querySelector('#foundations').hidden),'back from the D.520 workspace');
    check((await page.textContent('#beamKpis'))===before,'beam study preserved after visiting the D.520');
  }
  check(!errors.length,`WebGL pass console errors: ${errors.join(' | ')}`);
  await ctx.close();
}
// Dark theme: the Design lab card and the D.520 controls.
{
  const {ctx,page,errors}=await openPage(1440,900,'dark');
  if(await page.evaluate(()=>document.documentElement.dataset.wingReady==='true')) {
    await page.click('[data-stage="shell"]');
    await page.waitForFunction(()=>!document.querySelector('#app').hidden&&document.querySelector('#stateChip').textContent!=='Starting',null,{timeout:60000});
    await page.click('[data-tab="design"]');
    await designTabContrast(page,'1440 dark');
    await page.screenshot({path:path.join(shots,'wing_design_tab_dark.png')});
    await page.click('#backFoundations');
    await page.click('[data-stage="metal"]');
    await page.waitForFunction(()=>{const m=document.querySelector('#metalLab');return m&&!m.hidden;},null,{timeout:60000});
    await page.waitForTimeout(800);
    preexisting(await audit(page,'#metalLab'),'D.520 dark');
  }
  check(!errors.length,`WebGL dark pass console errors: ${errors.join(' | ')}`);
  await ctx.close();
}
await browser.close();
for(const n of notes) console.log('NOTE',n);
if(failures.length){console.log(failures.map(f=>'FAIL '+f).join('\n'));process.exit(1);}
console.log(`Real-browser check (Chromium): layout at 390/768/1440 px in light and dark, every result tab, placement, cut dragging, keyboard tabs, focus, print report, reduced motion, computed-colour contrast of the VINCO button (normal, hover, focus, visited rule) and of all Beam Lab text in four theme paths${notes.some(n=>/not tested/.test(n))?'':', the Design-tab card and WebGL wing/D.520 round trips'} passed. Screenshots: ${shots}`);
