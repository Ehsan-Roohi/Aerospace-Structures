/*
 * Beam Study — MIE 446 Beam Lab study files, share links, A/B comparison and CSV export.
 * Browser: BeamStudy.*  Node: require('./beam_study.js') (needs beam_learning_engine.js).
 *
 * A study file is versioned JSON:
 *   {format:'mie446-beam-study', version:2, engine:'2.0.0', savedAt, model, notes, results, compare}
 * model = {length, E, density, elements, section:{shape,...}, supports:[{x,kind}], hinges:[x],
 *          loads:[point|moment|distributed], selfWeight}
 * Imported files and links are untrusted: only whitelisted fields are copied, every number is
 * type-checked, sizes are limited, the engine re-validates the physics (including mechanisms),
 * and results are always recomputed, never read from the file. Notes stay plain text.
 * Version 1 is the earlier "Download study record" ({input, explanation, ...}); it is converted.
 * A newer, unknown version is refused so that the current study is never half-replaced.
 */
const BeamStudy = (() => {
  'use strict';
  const B = typeof BeamLearningEngine!=='undefined' ? BeamLearningEngine
    : (typeof require==='function' ? require('./beam_learning_engine.js') : null);
  if(!B) throw new Error('Load beam_learning_engine.js before beam_study.js.');
  const FORMAT = 'mie446-beam-study';
  const VERSION = 2;
  // loads: the Beam Lab load form allows 12 (as before); files and links use the same limit (the engine allows 30).
  const LIMITS = Object.freeze({fileBytes:200000, shareChars:8000, notes:4000, label:80, loads:Math.min(12,B.LIMITS.loads),
    supports:B.LIMITS.supports, hinges:B.LIMITS.hinges});
  const SUPPORT_KINDS = ['fixed','pin','roller'];

  const isObject = v => v!==null && typeof v==='object' && !Array.isArray(v);
  const own = (o,k) => Object.prototype.hasOwnProperty.call(o,k);

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  // Plain text only; control characters other than tab/newline are removed.
  function cleanText(value, max) {
    if(value===undefined||value===null) return '';
    if(typeof value!=='string') throw new Error('Notes must be text.');
    return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').slice(0,max);
  }

  function number(raw, key, label) {
    if(!own(raw,key)) throw new Error(`${label} is missing.`);
    const v=raw[key];
    if(typeof v!=='number'||!Number.isFinite(v)) throw new Error(`${label} must be a finite number.`);
    return v;
  }
  function list(raw, key, max, label) {
    if(!own(raw,key)) return [];
    const v=raw[key];
    if(!Array.isArray(v)) throw new Error(`${label} must be a list.`);
    if(v.length>max) throw new Error(`${label}: at most ${max} entries are allowed.`);
    return v;
  }

  /** Canonical model from a validated engine input (result.input). */
  function modelFromInput(o) {
    return {length:o.length,E:o.E,density:o.density,elements:o.elements,section:{...o.section},
      supports:o.supports.map(s=>({x:s.x,kind:s.kind})),hinges:[...o.hinges],
      loads:o.loads.map(v=>({...v})),selfWeight:o.selfWeight===true};
  }

  /** Whitelist copy of an untrusted model, then full engine validation. Throws on any problem. */
  function sanitizeModel(raw) {
    if(!isObject(raw)) throw new Error('The study has no beam model.');
    const model={length:number(raw,'length','Length L'),E:number(raw,'E','Elastic modulus E'),
      density:number(raw,'density','Density'),elements:number(raw,'elements','Mesh size')};
    if(!isObject(raw.section)) throw new Error('Cross-section is missing.');
    const shape=raw.section.shape;
    if(typeof shape!=='string'||!own(B.sections.SHAPES,shape)) throw new Error('Unknown cross-section shape.');
    model.section={shape};
    for(const [key,symbol,label] of B.sections.SHAPES[shape].fields) model.section[key]=number(raw.section,key,`${label} ${symbol}`);
    model.supports=list(raw,'supports',LIMITS.supports,'Supports').map((s,i)=>{
      if(!isObject(s)) throw new Error(`Support ${i+1} is invalid.`);
      if(!SUPPORT_KINDS.includes(s.kind)) throw new Error(`Support ${i+1} must be fixed, pin or roller.`);
      return {x:number(s,'x',`Support ${i+1} position`),kind:s.kind};
    });
    model.hinges=list(raw,'hinges',LIMITS.hinges,'Hinges').map((h,i)=>{
      if(typeof h!=='number'||!Number.isFinite(h)) throw new Error(`Hinge ${i+1} position must be a finite number.`);
      return h;
    });
    model.loads=list(raw,'loads',LIMITS.loads,'Loads').map((v,i)=>{
      if(!isObject(v)) throw new Error(`Load ${i+1} is invalid.`);
      const n=k=>number(v,k,`Load ${i+1} ${k}`);
      if(v.kind==='point') return {kind:'point',position:n('position'),force:n('force')};
      if(v.kind==='moment') return {kind:'moment',position:n('position'),moment:n('moment')};
      if(v.kind==='distributed') return {kind:'distributed',start:n('start'),end:n('end'),qStart:n('qStart'),qEnd:n('qEnd')};
      throw new Error(`Load ${i+1} kind must be point, moment or distributed.`);
    });
    if(own(raw,'selfWeight')&&typeof raw.selfWeight!=='boolean') throw new Error('Self-weight must be true or false.');
    model.selfWeight=raw.selfWeight===true;
    return modelFromInput(B.normalize(model));   // physics validation, including mechanisms
  }

  // Version 1: the earlier study record {input:{length,width,height,E,density,support|leftSupport,...}}.
  function legacyModel(input) {
    if(!isObject(input)) throw new Error('The legacy study record has no input.');
    const raw={};
    for(const k of ['length','width','height','E','density','elements','support','simpleArrangement','leftSupport','rightSupport'])
      if(own(input,k)) raw[k]=input[k];
    raw.loads=list(input,'loads',LIMITS.loads,'Loads').map((v,i)=>{
      if(!isObject(v)) throw new Error(`Load ${i+1} is invalid.`);
      if(v.kind==='point') return {kind:'point',position:v.position,force:v.force};
      if(v.kind==='distributed') return {kind:'distributed',start:v.start,end:v.end,qStart:v.qStart,qEnd:v.qEnd};
      throw new Error(`Load ${i+1} kind must be point or distributed.`);
    });
    for(const k of ['support','simpleArrangement','leftSupport','rightSupport'])
      if(own(raw,k)&&typeof raw[k]!=='string') throw new Error('Invalid legacy support description.');
    return modelFromInput(B.normalize(raw));
  }

  function summary(result) {
    return {reactions:result.reactions.map(r=>({x:r.x,kind:r.kind,force:r.force,moment:r.moment})),
      maxima:{...result.maxima},equilibrium:{...result.equilibrium},massG:result.massG,
      frequenciesHz:result.modes.map(m=>m.frequencyHz)};
  }

  /** JSON text of a solved study. Results are informational only. */
  function exportStudy({result, notes='', compare=null, savedAt=new Date().toISOString()}) {
    if(!result||!result.input) throw new Error('Solve the study before saving it.');
    const doc={format:FORMAT,version:VERSION,app:'MIE 446 Beam Lab',engine:B.VERSION,savedAt,
      model:modelFromInput(result.input),notes:cleanText(notes,LIMITS.notes),results:summary(result)};
    if(compare) {
      doc.compare={};
      for(const key of ['A','B']) if(compare[key]) doc.compare[key]={label:cleanText(compare[key].label||key,LIMITS.label),model:compare[key].model};
    }
    return JSON.stringify(doc,null,2);
  }

  /** Parse untrusted study text. Returns {model, notes, compare, version, legacy}. Throws on any problem. */
  function parseStudy(text) {
    if(typeof text!=='string') throw new Error('A study file must be text.');
    if(text.length>LIMITS.fileBytes) throw new Error(`The file is too large (${text.length} characters; limit ${LIMITS.fileBytes}).`);
    let doc;
    try {doc=JSON.parse(text);} catch(e) {throw new Error('This is not a valid JSON study file.');}
    if(!isObject(doc)) throw new Error('This JSON file does not contain a beam study.');
    if(!own(doc,'format')&&isObject(doc.input)) {
      return {model:legacyModel(doc.input),notes:cleanText(typeof doc.explanation==='string'?doc.explanation:'',LIMITS.notes),compare:null,version:1,legacy:true};
    }
    if(doc.format!==FORMAT) throw new Error('This JSON file is not an MIE 446 beam study.');
    if(!Number.isInteger(doc.version)||doc.version<1) throw new Error('The study file has no valid version number.');
    if(doc.version>VERSION) throw new Error(`This study was saved by a newer Beam Lab (file version ${doc.version}; this page reads up to version ${VERSION}). Nothing was imported; your current study is unchanged.`);
    if(doc.version===1) return {model:legacyModel(doc.input),notes:cleanText(doc.notes,LIMITS.notes),compare:null,version:1,legacy:true};
    const model=sanitizeModel(doc.model);
    let compare=null;
    if(isObject(doc.compare)) {
      compare={};
      for(const key of ['A','B']) if(isObject(doc.compare[key])) {
        compare[key]={label:cleanText(typeof doc.compare[key].label==='string'?doc.compare[key].label:key,LIMITS.label),model:sanitizeModel(doc.compare[key].model)};
      }
    }
    return {model,notes:cleanText(doc.notes,LIMITS.notes),compare,version:doc.version,legacy:false};
  }

  /* --------------------------------------------------------- share links */

  // UTF-8 <-> binary string (TextEncoder where available; percent-encoding fallback otherwise).
  function utf8Binary(text) {
    if(typeof TextEncoder!=='undefined') {let bin='';for(const b of new TextEncoder().encode(text)) bin+=String.fromCharCode(b);return bin;}
    return unescape(encodeURIComponent(text));
  }
  function binaryUtf8(bin) {
    if(typeof TextDecoder!=='undefined') {const bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
    return decodeURIComponent(escape(bin));
  }
  function toBase64Url(text) {
    return btoa(utf8Binary(text)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function fromBase64Url(text) {
    const b64=text.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((text.length+3)%4);
    return binaryUtf8(atob(b64));
  }

  /** URL-safe encoding of a validated model: base64url(JSON {v, m}). */
  function encodeShare(model) {
    const token=toBase64Url(JSON.stringify({v:VERSION,m:sanitizeModel(model)}));
    if(token.length>LIMITS.shareChars) throw new Error('This study is too large for a link; save it as a file instead.');
    return token;
  }
  /** Decode an untrusted ?beam= token. Throws a readable Error; never returns a partial model. */
  function decodeShare(token) {
    if(typeof token!=='string'||!token) throw new Error('The beam link is empty.');
    if(token.length>LIMITS.shareChars) throw new Error('The beam link is too long to be a valid study.');
    if(!/^[A-Za-z0-9_-]+$/.test(token)) throw new Error('The beam link contains invalid characters.');
    let doc;
    try {doc=JSON.parse(fromBase64Url(token));} catch(e) {throw new Error('The beam link is damaged or incomplete.');}
    if(!isObject(doc)||!Number.isInteger(doc.v)) throw new Error('The beam link has no valid version.');
    if(doc.v>VERSION) throw new Error(`The beam link was made by a newer Beam Lab (link version ${doc.v}; this page reads up to version ${VERSION}).`);
    if(doc.v<2) throw new Error('Unsupported beam link version.');
    return sanitizeModel(doc.m);
  }
  function shareUrl(model, base) {
    const url=new URL(base);
    url.searchParams.delete('beamCase');
    url.searchParams.set('beam',encodeShare(model));
    url.hash='';
    return url.toString();
  }

  /* ------------------------------------------------------------- compare */

  const fmt=v=>Number(Number(v).toPrecision(6));
  function describeLoad(v) {
    if(v.kind==='point') return `P = ${fmt(v.force)} N at x = ${fmt(v.position)} mm`;
    if(v.kind==='moment') return `C = ${fmt(v.moment)} N·mm at x = ${fmt(v.position)} mm`;
    return `q = ${fmt(v.qStart)} → ${fmt(v.qEnd)} N/mm on ${fmt(v.start)}–${fmt(v.end)} mm`;
  }
  const loadKey=v=>JSON.stringify(v.kind==='point'?[v.kind,v.position,v.force]:v.kind==='moment'?[v.kind,v.position,v.moment]:[v.kind,v.start,v.end,v.qStart,v.qEnd]);

  /** Changed input variables between two canonical models, and whether the loading differs. */
  function diffModels(a, b) {
    const changes=[];
    const scalar=(key,label,unit)=>{if(a[key]!==b[key])changes.push({key,label,a:`${fmt(a[key])}${unit}`,b:`${fmt(b[key])}${unit}`});};
    scalar('length','Length L',' mm');scalar('E','Elastic modulus E',' MPa');scalar('density','Density ρ',' g/cm³');scalar('elements','Requested elements','');
    const sa=B.sections.describe(a.section),sb=B.sections.describe(b.section);
    if(sa!==sb) changes.push({key:'section',label:'Cross-section',a:sa,b:sb});
    const sup=m=>m.supports.map(s=>`${s.kind} @ ${fmt(s.x)} mm`).join(', ')||'none';
    if(sup(a)!==sup(b)) changes.push({key:'supports',label:'Supports',a:sup(a),b:sup(b)});
    const hin=m=>m.hinges.map(h=>`${fmt(h)} mm`).join(', ')||'none';
    if(hin(a)!==hin(b)) changes.push({key:'hinges',label:'Internal hinges',a:hin(a),b:hin(b)});
    const la=a.loads.map(loadKey).sort().join('|'),lb=b.loads.map(loadKey).sort().join('|');
    if(la!==lb) changes.push({key:'loads',label:'Applied loads',a:a.loads.map(describeLoad).join('; ')||'none',b:b.loads.map(describeLoad).join('; ')||'none'});
    if(a.selfWeight!==b.selfWeight) changes.push({key:'selfWeight',label:'Self-weight',a:a.selfWeight?'included':'off',b:b.selfWeight?'included':'off'});
    const weight=m=>m.selfWeight?B.sections.properties(m.section).A*m.density:0;
    const selfWeightChanges=a.selfWeight&&b.selfWeight&&Math.abs(weight(a)-weight(b))>1e-12*Math.max(weight(a),weight(b));
    const loadsDiffer=la!==lb||a.selfWeight!==b.selfWeight||selfWeightChanges||(a.selfWeight&&a.length!==b.length);
    return {changes,loadsDiffer,selfWeightChanges};
  }

  /* ---------------------------------------------------------------- CSV */

  const csvNumber=v=>v===null||v===undefined?'':String(Number(v.toPrecision(12)));
  /** Sampled results; duplicate x rows are the left and right limits at a jump. */
  function resultsCsv(result) {
    const rows=[['x_mm','side','v_mm','theta_rad','V_N','M_Nmm','sigma_top_MPa','sigma_bottom_MPa','tau_max_MPa']];
    result.x.forEach((x,i)=>{
      const dupPrev=i>0&&result.x[i-1]===x, dupNext=i+1<result.x.length&&result.x[i+1]===x;
      rows.push([csvNumber(x),dupNext?'left':dupPrev?'right':'',csvNumber(result.deflection[i]),csvNumber(result.rotation[i]),
        csvNumber(result.shear[i]),csvNumber(result.moment[i]),csvNumber(result.stressTop[i]),csvNumber(result.stressBottom[i]),csvNumber(result.shearStressMax[i])]);
    });
    return rows.map(r=>r.join(',')).join('\r\n')+'\r\n';
  }
  function reactionsCsv(result) {
    const i0=x=>result.x.findIndex(v=>Math.abs(v-x)<=result.input.length*1e-10);
    const rows=[['x_mm','support','force_N_down','moment_Nmm_clockwise','v_mm','theta_rad']];
    for(const r of result.reactions) {
      const st=result.stations.find(s=>Math.abs(s.x-r.x)<=result.input.length*1e-10);
      rows.push([csvNumber(r.x),r.kind,csvNumber(r.force),csvNumber(r.moment),csvNumber(result.deflection[i0(r.x)]),csvNumber(st?(st.thetaRight??st.thetaLeft):result.rotation[i0(r.x)])]);
    }
    return rows.map(r=>r.join(',')).join('\r\n')+'\r\n';
  }

  /**
   * Exact values at chosen stations (not the plotted samples): V and M by equilibrium, v and θ from the
   * Euler–Bernoulli finite element (value at a node, or cubic Hermite interpolation between nodes). A jump in V, M
   * or θ gives two rows, side 'left' (x⁻) and 'right' (x⁺); x = 0 is the right limit 0⁺ and x = L the left limit
   * L⁻. Values below 1e-9 of the field's largest magnitude are round-off and given as 0.
   */
  function stationRows(result, xs) {
    const L=result.input.length, eps=L*1e-10, m=result.maxima;
    const scale={V:m.shear,M:m.moment,v:m.deflection,theta:m.rotation,curvature:m.moment/result.EI,stressTop:m.bendingStress,stressBottom:m.bendingStress,tauMax:m.shearStress};
    const clean=f=>{const o={...f};for(const k of Object.keys(scale)) if(Math.abs(o[k])<=1e-9*Math.max(scale[k],1e-300)) o[k]=0;return o;};
    const list=[...new Set(xs.filter(Number.isFinite).map(x=>Math.min(L,Math.max(0,x))))].sort((a,b)=>a-b);
    const rows=[];
    for(const x of list) {
      const left=x>eps?clean(B.fieldAt(result,x,'left')):null, right=x<L-eps?clean(B.fieldAt(result,x,'right')):null;
      const source=result.nodes.some(n=>Math.abs(n-x)<=eps)?'FE node':'FE interpolation';
      const differs=k=>Math.abs(left[k]-right[k])>Math.max(1e-13,1e-9*Math.max(scale[k]||0,Math.abs(left[k]),Math.abs(right[k])));
      if(left&&right&&['V','M','theta'].some(differs)) rows.push({...left,x,side:'left',source},{...right,x,side:'right',source});
      else if(!left) rows.push({...right,x,side:'right',source});
      else if(!right) rows.push({...left,x,side:'left',source});
      else rows.push({...right,x,side:'',source});
    }
    return rows;
  }
  /** Station table as CSV (plain header row with units, CRLF; opens in Excel and other spreadsheets). */
  function stationsCsv(result, xs) {
    const rows=[['x_mm','side','V_N','M_Nmm','v_mm','theta_rad','curvature_per_mm','sigma_top_MPa','sigma_bottom_MPa','tau_max_MPa','v_theta_source']];
    for(const r of stationRows(result,xs)) rows.push([csvNumber(r.x),r.side,csvNumber(r.V),csvNumber(r.M),csvNumber(r.v),csvNumber(r.theta),
      csvNumber(r.curvature),csvNumber(r.stressTop),csvNumber(r.stressBottom),csvNumber(r.tauMax),r.source]);
    return rows.map(r=>r.join(',')).join('\r\n')+'\r\n';
  }

  return {FORMAT,VERSION,LIMITS,escapeHtml,cleanText,modelFromInput,sanitizeModel,exportStudy,parseStudy,
    encodeShare,decodeShare,shareUrl,diffModels,describeLoad,resultsCsv,reactionsCsv,stationRows,stationsCsv};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=BeamStudy;
if(typeof window!=='undefined')window.BeamStudy=BeamStudy;
