import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),B=require('./beam_learning_engine.js'),S=require('./beam_study.js');
let checks=0;const valid={length:450,E:2000,density:1.24,elements:30,section:{shape:'rectangle',width:20,height:10},supports:[],hinges:[],loads:[{kind:'point',position:225,force:2}],selfWeight:false};
const serialize=model=>S.exportDraft({model,notes:'Student note <not markup>',savedAt:'fixed-for-test'});
for(const supports of [[],[{x:0,kind:'pin'}],[{x:0,kind:'roller'},{x:450,kind:'roller'}]]){
 const text=serialize({...valid,supports}),doc=JSON.parse(text),p=S.parseStudy(text);assert.equal(doc.state,'draft');assert.equal(doc.results,null);assert.equal(p.draft,true);assert.deepEqual(p.model.supports,supports);assert.throws(()=>B.solve(p.model),e=>e.code==='mechanism');checks+=5;
}
const doc=JSON.parse(serialize(valid));
const badModels=[
 {...valid,E:-1},{...valid,E:'2000'},{...valid,E:null},{...valid,length:0},{...valid,density:0},{...valid,elements:3},{...valid,elements:101},{...valid,elements:30.5},
 {...valid,section:{shape:'unrecognized'}},{...valid,section:{shape:'rectangle',width:20,height:-1}},{...valid,section:{shape:'tube',outerDiameter:20,thickness:15}},
 {...valid,supports:[{x:451,kind:'pin'}]},{...valid,supports:[{x:0,kind:'free'}]},{...valid,hinges:[0]},{...valid,hinges:['225']},{...valid,selfWeight:'false'},
 {...valid,loads:[{kind:'point',position:451,force:2}]},{...valid,loads:[{kind:'point',position:225,force:null}]},{...valid,loads:[{kind:'moment',position:225}]},
 {...valid,loads:[{kind:'table',points:[[200,1],[100,2]]}]},{...valid,loads:[{kind:'distributed',start:100,end:100,qStart:1,qEnd:2}]},
 {...valid,loads:[{kind:'elliptic',start:0,end:450,shape:'start',total:2,peak:1}]},{...valid,loads:Array.from({length:13},()=>({kind:'point',position:100,force:1}))}
];
for(const model of badModels){assert.throws(()=>serialize(model));assert.throws(()=>S.parseStudy(JSON.stringify({...doc,model})));checks+=2;}
for(const state of ['',null,{},[],true,0,'unknown']){assert.throws(()=>S.parseStudy(JSON.stringify({...doc,state})),/state/);checks++;}
for(const version of [0,'2',S.VERSION+1]){assert.throws(()=>S.parseStudy(JSON.stringify({...doc,version})),/version|newer/);checks++;}
const polluted=JSON.parse(JSON.stringify(doc));polluted.model.__proto__={polluted:true};polluted.results={model:{E:999},deflection:[999]};const parsed=S.parseStudy(JSON.stringify(polluted));assert.equal(parsed.model.E,2000);assert.equal(parsed.model.loads[0].force,2);assert.equal(({}).polluted,undefined);checks+=3;
const stable={...valid,supports:[{x:0,kind:'fixed'}]},solved=S.exportStudy({result:B.solve(stable)}),roundtrip=S.parseStudy(solved);assert.equal(roundtrip.draft,undefined);assert.deepEqual(roundtrip.model,S.sanitizeModel(stable));assert.throws(()=>S.sanitizeModel(valid),/Unstable/);checks+=3;
console.log(`Beam working-draft schema: ${checks} instability-only relaxation, strict numeric/section/topology/load/state/version gates, cached-result rejection and legacy solved-file checks passed.`);
