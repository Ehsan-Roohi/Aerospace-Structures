import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const require=createRequire(import.meta.url),THREE=require((process.env.MIE446_THREE_MODULE||'three')+'/build/three.cjs'),E=require('./engine.js'),WingGeometry=require('./wing_geometry.js');
const source=readFileSync(new URL('./wing_lab_template.html',import.meta.url),'utf8'),fn=source.slice(source.indexOf('  function drawShearCentre(){'),source.indexOf('  function drawLoads() {'));
for(const spatial of [false,true]){
 const geometry={modules:1,rodFractions:[],semiSpan:300,rootChord:160,tipChord:120,...(spatial?{airfoil:{kind:'naca4',code:'2412'},sweepDeg:12,dihedralDeg:5}:{})},R=E.solve({geometry,load:{kind:'tip',tipForce:1},nElements:8,nSections:3,nGrid:11});
 const group=new THREE.Group(),ctx={THREE,E,WingGeometry,R,model:{shearCentre:group},showShearCentre:true,stale:false,geometryPreview:false,S:{plot:'stress',explode:0,clip:false},at:(a,y)=>E.interp(y,R.y,a),sectionMotion:()=>[0,0],deformAmount:()=>({scale:0})};vm.createContext(ctx);vm.runInContext(fn,ctx);ctx.drawShearCentre();assert.equal(group.children.length,1);const line=group.children[0],p=line.geometry.attributes.position;assert.equal(p.count,65);assert.ok([...p.array].every(Number.isFinite));assert.equal(line.material.depthTest,false);assert.equal(line.material.isLineDashedMaterial,true);
 const y=150,wanted=spatial?R.analysis3D.sectionReferenceAt(y):WingGeometry.transformPoint(R.geometry,y,[E.interp(y,R.y,R.props.xsc),E.interp(y,R.ySec,R.sections.map(sec=>sec.zsc))]);assert.ok(Math.abs(p.getZ(32)-wanted[0])<1e-4);assert.ok(Math.abs(p.getY(32)-wanted[2])<1e-4);
 ctx.showShearCentre=false;ctx.drawShearCentre();assert.equal(group.children.length,0);ctx.showShearCentre=true;ctx.S.explode=10;ctx.drawShearCentre();assert.equal(group.children.length,0);
}
console.log('PASS: scalar/spatial shear-centre paths match solved section centres; 65 finite vertices, dashed overlay, toggle and exploded-view hiding.');
