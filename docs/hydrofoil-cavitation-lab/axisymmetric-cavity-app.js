(function () {
  'use strict';
  const C = window.AxisymmetricCavity;
  const $ = id => document.getElementById(id);
  const fields = ['radius','lengthRatio','panels','speed','density','vapourPressure','quadratureOrder','maxIterations'];
  let worker = null, result = null, serial = 0, importedOptions = {};
  const esc = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = value => Number.isFinite(value) ? Number(value.toPrecision(6)).toString() : 'unavailable';
  function inputs() { return C.options({...importedOptions, ...Object.fromEntries(fields.map(id => [id, Number($(id).value)]))}); }
  function state(message, kind = 'warning') { $('status').textContent = message; $('status').dataset.state = kind; }
  function buttons(running) { $('solve').disabled = running; $('cancel').disabled = !running; $('progress').hidden = !running; }
  function stop() { serial++; if (worker) worker.terminate(); worker = null; buttons(false); }
  function clearResult() {
    result = null; $('results').hidden = true; $('csv').disabled = true; $('figures').disabled = true;
    $('offgridGate').textContent = 'Off-grid accuracy: NOT PASSED';
    $('experimentalGate').textContent = 'Experimental validation: NOT PERFORMED';
  }
  function error(message) {
    stop(); clearResult(); state(message, 'error'); $('errorMessage').textContent = message;
    if (!$('errorDialog').open) $('errorDialog').showModal();
  }
  function stale() { stop(); clearResult(); state('Inputs changed. Solve this case again; previous diagnostic results are hidden.'); }
  function download(name, body, type) {
    const a = document.createElement('a'), url = URL.createObjectURL(new Blob([body], {type}));
    a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  // These plots contain only actual solver samples. No fitted reference curve or
  // experimental data is constructed. SI coordinates are converted exactly once.
  function chart(title, xlabel, ylabel, series, opts = {}) {
    const all = series.flatMap(s => s.points).filter(p => p.every(Number.isFinite));
    if (!all.length) return '<p>No finite profile samples are available.</p>';
    const W=920,m={l:75,r:25,t:68,b:55};
    let legendX=m.l,legendY=43;const legends=[];
    for(const s of series){if(!s.name)continue;const width=s.legendWidth||Math.max(210,s.name.length*7.2+44);if(legendX+width>W-m.r&&legendX>m.l){legendX=m.l;legendY+=25;}legends.push({s,x:legendX,y:legendY});legendX+=width;}
    m.t=legendY+25;const H=(opts.height || 330)+(legendY-43),w=W-m.l-m.r,h=H-m.t-m.b;
    let xmin=Math.min(...all.map(p=>p[0])),xmax=Math.max(...all.map(p=>p[0]));
    let ymin=Math.min(...all.map(p=>p[1])),ymax=Math.max(...all.map(p=>p[1]));
    if(opts.yRange){ymin=opts.yRange[0];ymax=opts.yRange[1];}
    if(xmax===xmin){xmin-=.5;xmax+=.5;} if(ymax===ymin){ymin-=.01;ymax+=.01;}
    let dy=(ymax-ymin)*.12; ymin-=dy;ymax+=dy;
    if(opts.equalScale){const ymid=(ymin+ymax)/2,extent=(xmax-xmin)*h/w;if(extent>ymax-ymin){ymin=ymid-extent/2;ymax=ymid+extent/2;}}
    const X=x=>m.l+(x-xmin)*w/(xmax-xmin),Y=y=>m.t+h-(y-ymin)*h/(ymax-ymin);
    let svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}"><rect width="100%" height="100%" fill="white"/><text x="${m.l}" y="21" font-weight="bold">${esc(title)}</text>`;
    for(const {s,x,y} of legends)svg+=`<line x1="${x}" y1="${y}" x2="${x+23}" y2="${y}" stroke="${s.color}" stroke-width="2.5" ${s.dash?'stroke-dasharray="6 4"':''}/><text x="${x+30}" y="${y+5}">${esc(s.name)}</text>`;
    for(let i=0;i<=4;i++){const x=xmin+(xmax-xmin)*i/4,y=ymin+(ymax-ymin)*i/4;svg+=`<path d="M${X(x)},${m.t}V${m.t+h} M${m.l},${Y(y)}H${m.l+w}" fill="none" stroke="#dce4ec"/><text x="${X(x)}" y="${m.t+h+23}" text-anchor="middle">${esc(number(x))}</text><text x="${m.l-9}" y="${Y(y)+5}" text-anchor="end">${esc(number(y))}</text>`;}
    if(ymin<=0&&ymax>=0)svg+=`<line x1="${m.l}" y1="${Y(0)}" x2="${m.l+w}" y2="${Y(0)}" stroke="#8b98a7"/>`;
    for(const s of series){const points=s.points.filter(p=>p.every(Number.isFinite));if(s.connect!==false)svg+=`<polyline points="${points.map(p=>X(p[0])+','+Y(p[1])).join(' ')}" fill="none" stroke="${s.color}" stroke-width="2" ${s.dash?'stroke-dasharray="6 4"':''}/>`;if(s.dots)for(const p of points)svg+=`<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="2.5" fill="${s.color}"/>`;}
    svg+=`<rect x="${m.l}" y="${m.t}" width="${w}" height="${h}" fill="none" stroke="#8b98a7"/><text x="${m.l+w/2}" y="${H-8}" text-anchor="middle">${esc(xlabel)}</text><text transform="translate(18 ${m.t+h/2}) rotate(-90)" text-anchor="middle">${esc(ylabel)}</text></svg>`;
    return svg;
  }
  function figure(id, svg, caption) { $(id).innerHTML=svg+'<figcaption>'+esc(caption)+'</figcaption>'; }
  function show(r) {
    if(!r || !r.inputs || !r.diagnostics || !Array.isArray(r.nodes) || !Array.isArray(r.surface) || !Array.isArray(r.offCentroid)) throw Error('Incomplete diagnostic result; no profile is displayed.');
    result=r; const d=r.diagnostics, o=r.inputs, L=o.lengthRatio*o.radius;
    const qualified=r.status==='numerically-qualified-research' && d.accuracyQualified===true;
    const collocated=d.collocationConverged===true;
    state(qualified?'Numerical off-grid checks passed for this sampled case. Experimental validation is NOT PERFORMED; this remains a research diagnostic.':collocated?'Collocation equations converged; independent off-grid accuracy NOT PASSED. This is a diagnostic result, not an accepted cavitation prediction.':'Shape iteration did not converge. The trial profiles below are diagnostic only; no cavity prediction is accepted.');
    $('offgridGate').textContent='Off-grid accuracy: '+(qualified?'PASSED — numerical samples only':'NOT PASSED');
    $('experimentalGate').textContent='Experimental validation: NOT PERFORMED';
    $('results').hidden=false; $('csv').disabled=false; $('figures').disabled=false;
    const free=r.nodes.filter(p=>p.region==='cavity'), upper=free.map(p=>[p.x,p.r]), lower=free.map(p=>[p.x,-p.r]);
    figure('geometry',chart('Diagnostic meridional geometry · physical disk and artificial image','Axial position x (m)','Radial coordinate r (m)',[
      {name:'Computed cavity surface',color:'#075eb7',points:upper},
      {name:'Opposite meridian',color:'#075eb7',points:lower},
      {name:'Physical front disk',color:'#172536',legendWidth:190,points:[[0,-o.radius],[0,o.radius]]},
      {name:'Image disk',color:'#a56814',dash:true,points:[[L,-o.radius],[L,o.radius]]}
    ],{equalScale:true,height:360}),`True geometric scale. Full disk separation L=${number(L)} m. The downstream disk is an artificial closure; its force is not physical front-disk drag. Status: ${r.status}.`);
    const cavity=r.surface.filter(p=>p.region==='cavity');
    const cp=chart('Diagnostic free-surface pressure · all fitted band centres','Axial position x (m)','Signed Cp',[
      {name:'Computed cavity Cp',color:'#075eb7',points:cavity.map(p=>[p.x,p.cp]),dots:true},
      {name:'Constant-pressure target −σ',color:'#a56814',dash:true,points:[[0,-r.sigma],[L,-r.sigma]]}
    ]);
    const diskCp=chart('Diagnostic disk pressure · physical and image surfaces','Radius r (m)','Signed Cp',[
      {name:'Physical front disk',color:'#172536',points:r.surface.filter(p=>p.region==='disk').map(p=>[p.r,p.cp]),dots:true},
      {name:'Artificial image disk',color:'#a56814',dash:true,points:r.surface.filter(p=>p.region==='image').map(p=>[p.r,p.cp]),dots:true}
    ]);
    figure('pressure',cp+diskCp,'All finite centroid samples are retained. Cavity Cp is fitted at these points; agreement here is not an independent accuracy check. Disk profiles are shown against physical radius.');
    // The solver returns offCentroid x/r in units of R, unlike dimensional nodes/surface.
    const off=r.offCentroid.map(p=>({...p,x:p.x*o.radius,r:p.r*o.radius})).sort((a,b)=>a.x-b.x);
    const normal=chart('Independent quarter-band samples · normal boundary residual','Axial position x (m)','un / U∞',[
      {name:'Off-grid normal residual',color:'#075eb7',points:off.map(p=>[p.x,p.normal]),dots:true},
      {name:'Numerical gate ±0.01',color:'#a56814',dash:true,points:[[0,.01],[L,.01]]},
      {name:'',color:'#a56814',dash:true,points:[[0,-.01],[L,-.01]]}
    ]);
    const dynamic=chart('Independent quarter-band samples · dynamic boundary residual','Axial position x (m)','Cp + σ',[
      {name:'Off-grid Cp + σ',color:'#b82028',points:off.map(p=>[p.x,p.cp+r.sigma]),dots:true},
      {name:'Numerical gate ±0.02',color:'#a56814',dash:true,points:[[0,.02],[L,.02]]},
      {name:'',color:'#a56814',dash:true,points:[[0,-.02],[L,-.02]]}
    ]);
    figure('residual',normal+dynamic,`${off.length} independent samples, including both detachment regions. These samples are not used to fit the shape. No endpoint samples are deleted, clipped or smoothed.`);
    $('diagnosticValues').open=false;
    $('diagnosticLabel').textContent='Computation status: '+r.status+'. All numbers below are diagnostic; experimental validation NOT PERFORMED.';
    const rows=[['Trial cavitation number σ',r.sigma],['Trial maximum cavity radius (m)',r.maximumRadiusRatio*o.radius],['Trial physical-disk drag coefficient',r.physicalDiskDragCoefficient],['Inverse ambient absolute pressure (Pa)',r.requiredAmbientPressure],['Maximum fitted speed residual / U∞',d.maxCavitySpeedResidual],['Maximum collocation normal residual / U∞',d.maxNormalResidual],['Maximum independent |un| / U∞',d.offCentroidNormalMaximum],['Maximum independent |Cp + σ|',d.offCentroidDynamicCpMaximum],['Off-grid sample count',d.offCentroidSampleCount],['Runtime (s)',d.seconds]];
    $('diagnostics').innerHTML='<tbody>'+rows.map(([name,value])=>'<tr><th>'+esc(name)+'</th><td>'+esc(number(value))+'</td></tr>').join('')+'</tbody>';
    $('limitations').textContent=(r.limitations||[]).join(' ');
  }
  $('settings').addEventListener('submit',event=>{
    event.preventDefault(); stop(); clearResult(); let o; try{o=inputs();}catch(e){error(e.message);return;}
    const run=serial; buttons(true); state('Solving source-ring cavity shape…','running');
    try{
      const current=worker=new Worker('axisymmetric-cavity-worker.js');
      current.onmessage=event=>{if(run!==serial)return;const m=event.data;
        if(m.type==='progress'){const row=m.row||{};state(row.phase==='jacobian'?`Solving shape iteration ${row.iteration+1}; Jacobian column ${row.column}/${row.columns}.`:row.phase==='independent-boundary-samples'?'Checking independent quarter-band boundary samples…':`Shape iteration ${row.iteration+1}; fitted speed residual ${number(row.maximumSpeedResidual)} U∞.`,'running');}
        else if(m.type==='result'){stop();try{show(m.result);}catch(e){error(e.message);}}
        else if(m.type==='error')error(m.message||'The diagnostic solve failed.');
      };
      current.onerror=e=>{if(run===serial)error(e.message||'The calculation worker failed.');};current.postMessage(o);
    }catch(e){error('Cannot start calculation: '+e.message);}
  });
  $('cancel').onclick=()=>{stop();clearResult();state('Calculation cancelled. No diagnostic result is accepted.');};
  for(const id of fields)$(id).addEventListener('input',()=>{if(id==='panels'){delete importedOptions.diskPanels;delete importedOptions.shapeParameters;delete importedOptions.seed;}stale();});
  $('dismiss').onclick=()=>$('errorDialog').close();
  $('save').onclick=()=>{try{const data={schema:'axisymmetric-cavity-case',version:1,inputs:inputs(),evidence:{scope:'research diagnostic only',computationStatus:result?result.status:'not-solved',experimentalValidation:'NOT_PERFORMED'},diagnosticResult:result};download('axisymmetric-cavity-diagnostic.json',JSON.stringify(data,null,2),'application/json');}catch(e){error(e.message);}};
  $('open').onclick=()=>$('file').click();
  $('file').onchange=async()=>{const file=$('file').files[0];if(!file)return;try{
    if(file.size>5*1024*1024)throw Error('Case exceeds the 5 MB limit.');
    const data=JSON.parse(await file.text());
    if(data.schema!=='axisymmetric-cavity-case'||data.version!==1||!data.inputs)throw Error('Open a developed axisymmetric-cavity case JSON; other solver cases are separate.');
    const o=C.options(data.inputs);stop();clearResult();importedOptions=o;
    for(const id of fields){if(id==='panels'&&!Array.from($(id).options).some(x=>Number(x.value)===o[id])){const option=document.createElement('option');option.value=o[id];option.textContent=o[id];$(id).appendChild(option);}$(id).value=o[id];}
    state('Inputs loaded, including advanced numerical settings. Saved diagnostic results are not restored as fresh predictions; press Solve.');
  }catch(e){error('Cannot open case: '+e.message);}finally{$('file').value='';}};
  $('csv').onclick=()=>{if(!result)return;const r=result,o=r.inputs,lines=['# RESEARCH DIAGNOSTIC ONLY','# computation_status='+r.status,'# experimental_validation=NOT_PERFORMED','kind,x_m,r_m,region,Cp,normal_U,speed_U,dynamic_Cp,computation_status'];
    for(const p of r.nodes)lines.push(['geometry',p.x,p.r,p.region,'','','','',r.status].join(','));
    for(const p of r.surface)lines.push(['centroid',p.x,p.r,p.region,p.cp,p.normal,p.speed,p.region==='cavity'?p.cp+r.sigma:'',r.status].join(','));
    for(const p of r.offCentroid)lines.push(['independent-quarter-band',p.x*o.radius,p.r*o.radius,'cavity',p.cp,p.normal,p.speed,p.cp+r.sigma,r.status].join(','));
    download('axisymmetric-cavity-diagnostic.csv',lines.join('\n'),'text/csv');};
  $('figures').onclick=()=>{if(!result)return;const r=result,plots=['geometry','pressure','residual'].map(id=>$(id).innerHTML).join('');
    download('axisymmetric-cavity-diagnostic-figures.html','<!doctype html><meta charset="utf-8"><title>Research diagnostic cavity figures</title><style>body{font:16px Arial;max-width:1100px;margin:30px auto;color:#172536}svg{display:block;width:100%;height:auto}figcaption{margin:12px 0 24px}svg text{font:14px Arial;fill:#172536}</style><h1>Research diagnostic — not an experimentally validated cavity prediction</h1><p>Computation status: '+esc(r.status)+'. Off-grid accuracy: '+(r.diagnostics.accuracyQualified?'numerical sample gates passed':'NOT PASSED')+'. Experimental validation: NOT PERFORMED.</p>'+plots,'text/html');};
})();
