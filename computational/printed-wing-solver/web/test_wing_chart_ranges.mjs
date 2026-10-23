// Display regression: real chart functions, typed arrays, missing data and numeric scales.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),M=require('./wing_chart_math.js'),{JSDOM}=require(process.env.MIE446_JSDOM_MODULE||'jsdom');
const source=readFileSync(new URL('./wing_lab_template.html',import.meta.url),'utf8'),metal=readFileSync(new URL('./metal_wing_ui.js',import.meta.url),'utf8');
const dom=new JSDOM('<div id="host"></div>'),w=dom.window,doc=w.document,host=doc.querySelector('#host');
const printed=vm.createContext({Math,Number,WingChartMath:M,sig:String,showMarker:()=>{},el:(tag,attrs,html)=>{const n=doc.createElement(tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);n.innerHTML=html;return n;}});
vm.runInContext(source.slice(source.indexOf('  function niceTicks('),source.indexOf('  function showMarker(')),printed);
const full=vm.createContext({Math,Number,WingChartMath:M});vm.runInContext(metal.slice(metal.indexOf('  function niceTicks('),metal.indexOf('  // ------------------------------------------------------------------ tabs')),full);
let checks=0;const ok=(v,m)=>{assert.ok(v,m);checks++;},eq=(a,b,m)=>{assert.equal(a,b,m);checks++;};
function verify(svg,values){
 const lo=+svg.dataset.ymin,hi=+svg.dataset.ymax;ok(Number.isFinite(lo)&&Number.isFinite(hi)&&hi>lo,'finite non-degenerate axis');
 for(const value of values)if(Number.isFinite(value))ok(value>=lo&&value<=hi,'all resolved values are included in the scale');
 ok(!/NaN|Infinity/.test(svg.outerHTML),'no nonfinite SVG coordinates');eq(svg.style.overflow,'hidden');
 const group=svg.querySelector('.chart-curves'),ref=group.getAttribute('clip-path').match(/#([^)]*)/)[1];ok(svg.querySelector('[id="'+ref+'"]'),'curves have their own valid plot clip');
 for(const path of group.querySelectorAll('path')){const coords=[...path.getAttribute('d').matchAll(/[ML]([-\d.]+),([-\d.]+)/g)];for(const [,x,y]of coords){ok(+x>=39.9&&+x<=412.1,'resolved path x remains inside the plot');ok(+y>=5.9&&+y<=160.1,'resolved path y remains inside the plot');}}
}
try{
 for(const values of [[0,100,250],[-700,-2,0],[-1e-14,0,3e-14],[-1e200,0,2e200],[0,0,0],[NaN,NaN,NaN],[],[-Number.MAX_VALUE,0,Number.MAX_VALUE]]){
  const xs=Float64Array.from(values,(_,i)=>i),ys=Float64Array.from(values),before=Array.from(ys);
  host.replaceChildren();printed.chart(host,'Typed wing field','N',xs,[{y:ys,color:'green'}]);verify(host.querySelector('svg'),values);
  host.innerHTML=full.chart('Typed metal field','N',[{x:xs,y:ys,color:'green'}]);verify(host.querySelector('svg'),values);
  assert.deepEqual(Array.from(ys),before);checks++;
 }
 host.innerHTML=full.chart('Typed reference markers','MPa',[{x:new Float64Array([0,1]),y:new Float64Array([-20,30]),markers:true}]);eq(host.querySelectorAll('circle').length,2);ok(!/NaN|Infinity/.test(host.innerHTML),'typed-array marker formatting produces SVG, not NaN strings');
 const xs=Float64Array.from({length:601},(_,i)=>i),ys=Float64Array.from(xs,()=>4);ys[299]=NaN;ys[301]=100;
 host.replaceChildren();printed.chart(host,'Gap and peak','MPa',xs,[{y:ys,color:'blue',fill:true}]);let svg=host.querySelector('svg');eq(svg.querySelectorAll('path').length,1,'no fill crosses missing values');eq((svg.querySelector('path').getAttribute('d').match(/M/g)||[]).length,2,'a gap between old decimation indices stays a real gap');ok(+svg.dataset.ymax>=100,'a narrow peak cannot disappear from the scale');
 svg.getBoundingClientRect=()=>({left:0,top:0,width:420,height:112});svg.dispatchEvent(new w.MouseEvent('pointermove',{clientX:40+372*299/600}));ok(host.querySelector('h4 span').textContent.includes('unresolved'),'hover never interpolates across a missing sample');
 host.innerHTML=full.chart('Metal gap','N',[{x:[0,1,2,3],y:[1,NaN,-2,-3]}]);eq((host.querySelector('path').getAttribute('d').match(/M/g)||[]).length,2,'metal curves do not bridge invalid samples');
 host.replaceChildren();printed.chart(host,'Invalid x','N',[0,NaN,2],[{y:[1,1000,3],color:'blue'}]);eq((host.querySelector('path').getAttribute('d').match(/M/g)||[]).length,2);ok(+host.querySelector('svg').dataset.ymax<1000,'unpaired y values cannot distort the axis');
 host.replaceChildren();printed.chart(host,'A','N',[0,1],[{y:[0,2]}]);printed.chart(host,'B','N',[0,1],[{y:[0,3]}]);eq(new Set([...host.querySelectorAll('clipPath')].map(n=>n.id)).size,2,'clip IDs cannot collide across charts');
 for(let exponent=-250;exponent<=250;exponent+=5){const scale=10**exponent,t=M.ticks(-.37*scale,.83*scale,4);ok(t.length>=2&&t.length<=100);ok(t.every(Number.isFinite));ok(t.every((v,i)=>!i||v>t[i-1]));ok(t[0]<=-.37*scale&&t.at(-1)>=.83*scale);}
 eq(M.at([0,1,2],[0,NaN,5],.5),NaN);eq(M.at([0,1],[0,4],.5),2);ok(M.format(1e-14).includes('e-14'));ok(M.format(1e200).length<12);
 const D=require('./beam_diagrams.js'),beamResult={input:{length:2},x:new Float64Array([0,1,2]),V:new Float64Array([-100,0,250])};host.innerHTML=D.chart(beamResult,'V');ok(!/NaN|Infinity/.test(host.innerHTML),'Beam accepts typed samples without corrupting coordinates');eq(host.querySelector('polyline.bl-curve').getAttribute('points').split(' ').length,3);
 console.log(`Wing/Full-scale chart ranges PASS: ${checks} checks for typed arrays, signed/tiny/large/zero/empty fields, clipped curves, reference markers, real missing-data gaps and hover, narrow extrema, unique clips and bounded tick generation. Solver inputs unchanged.`);
}finally{dom.window.close();}
