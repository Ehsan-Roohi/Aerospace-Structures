// Export a matched 1-g baseline from the existing verified structural engine.
// The aircraft viewer uses this small profile, not another independent solver.
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
const require=createRequire(import.meta.url), E=require('./metal_wing_engine.js');
const input={n:1,collapse:false,modes:false};
const r=E.solve(input);
const data={engine:E.VERSION,case:'D.520 default 1-g linear static model with inertia relief',
  note:'Assumed gauges, material, mass and supports; not a measured deformation or airworthiness assessment. Scaling n does not recompute aerodynamics or postbuckling.',
  frame:'D520_ATTITUDE local: X=span, Y=structural z+1.845, Z=structural x-2.380; metres',
  input:r.input,fittingY:r.P.fittingY,tip:r.tip,
  structure:{sparFraction:r.P.sparX,falseSparFraction:r.P.falseSparX,
    ribs:r.ribs.map(b=>({y:b.y,number:b.rib})),
    stations:r.stations.map(s=>{const {sec,load}=E.sectionAt(r,s.y);return {
      y:s.y,xc:sec.xc,zc:sec.zc,
      sx:E.sigmaAt(sec,s.M,sec.xc+1,sec.zc)/1e6,
      sz:E.sigmaAt(sec,s.M,sec.xc,sec.zc+1)/1e6,
      nodes:sec.nodes.map(p=>[p.x,p.z]),
      walls:sec.walls.map((w,j)=>({a:w.a,b:w.b,kind:w.surf,tau:load.tau[j]/1e6})),
      caps:sec.items.filter(p=>p.kind==='boom').map(p=>({x:p.x,z:p.z,width:sec.bw,thickness:sec.tf,sigma:E.sigmaAt(sec,s.M,p.x,p.z)/1e6})),
      stringers:sec.items.filter(p=>p.kind==='stringer').map(p=>({x:p.x,z:p.z,height:sec.hS,sigma:E.sigmaAt(sec,s.M,p.x,p.z)/1e6})),
      M:s.M,V:s.V,T:s.T,noseOpen:sec.noseOpen};})},
  stations:r.stations.map(s=>{const {sec,props}=E.sectionAt(r,s.y);return {
    y:s.y,w:s.w,wBend:s.wBend,wShear:s.wShear,slope:s.slope,twist:s.twist,
    axisHeight:sec.zc+1.845,axisChord:props.xsc-2.380};})};
writeFileSync(new URL('../../../docs/d520/wing_deformation_profile.json',import.meta.url),JSON.stringify(data,null,2)+'\n');
console.log(`D.520 deformation profile: ${data.stations.length} stations, engine ${E.VERSION}.`);
