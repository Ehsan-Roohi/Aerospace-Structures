/* Shared explicit handoff to recorded ADAPT predictions; no nearest-case substitution. */
const WingMLHandoff=(()=>{
 function identify(profile,A){
  if(profile.kind==='naca4'||profile.kind==='naca5')return 'NACA '+profile.code;
  const actual=A.surfaces(profile,1,0,33),known=A.surfaces(A.preset('clarky'),1,0,33);
  if(['xu','zu','xl','zl'].every(k=>actual[k].every((v,i)=>Math.abs(v-known[k][i])<1e-9)))return 'Clark Y';
  return 'Custom / '+(profile.name||'imported airfoil');
 }
 function url(profile,alpha,A,base){if(!Number.isFinite(alpha))throw Error('Enter a finite 2D angle of attack.');const u=new URL('ml-airfoil/',base);u.searchParams.set('airfoil',identify(profile,A));u.searchParams.set('alpha',String(alpha));if(identify(profile,A).startsWith('Custom /')){const s=A.surfaces(profile,1,0,81);u.searchParams.set('geometry',JSON.stringify({upper:s.xu.map((x,i)=>[x,s.zu[i]]),lower:s.xl.map((x,i)=>[x,s.zl[i]])}));}u.hash='comparison';return u.href;}
 return {identify,url};
})();
if(typeof window!=='undefined')window.WingMLHandoff=WingMLHandoff;
if(typeof module!=='undefined')module.exports=WingMLHandoff;
