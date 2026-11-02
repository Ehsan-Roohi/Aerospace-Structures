(function(){
'use strict';
const $=id=>document.getElementById(id),ids=['geometry','method','inputMode','temperature','speed','pressure','sigma','naca','alpha','chord','radius','bodyRadius','bodyLength','coneAngle','coneEnvelopeModel','cylinderNose','mesh','budget','longDomain'];
let worker=null,result=null,fluid=null,started=0,timer=null,setupAdjustment='';
const viewState={hydrofoil:{geometry:'hydrofoil',method:'bem'},axisymmetric:{geometry:'disk',method:'bem'}};
const number=x=>Number.isFinite(x)?Number(x.toPrecision(6)).toString():'unavailable',esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function read(){
 const geometry=$('geometry').value,method=$('method').value;
 const rawFlow={mode:$('inputMode').value,temperatureC:+$('temperature').value,U:+$('speed').value,pInf:+$('pressure').value*1000,sigma:+$('sigma').value};
 const flow=CavitationFluid.target(rawFlow);
 const foil={naca:$('naca').value.trim(),alpha:+$('alpha').value,chord:+$('chord').value/1000};
 const disk={radius:+$('radius').value/1000,bodyRadius:+$('bodyRadius').value/1000,bodyLength:+$('bodyLength').value/1000};
 const cavitator={coneAngleDeg:+$('coneAngle').value,coneEnvelopeModel:$('coneEnvelopeModel').value,cylinderNose:$('cylinderNose').value};
 if(!['semenenko-cone-35','garabedian-logvinovich'].includes(cavitator.coneEnvelopeModel))throw Error('Choose a supported cone envelope dimension model.');
 const settings={resolution:+$('mesh').value,maxSeconds:+$('budget').value,extendedResearchDomain:$('longDomain').checked};
 if(geometry==='hydrofoil')ForwardHydrofoilCavitation.configuration({...flow,geometry:{naca:foil.naca},alpha:foil.alpha,chord:foil.chord,settings:{resolution:settings.resolution,maxSeconds:settings.maxSeconds}});
 else if(!(disk.radius>0)||['disk-cylinder','cylinder'].includes(geometry)&&!(disk.bodyRadius>0&&disk.bodyLength>0))throw Error('Use positive active geometry dimensions.');
 if(['cone','cylinder'].includes(geometry)&&method!=='analytical')throw Error('Cone and cylinder cases require the explicit Analytical estimate method.');
 if(method==='analytical'&&(geometry==='cone'||geometry==='cylinder'&&cavitator.cylinderNose==='cone')&&!(cavitator.coneAngleDeg>=30&&cavitator.coneAngleDeg<=180))throw Error('Use a full cone apex angle from 30° to 180°, within the source drag domain.');
 return {geometry,method,flow,foil,disk,cavitator,settings};
}
function status(text,kind='ready'){$('status').textContent=text;$('status').dataset.state=kind;}
function controls(){
 const geometry=$('geometry').value,hydro=geometry==='hydrofoil',special=['cone','cylinder'].includes(geometry),body=['disk-cylinder','cylinder'].includes(geometry);
 $('foilInputs').hidden=!hydro;$('diskInputs').hidden=hydro;$('bodyInputs').hidden=!body;$('noseRow').hidden=geometry!=='cylinder';$('cylinderNose').disabled=geometry!=='cylinder';
 const cone=geometry==='cone'||geometry==='cylinder'&&$('cylinderNose').value==='cone';$('coneInputs').hidden=!cone;$('coneAngle').disabled=!cone;$('coneEnvelopeModel').disabled=!cone||$('method').value!=='analytical';
 $('referenceOption').disabled=hydro||special;$('bemOption').disabled=special;$('analyticalOption').disabled=hydro;
 if(hydro&&$('method').value!=='bem'){$('method').value='bem';setupAdjustment='Hydrofoil selected: the boundary-element method applies. Axisymmetric reference and analytical estimates do not represent this geometry.';}
 const analytical=$('method').value==='analytical';$('coneOption').disabled=!analytical;$('cylinderOption').disabled=!analytical;
 $('pressureRow').hidden=$('inputMode').value==='sigma';$('sigmaRow').hidden=$('inputMode').value!=='sigma';
 for(const id of ['naca','alpha','chord'])$(id).disabled=!hydro;
 $('radius').disabled=hydro;for(const id of ['bodyRadius','bodyLength'])$(id).disabled=!body;
 $('pressure').disabled=$('inputMode').value==='sigma';$('sigma').disabled=$('inputMode').value!=='sigma';
 const bem=$('method').value==='bem';$('longRow').hidden=hydro||!bem;
 const old=+$('mesh').value,options=hydro?[48,64,96]:[0,32,64,128];
 if([...$('mesh').options].map(o=>+o.value).join(',')!==options.join(','))$('mesh').replaceChildren(...options.map(v=>new Option(v===0?'Automatic · 32 → 128':String(v),String(v))));
 const next=options.includes(old)?old:hydro?48:0;$('mesh').value=String(next);
 if(next!==old&&bem)setupAdjustment=next===0?'Automatic disk mesh starts at 32 cavity bands and may retry 128 if only the field audit fails. The same total time budget and flow inputs are retained.':`Mesh ${next>old?'raised':'adjusted'} from ${old} to ${next} ${hydro?'panels for automatic hydrofoil detachment':'cavity bands for the axisymmetric BEM'}. Flow inputs are unchanged.`;
 $('mesh').disabled=!bem;$('budget').disabled=!bem;$('numericalSettings').hidden=!bem;
 $('setupNote').textContent=setupAdjustment;
 for(const link of document.querySelectorAll('[data-geometry-view]')){
  const current=link.dataset.geometryView===(hydro?'hydrofoil':'axisymmetric');
  if(current)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
 }
 viewState[hydro?'hydrofoil':'axisymmetric']={geometry,method:$('method').value};
 $('geometryNote').textContent=hydro?'Steady 2-D attached sheet; angle of attack applies to this section.':geometry==='cone'?'Axisymmetric cone in axial flow. The apex angle is the full included angle; a 2-D triangular wedge is a different problem.':geometry==='cylinder'?'Cylinder downstream of the nose separation plane. Afterbody length excludes the nose; clearance is geometric, without a wetted-cylinder flow solution.':geometry==='disk-cylinder'?'Sharp front disk with a dry cylindrical afterbody inside the cavity. Axial flow only (α = 0°). Body intersection is checked.':'Sharp circular disk in axial flow (α = 0°). Choose Analytical estimate to enable cone and cylinder cases.';
 $('methodNote').textContent=analytical?(cone?'Cone drag: Eq. 36, full apex 30–180°, σ ≤ 0.25. '+($('coneEnvelopeModel').value==='semenenko-cone-35'?'Cone-specific dimensions: Eqs. 35–36.':'Generic asymptotic dimensions: Eqs. 27–28 with cone drag.')+' Eq. 51 main envelope; finite-σ accuracy is unqualified.':'Source-model drag and a low-σ main-envelope estimate. A finite endpoint is retained; no physical closure or experimental accuracy is established.'):!bem?'Semenenko disk correlation, σ = 0.012–0.057. Immediate semiempirical envelope with a finite endpoint.':hydro?'Automatic hydrofoil detachment uses at least 48 panels. A fully wetted result is valid when no cavity is required.':'Disk BEM with an artificial rear image disk. The length bracket expands automatically when needed. A numerical-range or field failure is not a physical no-cavity result.';
 try{const f=CavitationFluid.target({mode:$('inputMode').value,temperatureC:+$('temperature').value,U:+$('speed').value,pInf:+$('pressure').value*1000,sigma:+$('sigma').value});$('fluidInfo').textContent=`σ = ${number(f.sigma)} · ρ = ${number(f.rho)} kg/m³ · pv = ${number(f.pc/1000)} kPa · absolute p∞ = ${number(f.pInf/1000)} kPa`;}catch(e){$('fluidInfo').textContent=e.message;}
}
function stop(){worker?.terminate();worker=null;clearInterval(timer);timer=null;$('solve').disabled=false;$('cancel').disabled=true;for(const id of ids)$(id).disabled=false;controls();}
function clearOutput(){result=null;fluid=null;$('output').hidden=true;for(const id of ['csv','figures'])$(id).disabled=true;}
function invalidate(){stop();clearOutput();$('elapsed').textContent='';status('Inputs changed. Solve to recompute the selected problem.');}
function error(message){status(message,'error');$('errorText').textContent=message;if(!$('errorDialog').open)$('errorDialog').showModal();}
function failRun(message,request){
 stop();clearOutput();
 result={request,result:{status:'worker-error',acceptedForDisplay:false,cavityPresent:false,message},fluid:request.flow};
 $('elapsed').textContent='Calculation stopped after '+((performance.now()-started)/1000).toFixed(1)+' s';
 error(message.replace(/[.!?]?$/,'.')+' No completed result is accepted. Your inputs are retained; retry or load an example.');
}
function resultMessage(r,f,request){
 if(request.geometry==='hydrofoil')return r.message||r.reason||r.status;
 if(request.method==='analytical')return !r.ok?'Analytical estimate unavailable: '+(r.errors||[r.status]).join(' ')+' Flow inputs are unchanged; use a case within the source domain or explicitly load an example.':r.body&&!r.body.dryContained?'The estimated main envelope does not contain the full cylinder. Its profile is diagnostic only; no gas volume is admitted.':'Analytical estimate evaluated in its stated algebraic and drag domains. The main envelope has finite endpoints, with no physical closure or experimental accuracy claim.';
 if(['UNSUPPORTED_TARGET','NUMERICAL_DOMAIN_EXHAUSTED'].includes(r.status)){
  const range=r.search?.endpointSigmaRange;
  const lengths=r.search?.lengthDomain, validRange=Array.isArray(range)&&range.length===2&&range.every(v=>Number.isFinite(v)&&v>0);
  const speedSpan=validRange&&f.mode==='physical'?`; at this pressure and temperature these endpoints correspond to U ≈ ${number(Math.sqrt(2*(f.pInf-f.pc)/(f.rho*range[1])))}–${number(Math.sqrt(2*(f.pInf-f.pc)/(f.rho*range[0])))} m/s`:'';
  return `Target σ = ${number(f.sigma)} is outside this completed numerical search${validRange?`; fresh endpoint values span σ ≈ ${number(range[0])}–${number(range[1])}`:''}${lengths?` over image L/R = ${number(lengths[0])}–${number(lengths[1])}`:''}${speedSpan}. This is not a speed limit or evidence that no physical cavity exists. Flow inputs are unchanged. See Inputs & model limits for the available BEM and source-model ranges.`;
 }
 if(request.method==='reference')return r.ok?(r.body&&!r.body.dryContained?'The cylinder is not fully contained. The reference envelope remains a diagnostic only; no gas volume is admitted.':'Semiempirical reference evaluated in its published σ range. This is not a new BEM prediction.'):(r.errors||[r.status]).join(' ');
 return r.ok?'Target σ, shape equations and independent field screens passed.'+(r.search?.expansionSteps?.length?' The numerical length bracket expanded automatically.':'')+(r.meshSelection?.attemptedResolutions?.length>1?' A finer 128-band solve was required; the failed 32-band audit is retained.':'')+' The rear image disk is an artificial closure; experimental accuracy is not qualified.':(r.errors||[r.status]).join(' ');
}
function chart(title,series,{equal=false,xlabel='x (mm)',ylabel='r (mm)',shade=false}={}){
 const all=series.flatMap(s=>s.points).filter(p=>p.every(Number.isFinite));if(!all.length)return '<p>No finite curve is available.</p>';
 const W=960,H=equal?420:350,m={l:112,r:25,t:100,b:55},w=W-m.l-m.r,h=H-m.t-m.b;
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
 result={request,result:r,fluid:f};fluid=f;$('output').hidden=false;$('raw').textContent=JSON.stringify(r,null,2);$('csv').disabled=!(r.points?.length||r.wetPreflight?.fine?.points?.length||r.cavity?.height?.length||r.diagnosticCandidate?.height?.length||r.profile?.front?.length||r.profile?.main?.length||r.profile?.full?.length);$('figures').disabled=false;
 const hydro=request.geometry==='hydrofoil',ref=request.method==='reference',analytical=request.method==='analytical',accepted=hydro?r.acceptedForDisplay:r.ok&&(!r.body||r.body.dryContained);
 status(resultMessage(r,f,request),accepted?'ready':'error');
 let values=[['Input σ',f.sigma],['Speed (m/s)',f.U],['Absolute ambient pressure (kPa)',f.pInf/1000],['Temperature (°C)',f.temperatureC],['Experimental validation','Not qualified for this calculation']];
 $('pressurePlot').innerHTML='';$('geometryPlot').innerHTML='';$('modelSource').textContent='';$('modelSource').hidden=true;$('modelWarnings').hidden=true;$('modelWarnings').innerHTML='';
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
  values.push(['Status',r.status],['Cavity present',r.cavityPresent?'YES':r.status==='fully-wetted'?'No · fully wetted':'No accepted cavity'],['Solved length l/c',r.cavityPresent?r.root.length:'not reported'],['Numerical root residual',r.root?.residual??(r.status==='fully-wetted'?'not applicable · fully wetted':'unresolved')],['Cavity area per unit span (mm²)',r.cavityPresent?r.cavityArea.perUnitSpan_m2*1e6:'not reported']);
  $('caption').textContent=r.cavityPresent?'Computed steady 2-D research sheet. Sampled pressure and gap checks pass; smooth-contact derivative, mesh accuracy and experimental accuracy remain unqualified. Area is per unit span, not a 3-D cavity volume.':r.acceptedForDisplay?'Fully wetted on both checked meshes: no attached cavity is required by this potential-flow calculation. This is not an experimental inception prediction.':'No accepted physical cavity or volume. Failed trial values are retained in JSON and diagnostics. Initial guesses cannot override physical screens.';
 }else if(analytical&&r.ok){
  const p=r.profile.main.map(v=>[v.x*1000,v.r*1000]),color=accepted?'#075eb7':'#b82028';
  const s=[{name:accepted?'Main-envelope estimate':'Nonadmitted envelope trial',color,dash:true,points:p},{name:'Opposite meridian',color,dash:true,points:p.map(v=>[v[0],-v[1]])}];
  const nose=r.geometry?.cavitatorProfile?.map(v=>[v.x*1000,v.r*1000]);
  if(nose?.length)s.push({name:r.geometry.cavitatorKind==='cone'?'Cone nose':'Circular nose / disk',color:'#202b37',points:[...nose,...nose.slice().reverse().map(v=>[v[0],-v[1]])]});
  if(r.body)s.push({name:'Specified cylinder',color:'#444',points:[[0,r.body.radius*1000],[r.body.length*1000,r.body.radius*1000],[r.body.length*1000,-r.body.radius*1000],[0,-r.body.radius*1000]]});
  $('geometryPlot').innerHTML=chart('Analytical main envelope · finite endpoints',s,{equal:true});
  values.push(['Model',r.model],['Envelope dimension model',r.input.envelopeModel],['Dimension equations',r.dimensions.dimensionEquations],['Nose drag coefficient CD',r.drag.CD],['Nose drag force (N)',r.drag.force],['Drag equation / model',r.drag.equation+' / '+r.drag.model],['Estimated main-envelope length (mm)',r.dimensions.Lc*1000],['Estimated maximum radius (mm)',r.dimensions.Rmax*1000],['Estimated length / maximum diameter',r.dimensions.estimatedAspectRatio],['Finite endpoint radius (mm)',r.dimensions.endpoint.r*1000],['Estimated envelope-segment volume (cm³)',r.volume.envelopeSegment*1e6],['Gas envelope segment (cm³)',r.volume.gasEnvelopeSegment==null?'not admitted':r.volume.gasEnvelopeSegment*1e6],['Cylinder geometrically contained',r.body?r.body.dryContained?'YES · estimate':'NO':'no afterbody'],[r.body?.minimumClearanceCoversWholeBody===false?'Covered-segment minimum cylinder clearance (mm)':'Minimum cylinder clearance (mm)',r.body?r.body.minimumClearance*1000:'not applicable'],...(r.body?.minimumClearanceCoversWholeBody===false?[[ 'Uncovered afterbody length (mm)',r.body.uncoveredLength*1000],['Whole-body clearance','Not evaluated: afterbody extends beyond the estimated envelope']]:[]),['Source',r.source.author+', '+r.source.year+' · '+r.source.report],['Physical closure / profile validation','Not established']);
  $('caption').textContent='Source-model main envelope (Semenenko Eq. 51, κ = 1) with estimated dimensions and finite endpoint radius. Frontal and tail regions are not independently resolved. Nose drag excludes afterbody force; the segment volume is not a validated closed-cavity volume.';
 }else if(ref&&r.ok){
  const data=[...r.profile.front,...r.profile.main],p=data.map(v=>[v.x*1000,v.r*1000]),end=r.dimensions.Lc*1000;
  const s=[{name:'Reference envelope',color:'#075eb7',points:p},{name:'Opposite meridian',color:'#075eb7',points:p.map(v=>[v[0],-v[1]])},{name:'Disk',color:'#202b37',points:[[0,-request.disk.radius*1000],[0,request.disk.radius*1000]]}];
  if(request.geometry==='disk-cylinder')s.push({name:'Specified cylinder',color:'#444',points:[[0,request.disk.bodyRadius*1000],[request.disk.bodyLength*1000,request.disk.bodyRadius*1000],[request.disk.bodyLength*1000,-request.disk.bodyRadius*1000],[0,-request.disk.bodyRadius*1000]]});
  $('geometryPlot').innerHTML=chart('Disk cavity reference · original physical scale',s,{equal:true,shade:true});
  values.push(['Approximate reported length (mm)',end],['Maximum radius (mm)',r.dimensions.Rmax*1000],['Endpoint radius is finite (mm)',r.dimensions.endpoint.r*1000],['Cylinder clearance (mm)',r.body?r.body.minimumClearance*1000:'no afterbody'],['Envelope segment volume (cm³)',r.volume.envelopeSegment*1e6],['Gas envelope segment (cm³)',r.volume.gasEnvelopeSegment==null?'not reported':r.volume.gasEnvelopeSegment*1e6]);
  $('caption').textContent='Semenenko equations 31–34, fitted natural disk-cavity envelope. The approximate reported length is not the zero of the radius polynomial. No artificial zero or physical closure is added. Volume is an envelope segment, not a validated closed gas volume.';
 }else if(r.final?.nodes){
  const raw=r.final,R=request.disk.radius*1000,p=r.profile.full.map(v=>[v.x*1000,v.r*1000]),L=raw.L*R;
  const s=[{name:accepted?'BEM cavity':'Rejected diagnostic trial',color:accepted?'#075eb7':'#b82028',points:p},{name:'Opposite meridian',color:accepted?'#075eb7':'#b82028',points:p.map(v=>[v[0],-v[1]])},{name:'Physical disk',color:'#202b37',points:[[0,-R],[0,R]]},{name:'Artificial rear disk',color:'#9a641a',dash:true,points:[[L,-R],[L,R]]}];
  if(request.geometry==='disk-cylinder')s.push({name:'Cylindrical afterbody',color:'#444',points:[[0,request.disk.bodyRadius*1000],[request.disk.bodyLength*1000,request.disk.bodyRadius*1000],[request.disk.bodyLength*1000,-request.disk.bodyRadius*1000],[0,-request.disk.bodyRadius*1000]]});
  $('geometryPlot').innerHTML=chart(r.ok?'Forward BEM cavity · research result':'Nonaccepted BEM trial · diagnostic only',s,{equal:true,shade:accepted});
  values.push(['Length-search strategy',r.search?.lengthStrategy||r.input?.lengthStrategy||'bounded search'],['Computed image L/R search',r.search?.lengthDomain?.join('–')||'not available'],['Cavity bands',r.input?.Nc||request.settings.resolution],['Mesh choice',r.meshSelection?.mode==='automatic'?'Automatic · '+r.meshSelection.attemptedResolutions.join(' → '):'Manual'],['Achieved σ',r.achievedSigma],['Target σ residual',r.sigmaResidual],['Solved full image separation (mm)',L],['Maximum cavity radius (mm)',raw.Rmax*R],['Independent max |un|/U',raw.fieldAudit.maxNormal_U],['Independent max |Cp+σ|',raw.fieldAudit.maxCavityDynamicCpResidual],['Cylinder dry-contained',r.body?r.body.dryContained?'YES':'NO':'no afterbody'],['Minimum cylinder clearance (mm)',r.body?r.body.minimumClearance*1000:'not applicable'],['Artificial image-envelope volume (cm³)',r.volume.fullEnvelope*1e6],['Gas envelope (cm³)',r.volume.gasEnvelopeSegment==null?'not admitted':r.volume.gasEnvelopeSegment*1e6]);
  const trace=raw.nodes.slice(raw.Nf,raw.Nf+raw.Nc+1).map((v,k)=>[v[0]*R,1-raw.gamma[k+raw.Nf]**2]);
  $('pressurePlot').innerHTML=chart('Free-surface pressure · solved trace', [{name:'Reconstructed Cp',color:'#075eb7',points:trace},{name:'Target −σ',color:'#333',dash:true,points:[[0,-f.sigma],[L,-f.sigma]]}],{ylabel:'Signed Cp'});
  $('caption').textContent='Full solved Riabouchinsky image geometry. The downstream disk is mathematical, not a physical cylinder base. The cylinder is permitted only when dry-contained; no wetted-cylinder or nonzero-incidence flow is inferred. Passing sampled equations does not establish experimental accuracy.';
 }else $('caption').textContent='No completed admitted curve. The target, search bounds and complete diagnostic records remain in Save JSON.';
 for(const id of ['geometryPlot','pressurePlot'])$(id).hidden=!$(id).innerHTML;
 if(r.source?.url&&/^https:\/\//.test(r.source.url)){$('modelSource').hidden=false;$('modelSource').innerHTML='Source: <a href="'+esc(r.source.url)+'" target="_blank" rel="noopener">'+esc(r.source.author||r.source.title)+' ('+esc(r.source.year||'source')+')</a>'+(analytical?' · drag Eq. '+esc(r.drag?.equation||'not evaluated')+'; main envelope Eq. 51':ref?' · disk reference Eqs. 31–34':'');}
 if(r.warnings?.length){$('modelWarnings').hidden=false;$('modelWarnings').innerHTML='<h2>Model warnings</h2><ul>'+r.warnings.map(w=>'<li>'+esc(w)+'</li>').join('')+'</ul>';}
 $('numbers').innerHTML=rows(values);$('elapsed').textContent='Finished in '+((performance.now()-started)/1000).toFixed(1)+' s';
}
$('settings').onsubmit=e=>{e.preventDefault();invalidate();let request;try{request=read();}catch(e){error(e.message);return;}
 started=performance.now();$('solve').disabled=true;$('cancel').disabled=false;for(const id of ids)$(id).disabled=true;
 status('Starting the direct problem. Cavity endpoints are internal unknowns.','running');timer=setInterval(()=>{$('elapsed').textContent='Running · '+((performance.now()-started)/1000).toFixed(0)+' s · Cancel remains available';},1000);
 try{
  const w=worker=new Worker('forward-worker.js?v=0.5.5');
  w.onmessage=e=>{if(worker!==w)return;const m=e.data;
   if(m?.type==='progress'){const q=m.row||{};status((q.stage||q.phase||'Solving')+(q.evaluation?' · evaluation '+q.evaluation:'')+(q.iteration!==undefined?' · iteration '+q.iteration:'')+(q.LOverRn?' · trial L/R = '+number(q.LOverRn):'')+(q.length?' · trial l/c = '+number(q.length):''),'running');return;}
   if(m?.type==='error'){failRun(m.message||'The solver worker reported an error.',request);return;}
   if(m?.type!=='result'||!m.result||!m.fluid){failRun('The solver returned an incomplete response.',request);return;}
   stop();try{show(m.result,m.fluid,request);}catch(e){failRun('The result could not be displayed: '+e.message,request);}
  };
  w.onerror=e=>{e.preventDefault();if(worker!==w)return;failRun(e.message||'The solver worker failed.',request);};
  w.onmessageerror=()=>{if(worker===w)failRun('The solver response could not be read.',request);};
  w.postMessage(request);
 }catch(e){failRun('The solver could not start: '+e.message,request);}
};
$('cancel').onclick=()=>{stop();status('Cancelled. No completed cavity result is reported.');$('elapsed').textContent='Cancelled';};
for(const id of ids)$(id).addEventListener('change',()=>{setupAdjustment='';if(id==='longDomain')setupAdjustment=$('longDomain').checked?'The initial bracket is explicitly extended. Mesh, time budget and flow inputs are unchanged.':'Automatic length-bracket expansion is enabled. Mesh, time budget and flow inputs are unchanged.';invalidate();});
for(const link of document.querySelectorAll('[data-geometry-view]'))link.addEventListener('click',e=>{
 if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;
 e.preventDefault();const hydro=link.dataset.geometryView==='hydrofoil';
 if(hydro&&$('geometry').value==='hydrofoil'||!hydro&&$('geometry').value!=='hydrofoil')return;
 const next=viewState[hydro?'hydrofoil':'axisymmetric'];setupAdjustment='';$('geometry').value=next.geometry;$('method').value=next.method;invalidate();
});
$('loadExample').onclick=()=>{
 const kind=$('example').value,research=kind==='hydrofoil-research',hydro=kind==='hydrofoil-wet'||research,cone=kind==='cone-analytical',cylinder=kind==='cylinder-analytical';
 const values=research?{geometry:'hydrofoil',method:'bem',inputMode:'sigma',temperature:20,speed:5,pressure:101.325,sigma:1.3157940493756035,naca:'0020',alpha:4,chord:160,mesh:48,budget:240}:hydro?{geometry:'hydrofoil',method:'bem',inputMode:'physical',temperature:20,speed:5,pressure:101.325,naca:'0012',alpha:4,chord:160,mesh:48,budget:300}:cone||cylinder?{geometry:cone?'cone':'cylinder',method:'analytical',inputMode:'sigma',temperature:20,speed:20,sigma:.037,radius:10,coneAngle:150,coneEnvelopeModel:'semenenko-cone-35',cylinderNose:'flat',bodyRadius:8,bodyLength:150,mesh:32,budget:300}:{geometry:'disk',method:'reference',inputMode:'sigma',temperature:20,speed:20,sigma:.03,radius:10,mesh:32,budget:300};
 for(const [id,value]of Object.entries(values))$(id).value=value;
 $('longDomain').checked=false;setupAdjustment='';invalidate();$('mesh').value=String(values.mesh);controls();
 status(research?'Loaded the attached-cavity RESEARCH example: NACA 0020, α = 4°, chord 160 mm, σ = 1.3157940493756035, 48 panels, automatic initialization. Budget 240 s. This numerical research case is not experimentally validated. Solve to calculate.':hydro?'Loaded the fully wetted hydrofoil example: NACA 0012, α = 4°, chord 160 mm, U = 5 m/s, p∞ = 101.325 kPa, T = 20 °C. Solve to calculate.':cone||cylinder?'Loaded the explicit '+(cone?'150° cone':'flat-nose cylinder')+' analytical example at σ = 0.037. The main-envelope estimate and its source limits will be reported when solved.':'Loaded the published disk-reference example: radius 10 mm, σ = 0.03, T = 20 °C, U = 20 m/s. Solve to evaluate the reference envelope.');
};
$('dismiss').onclick=()=>$('errorDialog').close();
function download(name,data,type){const a=document.createElement('a'),u=URL.createObjectURL(new Blob([data],{type}));a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
function exportMetadata(){
 if(!result)return null;const r=result.result,q=result.request;
 return {geometry:q.geometry,method:q.method,model:r.model||q.method,source:r.source||null,profileKind:r.profile?.kind||null,coneEnvelopeModel:q.cavitator?.coneEnvelopeModel||null,envelopeModel:r.input?.envelopeModel||null,dimensionEquations:r.dimensions?.dimensionEquations||null,profileEquation:r.profile?.equation||null,admission:r.admission||null,warnings:r.warnings||[],physicalClosureClaim:r.profile?.physicalClosureClaim??r.physicalClosureClaim??false,experimentalQualification:false,coordinateUnits:'m'};
}
$('save').onclick=()=>{try{download('cavitation-forward-case.json',JSON.stringify({schema:'cavitation-forward-case',version:1,inputs:read(),result,metadata:exportMetadata()},null,2),'application/json');}catch(e){error(e.message);}};
$('open').onclick=()=>$('file').click();$('file').onchange=async()=>{try{const f=$('file').files[0];if(!f)return;if(f.size>25e6)throw Error('Case exceeds 25 MB.');const v=JSON.parse(await f.text());if(v.schema!=='cavitation-forward-case'||v.version!==1||!v.inputs)throw Error('Open a forward case JSON here. Existing inverse cases can be opened in Advanced inverse mode.');const o=v.inputs;if(!['hydrofoil','disk','disk-cylinder','cone','cylinder'].includes(o.geometry)||!['bem','reference','analytical'].includes(o.method)||o.geometry==='hydrofoil'&&o.method!=='bem'||['cone','cylinder'].includes(o.geometry)&&o.method!=='analytical')throw Error('This case has an unsupported geometry or method pairing. Its inputs were not loaded.');if(o.cavitator?.coneEnvelopeModel!==undefined&&!['semenenko-cone-35','garabedian-logvinovich'].includes(o.cavitator.coneEnvelopeModel))throw Error('This case has an unsupported cone envelope dimension model. Its inputs were not loaded.');const values={geometry:o.geometry,method:o.method,inputMode:o.flow.mode,temperature:o.flow.temperatureC,speed:o.flow.U,pressure:o.flow.pInf/1000,sigma:o.flow.sigma,naca:o.foil.naca,alpha:o.foil.alpha,chord:o.foil.chord*1000,radius:o.disk.radius*1000,bodyRadius:o.disk.bodyRadius*1000,bodyLength:o.disk.bodyLength*1000,coneAngle:o.cavitator?.coneAngleDeg??150,coneEnvelopeModel:o.cavitator?.coneEnvelopeModel??'garabedian-logvinovich',cylinderNose:o.cavitator?.cylinderNose??'flat',budget:o.settings.maxSeconds};stop();clearOutput();for(const [id,value]of Object.entries(values))$(id).value=value;$('longDomain').checked=Boolean(o.settings.extendedResearchDomain);setupAdjustment='';controls();if([...$('mesh').options].some(q=>+q.value===o.settings.resolution))$('mesh').value=o.settings.resolution;else setupAdjustment=`Saved mesh ${o.settings.resolution} adjusted to ${$('mesh').value} for the selected algorithm. Flow inputs are unchanged.`;read();invalidate();status('Case inputs restored. Solve to recompute; stored curves are not trusted as fresh solutions.');}catch(e){error(e.message);}finally{$('file').value='';}};
$('csv').onclick=()=>{if(!result)return;const r=result.result,lines=['# '+r.status,'# metadata '+JSON.stringify(exportMetadata()),'x,y,kind'];if(r.final?.nodes)for(const p of r.final.nodes)lines.push([p[0]*result.request.disk.radius,p[1]*result.request.disk.radius,'BEM-diagnostic-m'].join(','));if(r.profile?.main)for(const p of [...(r.profile.front||[]),...r.profile.main])lines.push([p.x,p.r,result.request.method==='analytical'?'source-main-envelope-estimate-m':'semiempirical-envelope-m'].join(','));if(r.status==='fully-wetted')for(const p of r.points)lines.push([p[0]*result.request.foil.chord,p[1]*result.request.foil.chord,'fully-wetted-section-m'].join(','));const c=r.cavity||r.diagnosticCandidate;if(c?.height)for(const p of c.height)lines.push([p.x*result.request.foil.chord,p.y*result.request.foil.chord,r.acceptedForDisplay?'cavity-m':'rejected-trial-m'].join(','));download('cavity-shape.csv',lines.join('\n'),'text/csv');};
$('figures').onclick=()=>{if(!result)return;download('cavity-figures.html','<!doctype html><meta charset="utf-8"><title>Cavity result</title><style>body{font:18px "Times New Roman";max-width:1100px;margin:auto}svg{width:100%}pre{font:12px Arial;white-space:pre-wrap;overflow-wrap:anywhere;background:#f1f4f7;padding:12px}table{border-collapse:collapse;width:100%;font:14px Arial}th,td{text-align:left;border-bottom:1px solid #ddd;padding:7px}</style><h1>'+esc(result.result.status)+'</h1>'+['geometryPlot','pressurePlot','numbers','modelSource','modelWarnings'].map(id=>$(id).innerHTML).join('')+'<p>'+esc($('caption').textContent)+'</p><pre>'+esc(JSON.stringify(exportMetadata(),null,2))+'</pre>','text/html');};
if(document.body.dataset.geometry)$('geometry').value=document.body.dataset.geometry;
controls();
})();
