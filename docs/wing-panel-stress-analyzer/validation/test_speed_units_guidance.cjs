// Display conversions never rescale the entered physical flow or relax admission.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const app=path.resolve(__dirname,'..'),c=vm.createContext({module:{exports:{}},console,performance});
vm.runInContext(fs.readFileSync(path.join(app,'wing-aero/aero_bundle.js'),'utf8'),c);
const A=c.module.exports;
vm.runInContext(fs.readFileSync(path.join(app,'ui/wing-aero-ui.js'),'utf8'),c);
const U=c.module.exports;
assert.equal(U.speedUnits(50),'180 km/h · input is in m/s');
assert.equal(U.speedUnits(25),'90 km/h · input is in m/s');
assert.match(U.speedUnits(70/3.6),/^70 km\/h/);
for(const bad of ['',null,undefined,NaN,-1,Infinity])assert.match(U.speedUnits(bad),/Enter speed in m\/s/);
for(const speed of [50,80]){
  const flow={speed,density:1.225,alphaDeg:2,viscosity:1.81e-5,speedOfSound:340.29};
  const normalized=A.normalizeFlow(flow);
  assert.equal(normalized.speed,speed,'km/h readout must not change solver units');
}
const adm={rows:[{kind:'aeroelastic',admitted:false,value:.05563,tolerance:.02}],failed:['One-way coupling: twist effect on lift'],twist:{tipTheta:-.007},sequence:'fine'};
const msg=U.admissionFailure(adm,{flow:{speed:50},liftN:96.884}).message;
assert.match(msg,/not a fixed speed limit/);
assert.match(msg,/aerodynamic solution is retained/);
assert.match(msg,/forces scale with speed squared/);
assert.match(msg,/actual total aircraft weight/);
assert.match(msg,/180 km\/h/);
assert.match(msg,/5\.56%/);
assert.match(msg,/limit is 2%/);
console.log('PASS: m/s input unchanged, live km/h conversion, 50/80 m/s accepted by flow checks, physical coupling guidance and unchanged 2% criterion.');
