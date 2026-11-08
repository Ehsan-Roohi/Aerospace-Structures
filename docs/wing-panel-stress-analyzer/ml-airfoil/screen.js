/* Independent pressure-integration/selection adapter; upstream ADAPT is not bundled. */
const WingMLScreen=(()=>{
 'use strict';
 const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
 function scope(re,alpha,mach){return {eligible:Number.isFinite(re)&&re>1e6&&Number.isFinite(alpha)&&alpha>=-4&&alpha<=12&&Number.isFinite(mach)&&mach>=0&&mach<=.9,message:'Published LAM domain: Re > 1e6, alpha -4 to 12 deg, Mach 0 to 0.9. Reynolds number is not a model input. Domain compliance is not experimental validation.'};}
 function weights(upper,lower,ref=.25){
  if(![upper,lower].every(a=>Array.isArray(a)&&a.length>=3&&a.length<=1000))throw Error('Two complete sampled surfaces required.');
  const n=upper.length+lower.length,w=Array.from({length:3},()=>Array(n).fill(0));
  for(const [surface,offset,sign] of [[upper,0,1],[lower,upper.length,-1]]){
   if(Math.abs(surface[0][0])>1e-6||Math.abs(surface.at(-1)[0]-1)>1e-6)throw Error('Surface must cover x/c 0 to 1.');
   for(let i=0;i<surface.length;i++)if(!surface[i].every(Number.isFinite)||surface[i].length!==2||(i&&surface[i][0]<=surface[i-1][0]))throw Error('Finite, strictly increasing surface coordinates required.');
   for(let i=0;i<surface.length-1;i++){
    const [x,z]=surface[i],[xx,zz]=surface[i+1],dx=xx-x,dz=zz-z,a=z*dz+(x-ref)*dx,b=zz*dz+(xx-ref)*dx,k=offset+i;
    w[0][k]+=sign*dz/2;w[0][k+1]+=sign*dz/2;w[1][k]-=sign*dx/2;w[1][k+1]-=sign*dx/2;
    w[2][k]+=sign*(2*a+b)/6;w[2][k+1]+=sign*(a+2*b)/6;
   }
  }return w;
 }
 function validate(r){
  const w=weights(r.upper,r.lower),n=w[0].length;
  if(!Array.isArray(r.cpMean)||r.cpMean.length!==n||!r.cpMean.every(Number.isFinite)||!Array.isArray(r.cpStd)||r.cpStd.length!==n||!r.cpStd.every(v=>Number.isFinite(v)&&v>=0))throw Error('Invalid pressure posterior.');
  const m=r.forceMoment?.mean,C=r.forceMoment?.covariance;if(!Array.isArray(m)||m.length!==3||!m.every(Number.isFinite)||!Array.isArray(C)||C.length!==3||!C.every(row=>Array.isArray(row)&&row.length===3&&row.every(Number.isFinite)))throw Error('Joint force/moment posterior required.');
  for(let i=0;i<3;i++){if(Math.abs(dot(w[i],r.cpMean)-m[i])>1e-7)throw Error('Pressure and integrated mean disagree.');for(let j=0;j<3;j++)if(Math.abs(C[i][j]-C[j][i])>1e-10||C[i][i]<0)throw Error('Invalid covariance.');}
  // PSD check without adding fictitious jitter or discarding correlations.
  for(let i=0;i<3;i++)for(let j=i+1;j<3;j++)if(C[i][i]*C[j][j]-C[i][j]**2 < -1e-12)throw Error('Covariance is not positive semidefinite.');
  const det=C[0][0]*(C[1][1]*C[2][2]-C[1][2]**2)-C[0][1]*(C[0][1]*C[2][2]-C[0][2]*C[1][2])+C[0][2]*(C[0][1]*C[1][2]-C[0][2]*C[1][1]);if(det< -1e-12)throw Error('Covariance is not positive semidefinite.');
  return r;
 }
 function project(r,v){const C=r.forceMoment.covariance;return {mean:dot(v,r.forceMoment.mean),std:Math.sqrt(Math.max(0,dot(v,C.map(row=>dot(row,v)))))};}
 function assess(r,{re,xsc=.35,zsc=0}={}){
  validate(r);if(!Number.isFinite(xsc)||xsc<0||xsc>1||!Number.isFinite(zsc)||Math.abs(zsc)>1)throw Error('Section reference point outside supported bounds.');
  const a=r.alphaDeg*Math.PI/180,lift=project(r,[-Math.sin(a),Math.cos(a),0]),moment=project(r,[-zsc,xsc-.25,1]);
  return {lift,moment,torqueScore:Math.abs(moment.mean)+2*moment.std,scope:scope(re,r.alphaDeg,r.mach)};
 }
 return {weights,validate,project,assess,scope};
})();
if(typeof module!=='undefined')module.exports=WingMLScreen;

if(typeof window!=="undefined")window.WingMLScreen=WingMLScreen;
