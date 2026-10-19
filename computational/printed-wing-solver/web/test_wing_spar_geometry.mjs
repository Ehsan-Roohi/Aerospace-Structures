// Actual THREE geometry/triangulation, not a WebGL renderer or screenshot test.
import assert from 'node:assert/strict';import{createRequire}from'node:module';import{readFileSync}from'node:fs';import vm from'node:vm';import path from'node:path';
const require=createRequire(import.meta.url),modulePath=process.env.MIE446_THREE_MODULE||'three',loaded=require(modulePath),THREE=loaded.Matrix4?loaded:require(path.join(path.dirname(require.resolve(modulePath)),'three.cjs')),E=require('./engine.js'),S=require('./wing_spars.js');
const src=readFileSync(new URL('./wing_lab_template.html',import.meta.url),'utf8'),ctx={THREE};vm.createContext(ctx);
vm.runInContext(src.slice(src.indexOf('  function swept('),src.indexOf('  function buildModel('))+'\nthis.makePlate=platePart;this.makeSweep=swept;',ctx);
const spec={fraction:.35,length:350,topWidth:8,topThickness:.8,bottomWidth:10,bottomThickness:1,webThickness:.6,material:S.MAT};
const g=E.makeGeometry({modules:1,rodFractions:[],spars:[spec]});let tests=0;
for(const y of [0,100,300,350]){
 const ps=E.sparParts(g,y),outer=E.outerContour(g,y),shape=ctx.makePlate(outer,ps.map(p=>p.outline),1.6,y,0xffffff),geo=shape.geometry;
 const pos=geo.attributes.position;let vol=0;
 for(let i=0;i<pos.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(pos,i),b=new THREE.Vector3().fromBufferAttribute(pos,i+1),c=new THREE.Vector3().fromBufferAttribute(pos,i+2);vol+=a.dot(b.cross(c))/6;}
 const expected=(S.polygon(outer)[0]-ps.reduce((a,p)=>a+S.polygon(p.outline)[0],0))*1.6;
 assert.ok(Math.abs(Math.abs(vol)-expected)<expected*1e-4,`rib cutout volume at ${y}: ${vol} vs ${expected}`);
 assert.ok([...pos.array].every(Number.isFinite));tests+=2;geo.dispose();shape.material.dispose();
}
const stations=Array.from({length:31},(_,i)=>spec.length*i/30);
for(let k=0;k<3;k++){
 const loops=stations.map(y=>E.sparParts(g,y)[0].polygons[k]);assert.ok(loops.every(p=>p.length===loops[0].length));
 const mesh=ctx.makeSweep(stations,y=>E.sparParts(g,y)[0].polygons[k],{}),u=mesh.userData,p=mesh.geometry.attributes.position.array;
 for(let i=0;i<u.by.length;i++){p[3*i]=u.by[i];p[3*i+1]=u.bz[i];p[3*i+2]=u.bx[i];}
 mesh.geometry.computeBoundingSphere();assert.ok(Number.isFinite(mesh.geometry.boundingSphere.radius)&&mesh.geometry.boundingSphere.radius>0);assert.equal(Math.max(...u.by),350);tests+=3;
 mesh.geometry.dispose();mesh.material.dispose();
}
console.log(`Spar THREE geometry: ${tests} rib-hole volume, cap/web sweep topology, finite vertex and length checks passed (not WebGL pixel QA).`);
