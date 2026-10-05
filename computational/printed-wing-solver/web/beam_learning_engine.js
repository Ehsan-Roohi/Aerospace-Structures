/*
 * Beam Learning Engine — MIE 446. Dependency-free Euler–Bernoulli teaching model.
 * Browser: BeamLearningEngine.solve(options). Node: require('./beam_learning_engine.js').
 *
 * solve({length:450,width:20,height:10,E:2000,density:1.24,
 *   support:'cantilever',elements:40,
 *   loads:[{kind:'point',position:450,force:2},
 *          {kind:'distributed',start:0,end:450,qStart:0,qEnd:0.01}]})
 *
 * Units: mm, N, MPa=N/mm², N/mm, density g/cm³; massG is grams, frequencyHz is Hz.
 * Positive transverse load/displacement is DOWNWARD. Rotation is dv/dx (clockwise).
 * Positive support moment is clockwise. Positive internal M is SAGGING:
 * M=-EI v'', V=dM/dx, dV/dx=-q. At z positive UP from the neutral axis,
 * sigma_x=-M z/I. stressTop=-M h/(2I), stressBottom=+M h/(2I).
 *
 * Returns x,deflection,rotation,shear,moment,stressTop,stressBottom,shearStressMax,
 * nodes,nodalDisplacement,reactions:[{x,force,moment}],jumps:[{x,left,right}],
 * modes:[{frequencyHz,x,shape,relativeResidual}], area,I,massG,EI,equilibrium,
 * maxima, input, equations and assumptions. All arrays are ordinary JS arrays.
 * shearStressMax=1.5*abs(V)/A is the neutral-axis MAXIMUM in a solid rectangle;
 * it is not the shear stress at the top/bottom surface (which is zero).
 *
 * Cubic Hermite beam FE, consistent load integration (3-point Gauss), exact
 * consistent Hermite mass matrix,
 * exact equilibrium recovery of V/M, generalized inverse-iteration modes.
 * Mesh inserts every load boundary. Point jumps have duplicate x samples.
 * Source for Hermite/weak-form formulation:
 * https://teachbooks.tudelft.nl/computational-modelling/structural_linear/euler_bernouilli.html
 * Limitations: straight slender solid beam, homogeneous linear elasticity, small
 * displacement, ideal supports; no shear deformation, local contact, buckling,
 * plasticity, torsion, or CAD/print verification. Modes are free undamped bending
 * eigenmodes, not a time response; their arbitrary amplitude is normalized to 1.
 */
const BeamLearningEngine = (() => {
  'use strict';
  const VERSION = '1.0.0';
  const DEFAULTS = {length:450,width:20,height:10,E:2000,density:1.24,
    support:'cantilever',elements:40};
  const zeros = n => Array(n).fill(0);
  const matrix = n => Array.from({length:n},()=>zeros(n));
  const dot = (a,b) => a.reduce((s,v,i)=>s+v*b[i],0);
  const matVec = (a,x) => a.map(row=>dot(row,x));
  const maxAbs = a => Math.max(...a.map(Math.abs));
  const shape = (t,h) => [1-3*t*t+2*t*t*t,h*(t-2*t*t+t*t*t),3*t*t-2*t*t*t,h*(-t*t+t*t*t)];
  const slopeShape = (t,h) => [(-6*t+6*t*t)/h,1-4*t+3*t*t,(6*t-6*t*t)/h,-2*t+3*t*t];

  function finite(v,name) {
    if(typeof v!=='number'||!Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
    return v;
  }
  function normalize(options={}) {
    const o={...DEFAULTS,...options};
    for(const k of ['length','width','height','E','density']) {
      finite(o[k],k); if(o[k]<=0) throw new Error(`${k} must be greater than zero.`);
    }
    if(!['cantilever','fixed-fixed','simply-supported'].includes(o.support)) throw new Error('Choose cantilever, fixed-fixed, or simply-supported.');
    if(!Number.isInteger(o.elements)||o.elements<4||o.elements>100) throw new Error('Use an integer mesh size from 4 to 100 elements.');
    const list=o.loads===undefined?[{kind:'point',position:o.length,force:2}]:o.loads;
    if(!Array.isArray(list)||list.length>30) throw new Error('Provide an array of at most 30 loads.');
    o.loads=list.map((v,i)=>{
      if(!v || typeof v!=='object') throw new Error(`Load ${i+1} is invalid.`);
      if(v.kind==='point') {
        finite(v.position,'Point position'); finite(v.force,'Point force');
        if(v.position<0||v.position>o.length) throw new Error('Point position must lie on the beam.');
        return {kind:'point',position:v.position,force:v.force};
      }
      if(v.kind==='distributed') {
        for(const k of ['start','end','qStart','qEnd']) finite(v[k],k);
        if(v.start<0||v.end>o.length||v.end<=v.start) throw new Error('Distributed load needs 0 ≤ start < end ≤ beam length.');
        return {kind:'distributed',start:v.start,end:v.end,qStart:v.qStart,qEnd:v.qEnd};
      }
      throw new Error('Load kind must be point or distributed.');
    });
    return o;
  }

  // Diagonal scaling keeps translations and rotations well conditioned.
  function factorSPD(a) {
    const n=a.length, scale=a.map((r,i)=>Math.sqrt(r[i])), l=matrix(n);
    for(let i=0;i<n;i++) for(let j=0;j<=i;j++) {
      let s=a[i][j]/(scale[i]*scale[j]);
      for(let k=0;k<j;k++) s-=l[i][k]*l[j][k];
      if(i===j) {
        if(!(s>0)) throw new Error('Beam stiffness is singular or ill-conditioned; check dimensions and supports.');
        l[i][j]=Math.sqrt(s);
      } else l[i][j]=s/l[j][j];
    }
    return b=>{
      const y=zeros(n),z=zeros(n);
      for(let i=0;i<n;i++) {let s=b[i]/scale[i];for(let j=0;j<i;j++)s-=l[i][j]*y[j];y[i]=s/l[i][i];}
      for(let i=n-1;i>=0;i--) {let s=y[i];for(let j=i+1;j<n;j++)s-=l[j][i]*z[j];z[i]=s/l[i][i];}
      return z.map((v,i)=>v/scale[i]);
    };
  }

  function solve(options={}) {
    const o=normalize(options),L=o.length,A=o.width*o.height,I=o.width*o.height**3/12,EI=o.E*I;
    const eps=L*1e-10;
    // Preserve actual load coordinates; drop nearby regular mesh points to avoid
    // microscopic elements if a user enters a point nearly on a regular node.
    const forced=[0,L,...o.loads.flatMap(v=>v.kind==='point'?[v.position]:[v.start,v.end])].sort((a,b)=>a-b);
    const anchors=forced.filter((v,i)=>i===0||v-forced[i-1]>eps);
    const nodes=[...anchors];
    for(let i=1;i<o.elements;i++) {
      const x=L*i/o.elements;
      if(anchors.every(v=>Math.abs(v-x)>L/o.elements*0.04)) nodes.push(x);
    }
    nodes.sort((a,b)=>a-b);
    // Nearly coincident independent load boundaries are numerically problematic.
    if(nodes.some((x,i)=>i>0&&x-nodes[i-1]<L*1e-7)) throw new Error('Two load boundaries are too close together; combine them or separate their locations.');
    const n=nodes.length,nd=2*n,K=matrix(nd),Mass=matrix(nd),F=zeros(nd);
    const gauss=[[-Math.sqrt(3/5),5/9],[0,8/9],[Math.sqrt(3/5),5/9]];
    const rho=o.density/1e9; // g/cm³ -> N s²/mm⁴ (consistent mm,N,s mass).
    for(let e=0;e<n-1;e++) {
      const a=nodes[e],h=nodes[e+1]-a,h2=h*h,k0=EI/h**3;
      const ke=[[12,6*h,-12,6*h],[6*h,4*h2,-6*h,2*h2],[-12,-6*h,12,-6*h],[6*h,2*h2,-6*h,4*h2]];
      for(let i=0;i<4;i++)for(let j=0;j<4;j++) K[2*e+i][2*e+j]+=k0*ke[i][j];
      for(const [xi,weight] of gauss) {
        const t=(xi+1)/2,x=a+t*h,N=shape(t,h),w=weight*h/2;
        let q=0;
        for(const load of o.loads) if(load.kind==='distributed'&&x>=load.start&&x<=load.end) q+=load.qStart+(load.qEnd-load.qStart)*(x-load.start)/(load.end-load.start);
        for(let i=0;i<4;i++) {
          F[2*e+i]+=w*N[i]*q;
        }
      }
    }
    // N_i*N_j has degree six: use the exact Hermite consistent mass matrix.
    for(let e=0;e<n-1;e++) {
      const h=nodes[e+1]-nodes[e],h2=h*h,m0=rho*A*h/420;
      const me=[[156,22*h,54,-13*h],[22*h,4*h2,13*h,-3*h2],[54,13*h,156,-22*h],[-13*h,-3*h2,-22*h,4*h2]];
      for(let i=0;i<4;i++)for(let j=0;j<4;j++)Mass[2*e+i][2*e+j]+=m0*me[i][j];
    }
    for(const load of o.loads) if(load.kind==='point') {
      const j=nodes.findIndex(x=>Math.abs(x-load.position)<=eps);
      if(j<0) throw new Error('Point load could not be located on mesh.');
      F[2*j]+=load.force;
    }
    const fixed=o.support==='cantilever'?[0,1]:o.support==='fixed-fixed'?[0,1,nd-2,nd-1]:[0,nd-2];
    const free=Array.from({length:nd},(_,i)=>i).filter(i=>!fixed.includes(i));
    const k=free.map(i=>free.map(j=>K[i][j])),m=free.map(i=>free.map(j=>Mass[i][j]));
    const backsolve=factorSPD(k),uf=backsolve(free.map(i=>F[i])),u=zeros(nd);
    free.forEach((j,i)=>u[j]=uf[i]);
    const residual=matVec(K,u).map((v,i)=>v-F[i]);
    const reactions=[{x:0,force:residual[0],moment:fixed.includes(1)?residual[1]:0}];
    if(o.support!=='cantilever') reactions.push({x:L,force:residual[nd-2],moment:fixed.includes(nd-1)?residual[nd-1]:0});

    function integrals(x) {
      let f=0,lever=0;
      for(const v of o.loads) if(v.kind==='distributed') {
        const t=Math.max(0,Math.min(x,v.end)-v.start),s=(v.qEnd-v.qStart)/(v.end-v.start);
        const resultant=v.qStart*t+s*t*t/2;
        f+=resultant;
        lever+=(x-v.start)*resultant-v.qStart*t*t/2-s*t*t*t/3;
      }
      return [f,lever];
    }
    function internal(x,side='right') {
      const [f,lever]=integrals(x);
      let V=-reactions[0].force-f,M=reactions[0].moment-reactions[0].force*x-lever;
      for(const v of o.loads) if(v.kind==='point'&&(v.position<x-eps||(Math.abs(v.position-x)<=eps&&side==='right'))) {
        V-=v.force;M-=v.force*(x-v.position);
      }
      return {V,M};
    }
    const x=[],deflection=[],rotation=[],shear=[],moment=[],stressTop=[],stressBottom=[],shearStressMax=[];
    function sample(s,e,side) {
      const h=nodes[e+1]-nodes[e],t=(s-nodes[e])/h,N=shape(t,h),Ns=slopeShape(t,h),ue=u.slice(2*e,2*e+4);
      const {V,M}=internal(s,side);
      x.push(s);deflection.push(dot(N,ue));rotation.push(dot(Ns,ue));shear.push(V);moment.push(M);
      stressTop.push(-M*o.height/(2*I));stressBottom.push(M*o.height/(2*I));shearStressMax.push(1.5*Math.abs(V)/A);
    }
    for(let e=0;e<n-1;e++) for(let j=0;j<4;j++) {
      const s=nodes[e]+(nodes[e+1]-nodes[e])*j/4;
      if(j===0&&e>0&&o.loads.some(v=>v.kind==='point'&&Math.abs(v.position-s)<=eps))sample(s,e,'left');
      sample(s,e,'right');
    }
    sample(L,n-2,'left');
    const jumps=o.loads.filter(v=>v.kind==='point'&&v.position>0&&v.position<L).map(v=>({x:v.position,left:internal(v.position,'left').V,right:internal(v.position,'right').V}));
    const resultant=integrals(L)[0]+o.loads.filter(v=>v.kind==='point').reduce((s,v)=>s+v.force,0);
    let appliedMoment=0;
    for(const v of o.loads) {
      if(v.kind==='point')appliedMoment+=v.force*v.position;
      else {const h=v.end-v.start;appliedMoment+=v.start*h*(v.qStart+v.qEnd)/2+h*h*(v.qStart+2*v.qEnd)/6;}
    }

    const eigenvectors=[],modes=[];
    if(o.modes!==false) for(let mode=0;mode<3;mode++) {
      let v=free.map((j,i)=>Math.sin((i+1)*(mode+1)*0.873)+0.25*Math.cos((i+1)*1.197));
      const orthonormalize=z=>{
        // Two passes avoid loss of orthogonality from widely separated scales.
        for(let pass=0;pass<2;pass++)for(const prior of eigenvectors) {
          const c=dot(prior,matVec(m,z)); z=z.map((value,i)=>value-c*prior[i]);
        }
        const norm=Math.sqrt(dot(z,matVec(m,z)));
        if(!(norm>0)) throw new Error('Modal normalization failed.');
        return z.map(value=>value/norm);
      };
      v=orthonormalize(v);
      let lambda=0,rel=Infinity;
      for(let iter=0;iter<120;iter++) {
        v=orthonormalize(backsolve(matVec(m,v)));
        const kv=matVec(k,v),mv=matVec(m,v);lambda=dot(v,kv)/dot(v,mv);
        rel=Math.hypot(...kv.map((a,i)=>a-lambda*mv[i]))/Math.max(Math.hypot(...kv),1e-30);
        if(rel<1e-8)break;
      }
      eigenvectors.push(v);
      const whole=zeros(nd);free.forEach((j,i)=>whole[j]=v[i]);
      const shapes=x.map(s=>{
        let e=0;while(e<n-2&&nodes[e+1]<s)e++;
        const h=nodes[e+1]-nodes[e];return dot(shape((s-nodes[e])/h,h),whole.slice(2*e,2*e+4));
      });
      const norm=maxAbs(shapes),peak=shapes.find(value=>Math.abs(value)>=norm*.999),sign=peak<0?-1:1;
      modes.push({frequencyHz:Math.sqrt(lambda)/(2*Math.PI),x:[...x],shape:shapes.map(a=>sign*a/norm),relativeResidual:rel});
    }
    const warnings=[];
    if(L/o.height<15)warnings.push('Length/depth < 15: Euler–Bernoulli shear-neglect may be inaccurate; compare a Timoshenko or solid model.');
    if(maxAbs(deflection)>L*.05)warnings.push('Deflection exceeds 5% of span: this small-displacement model may be inappropriate.');
    return {version:VERSION,input:o,x,deflection,rotation,shear,moment,stressTop,stressBottom,shearStressMax,
      nodes,nodalDisplacement:u,reactions,jumps,modes,area:A,I,EI,massG:o.density*A*L/1000,
      resultant,appliedMoment,equilibrium:{force:resultant+reactions.reduce((s,r)=>s+r.force,0),
        moment:appliedMoment+reactions.reduce((s,r)=>s+r.force*r.x+r.moment,0)},
      maxima:{deflection:maxAbs(deflection),moment:maxAbs(moment),shear:maxAbs(shear),bendingStress:maxAbs(stressTop),shearStress:maxAbs(shearStressMax)},
      equations:['EI v⁗ = q','M = −EI v″','V = dM/dx','dV/dx = −q','σx = −Mz/I','τmax = 3|V|/(2A)','K u = f','K φ = ω² M φ'],
      assumptions:['Straight, uniform, solid rectangular cross-section','Linear elastic, small displacement, slender beam',
        'Perfectly rigid ideal supports; local clamp/contact stresses are not resolved','No torsion, transverse-shear deformation, buckling, plasticity or self-weight unless included as a load',
        'Three normalized undamped bending modes; amplitude is arbitrary, not predicted vibration'],warnings};
  }
  return {VERSION,DEFAULTS,normalize,solve};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=BeamLearningEngine;
if(typeof window!=='undefined')window.BeamLearningEngine=BeamLearningEngine;
