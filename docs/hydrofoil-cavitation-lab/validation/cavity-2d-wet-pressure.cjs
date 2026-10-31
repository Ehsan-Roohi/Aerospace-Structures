/* Pre-admission study: does liquid labelled wetted remain above vapour pressure?
 * Cp + sigma = (p - pv)/qInfinity. A negative value identifies an unresolved
 * additional cavitation region under an equilibrium pressure-floor model.
 * We report it, do not clip pressure, move detachment, or alter the cavity. */
const fs=require('node:fs'),path=require('node:path'),C=require('../cavitation.js');
const rows=[];
for(const resolution of [24,32,48,64]){
 const inputs={resolution,alpha:4,thickness:.12,camber:0,camberPosition:.4,detachment:.01,length:.4,recovery:.15,attenuation:.3,closureMode:'smooth-contact',kuttaCondition:'velocity'};
 const r=C.solve(inputs),wet=r.panels.map((p,i)=>({...p,index:i})).filter(p=>!p.cavity),minimum=wet.reduce((a,b)=>a.cp<b.cp?a:b),negative=wet.filter(p=>p.cp+r.sigma<0);
 const row={n:resolution,N:r.panels.length,alpha:4,thickness:.12,detachment:.01,length:.4,A:r.closure.selectedAttenuation,status:r.status,sigma:r.sigma,cl:r.coefficients.cl,minimumWettedCp:minimum.cp,wettedPressureMargin:minimum.cp+r.sigma,wettedMinimumLocation:{x:minimum.x,y:minimum.y,panel:minimum.index},wettedBelowVapourPanels:negative.length,negativePressureLength:negative.reduce((s,p)=>s+p.length,0),preAdmissionStatus:negative.length?'UNRESOLVED_WETTED_PRESSURE_BELOW_VAPOUR':'NO_SAMPLED_WETTED_PRESSURE_VIOLATION',height:r.height,wet:wet.map(p=>({index:p.index,x:p.x,y:p.y,cp:p.cp,pressureMargin:p.cp+r.sigma,length:p.length}))};
 rows.push(row);console.log(JSON.stringify({n:resolution,N:row.N,sigma:r.sigma,margin:row.wettedPressureMargin,minCp:minimum.cp,x:minimum.x,count:negative.length}));
 fs.writeFileSync(path.join(__dirname,'cavity-2d-wet-pressure.json'),JSON.stringify({status:'PRE_ADMISSION_DIAGNOSTIC_NOT_EXPERIMENTAL_VALIDATION',quantity:'Cp+sigma=(p-pv)/qInfinity; all wetted centroid samples, no cavity BC panels or artificial pressure floors',productionKernelModified:false,rows},null,2)+'\n');
}
