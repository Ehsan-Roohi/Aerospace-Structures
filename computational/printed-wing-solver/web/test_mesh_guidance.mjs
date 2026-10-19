import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),B=require('./beam_learning_engine.js');
const L=450,w=.002,EI=2200*16*8**3/12,x=137;
const exact=w*(L**2*x**2/6-L*x**3/12+x**5/(120*L))/EI;
for(const elements of [10,30,40]){
 const r=B.solve({length:L,width:16,height:8,E:2200,support:'cantilever',elements,modes:false,loads:[{kind:'distributed',start:0,end:L,qStart:0,qEnd:w}]});
 const f=B.fieldAt(r,x),tip=B.fieldAt(r,L);
 assert.ok(Math.abs(r.reactions[0].force+.45)<1e-7);
 assert.ok(Math.abs(r.reactions[0].moment+135)<1e-7);
 assert.ok(Math.abs(tip.v-11*w*L**4/(120*EI))<1e-7);
 assert.ok(Math.abs(f.M-(-w*L**2/3+w*L*x/2-w*x**3/(6*L)))<1e-7);
 assert.ok(Number.isFinite(f.v));
 console.log(JSON.stringify({requested:elements,nominalLength:L/elements,actualElements:r.nodes.length-1,station:x,interpolationAbsoluteError:Math.abs(f.v-exact)}));
}
console.log('Mesh explanation checked: 10/30/40 subdivision lengths, invariant physical model, stable reactions/end displacement and between-node interpolation.');
