'use strict';
const $=id=>document.getElementById(id),numbers=['radius','length','panels','speed','density','ambientPressure','vapourPressure'],controls=[...numbers,'geometry'];
let result=null,worker=null,yaw=-.55,pitch=.40,drag=null;
const num=v=>Number(v).toPrecision(5),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function status(message,state='ready'){$('status').textContent=message;$('status').dataset.state=state;}
function error(message){status(message,'error');$('errorMessage').textContent=message;if(!$('errorDialog').open)$('errorDialog').showModal();}
function shapeControl(){const sphere=$('geometry').value==='sphere';if(sphere)$('length').value=2*Number($('radius').value);$('length').disabled=sphere||$('solve').disabled;}
function busy(value){$('solve').disabled=value;$('cancel').disabled=!value;for(const k of [...controls,'open'])$(k).disabled=value;shapeControl();}
function invalidate(){result=null;$('metrics').replaceChildren();$('body3d').replaceChildren();$('profile').replaceChildren();$('diagnostics').replaceChildren();$('probe').textContent='Solve, then click a surface band to read its values.';$('csv').disabled=true;$('svg').disabled=true;shapeControl();status('Inputs changed. Solve the 3-D ring BEM again.');}
function validate(o){
 if(!['sphere','prolate'].includes(o.geometry))throw Error('Choose a sphere or prolate spheroid.');
 for(const k of numbers)if(!Number.isFinite(o[k]))throw Error('Every input must be a finite number.');
 if(o.radius<=0||o.length<=0||o.speed<=0||o.density<=0||o.vapourPressure<0||o.ambientPressure<=o.vapourPressure)throw Error('Use positive dimensions, density and speed, and absolute ambient pressure above vapour pressure.');
 if(!Number.isInteger(o.panels)||o.panels<16||o.panels>512)throw Error('Use 16–512 meridional panels.');
 if(o.geometry==='prolate'&&o.length<2*o.radius)throw Error('A prolate spheroid must be at least as long as its diameter.');
 if((o.yawDeg??0)!==0||(o.incidenceDeg??0)!==0)throw Error('Axisymmetric flow requires zero incidence and yaw.');
 if(o.cavityMode&&o.cavityMode!=='fully-wetted')throw Error('Developed axisymmetric cavities are not implemented in this fully wetted module.');
 return o;
}
const inputs=()=>validate({geometry:$('geometry').value,...Object.fromEntries(numbers.map(k=>[k,Number($(k).value)]))});
function download(name,text,type){const a=document.createElement('a'),u=URL.createObjectURL(new Blob([text],{type}));a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),2000);}
function colour(cp,min,max){const q=Math.max(-1,Math.min(1,cp>=0?cp/Math.max(max,1e-10):cp/Math.max(-min,1e-10)));return q>=0?`rgb(${Math.round(255*q)},${Math.round(255*(1-q))},0)`:`rgb(0,${Math.round(255*(1+q))},${Math.round(-255*q)})`;}
function drawBody(){
 if(!result)return;const r=result,N=r.surface.length,nodes=r.nodes,W=900,H=410,az=24,lo=Math.min(...nodes.map(v=>v.x)),hi=Math.max(...nodes.map(v=>v.x)),min=Math.min(...r.surface.map(v=>v.cp)),max=Math.max(...r.surface.map(v=>v.cp));
 const rotate=(x,y,z)=>{x-=(lo+hi)/2;const a=Math.cos(yaw)*x-Math.sin(yaw)*y,b=Math.sin(yaw)*x+Math.cos(yaw)*y;return [a,Math.cos(pitch)*z-Math.sin(pitch)*b,Math.sin(pitch)*z+Math.cos(pitch)*b];};
 const projected=nodes.flatMap(v=>Array.from({length:az},(_,k)=>rotate(v.x,v.r*Math.cos(2*Math.PI*k/az),v.r*Math.sin(2*Math.PI*k/az))));
 const boundX=Math.max(...projected.map(v=>Math.abs(v[0]))),boundY=Math.max(...projected.map(v=>Math.abs(v[1]))),scale=Math.min(760/(2*boundX||1),275/(2*boundY||1));
 const project=(x,y,z)=>{const p=rotate(x,y,z);return [W/2+scale*p[0],198-scale*p[1],p[2]];};
 const faces=[];
 for(let i=0;i<N;i++)for(let k=0;k<az;k++){
  const a=2*Math.PI*k/az,b=2*Math.PI*(k+1)/az,p=[project(nodes[i].x,nodes[i].r*Math.cos(a),nodes[i].r*Math.sin(a)),project(nodes[i+1].x,nodes[i+1].r*Math.cos(a),nodes[i+1].r*Math.sin(a)),project(nodes[i+1].x,nodes[i+1].r*Math.cos(b),nodes[i+1].r*Math.sin(b)),project(nodes[i].x,nodes[i].r*Math.cos(b),nodes[i].r*Math.sin(b))];
  faces.push({i,p,z:p.reduce((s,v)=>s+v[2],0)/4});
 }
 faces.sort((a,b)=>a.z-b.z);
 let s=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Three-dimensional ring-band Cp on the axisymmetric body"><rect width="100%" height="100%" fill="white"/><text x="20" y="28" font-family="Arial" font-size="18" fill="#172536">3-D surface Cp · fully wetted ring-BEM solution</text>`;
 for(const f of faces)s+=`<polygon data-band="${f.i}" points="${f.p.map(v=>v.slice(0,2).map(x=>x.toFixed(2)).join(',')).join(' ')}" fill="${colour(r.surface[f.i].cp,min,max)}" stroke="${$('wire').checked?'#253c50':'none'}" stroke-width=".55"/>`;
 for(let i=0;i<=60;i++)s+=`<rect x="${655+i*3.5}" y="365" width="3.7" height="13" fill="${colour(min+(max-min)*i/60,min,max)}"/>`;
 s+=`<text x="650" y="397" font-family="Arial" font-size="14">Cp: ${num(min)} to ${num(max)}</text><text x="20" y="392" font-family="Arial" font-size="14">${N} meridional bands · drag to rotate · click to probe</text></svg>`;$('body3d').innerHTML=s;
}
function drawProfile(){
 const a=result.surface,W=900,H=390,m={l:83,r:25,t:70,b:58},xs=a.map(v=>v.x),ys=a.flatMap(v=>[v.cp,v.referenceCp]).filter(Number.isFinite),xmin=Math.min(...xs),xmax=Math.max(...xs),ylo=Math.min(...ys),yhi=Math.max(...ys),pad=(yhi-ylo)*.12||.1;
 const X=x=>m.l+(x-xmin)/(xmax-xmin)*(W-m.l-m.r),Y=y=>m.t+(y-ylo+pad)/(yhi-ylo+2*pad)*(H-m.t-m.b);
 let s=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Signed surface pressure coefficient compared with exact wet potential flow"><rect width="100%" height="100%" fill="white"/><g font-family="Arial" fill="#172536"><text x="20" y="25" font-size="20">Signed Cp along the body axis</text><text x="22" y="51" font-size="14" fill="#075eb7">Solid: current ring BEM</text><text x="260" y="51" font-size="14" fill="#b24d15">Dashed: exact fully wetted reference</text>`;
 for(let i=0;i<=5;i++){const x=xmin+(xmax-xmin)*i/5,y=ylo-pad+(yhi-ylo+2*pad)*i/5;s+=`<path d="M${X(x)} ${m.t}V${H-m.b}" stroke="#e2e8ef"/><text x="${X(x)}" y="${H-m.b+23}" text-anchor="middle" font-size="13">${Number(x.toPrecision(3))}</text><path d="M${m.l} ${Y(y)}H${W-m.r}" stroke="#e2e8ef"/><text x="${m.l-9}" y="${Y(y)+5}" text-anchor="end" font-size="13">${Number(y.toPrecision(3))}</text>`;}
 for(const [key,c,dash]of [['cp','#075eb7',''],['referenceCp','#b24d15','6 4']]){const pts=a.filter(v=>Number.isFinite(v[key]));s+=`<path d="${pts.map((v,i)=>(i?'L':'M')+X(v.x)+' '+Y(v[key])).join(' ')}" fill="none" stroke="${c}" stroke-width="2.4" stroke-dasharray="${dash}"/>`;}
 s+=`<text x="480" y="${H-12}" text-anchor="middle" font-size="15">Axial position x (m)</text><text transform="translate(24 200) rotate(-90)" text-anchor="middle" font-size="15">Cp · negative upward</text></g></svg>`;$('profile').innerHTML=s+'<figcaption>Panel-centre samples only; exact and computed Cp use corresponding meridional midpoint parameters (curved reference versus conical bands). No experimental or developed-cavity curve is implied.</figcaption>';
}
function display(r){
 result=r;const min=Math.min(...r.surface.map(v=>v.pressure)),cpError=Math.max(...r.surface.map(v=>Math.abs(v.cp-v.referenceCp))),m=r.diagnostics;
 const rows=[['Cavitation number σ',num(r.inception.cavitationNumber)],['Sampled wet-flow min Cp',num(r.inception.sampledMinimumCp)],['Wet-flow threshold −min Cp',num(r.inception.sampledInceptionSigma)],['Minimum wet-flow pressure',num(min/1000)+' kPa abs.'],['Panels / runtime',m.meridionalPanels+' / '+num(m.seconds)+' s'],['Max Cp difference from exact',num(cpError)]];
 $('metrics').innerHTML=rows.map(([a,b])=>`<div class="metric"><span>${esc(a)}</span><strong>${esc(b)}</strong></div>`).join('');drawBody();drawProfile();
 const d=[['Collocation normal residual / U',m.maxNormalResidualRatio],['Net source flux Q / (U S)',m.netSourceFluxRatio],['Source antisymmetry diagnostic',m.sourceAntisymmetryError],['Ideal pressure-drag diagnostic',m.pressureDragCoefficient],['Meridional quadrature order',m.quadratureOrder]];
 $('diagnostics').innerHTML='<tr><th>Numerical check</th><th>Value</th></tr>'+d.map(([a,b])=>`<tr><td>${esc(a)}</td><td>${num(b)}</td></tr>`).join('');$('csv').disabled=false;$('svg').disabled=false;
 status(r.inception.pressureBelowVapour?'Wet-flow pressure falls below vapour pressure: the wet-flow pressure criterion is exceeded; actual inception and cavity flow are not solved. A developed cavity and its modified pressure field have NOT been solved.':'Three-dimensional fully wetted potential flow solved. No sampled pressure is below vapour pressure; this is not a guarantee against inception from unmodelled nuclei or viscous effects.',r.inception.pressureBelowVapour?'warning':'ready');
}
$('settings').addEventListener('submit',e=>{e.preventDefault();try{const o=inputs();invalidate();busy(true);status('Integrating three-dimensional source rings and assembling the boundary system…','running');const active=worker=new Worker('axisymmetric-worker.js?v=0.3.0');active.onmessage=e=>{if(worker!==active)return;if(e.data.type==='progress'){status(e.data.message,'running');return;}active.terminate();worker=null;busy(false);if(e.data.type==='error')error(e.data.message);else display(e.data.result);};active.onerror=e=>{if(worker!==active)return;active.terminate();worker=null;busy(false);error(e.message||'Worker failed. Serve this module over HTTP.');};active.postMessage(o);}catch(e){busy(false);error(e.message);}});
$('settings').addEventListener('change',invalidate);$('cancel').onclick=()=>{worker?.terminate();worker=null;busy(false);invalidate();status('Cancelled. No completed result is shown.');};$('dismiss').onclick=()=>$('errorDialog').close();
$('wire').onchange=drawBody;$('resetView').onclick=()=>{yaw=-.55;pitch=.40;drawBody();};
$('body3d').onpointerdown=e=>{if(!result)return;drag={x:e.clientX,y:e.clientY,yaw,pitch,moved:false};$('body3d').setPointerCapture(e.pointerId);};
$('body3d').onpointermove=e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.moved=Math.abs(dx)+Math.abs(dy)>3;yaw=drag.yaw+dx*.008;pitch=Math.max(-1.5,Math.min(1.5,drag.pitch+dy*.008));drawBody();};
$('body3d').onpointerup=e=>{if(drag&&!drag.moved){const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-band]'),i=target?Number(target.getAttribute('data-band')):-1,p=result?.surface[i];if(p)$('probe').textContent=`Band ${i+1}: x ${num(p.x)} m · r ${num(p.r)} m · Cp ${num(p.cp)} · wet-flow p ${num(p.pressure/1000)} kPa absolute`;}drag=null;};
$('save').onclick=()=>{try{download('axisymmetric-body-case.json',JSON.stringify({schema:'axisymmetric-bem-case',version:1,inputs:inputs(),result},null,2),'application/json');}catch(e){error(e.message);}};
$('csv').onclick=()=>{if(!result)return;download('axisymmetric-wet-flow.csv',['x_m,r_m,Cp,current_pressure_Pa,exact_Cp,collocation_normal_velocity_residual_over_U',...result.surface.map(v=>[v.x,v.r,v.cp,v.pressure,v.referenceCp,v.normalVelocityResidualRatio].join(','))].join('\n'),'text/csv');};
$('svg').onclick=()=>{if(!result)return;const a=$('body3d').querySelector('svg'),b=$('profile').querySelector('svg');download('axisymmetric-wet-flow.svg',`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="850"><rect width="100%" height="100%" fill="white"/><svg width="900" height="410" viewBox="0 0 900 410">${a.innerHTML}</svg><svg y="425" width="900" height="390" viewBox="0 0 900 390">${b.innerHTML}</svg><text x="20" y="840" font-family="Arial" font-size="14">Fully wetted axisymmetric research BEM; developed cavity not computed.</text></svg>`,'image/svg+xml');};
$('open').onclick=()=>$('file').click();$('file').onchange=async()=>{try{const f=$('file').files[0];if(!f)return;if(f.size>5e6)throw Error('Case file exceeds 5 MB.');const d=JSON.parse(await f.text());if(d.schema!=='axisymmetric-bem-case'||d.version!==1)throw Error('Open an axisymmetric BEM case JSON; 2D hydrofoil and Wing Lab files use separate models.');const o=validate(d.inputs);if((o.yawDeg??0)!==0||(o.incidenceDeg??0)!==0)throw Error('This axisymmetric mode requires zero incidence and yaw.');if(![...$('panels').options].some(v=>Number(v.value)===o.panels))$('panels').add(new Option(String(o.panels)+' · imported',String(o.panels)));for(const k of controls)$(k).value=o[k];invalidate();status('Case inputs restored. Solve again; stored results are not trusted as a fresh calculation.');}catch(e){error(e.message);}finally{$('file').value='';}};
shapeControl();
