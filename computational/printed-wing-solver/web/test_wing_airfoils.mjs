import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),A=require('./wing_airfoils.js'),E=require('./engine.js');
let checks=0;const near=(a,b,tol=1e-11)=>{checks++;assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`);};
const rejects=(fn,pattern)=>{checks++;assert.throws(fn,pattern);};
for(const code of ['0012','2412','4415','2309','2506'])for(const chord of [100,160])for(const te of [0,.8,1.2]){
  const p=A.normalizeProfile({kind:'naca4',code}),v=A.surfaces(p,chord,te,241),legacy=E.airfoilSurfaces(code,chord,te,241);
  for(const key of ['xu','zu','xl','zl']){assert.deepEqual(v[key],legacy[key]);checks++;}
  for(const x of [0,.05,.25,.5,.9,1]){assert.deepEqual(A.verticalOrdinates(p,x,chord,te),E.verticalOrdinates(code,x,chord,te));checks++;}
}
for(const entry of A.catalog){const p=A.preset(entry.id);assert.ok(Object.isFrozen(p));checks++;const s=A.surfaces(p,160,1.2,161);assert.equal(s.xu.length,161);checks++;if(p.kind==='coordinates'){assert.equal(p.upper.length,161);assert.ok(p.source.url.includes('/coord/'));checks+=2;for(let i=1;i<160;i++)assert.ok(p.upper[i][1]>p.lower[i][1]);}
  const restored=A.normalizeProfile(JSON.parse(JSON.stringify(p)));assert.deepEqual(restored,p);checks++;}
// Five-digit 230 mean-line ordinates independently tabulated by PDAS,
// https://www.pdas.com/meanlines.html (values in percent chord).
const five=A.normalizeProfile({kind:'naca5',code:'23012'});
near(A.camber(five,0).slope,.3051,5e-5);
near(A.camber(five,.15).yc,1.8386/100,5e-7);
near(A.camber(five,1).yc,0);
near(A.camber({kind:'naca5',code:'13012'},.15).yc,A.camber(five,.15).yc/2);
rejects(()=>A.normalizeProfile({kind:'naca5',code:'23112'}),/non-reflex/);
rejects(()=>A.normalizeProfile({kind:'naca5',code:'26012'}),/non-reflex/);
rejects(()=>A.normalizeProfile({kind:'naca4',code:'23012'}),/do not agree/);
rejects(()=>A.normalizeProfile('2000'),/thickness/);
rejects(()=>A.normalizeProfile('2012'),/camber position/);
const selig='Test section\n1 .01\n.5 .1\n0 0\n.5 -.05\n1 -.01\n';
const led='Test section\n3 3\n0 0\n.5 .1\n1 .01\n\n0 0\n.5 -.05\n1 -.01\n';
const p=A.parseDat(selig,{filename:'example.dat'}),q=A.parseDat(led,{filename:'example.dat'});
assert.deepEqual(p.upper,q.upper);assert.deepEqual(p.lower,q.lower);checks+=2;
near(p.upper.at(-1)[1]-p.lower.at(-1)[1],.02);
near(A.surfaces(p,100,1.2).zu.at(-1)-A.surfaces(p,100,1.2).zl.at(-1),1.2);
near(A.surfaces(p,100,0).zu.at(-1)-A.surfaces(p,100,0).zl.at(-1),0);
const reverse=A.parseDat('Reverse\n'+selig.trim().split('\n').slice(1).reverse().join('\n'));
assert.deepEqual(reverse.upper,p.upper);assert.deepEqual(reverse.lower,p.lower);checks+=2;
const dup=A.parseDat(selig.replace('0 0','0 0\n0 0'));
assert.deepEqual(dup.upper,p.upper);assert.deepEqual(dup.lower,p.lower);checks+=2;
const comments=A.parseDat('\uFEFF# initial\r\n'+selig.replace('.5 .1','.5D0 .1 # trailing comment')+'\x1a');assert.deepEqual(comments.upper,p.upper);checks++;
const scaled=A.parseDat('Scaled translated\n12 2.1\n7 3\n2 2\n7 1.5\n12 1.9');
for(let i=0;i<161;i++){near(scaled.upper[i][1],p.upper[i][1]);near(scaled.lower[i][1],p.lower[i][1]);}
const theta=.05,rot=selig.trim().split('\n').slice(1).map(l=>l.split(' ').map(Number)).map(([x,z])=>`${x*Math.cos(theta)-z*Math.sin(theta)} ${x*Math.sin(theta)+z*Math.cos(theta)}`).join('\n');
const rotated=A.parseDat('Rotated\n'+rot);for(let i=0;i<161;i++){near(rotated.upper[i][1],p.upper[i][1]);near(rotated.lower[i][1],p.lower[i][1]);}
rejects(()=>A.parseDat('bad\nNaN 0\n1 1'),/finite coordinates/);
rejects(()=>A.parseDat(led.replace('3 3','4 3')),/counts/);
rejects(()=>A.parseDat(selig.replace('.5 .1','.5 .1\n.6 .12')),/monotonically/);
rejects(()=>A.parseDat('Empty'),/five coordinates/);
rejects(()=>A.parseDat('x'.repeat(262145)),/256 KiB/);
rejects(()=>A.parseDat('Flat\n1 0\n.5 0\n0 0\n.5 0\n1 0'),/pinch|degenerate/);
rejects(()=>A.normalizeProfile({...p,upper:[[0,0],[.5,-.2],[1,.01]]}),/intersect|ordering/);
rejects(()=>A.normalizeProfile({...p,lower:[[0,.02],[.5,-.05],[1,-.01]]}),/closed leading/);
rejects(()=>A.normalizeProfile({...p,upper:[[0,0],[.5,.1],[.5,.2],[1,.01]]}),/monotonically/);
rejects(()=>A.normalizeProfile({...p,source:{url:'javascript:alert(1)'}}),/http/);
rejects(()=>A.normalizeProfile({...p,version:99}),/version/);
// Convex blending retains positive thickness at every common-grid station.
for(const [ia,ib] of [['clarky','ag24'],['naca0012','s1223'],['naca23012','sc20412']])for(const f of [.1,.5,.9]){
  const a=A.preset(ia),b=A.preset(ib),m=A.blendProfiles(a,b,f),surface=A.surfaces(m,1,null,161);for(let i=1;i<160;i++)assert.ok(surface.zu[i]>surface.zl[i]);
  near(A.verticalOrdinates(m,.5).camber,(1-f)*A.verticalOrdinates(a,.5).camber+f*A.verticalOrdinates(b,.5).camber,2e-6);
  assert.equal(A.blendProfiles(a,b,0),a);assert.equal(A.blendProfiles(a,b,1),b);checks+=2;
}
const stations=[{eta:0,airfoil:p},{eta:.4,airfoil:A.preset('clarky')},{eta:1,airfoil:five}];
assert.equal(A.profileAt(stations,0),p);assert.equal(A.profileAt(stations,1),five);assert.equal(A.profileAt(stations,.4),stations[1].airfoil);checks+=3;
assert.equal(A.profileAt(stations,.7).kind,'blend');checks++;
const endpoint=A.surfaces(five,1,null,161),continuous=A.surfaces(A.blendProfiles(five,p,1e-10),1,null,161);
for(const key of ['xu','zu','xl','zl'])for(let i=0;i<161;i++)near(endpoint[key][i],continuous[key][i],1e-9);
rejects(()=>A.normalizeProfile({kind:'blend',a:p,b:q,f:.5}),/Unknown/);
rejects(()=>A.blendProfiles(p,q,-.1),/fraction/);rejects(()=>A.surfaces(p,-1,1),/positive/);rejects(()=>A.surfaces(p,1,-.1),/negative/);rejects(()=>A.surfaces(p,1,0,2),/samples/);
console.log(`Wing airfoil core: ${checks} checks passed, including all 10 offline library entries and exact legacy NACA4 parity.`);
