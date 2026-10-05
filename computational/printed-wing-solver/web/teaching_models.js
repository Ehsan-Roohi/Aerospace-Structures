/* Independent teaching idealizations. mm, N, MPa; pressure input in Pa.
 * Plate: isotropic Kirchhoff-Love, all four edges simply supported, uniform p.
 * Navier odd sine series. Outputs are centre values, not a full wing solution.
 */
const TeachingModels = (() => {
  function panel({a,b,t,E,nu,pressure,terms=61}) {
    if(![a,b,t,E].every(x=>Number.isFinite(x)&&x>0)||!Number.isFinite(nu)||nu<=-1||nu>=.5||!Number.isFinite(pressure)||pressure<0||!Number.isInteger(terms)||terms<1||terms>201) throw Error('Use positive dimensions/modulus, −1 < ν < 0.5, nonnegative pressure and 1–201 series indices.');
    const p=pressure*1e-6,D=E*t**3/(12*(1-nu**2));
    let w=0,ma=0,mb=0;
    for(let m=1;m<=terms;m+=2) for(let n=1;n<=terms;n+=2) {
      const aa=(m/a)**2,bb=(n/b)**2;
      const v=16*p*(-1)**((m+n-2)/2)/(Math.PI**6*D*m*n*(aa+bb)**2);
      w+=v; ma+=D*Math.PI**2*(aa+nu*bb)*v; mb+=D*Math.PI**2*(bb+nu*aa)*v;
    }
    const stripW=5*p*a**4/(32*E*t**3), stripSigma=3*p*a*a/(4*t*t);
    const status=d=>d/t>.2?'Outside the conservative small-deflection teaching range':'Within the δ/t ≤ 0.2 teaching screen (not validation)';
    return {D,plate:{w,sigmaA:6*ma/t**2,sigmaB:6*mb/t**2,ratio:w/t,status:status(w)},strip:{w:stripW,sigmaA:stripSigma,ratio:stripW/t,status:status(stripW)},thin:Math.min(a,b)/t>=20};
  }
  function studentResult(r) {
    // Preserve the numerical engine/reference API, but never promote max(plate,
    // cylinder) to a validated wing buckling capacity in the teaching interface.
    const checks=r.checks.filter(c=>c.name!=='Skin compression buckling (screening)');
    return {...r,checks,governing:checks.reduce((a,b)=>b.U>a.U?b:a),bucklingUnresolved:true};
  }
  function buckling(r) {
    const ratio=capacity=>Math.max(...r.stress.skinComp.map((s,i)=>s*r.load.fos/capacity[i]));
    return {flat:ratio(r.stress.sigFlat),cylinder:ratio(r.stress.sigCyl),legacy:ratio(r.stress.sigCr)};
  }
  function zeroTipTwist(r,engine) {
    // Affine direct-integration model: phi_tip = P(A - x_load B).
    // Include existing dry-joint torsional spring compliances explicitly.
    const {y,props:g,geometry,assembly,rod}=r;let A=0,B=0;
    for(let i=1;i<y.length;i++) {const h=y[i]-y[i-1];A+=h*(g.xsc[i-1]/g.GJ[i-1]+g.xsc[i]/g.GJ[i])/2;B+=h*(1/g.GJ[i-1]+1/g.GJ[i])/2;}
    if(!assembly.seamsBonded) for(const s of r.seams) {
      const nr=geometry.rodFractions.length,Lf=assembly.seamFreeLength??2*geometry.interfaceOffset,d=geometry.rodDiameter;
      const k=nr===2?6*rod.E*(Math.PI*d**4/64)*(Math.abs(geometry.rodFractions[1]-geometry.rodFractions[0])*engine.chordAt(geometry,s))**2/Lf**3:(rod.G??rod.E/(2*(1+rod.nu)))*Math.PI*d**4/32/Lf;
      A+=engine.interp(s,y,g.xsc)/k;B+=1/k;
    }
    return {x:A/B,fraction:A/B/geometry.tipChord,A,B};
  }
  function fitObservations(rows) {
    if(rows.length<3||rows.length>100||rows.some(r=>r.length!==2||!r.every(Number.isFinite)))throw Error('Enter 3–100 rows: force N, displacement mm.');
    const N=rows.length,px=rows.reduce((s,r)=>s+r[0],0)/N,py=rows.reduce((s,r)=>s+r[1],0)/N;
    const xx=rows.reduce((s,r)=>s+(r[0]-px)**2,0);if(xx<=0)throw Error('Use at least two distinct force values.');
    const compliance=rows.reduce((s,r)=>s+(r[0]-px)*(r[1]-py),0)/xx;
    if(compliance<=0)throw Error('Use matching force/displacement signs; a positive compliance is required.');
    const offset=py-compliance*px,ss=rows.reduce((s,r)=>s+(r[1]-py)**2,0),err=rows.reduce((s,r)=>s+(r[1]-offset-compliance*r[0])**2,0);
    return {compliance,stiffness:1/compliance,offset,r2:1-err/ss};
  }
  return {panel,studentResult,buckling,zeroTipTwist,fitObservations};
})();
if(typeof module!=='undefined')module.exports=TeachingModels;
