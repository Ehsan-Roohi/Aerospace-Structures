/* Nominal elastic strength screening. No fracture, plasticity, buckling or certification. */
const BeamStrength=(()=>{
 'use strict';
 const B=typeof BeamLearningEngine!=='undefined'?BeamLearningEngine:require('./beam_learning_engine.js');
 const S=typeof BeamSections!=='undefined'?BeamSections:require('./beam_sections.js');
 const limit=(v,label,min=0)=>{if(v==null||v==='')return null;if(typeof v!=='number'||!Number.isFinite(v)||v<=min)throw Error(label+' must be a finite positive number.');return v;};
 function normalize(raw={}){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Strength settings must be an object.');
  if(raw.version!==undefined&&raw.version!==1)throw Error('Unsupported strength-settings version.');
  const criterion=raw.criterion??'vonMises';if(!['vonMises','separate'].includes(criterion))throw Error('Unknown strength criterion.');
  const requiredFos=limit(raw.requiredFos,'Required factor of safety');if(requiredFos!==null&&requiredFos<1)throw Error('Required factor of safety must be at least 1.');
  if(raw.layers!==undefined&&(!Array.isArray(raw.layers)||raw.layers.length>2))throw Error('At most two material strength records are allowed.');
  if(raw.layers?.some(p=>p!==null&&(typeof p!=='object'||Array.isArray(p))))throw Error('Each material strength record must be an object.');
  const layers=Array.from({length:2},(_,i)=>{const p=raw.layers?.[i]??{};return Object.fromEntries(['yield','tension','compression','shear'].map(k=>[k,limit(p[k],`Material ${i+1} ${k} strength`)]));});
  return {version:1,criterion,requiredFos,layers,deflectionLimit:limit(raw.deflectionLimit,'Deflection limit')};
 }
 function evaluate(r,raw,station=null){
  const config=normalize(raw),p=S.properties(r.section),L=r.input.length,nLayers=p.shape==='layered'?2:1;
  const missing=[];if(config.requiredFos===null)missing.push('required factor of safety');
  for(let i=0;i<nLayers;i++)for(const k of config.criterion==='vonMises'?['yield']:['tension','compression','shear'])if(config.layers[i][k]===null)missing.push(`material ${i+1}: ${k} strength`);
  const points=[];
  for(let i=0;i<=80;i++){const z=-p.c+2*p.c*i/80;if(!p.junctions.some(j=>Math.abs(j-z)<1e-12*p.depth))points.push({z,side:0});}
  points.push({z:p.zNA??0,side:0});for(const z of p.junctions)points.push({z,side:-1},{z,side:1});
  const coefficients=points.map(({z,side})=>{const layer=p.shape==='layered'&&(z>p.interfaceZ||(z===p.interfaceZ&&side>0))?1:0,b=p.widthAt(z,side);return {z,side,layer,sigma:S.normalStress(p,1,z,side),tau:b>0?p.firstMoment(z)/(p.I*b):0};});
  const sigmaBounds=Array.from({length:nLayers},(_,i)=>Math.max(...coefficients.filter(c=>c.layer===i).map(c=>Math.abs(c.sigma))));
  // A rigorously conservative shear envelope for these supported section models. It is a bound,
  // not a claim that maximum bending and maximum shear occur at the same material point.
  const tauBound=p.shearFactor/p.A;
  function utilization(sigma,tau,layer){
   const m=config.layers[layer],a=[];
   if(config.criterion==='vonMises'){if(m.yield!==null)a.push({ratio:Math.hypot(sigma,Math.sqrt(3)*tau)/m.yield,criterion:'von Mises / yield'});}
   else {if(m.tension!==null)a.push({ratio:Math.max(0,sigma)/m.tension,criterion:'tensile stress / tensile strength'});if(m.compression!==null)a.push({ratio:Math.max(0,-sigma)/m.compression,criterion:'compressive stress / compressive strength'});if(m.shear!==null)a.push({ratio:Math.abs(tau)/m.shear,criterion:'shear stress / shear strength'});}
   return a.reduce((best,v)=>v.ratio>best.ratio?v:best,{ratio:0,criterion:'zero demand or unchecked'});
  }
  const anchors=[...new Set([0,L,...r.nodes])].sort((a,b)=>a-b),qBound=r.loadsApplied.filter(B.loads.isDist).reduce((s,v)=>s+B.loads.peak(v),0);
  let critical=null,maxRatio=0,maxBound=0;const cells=[];
  function point(x,side){const f=B.internalForces(r,x,side);let best={ratio:0,x,side,z:0,layer:0,sigma:0,tau:0,criterion:'zero demand or unchecked'},fallback=best;
   for(const c of coefficients){const sigma=f.M*c.sigma,tau=f.V*c.tau,u=utilization(sigma,tau,c.layer),v={...u,x,side,z:c.z,layer:c.layer,sigma,tau};if(u.ratio>best.ratio)best=v;if(Math.hypot(sigma,tau)>Math.hypot(fallback.sigma,fallback.tau))fallback=v;}
   return {f,best,fallback};
  }
  for(let j=1;j<anchors.length;j++){
   const subdivisions=Math.max(1,Math.ceil((anchors[j]-anchors[j-1])/(L/240)));
   for(let k=0;k<subdivisions;k++){
    const a=anchors[j-1]+(anchors[j]-anchors[j-1])*k/subdivisions,b=anchors[j-1]+(anchors[j]-anchors[j-1])*(k+1)/subdivisions,h=b-a;
    const A=point(a,'right'),C=point((a+b)/2,'right'),D=point(b,'left');
    const best=[A.best,C.best,D.best].reduce((s,v)=>v.ratio>s.ratio?v:s);if(critical===null||best.ratio>maxRatio){maxRatio=best.ratio;critical=best;}
    // dV/dx=-q, dM/dx=V. No concentrated action lies inside these anchor intervals.
    // Lipschitz envelopes bound unsampled extrema; they are intentionally distinct from a sampled point.
    const vMax=Math.max(Math.abs(A.f.V),Math.abs(D.f.V))+qBound*h/2;
    const monotone=Math.min(A.f.V,D.f.V)-qBound*h/2>=0||Math.max(A.f.V,D.f.V)+qBound*h/2<=0;
    const mMax=Math.max(Math.abs(A.f.M),Math.abs(D.f.M))+(monotone?0:vMax*h/2);
    let bound=best.ratio;
    for(let i=0;i<nLayers;i++){
     const m=config.layers[i],sig=mMax*sigmaBounds[i],tau=vMax*tauBound;
     if(config.criterion==='vonMises'&&m.yield!==null)bound=Math.max(bound,Math.hypot(sig,Math.sqrt(3)*tau)/m.yield);
     if(config.criterion==='separate'){if(m.tension!==null)bound=Math.max(bound,sig/m.tension);if(m.compression!==null)bound=Math.max(bound,sig/m.compression);if(m.shear!==null)bound=Math.max(bound,tau/m.shear);}
    }
    maxBound=Math.max(maxBound,bound);cells.push({a,b,ratio:best.ratio,bound});
   }
  }
  const classify=(ratio,bound)=>ratio>=1?'exceeded':missing.length?'unchecked':bound*config.requiredFos>1?'margin':'within';
  cells.forEach(c=>c.status=classify(c.ratio,c.bound));
  let status=classify(maxRatio,maxBound);const fosLower=maxBound>0?1/maxBound:null,pointFos=maxRatio>0?1/maxRatio:null;
  const values=[maxRatio,maxBound,...cells.flatMap(c=>[c.ratio,c.bound])];if(values.some(v=>!Number.isFinite(v)))throw Error('Non-finite strength evaluation; check model and limits.');
  // Exact maximum of the cubic FE displacement interpolation, not just the plot samples.
  let maxDeflection=0;
  for(let i=1;i<r.nodes.length;i++){
   const x0=r.nodes[i-1],x1=r.nodes[i],h=x1-x0,u=B.fieldAt(r,x0,'right'),v=B.fieldAt(r,x1,'left');
   const a=2*u.v-2*v.v+h*(u.theta+v.theta),b=-3*u.v+3*v.v-h*(2*u.theta+v.theta),c=h*u.theta,d=u.v,ts=[0,1];
   const scale=Math.max(Math.abs(3*a),Math.abs(2*b),Math.abs(c));
   if(scale>0){const A=3*a/scale,H=2*b/scale,C=c/scale;if(Math.abs(A)<1e-13){if(Math.abs(H)>1e-13)ts.push(-C/H);}else{const disc=H*H-4*A*C;if(disc>=0){ts.push((-H+Math.sqrt(disc))/(2*A));ts.push((-H-Math.sqrt(disc))/(2*A));}}}
   for(const t of ts)if(t>=0&&t<=1)maxDeflection=Math.max(maxDeflection,Math.abs(((a*t+b)*t+c)*t+d));
  }
  const modelWarning=maxDeflection>L*.05?'Maximum FE displacement exceeds 5% of span: small-displacement assumptions may be inappropriate. Nominal stresses are provisional, not a validated large-deformation assessment.':null;
  if(modelWarning&&missing.length===0&&status!=='exceeded'){status='model';for(const c of cells)if(c.status!=='exceeded')c.status='model';}
  let selected=null;if(station){if(!Number.isFinite(station.x)||station.x<0||station.x>L||!['left','right'].includes(station.side))throw Error('Invalid strength station.');const v=point(station.x,station.side);let c=v.best.ratio>0?v.best:v.fallback;if(station.z!==undefined){if(!Number.isFinite(station.z)||Math.abs(station.z)>p.c)throw Error('Depth must lie within the section.');const z=station.z,side=station.depthSide===1?1:-1,layer=p.shape==='layered'&&(z>p.interfaceZ||(z===p.interfaceZ&&side>0))?1:0,b=p.widthAt(z,side),sigma=S.normalStress(p,v.f.M,z,side),tau=b>0?v.f.V*p.firstMoment(z)/(p.I*b):0;c={...utilization(sigma,tau,layer),x:station.x,side:station.side,z,layer,sigma,tau};}const outside=station.x===0&&station.side==='left'||station.x===L&&station.side==='right';selected={...c,outside,V:v.f.V,M:v.f.M,fos:outside||missing.length?null:c.ratio>0?1/c.ratio:Infinity,status:outside?'unchecked':classify(c.ratio,c.ratio)};if(modelWarning&&selected.status==='within')selected.status='model';}
  return {config,status,missing,modelWarning,complete:missing.length===0,critical,maxRatio,maxBound,fosLower,pointFos,zeroDemand:maxRatio===0,cells,selected,
   deflection:{limit:config.deflectionLimit,value:maxDeflection,status:config.deflectionLimit===null?'unchecked':maxDeflection>config.deflectionLimit?'exceeded':'within'},
   method:'Pointwise σ and τ evaluated together at section-depth samples and three stations per interval; conservative span/depth envelopes govern a within-limits result. The critical marker is the most highly utilized evaluated material point, not an exact fracture location.'};
 }
 function mohr(sigmaX,sigmaZ,tauXZ){if(![sigmaX,sigmaZ,tauXZ].every(Number.isFinite))throw Error('Finite stresses are required.');const center=sigmaX/2+sigmaZ/2,radius=Math.hypot(sigmaX/2-sigmaZ/2,tauXZ),vm=Math.hypot(Math.sqrt(3)*(sigmaX/2-sigmaZ/2),center,Math.sqrt(3)*tauXZ);return {sigmaX,sigmaZ,tauXZ,center,radius,sigma1:center+radius,sigma2:center-radius,tauMax:radius,thetaDeg:radius===0?null:Math.atan2(tauXZ,sigmaX/2-sigmaZ/2)*90/Math.PI,vm};}
 return {normalize,evaluate,mohr};
})();
if(typeof module!=='undefined')module.exports=BeamStrength;
