// Exercise presets and independent closed-form checks against the existing BeamLab engine.
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'../../..');
const B=require(root+'/computational/printed-wing-solver/web/beam_learning_engine.js');
const S=require(root+'/computational/printed-wing-solver/web/beam_study.js');
const base={length:7500,E:600,density:1.8,elements:40,section:{shape:'tube',outerDiameter:1100,thickness:200},supports:[{x:0,kind:'fixed'}],hinges:[],selfWeight:false,loads:[{kind:'point',position:7500,force:1000}]};
let rows=[],links={};
for(const [name,factor] of [['baseline',1],['softer',.8],['stiffer',1.2]]) {
 const m={...base,E:base.E*factor},r=B.solve(m);
 const I=Math.PI/64*(1100**4-700**4), A=Math.PI/4*(1100**2-700**2);
 const d=1000*7500**3/(3*m.E*I), f=1.875104068711961**2/(2*Math.PI*7.5**2)*Math.sqrt(m.E*1e6*(I*1e-12)/(1800*A*1e-6));
 assert(Math.abs(r.deflection.at(-1)/d-1)<1e-6);
 assert(Math.abs(r.modes[0].frequencyHz/f-1)<.005);
 const saved=S.exportStudy({result:r,notes:'Educational uniform-tube surrogate; not a surveyed monument model.',savedAt:'2026-11-07T16:00:00Z'});
 fs.writeFileSync(path.join(__dirname,name+'.json'),JSON.stringify(saved,null,2));
 links[name]=S.shareUrl(m,'https://ehsan-roohi.github.io/Aerospace-Structures/wing-lab.html');
 assert.deepStrictEqual(S.decodeShare(new URL(links[name]).searchParams.get('beam')),S.sanitizeModel(m));
 rows.push({name,E_MPa:m.E,tip_mm:r.deflection.at(-1),frequency_Hz:r.modes[0].frequencyHz,analytical_Hz:f,stiffness_N_per_m:1000/(d/1000)});
}
fs.writeFileSync(path.join(__dirname,'beamlab_links.json'),JSON.stringify(links,null,2));
fs.writeFileSync(path.join(__dirname,'beamlab_checks.json'),JSON.stringify(rows,null,2));
console.log(rows);
