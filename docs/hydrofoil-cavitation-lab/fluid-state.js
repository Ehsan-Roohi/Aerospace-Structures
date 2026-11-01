/* Fresh-water saturation properties, IAPWS SR1-86(1992), equations 1–3.
 * Saturated liquid density approximates incompressible liquid density here.
 * No salinity, dissolved gas, compressibility or thermal cavitation model.
 * Source: https://iapws.org/technical-guidance/release/Supp-sat
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CavitationFluid=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const source={title:'IAPWS SR1-86(1992), saturation properties of ordinary water',url:'https://iapws.org/technical-guidance/release/Supp-sat',densityAssumption:'Saturated-liquid density used for incompressible fresh water; no pressure-dependent equation of state.'};
 function finite(x,name){if(typeof x!=='number'||!Number.isFinite(x))throw Error(name+' must be a finite number.');return x;}
 function water(temperatureC=20){
  const T=finite(temperatureC,'Temperature')+273.15;
  if(temperatureC<0.01||temperatureC>80)throw Error('Use fresh-water temperature from 0.01 to 80 °C in this module.');
  const tau=1-T/647.096;
  const a=[-7.85951783,1.84408259,-11.7866497,22.6807411,-15.9618719,1.80122502],p=[1,1.5,3,3.5,4,7.5];
  const b=[1.99274064,1.09965342,-0.510839303,-1.75493479,-45.5170352,-674694.45],q=[1/3,2/3,5/3,16/3,43/3,110/3];
  const pc=22064000*Math.exp(647.096/T*a.reduce((s,v,i)=>s+v*tau**p[i],0));
  const rho=322*(1+b.reduce((s,v,i)=>s+v*tau**q[i],0));
  return {temperatureC,rho,pc,vapourPressure:pc,source};
 }
 function target(o={}){
  const w=water(o.temperatureC??20),U=finite(o.U??o.speed,'Speed');if(!(U>0))throw Error('Speed must be positive.');
  const dynamicPressure=.5*w.rho*U*U;if(!Number.isFinite(dynamicPressure)||dynamicPressure<=0)throw Error('Dynamic pressure is outside the finite numerical range.');
  const mode=o.mode??'physical';let sigma,pInf;
  if(mode==='sigma'){sigma=finite(o.sigma,'Cavitation number');if(sigma<=0)throw Error('Cavitation number must be positive.');pInf=w.pc+sigma*dynamicPressure;}
  else if(mode==='physical'){pInf=finite(o.pInf,'Absolute ambient pressure');if(!(pInf>w.pc))throw Error('Ambient pressure must exceed water vapour pressure; bulk boiling is outside this model.');sigma=(pInf-w.pc)/dynamicPressure;}
  else throw Error('Choose physical pressure inputs or cavitation number.');
  if(!Number.isFinite(pInf)||!Number.isFinite(sigma))throw Error('Nonfinite pressure or cavitation number.');
  return {...w,U,pInf,sigma,dynamicPressure,mode};
 }
 return {VERSION:'0.1.0',water,target,source};
});
