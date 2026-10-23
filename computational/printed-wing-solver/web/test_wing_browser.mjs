// REAL-BROWSER check of the printed-wing and D.520 workspaces (Chromium via Playwright; WebGL by SwiftShader).
// At 390, 768 and 1440 px in light and dark: no horizontal page scroll and nothing sticking out of the viewport,
// input tools above the 3-D view and results beneath it, Solve and the status chip visible (Out of date → Solved for the
// printed wing), zoom / Fit / Reset change the camera but never the reported dimensions, and the D.520 part
// toggles hide parts (and spar labels) without changing the inputs or any result, in model, stress and mode views.
//   PLAYWRIGHT_MODULE=/path/to/node_modules/playwright/index.mjs BEAM_THREE_DIR=/path/to/three@0.128.0 \
//   node computational/printed-wing-solver/web/test_wing_browser.mjs [page-url] [screenshot-dir]
// The default page is docs/wing-lab.html. three.js comes from the CDN unless BEAM_THREE_DIR (or WING_THREE_DIR)
// points at a local three@0.128.0 package; a temporary copy of the page is then pointed at it.
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url));
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
let pageUrl=process.argv[2]||pathToFileURL(path.join(here,'../../../docs/wing-lab.html')).href;
const shots=process.argv[3]||path.join(tmpdir(),'wing-lab-shots');mkdirSync(shots,{recursive:true});
const three=process.env.WING_THREE_DIR||process.env.BEAM_THREE_DIR;
if(three&&pageUrl.startsWith('file:')) {
  const html=readFileSync(fileURLToPath(pageUrl),'utf8')
    .replace('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',pathToFileURL(path.join(three,'build/three.min.js')).href)
    .replace('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js',pathToFileURL(path.join(three,'examples/js/controls/OrbitControls.js')).href);
  const copy=path.join(tmpdir(),'wing-lab-ui-local-three.html');writeFileSync(copy,html);pageUrl=pathToFileURL(copy).href;
}
const failures=[], notes=[];
let checks=0;
const check=(cond,msg)=>{checks++;if(!cond)failures.push(msg);};
const browser=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
async function open(width,height,scheme,which) {
  const ctx=await browser.newContext({viewport:{width,height},colorScheme:scheme,deviceScaleFactor:1});
  const page=await ctx.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&!/ERR_|Failed to load resource/.test(m.text()))errors.push(m.text());});
  await page.goto(pageUrl,{waitUntil:'load'});
  const ready=await page.waitForFunction(()=>document.documentElement.dataset.wingReady==='true',null,{timeout:30000}).then(()=>true,()=>false);
  if(!ready) return {ctx,page,errors,ready};
  check(await page.evaluate(()=>getComputedStyle(document.documentElement).colorScheme)==='light',`${which} ${width}px, system ${scheme}: default palette stays light`);
  // The landing page's stage button (inside a collapsed menu on phones): the same click handler either way.
  await page.$eval(`[data-stage="${which==='wing'?'wing':'metal'}"]`,b=>b.click());
  if(which==='wing') await page.waitForFunction(()=>window.WingLabUI.result()&&!window.WingLabUI.isRunning()&&document.querySelector('#stateChip').textContent==='Solved',null,{timeout:120000});
  else await metalSettled(page);
  await page.waitForTimeout(400);
  return {ctx,page,errors,ready};
}
const metalSettled=page=>page.waitForFunction(()=>window.MetalWingUI&&window.MetalWingUI.result()&&document.querySelector('#mLoading').hidden&&!['Solving','Ready'].includes(document.querySelector('#mChip').textContent),null,{timeout:120000});
// Elements that stick out of the viewport, ignoring content inside horizontal scrollers and closed disclosures.
const overflowProbe=root=>{
  const W=document.documentElement.clientWidth, bad=[];
  const scroller=el=>{for(let p=el.parentElement;p;p=p.parentElement){const s=getComputedStyle(p).overflowX;if(s==='auto'||s==='scroll'||s==='hidden')return true;}return false;};
  for(const el of document.querySelectorAll(root+' *')) {
    if(!el.getClientRects().length) continue;
    const shut=el.closest('details:not([open])');if(shut&&!el.closest('summary'))continue;
    const r=el.getBoundingClientRect();
    if(r.width>0&&(r.right>W+1||r.left<-1)&&!scroller(el)) bad.push(`${el.tagName.toLowerCase()}#${el.id}.${String(el.className.baseVal??el.className).split(' ')[0]} ${Math.round(r.left)}–${Math.round(r.right)}`);
  }
  return {doc:document.documentElement.scrollWidth,vw:W,bad:bad.slice(0,8)};
};
const inViewport=(page,sel)=>page.$eval(sel,el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&r.top>=0&&r.bottom<=window.innerHeight&&r.left>=0&&r.right<=document.documentElement.clientWidth;});
const canvasShot=async(page,sel)=>(await (await page.$(sel)).screenshot()).toString('base64');
const distance=(page,sel)=>page.$eval(sel,el=>+el.dataset.distance);
async function closePopup(page){const p=page.locator('.wing-editor-pop:visible');if(await p.count())await p.locator('.wing-editor-close').click();}
async function viewPopup(page,app,panel){
  await closePopup(page);
  if(app==='#app'){
    await page.locator(`${app} > .wing-quick-tools`).getByRole('button',{name:'View & display',exact:true}).click();
    check(await page.isVisible('#wingInlineDisplay '+panel),`${app}: real display controls are inline, not a popup`);
    check(await page.isVisible('#wingInlineDisplay #clipIn')&&await page.isVisible('#wingInlineDisplay #scaleIn'),`${app}: clip and deformation controls are directly available`);
    return;
  }
  await page.locator(`${app} > .wing-quick-tools`).getByRole('button',{name:'View & display ▾',exact:true}).click();
  check(await page.isVisible(`.wing-editor-pop ${panel}`),`${app}: View & display opens the real camera and appearance controls`);
  check(await inViewport(page,'.wing-editor-pop:visible'),`${app}: view popup fits the viewport`);
}
async function wingInputs(page){if(!await page.isVisible('#wingSide'))await page.click('#inputsBtn');check(await page.isVisible('#wingSide'),'Wing Inputs control exposes the editable inputs');}
async function workspaceLayout(page,app,side,width,tag){
  const layout=await page.evaluate(({app,side})=>{const root=document.querySelector(app),r=s=>{const b=root.querySelector(s).getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width};};return {tools:r(':scope > .wing-quick-tools'),view:r(':scope > .view'),dock:r(':scope > .dock'),side:r(side),sidePosition:getComputedStyle(root.querySelector(side)).position};},{app,side});
  check(layout.tools.bottom<=layout.view.top+1,`${tag}: model tools are above the drawing`);
  check(layout.dock.top>=layout.view.bottom-1,`${tag}: results start beneath the drawing`);
  if(width>1100){check(Math.abs(layout.side.width-320)<=2&&layout.side.right<=layout.view.left,`${tag}: 320 px input column is beside, not over, the drawing`);check(Math.abs(layout.dock.left-layout.view.left)<=1,`${tag}: drawing and results share their main-column alignment`);if(app==='#app')check(Math.abs(layout.tools.left-layout.side.left)<=1&&Math.abs(layout.tools.right-layout.view.right)<=1,`${tag}: two-row printed-wing tools span both input and drawing columns`);else check(Math.abs(layout.tools.left-layout.view.left)<=1,`${tag}: metal-wing tools align with the drawing`);}
  else check(layout.view.width>=width-48,`${tag}: one-column drawing spans the page`);
}

for(const [width,height] of [[390,844],[768,1024],[1440,900]]) for(const scheme of ['light','dark']) {
  // ---------------------------------------------------------------- printed wing
  {
    const tag=`wing ${width} ${scheme}`;
    const {ctx,page,errors,ready}=await open(width,height,scheme,'wing');
    if(!ready){notes.push(`${tag}: WebGL workspace not tested (three.js did not load; set BEAM_THREE_DIR or allow the CDN)`);await ctx.close();continue;}
    await page.screenshot({path:path.join(shots,`wing_${width}_${scheme}_top.png`)});
    let o=await page.evaluate(overflowProbe,'#app');
    check(o.doc<=o.vw,`${tag}: page scrolls horizontally (${o.doc} > ${o.vw})`);
    check(!o.bad.length,`${tag}: elements outside the viewport: ${o.bad.join('; ')}`);
    const gl=await page.$eval('#gl',c=>{const r=c.getBoundingClientRect();const g=c.getContext('webgl2')||c.getContext('webgl');return {w:r.width,h:r.height,live:!!g&&c.width>0};});
    check(gl.live&&gl.h>=300,`${tag}: live WebGL view, at least 300 px tall (${JSON.stringify(gl)})`);
    await workspaceLayout(page,'#app','#wingSide',width,tag);
    check(await page.$eval('#runBtn',b=>!!b.closest('#app > .bar'))&&await page.$eval('#stateChip',b=>!!b.closest('#app > .bar')),`${tag}: Solve and status belong to the command bar above the model`);
    if(width===1440)check(await inViewport(page,'#stateChip')&&await inViewport(page,'#runBtn'),`${tag}: Solve and status are visible above the model`);
    // Edit a structure field: the chip says Out of date (visible next to Solve), the results say they are stale.
    await wingInputs(page);await page.uncheck('#wingAutoSolve');
    if(width<=1100)check(await page.$eval('#wingSide',el=>getComputedStyle(el).position==='fixed'&&getComputedStyle(el).overflowY==='auto'&&el.scrollHeight>el.clientHeight)&&await inViewport(page,'#wingSide'),`${tag}: tablet/phone inputs open as a bounded, internally scrollable drawer`);
    await page.$eval('#wgSkin',el=>el.scrollIntoView({block:'center'}));
    await page.fill('#wgSkin','1.1');await page.press('#wgSkin','Enter');await page.waitForTimeout(150);
    check(await page.textContent('#stateChip')==='Out of date',`${tag}: edit marks the study Out of date (${await page.textContent('#stateChip')})`);
    check(await page.isVisible('#wingStale'),`${tag}: results area says it shows the last solved model`);
    await page.screenshot({path:path.join(shots,`wing_${width}_${scheme}_inputs_out_of_date.png`)});
    if(width<=1100)await page.click('#wingSide > button[aria-label="Close wing inputs"]');
    await page.$eval('#app > .bar',el=>el.scrollIntoView({block:'center'}));
    check(await inViewport(page,'#stateChip')&&await inViewport(page,'#runBtn'),`${tag}: status chip and Solve are reachable above the model after closing the input drawer`);
    await page.click('#runBtn');
    await page.waitForFunction(()=>!window.WingLabUI.isRunning()&&document.querySelector('#stateChip').textContent==='Solved'&&window.WingLabUI.result().geometry.skin===1.1,null,{timeout:120000});
    check(!(await page.isVisible('#wingStale')),`${tag}: stale banner gone after Solve`);
    // Zoom changes the camera, never the reported dimensions.
    await viewPopup(page,'#app','#wingViewPanel');
    await page.$eval('#viewReadout',el=>el.scrollIntoView({block:'center'}));
    const dims=await page.textContent('#viewDims'), d0=await distance(page,'#viewReadout'), img0=await canvasShot(page,'#gl');
    check(/semi-span 450\.0 mm, root chord 160\.0 mm, tip chord 100\.0 mm/.test(dims)&&/View zoom only/.test(dims),`${tag}: readout states the solved dimensions (${dims})`);
    await page.click('#zoomIn');await page.waitForTimeout(200);
    const d1=await distance(page,'#viewReadout');
    check(Math.abs(d1/d0-0.8)<0.02,`${tag}: Zoom in moves the camera closer (${d0.toFixed(1)} → ${d1.toFixed(1)} mm)`);
    check(await page.textContent('#viewDims')===dims,`${tag}: zoom in leaves the reported dimensions unchanged`);
    check(await canvasShot(page,'#gl')!==img0,`${tag}: the picture changes when zooming`);
    await page.click('#zoomOut');await page.click('#zoomOut');await page.waitForTimeout(200);
    const d2=await distance(page,'#viewReadout');
    check(Math.abs(d2/d0-1.25)<0.03,`${tag}: Zoom out moves it away (${d2.toFixed(1)} mm)`);
    await page.click('#zoomFit');await page.waitForTimeout(150);
    const d3=await distance(page,'#viewReadout');
    check(d3>0&&Math.abs(d3-d2)>1e-3,`${tag}: Fit re-frames the wing (${d3.toFixed(1)} mm)`);
    await page.click('#zoomReset');await page.waitForTimeout(150);
    const v=await page.evaluate(()=>window.WingLabUI.view());
    check(Math.abs(v.distance-v.resetDistance)<1e-6*v.resetDistance&&Math.abs(await distance(page,'#viewReadout')-v.resetDistance)<1e-2,`${tag}: Reset view returns to the starting distance`);
    check(await page.textContent('#viewDims')===dims&&v.solved.semiSpan===450&&v.solved.rootChord===160&&v.solved.tipChord===100,`${tag}: dimensions unchanged after zoom, Fit and Reset`);
    if(width===1440) await (await page.$('#wingViewPanel')).screenshot({path:path.join(shots,`wing_viewpanel_${scheme}.png`)});
    await closePopup(page);
    o=await page.evaluate(overflowProbe,'#app');
    check(o.doc<=o.vw&&!o.bad.length,`${tag}: overflow after editing: ${o.bad.join('; ')}`);
    check(!errors.length,`${tag}: console errors: ${errors.join(' | ')}`);
    await ctx.close();
  }
  // ---------------------------------------------------------------- D.520
  {
    const tag=`D.520 ${width} ${scheme}`;
    const {ctx,page,errors,ready}=await open(width,height,scheme,'metal');
    if(!ready){await ctx.close();continue;}
    await page.screenshot({path:path.join(shots,`d520_${width}_${scheme}_top.png`)});
    let o=await page.evaluate(overflowProbe,'#metalLab');
    check(o.doc<=o.vw,`${tag}: page scrolls horizontally (${o.doc} > ${o.vw})`);
    check(!o.bad.length,`${tag}: elements outside the viewport: ${o.bad.join('; ')}`);
    const gl=await page.$eval('#mgl',c=>{const r=c.getBoundingClientRect();const g=c.getContext('webgl2')||c.getContext('webgl');return {w:r.width,h:r.height,live:!!g&&c.width>0};});
    check(gl.live&&gl.h>=300,`${tag}: live WebGL view (${JSON.stringify(gl)})`);
    await workspaceLayout(page,'#metalApp','#mSide',width,tag);
    if(width===1440) {
      check(await inViewport(page,'#mChip')&&await inViewport(page,'#mRun'),`${tag}: Solve and status chip visible at the top of the input column`);
    } else {
      await page.$eval('#mSecParams',el=>el.scrollIntoView({block:'start'}));await page.waitForTimeout(100);
      check(await inViewport(page,'#mChip')&&await inViewport(page,'#mRun'),`${tag}: Solve and status chip visible while reading the inputs`);
    }
    // First view: see-through skin, everything structural shown, trailing edge hidden; spar labels in the view.
    const first=await page.evaluate(()=>({d:window.MetalWingView.display(),p:window.MetalWingView.parts()}));
    check(first.d.skin==='see-through'&&first.d.preset==='inside'&&first.p.trailing.visible===0&&first.p.mainSpar.visible===first.p.mainSpar.total&&first.p.ribs.visible===22,`${tag}: first view is the see-through structure (${JSON.stringify(first.d)})`);
    await page.$eval('#mView',el=>el.scrollIntoView({block:'start'}));await page.waitForTimeout(250);
    const labels=await page.$$eval('#mPartLabels .mw-label',ls=>ls.map(l=>({t:l.textContent,shown:!l.hidden&&l.getBoundingClientRect().width>0})));
    check(labels.length===2&&labels.every(l=>l.shown)&&/Main \(front\) spar · 0\.37c/.test(labels[0].t)&&/False \(rear\) spar · 0\.73c/.test(labels[1].t),`${tag}: spar labels shown in the view (${JSON.stringify(labels)})`);
    // Zoom: camera only.
    await viewPopup(page,'#metalApp','#mViewPanel');
    await page.$eval('#mViewReadout',el=>el.scrollIntoView({block:'center'}));
    const dims=await page.textContent('#mViewDims'), m0=await distance(page,'#mViewReadout');
    await page.click('#mZoomIn');await page.waitForTimeout(150);
    check(Math.abs(await distance(page,'#mViewReadout')/m0-0.8)<0.02&&await page.textContent('#mViewDims')===dims&&/half-span 5\.10 m/.test(dims),`${tag}: zoom moves the camera only (${dims})`);
    await page.click('#mZoomReset');await page.waitForTimeout(150);
    check(Math.abs(await distance(page,'#mViewReadout')-m0)<1e-3*m0,`${tag}: Reset view returns to the starting distance`);
    // Part toggles: visual only.
    if(width<=560)await page.click('#mHud > summary');
    const state=()=>page.evaluate(()=>({input:JSON.stringify(window.MetalWingUI.state.input),tip:window.MetalWingUI.result().tip.wMax,info:document.querySelector('#mPlotinfo').textContent,chip:document.querySelector('#mChip').textContent,same:window.MetalWingUI.result()===window.__r0}));
    await page.evaluate(()=>{window.__r0=window.MetalWingUI.result();});
    const s0=await state();
    for(const part of ['skin','mainSpar','falseSpar','ribs','stringers','equipment','fittings']) {
      const pictured=['skin','ribs','mainSpar'].includes(part), before=pictured?await canvasShot(page,'#mgl'):null;
      await page.$eval(`[data-mpart="${part}"]`,el=>el.scrollIntoView({block:'nearest'}));
      await page.click(`[data-mpart="${part}"]`);await page.waitForTimeout(120);
      const p=await page.evaluate(()=>window.MetalWingView.parts());
      check(p[part].total>0&&p[part].visible===0,`${tag}: hiding ${part} hides its meshes (${JSON.stringify(p[part])})`);
      check(await page.getAttribute(`[data-mpart="${part}"]`,'aria-pressed')==='false',`${tag}: ${part} toggle shows its state`);
      if(pictured) check(await canvasShot(page,'#mgl')!==before,`${tag}: the picture changes when ${part} is hidden`);
      if(part==='mainSpar'||part==='falseSpar') check(await page.$eval(`[data-mlabel="${part}"]`,l=>l.hidden),`${tag}: the ${part} label hides with its part`);
      const s=await state();
      check(s.same&&s.input===s0.input&&s.tip===s0.tip&&s.info===s0.info&&s.chip===s0.chip,`${tag}: hiding ${part} changes no input or result`);
    }
    if(width===1440) await (await page.$('#mView')).screenshot({path:path.join(shots,`d520_parts_hidden_${scheme}.png`)});
    for(const part of ['skin','mainSpar','falseSpar','ribs','stringers','equipment','fittings']) await page.click(`[data-mpart="${part}"]`);
    const back=await page.evaluate(()=>window.MetalWingView.parts());
    check(Object.entries(back).every(([k,v])=>k==='trailing'?v.visible===0:v.visible===v.total),`${tag}: toggles restore every part`);
    await page.click('[data-mskin="cutaway"]');await page.waitForTimeout(100);
    const cut=await page.evaluate(()=>window.MetalWingView.parts());
    check(cut.skin.visible===cut.skin.total-1,`${tag}: "Upper skin off" hides only the upper skin`);
    await page.click('[data-mshow="frame"]');await page.waitForTimeout(100);
    const frame=await page.evaluate(()=>window.MetalWingView.parts());
    check(frame.skin.visible===0&&frame.equipment.visible===0&&frame.ribs.visible===22&&frame.stringers.visible===frame.stringers.total,`${tag}: "Spar, ribs, stringers" quick view`);
    await page.click('[data-mshow="all"]');await page.waitForTimeout(100);
    const all=await page.evaluate(()=>window.MetalWingView.parts());
    check(Object.values(all).every(v=>v.visible===v.total),`${tag}: "Complete wing" shows every part`);
    const s1=await state();check(s1.same&&s1.input===s0.input&&s1.tip===s0.tip,`${tag}: quick views and skin modes change no result`);
    // With a load: stress, deformed and mode views keep working with parts hidden, and results do not change.
    if(width===1440&&scheme==='light') {
      await closePopup(page);await page.click('#metalApp [data-wing-action="load"]');await page.click('#mRestoreFlight');
      await page.waitForFunction(()=>window.MetalWingUI.state.input.customLoads==null&&document.querySelector('#mLoading').hidden&&document.querySelector('#mChip').textContent!=='Solving'&&window.MetalWingUI.result().input.customLoads==null&&Math.abs(window.MetalWingUI.result().tip.wMax)>0.01,null,{timeout:120000});
      await page.waitForTimeout(400);
      await closePopup(page);
      for(const plot of ['sigma','disp','buckle','mode']) {
        await page.click(`[data-mplot="${plot}"]`);await page.waitForTimeout(150);
        await page.evaluate(()=>{window.__r0=window.MetalWingUI.result();});
        const a=await state(), legend=await page.textContent('#mLegendTitle');
        await viewPopup(page,'#metalApp','#mViewPanel');
        await page.click('[data-mpart="skin"]');await page.click('[data-mpart="ribs"]');await page.waitForTimeout(150);
        const b=await state();
        check(b.same&&b.input===a.input&&b.tip===a.tip&&await page.textContent('#mLegendTitle')===legend,`${tag}: ${plot} view unchanged in substance with skin and ribs hidden`);
        if(plot==='sigma') await (await page.$('#mView')).screenshot({path:path.join(shots,'d520_stress_structure_only.png')});
        await page.click('[data-mpart="skin"]');await page.click('[data-mpart="ribs"]');
        await closePopup(page);
      }
      await page.click('[data-mplot="model"]');
    }
    await closePopup(page);
    if(width===1440||width===390) {
      await page.$eval('#mSecInventory',el=>{el.open=true;el.scrollIntoView({block:'start'});});await page.waitForTimeout(100);
      await page.screenshot({path:path.join(shots,`d520_${width}_${scheme}_inventory.png`)});
    }
    o=await page.evaluate(overflowProbe,'#metalLab');
    check(o.doc<=o.vw&&!o.bad.length,`${tag}: overflow after toggles: ${o.bad.join('; ')}`);
    check(!errors.length,`${tag}: console errors: ${errors.join(' | ')}`);
    await ctx.close();
  }
}
// Round trip: printed wing → D.520 → back keeps the printed-wing study (no reset, no loads added).
{
  const {ctx,page,errors,ready}=await open(1440,900,'light','wing');
  if(ready) {
    await wingInputs(page);
    await page.fill('#wgSpan','430');await page.press('#wgSpan','Enter');await page.click('#runBtn');
    await page.waitForFunction(()=>!window.WingLabUI.isRunning()&&window.WingLabUI.result().geometry.semiSpan===430,null,{timeout:120000});
    await page.click('#toMetalWing');await metalSettled(page);
    await page.click('#mBackWing');await page.waitForTimeout(300);
    check(await page.evaluate(()=>!document.querySelector('#app').hidden&&window.WingLabUI.result().geometry.semiSpan===430&&document.querySelector('#wgSpan').value==='430'&&window.WingLabUI.state().load.items.length===0),'returning from the D.520 keeps the printed-wing study');
    check(!errors.length,`round trip console errors: ${errors.join(' | ')}`);
  }
  await ctx.close();
}
await browser.close();
for(const n of notes) console.log('NOTE',n);
if(failures.length){console.log(failures.map(f=>'FAIL '+f).join('\n'));process.exit(1);}
console.log(`Wing workspaces in Chromium: ${checks} checks passed — printed wing and D.520 at 390/768/1440 px in light and dark (no horizontal scroll, inputs beside the desktop model/tablet drawer, tools above and results below the drawing, Solve/status chip visible, Out of date → Solved, View & display popup, zoom/Fit/Reset camera-only with unchanged dimensions, D.520 part toggles, quick views and skin modes visual-only in model, stress, displacement, buckling and mode views, spar labels, round trip). Screenshots: ${shots}`);
