import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),P=require('./load_profiles.js'),D=require('./beam_diagrams.js');
const curve={kind:'elliptic',start:50,end:350,shape:'start',total:1000};
const n=P.normalizeCurve(curve,{min:0,max:450,lengthUnit:'mm'});
const html=P.previewFigure(curve,{positive:'down'});
assert.ok(html.includes('Total force F = 1000 N'));assert.ok(html.includes('Independent height'));assert.ok(!/NaN|Infinity|undefined/.test(html));
const shared=P.previewFigure(curve,{scalePeak:2456,positive:'down'});assert.ok(shared.includes('Shared intensity scale'));
const heights=h=>h.match(/data-profile-curve="1" points="([^"]+)"/)[1].split(' ').map(t=>Math.abs(+t.split(',')[1]-112));
assert.ok(Math.max(...heights(html))>66);assert.ok(Math.max(...heights(shared))<1,'same profile can look flat on a much larger shared scale');
const mixed={length:450,supports:[{kind:'fixed',x:0}],hinges:[],loads:[curve,{kind:'distributed',start:100,end:400,qStart:1000,qEnd:2456}]};
const common=D.beamSchematic(mixed,{loadScale:'common'}),independent=D.beamSchematic(mixed,{loadScale:'independent'});
assert.notEqual(common,independent);assert.ok(!/NaN|Infinity/.test(independent));
for(const exponent of [.1,1,2,4,12])for(const shape of ['start','end','middle'])for(const total of [-1000,0,1000]){
 const p=P.powerTable({start:50,end:350,total,exponent,shape}),s=P.stats(p);
 assert.equal(p.points.length,31);assert.ok(Math.abs(s.total-total)<1e-9);
 const csv='x_mm,w_N_per_mm\n'+p.points.map(r=>r.join(',')).join('\n');assert.ok(P.parseCsv(csv,{workspace:'beam',min:0,max:450}).ok);
 assert.ok(!/NaN|Infinity/.test(P.previewFigure(p)));
 if(exponent===1&&shape==='start'&&total)assert.ok(Math.abs(s.centroid-150)<1e-9);
 if(shape==='middle'&&total)assert.ok(Math.abs(s.centroid-200)<1e-9);
}
assert.throws(()=>P.powerTable({start:0,end:1,total:1,exponent:0}));
assert.throws(()=>P.powerTable({start:1,end:1,total:1,exponent:2}));
assert.ok(P.previewFigure({kind:'moment',position:10,moment:-20}).includes('↺'));
const zero=P.previewFigure({kind:'distributed',start:0,end:1,qStart:-1,qEnd:1});assert.ok(zero.includes('not defined (zero net force)'));
assert.ok(!P.previewFigure(curve,{units:{line:'<img src=x>'}}).includes('<img'));
assert.equal(n.total,1000);
console.log('Load previews: exact resultants, common/independent visibility, signed and zero-net loads, safe labels, negative couple, and45 power-law table cases passed.');
