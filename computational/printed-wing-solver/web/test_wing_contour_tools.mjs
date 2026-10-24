import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const s=readFileSync(new URL('./wing_lab_template.html',import.meta.url),'utf8');
const ctx={S:{stressComponent:'skin'}};vm.createContext(ctx);
vm.runInContext(s.slice(s.indexOf('  const resultDisplay='),s.indexOf('  function resultWorldPoint('))+'\nthis.display=resultDisplay;',ctx);
const before=JSON.stringify(ctx.S);
assert.deepEqual({...vm.runInContext('displayRange("sigma",{min:-2,max:3})',ctx)},{min:-2,max:3});
ctx.display.scaleMode='fixed';vm.runInContext('displayRange("sigma",{min:-2,max:3})',ctx);
assert.deepEqual({...vm.runInContext('displayRange("sigma",{min:-20,max:30})',ctx)},{min:-2,max:3});
ctx.S.stressComponent='spars';assert.deepEqual({...vm.runInContext('displayRange("sigma",{min:-8,max:9})',ctx)},{min:-8,max:9});
ctx.S.stressComponent='skin';assert.deepEqual({...vm.runInContext('displayRange("sigma",{min:-1,max:1})',ctx)},{min:-2,max:3});
ctx.display.scales['sigma:skin']={min:-.5,max:.5};ctx.display.scaleMode='manual';assert.equal(vm.runInContext('displayRange("sigma",{min:-9,max:9}).max',ctx),.5);
ctx.display.scaleMode='auto';assert.equal(vm.runInContext('displayRange("sigma",{min:-9,max:9}).max',ctx),9);
assert.equal(JSON.stringify(ctx.S),before);
let shader;
const materialCtx={THREE:{DoubleSide:2,MeshBasicMaterial:class{constructor(o){Object.assign(this,o);}}},resultDisplay:{bands:true},mesh:{userData:{kind:'skin'},material:{clippingPlanes:[],opacity:1,depthWrite:true}}};
vm.createContext(materialCtx);
vm.runInContext(s.slice(s.indexOf('  function resultMaterial('),s.indexOf('  function contourSample('))+'\nresultMaterial(mesh,true);',materialCtx);
shader={uniforms:{},vertexShader:'void main(){\n#include <begin_vertex>\n}',fragmentShader:'void main(){\n#include <color_fragment>\n}'};
materialCtx.mesh.material.onBeforeCompile(shader);
assert.equal(shader.uniforms.wingBanded.value,1);assert.match(shader.vertexShader,/vWingFraction=wingFraction/);
assert.match(shader.fragmentShader,/floor\(t\*12.0\)/);assert.match(shader.fragmentShader,/vWingValid>0.999/);
assert.equal(materialCtx.mesh.material.polygonOffset,true);
materialCtx.resultDisplay.bands=false;vm.runInContext('resultMaterial(mesh,true)',materialCtx);assert.equal(shader.uniforms.wingBanded.value,0);
// Parse every inline script in the assembled standalone page, including the new UI.
const page=readFileSync(new URL('../../../docs/wing-lab.html',import.meta.url),'utf8');
for(const match of page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)){if(match[1].trim())new vm.Script(match[1]);}
console.log('PASS: locked/manual/automatic scales across designs, separate component scales, solver input unchanged, fragment-level bands, unresolved mask, shader toggle, generated page JavaScript syntax.');
const texts=[],sizes=[],downloads=[],flashes=[];
const paint={fillRect(){},fillText(t){texts.push(t);},drawImage(){},measureText(t){return {width:t.length*8};},beginPath(){},arc(){},fill(){}};
const poster={getContext:()=>paint,toBlob(fn,type){assert.equal(type,'image/png');fn({});}};
const exportCtx={R:{mass:{total:285}},model:{},geometryPreview:false,stale:false,running:false,canvas:{clientWidth:900,clientHeight:600},scene:{},camera:{aspect:1.5,updateProjectionMatrix(){}},
 THREE:{Vector2:class{set(x,y){this.x=x;this.y=y;return this;}}},renderer:{ratio:2,getPixelRatio(){return this.ratio;},setPixelRatio(r){this.ratio=r;},getSize(v){return v.set(900,600);},setSize(w,h){sizes.push([w,h]);},render(){}},
 S:{plot:'stress',projectName:'Wing comparison',deformed:true},resultDisplay:{scaleMode:'fixed',bands:false},range:{min:-2,max:3},resultLabels:()=>[],rainbow:()=>({getHexString:()=> 'ff0000'}),nf:(v,d)=>v.toFixed(d),sig:String,deformAmount:()=>({scale:4}),flash:t=>flashes.push(t),
 document:{createElement:tag=>tag==='canvas'?poster:{click(){downloads.push(this.download);}}},WingStudyIO:{safeFilenameStem:t=>t.replaceAll(' ','-')},URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},setTimeout(){}};
vm.createContext(exportCtx);vm.runInContext(s.slice(s.indexOf('  function exportResultImage()'),s.indexOf('  function rainbow(t)'))+'\nexportResultImage()',exportCtx);
assert.equal(exportCtx.renderer.ratio,2);assert.deepEqual(sizes.at(-1),[900,600]);assert.equal(exportCtx.camera.aspect,1.5);
assert.equal(downloads[0],'Wing-comparison-stress.png');assert.ok(texts.some(t=>t.includes('MPa')&&t.includes('285.0 g')));assert.ok(texts.some(t=>t.includes('4.00')));
exportCtx.stale=true;vm.runInContext('exportResultImage()',exportCtx);assert.equal(downloads.length,1);assert.match(flashes.at(-1),/Solve/);
exportCtx.stale=false;let fail=true;exportCtx.renderer.render=()=>{if(fail){fail=false;throw new Error('test context loss');}};vm.runInContext('exportResultImage()',exportCtx);assert.equal(exportCtx.renderer.ratio,2);assert.equal(exportCtx.camera.aspect,1.5);assert.match(flashes.at(-1),/failed/);
console.log('PASS: PNG metadata and naming, renderer/camera restoration after success or failure, stale-result export blocked.');
