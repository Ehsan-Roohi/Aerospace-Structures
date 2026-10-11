import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join,dirname} from 'node:path';
const require=createRequire(import.meta.url);
const threeModule=process.env.MIE446_THREE_MODULE ? join(process.env.MIE446_THREE_MODULE,'build/three.module.js') : join(dirname(require.resolve('three')),'three.module.js');
const THREE=await import(pathToFileURL(threeModule).href);
const {JSDOM}=require(process.env.MIE446_JSDOM_MODULE || 'jsdom');
const D=require(fileURLToPath(new URL('../../../docs/d520/wing_deformation.js',import.meta.url)));
const S=require(fileURLToPath(new URL('../../../docs/d520/wing_structure.js',import.meta.url)));
globalThis.D520WingStructure=S;
const E=require('./metal_wing_engine.js');
const profile=JSON.parse(readFileSync(new URL('../../../docs/d520/wing_deformation_profile.json',import.meta.url)));
D.validate(profile);const solved=E.solve({n:1,collapse:false,modes:false});
assert.equal(profile.engine,E.VERSION);assert.equal(profile.stations.length,solved.stations.length);
const close=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
for(let i=0;i<profile.stations.length;i++){
  const p=profile.stations[i],s=solved.stations[i],a=E.sectionAt(solved,s.y);
  for(const k of ['y','w','slope','twist'])close(p[k],s[k]);
  close(p.axisChord,a.props.xsc-2.380);close(p.axisHeight,a.sec.zc+1.845);
  const ss=profile.structure.stations[i];close(ss.y,s.y);
  for(const nd of ss.nodes){close(S.normal(ss,...nd),E.sigmaAt(a.sec,s.M,...nd)/1e6,1e-7);}
  assert.equal(ss.walls.length,a.sec.walls.length);
  ss.walls.forEach((w,j)=>close(w.tau,a.load.tau[j]/1e6,1e-7));
}
assert.equal(profile.structure.ribs.length,22);assert.equal(profile.structure.sparFraction,0.37);assert.equal(profile.structure.falseSparFraction,0.73);
const ss=profile.structure.stations.find(s=>s.y>2),ww=ss.walls.filter(w=>w.kind==='u').reduce((a,b)=>ss.nodes[b.a][1]>ss.nodes[a.a][1]?b:a),[xx,zz]=ss.nodes[ww.a];
const probe=[ss.y,zz+1.845,xx-2.380],v1=S.stressAt(profile,probe,1),v6=S.stressAt(profile,probe,6),vn=S.stressAt(profile,probe,-3);
assert.ok(v1);close(v6.sigma,6*v1.sigma,1e-7);close(vn.sigma,-3*v1.sigma,1e-7);close(vn.vm,3*v1.vm,1e-7);
assert.ok(v1.sigma<0,'positive-g upper skin compression');
assert.equal(S.stressAt(profile,[6,0,0]),null,'tip cap unavailable');assert.equal(S.stressAt(profile,[ss.y,zz+1.845,10]),null,'aft region unavailable');
assert.throws(()=>D.validate({stations:[{y:0},{y:1}]}));
const station=profile.stations.at(-1), p=[station.y,station.axisHeight,station.axisChord-0.2];
const b=D.deformPoint(p,profile,{mode:'bending',bendScale:1});close(b[1]-p[1],station.w);close(b[2],p[2]);
const t=D.deformPoint(p,profile,{mode:'torsion',twistScale:1});assert.ok(t[1]>p[1],'positive nose-up twist raises the leading edge');
close(Math.hypot(t[1]-station.axisHeight,t[2]-station.axisChord),0.2);
const negative=D.deformPoint(p,profile,{mode:'bending',n:-3});close(negative[1]-p[1],-3*station.w);
const opposite=D.deformPoint([-p[0],p[1],p[2]],profile,{mode:'both'});const positive=D.deformPoint(p,profile,{mode:'both'});
close(opposite[1],positive[1]);close(opposite[2],positive[2]);close(opposite[0],-positive[0]);
// Load the real GLB node transforms and geometry without a renderer or texture loader.
const binary=readFileSync(new URL('../../d520-wing/model/export/d520.glb',import.meta.url));
const jsonLength=binary.readUInt32LE(12),gltf=JSON.parse(binary.subarray(20,20+jsonLength));
const start=20+jsonLength+8;
function attribute(id){
  const a=gltf.accessors[id],v=gltf.bufferViews[a.bufferView],size={SCALAR:1,VEC3:3}[a.type];
  const bytes={5121:1,5123:2,5125:4,5126:4}[a.componentType],stride=v.byteStride||size*bytes;
  const out=[];const offset=start+(v.byteOffset||0)+(a.byteOffset||0);
  for(let i=0;i<a.count;i++)for(let k=0;k<size;k++){
    const at=offset+i*stride+k*bytes;
    out.push(a.componentType===5126?binary.readFloatLE(at):a.componentType===5125?binary.readUInt32LE(at):a.componentType===5123?binary.readUInt16LE(at):binary.readUInt8(at));
  }
  return out;
}
const objects=gltf.nodes.map(n=>{
  let o;
  if(n.mesh!=null){const p=gltf.meshes[n.mesh].primitives[0],g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(attribute(p.attributes.POSITION),3));
    if(p.attributes.NORMAL!=null)g.setAttribute('normal',new THREE.Float32BufferAttribute(attribute(p.attributes.NORMAL),3));
    if(p.indices!=null)g.setIndex(attribute(p.indices));
    o=new THREE.Mesh(g,new THREE.MeshStandardMaterial());
  }else o=new THREE.Group();
  o.name=n.name||'';if(n.translation)o.position.fromArray(n.translation);if(n.rotation)o.quaternion.fromArray(n.rotation);if(n.scale)o.scale.fromArray(n.scale);
  if(n.matrix){o.matrix.fromArray(n.matrix);o.matrix.decompose(o.position,o.quaternion,o.scale);}
  return o;
});
gltf.nodes.forEach((n,i)=>(n.children||[]).forEach(child=>objects[i].add(objects[child])));
const aircraft=new THREE.Group();gltf.scenes[gltf.scene||0].nodes.forEach(i=>aircraft.add(objects[i]));
const scene=new THREE.Scene();scene.add(aircraft);
const frame=objects.find(o=>o.name==='D520_ATTITUDE');
const untouched=objects.filter(o=>o.isMesh && !D.wingMember(o,frame)).map(o=>[o,o.geometry.attributes.position.array.slice()]);
const html=readFileSync(new URL('../../../docs/d520/index.html',import.meta.url),'utf8');
const dom=new JSDOM(html,{pretendToBeVisual:true}),doc=dom.window.document,q=s=>doc.querySelector(s);
try{
  const camera=new THREE.PerspectiveCamera(),controls={target:new THREE.Vector3(),update(){}};
  const controller=await D.mount({THREE,root:aircraft,frame,scene,camera,controls,document:doc,profile});
  assert.equal(controller.records.length,6,'actual left/right wings, flaps and ailerons');
  const originalMaterials=controller.records.map(r=>r.material);
  assert.ok(controller.structure);assert.equal(controller.structure.meshes.length,3);
  for(const mode of ['bending','torsion','both']){
    q(`[data-wing-flex="${mode}"]`).click();let changed=0;
    for(const r of controller.records){
      assert.equal(r.ghost.visible,true);const coords=r.mesh.geometry.attributes.position.array;
      assert.ok(coords.every(Number.isFinite));assert.ok(r.mesh.geometry.attributes.normal.array.every(Number.isFinite));
      if(coords.some((v,i)=>Math.abs(v-r.positions[i])>1e-5))changed++;
    }
    assert.equal(changed,6,`${mode}: all six real wing members deform`);
  }
  q('#wing-flex-n').value='-3';controller.update();assert.match(q('#wing-flex-values').textContent,/-0\.242/);
  q('#wing-flex-reference').checked=false;controller.update();assert.ok(controller.records.every(r=>!r.ghost.visible));
  // The reference remains in the same control-surface pose if a hinge moves.
  objects.find(o=>o.name==='Hinge_Aileron_R').rotation.x=0.15;controller.update();
  for(const r of controller.records)assert.ok(r.ghost.matrix.equals(r.mesh.matrixWorld));
  q('[data-wing-flex="original"]').click();
  controller.records.forEach((r,i)=>{assert.deepEqual(r.mesh.geometry.attributes.position.array,r.positions);assert.deepEqual(r.mesh.geometry.attributes.normal.array,r.normals);assert.equal(r.mesh.material,originalMaterials[i]);assert.equal(r.ghost.visible,false);});
  q('#wing-flex-n').value='1';q('#wing-stress-field').value='sigma';controller.update();
  const primary=controller.records.filter(r=>/^Wing_[LR]$/.test(r.mesh.name));
  for(const r of primary){const color=r.mesh.geometry.attributes.color.array;assert.ok(color.every(Number.isFinite));assert.ok(color.some((v,i)=>i%3===2&&v>color[i-2]+0.02),'compression blue present');assert.equal(r.mesh.material,r.stressMaterial);}
  const skinColors=primary[0].mesh.geometry.attributes.color.array.slice();
  q('[data-wing-flex="both"]').click();assert.deepEqual(primary[0].mesh.geometry.attributes.color.array,skinColors,'stress independent of magnification');
  const im=controller.structure.meshes.find(r=>r.kind==='spars');assert.ok(im.mesh.geometry.attributes.position.array.some((v,i)=>Math.abs(v-im.base[i])>1e-5),'internal members deform');
  q('#wing-cutaway').click();assert.equal(q('#wing-skin-view').value,'hidden');assert.equal(controller.structure.internal.visible,true);assert.ok(primary.every(r=>!r.mesh.visible&&!r.ghost.visible));
  q('#wing-show-ribs').checked=false;controller.update();assert.equal(controller.structure.meshes.find(r=>r.kind==='ribs').mesh.visible,false);
  q('#wing-show-ribs').checked=true;q('#wing-stress-field').value='tau';controller.update();assert.equal(controller.structure.meshes.find(r=>r.kind==='ribs').mesh.material,controller.structure.meshes.find(r=>r.kind==='ribs').mat,'ribs never receive fabricated stress');
  q('#wing-load-path').value='ribs';controller.update();assert.match(q('#wing-load-path-text').textContent,/does not solve rib stress/);
  q('#wing-skin-view').value='transparent';controller.update();assert.ok(primary.every(r=>r.mesh.visible&&r.mesh.material.transparent));
  q('#wing-stress-field').value='off';q('#wing-skin-view').value='solid';q('[data-wing-flex="original"]').click();assert.ok(primary.every(r=>r.mesh.material===r.material&&r.mesh.visible));
  for(const [o,positions] of untouched)assert.deepEqual(o.geometry.attributes.position.array,positions,'fuselage/tail/gear unchanged');
  q('#wing-flex-front').click();close(camera.position.z,-17);
  assert.ok(html.indexOf('src="wing_deformation.js"')<html.indexOf('<script>show('));
  console.log(`PASS: matched engine stress/profile; signed scaling and unknown regions; all six real GLB wing members deform; internal members follow deformation; cutaway/layer switches; ribs have no fabricated stress; fixed colour scale independent of magnification; exact restoration; unchanged fuselage/tail/gear.`);
}finally{dom.window.close();delete globalThis.D520WingStructure;}
