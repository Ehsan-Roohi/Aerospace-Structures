(function(){
'use strict';
const C=window.NodalVortexCavity,$=id=>document.getElementById(id);
const fields=['radius','lengthRatio','panels','speed','density','vapourPressure','quadratureOrder','maxIterations'];
let worker=null,result=null,serial=0,advanced={};
const esc=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=v=>Number.isFinite(v)?Number(v.toPrecision(5)).toString():'unavailable';
function inputs(values=null){
 const o=values?{...values}:{...advanced,...Object.fromEntries(fields.map(id=>[id,Number($(id).value)]))};
 for(const id of fields)if(typeof o[id]!=='number'||!Number.isFinite(o[id]))throw Error(id+' must be finite.');
 if(!(o.radius>0&&o.speed>0&&o.density>0&&o.vapourPressure>=0))throw Error('Use positive radius, speed and density, and nonnegative cavity pressure.');
 if(!Number.isInteger(o.maxIterations)||o.maxIterations<1||o.maxIterations>40)throw Error('Use 1–40 shape iterations.');
 const solver={L:o.lengthRatio,Nc:o.panels,Nf:o.diskPanels??o.panels/2,nNear:o.quadratureOrder,maxIterations:o.maxIterations,tolerance:1e-10,audit:true};
 C.setup(solver);return {...o,solver};
}
function state(message,kind='warning'){$('status').textContent=message;$('status').dataset.state=kind;}
function buttons(running){$('solve').disabled=running;$('cancel').disabled=!running;$('progress').hidden=!running;for(const id of [...fields,'open','save'])$(id).disabled=running;}
function stop(){serial++;worker?.terminate();worker=null;buttons(false);}
function clearResult(){result=null;$('results').hidden=true;for(const id of ['csv','figures'])$(id).disabled=true;$('offgridGate').textContent='Independent field: UNQUALIFIED';$('experimentalGate').textContent='Experimental validation: NOT PERFORMED';}
function error(message){stop();clearResult();state(message,'error');$('errorMessage').textContent=message;if(!$('errorDialog').open)$('errorDialog').showModal();}
function stale(){stop();clearResult();state('Inputs changed. Solve again; stored diagnostic results are not fresh calculations.');}
function download(name,body,type){const a=document.createElement('a'),u=URL.createObjectURL(new Blob([body],{type}));a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
  function chart(title, xlabel, ylabel, series, opts = {}) {
    const all = series.flatMap(s => s.points).filter(p => p.every(Number.isFinite));
    if (!all.length) return '<p>No finite profile samples are available.</p>';
    const W=920,m={l:100,r:25,t:68,b:55};
    let legendX=m.l,legendY=43;const legends=[];
    for(const s of series){if(!s.name)continue;const width=s.legendWidth||Math.max(210,s.name.length*7.2+44);if(legendX+width>W-m.r&&legendX>m.l){legendX=m.l;legendY+=25;}legends.push({s,x:legendX,y:legendY});legendX+=width;}
    m.t=legendY+25;const H=(opts.height || 330)+(legendY-43),w=W-m.l-m.r,h=H-m.t-m.b;
    let xmin=Math.min(...all.map(p=>p[0])),xmax=Math.max(...all.map(p=>p[0]));
    let ymin=Math.min(...all.map(p=>p[1])),ymax=Math.max(...all.map(p=>p[1]));
    if(opts.yRange){ymin=opts.yRange[0];ymax=opts.yRange[1];}
    if(xmax===xmin){xmin-=.5;xmax+=.5;} if(ymax===ymin){ymin-=.01;ymax+=.01;}
    let dy=(ymax-ymin)*.12; ymin-=dy;ymax+=dy;
    if(opts.equalScale){const xm=(xmin+xmax)/2,ym=(ymin+ymax)/2,yr=Math.max(ymax-ymin,(xmax-xmin)*h/w),xr=yr*w/h;xmin=xm-xr/2;xmax=xm+xr/2;ymin=ym-yr/2;ymax=ym+yr/2;}
    const X=x=>m.l+(x-xmin)*w/(xmax-xmin),Y=y=>m.t+h-(y-ymin)*h/(ymax-ymin);
    let svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}"><rect width="100%" height="100%" fill="white"/><text x="${m.l}" y="21" font-size="20" font-weight="bold">${esc(title)}</text>`;
    for(const {s,x,y} of legends)svg+=`<line x1="${x}" y1="${y}" x2="${x+23}" y2="${y}" stroke="${s.color}" stroke-width="2.5" ${s.dash?'stroke-dasharray="6 4"':''}/><text x="${x+30}" y="${y+5}">${esc(s.name)}</text>`;
    for(let i=0;i<=4;i++){const x=xmin+(xmax-xmin)*i/4,y=ymin+(ymax-ymin)*i/4;svg+=`<path d="M${X(x)},${m.t}V${m.t+h} M${m.l},${Y(y)}H${m.l+w}" fill="none" stroke="#dce4ec"/><text x="${X(x)}" y="${m.t+h+23}" text-anchor="middle">${esc(number(x))}</text><text x="${m.l-9}" y="${Y(y)+5}" text-anchor="end">${esc(number(y))}</text>`;}
    if(ymin<=0&&ymax>=0)svg+=`<line x1="${m.l}" y1="${Y(0)}" x2="${m.l+w}" y2="${Y(0)}" stroke="#8b98a7"/>`;
    for(const s of series){const points=s.points.filter(p=>p.every(Number.isFinite));if(s.connect!==false)svg+=`<polyline points="${points.map(p=>X(p[0])+','+Y(p[1])).join(' ')}" fill="none" stroke="${s.color}" stroke-width="2" ${s.dash?'stroke-dasharray="6 4"':''}/>`;if(s.dots)for(const p of points)svg+=`<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="2.5" fill="${s.color}"/>`;}
    svg+=`<rect x="${m.l}" y="${m.t}" width="${w}" height="${h}" fill="none" stroke="#8b98a7"/><text x="${m.l+w/2}" y="${H-8}" text-anchor="middle">${esc(xlabel)}</text><text transform="translate(18 ${m.t+h/2}) rotate(-90)" text-anchor="middle">${esc(ylabel)}</text></svg>`;
    return svg;
  }

function figure(id,svg,caption){$(id).innerHTML=svg+'<figcaption>'+esc(caption)+'</figcaption>';}
function fieldSamples(r){
 const a=r.fieldAudit,p=a.profiles,fracs=a.fractions,lengths=[],arc=[0];
 for(let j=0;j<r.nodes.length-1;j++){const x=r.nodes[j],y=r.nodes[j+1];lengths[j]=Math.hypot(y[0]-x[0],y[1]-x[1]);arc[j+1]=arc[j]+lengths[j];}
 return p.points.map((point,k)=>{const j=p.panel[k],normal=p.normal_U[k],tangent=p.tangent_U[k];return {x:point[0],r:point[1],s:arc[j]+fracs[k%fracs.length]*lengths[j],panel:j,normal,tangent,cp:1-normal*normal-tangent*tangent,cavity:j>=r.Nf&&j<r.Nf+r.Nc};});
}
function show(r){
 if(!r||!Array.isArray(r.nodes)||!r.fieldAudit?.fieldsFinite||!r.inputs)throw Error('Incomplete/nonfinite diagnostic output; no result is displayed.');
 result=r;const o=r.inputs,a=r.fieldAudit,R=o.radius,L=r.L*R,all=fieldSamples(r),cavity=all.filter(p=>p.cavity),free=r.nodes.slice(r.Nf,r.Nf+r.Nc+1);
 state(r.nodalConverged?'Nodal equations converged. Independent field accuracy is UNQUALIFIED; profiles and defects are shown below. No experimental validation.':'Nodal iteration did not meet 1e−10: '+r.stopReason+'. Trial profiles remain diagnostic only; no accepted physical prediction.');
 $('offgridGate').textContent='Independent field: UNQUALIFIED'+(a.withinPriorOffgridThresholds?' · sampled thresholds met':' · sampled thresholds NOT met');
 $('experimentalGate').textContent='Experimental validation: NOT PERFORMED';$('results').hidden=false;for(const id of ['csv','figures'])$(id).disabled=false;
 figure('geometry',chart('Computed meridian · research diagnostic','Axial position x (m)','Radius r (m)',[
 {name:'Computed cavity',color:'#075eb7',points:free.map(p=>[p[0]*R,p[1]*R])},
 {name:'Opposite meridian',color:'#075eb7',points:free.map(p=>[p[0]*R,-p[1]*R])},
 {name:'Physical front disk',color:'#172536',points:[[0,-R],[0,R]]},
 {name:'Artificial image disk',color:'#a56814',dash:true,points:[[L,-R],[L,R]]}
 ],{equalScale:true,height:500}),'True geometric scale; complete disk-to-image separation L = '+number(L)+' m. The image is a mathematical closure.');
 const trace=r.nodes.slice(r.Nf,r.Nf+r.Nc+1).map((p,k)=>[p[0]*R,1-r.gamma[k+r.Nf]**2]);
 const direct=chart('Free-surface Cp · reconstruction versus direct field','Axial position x (m)','Signed Cp',[
 {name:'Nodal trace reconstruction',color:'#075eb7',points:trace,dots:true},
 {name:'Direct field, all cavity samples',color:'#b82028',points:cavity.map(p=>[p.x*R,p.cp]),dots:true},
 {name:'Imposed pressure −σ',color:'#172536',dash:true,points:[[0,-r.sigma],[L,-r.sigma]]}
 ]);
 const disk=chart('Physical front-disk pressure','Radius r/R','Signed Cp',[
 {name:'Nodal trace reconstruction',color:'#075eb7',points:r.face.map(p=>[p.r_R,p.CpTrace]),dots:true},
 {name:'Direct field samples',color:'#b82028',points:all.filter(p=>p.panel<r.Nf).map(p=>[p.r,p.cp]).sort((x,y)=>x[0]-y[0]),dots:true}
 ]);
 figure('pressure',direct+disk,'Nodal pressure uses 1−γ² and the interior-rest trace approximation. Red samples use the independently evaluated exterior velocity. Their finite-mesh difference is retained, including the rim-adjacent samples.');
 const normal=chart('Independent field · every panel, including both ends','Meridional arclength s/R','un / U∞',[
 {name:'Direct normal velocity',color:'#075eb7',points:all.map(p=>[p.s,p.normal]),dots:true},
 {name:'Previous sample threshold +0.01',color:'#a56814',dash:true,points:[[0,.01],[all.at(-1).s,.01]]},
 {name:'Previous sample threshold −0.01',color:'#a56814',dash:true,points:[[0,-.01],[all.at(-1).s,-.01]]}
 ]);
 const dynamic=chart('Independent free-surface dynamic condition','Axial position x/R','Cp + σ',[
 {name:'Direct field pressure residual',color:'#b82028',points:cavity.map(p=>[p.x,p.cp+r.sigma]),dots:true},
 {name:'Previous sample threshold ±0.02',color:'#a56814',dash:true,points:[[0,.02],[r.L,.02]]},
 {name:'',color:'#a56814',dash:true,points:[[0,-.02],[r.L,-.02]]}
 ]);
 figure('residual',normal+dynamic,'Samples at 0.02, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95 and 0.98 of every panel. Threshold lines are internal numerical checks, not measured error bounds. Signed net flux can cancel while local boundary errors remain.');
 const rows=[['Method',r.version+' · continuous linear-vortex BEM'],['Computation status',r.status],['Nodal equations converged',r.nodalConverged?'YES':'NO'],['Geometry check',r.geometry.admissible?'Passed geometry checks':r.geometry.issues.join('; ')],['Diagnostic σ',r.sigma],['Diagnostic qc/U∞',r.qc],['Diagnostic Rmax/R',r.Rmax],['Diagnostic front-disk CD',r.CD],['Required ambient pressure (Pa)',o.vapourPressure+r.sigma*.5*o.density*o.speed**2],['Nodal speed equation residual / U∞',r.maxDynamicResidual],['Independent maximum |un| / U∞',a.maxNormal_U],['Independent RMS un / U∞',a.rmsNormal_U],['Mean absolute normal velocity / U∞',a.meanAbsoluteNormal_U],['Independent max |Cp+σ|',a.maxCavityDynamicCpResidual],['Maximum direct-speed / trace difference',a.maxTraceSpeedMismatch_U],['Signed total surface flux / UR²',a.surfaceFlux_U_R2],['Cavity / front-face bands',r.Nc+' / '+r.Nf],['Runtime (s)',r.seconds]];
 $('diagnosticLabel').textContent='Research values only. Tiny imposed-equation residuals do not establish field accuracy or experimental agreement.';
 $('diagnostics').innerHTML='<tr><th>Diagnostic</th><th>Value</th></tr>'+rows.map(([k,v])=>'<tr><td>'+esc(k)+'</td><td>'+esc(typeof v==='number'?number(v):v)+'</td></tr>').join('');
 $('limitations').textContent='Unbounded, steady, inviscid axial flow with artificial image closure. No experimental validation; unresolved field errors remain.';
}
$('settings').addEventListener('submit',e=>{e.preventDefault();stop();clearResult();try{const o=inputs(),run=serial;buttons(true);state('Starting continuous-vortex cavity solver…','running');const w=worker=new Worker('axisymmetric-cavity-worker.js?v=0.2.1');w.onmessage=e=>{if(worker!==w||serial!==run)return;const m=e.data;if(m.type==='progress'){const p=m.row;state(p.stage+(p.column?' · column '+p.column+'/'+p.columns:'')+(p.iteration!==undefined?' · iteration '+(p.iteration+1):'')+(p.residual!==undefined?' · nodal residual '+number(p.residual):'')+' · '+number(p.elapsedSeconds)+' s','running');}else if(m.type==='result'){stop();try{show({...m.result,inputs:o});}catch(err){error(err.message);}}else if(m.type==='error')error(m.message);};w.onerror=e=>{if(worker===w)error(e.message||'Cavity worker failed.');};w.postMessage(o.solver);}catch(e){error(e.message);}});
$('cancel').onclick=()=>{stop();clearResult();state('Calculation cancelled; no completed result is displayed.');};
for(const id of fields)$(id).addEventListener('input',()=>{if(id==='panels')advanced={};stale();});
$('dismiss').onclick=()=>$('errorDialog').close();
$('save').onclick=()=>{try{download('axisymmetric-cavity-research.json',JSON.stringify({schema:'axisymmetric-cavity-case',version:2,method:'linear-vortex-nodal',inputs:inputs(),evidence:{accuracyQualified:false,experimentalValidation:'NOT_PERFORMED'},diagnosticResult:result},null,2),'application/json');}catch(e){error(e.message);}};
$('open').onclick=()=>$('file').click();$('file').onchange=async()=>{try{const f=$('file').files[0];if(!f)return;if(f.size>10*1024*1024)throw Error('Case exceeds 10 MB.');const d=JSON.parse(await f.text());if(d.schema!=='axisymmetric-cavity-case'||![1,2].includes(d.version)||!d.inputs)throw Error('Open an axisymmetric-cavity case JSON.');const o=inputs(d.inputs);stop();clearResult();advanced=Number.isInteger(o.diskPanels)?{diskPanels:o.diskPanels}:{};for(const id of fields){if(id==='panels'&&!Array.from($(id).options).some(v=>Number(v.value)===o[id])){const option=document.createElement('option');option.value=o[id];option.textContent=o[id];$(id).appendChild(option);}$(id).value=o[id];}state('Inputs loaded. Recompute with the continuous-vortex solver. Stored results and legacy shape coefficients are not reused.');}catch(e){error(e.message);}finally{$('file').value='';}};
$('csv').onclick=()=>{if(!result)return;const r=result,R=r.inputs.radius,lines=['# RESEARCH DIAGNOSTIC ONLY; accuracy unqualified; no experimental validation','kind,x_m,r_m,panel,Cp,normal_U,tangent_U'];for(const p of fieldSamples(r))lines.push(['direct-field',p.x*R,p.r*R,p.panel,p.cp,p.normal,p.tangent].join(','));r.nodes.forEach((p,k)=>lines.push(['nodal-trace',p[0]*R,p[1]*R,k,1-r.gamma[k]**2,'',-r.gamma[k]].join(',')));download('axisymmetric-cavity-diagnostics.csv',lines.join('\n'),'text/csv');};
$('figures').onclick=()=>{if(!result)return;download('axisymmetric-cavity-research-figures.html','<!doctype html><meta charset="utf-8"><title>Cavity research diagnostic</title><style>body{font:16px Arial;max-width:1100px;margin:30px auto}svg{width:100%;height:auto}svg text{font:15px Arial}figcaption{margin:10px 0 25px}</style><h1>Research diagnostic · accuracy unqualified</h1><p>No experimentally validated cavity prediction. Nodal reconstruction and independent field values are distinct.</p>'+['geometry','pressure','residual'].map(id=>$(id).innerHTML).join(''),'text/html');};
})();
