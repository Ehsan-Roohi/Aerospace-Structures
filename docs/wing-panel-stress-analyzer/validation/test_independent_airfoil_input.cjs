// Real independent 2D solve through the UI controller. The canvas is a no-op
// presentation stub; airfoil geometry, DAT parsing and panel equations are real.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const app=path.resolve(__dirname,'..'),repo=path.resolve(app,'../..');
const {JSDOM}=require(process.env.MIE446_JSDOM_MODULE||path.join(repo,'.review-js/node_modules/jsdom'));
const dom=new JSDOM('<main id="view"><div id="loading"></div></main><section id="strip"><button data-plot="model"></button><select id="wingMoreResults"></select></section>',{runScripts:'outside-only',url:'https://example.test/'}),w=dom.window,d=w.document;
const read=f=>fs.readFileSync(path.join(app,f),'utf8');
w.eval(read('wing-aero/aero_bundle.js')+'\nwindow.WingAirfoils=WingAirfoils;window.WingGeometry=WingGeometry;window.WingAeroPanel=WingAeroPanel;');
w.eval(read('ui/wx-aero-results.js'));
w.requestAnimationFrame=f=>{setTimeout(f,0);return 1;};w.cancelAnimationFrame=()=>{};
const drawing=new Proxy({measureText:s=>({width:String(s).length*7})},{get:(o,k)=>k in o?o[k]:(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
w.HTMLCanvasElement.prototype.getContext=()=>drawing;
w.Blob=class{constructor(parts,opts){this.text=parts.join('');this.type=opts.type;}};
let lastBlob=null;
w.URL.createObjectURL=b=>(lastBlob=b,'blob:test');w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};
const el=(tag,attrs={},...kids)=>{const e=d.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(v==null||v===false)continue;if(k==='text')e.textContent=v;else if(k==='html')e.innerHTML=v;else e.setAttribute(k,v===true?'':v);}for(const n of kids)if(n!=null)e.append(n);return e;};
const g={naca:'0012',semiSpan:450,rootChord:160,tipChord:100,skin:1.2,ribThickness:1.6,modules:1},model={geometry:g,aeroLoad:{label:'Unchanged wing load',Fx:42},structure:{spars:[.25,.65]}};
const original=JSON.stringify(model),aeroState={status:'none'};
const r=w.WingAeroStructResults.install({el,ui:{state:()=>model},strip:d.getElementById('strip'),view:d.getElementById('view'),state:()=>aeroState,openAero:()=>{throw Error('2D must not trigger a wing solver');}});
d.body.append(r.selector,r.csvButton,r.pngButton);
const $=id=>d.getElementById(id),change=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new w.Event('change'));},wait=async()=>{for(let i=0;i<100&&$('wxFoilSolve').disabled;i++)await new Promise(r=>setTimeout(r,10));};
async function solve(){assert.ok(!$('wxFoilSolve').disabled);$('wxFoilSolve').click();await wait();assert.equal($('wxArCanvas').hidden,false,$('wxArNotice').textContent);r.csvButton.click();return lastBlob.text;}
const report={checks:[]},pass=name=>report.checks.push(name);
(async()=>{
 r.show('foil2d');assert.equal($('wxFoilMode').value,'independent');assert.equal($('wxFoilWing').hidden,true);pass('Independent geometry is directly available without a wing solve');
 assert.equal($('wxFoilN').type,'number');change('wxFoilN','81');await solve();change('wxFoilN','240');await solve();pass('User-entered odd and refined counts run through the actual independent airfoil controller');
 change('wxFoilN','');$('wxFoilSolve').click();await wait();assert.equal(r.csvButton.disabled,true);assert.match($('wxArNotice').textContent,/integer/);pass('Blank panel count is rejected and cannot export a stale solution');
 change('wxFoilN','40');const c2412=await solve();assert.match($('wxArTitle').textContent,/NACA 2412.*4°.*independent geometry/);assert.match(c2412,/geometry source independent; airfoil NACA 2412/);pass('NACA independent solve labels geometry, angle and CSV provenance');
 $('wxFoilCode').value='0012';$('wxFoilCode').dispatchEvent(new w.Event('input'));assert.equal($('wxArCanvas').hidden,true);const c0012=await solve();assert.notEqual(c2412,c0012);pass('Changing NACA invalidates and changes the actual 2D pressure solution');
 change('wxFoilLibrary','clarky');const library=await solve();assert.match(library,/Clark/i);pass('Curated coordinate airfoil uses the real library and solver');
 change('wxFoilLibrary','naca');$('wxFoilCode').value='23012';const five=await solve();assert.match(five,/NACA 23012/);pass('Five-digit NACA airfoil is available independently');
 $('wxFoilCode').value='bad';$('wxFoilSolve').click();await wait();assert.equal($('wxArCanvas').hidden,true);assert.equal(r.csvButton.disabled,true);pass('Invalid airfoil code cannot export a stale solution');
 const profile=w.WingAirfoils.surfaces({kind:'naca4',code:'4415'},1,0,81),rows=['Uploaded 4415'];for(let i=80;i>=0;i--)rows.push(`${profile.xu[i]} ${profile.zu[i]}`);for(let i=1;i<=80;i++)rows.push(`${profile.xl[i]} ${profile.zl[i]}`);
 Object.defineProperty($('wxFoilDat'),'files',{configurable:true,value:[{name:'custom.dat',size:rows.join('\n').length,text:async()=>rows.join('\n')}]});$('wxFoilDat').dispatchEvent(new w.Event('change'));await wait();const uploaded=await solve();assert.match(uploaded,/Uploaded 4415/);pass('DAT upload is parsed and solved with its own independent profile');
 change('wxFoilLibrary','naca');change('wxFoilLibrary','uploaded');const restored=await solve();assert.equal(restored,uploaded);pass('Uploaded airfoil survives switching to another family and back');
 let releaseRead;Object.defineProperty($('wxFoilDat'),'files',{configurable:true,value:[{name:'late.dat',size:100,text:()=>new Promise(r=>releaseRead=r)}]});$('wxFoilDat').dispatchEvent(new w.Event('change'));assert.equal($('wxFoilSolve').disabled,true);change('wxFoilLibrary','clarky');assert.equal($('wxFoilSolve').disabled,false);releaseRead(rows.join('\n'));await new Promise(r=>setTimeout(r,5));assert.equal($('wxFoilLibrary').value,'clarky');pass('Late DAT read cannot replace a newer airfoil choice or leave Solve disabled');
 await solve();Object.defineProperty($('wxFoilDat'),'files',{configurable:true,value:[{name:'bad.dat',size:12,text:async()=>'not a valid airfoil'}]});$('wxFoilDat').dispatchEvent(new w.Event('change'));await wait();assert.ok($('wxFoilError').textContent.length>0);assert.equal(r.csvButton.disabled,true);pass('Failed DAT import has a visible error and withholds stale export');
 change('wxFoilLibrary','uploaded');await solve();
 assert.equal(JSON.stringify(model),original);assert.equal(aeroState.status,'none');pass('All independent selections, solves and imports leave wing/load/structural/3D state unchanged');
 g.semiSpan=900;r.refresh();assert.equal($('wxArCanvas').hidden,false);assert.equal(r.csvButton.disabled,false);pass('Wing-only edits do not stale an independent airfoil solution');
 change('wxFoilMode','wing');assert.equal($('wxFoilIndependent').hidden,true);assert.equal($('wxFoilWing').hidden,false);const section=await solve();assert.match(section,/geometry source wing/);assert.match($('wxArTitle').textContent,/wing section/);pass('Existing section-from-wing workflow remains separate and labelled');
 g.naca='2412';r.refresh();assert.equal($('wxArCanvas').hidden,true);pass('Wing section result invalidates when its parent geometry changes');
 w.dispatchEvent(new w.CustomEvent('wing-open-2d-section',{detail:{y:225}}));assert.equal($('wxFoilMode').value,'wing');assert.equal(+$('wxFoilEta').value,.25);pass('Rib shortcut explicitly selects wing-section mode');
 change('wxFoilMode','independent');change('wxFoilLibrary','naca');$('wxFoilCode').value='0012';await solve();const beforeKey=r.csvButton.disabled;g.naca='0015';r.refresh();assert.equal(r.csvButton.disabled,beforeKey);pass('Independent result is not coupled to the last selected wing station');
 report.count=report.checks.length;report.numericalEquationsChanged=false;report.test='Real NACA/library/DAT geometry and existing linear-vortex solver, with a no-op canvas only';
 fs.writeFileSync(path.join(__dirname,'INDEPENDENT_AIRFOIL_INPUT_REVIEW.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));dom.window.close();
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1;});
