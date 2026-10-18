// REAL-BROWSER checks of the v5 load features (Chromium via Playwright), complementing the jsdom suites:
// Beam elliptic/parabolic loads entered through the form, the CSV line-load table with a real file chooser
// (malformed file refused, hostile file name, SHA-256), real downloads (template, study, plot PNG), the share
// link reopened in a new page, and layout/contrast at 390/768/1440 px in light and dark.
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
  await page.waitForFunction(()=>window.BeamLab&&document.querySelector('#beamChip').textContent==='Solved');
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
async function addCurve(page,kind,a,b,shape,basis,value) {
  await page.selectOption('#beamLoadKind',kind);
  await page.fill('#beamLoadA',String(a));await page.fill('#beamLoadB',String(b));
  await page.selectOption('#beamCurveShape',shape);await page.selectOption('#beamCurveBasis',basis);await page.fill('#beamCurveValue',String(value));
  await page.click('#beamLoadSubmit');await solved(page);
}

/* ---------- 1. Beam: curved loads through the form, layout and contrast at three widths, light and dark ---------- */
for(const [width,height] of [[390,844],[768,1024],[1440,900]]) for(const scheme of ['light','dark']) {
  const tag=`beam curves ${width} ${scheme}`, {ctx,page,errors}=await openPage(width,height,scheme);
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

// (The wing-workspace sections of this test belong to the later wing-workspace phase.)

await browser.close();
for(const n of notes) console.log('NOTE',n);
if(failures.length){console.log(failures.map(f=>'FAIL '+f).join('\n'));process.exit(1);}
console.log(`v5 real-browser check (Chromium): ${passed.join('; ')}. Screenshots: ${shots}`);
