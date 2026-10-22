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
  await page.waitForFunction(()=>window.BeamLab&&document.querySelector('#beamChip'));
  if(query) await page.waitForFunction(()=>window.BeamLab.state().solved&&document.querySelector('#beamChip').textContent==='Solved');
  else await page.waitForFunction(()=>window.BeamLab.state().solved===null&&document.querySelector('#beamChip').textContent==='Pending');
  await page.addScriptTag({content:AUDIT});
  return {ctx,page,errors};
}
// Assigned HW links intentionally no longer load a model. Configure the exact
// numerical browser fixtures through student-facing controls instead.
async function assignedBeam(page,{left='fixed',right='free',qStart=0,qEnd=.002}={}) {
  for(const [name,value]of Object.entries({length:450,E:2200,density:1.24,elements:30}))await page.fill(`#beamGeometry [name="${name}"]`,String(value));
  await page.selectOption('#beamShape','rectangle');
  await page.fill('#beamSectionFields [data-sec="width"]','16');await page.fill('#beamSectionFields [data-sec="height"]','8');
  await page.selectOption('#beamleftSupport',left);await page.selectOption('#beamrightSupport',right);await page.uncheck('#beamSelfWeight');
  await page.selectOption('#beamLoadKind','trapezoid');await page.fill('#beamLoadA','0');await page.fill('#beamLoadB','450');await page.fill('#beamQ0',String(qStart));await page.fill('#beamQ1',String(qEnd));
  await page.click('#beamLoadSubmit');await page.waitForFunction(()=>window.BeamLab.state().solved&&document.querySelector('#beamChip').textContent==='Solved');
  check(await page.evaluate(({left,right,qStart,qEnd})=>{const m=window.BeamLab.state().solved.model;return m.length===450&&m.E===2200&&m.section.width===16&&m.section.height===8&&m.supports[0].kind===left&&(right==='free'?m.supports.length===1:m.supports[1].kind===right)&&m.loads.length===1&&m.loads[0].qStart===qStart&&m.loads[0].qEnd===qEnd&&!m.selfWeight;},{left,right,qStart,qEnd}),'explicit assigned-case browser fixture matches its authored dimensions, restraints and load');
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
// Layout with loads drawn: the Lecture 03 tip-load example (the Beam Lab itself opens with no load; see below).
for(const [width,height] of [[390,844],[768,1024],[1440,900]]) for(const scheme of ['light','dark']) {
  const {ctx,page,errors}=await openPage(width,height,scheme,{},'?beamCase=l03-tip');
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
// Normal opening: an unrestrained, unloaded editable draft, NOT a solved zero-
// response cantilever. No computed results or result exports may appear.
for(const width of [390,1440]) for(const scheme of ['light','dark']) {
  const tag=`no load ${width} ${scheme}`;
  const {ctx,page,errors}=await openPage(width,900,scheme);
  const s=await page.evaluate(()=>{const st=window.BeamLab.state(), pic=document.querySelector('#beamPicture');
    return {loads:st.model.loads.length,supports:st.model.supports.length,selfWeight:st.model.selfWeight,solved:st.solved,
      loadMarks:pic.querySelectorAll('.bl-load, .bl-point, .bl-couple, .bl-sw, .bl-load-fill, .bl-sw-fill').length,
      supportMarks:pic.querySelectorAll('[data-support-index]').length,chip:document.querySelector('#beamChip').textContent,
      list:document.querySelector('#beamLoads').innerText.trim(),notice:!!document.querySelector('#beamSetup'),
      noticeVisible:(()=>{const n=document.querySelector('#beamSetup');if(!n)return false;const r=n.getBoundingClientRect();return r.width>0&&r.height>0;})(),
      resultExports:[...document.querySelectorAll('#beamDownload,#beamCsv,#beamShare,#beamPrintBtn,[data-png]')].every(b=>b.disabled),
      shortcuts:document.querySelectorAll('#beamCentre, [data-shape]').length,kpi:document.querySelector('#beamKpis').innerText};});
  check(s.loads===0&&s.supports===0&&s.selfWeight===false&&s.solved===null&&s.chip==='Pending',`${tag}: opens with no supports, no load and no structural solution`);
  check(s.loadMarks===0,`${tag}: no load arrows drawn (${s.loadMarks})`);
  check(s.supportMarks===0,`${tag}: no implicit supports drawn`);
  check(s.list==='No load defined. Add your own load.'&&s.notice&&s.noticeVisible,`${tag}: empty-state message shown`);
  check(s.shortcuts===0,`${tag}: no automatic-load shortcuts`);
  check(s.kpi.trim()===''&&s.resultExports,`${tag}: no invented zero results; result exports stay disabled`);
  const o=await page.evaluate(overflowProbe);check(o.doc<=o.vw&&!o.bad.length,`${tag}: overflow ${o.bad.join('; ')}`);
  const bad=(await audit(page,'#foundations',{text:true})).filter(r=>!r.ok);check(!bad.length,`${tag}: low-contrast text: ${bad.slice(0,4).map(fmtFail).join('; ')}`);
  if(scheme==='light') await (await page.$('.bl-model')).screenshot({path:path.join(shots,`no_load_${width}.png`)});
  check(!errors.length,`${tag}: console errors: ${errors.join(' | ')}`);
  await ctx.close();
}
// Interactions with real pointer events and layout.
{
  const {ctx,page,errors}=await openPage(1440,900,'light',{},'?beamCase=l03-tip');
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
  // The explicitly selected Lecture 03 cantilever plus the placed roller.
  check(await page.evaluate(()=>{const r=window.BeamLab.state().solved.result;return r.reactions.length===2&&r.reactions[1].x===225&&Math.abs(r.equilibrium.force)<1e-6;}),'placed support assembled into the solved model');
  await page.click('[data-tab="cut"]');
  await page.locator('#beamPicture svg').scrollIntoViewIfNeeded();
  const handle=await (await page.$('#beamPicture svg')).boundingBox();
  const cutGeo=await page.$eval('#beamPicture svg',s=>({x0:+s.dataset.x0,x1:+s.dataset.x1,W:+s.dataset.w,L:+s.dataset.length}));
  const cutPx=x=>handle.x+(cutGeo.x0+(cutGeo.x1-cutGeo.x0)*x/cutGeo.L)*handle.width/cutGeo.W;
  await page.mouse.move(cutPx(100),handle.y+20);await page.mouse.down();await page.mouse.move(cutPx(320),handle.y+20,{steps:6});await page.mouse.up();
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
// Exact station readout with real input: one click to L/2, Enter in the x box, a click on a plot, a drag on the
// beam picture and hover, all on the Diagrams tab; the x⁻ / x⁺ choice at a jump; layout and contrast at 390/1440.
for(const [width,scheme] of [[1440,'light'],[390,'dark']]) {
  const tag=`station ${width} ${scheme}`;
  const {ctx,page,errors}=await openPage(width,900,scheme);await assignedBeam(page);
  const card=k=>page.$eval(`#beamStationCards [data-q="${k}"] .bl-stat-v`,el=>el.innerText.replace(/\s+/g,' ').trim());
  await page.click('[data-station-frac="0"]');await page.click('[data-station-frac="0.5"]');
  check(await page.evaluate(()=>window.BeamLab.state().cut.x)===225,`${tag}: one click to x = L/2`);
  check(await card('V')==='+0.3375 N'&&await card('M')==='−42.1875 N·mm',`${tag}: V(L/2) = +0.3375 N and M(L/2) = −42.1875 N·mm (${await card('V')}, ${await card('M')})`);
  await page.fill('#beamStationX','300');await page.press('#beamStationX','Enter');await page.waitForTimeout(60);
  check(await page.evaluate(()=>window.BeamLab.state().cut.x)===300&&await card('V')==='+0.25 N',`${tag}: typed x + Enter gives V(300) = +0.25 N`);
  // A click on the moment plot at x = 100 mm moves the station; hover reads exact values.
  const chart=await page.$('#beamCharts [data-key="moment"] svg');await chart.scrollIntoViewIfNeeded();const cb=await chart.boundingBox();
  const cg=await chart.evaluate(s=>({x0:+s.dataset.x0,x1:+s.dataset.x1,W:+s.dataset.w,L:+s.dataset.length}));
  const cpx=x=>cb.x+(cg.x0+(cg.x1-cg.x0)*x/cg.L)*cb.width/cg.W;
  await page.mouse.move(cpx(100),cb.y+cb.height/2);await page.waitForTimeout(40);
  check(/\(exact\)/.test(await page.textContent('#beamCharts [data-key="moment"] .bl-chart-hover')),`${tag}: hover reads exact values`);
  await page.mouse.click(cpx(100),cb.y+cb.height/2);await page.waitForTimeout(60);
  const cx=await page.evaluate(()=>window.BeamLab.state().cut.x);check(Math.abs(cx-100)<=1,`${tag}: a click on a plot moves the station (x = ${cx})`);
  check(await page.$$eval('#beamCharts .bl-cut-dot',d=>d.length)===6,`${tag}: a marker on every plot`);
  // Drag the cut line on the beam picture without leaving the Diagrams tab.
  const pic=await page.$('#beamPicture svg');await pic.scrollIntoViewIfNeeded();const pb=await pic.boundingBox();
  const pg=await pic.evaluate(s=>({x0:+s.dataset.x0,x1:+s.dataset.x1,W:+s.dataset.w,L:+s.dataset.length}));
  const ppx=x=>pb.x+(pg.x0+(pg.x1-pg.x0)*x/pg.L)*pb.width/pg.W;
  await page.mouse.move(ppx(80),pb.y+12);await page.mouse.down();await page.mouse.move(ppx(360),pb.y+12,{steps:6});await page.mouse.up();await page.waitForTimeout(60);
  const dx=await page.evaluate(()=>window.BeamLab.state().cut.x);check(Math.abs(dx-360)<4,`${tag}: dragging the cut line on the picture moves the station (x = ${dx})`);
  check(await page.evaluate(()=>/Station x = 3[56]\d/.test(document.querySelector('#beamStationRead').textContent)),`${tag}: the readout follows the drag`);
  const o=await page.evaluate(overflowProbe);check(o.doc<=o.vw&&!o.bad.length,`${tag}: overflow ${o.bad.join('; ')}`);
  const bad=(await audit(page,'#beamTab-diagrams',{text:true})).filter(r=>!r.ok);check(!bad.length,`${tag}: low-contrast text: ${bad.slice(0,4).map(fmtFail).join('; ')}`);
  await page.click('[data-station-frac="0"]');await page.waitForTimeout(40);
  await (await page.$('#beamStation')).screenshot({path:path.join(shots,`station_root_${width}_${scheme}.png`)});
  await page.click('[data-tab="cut"]');await page.waitForTimeout(60);
  check(await page.$$eval('#beamCutFbd svg.bl-segment',s=>s.length)===2,`${tag}: Cut & section shows both parts`);
  await (await page.$('#beamCutFbd')).screenshot({path:path.join(shots,`cut_root_${width}_${scheme}.png`)});
  check(!errors.length,`${tag}: console errors: ${errors.join(' | ')}`);
  await ctx.close();
}
{
  const {ctx,page,errors}=await openPage(1440,900,'light',{},'?beamCase=l03-simple');
  check(await page.isVisible('#beamStationLimitField'),'jump at L/2: the x⁻ / x⁺ choice is visible');
  await page.click('#beamStationLimitField [data-cut-limit="right"]');await page.waitForTimeout(40);
  check(await page.$eval('#beamStationCards [data-q="V"] .is-sel',el=>el.innerText.trim())==='x⁺: −1 N','jump: the x⁺ shear is selected');
  await (await page.$('#beamStation')).screenshot({path:path.join(shots,'station_jump_1440.png')});
  check(!errors.length,`jump console errors: ${errors.join(' | ')}`);
  await ctx.close();
}
// Plot PNG downloads (real canvas): file signature and size (2× the plot image), opaque white background in light
// and dark page themes, and drawn content (dark text, the blue curve, the orange station marker). Then the station
// table in the real page: typed stations with Enter and its CSV.
{
  const pngSize=buf=>({png:buf.subarray(0,8).toString('hex')==='89504e470d0a1a0a',w:buf.readUInt32BE(16),h:buf.readUInt32BE(20)});
  for(const scheme of ['light','dark']) {
    const tag=`png ${scheme}`;
    const {ctx,page,errors}=await openPage(1440,900,scheme,{acceptDownloads:true});await assignedBeam(page,{right:'fixed',qStart:.002,qEnd:0});
    for(const key of ['shear','moment','deflection']) {
      const dims=await page.evaluate(k=>{const i=window.BeamLab.plotImage(k);return {w:i.width,h:i.height};},key);
      const [dl]=await Promise.all([page.waitForEvent('download'),page.click(`[data-png="${key}"]`)]);
      const file=path.join(shots,`plot_${key}_${scheme}.png`);await dl.saveAs(file);
      const buf=readFileSync(file), info=pngSize(buf);
      check(dl.suggestedFilename()===`MIE446-beam-${key}.png`,`${tag} ${key}: file name ${dl.suggestedFilename()}`);
      check(info.png&&info.w===dims.w*2&&info.h===dims.h*2,`${tag} ${key}: PNG ${info.w} × ${info.h} (expected ${dims.w*2} × ${dims.h*2})`);
      const px=await page.evaluate(async b64=>{
        const im=new Image();im.src='data:image/png;base64,'+b64;await im.decode();
        const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const g=c.getContext('2d');g.drawImage(im,0,0);
        const d=g.getImageData(0,0,c.width,c.height).data;let dark=0,blue=0,orange=0,ink=0;
        for(let i=0;i<d.length;i+=4){const r=d[i],gr=d[i+1],b=d[i+2];if(r<245||gr<245||b<245)ink++;if(r<90&&gr<90&&b<90)dark++;if(b>150&&r<60&&gr<130)blue++;if(r>150&&gr<120&&b<60)orange++;}
        const n=d.length/4;return {corner:[...d.slice(0,4)],ink:+(ink/n).toFixed(4),dark:+(dark/n).toFixed(4),blue:+(blue/n).toFixed(5),orange:+(orange/n).toFixed(5)};},buf.toString('base64'));
      check(px.corner.join()==='255,255,255,255',`${tag} ${key}: opaque white background (${px.corner})`);
      check(px.ink>0.02&&px.dark>0.004&&px.blue>0.001&&px.orange>0.0002,`${tag} ${key}: drawn content ${JSON.stringify(px)}`);
    }
    check(/saved as PNG \(1920 × \d+ px\)/.test(await page.textContent('#beamDiagExportStatus')),`${tag}: status names the PNG size`);
    await page.fill('#beamStationList','200, 205');await page.press('#beamStationList','Enter');await page.waitForTimeout(40);
    check(await page.$$eval('#beamStationTable tr[data-x]',rows=>rows.map(r=>r.dataset.x).join())==='200,205',`${tag}: station table from a typed list`);
    const [dl]=await Promise.all([page.waitForEvent('download'),page.click('.bl-stationtable [data-export="stations"]')]);
    const csv=readFileSync(await dl.path(),'utf8');
    check(csv.startsWith('x_mm,side,V_N,M_Nmm,v_mm,theta_rad,curvature_per_mm,sigma_top_MPa,sigma_bottom_MPa,tau_max_MPa,v_theta_source\r\n')&&/\r\n205,,-0\.0016111111111,8\.68157407407,/.test(csv),`${tag}: station CSV ${csv.split('\r\n').slice(0,3).join(' | ')}`);
    if(scheme==='light') {await (await page.$('#beamReactionShear')).screenshot({path:path.join(shots,'support_slices_fixed.png')});await (await page.$('.bl-stationtable')).screenshot({path:path.join(shots,'station_table.png')});}
    check(!errors.length,`${tag}: console errors: ${errors.join(' | ')}`);
    await ctx.close();
  }
}
// Authored case of scientific labels, from COMPUTED styles in the real page: CSS must not re-case v and V, mm and MPa,
// q, θ, x⁻ … The page's generic `th` rule uppercases table headers, so every Beam Lab table header is checked in every
// tab and in the printed report (screen and print media): computed text-transform 'none' and rendered text equal to
// the authored text. Every other Beam Lab element whose own text carries a unit or a lower-case symbol is checked too.
{
  const {ctx,page,errors}=await openPage(1440,900,'light');await assignedBeam(page,{right:'fixed',qStart:.002,qEnd:0});
  const caseAudit=scope=>page.evaluate(scope=>{
    const SCI=/(\bmm\b|mm[²³⁴⁻]|MPa|N·mm|N\/mm|\brad\b|g\/cm|\bHz\b|[θσταβκρεγφωμ]|(^|[\s(,=·:])[vqxzhbtc](?=$|[\s)=,·:⁻⁺(/])|dv\/dx|[x0L][⁻⁺])/u;
    const own=el=>[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').replace(/\s+/g,' ').trim();
    const norm=s=>String(s).replace(/\s+/g,' ').trim();
    const visible=el=>el.getClientRects().length>0&&!el.closest('[hidden]')&&!(el.closest('details:not([open])')&&!el.closest('summary'));
    const out={headers:0,recased:[],rendered:[],labels:[]};
    for(const th of document.querySelectorAll(`${scope} th`)) {
      out.headers++;
      const tt=getComputedStyle(th).textTransform;
      if(tt!=='none') out.recased.push(`th "${norm(th.textContent).slice(0,40)}" text-transform: ${tt}`);
      if(visible(th)&&norm(th.innerText)!==norm(th.textContent)) out.rendered.push(`th shows "${norm(th.innerText).slice(0,40)}" for "${norm(th.textContent).slice(0,40)}"`);
    }
    for(const el of document.querySelectorAll(`${scope} *`)) {
      if(el.closest('svg')||el.tagName==='TH') continue;
      const t=own(el), tt=getComputedStyle(el).textTransform;
      if(t&&tt!=='none'&&t.toUpperCase()!==t&&SCI.test(t)) out.labels.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} "${t.slice(0,48)}" text-transform: ${tt}`);
    }
    return out;
  },scope);
  const report=(tag,a)=>{
    check(a.headers>0,`${tag}: no table headers found`);
    check(!a.recased.length,`${tag}: table headers re-cased by CSS (${a.recased.length} of ${a.headers}): ${a.recased.slice(0,4).join('; ')}`);
    check(!a.rendered.length,`${tag}: rendered header text differs from the authored text: ${a.rendered.slice(0,4).join('; ')}`);
    check(!a.labels.length,`${tag}: scientific labels re-cased by CSS: ${a.labels.slice(0,4).join('; ')}`);
  };
  for(const tab of TABS) {
    await page.click(`[data-tab="${tab}"]`);
    if(tab==='compare'){await page.click('#beamSaveA');await page.click('#beamSaveB');await page.click('#beamEqualMassBtn');}
    if(tab==='solution') await page.click('#beamRefine');
    if(tab==='modes') await page.waitForTimeout(20);
    await page.waitForTimeout(60);
    report(`case ${tab}`,await caseAudit('#foundations'));
  }
  const d=await page.evaluate(()=>{const th=[...document.querySelectorAll('#beamReactions th')];return th.map(x=>[x.textContent,getComputedStyle(x).textTransform,x.innerText]);});
  // v5: one sign convention, R_y (N, ↓ +) and C (N·mm, ↻ +) beside v and θ, shown exactly as authored (no CSS re-casing).
  check(d.some(([t,tt,shown])=>t==='v (mm, ↓ +)'&&tt==='none'&&shown==='v (mm, ↓ +)')&&d.some(([t,,shown])=>t==='θ = dv/dx (rad, ↻ +)'&&shown==='θ = dv/dx (rad, ↻ +)')&&d.some(([t,,shown])=>t==='Ry (N, ↓ +)'&&/^Ry\s?\(N, ↓ \+\)$/.test(shown))&&d.some(([t,,shown])=>t==='C (N·mm, ↻ +)'&&shown==='C (N·mm, ↻ +)'),`case: reaction table shows "R_y (N, ↓ +)", "C (N·mm, ↻ +)", "v (mm, ↓ +)" and "θ = dv/dx (rad, ↻ +)" as authored (${JSON.stringify(d)})`);
  const s=await page.evaluate(()=>[...document.querySelectorAll('#beamStationTable th')].map(x=>x.innerText));
  check(s.includes('v (mm)')&&s.includes('V (N)')&&s.includes('M (N·mm)')&&s.some(x=>/MPa/.test(x)),`case: station table headers keep v (mm), V (N), N·mm and MPa (${s.join(' | ')})`);
  // Printed report: generate it, then audit in print media (the report is visible only there).
  await page.evaluate(()=>{window.print=()=>{};});
  await page.click('[data-tab="diagrams"]');await page.click('.bl-exportbar [data-export="print"]');
  await page.emulateMedia({media:'print'});
  const pr=await caseAudit('#beamPrint');report('case print report',pr);
  check(pr.headers>=14,`case print report: expected the supports and station tables (${pr.headers} headers)`);
  await page.emulateMedia({media:'screen'});
  check(!errors.length,`case audit console errors: ${errors.join(' | ')}`);
  await ctx.close();
}
// Plot labels never overlap: the exact station labels (orange) and the sampled extreme labels at the root, the tip, an
// interior maximum, near a maximum and at jumps (x⁻ and x⁺ labels), on the six Diagrams plots and in the PNG source,
// measured from the rendered SVG text boxes. The PNG source is measured in a shadow root, so only its own styles apply,
// as when it is drawn on the canvas. Every station value stays visible and inside the plot area.
{
  const {ctx,page,errors}=await openPage(1440,900,'light');await assignedBeam(page,{right:'fixed',qStart:.002,qEnd:0});
  const labelAudit=()=>page.evaluate(()=>{
    const problems=[], cut={};
    const audit=(svg,where)=>{
      const vb=svg.viewBox.baseVal;
      // Station labels are the cut-coloured texts; extreme labels read "value at x = …" (no reliance on markup added by the fix).
      const labels=[...svg.querySelectorAll('text')].filter(t=>t.classList.contains('bl-tx-cut')||/ at x = /.test(t.textContent)).map(t=>{const b=t.getBBox();
        return {kind:t.classList.contains('bl-tx-cut')?'cut':'ext',text:t.textContent,x0:b.x,y0:b.y,x1:b.x+b.width,y1:b.y+b.height};});
      for(let i=0;i<labels.length;i++) for(let j=i+1;j<labels.length;j++) {
        const a=labels[i], b=labels[j];
        if(a.x0<b.x1-0.5&&b.x0<a.x1-0.5&&a.y0<b.y1-0.5&&b.y0<a.y1-0.5) problems.push(`${where}: "${a.text}" overlaps "${b.text}"`);
      }
      for(const l of labels) if(l.x0<-0.5||l.y0<-0.5||l.x1>vb.width+0.5||l.y1>vb.height+0.5) problems.push(`${where}: "${l.text}" leaves the plot`);
      return labels.filter(l=>l.kind==='cut').map(l=>l.text);
    };
    for(const fig of document.querySelectorAll('#beamCharts [data-key]')) cut[fig.dataset.key]=audit(fig.querySelector('svg'),`plot ${fig.dataset.key}`);
    const host=document.createElement('div');host.style.cssText='position:absolute;left:-20000px;top:0';document.body.append(host);
    const root=host.attachShadow({mode:'open'});
    for(const key of Object.keys(cut)) {root.innerHTML=window.BeamLab.plotImage(key).svg;cut['png '+key]=audit(root.querySelector('svg svg'),`PNG ${key}`);}
    host.remove();
    return {problems,cut};
  });
  const at=async(tag,x,expect)=>{
    await page.evaluate(x=>window.BeamLab.setCut(x),x);await page.waitForTimeout(30);
    const a=await labelAudit();
    check(!a.problems.length,`labels ${tag}: ${a.problems.slice(0,4).join('; ')}`);
    for(const [key,re] of Object.entries(expect)) for(const where of [key,'png '+key])
      check((a.cut[where]||[]).some(t=>re.test(t)),`labels ${tag}: ${where} shows ${re} (has ${JSON.stringify(a.cut[where])})`);
    return a;
  };
  // Fixed–fixed (HW 2B Case 3): root and tip carry the extreme V and M; the sagging maximum is interior.
  await at('fixed-fixed root x = 0',0,{shear:/^V\(x\) = 0\.315$/,moment:/^M\(x\) = −20\.25$/});
  await at('fixed-fixed tip x = L',450,{shear:/^V\(x\) = −0\.135$/,moment:/^M\(x\) = −13\.5$/});
  const mmax=await page.evaluate(()=>{const r=window.BeamLab.state().solved.result;let i=0;r.moment.forEach((v,j)=>{if(v>r.moment[i])i=j;});return r.x[i];});
  await at(`fixed-fixed interior maximum of M (x = ${mmax})`,mmax,{moment:/^M\(x\) = 8\.6/});
  for(const x of [mmax+6,mmax-6,mmax+12]) await at(`fixed-fixed near the maximum (x = ${x})`,x,{moment:/^M\(x\) = 8\.6/});
  const vmax=await page.evaluate(()=>window.BeamLab.state().solved.result.extremes.deflection.x);
  await at(`fixed-fixed maximum deflection (x = ${vmax})`,vmax,{deflection:/^v\(x\) = /});
  // Cantilever (HW 2B Case 1): root (V, M extremes) and tip (v, θ extremes).
  await page.evaluate(()=>window.BeamLab.importText(window.BeamStudy.exportStudy({result:window.BeamLearningEngine.solve({length:450,E:2200,section:{shape:'rectangle',width:16,height:8},supports:[{x:0,kind:'fixed'}],loads:[{kind:'distributed',start:0,end:450,qStart:0,qEnd:0.002}]})})));
  await at('cantilever root',0,{shear:/^V\(x\) = 0\.45$/,moment:/^M\(x\) = −135$/});
  await at('cantilever tip',450,{shear:/^V\(x\) = 0$/,deflection:/^v\(x\) = /,rotation:/^θ\(x\) = /});
  // Jumps: a point force at L/2 (V: x⁻ and x⁺ labels) and a couple (M: x⁻ and x⁺ labels), with extremes at the jump.
  await page.evaluate(()=>window.BeamLab.importText(window.BeamStudy.exportStudy({result:window.BeamLearningEngine.solve({length:450,supports:[{x:0,kind:'pin'},{x:450,kind:'roller'}],loads:[{kind:'point',position:225,force:2}]})})));
  for(const limit of ['left','right']) {
    await page.evaluate(l=>{window.BeamLab.state().cut.limit=l;},limit);
    await at(`point-force jump at L/2 (${limit})`,225,{shear:/^V\(x[⁻⁺]\) = (1|−1)$/,moment:/^M\(x\) = 225$/});
  }
  const j=await labelAudit();check((j.cut.shear||[]).length===2&&(j.cut['png shear']||[]).length===2,`labels jump: both V(x⁻) and V(x⁺) are labelled (${JSON.stringify(j.cut.shear)})`);
  await page.evaluate(()=>window.BeamLab.importText(window.BeamStudy.exportStudy({result:window.BeamLearningEngine.solve({length:450,supports:[{x:0,kind:'pin'},{x:450,kind:'roller'}],loads:[{kind:'moment',position:150,moment:60},{kind:'point',position:300,force:1}]})})));
  await at('couple jump at x = 150',150,{moment:/^M\(x[⁻⁺]\) = /});
  await at('force and extreme at x = 300',300,{shear:/^V\(x[⁻⁺]\) = /,moment:/^M\(x\) = /});
  await page.evaluate(()=>window.BeamLab.setCut(0));
  await (await page.$('#beamCharts')).screenshot({path:path.join(shots,'plot_labels_root.png')});
  check(!errors.length,`label audit console errors: ${errors.join(' | ')}`);
  await ctx.close();
}
// Link-styled buttons and all Beam Lab text: real computed colours and WCAG contrast, in every theme path
// (system light/dark, and the page's data-theme forced either way), at phone and desktop widths, with the
// VINCO popover open. A colour equal to its background (the bug this guards) has contrast 1:1.
{
  const LINK='.bl-companion a.companion-link';
  for(const width of [390,1440]) for(const [scheme,forced] of [['light',null],['dark',null],['dark','light'],['light','dark']]) {
    const tag=`${width} ${scheme}${forced?` + data-theme=${forced}`:''}`;
    const {ctx,page,errors}=await openPage(width,900,scheme);await assignedBeam(page,{left:'roller',right:'pin',qStart:.001,qEnd:.002});
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
  const {ctx,page}=await openPage(1024,800,'light',{reducedMotion:'reduce'},'?beamCase=l03-tip');
  await page.click('[data-tab="modes"]');
  check(await page.$eval('#beamAnimate',b=>b.disabled),'mode animation disabled for reduced motion');
  await ctx.close();
}
// The Design lab copy of the VINCO card (outside the Beam Lab): text, button, hover and keyboard focus.
async function openDesignLesson(page){
  await page.click('#app .wing-experiments > summary');await page.click('[data-wing-lesson="design"]');
  check(await page.isVisible('.wing-editor-pop #tab-design'),'Design lab opens in its actual Experiments & theory editor');
}
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
  const {ctx,page,errors}=await openPage(1440,900,'light',{},'?beamCase=l03-tip');
  const ready=await page.evaluate(()=>document.documentElement.dataset.wingReady==='true');
  if(!ready) notes.push('WebGL wing workspace not tested: three.js did not load (set BEAM_THREE_DIR or allow the CDN).');
  else {
    const before=await page.textContent('#beamKpis');
    await page.click('[data-stage="wing"]');
    await page.waitForFunction(()=>!document.querySelector('#app').hidden&&window.WingLabUI.result()&&!window.WingLabUI.isRunning()&&document.querySelector('#stateChip').textContent==='Solved',null,{timeout:120000});
    check(await page.evaluate(()=>{const c=document.querySelector('#gl');const gl=c.getContext('webgl2')||c.getContext('webgl');return !!gl&&c.width>0;}),'wing WebGL canvas is live');
    await openDesignLesson(page);
    const link=await page.$eval('#tab-design .companion-card a',a=>({href:a.getAttribute('href'),target:a.target,rel:a.rel}));
    check(link.href==='https://vinco-rc.com/?generator=wing'&&link.target==='_blank'&&link.rel==='noopener noreferrer','VINCO card in the Design lab tab');
    await designTabContrast(page,'1440 light');
    await page.screenshot({path:path.join(shots,'wing_design_tab.png')});
    await page.click('.wing-editor-pop .wing-editor-close');
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
  const {ctx,page,errors}=await openPage(1440,900,'dark',{},'?beamCase=l03-tip');
  if(await page.evaluate(()=>document.documentElement.dataset.wingReady==='true')) {
    await page.click('[data-stage="wing"]');
    await page.waitForFunction(()=>!document.querySelector('#app').hidden&&window.WingLabUI.result()&&!window.WingLabUI.isRunning()&&document.querySelector('#stateChip').textContent==='Solved',null,{timeout:120000});
    await openDesignLesson(page);
    await designTabContrast(page,'1440 dark');
    await page.screenshot({path:path.join(shots,'wing_design_tab_dark.png')});
    await page.click('.wing-editor-pop .wing-editor-close');
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
console.log(`Real-browser check (Chromium): no-load opening (390/1440, light/dark), layout at 390/768/1440 px in light and dark, every result tab, placement, cut dragging, exact station readout (L/2 button, Enter, plot click and hover, picture drag, x⁻/x⁺ at a jump), plot PNG files (size, white background, drawn content, light and dark), station table and its CSV, keyboard tabs, focus, print report, reduced motion, computed-colour contrast of the VINCO button (normal, hover, focus, visited rule) and of all Beam Lab text in four theme paths${notes.some(n=>/not tested/.test(n))?'':', the Design-tab card and WebGL wing/D.520 round trips'} passed. Screenshots: ${shots}`);
