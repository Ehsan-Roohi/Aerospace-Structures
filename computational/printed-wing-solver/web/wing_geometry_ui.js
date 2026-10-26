/* Station airfoils and aircraft geometry editor. Changes are atomic and use the host's geometry validator. */
const WingGeometryUI=(()=>{
 'use strict';
 function mount(container,{getGeometry,applyGeometry,onApplied=()=>{},documentRef=container.ownerDocument}){
  const doc=documentRef,win=doc.defaultView,G=typeof WingGeometry!=='undefined'?WingGeometry:require('./wing_geometry.js'),A=typeof WingAirfoils!=='undefined'?WingAirfoils:require('./wing_airfoils.js');
  const clone=x=>JSON.parse(JSON.stringify(x)),esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const node=(tag,attrs={},html)=>{const n=doc.createElement(tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(html!=null)n.innerHTML=html;return n;};
  let draft,generation=0,dimensionSource='tip';
  const activeReads=new Map();
  function cancelPickerRead(id){
   const pending=activeReads.get(id);if(!pending)return;
   activeReads.delete(id);pending.cancel?.();
   try{pending.reader?.abort();}catch{/* Generation/identity guards also protect embedded readers without abort support. */}
  }
  function cancelReads(){generation++;for(const id of activeReads.keys())cancelPickerRead(id);}
  const profileValidators=new Map();
  const form=node('form',{class:'wing-geometry-form'});
  const notice=node('p',{role:'status',class:'note',id:'wingGeometryEditorStatus',tabindex:'-1'});
  container.append(form,notice);
  const name=p=>p.name||('NACA '+p.code);
  const numeric=(label,id,value,hint='',attrs='')=>`<label class="wing-geometry-field" for="${id}">${label}<small>${hint}</small><input id="${id}" type="number" step="any" value="${value}" ${attrs} required></label>`;
  const baseProfile=()=>draft.airfoil||{kind:'naca4',code:draft.naca};
  function message(text,bad=false){
   notice.textContent=text;notice.setAttribute('role',bad?'alert':'status');notice.style.color=bad?'var(--bad)':'';
   if(bad){
    let target=form.querySelector('[aria-invalid="true"],input:invalid,select:invalid,textarea:invalid');
    if(!target&&!/spar|rod|seam/i.test(text)){
     const id=/skin|cavity|hollow/i.test(text)?'wgtSkin':/root chord/i.test(text)?'wgtRootChord':/tip chord/i.test(text)?'wgtTipChord':/semi.span/i.test(text)?'wgtSpan':null;
     if(id)target=form.querySelector('#'+id);
    }
    win.WingLabUI?.showError?.(text,target||notice);
   }
  }
  function showGuidance(d){
   if(!d||d.kind!=='cavity')return;
   const box=node('section',{class:'wing-geometry-guidance',role:'alert','aria-label':'How to fix this wing geometry'});
   box.append(node('h3',{},'Why Apply geometry stopped'));
   box.append(node('p',{},`${d.section?'Section '+d.section+' · ':''}${esc(d.profile)} · eta ${d.eta.toFixed(3)} · y ${d.y.toFixed(1)} mm · chord ${d.chord.toFixed(1)} mm.`));
   box.append(node('p',{},`Near <b>x/c = ${d.x.toFixed(3)}</b> (the aft part of this cavity), the outer thickness is ${d.outer.toFixed(2)} mm. Two ${d.skin.toFixed(2)} mm skins leave <b>${d.gap.toFixed(2)} mm</b>; this model requires ${d.requiredGap.toFixed(2)} mm. Different airfoil families are allowed—the local cavity clearance is the problem.`));
   const options=node('ol');
   for(const suggestion of d.suggestions){const item=node('li');item.textContent=suggestion.text;
    if(suggestion.kind==='skin'||suggestion.kind==='chords'){
     const button=node('button',{type:'button',class:'btn'},suggestion.kind==='skin'?`Put skin ${suggestion.value.toFixed(1)} mm in draft`:'Put larger chords in draft');
     button.onclick=()=>{if(suggestion.kind==='skin'){draft.skin=suggestion.value;form.querySelector('#wgtSkin').value=draft.skin;}else{draft.rootChord=suggestion.root;draft.tipChord=suggestion.tip;dimensionSource='tip';form.querySelector('#wgtRootChord').value=draft.rootChord;form.querySelector('#wgtTipChord').value=draft.tipChord;form.querySelector('#wgtTipChord').dispatchEvent(new win.Event('input',{bubbles:true}));}box.querySelectorAll('button').forEach(b=>b.disabled=true);message('Suggestion placed in the draft only. Inspect it, then press Apply geometry to re-check all constraints. The current wing has not changed.');};item.append(doc.createElement('br'),button);
    }options.append(item);
   }
   box.append(options,node('p',{class:'note'},esc(d.scope)));form.prepend(box);box.scrollIntoView?.({block:'nearest'});
  }
  function outline(p){
   const s=A.surfaces(p,1,null,81),points=s.xu.map((x,i)=>[x,s.zu[i]]).reverse().concat(s.xl.slice(1).map((x,i)=>[x,s.zl[i+1]]));
   const zz=points.map(p=>p[1]),lo=Math.min(...zz),hi=Math.max(...zz),height=Math.max(.15,hi-lo),cy=(lo+hi)/2;
   return `<svg viewBox="0 0 400 100" role="img" aria-label="Local airfoil profile, normalized coordinates" style="width:100%;max-height:90px"><path d="M ${points.map(([x,z])=>`${12+376*x},${50-75*(z-cy)/height}`).join(' L ')} Z" fill="var(--raise,#e4f0fb)" stroke="var(--accent,#176ac0)" stroke-width="2"/></svg>`;
  }
  function profilePicker(holder,get,set,id){
   cancelPickerRead(id);
   const p=get(),card=node('div',{class:'wing-airfoil-picker'});
   card.innerHTML=`<label for="${id}Kind">Airfoil family / library</label><select id="${id}Kind" aria-label="Airfoil family at ${id}"><option value="current">${esc(name(p))} · current</option><option value="naca4">NACA 4-digit · enter code</option><option value="naca5">NACA 5-digit · non-reflex code</option>${A.catalog.map(e=>`<option value="${e.id}">${esc(e.name+' · '+e.family)}</option>`).join('')}</select><label for="${id}Code">NACA code</label><input id="${id}Code" type="text" value="${esc(p.code||'')}" ${p.kind==='coordinates'?'disabled':''} maxlength="9" autocomplete="off"><label class="btn" style="display:inline-flex;gap:6px;align-items:center">Upload airfoil .dat / .txt<input id="${id}Dat" type="file" accept=".dat,.txt,text/plain" aria-label="Upload airfoil at ${id}" style="max-width:220px"></label><div data-profile-outline>${outline(p)}</div><p class="note" data-profile-source></p>`;
   card.querySelector('[data-profile-source]').textContent=p.source?.url||p.source?.filename||'Analytical NACA section; no aerodynamic polar is inferred.';
   const choose=card.querySelector('select'),code=card.querySelector('[type=text]');
   profileValidators.set(id,()=>{if(!code.disabled){const value=code.value.trim();set(clone(A.normalizeProfile({kind:value.replace(/^NACA\s*/i,'').length===5?'naca5':'naca4',code:value})));}});
   const repaint=()=>{holder.replaceChildren();profilePicker(holder,get,set,id);};
   choose.onchange=()=>{cancelPickerRead(id);try{set(clone(choose.value==='current'?get():choose.value==='naca4'?A.normalizeProfile({kind:'naca4',code:'2412'}):choose.value==='naca5'?A.normalizeProfile({kind:'naca5',code:'23012'}):A.preset(choose.value)));repaint();message('Airfoil selected in the draft. Apply geometry to update the wing.');}catch(e){message(e.message,true);}};
   code.addEventListener('input',()=>cancelPickerRead(id));
   code.onchange=()=>{cancelPickerRead(id);try{set(clone(A.normalizeProfile({kind:code.value.trim().replace(/^NACA\s*/i,'').length===5?'naca5':'naca4',code:code.value.trim()})));repaint();}catch(e){message(e.message,true);}};
   card.querySelector('[type=file]').onchange=async e=>{
    const file=e.target.files?.[0];e.target.value='';if(!file)return;
    cancelPickerRead(id);
    if(file.size>262144){message('Airfoil file is too large (maximum 256 KiB).',true);return;}
    const started=generation,ticket={};activeReads.set(id,ticket);message('Reading '+file.name+'…');
    const current=()=>started===generation&&activeReads.get(id)===ticket;
    try{
     const text=await new Promise((resolve,reject)=>{ticket.cancel=()=>resolve(null);const r=ticket.reader=new win.FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('Could not read this airfoil file.'));r.onabort=()=>resolve(null);r.readAsText(file);});
     if(!current()||text===null)return;
     const parsed=A.parseDat(text,{filename:file.name});activeReads.delete(id);set(clone(parsed));repaint();
     message('Read '+file.name+' ('+parsed.source.format+'). Inspect the profile, then Apply geometry. The current wing is unchanged until Apply.');
    }catch(err){if(current())message(err.message,true);}finally{if(activeReads.get(id)===ticket)activeReads.delete(id);}
   };
   holder.append(card);
  }
  function stations(){
   const p=clone(baseProfile());
   if(!draft.stations)draft.stations=[{eta:0,airfoil:clone(p),incidenceDeg:0},{eta:.5,airfoil:clone(p),incidenceDeg:0},{eta:1,airfoil:clone(p),incidenceDeg:0}];
  }
  function nonlinearIncidence(){
   const ss=draft.stations||[];if(ss.length<2)return false;
   const a=ss[0].incidenceDeg,b=ss.at(-1).incidenceDeg;
   return ss.some(s=>Math.abs(s.incidenceDeg-(a+(b-a)*s.eta))>1e-8);
  }
  function syncTwistSummary(){
   const root=form.querySelector('#wgtRootInc'),tip=form.querySelector('#wgtTipInc');if(!root)return;
   const ss=draft.stations||[],a=ss[0]?.incidenceDeg||0,b=ss.at(-1)?.incidenceDeg||0,custom=nonlinearIncidence();
   form.querySelector('#wgtSimpleAngles').hidden=!draft.twistEnabled;
   for(const [input,value]of [[root,a],[tip,b]]){input.readOnly=custom;input.setAttribute('aria-readonly',String(custom));if(doc.activeElement!==input)input.value=value;}
   const delta=b-a,summary=custom?'Custom intermediate angles are retained. Edit the section angles below, or explicitly replace them with a linear root-to-tip variation.':Math.abs(delta)<1e-8?`Same incidence ${a}° at root and tip; no spanwise geometric twist.`:`Tip − root = ${+delta.toFixed(3)}°: ${Math.abs(+delta.toFixed(3))}° ${delta<0?'washout (tip angle lower)':'wash-in (tip angle higher)'}.`;
   form.querySelector('#wgtTwistSummary').textContent=summary;
   form.querySelector('#wgtLinearAngles').hidden=!custom;
   for(const [s,i]of ss.map((s,i)=>[s,i])){const input=form.querySelector('#wgtInc'+i);if(input)input.readOnly=!draft.twistEnabled;}
  }
  function readSimpleAngles(){
   if(!draft.twistEnabled||nonlinearIncidence())return;
   const inputs=['wgtRootInc','wgtTipInc'].map(id=>form.querySelector('#'+id));
   if(!inputs.every(Boolean))return;
   const values=inputs.map(input=>input.value.trim()===''?NaN:Number(input.value));
   if(values.some(v=>!Number.isFinite(v)||Math.abs(v)>30))throw Error('Enter root and tip incidence between −30° and +30°.');
   for(const [s,i]of (draft.stations||[]).map((s,i)=>[s,i])){s.incidenceDeg=values[0]+(values[1]-values[0])*s.eta;const input=form.querySelector('#wgtInc'+i);if(input)input.value=+s.incidenceDeg.toFixed(10);const heading=form.querySelectorAll('.wing-station-card > summary')[i];if(heading)heading.textContent=`Section ${i+1} · ${i===0?'root':i===draft.stations.length-1?'tip':'eta '+s.eta} · ${name(s.airfoil)} · ${+s.incidenceDeg.toFixed(3)}°`;}
  }
  function organiseTwistControls(){
   const field=form.querySelector('#wgtTwist').closest('.field'),section=node('fieldset',{class:'wing-twist-simple'},'<legend>Wing incidence and twist</legend>');field.before(section);section.append(field);
   field.querySelector('label').firstChild.textContent='Set wing angles';
   form.querySelector('#wgtTwist option[value="no"]').textContent='None · all incidences 0°';
   form.querySelector('#wgtTwist option[value="yes"]').textContent='Set root and tip incidence';
   const a=draft.stations?.[0]?.incidenceDeg||0,b=draft.stations?.at(-1)?.incidenceDeg||0;
   const quick=node('div',{id:'wgtSimpleAngles'},'<p class="note">Incidence is the section angle. Positive raises the leading edge. Enter the actual angle at each end, not an extra rotation.</p><div class="wing-geometry-grid">'+numeric('Root incidence (°)','wgtRootInc',a,'Angle at the wing root','min="-30" max="30"')+numeric('Tip incidence (°)','wgtTipInc',b,'Angle at the wing tip','min="-30" max="30"')+'</div><p class="note" id="wgtTwistSummary"></p><p class="note">Example: root +2°, tip 0° gives 2° washout. Intermediate angles are interpolated linearly; airfoil choices stay unchanged.</p><button type="button" class="btn" id="wgtLinearAngles">Replace custom angles with linear root to tip</button>');section.append(quick);
   const profiles=node('fieldset',{id:'wgtSpanwiseProfiles'},'<legend>Spanwise airfoils</legend>');section.before(profiles);
   const check=form.querySelector('#wgtSections').closest('label'),note=check.nextElementSibling,stationBox=form.querySelector('#wgtStations');
   profiles.append(check,note,stationBox);
   const pivot=form.querySelector('#wgtTwistRef').closest('label');section.append(pivot);
   for(const id of ['wgtRootInc','wgtTipInc'])form.querySelector('#'+id).oninput=()=>{try{readSimpleAngles();syncTwistSummary();message('Angles are a draft until Apply geometry.');}catch(err){message(err.message,true);}};
   form.querySelector('#wgtLinearAngles').onclick=()=>{const ss=draft.stations||[],a=ss[0]?.incidenceDeg||0,b=ss.at(-1)?.incidenceDeg||0;for(const s of ss)s.incidenceDeg=a+(b-a)*s.eta;render();message('Intermediate angles replaced with a linear variation. Airfoil profiles retained; Apply geometry to commit.');};
   syncTwistSummary();
  }
  function renderDimensions(){
   const box=node('fieldset',{class:'wing-planform-dimensions'});
   box.innerHTML='<legend>Wing dimensions & taper</legend><label>Planform<select id="wgtPlanform"><option value="linear">Rectangular / trapezoidal</option><option value="elliptic">Elliptical · closed tip</option><option value="delta">Delta · pointed tip</option></select></label><p class="note">Elliptical and delta shapes close at zero tip chord. The narrow tip is solid; the hollow cavity ends inboard. Nominal normal-stress analysis is available with zero user sweep, dihedral and incidence. Exact-apex stress is undefined. After Solve, bending displacement components are available; torsional displacement is not computed.</p><label for="wgtChordMode">Chord input method<select id="wgtChordMode"><option value="tip">Root + Tip → calculate λ</option><option value="ratio">Root + λ → calculate Tip</option></select></label><div class="wing-geometry-grid">'+numeric('Semi-span (mm)','wgtSpan',draft.semiSpan,'Root to tip, projected aircraft y','min="1"')+numeric('Root chord (mm)','wgtRootChord',draft.rootChord,'Reference chord at root','min="1"')+numeric('Tip chord (mm)','wgtTipChord',draft.tipChord,'Reference chord at tip','min="0"')+numeric('Taper ratio λ = tip / root','wgtTaper',draft.tipChord/draft.rootChord,'1 = rectangular; below 1 = narrower tip','min="0" max="1"')+numeric('Skin thickness (mm)','wgtSkin',draft.skin,'Measured vertically; course printing minimum 0.8 mm','min="0.001" step="0.1"')+'<label class="wing-geometry-field">Printed modules<small>Equal lengths; seams between modules</small><select id="wgtModules"><option value="1">1 · one piece</option><option value="2">2</option><option value="3">3</option></select></label></div><p class="note" id="wgtChordHint"></p><dl class="kv wl-kv" id="wgtGeometrySummary"></dl>';
   form.prepend(box);box.querySelector('#wgtModules').value=String(draft.modules??1);const shape=box.querySelector('#wgtPlanform');if(draft.tipChord>0&&['elliptic','delta'].includes(draft.planform)){const old=node('option',{value:'legacy'},'Imported trimmed '+draft.planform+' · choose a closed shape');old.disabled=true;shape.append(old);shape.value='legacy';}else shape.value=draft.planform||'linear';box.querySelector('#wgtPlanform').onchange=e=>{draft.planform=e.target.value;draft.sweepReferenceFraction=draft.planform==='delta'?1:draft.planform==='elliptic'?.5:0;if(draft.planform!=='linear'){draft.tipChord=0;draft.sweepDeg=0;win.wingChordInputMode='tip';}else if(draft.tipChord===0)draft.tipChord=.7*draft.rootChord;render();};dimensionSource=win.wingChordInputMode==='ratio'?'ratio':'tip';
   const value=id=>{const s=form.querySelector('#'+id).value;return s.trim()===''?NaN:Number(s);};
   box.querySelector('#wgtModules').onchange=e=>{draft.modules=Number(e.target.value);preview();};
   box.querySelector('#wgtSkin').oninput=()=>{draft.skin=value('wgtSkin');};
   function preview(){
    const closed=G.closedTip(draft);if(closed)dimensionSource='tip';const ratio=dimensionSource==='ratio';box.querySelector('#wgtChordMode').value=dimensionSource;
    box.querySelector('#wgtChordMode').disabled=closed;box.querySelector('#wgtTipChord').readOnly=closed||ratio;box.querySelector('#wgtTaper').readOnly=closed||!ratio;
    box.querySelector('#wgtTipChord').setAttribute('aria-readonly',String(closed||ratio));box.querySelector('#wgtTaper').setAttribute('aria-readonly',String(closed||!ratio));
    box.querySelector('#wgtChordHint').textContent=closed?'Zero tip chord: exact closed planform; no tip trimming.':ratio?'Tip is calculated from Root × λ. Changing Root preserves λ.':'λ is calculated from Tip / Root. Enter both chord lengths.';
    const area=G.area(draft),length=draft.semiSpan/(draft.modules||1),summary=box.querySelector('#wgtGeometrySummary');
    summary.innerHTML=Number.isFinite(area)&&area>0?`<dt>Semi-wing area</dt><dd>${(area/100).toFixed(1)} cm²</dd><dt>Taper ratio</dt><dd>${(draft.tipChord/draft.rootChord).toFixed(3)}</dd><dt>Aspect ratio (full wing)</dt><dd>${(2*draft.semiSpan**2/area).toFixed(2)}</dd><dt>Module length</dt><dd>${length.toFixed(1)} mm</dd>`:'';

   }
   box.querySelector('#wgtChordMode').onchange=e=>{dimensionSource=e.target.value;win.wingChordInputMode=dimensionSource;preview();};
   for(const[id,key]of [['wgtSpan','semiSpan'],['wgtRootChord','rootChord'],['wgtTipChord','tipChord']])box.querySelector('#'+id).oninput=()=>{
    if(key==='tipChord'&&dimensionSource==='ratio')return;
    draft[key]=value(id);
    if(dimensionSource==='ratio'&&!G.closedTip(draft)){draft.tipChord=draft.rootChord*value('wgtTaper');box.querySelector('#wgtTipChord').value=Number.isFinite(draft.tipChord)?+draft.tipChord.toPrecision(12):'';}
    else box.querySelector('#wgtTaper').value=Number.isFinite(draft.tipChord/draft.rootChord)?+(draft.tipChord/draft.rootChord).toPrecision(8):'';
    preview();
   };
   box.querySelector('#wgtTaper').oninput=()=>{
    if(dimensionSource!=='ratio')return;const ratio=value('wgtTaper');draft.rootChord=value('wgtRootChord');draft.tipChord=draft.rootChord*ratio;
    box.querySelector('#wgtTipChord').value=Number.isFinite(draft.tipChord)?+draft.tipChord.toPrecision(12):'';preview();
   };
   preview();
  }
  function render(){
   cancelReads();
   profileValidators.clear();
   form.innerHTML=`<div class="lesson-actions" style="position:sticky;top:0;z-index:2;background:var(--panel);padding:8px 0"><button class="btn primary" type="submit" id="wgtApply">Apply geometry</button></div><p class="note">Aircraft coordinates: x aft, y projected semi-span, z up. Positive incidence is leading-edge up; negative tip incidence relative to root is washout. These are geometry inputs, not a computed lift distribution.</p><h4>Default airfoil</h4><div id="wgtDefaultProfile"></div><div class="field"><label for="wgtTwist">Geometric twist / incidence?</label><select id="wgtTwist"><option value="no" ${!draft.twistEnabled?'selected':''}>No · zero incidence</option><option value="yes" ${draft.twistEnabled?'selected':''}>Yes · set section incidences</option></select></div><label><input type="checkbox" id="wgtSections" ${draft.stations?'checked':''}> Choose airfoils at root, intermediate stations and tip</label><p class="note">Root and tip are required. Intermediate stations are optional—not necessarily ribs. Airfoil shape and absolute incidence interpolate linearly between stations.</p><div id="wgtStations"></div><h4>Planform & orientation</h4><div class="wing-geometry-grid">${numeric('Sweep (degrees)','wgtSweep',draft.sweepDeg??0,'Positive aft; reference below','min="-60" max="60"')}${numeric('Dihedral (degrees)','wgtDihedral',draft.dihedralDeg??0,'Positive tip-up; negative anhedral','min="-45" max="45"')}${numeric('Sweep reference x/c','wgtSweepRef',draft.sweepReferenceFraction??0,'0 = leading edge; 0.25 = quarter chord','min="0" max="1"')}${numeric('Incidence pivot x/c','wgtTwistRef',draft.twistReferenceFraction??.25,'0.25 = common quarter-chord pivot','min="0" max="1"')}</div><p class="note">Sections remain in flight-parallel x–z planes (OpenVSP default), not rotated to follow dihedral. Chord follows the selected planform. Control surfaces, winglets and arbitrary multi-element airfoils are not inferred from these inputs.</p><details><summary>Airfoil file format & print geometry</summary><p class="note">Selig: optional title, then normalized x/c and z/c coordinate pairs from trailing edge around the leading edge to the other trailing edge. Lednicer: title, upper/lower point counts, then the two coordinate blocks. No polar or force data. Single-element monotone upper/lower surfaces only. Source coordinates are embedded in JSON. The printable trailing-edge thickness and skin/cavity settings still apply and can make a thin profile unprintable; no dimension is changed automatically.</p></details>`;
   renderDimensions();
   profilePicker(form.querySelector('#wgtDefaultProfile'),baseProfile,p=>draft.airfoil=p,'wgtDefault');
   const stationBox=form.querySelector('#wgtStations');
   if(draft.stations){
    draft.stations.forEach((s,i)=>{
     const box=node('details',{class:'wing-station-card'},`<summary>Section ${i+1} · ${i===0?'root':i===draft.stations.length-1?'tip':'eta '+s.eta} · ${esc(name(s.airfoil))} · ${s.incidenceDeg}°</summary><div class="wing-geometry-grid">${numeric('Span fraction eta','wgtEta'+i,s.eta,'0 = root, 1 = tip',i===0||i===draft.stations.length-1?'readonly':'min="0" max="1"')}${numeric('Absolute incidence (degrees)','wgtInc'+i,s.incidenceDeg,'Positive LE-up; not incremental twist','min="-30" max="30"')}</div><div data-station-profile></div>${i>0&&i<draft.stations.length-1?'<button type="button" class="btn" data-remove-station>Remove this station</button>':''}`);
     const updateHeading=()=>{box.querySelector('summary').textContent=`Section ${i+1} · ${i===0?'root':i===draft.stations.length-1?'tip':'eta '+s.eta} · ${name(s.airfoil)} · ${s.incidenceDeg}°`;};
     if(i===0)box.open=true;
     profilePicker(box.querySelector('[data-station-profile]'),()=>s.airfoil,p=>{s.airfoil=p;updateHeading();},'wgtStation'+i);
     box.querySelector('#wgtEta'+i).onchange=e=>{s.eta=Number(e.target.value);updateHeading();syncTwistSummary();};
     box.querySelector('#wgtInc'+i).onchange=e=>{s.incidenceDeg=e.target.value.trim()===''?NaN:Number(e.target.value);updateHeading();syncTwistSummary();};
     box.querySelector('[data-remove-station]')?.addEventListener('click',()=>{draft.stations.splice(i,1);render();});
     stationBox.append(box);
    });
    const add=node('button',{type:'button',class:'btn',id:'wgtAddStation'},'Add intermediate station');add.disabled=draft.stations.length>=9;
    add.onclick=()=>{let k=1;for(let j=2;j<draft.stations.length;j++)if(draft.stations[j].eta-draft.stations[j-1].eta>draft.stations[k].eta-draft.stations[k-1].eta)k=j;const a=draft.stations[k-1],b=draft.stations[k];draft.stations.splice(k,0,{eta:(a.eta+b.eta)/2,airfoil:clone(a.airfoil),incidenceDeg:(a.incidenceDeg+b.incidenceDeg)/2});render();};stationBox.append(add);
   }
   organiseTwistControls();
   form.querySelector('#wgtSweepRef').readOnly=draft.planform==='delta'||G.closedTip(draft)&&draft.planform==='elliptic';
   if(draft.planform==='delta')form.querySelector('#wgtSweepRef').title='Delta keeps a straight trailing edge (x/c = 1). Sweep adds to this reference line.';
   form.querySelector('#wgtTwist').onchange=e=>{draft.twistEnabled=e.target.value==='yes';if(draft.twistEnabled)stations();else for(const s of draft.stations||[])s.incidenceDeg=0;render();if(!draft.twistEnabled)message('All draft incidences set to zero; airfoil profiles retained. Apply geometry to commit.');};
   form.querySelector('#wgtSections').onchange=e=>{if(e.target.checked)stations();else{if(draft.twistEnabled){e.target.checked=true;message('Twist needs root/tip incidence stations. Turn twist off first.',true);return;}delete draft.stations;}render();};
   for(const[id,key]of [['wgtSweep','sweepDeg'],['wgtDihedral','dihedralDeg'],['wgtSweepRef','sweepReferenceFraction'],['wgtTwistRef','twistReferenceFraction']])form.querySelector('#'+id).onchange=e=>{draft[key]=e.target.value.trim()===''?NaN:Number(e.target.value);};
  }
  form.onsubmit=e=>{
   e.preventDefault();if(activeReads.size){message('Wait until the airfoil file has finished reading.',true);return;}
   form.querySelector('.wing-geometry-guidance')?.remove();
   try{
    // Enter can submit before change/blur: validate visible fields, never a stale draft.
    for(const validate of profileValidators.values())validate();
    // A typed end angle may be submitted with Enter before input/change fires.
    // Per-station edits are authoritative when their visible values differ.
    const advancedChanged=(draft.stations||[]).some((s,i)=>{const n=form.querySelector('#wgtInc'+i);return n&&(n.value.trim()===''||!Number.isFinite(Number(n.value))||Math.abs(Number(n.value)-s.incidenceDeg)>1e-8);});
    if(!advancedChanged)readSimpleAngles();
    for(const[id,key]of [['wgtSpan','semiSpan'],['wgtRootChord','rootChord'],['wgtTipChord','tipChord']]){
     const value=form.querySelector('#'+id).value;draft[key]=value.trim()===''?NaN:Number(value);
    }
    if(dimensionSource==='ratio'){
     const text=form.querySelector('#wgtTaper').value,ratio=text.trim()===''?NaN:Number(text);
     if(!Number.isFinite(ratio)||ratio<=0||ratio>1)throw Error('Taper ratio must be greater than 0 and no greater than 1.');
     draft.tipChord=draft.rootChord*ratio;
    }
    for(const[id,key]of [['wgtSweep','sweepDeg'],['wgtDihedral','dihedralDeg'],['wgtSweepRef','sweepReferenceFraction'],['wgtTwistRef','twistReferenceFraction']]){
      const value=form.querySelector('#'+id).value;draft[key]=value.trim()===''?NaN:Number(value);
    }
    for(const[s,i]of (draft.stations||[]).map((s,i)=>[s,i])){
      for(const[prefix,key]of [['wgtEta','eta'],['wgtInc','incidenceDeg']]){const value=form.querySelector('#'+prefix+i).value;s[key]=value.trim()===''?NaN:Number(value);}
    }
    const skinText=form.querySelector('#wgtSkin').value;draft.skin=skinText.trim()===''?NaN:Number(skinText);
    if(!Number.isFinite(draft.skin)||draft.skin<=0)throw Error('Skin thickness must be a positive number of millimetres.');
    const patch={planform:draft.planform||'linear',modules:Number(form.querySelector('#wgtModules').value),semiSpan:draft.semiSpan,rootChord:draft.rootChord,tipChord:draft.tipChord,skin:draft.skin,airfoil:clone(A.normalizeProfile(baseProfile())),twistEnabled:!!draft.twistEnabled,sweepDeg:draft.sweepDeg??0,dihedralDeg:draft.dihedralDeg??0,sweepReferenceFraction:draft.sweepReferenceFraction??0,twistReferenceFraction:draft.twistReferenceFraction??.25};
    // Explicitly removing section variation uses the same global profile at root and tip.
    patch.stations=draft.stations?clone(draft.stations):undefined;
    // A uniform, unrotated four-digit section with leading-edge alignment is
    // exactly the legacy construction. Keep its rod/joint-compatible analysis
    // route rather than silently upgrading it merely because a picker was used.
    if(patch.planform==='linear'&&patch.airfoil.kind==='naca4'&&!draft.stations&&!patch.twistEnabled&&patch.sweepDeg===0&&patch.dihedralDeg===0&&(patch.sweepReferenceFraction===0||draft.rootChord===draft.tipChord)){
     patch.naca=patch.airfoil.code;patch.airfoil=null;patch.stations=null;
    }
    const result=applyGeometry(patch,'advanced','airfoil / sweep / dihedral / incidence');
    if(!result.ok){message(result.error||'Geometry was not applied. Check the wing dimensions and cavity clearance.',true);showGuidance(result.guidance);return;}
    message(G.closedTip(patch)?'Exact closed-tip geometry applied. Solve computes nominal normal stress; the exact apex and deformation are unresolved.':'Geometry applied. Solve to update structural results.');onApplied();
   }catch(err){message(err.message,true);}
  };
  const style=node('style',{},'.wing-geometry-guidance{border:1px solid var(--warn,#ad7300);border-radius:10px;padding:12px;background:var(--panel-2);font-size:13px;line-height:1.45}.wing-geometry-guidance h3{margin:0 0 6px}.wing-geometry-guidance li{margin:10px 0}.wing-geometry-guidance .btn{margin-top:5px}.wing-geometry-form{display:grid;gap:10px}.wing-geometry-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px}.wing-geometry-field{display:grid;gap:4px;font-size:13px}.wing-geometry-field small{color:var(--muted)}.wing-geometry-form input[type=number],.wing-geometry-form input[type=text],.wing-geometry-form select{width:100%;min-height:40px;padding:7px;border:1px solid var(--line);border-radius:7px;background:var(--panel-2);color:var(--fg);font-size:16px}.wing-airfoil-picker{display:grid;gap:6px}.wing-station-card{margin:7px 0;padding:8px;border:1px solid var(--line);border-radius:8px}.wing-station-card>summary{font-weight:700;cursor:pointer;padding:7px 0}.wing-station-card .note{overflow-wrap:anywhere}');doc.head.append(style);
  return{refresh(){draft=clone(getGeometry());render();message('Changes remain a draft until Apply geometry.');},form,notice};
 }
 return{mount};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WingGeometryUI;
