'use strict';
const assert=require('node:assert/strict'),F=require('../fluid-state.js');
const near=(a,b,t)=>assert.ok(Math.abs(a-b)<t,`${a} versus ${b}`);
// Published IAPWS examples/standard saturation values, SI units; independent of solver.
near(F.water(.01).pc,611.657,.002);
near(F.water(20).pc,2339.2,.5);near(F.water(20).rho,998.16,.02);
near(F.water(40).pc,7385.1,1);near(F.water(40).rho,992.22,.05);
near(F.water(80).pc,47415,10);near(F.water(80).rho,971.8,.1);
const a=F.target({mode:'physical',temperatureC:20,U:20,pInf:101325}),b=F.target({mode:'sigma',temperatureC:20,U:20,sigma:a.sigma});
near(a.pInf,b.pInf,1e-9);near(a.sigma,(a.pInf-a.pc)/(.5*a.rho*a.U**2),1e-15);
for(const t of [-1,0,81,NaN,Infinity])assert.throws(()=>F.water(t));
for(const x of [{mode:'physical',temperatureC:20,U:20,pInf:100},{mode:'sigma',temperatureC:20,U:20,sigma:0},{mode:'physical',temperatureC:20,U:0,pInf:101325},{mode:'other',U:5}])assert.throws(()=>F.target(x));
console.log('Fresh-water pressure/density, sigma/physical roundtrip and rejection tests passed.');
