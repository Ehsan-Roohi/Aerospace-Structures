// Beam Lab: the elliptic/parabolic load form and the CSV line-load table, as a user drives them
// (jsdom DOM component tests; the real-browser run is test_beam_browser.mjs / test_v5_browser.mjs).
// Covers: entry by total force F or peak w₀ with conversion and live law, edit, refusal of bad input with the
// study unchanged; CSV template, malformed tables refused atomically, preview before apply, add / replace / edit,
// the 12-load and 30-segment limits, stale-preview guard, file upload with SHA-256 and a hostile file name,
// and persistence of both kinds in saved studies, share links, A/B, plot images, the report and the stale guard.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {webcrypto,createHash} from 'node:crypto';
import {JSDOM,loadBeamLab} from './beam_test_dom.mjs';
const require=createRequire(import.meta.url), B=require('./beam_learning_engine.js'), Study=require('./beam_study.js'), LP=require('./load_profiles.js');
let checks=0;
const ok=(v,m)=>{assert.ok(v,m);checks++;};
const eq=(a,b,m)=>{assert.equal(a,b,m);checks++;};
const near=(a,b,rel,m,abs=0)=>{assert.ok(Math.abs(a-b)<=rel*Math.abs(b)+abs,`${m}: ${a} vs ${b}`);checks++;};
const tick=(ms=30)=>new Promise(r=>setTimeout(r,ms));

function open(query='') {
  const dom=new JSDOM('<div id="foundations"></div>',{url:`https://example.org/wing-lab.html${query}`,runScripts:'outside-only'});
  const w=dom.window, downloads=[];
  w.Blob=Blob;w.URL.createObjectURL=b=>{downloads.push(b);return 'blob:test';};w.URL.revokeObjectURL=()=>{};
  w.HTMLAnchorElement.prototype.click=function(){downloads.at(-1).name=this.download;};
  w.print=()=>{w.printed=(w.printed||0)+1;};
  Object.defineProperty(w,'crypto',{value:webcrypto,configurable:true});w.TextEncoder=TextEncoder;   // SHA-256 of a chosen file
  const env=loadBeamLab(dom), $=env.$;
  const set=(id,v)=>{$('#'+id).value=String(v);};
  return {...env,dom,downloads,set,
    kind:k=>{$('#beamLoadKind').value=k;$('#beamLoadKind').dispatchEvent(new w.Event('change'));},
    typed:()=>$('#beamLoadForm').dispatchEvent(new w.Event('input',{bubbles:true})),
    submit:()=>$('#beamLoadForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true})),
    basis:v=>{$('#beamCurveBasis').value=v;$('#beamCurveBasis').dispatchEvent(new w.Event('change'));},
    csv:text=>{$('#beamCsvText').value=text;$('#beamCsvText').dispatchEvent(new w.Event('input',{bubbles:true}));$('#beamCsvPreview').click();},
    mode:m=>{const r=$(`#beamCsvMode input[value="${m}"]`);r.checked=true;r.dispatchEvent(new w.Event('change',{bubbles:true}));},
    upload:async(name,text,size)=>{const input=$('#beamCsvFile');Object.defineProperty(input,'files',{value:[{name,size:size??Buffer.byteLength(text),text:async()=>text}],configurable:true});
      input.dispatchEvent(new w.Event('change'));await tick(60);}};
}
const lab=w=>w.BeamLab.state();
const loadsJson=w=>JSON.stringify(lab(w).model.loads);
const solvedJson=w=>JSON.stringify(lab(w).solved.model.loads);
const clean=html=>!/NaN|undefined|Infinity/.test(html);
// text of a plot image with its wrapped lines rejoined
const imgText=(w,key)=>[...new w.DOMParser().parseFromString(w.BeamLab.plotImage(key).svg,'image/svg+xml').querySelectorAll('text')].map(x=>x.textContent).join(' ');
const L=450, EI=2000*20*10**3/12;

/* ---------- 1. elliptic and parabolic loads through the form ---------- */
let t=open(), {$,$$,w}=t;
{
  t.kind('elliptic');
  ok(!$('#beamCurveShapeField').hidden&&!$('#beamCurveBasisField').hidden&&!$('#beamCurveValueField').hidden&&$('#beamQ0Field').hidden&&$('#beamPField').hidden,'curved kind: shape, basis and value fields only');
  eq($('#beamCurveShape').value,'start','default: maximum at the start');eq($('#beamCurveBasis').value,'total','default: enter the total force');
  ok(/Total force F \(\+ down\)/.test($('#beamCurveValueLabel').textContent)&&$('#beamCurveValueField').querySelector('.bl-unit').textContent==='N','value labelled F in N');
  const law0=$('#beamCurveLaw').textContent;ok(/w\(x\)/.test(law0)&&/π/.test(law0)&&/not split into straight segments/.test(law0),'law shown before any value');
  t.set('beamLoadA',0);t.set('beamLoadB',L);t.set('beamCurveValue',2);t.typed();
  const law=$('#beamCurveLaw').textContent;
  ok(law.includes(`w₀ = ${String(Number((8/(Math.PI*L)).toPrecision(6)))} N/mm`),'live law: w₀ = 4F/(πℓ)');
  ok(law.includes(`x̄ = ${String(Number((4*L/(3*Math.PI)).toPrecision(6)))} mm`),'live law: resultant at 4ℓ/(3π)');
  ok(law.includes(`${String(Number((2*4*L/(3*Math.PI)).toPrecision(6)))} N·mm`),'live law: root moment 4FL/(3π)');
  // F ↔ w₀: the same load, converted; switching back restores exactly what was typed
  t.basis('peak');eq($('#beamCurveValue').value,String(Number((8/(Math.PI*L)).toPrecision(12))),'switch to w₀ converts the value');
  ok(/Peak intensity w₀/.test($('#beamCurveValueLabel').textContent)&&$('#beamCurveValueField').querySelector('.bl-unit').textContent==='N/mm','value relabelled w₀ in N/mm');
  t.basis('total');eq($('#beamCurveValue').value,'2','switch back restores the typed F exactly');
  t.submit();
  eq(loadsJson(w),JSON.stringify([{kind:'elliptic',start:0,end:L,shape:'start',total:2}]),'stored exactly as entered (basis total, no derived peak)');
  eq($('#beamChip').textContent,'Solved','solved after Add');
  const r=lab(w).solved.result, R=r.reactions[0];
  near(Math.abs(R.force),2,1e-9,'cantilever: |R| = F (FE reaction, round-off only)');near(Math.abs(R.moment),2*4*L/(3*Math.PI),1e-9,'|C| = 4FL/(3π)');
  near(r.deflection.at(-1),(1/8-4/(45*Math.PI))*2*L**3/EI,1e-9,'tip deflection (1/8 − 4/(45π)) F L³/EI');
  ok($('#beamPicture [data-load-kind="elliptic"]'),'curve envelope drawn');ok(/F = 2 N ↓/.test($('#beamPicture').textContent)&&/w₀ =/.test($('#beamPicture').textContent),'picture labels F and w₀');
  ok(clean($('#beamPicture').innerHTML),'clean picture');
  eq($('#beamLoads .bl-tag').textContent,'ell','list tag');ok(/elliptic \(max at start\) over 0–450 mm: F = 2 N \(w₀ = 0\.00565884 N\/mm\)/.test($('#beamLoads').textContent),'list text');
  // edit: the form is refilled with exactly the stored values; reverse the orientation
  $('[data-edit-load="0"]').click();
  eq($('#beamLoadKind').value,'elliptic');eq($('#beamLoadA').value,'0');eq($('#beamLoadB').value,String(L));eq($('#beamCurveShape').value,'start');eq($('#beamCurveBasis').value,'total');eq($('#beamCurveValue').value,'2');
  ok(/Update load 1/.test($('#beamLoadSubmit').textContent),'editing load 1');
  $('#beamCurveShape').value='end';$('#beamCurveShape').dispatchEvent(new w.Event('change'));t.submit();
  eq(lab(w).solved.model.loads[0].shape,'end','orientation reversed');near(Math.abs(lab(w).solved.result.reactions[0].moment),2*(L-4*L/(3*Math.PI)),1e-9,'reversed: |C| = F(L − 4L/(3π))');
  // a parabolic load entered by its peak intensity
  t.kind('parabolic');$('#beamCurveShape').value='middle';t.basis('peak');t.set('beamLoadA',100);t.set('beamLoadB',400);t.set('beamCurveValue',0.004);t.typed();
  ok($('#beamCurveLaw').textContent.includes('F = 0.8 N'),'live law: F = (2/3) w₀ ℓ');ok($('#beamCurveLaw').textContent.includes('x̄ = 250 mm'),'symmetric: x̄ at mid-load');
  t.submit();
  eq(JSON.stringify(lab(w).solved.model.loads[1]),JSON.stringify({kind:'parabolic',start:100,end:400,shape:'middle',peak:0.004}),'stored by its peak');
  near(Math.abs(lab(w).solved.result.reactions[0].force),2.8,1e-9,'|R| = 2 + 0.8 N');eq($$('#beamLoads .bl-tag')[1].textContent,'par');
  // bad input is refused and changes nothing
  const before=solvedJson(w);
  for(const [a,b,v,msg] of [[300,300,1,/start < end/],[200,100,1,/start < end/],[0,500,1,/0 to 450 mm/],[-1,100,1,/0 to 450 mm/],[0,100,'',/must be a number/],[0,100,'1e400',/must be a number/],[0,100,'abc',/must be a number/]]) {
    t.kind('elliptic');t.set('beamLoadA',a);t.set('beamLoadB',b);t.set('beamCurveValue',v);t.submit();
    ok(!$('#beamLoadError').hidden&&msg.test($('#beamLoadError').textContent),`refused (${a}, ${b}, ${v}): ${$('#beamLoadError').textContent}`);
    eq(solvedJson(w),before,'study unchanged');eq(loadsJson(w),before,'draft loads unchanged');
  }
  // persistence: saved study (version 3, entered basis only), re-import, share link, plot image, report
  $('[data-tab="report"]').click();$('#beamDownload').click();
  const saved=JSON.parse(await t.downloads.at(-1).text());
  eq(saved.version,3,'a study with curved loads is saved as version 3');eq(JSON.stringify(saved.model.loads),before,'loads saved exactly');
  const img=imgText(w,'moment');
  ok(img.includes('elliptic (maximum at the end) F = 2 N on 0–450 mm')&&img.includes('parabolic (symmetric, maximum in the middle) w₀ = 0.004 N/mm on 100–400 mm'),'plot image load line names both curves');
  $('#beamPrintBtn').click();const rep=$('#beamPrint').textContent;
  ok(/elliptic/.test(rep)&&/parabolic/.test(rep),'report lists the curved loads');w.dispatchEvent(new w.Event('afterprint'));
  $('#beamShare').click();await tick();
  const link=$('#beamShareBox').value, shared=Study.decodeShare(new URL(link).searchParams.get('beam'));
  eq(JSON.stringify(shared.loads),before,'share link carries the curves exactly');
  const t2=open(new URL(link).search);
  eq(solvedJson(t2.w),before,'link reopens the same loads');near(t2.w.BeamLab.state().solved.result.deflection.at(-1),lab(w).solved.result.deflection.at(-1),1e-14,'…and the same deflection');t2.dom.window.close();
  const t3=open();ok(t3.w.BeamLab.importText(JSON.stringify(saved)),'saved study re-imports');eq(solvedJson(t3.w),before);t3.dom.window.close();
  // a study with only linear loads stays version 2 (readable by v4)
  const t4=open();t4.kind('point');t4.set('beamLoadA',300);t4.set('beamP',1);t4.submit();t4.$('[data-tab="report"]').click();t4.$('#beamDownload').click();
  eq(JSON.parse(await t4.downloads.at(-1).text()).version,2,'linear-only study still version 2');t4.dom.window.close();
}

/* ---------- 2. CSV line-load table ---------- */
{
  // template
  $('#beamCsvBox').open=true;$('#beamCsvTemplate').click();
  const tpl=t.downloads.at(-1);eq(tpl.name,'beam_line_load_template.csv');
  const tplText=await tpl.text(), tplRes=LP.parseCsv(tplText,{workspace:'beam',min:0,max:L,ref:0});
  ok(tplRes.ok&&/x_mm,w_N_per_mm/.test(tplText)&&/#/.test(tplText),'template has the unit header, comments, and parses');
  // malformed tables: refused with reasons, Apply stays disabled, nothing changes
  const before=solvedJson(w);
  const bad=[
    ['duplicate x','x_mm,w_N_per_mm\n0,0.002\n0,0.003\n450,0'],['decreasing x','x_mm,w_N_per_mm\n0,0.002\n300,0.001\n200,0'],
    ['NaN','x_mm,w_N_per_mm\n0,NaN\n450,0'],['Infinity','x_mm,w_N_per_mm\n0,Infinity\n450,0'],['overflow','x_mm,w_N_per_mm\n0,1e999\n450,0'],
    ['semicolons','x_mm;w_N_per_mm\n0;0.002\n450;0'],['wrong units','x_m,w_N_per_m\n0,2\n0.45,0'],['missing header','0,0.002\n450,0'],
    ['outside the beam','x_mm,w_N_per_mm\n0,0.002\n500,0'],['one row','x_mm,w_N_per_mm\n0,0.002'],
    ['32 rows',`x_mm,w_N_per_mm\n${Array.from({length:32},(_,i)=>`${i*14},0.001`).join('\n')}`],
    ['chord fraction on a beam','x_mm,w_N_per_mm,x_over_c\n0,0.002,0.25\n450,0,0.25'],['extra column','x_mm,w_N_per_mm\n0,0.002,7\n450,0'],
    ['formula','x_mm,w_N_per_mm\n0,=1+1\n450,0'],['script','x_mm,w_N_per_mm\n0,<script>window.pwned=1</script>\n450,0'],['hex','x_mm,w_N_per_mm\n0,0x10\n450,0'],
    ['empty',''],
  ];
  for(const [name,text] of bad) {
    t.csv(text);
    ok(/Not imported/.test($('#beamCsvResult').textContent)&&/Your loads are unchanged/.test($('#beamCsvResult').textContent),`${name}: refused with reasons`);
    eq($('#beamCsvApply').disabled,true,`${name}: Apply disabled`);eq($('#beamCsvMode').hidden,true,`${name}: no apply choice`);
    $('#beamCsvApply').onclick();eq(solvedJson(w),before,`${name}: forcing Apply changes nothing`);eq(loadsJson(w),before);
    eq($('#beamCsvResult').querySelectorAll('script,img').length,0,`${name}: message escaped`);
  }
  eq(w.pwned,undefined,'nothing executed');
  // a valid table (comment line, CRLF): preview first, nothing changes until Apply
  const good='x_mm,w_N_per_mm\r\n# my table\r\n0,0.004\r\n150,0.002\r\n450,0\r\n';
  t.csv(good);
  const pv=$('#beamCsvResult').textContent;
  ok(/Preview: 3 rows, 2 linear segments/.test(pv)&&/pasted table/.test(pv),'preview: rows and segments');
  const F=0.003*150+0.001*300, Mo=0.004*150**2/2-(0.002/150)*150**3/3+0.5*0.002*300*(150+300/3);   // ∫w and ∫x w by hand: falling ramp on 0–150, triangle on 150–450
  near(F,0.75,1e-15,'hand total');near(Mo,105,1e-15,'hand first moment');ok(pv.includes('0.75 N (↓)'),'preview: total F');ok(pv.includes(`${String(Number((Mo/F).toPrecision(6)))} mm`),'preview: centroid');
  ok(pv.includes(`${String(Number(Mo.toPrecision(6)))} N·mm`),'preview: moment about x = 0');ok($('#beamCsvResult svg'),'preview plot');
  eq(solvedJson(w),before,'preview changes nothing');eq($('#beamCsvApply').disabled,false,'Apply enabled');eq($('#beamCsvMode').hidden,false,'add/replace choice shown');
  // text edited after the preview: Apply re-previews instead of applying a table the user has not seen
  $('#beamCsvText').value=good.replace('0.002','0.003');$('#beamCsvText').dispatchEvent(new w.Event('input',{bubbles:true}));
  eq($('#beamCsvApply').disabled,true,'edited text disables Apply');$('#beamCsvApply').onclick();eq(solvedJson(w),before,'stale preview never applied');
  ok(/0\.975 N/.test($('#beamCsvResult').textContent),'…the new table is previewed instead (F = 0.975 N)');
  t.csv(good);$('#beamCsvApply').click();
  const after=lab(w).solved.model.loads;eq(after.length,3,'added to the two curves');
  eq(JSON.stringify(after[2]),JSON.stringify({kind:'table',points:[[0,0.004],[150,0.002],[450,0]],source:{filename:'pasted table',rows:3}}),'table stored with its rows and source');
  ok(/Line-load table applied \(3 rows, added to the current loads\)/.test($('#beamStatus').textContent),'status says what happened');
  eq($('#beamCsvBox').open,false,'box closed');eq($('#beamCsvText').value,'','text cleared');
  near(Math.abs(lab(w).solved.result.reactions[0].force),2.8+0.75,1e-9,'|R| includes the table');
  eq($$('#beamLoads .bl-tag')[2].textContent,'CSV');ok(/table of 3 rows over 0–450 mm, linear between rows: F = 0\.75 N/.test($('#beamLoads').textContent),'list text');
  ok($('#beamPicture [data-load-kind="table"]'),'table drawn on the beam');ok(clean($('#beamPicture').innerHTML));
  // replace mode
  const three=solvedJson(w);
  t.csv(good);t.mode('replace');ok(/Choose how to apply/.test($('#beamCsvResult').textContent));$('#beamCsvApply').click();
  eq(lab(w).solved.model.loads.length,1,'replace: only the table remains');near(Math.abs(lab(w).solved.result.reactions[0].force),0.75,1e-9,'replace: |R| = 0.75 N');
  ok(/all previous loads replaced/.test($('#beamStatus').textContent));eq($('#beamCsvMode input[value="add"]').checked,true,'Replace is not remembered for the next table');
  // exact cantilever response to the table against the engine run independently
  const ref=B.solve({...lab(w).solved.model});near(lab(w).solved.result.deflection.at(-1),ref.deflection.at(-1),1e-14,'UI result = engine result');
  // restore the three loads through import, then exercise the limits
  ok(w.BeamLab.importText(Study.exportStudy({result:B.solve({...lab(w).solved.model,loads:JSON.parse(three)})})),'three loads back');
  // 30-segment limit: a 31-row table (30 segments) cannot be added to other loads; it can replace them
  const t31=`x_mm,w_N_per_mm\n${Array.from({length:31},(_,i)=>`${i*15},${(0.001*(1+i%3)).toFixed(3)}`).join('\n')}`;
  t.csv(t31);ok(/Cannot apply: Use at most 30 load segments/.test($('#beamCsvResult').textContent),'31-row table + 3 loads: segment limit');
  eq($('#beamCsvApply').disabled,true);eq(solvedJson(w),three,'nothing changed');
  t.mode('replace');eq($('#beamCsvApply').disabled,false,'replace: a single 31-row table is allowed');ok(/31 rows, 30 linear segments/.test($('#beamCsvResult').textContent));
  $('#beamCsvCancel').click();eq(solvedJson(w),three,'Cancel changes nothing');eq($('#beamCsvBox').open,false);
  // 12-load limit
  const twelve=Array.from({length:12},(_,i)=>({kind:'point',position:30*(i+1),force:0.1}));
  ok(w.BeamLab.importText(Study.exportStudy({result:B.solve({...lab(w).solved.model,loads:twelve})})),'12 point loads');
  t.csv(good);ok(/This would make 13 loads; the limit is 12/.test($('#beamCsvResult').textContent),'load limit');eq($('#beamCsvApply').disabled,true);
  t.mode('replace');eq($('#beamCsvApply').disabled,false,'replace is allowed');$('#beamCsvCancel').click();
  ok(w.BeamLab.importText(Study.exportStudy({result:B.solve({...lab(w).solved.model,loads:JSON.parse(three)})})),'three loads back');
  // file upload: SHA-256 of the exact bytes, a hostile file name shown as text only
  const hostile='<img src=x onerror="window.pwned=1">loads.csv', hash=createHash('sha256').update(good).digest('hex');
  await t.upload(hostile,good);
  ok($('#beamCsvResult').textContent.includes(hostile),'file name shown as text');eq($('#beamCsvResult').querySelectorAll('img,script').length,0,'file name not interpreted as HTML');
  ok($('#beamCsvResult').textContent.includes(`SHA-256 ${hash.slice(0,12)}`),'SHA-256 of the file');eq($('#beamCsvText').value,good.replace(/\r\n/g,'\n'),'file text shown for review (line breaks as the text area shows them)');
  $('#beamCsvApply').click();
  const up=lab(w).solved.model.loads.at(-1);eq(up.source.filename,hostile);eq(up.source.sha256,hash);eq(up.source.rows,3);
  eq($('#beamLoads').querySelectorAll('img').length,0,'load list escapes the name');ok($('#beamLoads').textContent.includes(hostile));eq(w.pwned,undefined);
  // too-large file and a file edited after choosing it
  const four=solvedJson(w);
  await t.upload('big.csv',good,LP.LIMITS.csvBytes+1);ok(/larger than 20 kB/.test($('#beamCsvResult').textContent),'oversized file refused');eq(solvedJson(w),four);
  await t.upload('mine.csv',good);t.csv(good.replace('450,0','450,0.001'));ok(/pasted table/.test($('#beamCsvResult').textContent)&&!/SHA-256/.test($('#beamCsvResult').textContent),'edited text is no longer the file: name and hash dropped');
  $('#beamCsvCancel').click();
  // edit an existing table in place: only that load changes; unchanged text keeps its source
  const idx=lab(w).solved.model.loads.length-1;
  $(`[data-edit-load="${idx}"]`).click();
  eq($('#beamCsvBox').open,true,'Edit opens the table editor');ok($('#beamCsvText').value.startsWith('x_mm,w_N_per_mm\n0,0.004\n150,0.002\n450,0'),'table text refilled');
  ok($$('#beamCsvMode input').every(i=>i.disabled)&&$('#beamCsvMode').hidden,'no add/replace choice while editing');ok(/replaces table load 4 only/.test($('#beamCsvResult').textContent));
  $('#beamCsvApply').click();assert.deepStrictEqual(JSON.parse(JSON.stringify(lab(w).solved.model.loads.at(-1).source)),{filename:hostile,rows:3,sha256:hash},'unchanged edit keeps the file name and hash');checks++;
  $(`[data-edit-load="${idx}"]`).click();t.csv('x_mm,w_N_per_mm\n0,0.005\n450,0\n');$('#beamCsvApply').click();
  const ed=lab(w).solved.model.loads;eq(ed.length,4,'still four loads');eq(JSON.stringify(ed[idx].points),'[[0,0.005],[450,0]]','table replaced in place');eq(ed[idx].source.filename,'pasted table');
  eq(JSON.stringify(ed.slice(0,3)),JSON.stringify(JSON.parse(four).slice(0,3)),'other loads untouched');ok(/table updated/.test($('#beamStatus').textContent));
  // bounds follow the length being typed: a shorter draft beam refuses a table that no longer fits
  const solvedBefore=solvedJson(w);
  t.set('beamCsvText','');$('#beamGeometry [name="length"]').value='400';$('#beamGeometry [name="length"]').dispatchEvent(new w.Event('input',{bubbles:true}));
  eq($('#beamDownload').disabled,true,'edited geometry: exports disabled (stale guard)');
  t.csv(good);ok(/Not imported/.test($('#beamCsvResult').textContent)&&/400/.test($('#beamCsvResult').textContent),'table checked against the length being typed');
  $('#beamCsvCancel').click();$('#beamRevert').click();eq($('#beamDownload').disabled,false,'reverted: exports enabled');eq(solvedJson(w),solvedBefore);
  // persistence of the table: saved study, share link, A/B, plot image, report
  $('[data-tab="report"]').click();$('#beamDownload').click();
  const doc=JSON.parse(await t.downloads.at(-1).text());eq(doc.version,3);eq(JSON.stringify(doc.model.loads),solvedBefore,'saved study has every load and table source');
  const t5=open();ok(t5.w.BeamLab.importText(JSON.stringify(doc)),'re-import');eq(solvedJson(t5.w),solvedBefore);
  ok(t5.w.BeamLab.state().solved.result.deflection.every((v,i)=>Math.abs(v-lab(w).solved.result.deflection[i])<=1e-14*Math.abs(v)+1e-18),'same deflection after re-import');
  eq(t5.$('#foundations').querySelectorAll('img[onerror],script').length,0,'re-imported name stays text');t5.dom.window.close();
  // a tampered study (bad hash, non-finite row, too many rows) is refused and changes nothing
  for(const bad2 of [{...doc.model.loads[3],source:{filename:'x',sha256:'zz'}},{...doc.model.loads[3],points:[[0,1],[450,null]]},{kind:'table',points:Array.from({length:32},(_,i)=>[i*14,0.001])}]) {
    const tampered={...doc,model:{...doc.model,loads:[...doc.model.loads.slice(0,3),bad2]}};const r0=w.BeamLab.importText(JSON.stringify(tampered));
    if(bad2.source&&bad2.source.sha256==='zz') {ok(r0&&lab(w).solved.model.loads[3].source.sha256===undefined,'malformed hash dropped, table kept');w.BeamLab.importText(JSON.stringify(doc));}
    else {ok(!r0,'tampered table refused');eq(solvedJson(w),solvedBefore,'study unchanged');}
  }
  ok(imgText(w,'shear').includes(`table of 2 rows (linear between rows) on 0–450 mm from pasted table`),'plot image names the table');
  $('#beamPrintBtn').click();ok(/table of 2 rows/.test($('#beamPrint').textContent),'report lists the table');w.dispatchEvent(new w.Event('afterprint'));
  $('#beamShare').click();await tick();
  const link=$('#beamShareBox').value;eq(JSON.stringify(Study.decodeShare(new URL(link).searchParams.get('beam')).loads),solvedBefore,'share link carries the table');
  $('[data-tab="compare"]').click();$('#beamSaveA').click();
  t.csv(good);t.mode('replace');$('#beamCsvApply').click();$('#beamSaveB').click();
  ok(/The loads differ/.test($('#beamCompare').textContent),'A/B: loads differ');eq(JSON.stringify(lab(w).compare.A.model.loads),solvedBefore,'A keeps its tables and curves');
  eq(lab(w).compare.B.model.loads[0].kind,'table');
  $('[data-tab="report"]').click();$('#beamDownload').click();const withAB=JSON.parse(await t.downloads.at(-1).text());
  eq(withAB.version,3);eq(JSON.stringify(withAB.compare.A.model.loads),solvedBefore,'A/B saved with the study');
  for(const tab of ['diagrams','cut','solution','modes','compare','report','learn']) {$(`[data-tab="${tab}"]`).click();ok(clean($('#foundations').innerHTML),`clean ${tab} tab with a table load`);}
}
t.dom.window.close();
console.log(`Beam curved and CSV loads (UI): ${checks} DOM checks passed (elliptic/parabolic entry by F or w₀ with live law and conversion, edit, refusals; CSV template, ${17} malformed tables refused atomically, preview-before-apply, stale preview, add/replace/edit, 12-load and 30-segment limits, file SHA-256 and hostile name, length-dependent bounds, stale guard, study/link/A-B/plot image/report persistence).`);
