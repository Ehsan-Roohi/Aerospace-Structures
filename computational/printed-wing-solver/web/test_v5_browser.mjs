// REAL-BROWSER checks of the v5 load features (Chromium via Playwright), complementing the jsdom suites:
// Beam elliptic/parabolic loads entered through the form, the CSV line-load table with a real file chooser
// (malformed file refused, hostile file name, SHA-256), real downloads (template, study, plot PNG), the share
// link reopened in a new page, and layout/contrast at 390/768/1440 px in light and dark. The wing sections
// (printed semi-wing and D.520 editors, figures, layout) run when WebGL and three.js are available.
//   PLAYWRIGHT_MODULE=/path/to/node_modules/playwright/index.mjs BEAM_THREE_DIR=/path/to/three \
//   node computational/printed-wing-solver/web/test_v5_browser.mjs [page-url] [screenshot-dir]
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url));
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
let pageUrl=process.argv[2]||pathToFileURL(path.join(here,'../../../docs/wing-lab.html')).href;
const shots=process.argv[3]||path.join(tmpdir(),'v5-shots');mkdirSync(shots,{recursive:true});
if(process.env.BEAM_THREE_DIR&&pageUrl.startsWith('file:')) {
  const three=process.env.BEAM_THREE_DIR;
  const html=readFileSync(fileURLToPath(pageUrl),'utf8')
    .replace('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',pathToFileURL(path.join(three,'build/three.min.js')).href)
    .replace('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js',pathToFileURL(path.join(three,'examples/js/controls/OrbitControls.js')).href);
  const copy=path.join(tmpdir(),'wing-lab-v5-local-three.html');writeFileSync(copy,html);pageUrl=pathToFileURL(copy).href;
}
const failures=[], notes=[], passed=[];
const check=(cond,msg)=>{if(!cond)failures.push(msg);};
const AUDIT=readFileSync(path.join(here,'beam_contrast_audit.js'),'utf8');
const audit=(page,root,opts={})=>page.evaluate(([r,o])=>window.__contrastAudit(r,o),[root,opts]);
const fmtFail=r=>`${r.tag}${r.id?'#'+r.id:''}.${r.cls} "${r.text}" ${r.color} on ${r.background} = ${r.ratio}:1 (needs ${r.need}:1)`;
const browser=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
async function openPage(width,height,scheme,extra={},query='') {
  const ctx=await browser.newContext({viewport:{width,height},colorScheme:scheme,deviceScaleFactor:1,...extra});
  const page=await ctx.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&!/ERR_|Failed to load resource/.test(m.text()))errors.push(m.text());});
  page.on('dialog',d=>{errors.push(`dialog: ${d.message()}`);d.dismiss();});
  await page.goto(pageUrl+query,{waitUntil:'load'});
  await page.waitForFunction(()=>window.BeamLab&&document.querySelector('#beamChip'));
  if(query) await page.waitForFunction(()=>window.BeamLab.state().solved&&document.querySelector('#beamChip').textContent==='Solved');
  else await page.waitForFunction(()=>window.BeamLab.state().solved===null&&document.querySelector('#beamChip').textContent==='Pending');
  await page.addScriptTag({content:AUDIT});
  return {ctx,page,errors};
}
const overflowProbe=root=>{
  const W=document.documentElement.clientWidth, bad=[];
  const scroller=el=>{for(let p=el.parentElement;p;p=p.parentElement){const s=getComputedStyle(p).overflowX;if(s==='auto'||s==='scroll')return true;}return false;};
  for(const el of document.querySelectorAll(`${root} *`)) {
    if(!el.getClientRects().length) continue;
    const shut=el.closest('details:not([open])');if(shut&&!el.closest('summary'))continue;
    const r=el.getBoundingClientRect();
    if(r.width>0&&(r.right>W+1||r.left<-1)&&!scroller(el)) bad.push(`${el.tagName.toLowerCase()}#${el.id}.${String(el.className.baseVal??el.className).split(' ')[0]} ${Math.round(r.left)}–${Math.round(r.right)}`);
  }
  return {doc:document.documentElement.scrollWidth,vw:W,bad:bad.slice(0,8)};
};
const beamLoads=page=>page.evaluate(()=>JSON.stringify(window.BeamLab.state().solved.model.loads));
const solved=page=>page.waitForFunction(()=>document.querySelector('#beamChip').textContent==='Solved');
async function unloadedCantilever(page){
  check(await page.evaluate(()=>{const s=window.BeamLab.state();return s.solved===null&&!s.model.supports.length&&!s.model.loads.length&&!s.model.selfWeight;}),'normal Beam startup has no restraints, loads or claimed solution');
  await page.selectOption('#beamleftSupport','fixed');await page.selectOption('#beamrightSupport','free');await page.click('#beamSolve');await solved(page);
  check(await page.evaluate(()=>{const s=window.BeamLab.state().solved;return s.model.supports.length===1&&s.model.supports[0].kind==='fixed'&&!s.model.loads.length&&!s.model.selfWeight&&s.result.maxima.deflection===0;}),'student explicitly creates and solves an unloaded cantilever before entering test loads');
}
async function addCurve(page,kind,a,b,shape,basis,value) {
  await page.selectOption('#beamLoadKind',kind);
  await page.fill('#beamLoadA',String(a));await page.fill('#beamLoadB',String(b));
  await page.selectOption('#beamCurveShape',shape);await page.selectOption('#beamCurveBasis',basis);await page.fill('#beamCurveValue',String(value));
  await page.click('#beamLoadSubmit');await solved(page);
}

/* ---------- 1. Beam: curved loads through the form, layout and contrast at three widths, light and dark ---------- */
for(const [width,height] of [[390,844],[768,1024],[1440,900]]) for(const scheme of ['light','dark']) {
  const tag=`beam curves ${width} ${scheme}`, {ctx,page,errors}=await openPage(width,height,scheme);
  await unloadedCantilever(page);
  await addCurve(page,'elliptic',0,450,'start','total',2);
  await addCurve(page,'parabolic',100,400,'middle','peak',0.004);
  const loads=JSON.parse(await beamLoads(page));
  check(loads.length===2&&loads[0].kind==='elliptic'&&loads[0].total===2&&loads[1].peak===0.004,`${tag}: loads ${JSON.stringify(loads)}`);
  const pic=await page.evaluate(()=>({ell:!!document.querySelector('#beamPicture [data-load-kind="elliptic"]'),par:!!document.querySelector('#beamPicture [data-load-kind="parabolic"]'),text:document.querySelector('#beamPicture').textContent}));
  check(pic.ell&&pic.par&&/F = 2 N ↓/.test(pic.text)&&!/NaN|undefined/.test(pic.text),`${tag}: both curves drawn and labelled`);
  // the law line is visible and wraps inside the panel
  await page.selectOption('#beamLoadKind','elliptic');await page.fill('#beamLoadA','0');await page.fill('#beamLoadB','450');await page.fill('#beamCurveValue','2');await page.dispatchEvent('#beamCurveValue','input');
  check(await page.isVisible('#beamCurveLaw'),`${tag}: law shown`);
  const o=await page.evaluate(overflowProbe,'#foundations');
  check(o.doc<=o.vw&&!o.bad.length,`${tag}: overflow ${o.doc}>${o.vw} ${o.bad.join('; ')}`);
  const bad=(await audit(page,'#foundations',{text:true})).filter(r=>!r.ok);check(!bad.length,`${tag}: low-contrast text: ${bad.slice(0,4).map(fmtFail).join('; ')}`);
  await page.screenshot({path:path.join(shots,`v5_beam_curves_${width}_${scheme}.png`),fullPage:false});
  if(width===1440) await (await page.$('#beamPicture')).screenshot({path:path.join(shots,`v5_beam_picture_curves_${scheme}.png`)});
  check(!errors.length,`${tag}: console errors: ${errors.join(' | ')}`);
  await ctx.close();
}
passed.push('Beam curved loads through the form at 390/768/1440 px, light and dark (drawn, labelled, no overflow, contrast)');

/* ---------- 2. Beam: CSV table with a real file chooser, downloads, share link ---------- */
for(const scheme of ['light','dark']) {
  const tag=`beam csv ${scheme}`, {ctx,page,errors}=await openPage(1440,900,scheme,{acceptDownloads:true});
  await unloadedCantilever(page);
  await page.click('#beamCsvBox > summary');
  const [tdl]=await Promise.all([page.waitForEvent('download'),page.click('#beamCsvTemplate')]);
  const tpl=readFileSync(await tdl.path(),'utf8');
  check(tdl.suggestedFilename()==='beam_line_load_template.csv'&&/^# .*\n/m.test(tpl)&&/x_mm,w_N_per_mm/.test(tpl),`${tag}: template ${tdl.suggestedFilename()}`);
  // a malformed file is refused and nothing changes
  const before=await beamLoads(page);
  await page.setInputFiles('#beamCsvFile',{name:'bad.csv',mimeType:'text/csv',buffer:Buffer.from('x_mm,w_N_per_mm\n0,0.002\n300,0.001\n200,0\n')});
  await page.waitForFunction(()=>/Not imported/.test(document.querySelector('#beamCsvResult').textContent));
  check(await page.isDisabled('#beamCsvApply'),`${tag}: Apply disabled for a malformed file`);check(await beamLoads(page)===before,`${tag}: malformed file changes nothing`);
  // a valid file with a hostile name: preview first, SHA-256, then Apply
  const csv='x_mm,w_N_per_mm\r\n# from a spreadsheet\r\n0,0.004\r\n150,0.002\r\n450,0\r\n', name='<img src=x onerror=alert(1)>loads.csv', hash=createHash('sha256').update(csv).digest('hex');
  await page.setInputFiles('#beamCsvFile',{name,mimeType:'text/csv',buffer:Buffer.from(csv)});
  await page.waitForFunction(()=>/Preview: 3 rows/.test(document.querySelector('#beamCsvResult').textContent));
  const pv=await page.textContent('#beamCsvResult');
  check(pv.includes(name)&&pv.includes(`SHA-256 ${hash.slice(0,12)}`)&&/0\.75 N \(↓\)/.test(pv)&&/140 mm/.test(pv),`${tag}: preview ${pv.slice(0,200)}`);
  check(await page.evaluate(()=>document.querySelectorAll('#beamCsvResult img').length)===0,`${tag}: file name not interpreted as HTML`);
  check(await beamLoads(page)===before,`${tag}: preview changes nothing`);
  if(scheme==='light') await (await page.$('#beamCsvBox')).screenshot({path:path.join(shots,'v5_beam_csv_preview.png')});
  const bad0=(await audit(page,'#beamCsvBox',{text:true})).filter(r=>!r.ok);check(!bad0.length,`${tag}: CSV box contrast: ${bad0.slice(0,4).map(fmtFail).join('; ')}`);
  await page.click('#beamCsvApply');await solved(page);
  const loads=JSON.parse(await beamLoads(page));
  check(loads.length===1&&loads[0].kind==='table'&&loads[0].source.sha256===hash&&loads[0].source.filename===name,`${tag}: table applied ${JSON.stringify(loads)}`);
  check(await page.evaluate(()=>!!document.querySelector('#beamPicture [data-load-kind="table"]')),`${tag}: table drawn`);
  // study file, plot PNG and share link
  await page.click('[data-tab="report"]');
  const [sdl]=await Promise.all([page.waitForEvent('download'),page.click('#beamDownload')]);
  const study=JSON.parse(readFileSync(await sdl.path(),'utf8'));
  check(study.version===3&&study.model.loads[0].kind==='table'&&study.model.loads[0].source.sha256===hash,`${tag}: saved study v${study.version}`);
  await page.click('[data-tab="diagrams"]');
  const [pdl]=await Promise.all([page.waitForEvent('download'),page.click('[data-png="moment"]')]);
  const png=readFileSync(await pdl.path());check(png.subarray(0,8).toString('hex')==='89504e470d0a1a0a'&&png.readUInt32BE(16)===1920,`${tag}: moment PNG`);
  const imgText=await page.evaluate(()=>[...new DOMParser().parseFromString(window.BeamLab.plotImage('moment').svg,'image/svg+xml').querySelectorAll('text')].map(t=>t.textContent).join(' '));
  check(imgText.includes('table of 3 rows (linear between rows) on 0–450 mm from '+name),`${tag}: plot image load line`);
  await page.click('[data-tab="report"]');await page.click('#beamShare');await page.waitForFunction(()=>document.querySelector('#beamShareBox').value.includes('?beam='));
  const link=await page.inputValue('#beamShareBox');
  const p2=await ctx.newPage();await p2.goto(link,{waitUntil:'load'});await p2.waitForFunction(()=>window.BeamLab&&document.querySelector('#beamChip').textContent==='Solved');
  check(await beamLoads(p2)===await beamLoads(page),`${tag}: share link reopens the same table`);
  const d1=await page.evaluate(()=>window.BeamLab.state().solved.result.deflection.at(-1)), d2=await p2.evaluate(()=>window.BeamLab.state().solved.result.deflection.at(-1));
  check(d1===d2&&d1>0,`${tag}: same tip deflection after the link (${d1} vs ${d2})`);
  check(!errors.length,`${tag}: console errors: ${errors.join(' | ')}`);
  await ctx.close();
}
passed.push('Beam CSV table with a real file chooser (malformed file refused, hostile name as text, SHA-256), template/study/PNG downloads and the share link');

/* ---------- 3. Beam: CSV editor on a phone, dark ---------- */
{
  const {ctx,page,errors}=await openPage(390,844,'dark');
  await unloadedCantilever(page);
  await page.click('#beamCsvBox > summary');
  await page.fill('#beamCsvText','x_mm,w_N_per_mm\n0,0.004\n150,0.002\n450,0\n');await page.click('#beamCsvPreview');
  await page.waitForFunction(()=>/Preview: 3 rows/.test(document.querySelector('#beamCsvResult').textContent));
  const o=await page.evaluate(overflowProbe,'#foundations');check(o.doc<=o.vw&&!o.bad.length,`phone CSV: overflow ${o.doc}>${o.vw} ${o.bad.join('; ')}`);
  const bad=(await audit(page,'#beamCsvBox',{text:true})).filter(r=>!r.ok);check(!bad.length,`phone CSV contrast: ${bad.slice(0,4).map(fmtFail).join('; ')}`);
  await (await page.$('#beamCsvBox')).screenshot({path:path.join(shots,'v5_beam_csv_390_dark.png')});
  check(!errors.length,`phone CSV console errors: ${errors.join(' | ')}`);
  await ctx.close();
}
passed.push('Beam CSV preview on a 390 px phone in dark mode');

/* ---------- 4. printed semi-wing: load editor, figures, CSV with x/c, study files, import gate, link ---------- */
const wingReady=page=>page.waitForFunction(()=>window.WingLabUI&&window.WingLabUI.result()&&!window.WingLabUI.isRunning()&&!window.WingLabUI.isStale()&&document.querySelector('#stateChip').textContent==='Solved',null,{timeout:120000});
async function openWing(width,height,scheme,extra={}) {
  const ctx=await browser.newContext({viewport:{width,height},colorScheme:scheme,deviceScaleFactor:1,...extra});
  const page=await ctx.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&!/ERR_|Failed to load resource/.test(m.text()))errors.push(m.text());});
  page.on('dialog',d=>{errors.push(`dialog: ${d.message()}`);d.dismiss();});
  await page.goto(pageUrl,{waitUntil:'load'});
  const ready=await page.waitForFunction(()=>document.documentElement.dataset.wingReady==='true',null,{timeout:30000}).then(()=>true,()=>false);
  if(ready) {await page.addScriptTag({content:AUDIT});await page.$eval('[data-stage="project"]',b=>b.click());await wingReady(page);await page.check('#wingAutoSolve');}
  return {ctx,page,errors,ready};
}
const wingSolve=async page=>{await page.click('#runBtn');await wingReady(page);};
const closeWingPopup=async page=>{const popup=page.locator('.wing-editor-pop:visible');if(await popup.count())await popup.locator('.wing-editor-close').click();};
async function wingInputs(page){if(!await page.isVisible('#wingSide'))await page.click('#inputsBtn');check(await page.isVisible('#wingSide'),'Wing inputs open from the actual toolbar/drawer control');}
async function wingLoadPopup(page){await closeWingPopup(page);await page.click('#app [data-wing-action="load"]');check(await page.isVisible('.wing-editor-pop #wingLoadForm'),'Wing load values appear in the visible compact popup');}
async function clearWingLoads(page){await wingLoadPopup(page);await page.click('#wingClearLoad');await wingReady(page);await closeWingPopup(page);}
for(const [width,height,scheme] of [[1440,900,'light'],[390,844,'dark']]) {
  const tag=`printed wing ${width} ${scheme}`, {ctx,page,errors,ready}=await openWing(width,height,scheme,{acceptDownloads:true});
  if(!ready){notes.push(`${tag}: not tested (three.js did not load; set BEAM_THREE_DIR)`);await ctx.close();continue;}
  check(/Solved with no load/.test(await page.textContent('#stateText')),`${tag}: opens solved with no load`);
  // an elliptic load at x/c = 0.6 through the form
  await wingLoadPopup(page);
  await page.selectOption('#wingKind','elliptic');
  await page.fill('#wingA','0');await page.fill('#wingB','450');await page.fill('#wingCurveValue','2');await page.fill('#wingFraction','0.6');await page.dispatchEvent('#wingCurveValue','input');
  check(/w₀ = 0\.005659 N\/mm/.test(await page.textContent('#wingCurveLaw')),`${tag}: live law`);
  await page.dispatchEvent('#wingCurveValue','input');await page.waitForTimeout(50);
  check(await page.$eval('#wingChordFigure',el=>!!el.querySelector('svg')&&/SC/.test(el.textContent)&&/nose-down/.test(el.textContent)),`${tag}: chord figure with the shear centre and a nose-down torque (force aft of the SC)`);
  if(width===1440) await (await page.$('.wing-editor-pop:visible')).screenshot({path:path.join(shots,`v5_wing_load_editor_${scheme}.png`)});
  await page.click('#wingLoadForm button[type="submit"]');await wingReady(page);
  check(await page.evaluate(()=>window.WingLabUI.result().load.items.length===1&&Math.abs(window.WingLabUI.result().V[0]-2)<1e-9),`${tag}: elliptic F = 2 N applied`);
  // CSV table with an x/c column through the real file chooser
  await wingLoadPopup(page);await page.click('#wingCsv > summary');
  await page.setInputFiles('#wingCsvFile',{name:'root_heavy.csv',mimeType:'text/csv',buffer:Buffer.from('y_mm,w_N_per_mm,x_over_c\n0,0.004,0.25\n200,0.002,0.3\n450,0,0.4\n')});
  await page.waitForFunction(()=>/Preview: 3 rows/.test(document.querySelector('#wingCsvOut').textContent));
  check(/x\/c from the table/.test(await page.textContent('#wingCsvOut'))&&/SHA-256/.test(await page.textContent('#wingCsvOut')),`${tag}: CSV preview with x/c and SHA-256`);
  await page.click('#wingCsvApply');await wingReady(page);
  check(await page.evaluate(()=>window.WingLabUI.result().load.items.length===2&&window.WingLabUI.result().load.items[1].kind==='table'),`${tag}: table added`);
  // the Schrenk teaching figure on the load lesson
  await closeWingPopup(page);await page.click('#app .wing-experiments > summary');await page.click('[data-wing-lesson="loads"]');await page.waitForTimeout(150);
  const sf=await page.$('#wingLoadLesson svg.wlefig');check(!!sf,`${tag}: Schrenk figure on the load lesson`);
  if(sf&&width===1440) await sf.screenshot({path:path.join(shots,`v5_wing_schrenk_${scheme}.png`)});
  // save the study (real download), change it, open the saved file (real file chooser), Apply, Solve: same numbers
  await closeWingPopup(page);
  const m0=await page.evaluate(()=>{const r=window.WingLabUI.result();return [r.V[0],r.M[0],r.T[0],r.deflection.at(-1),r.twist.at(-1),r.mass.printed];});
  const [sdl]=await Promise.all([page.waitForEvent('download'),page.click('#app [data-wing-action="save-json"]')]);
  const studyPath=await sdl.path(), study=JSON.parse(readFileSync(studyPath,'utf8'));
  check(study.format==='mie446-wing-study'&&study.study.load.items.length===2&&study.study.load.items[1].source.filename==='root_heavy.csv',`${tag}: saved study keeps both loads and the table's file name`);
  await clearWingLoads(page);
  await page.setInputFiles('#wingStudyFiles .wio-open input[type="file"]',studyPath);
  await page.waitForFunction(()=>{const p=document.querySelector('#wingStudyFiles .wio-preview');return p&&!p.hidden&&/Apply/.test(p.textContent);});
  await page.click('#wingStudyFiles .wio-apply');await page.waitForTimeout(50);
  check(await page.textContent('#stateChip')==='Out of date',`${tag}: opening a file waits for Solve`);
  await wingSolve(page);
  const m1=await page.evaluate(()=>{const r=window.WingLabUI.result();return [r.V[0],r.M[0],r.T[0],r.deflection.at(-1),r.twist.at(-1),r.mass.printed];});
  check(m1.every((v,i)=>Math.abs(v-m0[i])<=1e-12*Math.abs(m0[i])+1e-15),`${tag}: reopened study gives the same V, M, T, deflection, twist and mass (${m0} vs ${m1})`);
  // link → new page
  await wingInputs(page);await page.$eval('#wlFiles',d=>{d.open=true;});await page.click('#wingShareBtn');await page.waitForTimeout(80);const link=await page.inputValue('#wingShareBox');
  check(/#wingstudy=[A-Za-z0-9_-]+$/.test(link),`${tag}: link built`);
  // (the first page leaves its 3-D view while the second one loads: two software-rendered WebGL views starve each other)
  if(await page.isVisible('#wingSide > button[aria-label="Close wing inputs"]'))await page.click('#wingSide > button[aria-label="Close wing inputs"]');await page.click('#backFoundations');
  const p2=await ctx.newPage();await p2.goto(link,{waitUntil:'load',timeout:120000});await wingReady(p2);
  const m2=await p2.evaluate(()=>{const r=window.WingLabUI.result();return [r.V[0],r.M[0],r.T[0],r.deflection.at(-1),r.twist.at(-1),r.mass.printed];});
  check(m2.every((v,i)=>Math.abs(v-m0[i])<=1e-12*Math.abs(m0[i])+1e-15),`${tag}: the link reopens and solves the same study`);
  check(/Shared study opened from the link/.test(await p2.textContent('#wingFilesNote')),`${tag}: the linked page says what it opened`);await p2.close();
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('wing-show')));await page.waitForTimeout(200);
  // geometry-only design parameters: gate
  await clearWingLoads(page);
  const params=JSON.stringify({...JSON.parse(readFileSync(path.join(here,'wing_parameters_template.json'),'utf8')),units:{length:'cm'},span:{value:84,kind:'full'},rootChord:15,tipChord:9.5,airfoil:{type:'naca4',code:'2415'}});
  await page.setInputFiles('#wingStudyFiles .wio-params input[type="file"]',{name:'my_design.json',mimeType:'application/json',buffer:Buffer.from(params)});
  await page.waitForFunction(()=>/Apply outer geometry/.test(document.querySelector('#wingStudyFiles .wio-preview').textContent));
  await page.click('#wingStudyFiles .wio-apply-geometry');await page.waitForTimeout(80);
  await wingInputs(page);
  check(await page.textContent('#stateChip')==='Analysis blocked'&&await page.isVisible('#wingImportGate'),`${tag}: analysis blocked after a shape-only import`);
  const badGate=(await audit(page,'#wingImportGate',{text:true})).filter(r=>!r.ok);check(!badGate.length,`${tag}: gate contrast: ${badGate.slice(0,3).map(fmtFail).join('; ')}`);
  await (await page.$('#wingImportGate')).screenshot({path:path.join(shots,`v5_wing_import_gate_${width}_${scheme}.png`)});
  for(const id of await page.$$eval('#wingImportGate [data-gate]',els=>els.map(e=>e.dataset.gate))) await page.check(`#wingImportGate [data-gate="${id}"]`);
  check(/Structure confirmed/.test(await page.textContent('#wingGateHead')),`${tag}: the gate says the structure is confirmed`);
  check(await page.textContent('#stateChip')==='Out of date',`${tag}: every item ticked: ready to solve`);
  await wingSolve(page);
  check(await page.evaluate(()=>window.WingLabUI.result().geometry.semiSpan===420&&window.WingLabUI.result().geometry.naca==='2415'),`${tag}: the imported shape is analysed`);
  const o=await page.evaluate(overflowProbe,'#app');check(o.doc<=o.vw&&!o.bad.length,`${tag}: overflow ${o.doc}>${o.vw} ${o.bad.join('; ')}`);
  const bad=(await audit(page,'#wingSide',{text:true})).filter(r=>!r.ok);check(!bad.length,`${tag}: input column contrast: ${bad.slice(0,4).map(fmtFail).join('; ')}`);
  await page.screenshot({path:path.join(shots,`v5_wing_${width}_${scheme}.png`)});
  check(!errors.length,`${tag}: console errors: ${errors.join(' | ')}`);
  await ctx.close();
}
passed.push('printed wing in Chromium at 1440 light and 390 dark (elliptic load and chord figure, CSV with x/c via the file chooser, Schrenk figure, study save/open via real download and file chooser with identical results, link, shape-only import gate, contrast, no overflow)');

/* ---------- 5. D.520: toolbar load popup, figures, study file, link ---------- */
{
  const tag='D.520 1440 dark', ctx=await browser.newContext({viewport:{width:1440,height:900},colorScheme:'dark',acceptDownloads:true}), page=await ctx.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/ERR_|Failed to load resource/.test(m.text()))errors.push(m.text());});
  await page.goto(pageUrl,{waitUntil:'load'});
  const ready=await page.waitForFunction(()=>document.documentElement.dataset.wingReady==='true',null,{timeout:30000}).then(()=>true,()=>false);
  if(!ready) notes.push(`${tag}: not tested (three.js did not load)`);
  else {
    await page.addScriptTag({content:AUDIT});
    await page.$eval('[data-stage="metal"]',b=>b.click());
    const settled=()=>page.waitForFunction(()=>window.MetalWingUI.result()&&document.querySelector('#mLoading').hidden&&!/Solving|Out of date|Ready/.test(document.querySelector('#mChip').textContent),null,{timeout:180000});
    await settled();check(await page.textContent('#mChip')==='No load',`${tag}: opens with no load`);
    await page.click('#metalApp [data-wing-action="load"]');check(await page.isVisible('.wing-editor-pop #mLoadForm'),`${tag}: toolbar opens a visible compact D.520 load editor`);
    await page.selectOption('#mLoadShape','elliptic');await page.fill('#mLa','0.46');await page.fill('#mLb','4.93');await page.fill('#mLvalue','10000');await page.fill('#mLxc','0.6');
    await page.dispatchEvent('#mLvalue','input');await page.waitForTimeout(80);
    check(await page.$eval('#mChordFigure',el=>!!el.querySelector('svg')&&/nose-down/.test(el.textContent)),`${tag}: chord figure (x/c = 0.6 aft of the shear centre: nose-down)`);
    await (await page.$('.wing-editor-pop:visible')).screenshot({path:path.join(shots,'v5_d520_load_editor_dark.png')});
    await page.click('#mLoadForm button[type="submit"]');await page.waitForTimeout(700);await settled();
    const M0=await page.evaluate(()=>window.MetalWingUI.result().perG.M(0.4600001));
    check(Math.abs(M0-10000*4*(4.93-0.46)/(3*Math.PI))<1e-3,`${tag}: M at the fittings = 4ℓF/(3π) (${M0})`);
    await page.$eval('#mSecFiles',d=>{d.open=true;d.scrollIntoView({block:'center'});});
    const [dl]=await Promise.all([page.waitForEvent('download'),page.click('#mStudyFiles .wio-save')]);
    const doc=JSON.parse(readFileSync(await dl.path(),'utf8'));check(doc.workspace==='d520'&&doc.study.customLoads[0].kind==='elliptic',`${tag}: D.520 study saved`);
    await page.click('#mShareBtn');await page.waitForTimeout(80);const link=await page.inputValue('#mShareBox');
    check(/#d520&wingstudy=/.test(link),`${tag}: D.520 link`);
    await page.click('#mBackBeams');
    const p2=await ctx.newPage();await p2.goto(link,{waitUntil:'load',timeout:120000});
    await p2.waitForFunction(()=>window.MetalWingUI&&window.MetalWingUI.result()&&window.MetalWingUI.state.input.customLoads&&window.MetalWingUI.state.input.customLoads.length===1&&!/Solving|Out of date|Ready/.test(document.querySelector('#mChip').textContent),null,{timeout:180000});
    const M2=await p2.evaluate(()=>window.MetalWingUI.result().perG.M(0.4600001));check(Math.abs(M2-M0)<=1e-9*Math.abs(M0),`${tag}: the link reopens the same D.520 study`);await p2.close();
    await page.evaluate(()=>window.MetalWingUI.open());await page.waitForTimeout(300);
    const bad=(await audit(page,'#mSide',{text:true})).filter(r=>!r.ok);check(!bad.length,`${tag}: input column contrast: ${bad.slice(0,4).map(fmtFail).join('; ')}`);
    const o=await page.evaluate(overflowProbe,'#metalLab');check(o.doc<=o.vw&&!o.bad.length,`${tag}: overflow ${o.doc}>${o.vw} ${o.bad.join('; ')}`);
    await page.screenshot({path:path.join(shots,'v5_d520_1440_dark.png')});
    passed.push('D.520 in Chromium at 1440 dark (no-load opening, toolbar load popup, elliptic 4ℓF/(3π), chord figure, study file download, link reopened in a new page, contrast, no overflow)');
  }
  check(!errors.length,`${tag}: console errors: ${errors.join(' | ')}`);
  await ctx.close();
}

/* ---------- 6. D.520 A/B comparison in the Report tab at phone width ---------- */
{
  const tag='D.520 A/B 390 light', ctx=await browser.newContext({viewport:{width:390,height:844},colorScheme:'light',deviceScaleFactor:1}), page=await ctx.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/ERR_|Failed to load resource/.test(m.text()))errors.push(m.text());});
  await page.goto(pageUrl,{waitUntil:'load'});
  const ready=await page.waitForFunction(()=>document.documentElement.dataset.wingReady==='true',null,{timeout:30000}).then(()=>true,()=>false);
  if(!ready) notes.push(`${tag}: not tested (three.js did not load)`);
  else {
    await page.addScriptTag({content:AUDIT});
    await page.$eval('[data-stage="metal"]',b=>b.click());
    const settled=()=>page.waitForFunction(()=>window.MetalWingUI.result()&&document.querySelector('#mLoading').hidden&&!/Solving|Out of date|Ready/.test(document.querySelector('#mChip').textContent),null,{timeout:180000});
    await settled();check(await page.textContent('#mChip')==='No load',`${tag}: opens with no load`);
    await page.click('[data-mtab="report"]');await page.click('#mSaveA');
    check(await page.textContent('#mABState')==='Saved the solved study as A.',`${tag}: A saved`);
    await page.click('#metalApp [data-wing-action="load"]');await page.click('#mRestoreFlight');await page.waitForTimeout(700);await settled();await closeWingPopup(page);
    await page.click('[data-mtab="report"]');await page.click('#mSaveB');
    const t=await page.evaluate(()=>{const R=window.MetalWingUI.result(), rows=[...document.querySelectorAll('#mABTable tbody tr')].map(tr=>[...tr.children].map(c=>c.textContent.trim()));
      return {rows,M:(R.fitting.M_per_g*R.n/1e3).toFixed(3),w:(R.tip.wMax*1e3).toFixed(2),diff:document.querySelectorAll('#mAB p.note')[1].textContent,
        wide:(()=>{const tb=document.querySelector('#mABTable');return tb.scrollWidth-tb.clientWidth;})()};});
    check(t.rows.length===10,`${tag}: ten quantities (${t.rows.length})`);
    check(t.rows[2][0]==='Moment at the fittings (kN·m)'&&t.rows[2][1]==='0.000'&&t.rows[2][2]===t.M&&t.rows[2][3]==='+'+t.M,`${tag}: moment at the fittings A 0, B = the solved value, B − A (${t.rows[2].join(' | ')})`);
    check(t.wide<=1,`${tag}: the A/B table fits the phone width without its own scrolling (${t.wide} px hidden)`);
    check(t.rows[4][0]==='Tip deflection at rib 1 (mm)'&&t.rows[4][2]===t.w,`${tag}: tip deflection of B = the solved value (${t.rows[4].join(' | ')})`);
    check(t.diff==='Inputs that differ: load case.',`${tag}: ${t.diff}`);
    // put the A/B heading just below the sticky workspace bar, as a reader scrolling to it would see it
    await page.evaluate(()=>{const nav=document.querySelector('#metalNav').getBoundingClientRect().height, top=document.querySelector('.mw-ab').getBoundingClientRect().top+window.scrollY;window.scrollTo(0,top-nav-8);});await page.waitForTimeout(150);
    const bad=(await audit(page,'.mw-ab',{text:true})).filter(r=>!r.ok);check(!bad.length,`${tag}: A/B contrast: ${bad.slice(0,4).map(fmtFail).join('; ')}`);
    const o=await page.evaluate(overflowProbe,'#metalLab');check(o.doc<=o.vw&&!o.bad.length,`${tag}: overflow ${o.doc}>${o.vw} ${o.bad.join('; ')}`);
    const small=await page.$$eval('.mw-ab button',bs=>bs.filter(b=>b.getBoundingClientRect().height<36).map(b=>b.id));check(!small.length,`${tag}: A/B buttons at least 36 px high (${small.join(', ')})`);
    await page.screenshot({path:path.join(shots,'v5_d520_ab_390_light.png')});
    passed.push('D.520 A/B in Chromium at 390 light (no load saved as A, flight loading as B, cells equal the solved result, changed input named, contrast, no overflow, touch targets)');
  }
  check(!errors.length,`${tag}: console errors: ${errors.join(' | ')}`);
  await ctx.close();
}

await browser.close();
for(const n of notes) console.log('NOTE',n);
if(failures.length){console.log(failures.map(f=>'FAIL '+f).join('\n'));process.exit(1);}
console.log(`v5 real-browser check (Chromium): ${passed.join('; ')}. Screenshots: ${shots}`);
