(function(){
'use strict';
const $=id=>document.getElementById(id),ids=['geometry','method','inputMode','temperature','speed','pressure','sigma','naca','alpha','chord','radius','bodyRadius','bodyLength','mesh','budget','longDomain'];
let worker=null,result=null,fluid=null,started=0,timer=null;
const number=x=>Number.isFinite(x)?Number(x.toPrecision(6)).toString():'unavailable',esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function read(){
 const geometry=$('geometry').value,method=$('method').value;
 const rawFlow={mode:$('inputMode').value,temperatureC:+$('temperature').value,U:+$('speed').value,pInf:+$('pressure').value*1000,sigma:+$('sigma').value};
 const flow=CavitationFluid.target(rawFlow);
 const foil={naca:$('naca').value.trim(),alpha:+$('alpha').value,chord:+$('chord').value/1000};
 const disk={radius:+$('radius').value/1000,bodyRadius:+$('bodyRadius').value/1000,bodyLength:+$('bodyLength').value/1000};
 const settings={resolution:+$('mesh').value,maxSeconds:+$('budget').value,extendedResearchDomain:$('longDomain').checked};
 if(geometry==='hydrofoil')ForwardHydrofoilCavitation.configuration({...flow,geometry:{naca:foil.naca},alpha:foil.alpha,chord:foil.chord,settings:{resolution:settings.resolution,maxSeconds:settings.maxSeconds}});
 else if(!(disk.radius>0)||geometry==='disk-cylinder'&&!(disk.bodyRadius>0&&disk.bodyLength>0))throw Error('Use positive active geometry dimensions.');
 return {geometry,method,flow,foil,disk,settings};
}
function status(text,kind='ready'){$('status').textContent=text;$('status').dataset.state=kind;}
function controls(){
 const hydro=$('geometry').value==='hydrofoil';$('foilInputs').hidden=!hydro;$('diskInputs').hidden=hydro;$('bodyInputs').hidden=$('geometry').value!=='disk-cylinder';
 $('referenceOption').disabled=hydro;if(hydro&&$('method').value==='reference')$('method').value='bem';
 $('pressureRow').hidden=$('inputMode').value==='sigma';$('sigmaRow').hidden=$('inputMode').value!=='sigma';
 for(const id of ['naca','alpha','chord'])$(id).disabled=!hydro;
 $('radius').disabled=hydro;for(const id of ['bodyRadius','bodyLength'])$(id).disabled=$('geometry').value!=='disk-cylinder';
 $('pressure').disabled=$('inputMode').value==='sigma';$('sigma').disabled=$('inputMode').value!=='sigma';
 $('longRow').hidden=hydro||$('method').value!=='bem';
 const old=$('mesh').value,options=hydro?[32,48,64,96]:[32,64,128];
 if(!options.includes(+old)||$('mesh').options.length!==options.length){$('mesh').replaceChildren(...options.map(v=>new Option(String(v),String(v))));$('mesh').value=options.includes(+old)?old:hydro?'48':'32';}
 $('geometryNote').textContent=hydro?'Steady 2-D attached sheet; angle of attack applies to this section.':$('geometry').value==='disk-cylinder'?'Sharp front disk with a dry cylindrical afterbody inside the cavity. Axial flow only (α = 0°). Body intersection is checked; a partly wetted cylinder is not substituted.':'Sharp circular disk in axial flow (α = 0°).';
 $('methodNote').textContent=$('method').value==='reference'?'Semenenko disk correlation, σ = 0.012–0.057. Immediate semiempirical estimate; a finite reported endpoint, not a solved physical closure.':'Boundary-element free-boundary solve. A converged equation is shown separately from physical screens and external validation.';
 try{const f=CavitationFluid.target({mode:$('inputMode').value,temperatureC:+$('temperature').value,U:+$('speed').value,pInf:+$('pressure').value*1000,sigma:+$('sigma').value});$('fluidInfo').textContent=`σ = ${number(f.sigma)} · ρ = ${number(f.rho)} kg/m³ · pv = ${number(f.pc/1000)} kPa · absolute p∞ = ${number(f.pInf/1000)} kPa`;}catch(e){$('fluidInfo').textContent=e.message;}
}
function stop(){worker?.terminate();worker=null;clearInterval(timer);timer=null;$('solve').disabled=false;$('cancel').disabled=true;for(const id of ids)$(id).disabled=false;controls();}
function invalidate(){stop();result=null;fluid=null;$('output').hidden=true;for(const id of ['csv','figures'])$(id).disabled=true;status('Inputs changed. Solve to recompute the cavity; stored results are not reused.');}
function error(message){status(message,'error');$('errorText').textContent=message;if(!$('errorDialog').open)$('errorDialog').showModal();}
function chart(title,series,{equal=false,xlabel='x (mm)',ylabel='r (mm)',shade=false}={}){
 const all=series.flatMap(s=>s.points).filter(p=>p.every(Number.isFinite));if(!all.length)return '<p>No finite curve is available.</p>';
 const W=960,H=equal?420:350,m={l:82,r:25,t:100,b:55},w=W-m.l-m.r,h=H-m.t-m.b;
 let x0=Math.min(...all.map(p=>p[0])),x1=Math.max(...all.map(p=>p[0])),y0=Math.min(...all.map(p=>p[1])),y1=Math.max(...all.map(p=>p[1]));
 if(x0===x1)x1=x0+1;if(y0===y1){y0-=.01;y1+=.01;}let pad=(y1-y0)*.08;y0-=pad;y1+=pad;
 if(equal){const yr=Math.max(y1-y0,(x1-x0)*h/w),xm=(x0+x1)/2,ym=(y0+y1)/2;y0=ym-yr/2;y1=ym+yr/2;x0=xm-yr*w/h/2;x1=xm+yr*w/h/2;}
 const X=x=>m.l+(x-x0)/(x1-x0)*w,Y=y=>m.t+h-(y-y0)/(y1-y0)*h;
 let s=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}"><style>text{font-family:'Times New Roman',serif;fill:#000;font-size:16px}.title{font-size:21px;font-weight:bold}</style><rect width="100%" height="100%" fill="#fff"/><text class="title" x="24" y="27">${esc(title)}</text>`;
 series.forEach((v,i)=>{const x=24+(i%3)*305,y=53+Math.floor(i/3)*24;s+=`<path d="M${x} ${y}h25" stroke="${v.color}" stroke-width="3" ${v.dash?'stroke-dasharray="6 4"':''}/><text x="${x+32}" y="${y+5}">${esc(v.name)}</text>`;});
 for(let k=0;k<=4;k++){const x=x0+(x1-x0)*k/4,y=y0+(y1-y0)*k/4;s+=`<path d="M${X(x)} ${m.t}v${h} M${m.l} ${Y(y)}h${w}" stroke="#d9e0e7"/><text x="${X(x)}" y="${H-28}" text-anchor="middle">${esc(number(x))}</text><text x="${m.l-9}" y="${Y(y)+5}" text-anchor="end">${esc(number(y))}</text>`;}
 if(shade&&series[0]?.points.length)s+=`<polygon points="${series[0].points.map(p=>X(p[0])+','+Y(p[1])).join(' ')} ${series[0].points.slice().reverse().map(p=>X(p[0])+','+Y(-p[1])).join(' ')}" fill="#53c9dc" opacity=".2"/>`;
 for(const v of series)s+=`<polyline points="${v.points.filter(p=>p.every(Number.isFinite)).map(p=>X(p[0])+','+Y(p[1])).join(' ')}" fill="none" stroke="${v.color}" stroke-width="2.5" ${v.dash?'stroke-dasharray="6 4"':''}/>`;
 return s+`<rect x="${m.l}" y="${m.t}" width="${w}" height="${h}" fill="none" stroke="#77889a"/><text x="${m.l+w/2}" y="${H-5}" text-anchor="middle">${esc(xlabel)}</text><text transform="translate(20 ${m.t+h/2})rotate(-90)" text-anchor="middle">${esc(ylabel)}</text></svg>`;
}
function rows(data){return '<table><tbody>'+data.map(([k,v])=>`<tr><th>${esc(k)}</th><td>${esc(typeof v==='number'?number(v):v)}</td></tr>`).join('')+'</tbody></table>';}
function show(r,f,request){
 result={request,result:r,fluid:f};fluid=f;$('output').hidden=false;$('raw').textContent=JSON.stringify(r,null,2);$('csv').disabled=false;$('figures').disabled=false;
 const hydro=request.geometry==='hydrofoil',ref=request.method==='reference',accepted=hydro?r.acceptedForDisplay:r.ok&&(!r.body||r.body.dryContained);
 status(hydro?r.message||r.reason||r.status:ref?(r.ok?(r.body&&!r.body.dryContained?'The cylinder is not fully contained. The reference envelope remains a diagnostic only; no gas volume is admitted.':'Semiempirical reference evaluated in its published σ range. This is not a new BEM prediction.'):r.errors.join(' ')):(r.ok?'Target σ, shape equations and independent field screens passed. The rear image disk is an artificial closure; experimental accuracy is not qualified.':r.errors?.join(' ')||r.status),accepted?'ready':'error');
 let values=[['Input σ',f.sigma],['Speed (m/s)',f.U],['Absolute ambient pressure (kPa)',f.pInf/1000],['Temperature (°C)',f.temperatureC],['Experimental validation','Not qualified for this calculation']];
 $('pressurePlot').innerHTML='';$('geometryPlot').innerHTML='';
 if(hydro){
  const c=request.foil.chord*1000,raw=r.cavity||r.diagnosticCandidate,wet=r.wetPreflight?.fine;
  const original=raw?.original||r.points||wet?.points;
  const series=original?[{name:'Original hydrofoil',color:'#202b37',points:original.map(p=>[p[0]*c,p[1]*c])}]:[];
  if(raw?.height)series.push({name:r.acceptedForDisplay?'Computed cavity':'Rejected trial only',color:r.acceptedForDisplay?'#075eb7':'#b82028',points:raw.height.map(p=>[p.x*c,p.y*c])});
  $('geometryPlot').innerHTML=chart(r.cavityPresent?'Computed attached sheet':r.acceptedForDisplay?'Fully wetted section · no cavity required':'No accepted cavity · raw trial if available',series,{equal:true,ylabel:'y (mm)'});
  const upperCount=raw?2*raw.options.resolution+Math.max(8,Math.round(raw.options.resolution/3)):null;
  const panels=(raw?.panels||r.panels||wet?.panels||[]).map((p,k)=>({...p,surface:p.surface||(k<upperCount?'upper':'lower')}));
  if(panels.length)$('pressurePlot').innerHTML=chart('Computed signed pressure coefficient',[
   {name:'Upper surface',color:'#075eb7',points:panels.filter(p=>p.surface==='upper').map(p=>[p.x,p.cp]).sort((a,b)=>a[0]-b[0])},
   {name:'Lower surface',color:'#b25d0b',points:panels.filter(p=>p.surface==='lower').map(p=>[p.x,p.cp]).sort((a,b)=>a[0]-b[0])},
   {name:'Cavity pressure −σ',color:'#333',dash:true,points:[[0,-f.sigma],[1,-f.sigma]]}
  ],{xlabel:'x/c',ylabel:'Signed Cp'});
  values.push(['Status',r.status],['Cavity present',r.cavityPresent?'YES':'No accepted cavity'],['Solved length l/c',r.cavityPresent?r.root.length:'not reported'],['Numerical root residual',r.root?.residual??'unresolved'],['Cavity area per unit span (mm²)',r.cavityPresent?r.cavityArea.perUnitSpan_m2*1e6:'not reported']);
  $('caption').textContent=r.acceptedForDisplay?'The section is computed under steady inviscid assumptions. A fully wetted result means both checked meshes remain above vapour pressure; it is not an experimental inception prediction.':'No accepted physical cavity or volume. Complete failed trial values are retained in JSON and the diagnostic details. Changing initial guesses cannot override physical screens.';
 }else if(ref&&r.ok){
  const data=[...r.profile.front,...r.profile.main],p=data.map(v=>[v.x*1000,v.r*1000]),end=r.dimensions.Lc*1000;
  const s=[{name:'Reference envelope',color:'#075eb7',points:p},{name:'Opposite meridian',color:'#075eb7',points:p.map(v=>[v[0],-v[1]])},{name:'Disk',color:'#202b37',points:[[0,-request.disk.radius*1000],[0,request.disk.radius*1000]]}];
  if(request.geometry==='disk-cylinder')s.push({name:'Specified cylinder',color:'#444',points:[[0,request.disk.bodyRadius*1000],[request.disk.bodyLength*1000,request.disk.bodyRadius*1000],[request.disk.bodyLength*1000,-request.disk.bodyRadius*1000],[0,-request.disk.bodyRadius*1000]]});
  $('geometryPlot').innerHTML=chart('Disk cavity reference · original physical scale',s,{equal:true,shade:true});
  values.push(['Approximate reported length (mm)',end],['Maximum radius (mm)',r.dimensions.Rmax*1000],['Endpoint radius is finite (mm)',r.dimensions.endpoint.r*1000],['Cylinder clearance (mm)',r.body?r.body.minimumClearance*1000:'no afterbody'],['Envelope segment volume (cm³)',r.volume.envelopeSegment*1e6],['Gas envelope segment (cm³)',r.volume.gasEnvelopeSegment==null?'not reported':r.volume.gasEnvelopeSegment*1e6]);
  $('caption').textContent='Semenenko equations 31–34, fitted natural disk-cavity envelope. The approximate reported length is not the zero of the radius polynomial. No artificial zero or physical closure is added. Volume is an envelope segment, not a validated closed gas volume.';
 }else if(r.final?.nodes){
  const raw=r.final,R=request.disk.radius*1000,p=r.profile.full.map(v=>[v.x*1000,v.r*1000]),L=raw.L*R;
  const s=[{name:'BEM cavity',color:'#075eb7',points:p},{name:'Opposite meridian',color:'#075eb7',points:p.map(v=>[v[0],-v[1]])},{name:'Physical disk',color:'#202b37',points:[[0,-R],[0,R]]},{name:'Artificial rear disk',color:'#9a641a',dash:true,points:[[L,-R],[L,R]]}];
  if(request.geometry==='disk-cylinder')s.push({name:'Cylindrical afterbody',color:'#444',points:[[0,request.disk.bodyRadius*1000],[request.disk.bodyLength*1000,request.disk.bodyRadius*1000],[request.disk.bodyLength*1000,-request.disk.bodyRadius*1000],[0,-request.disk.bodyRadius*1000]]});
  $('geometryPlot').innerHTML=chart(r.ok?'Forward BEM cavity · research result':'Nonaccepted BEM trial · diagnostic only',s,{equal:true,shade:true});
  values.push(['Achieved σ',r.achievedSigma],['Target σ residual',r.sigmaResidual],['Solved full image separation (mm)',L],['Maximum cavity radius (mm)',raw.Rmax*R],['Independent max |un|/U',raw.fieldAudit.maxNormal_U],['Independent max |Cp+σ|',raw.fieldAudit.maxCavityDynamicCpResidual],['Cylinder dry-contained',r.body?r.body.dryContained?'YES':'NO':'no afterbody'],['Minimum cylinder clearance (mm)',r.body?r.body.minimumClearance*1000:'not applicable'],['Artificial image-envelope volume (cm³)',r.volume.fullEnvelope*1e6],['Gas envelope (cm³)',r.volume.gasEnvelopeSegment==null?'not admitted':r.volume.gasEnvelopeSegment*1e6]);
  const trace=raw.nodes.slice(raw.Nf,raw.Nf+raw.Nc+1).map((v,k)=>[v[0]*R,1-raw.gamma[k+raw.Nf]**2]);
  $('pressurePlot').innerHTML=chart('Free-surface pressure · solved trace', [{name:'Reconstructed Cp',color:'#075eb7',points:trace},{name:'Target −σ',color:'#333',dash:true,points:[[0,-f.sigma],[L,-f.sigma]]}],{ylabel:'Signed Cp'});
  $('caption').textContent='Full solved Riabouchinsky image geometry. The downstream disk is mathematical, not a physical cylinder base. The cylinder is permitted only when dry-contained; no wetted-cylinder or nonzero-incidence flow is inferred. Passing sampled equations does not establish experimental accuracy.';
 }else $('caption').textContent='No completed admitted curve. The target, search bounds and complete diagnostic records remain in Save JSON.';
 $('numbers').innerHTML=rows(values);$('elapsed').textContent='Finished in '+((performance.now()-started)/1000).toFixed(1)+' s';
}
$('settings').onsubmit=e=>{e.preventDefault();invalidate();let request;try{request=read();}catch(e){error(e.message);return;}
 started=performance.now();$('solve').disabled=true;$('cancel').disabled=false;for(const id of ids)$(id).disabled=true;
 status('Starting the direct problem. Cavity endpoints are internal unknowns, not user-specified dimensions.','running');timer=setInterval(()=>{$('elapsed').textContent='Running · '+((performance.now()-started)/1000).toFixed(0)+' s · Cancel remains available';},1000);
 const w=worker=new Worker('forward-worker.js?v=0.4.0');w.onmessage=e=>{if(worker!==w)return;const m=e.data;if(m.type==='progress'){const q=m.row;status((q.stage||q.phase||'Solving')+(q.evaluation?' · evaluation '+q.evaluation:'')+(q.iteration!==undefined?' · iteration '+q.iteration:'')+(q.LOverRn?' · trial L/R = '+number(q.LOverRn):'')+(q.length?' · trial l/c = '+number(q.length):''),'running');}else{stop();if(m.type==='error')error(m.message);else show(m.result,m.fluid,request);}};w.onerror=e=>{if(worker!==w)return;stop();error(e.message||'Worker failed; no result is accepted.');};w.postMessage(request);
};
$('cancel').onclick=()=>{stop();status('Cancelled. No completed cavity result is reported.');$('elapsed').textContent='Cancelled';};
for(const id of ids)$(id).addEventListener('change',()=>{if(id==='longDomain'&&$('longDomain').checked){$('mesh').value='128';$('budget').value='600';}invalidate();});
$('dismiss').onclick=()=>$('errorDialog').close();
function download(name,data,type){const a=document.createElement('a'),u=URL.createObjectURL(new Blob([data],{type}));a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
$('save').onclick=()=>{try{download('cavitation-forward-case.json',JSON.stringify({schema:'cavitation-forward-case',version:1,inputs:read(),result},null,2),'application/json');}catch(e){error(e.message);}};
$('open').onclick=()=>$('file').click();$('file').onchange=async()=>{try{const f=$('file').files[0];if(!f)return;if(f.size>25e6)throw Error('Case exceeds 25 MB.');const v=JSON.parse(await f.text());if(v.schema!=='cavitation-forward-case'||v.version!==1||!v.inputs)throw Error('Open a forward case JSON here. Existing inverse cases can be opened in Advanced inverse mode.');const o=v.inputs;const values={geometry:o.geometry,method:o.method,inputMode:o.flow.mode,temperature:o.flow.temperatureC,speed:o.flow.U,pressure:o.flow.pInf/1000,sigma:o.flow.sigma,naca:o.foil.naca,alpha:o.foil.alpha,chord:o.foil.chord*1000,radius:o.disk.radius*1000,bodyRadius:o.disk.bodyRadius*1000,bodyLength:o.disk.bodyLength*1000,budget:o.settings.maxSeconds};for(const [id,value]of Object.entries(values))$(id).value=value;$('longDomain').checked=o.settings.extendedResearchDomain;controls();$('mesh').value=o.settings.resolution;read();invalidate();status('Case inputs restored. Solve to recompute; stored curves are not trusted as fresh solutions.');}catch(e){error(e.message);}finally{$('file').value='';}};
$('csv').onclick=()=>{if(!result)return;const r=result.result,lines=['# '+r.status,'x,y,kind'];if(r.final?.nodes)for(const p of r.final.nodes)lines.push([p[0]*result.request.disk.radius,p[1]*result.request.disk.radius,'BEM-diagnostic-m'].join(','));if(r.profile?.front)for(const p of [...r.profile.front,...r.profile.main])lines.push([p.x,p.r,'semiempirical-envelope-m'].join(','));if(r.status==='fully-wetted')for(const p of r.points)lines.push([p[0]*result.request.foil.chord,p[1]*result.request.foil.chord,'fully-wetted-section-m'].join(','));const c=r.cavity||r.diagnosticCandidate;if(c?.height)for(const p of c.height)lines.push([p.x*result.request.foil.chord,p.y*result.request.foil.chord,r.acceptedForDisplay?'cavity-m':'rejected-trial-m'].join(','));download('cavity-shape.csv',lines.join('\n'),'text/csv');};
$('figures').onclick=()=>{if(!result)return;download('cavity-figures.html','<!doctype html><meta charset="utf-8"><title>Cavity result</title><style>body{font:18px "Times New Roman";max-width:1100px;margin:auto}svg{width:100%}</style><h1>'+esc(result.result.status)+'</h1>'+['geometryPlot','pressurePlot','numbers'].map(id=>$(id).innerHTML).join('')+'<p>'+esc($('caption').textContent)+'</p>','text/html');};
if(document.body.dataset.geometry)$('geometry').value=document.body.dataset.geometry;
controls();
})();
