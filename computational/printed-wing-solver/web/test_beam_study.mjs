// Study files, share links, A/B comparison and CSV: round trips, versions and hostile input.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), B=require('./beam_learning_engine.js'), S=require('./beam_study.js');
let checks=0;
const ok=(v,m)=>{assert.ok(v,m);checks++;};
const refuse=(fn,re)=>{assert.throws(fn,re);checks++;};
const eq=(a,b,m)=>{assert.equal(a,b,m);checks++;};
const model={length:450,E:2000,density:1.24,elements:30,section:{shape:'box',width:16,height:20,thickness:2},
  supports:[{x:0,kind:'pin'},{x:300,kind:'roller'}],hinges:[],loads:[{kind:'point',position:450,force:2},{kind:'moment',position:100,moment:-30},{kind:'distributed',start:0,end:300,qStart:.001,qEnd:.003}],selfWeight:true};
const r=B.solve(model);

// Export -> import round trip: same canonical model, results recomputed (never read from the file).
const text=S.exportStudy({result:r,notes:'Max stress at B because …'});
const doc=JSON.parse(text);
assert.equal(doc.format,'mie446-beam-study');assert.equal(doc.version,2);assert.equal(doc.engine,B.VERSION);checks+=3;
assert.deepEqual(doc.model,S.modelFromInput(r.input));checks++;
const back=S.parseStudy(text);
assert.deepEqual(back.model,S.modelFromInput(r.input));assert.equal(back.notes,'Max stress at B because …');assert.equal(back.version,2);checks+=3;
const again=B.solve(back.model);
for(const k of ['x','deflection','moment','shear']) {assert.deepEqual(again[k],r[k]);checks++;}
// Tampered results in the file are ignored on import.
const tampered=JSON.parse(text);tampered.results.maxima.deflection=-999;tampered.results.reactions=[];
assert.deepEqual(S.parseStudy(JSON.stringify(tampered)).model,back.model);checks++;
// A/B snapshots are carried and validated.
const withAB=S.exportStudy({result:r,compare:{A:{label:'A',model:back.model},B:{label:'<script>B</script>',model:{...back.model,E:4000}}}});
const ab=S.parseStudy(withAB);ok(ab.compare.A&&ab.compare.B,'snapshots imported');assert.equal(ab.compare.B.model.E,4000);checks++;

// Versions: newer refused with an explanation; v1 legacy record converted; garbage refused.
refuse(()=>S.parseStudy(JSON.stringify({...doc,version:3})),/newer Beam Lab.*unchanged/);
refuse(()=>S.parseStudy(JSON.stringify({...doc,version:'2'})),/version/);
refuse(()=>S.parseStudy(JSON.stringify({...doc,version:0})),/version/);
refuse(()=>S.parseStudy(JSON.stringify({...doc,format:'other'})),/not an MIE 446/);
refuse(()=>S.parseStudy('{"format":"mie446-beam-study"'),/not a valid JSON/);
refuse(()=>S.parseStudy('[1,2,3]'),/does not contain/);
refuse(()=>S.parseStudy('x'.repeat(S.LIMITS.fileBytes+1)),/too large/);
refuse(()=>S.parseStudy(42),/must be text/);
const legacyRecord={input:{length:450,width:16,height:8,E:2200,density:1.24,support:'simply-supported',simpleArrangement:'roller-left',elements:30,
  loads:[{kind:'distributed',start:0,end:450,qStart:.001,qEnd:.002}],leftSupport:'roller',rightSupport:'pin'},explanation:'old notes',reactions:[],maxima:{}};
const leg=S.parseStudy(JSON.stringify(legacyRecord));
assert.equal(leg.version,1);assert.equal(leg.legacy,true);assert.deepEqual(leg.model.supports,[{x:0,kind:'roller'},{x:450,kind:'pin'}]);
assert.deepEqual(leg.model.section,{shape:'rectangle',width:16,height:8});assert.equal(leg.notes,'old notes');checks+=5;
const legResult=B.solve(leg.model),hw=B.solve({length:450,width:16,height:8,E:2200,support:'simply-supported',simpleArrangement:'roller-left',elements:30,loads:legacyRecord.input.loads});
assert.deepEqual(legResult.reactions.map(q=>q.force),hw.reactions.map(q=>q.force));checks++;

// Hostile or malformed content: whitelisted copy, physics validation, no prototype pollution.
const hostile=[
  {...model,length:'450'},{...model,length:Infinity},{...model,elements:30.5},{...model,elements:1000},
  {...model,section:{shape:'tube',outerDiameter:20,thickness:15}},{...model,section:{shape:'evil'}},
  {...model,supports:[{x:0,kind:'pin'}]},{...model,supports:[{x:0,kind:'roller'},{x:450,kind:'roller'}]},
  {...model,supports:Array.from({length:50},(_,i)=>({x:i,kind:'pin'}))},{...model,loads:Array.from({length:31},()=>({kind:'point',position:1,force:1}))},
  {...model,loads:[{kind:'point',position:1e9,force:1}]},{...model,loads:[{kind:'exec',position:1,force:1}]},{...model,hinges:['100']},{...model,selfWeight:'true'}];
for(const m of hostile) refuse(()=>S.parseStudy(JSON.stringify({...doc,model:m})));
// Files and links accept the same number of loads as the Beam Lab load form (12).
eq(S.LIMITS.loads,12,'one load limit for the form, files and links');
const twelve=Array.from({length:12},(_,i)=>({kind:'point',position:10+30*i,force:0.1}));
eq(S.parseStudy(JSON.stringify({...doc,model:{...model,loads:twelve}})).model.loads.length,12,'12 loads accepted');
refuse(()=>S.parseStudy(JSON.stringify({...doc,model:{...model,loads:[...twelve,{kind:'point',position:400,force:0.1}]}})),/at most 12|Loads/);
const polluted=JSON.parse(text.replace('"model": {','"model": {"__proto__": {"polluted": true}, "constructor": {"prototype": {"polluted": true}},'));
const parsed=S.parseStudy(JSON.stringify(polluted));
ok(({}).polluted===undefined&&Object.prototype.polluted===undefined,'no prototype pollution');
assert.deepEqual(Object.keys(parsed.model).sort(),['E','density','elements','hinges','length','loads','section','selfWeight','supports']);checks++;
const extra=JSON.parse(text);extra.model.supports[0].onload='alert(1)';extra.model.section.color='red';extra.model.loads[0].script='x';
const clean=S.parseStudy(JSON.stringify(extra)).model;
assert.deepEqual(Object.keys(clean.supports[0]),['x','kind']);assert.deepEqual(Object.keys(clean.loads[0]).sort(),['force','kind','position']);
assert.equal(clean.section.color,undefined);checks+=3;
// Notes stay plain text: control characters stripped, length capped, markup escaped when shown.
const notes='<img src=x onerror=alert(1)>\u0000\u0007 ok'+'z'.repeat(5000);
const n=S.parseStudy(S.exportStudy({result:r,notes})).notes;
assert.equal(n.length,S.LIMITS.notes);ok(!/[\u0000\u0007]/.test(n),'control characters removed');
assert.equal(S.escapeHtml('<img src=x onerror="a">&\''),'&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;');checks++;
refuse(()=>S.parseStudy(JSON.stringify({...doc,notes:{toString:1}})),/text/);

// Share links: exact round trip, size/charset/version checks, never a partial model.
const token=S.encodeShare(back.model);
ok(/^[A-Za-z0-9_-]+$/.test(token),'URL-safe token');
assert.deepEqual(S.decodeShare(token),back.model);checks++;
const url=new URL(S.shareUrl(back.model,'https://ehsan-roohi.github.io/Aerospace-Structures/wing-lab.html?beamCase=l03-tip#d520'));
assert.equal(url.searchParams.get('beamCase'),null);assert.equal(url.hash,'');assert.deepEqual(S.decodeShare(url.searchParams.get('beam')),back.model);checks+=3;
const enc=o=>Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
refuse(()=>S.decodeShare(enc({v:3,m:back.model})),/newer Beam Lab/);
refuse(()=>S.decodeShare(enc({v:1,m:back.model})),/Unsupported/);
refuse(()=>S.decodeShare(enc({m:back.model})),/version/);
refuse(()=>S.decodeShare(enc({v:2,m:{...back.model,supports:[]}})),/Unstable/);
refuse(()=>S.decodeShare('abc$<>'),/invalid characters/);
refuse(()=>S.decodeShare(token.slice(0,30)),/damaged|version|missing/);
refuse(()=>S.decodeShare('A'.repeat(S.LIMITS.shareChars+1)),/too long/);
refuse(()=>S.decodeShare(''),/empty/);
refuse(()=>S.decodeShare(enc('just a string')),/version/);
// The largest valid study (12 supports, 6 hinges, the maximum number of full-precision loads) still fits in a link.
const xs=Array.from({length:12},(_,i)=>450*i/11);
const biggest={...back.model,selfWeight:false,supports:xs.map((x,i)=>({x,kind:i===0?'pin':'roller'})),hinges:xs.slice(1,7),
  loads:Array.from({length:S.LIMITS.loads},(_,i)=>({kind:'distributed',start:i/3.7,end:i/3.7+0.123456789123,qStart:1.2345678912345e-3,qEnd:-9.876543219876e-4}))};
const big=S.encodeShare(biggest);ok(big.length<S.LIMITS.shareChars,`largest valid study fits in a link (${big.length} chars)`);
assert.deepEqual(S.decodeShare(big),S.sanitizeModel(biggest));checks++;

// A/B differences: changed inputs listed; loads (including self-weight) flagged when they differ.
const a2={...back.model,selfWeight:false}, b2={...a2,section:{shape:'rectangle',width:20,height:10}};
let d=S.diffModels(a2,b2);assert.deepEqual(d.changes.map(c=>c.key),['section']);assert.equal(d.loadsDiffer,false);checks+=2;
d=S.diffModels(a2,{...a2,loads:[...a2.loads].reverse()});assert.equal(d.changes.length,0,'load order is not a change');checks++;
d=S.diffModels(a2,{...a2,loads:[{kind:'point',position:450,force:3}]});assert.equal(d.loadsDiffer,true);checks++;
d=S.diffModels({...a2,selfWeight:true},{...b2,selfWeight:true});assert.equal(d.loadsDiffer,true,'self-weight changes with the section');assert.equal(d.selfWeightChanges,true);checks+=2;
d=S.diffModels(a2,{...a2,E:4000,supports:[{x:0,kind:'fixed'}],hinges:[200]});assert.deepEqual(d.changes.map(c=>c.key),['E','supports','hinges']);checks++;

// CSV: header, one row per sample, left/right limits marked at jumps, plain numbers only.
const csv=S.resultsCsv(r).trim().split('\r\n');
assert.equal(csv[0],'x_mm,side,v_mm,theta_rad,V_N,M_Nmm,sigma_top_MPa,sigma_bottom_MPa,tau_max_MPa');assert.equal(csv.length,r.x.length+1);checks+=2;
ok(csv.slice(1).every(line=>/^[-0-9.e+]+,(left|right|),([-0-9.e+]+,){6}[-0-9.e+]+$/.test(line)),'numeric CSV rows');
const sides=csv.slice(1).map(l=>l.split(',')[1]);assert.equal(sides.filter(x=>x==='left').length,sides.filter(x=>x==='right').length);checks++;
const rc=S.reactionsCsv(r).trim().split('\r\n');assert.equal(rc.length,1+r.reactions.length);assert.ok(rc[1].startsWith('0,pin,'));checks+=2;
console.log(`Study files and links: ${checks} round-trip, version, legacy, hostile-input, URL, A/B-diff and CSV checks passed.`);
