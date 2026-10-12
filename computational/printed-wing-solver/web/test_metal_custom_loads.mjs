import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),E=require('./metal_wing_engine.js');
const near=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<=tol*Math.max(1,Math.abs(b)),`${a} vs ${b}`);
const cases=[
  [{kind:'point',position:3,force:1000,fraction:.25}],
  [{kind:'distributed',start:1,end:4,qStart:1000,qEnd:1000,fraction:.25}],
  [{kind:'distributed',start:1,end:4,qStart:0,qEnd:1000,fraction:.25}],
  [{kind:'distributed',start:1,end:4,qStart:1000,qEnd:0,fraction:.25}],
  [{kind:'distributed',start:1,end:4,qStart:500,qEnd:1500,fraction:.25}],
];
const expected=[[1000,3000],[3000,7500],[1500,4500],[1500,3000],[3000,8250]];
for(let i=0;i<cases.length;i++){
  const d=E.customDemand(cases[i],0);near(d.V,expected[i][0]);near(d.M,expected[i][1]);
  const r=E.solve({customLoads:cases[i],n:1,collapse:false,modes:false});
  assert.equal(r.input.inertiaRelief,false);assert.equal(r.alphaDeg,null);
  const yf=r.P.fittingY;near(r.perG.V(yf),d.V);near(r.perG.M(yf),d.M-yf*d.V);
  assert.ok(Number.isFinite(r.tip.wMax)&&Number.isFinite(r.tip.twistDeg));
  const downstream=E.customDemand(cases[i],2.1234);near(r.perG.V(2.1234),downstream.V);near(r.perG.M(2.1234),downstream.M);
}
const loads=[...cases[1],{kind:'point',position:3,force:-800,fraction:.7}];
const a=E.solve({customLoads:loads,n:1,collapse:false,modes:true}),b=E.solve({customLoads:loads,n:2,collapse:false,modes:true});
near(b.tip.wMax,2*a.tip.wMax);near(b.tip.twistDeg,2*a.tip.twistDeg);near(a.fem.fBending[0],b.fem.fBending[0]);
const opposite=E.solve({customLoads:[{kind:'point',position:3,force:1000,fraction:.25},{kind:'point',position:3,force:-1000,fraction:.7}],n:1,collapse:false,modes:false});
near(opposite.perG.V(1),0);near(opposite.perG.M(1),0);near(opposite.perG.T(1),1000*.45*opposite.wing.chord(3));
for(const bad of [[{...cases[0][0],position:-1}],[{...cases[0][0],fraction:1.2}],[{...cases[1][0],end:.5}],[{...cases[0][0],force:NaN}]])assert.throws(()=>E.normalise({customLoads:bad}));
const empty=E.solve({customLoads:[],n:1,collapse:false,modes:false});near(empty.tip.wMax,0);near(empty.tip.twistDeg,0);
const N=4096,fs=1024,samples=Array.from({length:N},(_,i)=>2*Math.cos(2*Math.PI*32*i/fs)+.4*Math.cos(2*Math.PI*85*i/fs)+10),fft=E.vibrationSpectrum(samples,fs);
near(fft.amplitude[128],2,1e-9);near(fft.amplitude[340],.4,1e-9);near(fft.resolution,.25);near(fft.nyquist,512);assert.throws(()=>E.vibrationSpectrum([1,2,3],100));assert.throws(()=>E.vibrationSpectrum(samples,-1));
console.log('PASS D520 custom point/uniform/two triangles/trapezoid, exact resultants, signed superposition, torque couple, deformation scaling, unchanged linear frequencies, invalid/empty cases and FFT amplitude/frequency benchmarks.');
