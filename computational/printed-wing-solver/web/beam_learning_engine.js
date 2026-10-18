/*
 * Beam Learning Engine — MIE 446. Euler–Bernoulli teaching model (needs beam_sections.js).
 * Browser: BeamLearningEngine.solve(options). Node: require('./beam_learning_engine.js').
 *
 * solve({length:450,E:2000,density:1.24,elements:40,
 *   section:{shape:'rectangle',width:20,height:10},          // or legacy width/height
 *   supports:[{x:0,kind:'fixed'},{x:300,kind:'roller'}],      // or legacy support/leftSupport/rightSupport
 *   hinges:[150],                                             // internal moment releases (optional)
 *   selfWeight:false,                                         // adds rho g A as a line load when true
 *   loads:[{kind:'point',position:450,force:2},
 *          {kind:'moment',position:200,moment:50},
 *          {kind:'distributed',start:0,end:450,qStart:0,qEnd:0.01},
 *          {kind:'elliptic',start:0,end:450,shape:'start',total:0.45},   // or peak (N/mm); also 'parabolic'
 *          {kind:'table',points:[[0,0.002],[225,0.001],[450,0]]}]})      // piecewise-linear table (CSV import)
 *
 * Units: mm, N, MPa = N/mm², N/mm, N·mm, density g/cm³; massG is grams, frequencyHz is Hz.
 * Positive transverse load/displacement is DOWNWARD. Rotation theta = dv/dx (clockwise).
 * Positive applied couple and support reaction couple are CLOCKWISE. Positive internal M is
 * SAGGING: M = -EI v'', V = dM/dx, dV/dx = -q; a clockwise couple C raises M by +C.
 * At z positive UP from the neutral axis sigma_x = -M z / I: stressTop = -M c/I, stressBottom = +M c/I.
 * Support kinds: fixed (v = 0, theta = 0), pin and roller (v = 0). Only transverse DOFs (v, theta)
 * are solved; a pin or fixed support also restrains axial motion, which is checked for planar
 * stability but not solved (horizontal reactions are zero for these transverse loads).
 * A hinge releases the internal moment: v is continuous, theta may jump, M(hinge) = 0.
 *
 * Returns x, deflection, rotation, shear, moment, stressTop, stressBottom, shearStressMax, nodes,
 * nodalDisplacement, reactions:[{x,kind,force,moment}], jumps (point-force shear jumps),
 * momentJumps, discontinuities, stations (key-station V/M/v/theta limits), extremes, modes,
 * area, I, EI, massG, section, sectionProperties, selfWeight, loadsApplied, stability, dofs,
 * equilibrium, maxima, input, equations, assumptions and warnings. Arrays are plain JS arrays.
 * shearStressMax = k |V| / A is the neutral-axis maximum of V Q/(I b) for the chosen section
 * (k = 1.5 for a solid rectangle, 4/3 for a solid circle); it is not the surface shear (zero).
 *
 * Curved loads (elliptic, parabolic; shapes 'start' | 'end' | 'middle' give the maximum at the start, at the
 * end or in the middle) are defined in load_profiles.js. Their resultants, V and M use closed-form integrals;
 * their consistent element loads use Gauss–Legendre quadrature in the angle variable for the elliptic square
 * root (round-off accurate) and exact Gauss rules for the polynomial and table loads. A table load is linear
 * between its rows (at most 31 rows) and zero outside them. LIMITS.loads counts load segments: each load is
 * one segment, a table is rows − 1.
 * Cubic Hermite beam FE, consistent load integration (3-point Gauss), exact consistent Hermite
 * mass matrix, reactions from r = K u - f, exact equilibrium recovery of V/M, generalized
 * inverse-iteration modes. The mesh inserts every load, support and hinge station; point
 * actions, interior supports and hinges have duplicate left/right samples.
 * Mechanisms are rejected by a rigid-segment kinematic rank test before any factorization, so
 * no static solution or eigenmode is reported for a mechanism.
 * Source for the Hermite/weak-form formulation:
 * https://teachbooks.tudelft.nl/computational-modelling/structural_linear/euler_bernouilli.html
 * Limitations: straight slender prismatic beam, homogeneous linear elasticity, small displacement,
 * ideal rigid supports; no shear deformation, local contact, buckling, plasticity, torsion or
 * CAD/print verification. Modes are free undamped bending eigenmodes, not a time response.
 */
const BeamLearningEngine = (() => {
  'use strict';
  const VERSION = '2.0.0';
  const Sections = typeof BeamSections!=='undefined' ? BeamSections
    : (typeof require==='function' ? require('./beam_sections.js') : null);
  if(!Sections) throw new Error('Load beam_sections.js before beam_learning_engine.js.');
  const Profiles = typeof LoadProfiles!=='undefined' ? LoadProfiles
    : (typeof require==='function' ? require('./load_profiles.js') : null);
  if(!Profiles) throw new Error('Load load_profiles.js before beam_learning_engine.js.');
  const DEFAULTS = {length:450,width:20,height:10,E:2000,density:1.24,
    support:'cantilever',elements:40};
  const LIMITS = Object.freeze({loads:30,supports:12,hinges:6});
  const GRAVITY = 9.80665; // m/s²
  const SUPPORT_KINDS = ['fixed','pin','roller'];
  const zeros = n => Array(n).fill(0);
  const matrix = n => Array.from({length:n},()=>zeros(n));
  const dot = (a,b) => a.reduce((s,v,i)=>s+v*b[i],0);
  const matVec = (a,x) => a.map(row=>dot(row,x));
  const maxAbs = a => Math.max(...a.map(Math.abs));
  const shape = (t,h) => [1-3*t*t+2*t*t*t,h*(t-2*t*t+t*t*t),3*t*t-2*t*t*t,h*(-t*t+t*t*t)];
  const slopeShape = (t,h) => [(-6*t+6*t*t)/h,1-4*t+3*t*t,(6*t-6*t*t)/h,-2*t+3*t*t];
  const own = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
  const mm = x => Number(x.toFixed(6));

  function finite(v,name) {
    if(typeof v!=='number'||!Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
    return v;
  }

  /* ------------------------------------------------- distributed-load helpers */
  // 'distributed' is the linear (uniform, triangular, trapezoidal) load; its formulas below are unchanged.
  const isProfile=v=>v.kind==='elliptic'||v.kind==='parabolic'||v.kind==='table';
  const isDist=v=>v.kind==='distributed'||isProfile(v);
  const loadSpan=v=>v.kind==='table'?[v.points[0][0],v.points[v.points.length-1][0]]:[v.start,v.end];
  /** Stations a load defines (mesh nodes): position, or start/end, or every table row. */
  const loadStations=v=>v.kind==='table'?v.points.map(p=>p[0]):isDist(v)?[v.start,v.end]:[v.position];
  function loadValue(v,x) {
    if(v.kind==='distributed') return x<v.start||x>v.end?0:v.qStart+(v.qEnd-v.qStart)*(x-v.start)/(v.end-v.start);
    return Profiles.valueAt(v,x);
  }
  /** Part of a distributed load on [s, e]: resultant W (↓ +), centroid xbar and ∫(ξ − o) w dξ. */
  function loadPortion(v,s,e,o=0) {
    const [lo,hi]=loadSpan(v), a=Math.max(s,lo), b=Math.min(e,hi);
    if(!(b>a)) return {W:0,Mo:0,xbar:null,start:a,end:a};
    let W,Mo;
    if(v.kind==='distributed') {
      const q=x=>v.qStart+(v.qEnd-v.qStart)*(x-v.start)/(v.end-v.start), q0=q(a), q1=q(b), h=b-a;
      W=h*(q0+q1)/2; Mo=a*W+h*h*(q0+2*q1)/6-W*o;
    } else [W,Mo]=Profiles.integrals(v,a,b,o);
    const scale=loadPeak(v)*(b-a);
    return {W,Mo,xbar:Math.abs(W)>1e-12*Math.max(scale,1e-300)?o+Mo/W:null,start:a,end:b};
  }
  /** Largest |intensity| of a distributed load (for drawing scales and round-off tolerances). */
  function loadPeak(v) {
    if(v.kind==='distributed') return Math.max(Math.abs(v.qStart),Math.abs(v.qEnd));
    if(v.kind==='table') return Math.max(...v.points.map(p=>Math.abs(p[1])));
    return Math.abs(v.peak);
  }
  /** Polyline [[x, w]] of a distributed load on [s, e] for drawing (curves sampled; not used for any result). */
  function loadSamples(v,s,e) {
    const [lo,hi]=loadSpan(v), a=Math.max(s??lo,lo), b=Math.min(e??hi,hi);
    if(!(b>a)) return [];
    if(v.kind==='distributed') return [[a,loadValue(v,a)],[b,loadValue(v,b)]];
    if(v.kind==='table') return [[a,loadValue(v,a)],...v.points.filter(p=>p[0]>a&&p[0]<b).map(p=>[p[0],p[1]]),[b,loadValue(v,b)]];
    const n=64, xs=Array.from({length:n+1},(_,k)=>a+(b-a)*0.5*(1-Math.cos(Math.PI*k/n)));
    return xs.map(x=>[x,loadValue(v,x)]);
  }

  /* ---------------------------------------------------------------- input */

  function normalizeSupports(options, o) {
    const L=o.length, eps=L*1e-10;
    let list;
    if(options.supports!==undefined) {
      if(!Array.isArray(options.supports)) throw new Error('Supports must be a list.');
      if(options.supports.length>LIMITS.supports) throw new Error(`Use at most ${LIMITS.supports} supports.`);
      list=options.supports.map((s,i)=>{
        if(!s||typeof s!=='object') throw new Error(`Support ${i+1} is invalid.`);
        const x=own(s,'x')?s.x:s.position;
        finite(x,`Support ${i+1} position`);
        if(x<0||x>L) throw new Error(`Support ${i+1} must lie on the beam (0 ≤ x ≤ ${L} mm).`);
        if(!SUPPORT_KINDS.includes(s.kind)) throw new Error(`Support ${i+1} must be fixed, pin or roller.`);
        // Snap round-off at the ends so an end support is recognised as an end support.
        return {x:Math.abs(x)<=eps?0:Math.abs(x-L)<=eps?L:x,kind:s.kind};
      });
    } else {
      const legacy={'cantilever':['fixed','free'],'fixed-fixed':['fixed','fixed'],
        'simply-supported':options.simpleArrangement==='roller-left'?['roller','pin']:['pin','roller']};
      const ends=own(legacy,o.support)?legacy[o.support]:undefined;
      const left=options.leftSupport ?? (ends&&ends[0]), right=options.rightSupport ?? (ends&&ends[1]);
      for(const end of [left,right]) if(!['fixed','pin','roller','free'].includes(end)) throw new Error('Choose fixed, pin, roller or free at each end.');
      list=[];
      if(left!=='free') list.push({x:0,kind:left});
      if(right!=='free') list.push({x:L,kind:right});
    }
    list.sort((a,b)=>a.x-b.x);
    for(let i=1;i<list.length;i++) if(list[i].x-list[i-1].x<=eps) throw new Error(`Two supports are at the same station x = ${mm(list[i].x)} mm; combine them into one support.`);
    return list;
  }

  function normalizeHinges(options, o) {
    const L=o.length, eps=L*1e-10, raw=options.hinges===undefined?[]:options.hinges;
    if(!Array.isArray(raw)) throw new Error('Hinges must be a list of stations.');
    if(raw.length>LIMITS.hinges) throw new Error(`Use at most ${LIMITS.hinges} internal hinges.`);
    const list=raw.map((h,i)=>{
      const x=h&&typeof h==='object'?h.x:h;
      finite(x,`Hinge ${i+1} position`);
      if(!(x>eps&&x<L-eps)) throw new Error(`Hinge ${i+1} must be inside the span (0 < x < ${L} mm); an end hinge has no effect.`);
      return x;
    }).sort((a,b)=>a-b);
    for(let i=1;i<list.length;i++) if(list[i]-list[i-1]<=eps) throw new Error('Two hinges are at the same station.');
    for(const x of list) if(o.supports.some(s=>s.kind==='fixed'&&Math.abs(s.x-x)<=eps))
      throw new Error(`A hinge cannot coincide with a fixed support (x = ${mm(x)} mm): the clamp would have two different rotations.`);
    return list;
  }

  function normalizeLoads(options, o) {
    const L=o.length, eps=L*1e-10;
    const list=options.loads===undefined?[{kind:'point',position:L,force:2}]:options.loads;
    if(!Array.isArray(list)||list.length>LIMITS.loads) throw new Error(`Provide an array of at most ${LIMITS.loads} loads.`);
    const out=list.map((v,i)=>{
      if(!v || typeof v!=='object') throw new Error(`Load ${i+1} is invalid.`);
      if(v.kind==='point') {
        finite(v.position,'Point position'); finite(v.force,'Point force');
        if(v.position<0||v.position>L) throw new Error('Point position must lie on the beam.');
        return {kind:'point',position:v.position,force:v.force};
      }
      if(v.kind==='moment') {
        finite(v.position,'Couple position'); finite(v.moment,'Couple moment');
        if(v.position<0||v.position>L) throw new Error('Couple position must lie on the beam.');
        if(o.hinges.some(h=>Math.abs(h-v.position)<=eps)) throw new Error(`A couple cannot act exactly at the hinge x = ${mm(v.position)} mm; place it just left or right of the hinge.`);
        return {kind:'moment',position:v.position,moment:v.moment};
      }
      if(v.kind==='distributed') {
        for(const k of ['start','end','qStart','qEnd']) finite(v[k],k);
        if(v.start<0||v.end>L||v.end<=v.start) throw new Error('Distributed load needs 0 ≤ start < end ≤ beam length.');
        return {kind:'distributed',start:v.start,end:v.end,qStart:v.qStart,qEnd:v.qEnd};
      }
      if(v.kind==='elliptic'||v.kind==='parabolic')
        return Profiles.normalizeCurve(v,{min:0,max:L,lengthUnit:'mm',name:`Load ${i+1} (${v.kind})`});
      if(v.kind==='table') return Profiles.normalizeTable(v,{min:0,max:L,lengthUnit:'mm',allowFraction:false,eps,name:`Load ${i+1} (table)`});
      throw new Error('Load kind must be point, moment, distributed, elliptic, parabolic or table.');
    });
    const segments=Profiles.segmentCount(out);
    if(segments>LIMITS.loads) throw new Error(`Use at most ${LIMITS.loads} load segments (each load is one, a table counts its rows − 1); this model has ${segments}.`);
    return out;
  }

  /**
   * Validated, plain copy of the model. Throws a readable Error for invalid input and for
   * transverse or planar (axial) mechanisms. Exported studies use this object (result.input).
   */
  function normalize(options={}) {
    if(!options||typeof options!=='object') throw new Error('Beam options must be an object.');
    const pick=k=>own(options,k)?options[k]:DEFAULTS[k];
    const o={};
    for(const k of ['length','E','density']) {
      o[k]=pick(k); finite(o[k],k); if(o[k]<=0) throw new Error(`${k} must be greater than zero.`);
    }
    o.section=Sections.normalize(options.section!==undefined?options.section:{shape:'rectangle',width:pick('width'),height:pick('height')});
    if(o.section.shape==='rectangle') {o.width=o.section.width;o.height=o.section.height;}
    o.support=pick('support');
    o.supports=normalizeSupports(options,o);
    o.leftSupport=(o.supports.find(s=>s.x===0)||{kind:'free'}).kind;
    o.rightSupport=(o.supports.find(s=>s.x===o.length)||{kind:'free'}).kind;
    o.hinges=normalizeHinges(options,o);
    const interior=o.supports.some(s=>s.x>0&&s.x<o.length), pair=[o.leftSupport,o.rightSupport];
    o.support=interior||o.hinges.length?'custom':pair[0]==='fixed'&&pair[1]==='free'?'cantilever':pair.every(s=>s==='fixed')?'fixed-fixed':pair.every(s=>s==='pin'||s==='roller')?'simply-supported':'custom';
    if(options.selfWeight!==undefined&&typeof options.selfWeight!=='boolean') throw new Error('Self-weight must be true or false.');
    o.selfWeight=options.selfWeight===true;
    o.elements=pick('elements');
    if(!Number.isInteger(o.elements)||o.elements<4||o.elements>100) throw new Error('Use an integer mesh size from 4 to 100 elements.');
    o.loads=normalizeLoads(options,o);
    const stability=stabilityOf(o);
    if(!stability.stable) throw mechanismError(o,stability);
    if(!stability.axialStable&&options._transverseOnly!==true) throw axialError(o);
    return o;
  }

  /* ---------------------------------------------------------- kinematics */

  // Gaussian elimination with partial pivoting; returns the rank and a null-space basis.
  function rankAndNullspace(rows, ncol, tol=1e-9) {
    const a=rows.map(r=>[...r]);
    const scale=Math.max(1,...a.flat().map(Math.abs));
    const pivots=[];
    let r=0;
    for(let c=0;c<ncol&&r<a.length;c++) {
      let p=r;
      for(let i=r+1;i<a.length;i++) if(Math.abs(a[i][c])>Math.abs(a[p][c])) p=i;
      if(Math.abs(a[p][c])<=tol*scale) continue;
      [a[r],a[p]]=[a[p],a[r]];
      const pv=a[r][c];
      for(let j=c;j<ncol;j++) a[r][j]/=pv;
      for(let i=0;i<a.length;i++) if(i!==r&&a[i][c]!==0) {
        const f=a[i][c]; for(let j=c;j<ncol;j++) a[i][j]-=f*a[r][j];
      }
      pivots.push(c); r++;
    }
    const nullspace=[];
    for(let f=0;f<ncol;f++) if(!pivots.includes(f)) {
      const v=zeros(ncol); v[f]=1;
      pivots.forEach((c,i)=>{v[c]=-a[i][f];});
      nullspace.push(v);
    }
    return {rank:pivots.length,nullspace};
  }

  /**
   * Rigid-segment kinematics. Hinges split the beam into segments; segment s moves as
   * v = a_s + b_s (x/L). Supports add v = 0 (and b_s = 0 for a clamp); each hinge keeps v
   * continuous. Full column rank means no rigid-body or hinge mechanism remains.
   * restraints: [{x, v:boolean, theta:boolean}] (defaults to the model's supports).
   */
  function stabilityOf(o, restraints) {
    const L=o.length, eps=L*1e-10, hinges=o.hinges, nseg=hinges.length+1, ncol=2*nseg;
    const list=restraints||o.supports.map(s=>({x:s.x,v:true,theta:s.kind==='fixed',kind:s.kind}));
    const segmentOf=x=>{let s=0;while(s<hinges.length&&x>hinges[s]+eps)s++;return s;};
    const rows=[];
    for(const s of list) {
      const k=segmentOf(s.x);
      if(s.v) {const row=zeros(ncol);row[2*k]=1;row[2*k+1]=s.x/L;rows.push(row);}
      if(s.theta) {const row=zeros(ncol);row[2*k+1]=1;rows.push(row);}
    }
    hinges.forEach((h,j)=>{const row=zeros(ncol);row[2*j]=1;row[2*j+1]=h/L;row[2*j+2]=-1;row[2*j+3]=-h/L;rows.push(row);});
    const {rank,nullspace}=rankAndNullspace(rows,ncol);
    const transverse=list.reduce((n,s)=>n+(s.v?1:0)+(s.theta?1:0),0);
    const axialRestraints=o.supports.filter(s=>s.kind!=='roller').length;
    const bounds=[0,...hinges,L];
    return {stable:rank===ncol,mechanismDofs:ncol-rank,nullspace,segments:bounds.slice(0,-1).map((a,i)=>({start:a,end:bounds[i+1]})),
      hinges:hinges.length,transverseRestraints:transverse,equations:2+hinges.length,
      degree:rank===ncol?transverse-2-hinges.length:null,axialRestraints,axialStable:axialRestraints>0,
      axialDegree:Math.max(0,axialRestraints-1)};
  }

  // Describe one null-space motion as rigid motions of the hinge-separated segments.
  function describeMechanism(o, stability) {
    const L=o.length, v=stability.nullspace[0], segs=stability.segments;
    const motion=segs.map((s,k)=>({start:s.start,end:s.end,v0:v[2*k]+v[2*k+1]*s.start/L,v1:v[2*k]+v[2*k+1]*s.end/L}));
    const peak=Math.max(...motion.flatMap(m=>[Math.abs(m.v0),Math.abs(m.v1)]),1e-30);
    motion.forEach(m=>{m.v0/=peak;m.v1/=peak;});
    const parts=motion.filter(m=>Math.max(Math.abs(m.v0),Math.abs(m.v1))>1e-9).map(m=>{
      const span=`${mm(m.start)}–${mm(m.end)} mm`;
      if(Math.abs(m.v1-m.v0)<1e-9) return `the segment ${span} can translate vertically`;
      const pivot=m.start+(m.end-m.start)*(-m.v0)/(m.v1-m.v0);
      return pivot>=m.start-1e-9*L&&pivot<=m.end+1e-9*L?`the segment ${span} can rotate about x = ${mm(pivot)} mm`:`the segment ${span} can move as a rigid link`;
    });
    return {motion,text:parts.join('; ')};
  }

  function mechanismError(o, stability) {
    const d=describeMechanism(o,stability);
    let message;
    if(!o.supports.length) message='Unstable beam: no support restrains it, so it can translate and rotate as a rigid body. Add supports.';
    else if(!o.hinges.length&&o.supports.length===1&&o.supports[0].kind!=='fixed') message=`Unstable beam: it can rotate about the ${o.supports[0].kind} at x = ${mm(o.supports[0].x)} mm. A single pin or roller cannot prevent rotation; add a second support or a clamp.`;
    else if(o.hinges.length) message=`Unstable beam (hinge mechanism): ${d.text}. Add a support to that part or remove a hinge.`;
    else message=`Unstable beam (mechanism): ${d.text}.`;
    if(stability.mechanismDofs>1) message+=` ${stability.mechanismDofs} independent rigid motions remain.`;
    const err=new Error(message);
    err.code='mechanism';err.mechanism={kind:'transverse',dofs:stability.mechanismDofs,motion:d.motion};
    return err;
  }

  function axialError(o) {
    const rollers=o.supports.length;
    const err=new Error(rollers===2&&o.leftSupport==='roller'&&o.rightSupport==='roller'
      ?'Two rollers leave horizontal rigid-body translation unrestrained. Choose a pin or fixed support at one end.'
      :'Unstable in the plane: only rollers support the beam, so horizontal (axial) rigid-body translation is unrestrained. Change one roller to a pin or fixed support.');
    err.code='mechanism';err.mechanism={kind:'axial',dofs:1,motion:[]};
    return err;
  }

  /* --------------------------------------------------------------- solver */

  // First nonzero column of each row (the row profile). FE matrices with node-ordered DOFs are
  // banded, and a Cholesky factor has no fill outside the profile, so loops may start there:
  // the skipped terms are exact zeros and the summation order is unchanged (identical results).
  const rowStart=a=>a.map((row,i)=>{let k=0;while(k<i&&row[k]===0)k++;return k;});
  // Product with a symmetric banded matrix, visiting only each row's nonzero range, in order.
  function bandedProduct(a) {
    const lo=a.map(row=>{let k=0;while(k<row.length-1&&row[k]===0)k++;return k;});
    const hi=a.map(row=>{let k=row.length-1;while(k>0&&row[k]===0)k--;return k;});
    return x=>a.map((row,i)=>{let s=0;for(let j=lo[i];j<=hi[i];j++)s+=row[j]*x[j];return s;});
  }

  // Diagonal scaling keeps translations and rotations well conditioned.
  function factorSPD(a) {
    const n=a.length, scale=a.map((r,i)=>Math.sqrt(r[i])), l=matrix(n), start=rowStart(a);
    for(let i=0;i<n;i++) for(let j=start[i];j<=i;j++) {
      let s=a[i][j]/(scale[i]*scale[j]);
      for(let k=Math.max(start[i],start[j]);k<j;k++) s-=l[i][k]*l[j][k];
      if(i===j) {
        if(!(s>0)) throw new Error('Beam stiffness is singular or ill-conditioned; check dimensions and supports.');
        l[i][j]=Math.sqrt(s);
      } else l[i][j]=s/l[j][j];
    }
    // Last row that reaches back to column i (start is nondecreasing for node-ordered DOFs).
    const end=Array.from({length:n},(_,i)=>{let j=n-1;while(j>i&&start[j]>i)j--;return j;});
    return b=>{
      const y=zeros(n),z=zeros(n);
      for(let i=0;i<n;i++) {let s=b[i]/scale[i];for(let j=start[i];j<i;j++)s-=l[i][j]*y[j];y[i]=s/l[i][i];}
      for(let i=n-1;i>=0;i--) {let s=y[i];for(let j=i+1;j<=end[i];j++)s-=l[j][i]*z[j];z[i]=s/l[i][i];}
      return z.map((v,i)=>v/scale[i]);
    };
  }

  const selfWeightLoad=(o,props)=>({kind:'distributed',start:0,end:o.length,
    qStart:Sections.selfWeightLine(props,o.density,GRAVITY),qEnd:Sections.selfWeightLine(props,o.density,GRAVITY),selfWeight:true});

  /** Assemble and solve K u = f for a normalized model; no post-processing. */
  function assemble(o, props, loads, stations=[]) {
    const L=o.length, A=props.A, I=props.I, EI=o.E*I, eps=L*1e-10;
    // Preserve actual load coordinates; drop nearby regular mesh points to avoid
    // microscopic elements if a user enters a point nearly on a regular node.
    const forced=[0,L,...loads.flatMap(loadStations),
      ...o.supports.map(s=>s.x),...o.hinges,...stations].sort((a,b)=>a-b);
    const anchors=forced.filter((v,i)=>i===0||v-forced[i-1]>eps);
    const nodes=[...anchors];
    for(let i=1;i<o.elements;i++) {
      const x=L*i/o.elements;
      if(anchors.every(v=>Math.abs(v-x)>L/o.elements*0.04)) nodes.push(x);
    }
    nodes.sort((a,b)=>a-b);
    // Nearly coincident independent stations are numerically problematic.
    if(nodes.some((x,i)=>i>0&&x-nodes[i-1]<L*1e-7)) throw new Error('Two load, support or hinge stations are too close together; combine them or separate their locations.');
    const n=nodes.length, nodeAt=x=>nodes.findIndex(v=>Math.abs(v-x)<=eps);
    // DOFs: v at every node; one rotation per node, or a left/right pair at a hinge.
    const vDof=[],thL=[],thR=[];let nd=0;
    const hingeNode=nodes.map(x=>o.hinges.some(h=>Math.abs(h-x)<=eps));
    for(let j=0;j<n;j++) {vDof[j]=nd++;if(hingeNode[j]){thL[j]=nd++;thR[j]=nd++;}else{thL[j]=thR[j]=nd++;}}
    const elementDofs=e=>[vDof[e],thR[e],vDof[e+1],thL[e+1]];
    const K=matrix(nd),Mass=matrix(nd),F=zeros(nd);
    const gauss=[[-Math.sqrt(3/5),5/9],[0,8/9],[Math.sqrt(3/5),5/9]];
    const rho=o.density/1e9; // g/cm³ -> N s²/mm⁴ (consistent mm,N,s mass).
    for(let e=0;e<n-1;e++) {
      const a=nodes[e],h=nodes[e+1]-a,h2=h*h,k0=EI/h**3,d=elementDofs(e);
      const ke=[[12,6*h,-12,6*h],[6*h,4*h2,-6*h,2*h2],[-12,-6*h,12,-6*h],[6*h,2*h2,-6*h,4*h2]];
      for(let i=0;i<4;i++)for(let j=0;j<4;j++) K[d[i]][d[j]]+=k0*ke[i][j];
      for(const [xi,weight] of gauss) {
        const t=(xi+1)/2,x=a+t*h,N=shape(t,h),w=weight*h/2;
        let q=0;
        for(const load of loads) if(load.kind==='distributed'&&x>=load.start&&x<=load.end) q+=load.qStart+(load.qEnd-load.qStart)*(x-load.start)/(load.end-load.start);
        for(let i=0;i<4;i++) {
          F[d[i]]+=w*N[i]*q;
        }
      }
      // Curved and table loads: consistent element loads integrated on [a, a + h] (exact or round-off accurate).
      for(const load of loads) if(isProfile(load)) {
        const [lo,hi]=loadSpan(load);
        if(hi<=a+eps||lo>=a+h-eps) continue;
        const fe=Profiles.hermiteNodal(load,a,h);
        for(let i=0;i<4;i++) F[d[i]]+=fe[i];
      }
    }
    // N_i*N_j has degree six: use the exact Hermite consistent mass matrix.
    for(let e=0;e<n-1;e++) {
      const h=nodes[e+1]-nodes[e],h2=h*h,m0=rho*A*h/420,d=elementDofs(e);
      const me=[[156,22*h,54,-13*h],[22*h,4*h2,13*h,-3*h2],[54,13*h,156,-22*h],[-13*h,-3*h2,-22*h,4*h2]];
      for(let i=0;i<4;i++)for(let j=0;j<4;j++)Mass[d[i]][d[j]]+=m0*me[i][j];
    }
    for(const load of loads) if(load.kind==='point'||load.kind==='moment') {
      const j=nodeAt(load.position);
      if(j<0) throw new Error('Point load could not be located on mesh.');
      if(load.kind==='point') F[vDof[j]]+=load.force; else F[thR[j]]+=load.moment;
    }
    const fixed=[], constrained=[];
    for(const s of o.supports) {
      const j=nodeAt(s.x);
      fixed.push(vDof[j]);constrained.push({dof:vDof[j],node:j,x:s.x,type:'v',kind:s.kind});
      if(s.kind==='fixed') {fixed.push(thR[j]);constrained.push({dof:thR[j],node:j,x:s.x,type:'theta',kind:s.kind});}
    }
    const free=Array.from({length:nd},(_,i)=>i).filter(i=>!fixed.includes(i));
    const k=free.map(i=>free.map(j=>K[i][j])),m=free.map(i=>free.map(j=>Mass[i][j]));
    const backsolve=factorSPD(k),uf=backsolve(free.map(i=>F[i])),u=zeros(nd);
    free.forEach((j,i)=>u[j]=uf[i]);
    const residual=matVec(K,u).map((v,i)=>v-F[i]);
    const reactions=o.supports.map(s=>{
      const j=nodeAt(s.x);
      return {x:s.x,kind:s.kind,force:residual[vDof[j]],moment:s.kind==='fixed'?residual[thR[j]]:0};
    });
    return {nodes,n,nd,vDof,thL,thR,hingeNode,elementDofs,K,Mass,F,u,free,fixed,constrained,k,m,backsolve,residual,reactions,EI,nodeAt};
  }

  function solve(options={}) {
    const o=normalize(options);
    const props=Sections.properties(o.section);
    const L=o.length,A=props.A,I=props.I,EI=o.E*I,depth=props.depth,eps=L*1e-10;
    const sw=o.selfWeight?selfWeightLoad(o,props):null;
    const loads=sw?[...o.loads,sw]:o.loads;
    const sys=assemble(o,props,loads);
    const {nodes,n,nd,vDof,thL,thR,hingeNode,elementDofs,u,free,k,m,backsolve,reactions}=sys;

    function integrals(x) {
      let f=0,lever=0;
      for(const v of loads) if(v.kind==='distributed') {
        const t=Math.max(0,Math.min(x,v.end)-v.start),s=(v.qEnd-v.qStart)/(v.end-v.start);
        const resultant=v.qStart*t+s*t*t/2;
        f+=resultant;
        lever+=(x-v.start)*resultant-v.qStart*t*t/2-s*t*t*t/3;
      } else if(isProfile(v)) {
        const lo=loadSpan(v)[0];
        if(x>lo) {const [F,Mo]=Profiles.integrals(v,lo,x,x);f+=F;lever-=Mo;}
      }
      return [f,lever];
    }
    // Equilibrium of the part LEFT of the cut. side='right' includes actions exactly at x.
    const otherReactions=reactions.filter(r=>r.x!==0);
    function internal(x,side='right') {
      const [f,lever]=integrals(x);
      const left=reactions.find(r=>r.x===0) || {force:0,moment:0};
      let V=-left.force-f,M=left.moment-left.force*x-lever;
      const acts=a=>a<x-eps||(Math.abs(a-x)<=eps&&side==='right');
      for(const v of loads) {
        if(v.kind==='point'&&acts(v.position)) {V-=v.force;M-=v.force*(x-v.position);}
        else if(v.kind==='moment'&&acts(v.position)) M+=v.moment;
      }
      for(const r of otherReactions) if(acts(r.x)) {V-=r.force;M+=r.moment-r.force*(x-r.x);}
      return {V,M};
    }
    const nodeIndex=x=>nodes.findIndex(v=>Math.abs(v-x)<=eps);
    const stationKinds=x=>{
      const kinds=[];
      if(loads.some(v=>v.kind==='point'&&Math.abs(v.position-x)<=eps)) kinds.push('force');
      if(loads.some(v=>v.kind==='moment'&&Math.abs(v.position-x)<=eps)) kinds.push('couple');
      if(o.supports.some(s=>Math.abs(s.x-x)<=eps)) kinds.push('support');
      if(o.hinges.some(h=>Math.abs(h-x)<=eps)) kinds.push('hinge');
      return kinds;
    };
    const x=[],deflection=[],rotation=[],shear=[],moment=[],stressTop=[],stressBottom=[],shearStressMax=[];
    function sample(s,e,side,t=(s-nodes[e])/(nodes[e+1]-nodes[e])) {
      const h=nodes[e+1]-nodes[e],N=shape(t,h),Ns=slopeShape(t,h),ue=elementDofs(e).map(d=>u[d]);
      const {V,M}=internal(s,side);
      x.push(s);deflection.push(dot(N,ue));rotation.push(dot(Ns,ue));shear.push(V);moment.push(M);
      stressTop.push(-M*depth/(2*I));stressBottom.push(M*depth/(2*I));shearStressMax.push(props.shearFactor*Math.abs(V)/A);
    }
    for(let e=0;e<n-1;e++) for(let j=0;j<4;j++) {
      const s=nodes[e]+(nodes[e+1]-nodes[e])*j/4;
      if(j===0&&e>0&&stationKinds(s).length) {
        // A hinge has two rotations: take the left limit from the element on the left.
        if(hingeNode[e]) sample(s,e-1,'left',1); else sample(s,e,'left');
      }
      sample(s,e,'right');
    }
    sample(L,n-2,'left');
    const jumps=loads.filter(v=>v.kind==='point'&&v.position>0&&v.position<L).map(v=>({x:v.position,left:internal(v.position,'left').V,right:internal(v.position,'right').V}));
    const momentJumps=loads.filter(v=>v.kind==='moment'&&v.position>0&&v.position<L).map(v=>({x:v.position,left:internal(v.position,'left').M,right:internal(v.position,'right').M}));
    const resultant=integrals(L)[0]+loads.filter(v=>v.kind==='point').reduce((s,v)=>s+v.force,0);
    let appliedMoment=0;
    for(const v of loads) {
      if(v.kind==='point')appliedMoment+=v.force*v.position;
      else if(v.kind==='moment')appliedMoment+=v.moment;
      else if(v.kind==='distributed') {const h=v.end-v.start;appliedMoment+=v.start*h*(v.qStart+v.qEnd)/2+h*h*(v.qStart+2*v.qEnd)/6;}
      else {const [lo,hi]=loadSpan(v);appliedMoment+=Profiles.integrals(v,lo,hi,0)[1];}
    }
    // Key stations: every anchor, with left/right limits of V, M and theta.
    const stations=nodes.map((s,j)=>({s,j})).filter(({s})=>s===0||s===L||stationKinds(s).length||
      loads.some(v=>isDist(v)&&loadSpan(v).some(t=>Math.abs(t-s)<=eps))).map(({s,j})=>{
      const left=internal(s,'left'),right=internal(s,'right');
      return {x:s,kinds:stationKinds(s),Vleft:s===0?null:left.V,Vright:s===L?null:right.V,Mleft:s===0?null:left.M,Mright:s===L?null:right.M,
        v:u[vDof[j]],thetaLeft:s===0?null:u[thL[j]],thetaRight:s===L?null:u[thR[j]]};
    });
    const discontinuities=stations.filter(st=>st.x>0&&st.x<L&&st.kinds.length);

    const eigenvectors=[],modes=[];
    const mTimes=bandedProduct(m), kTimes=bandedProduct(k);
    // At most three modes, and never more than the free degrees of freedom (0 when everything is restrained).
    const modeCount=Math.min(3,free.length);
    if(o.modes!==false&&options.modes!==false) for(let mode=0;mode<modeCount;mode++) {
      let v=free.map((j,i)=>Math.sin((i+1)*(mode+1)*0.873)+0.25*Math.cos((i+1)*1.197));
      const orthonormalize=z=>{
        // Two passes avoid loss of orthogonality from widely separated scales.
        for(let pass=0;pass<2;pass++)for(const prior of eigenvectors) {
          const c=dot(prior,mTimes(z)); z=z.map((value,i)=>value-c*prior[i]);
        }
        const norm=Math.sqrt(dot(z,mTimes(z)));
        if(!(norm>0)) throw new Error('Modal normalization failed.');
        return z.map(value=>value/norm);
      };
      v=orthonormalize(v);
      let lambda=0,rel=Infinity;
      for(let iter=0;iter<120;iter++) {
        v=orthonormalize(backsolve(mTimes(v)));
        const kv=kTimes(v),mv=mTimes(v);lambda=dot(v,kv)/dot(v,mv);
        rel=Math.hypot(...kv.map((a,i)=>a-lambda*mv[i]))/Math.max(Math.hypot(...kv),1e-30);
        if(rel<1e-8)break;
      }
      eigenvectors.push(v);
      const whole=zeros(nd);free.forEach((j,i)=>whole[j]=v[i]);
      const shapes=x.map(s=>{
        let e=0;while(e<n-2&&nodes[e+1]<s)e++;
        const h=nodes[e+1]-nodes[e];return dot(shape((s-nodes[e])/h,h),elementDofs(e).map(d=>whole[d]));
      });
      const norm=maxAbs(shapes),peak=shapes.find(value=>Math.abs(value)>=norm*.999),sign=peak<0?-1:1;
      modes.push({frequencyHz:Math.sqrt(lambda)/(2*Math.PI),x:[...x],shape:shapes.map(a=>sign*a/norm),relativeResidual:rel});
    }
    const stability=stabilityOf(o);
    const warnings=[];
    if(L/depth<15)warnings.push('Length/depth < 15: Euler–Bernoulli shear-neglect may be inaccurate; compare a Timoshenko or solid model.');
    if(maxAbs(deflection)>L*.05)warnings.push('Deflection exceeds 5% of span: this small-displacement model may be inappropriate.');
    warnings.push(...props.slender);
    const extremeOf=a=>{let i=0;for(let j=1;j<a.length;j++)if(Math.abs(a[j])>Math.abs(a[i]))i=j;return {value:a[i],x:x[i],index:i};};
    const shapeName=props.label.toLowerCase();
    const sectionProperties={shape:props.shape,label:props.label,A,I,c:props.c,depth,width:props.width,S:props.S,
      Qna:props.Qna,bNA:props.bNA,shearFactor:props.shearFactor,junctions:props.junctions,slender:props.slender,
      massPerLength:Sections.massPerLength(props,o.density)};
    return {version:VERSION,input:o,x,deflection,rotation,shear,moment,stressTop,stressBottom,shearStressMax,
      nodes,nodalDisplacement:u,reactions,jumps,momentJumps,discontinuities,stations,modes,area:A,I,EI,massG:o.density*A*L/1000,
      section:o.section,sectionProperties,selfWeight:{enabled:o.selfWeight,q:sw?sw.qStart:0,total:sw?sw.qStart*L:0,gravity:GRAVITY},
      loadsApplied:loads.map(v=>({...v})),
      resultant,appliedMoment,equilibrium:{force:resultant+reactions.reduce((s,r)=>s+r.force,0),
        moment:appliedMoment+reactions.reduce((s,r)=>s+r.force*r.x+r.moment,0)},
      stability:{...stability,nullspace:undefined},
      dofs:{nodes:n,elements:n-1,total:nd,free:free.length,constrained:sys.constrained,hingeNodes:nodes.filter((_,j)=>hingeNode[j])},
      maxima:{deflection:maxAbs(deflection),moment:maxAbs(moment),shear:maxAbs(shear),bendingStress:maxAbs(stressTop),shearStress:maxAbs(shearStressMax),rotation:maxAbs(rotation)},
      extremes:{deflection:extremeOf(deflection),moment:extremeOf(moment),shear:extremeOf(shear),rotation:extremeOf(rotation),bendingStress:extremeOf(stressTop)},
      equations:['EI v⁗ = q','M = −EI v″','V = dM/dx','dV/dx = −q','σx = −Mz/I',`τ = VQ/(Ib); τmax = ${props.shape==='rectangle'?'3|V|/(2A)':props.shape==='circle'?'4|V|/(3A)':'k|V|/A, k = '+props.shearFactor.toFixed(3)}`,'K u = f','K φ = ω² M φ'],
      assumptions:[`Straight, prismatic ${shapeName}; homogeneous, isotropic material`,'Linear elastic, small displacement, slender beam',
        'Perfectly rigid ideal supports; local clamp/contact stresses are not resolved',
        `No torsion, transverse-shear deformation, buckling or plasticity; self-weight ${o.selfWeight?'included as ρgA':'not included'}`,
        'Transverse bending only: axial displacement is not a degree of freedom; horizontal reactions are zero for these transverse loads',
        'Up to three normalized undamped bending modes (no more than the free degrees of freedom); amplitude is arbitrary, not predicted vibration'],warnings};
  }

  /* ------------------------------------------------- statics and redundancy */

  // Moment of the applied loads LEFT of station h about h (clockwise +), i.e. M(h) without reactions.
  function appliedMomentLeftOf(loads, h, eps) {
    let M=0;
    for(const v of loads) {
      if(v.kind==='point'&&v.position<h-eps) M-=v.force*(h-v.position);
      else if(v.kind==='moment'&&v.position<h-eps) M+=v.moment;
      else if(v.kind==='distributed') {
        const t=Math.max(0,Math.min(h,v.end)-v.start),s=(v.qEnd-v.qStart)/(v.end-v.start),R=v.qStart*t+s*t*t/2;
        M-=(h-v.start)*R-v.qStart*t*t/2-s*t*t*t/3;
      } else if(isProfile(v)) {
        const lo=loadSpan(v)[0];
        if(h>lo) M+=Profiles.integrals(v,lo,h,h)[1];
      }
    }
    return M;
  }

  /**
   * Equilibrium equations in the reaction unknowns: ΣF = 0, ΣM about x = 0, and M = 0 at each
   * hinge (left part). Determinate when the system is square and full rank.
   */
  function staticsSystem(options) {
    const o=normalize(options), props=Sections.properties(o.section), L=o.length, eps=L*1e-10;
    const loads=o.selfWeight?[...o.loads,selfWeightLoad(o,props)]:o.loads;
    const unknowns=[];
    o.supports.forEach((s,i)=>{unknowns.push({support:i,x:s.x,type:'force',kind:s.kind});if(s.kind==='fixed')unknowns.push({support:i,x:s.x,type:'moment',kind:s.kind});});
    let F=0,M0=0;
    for(const v of loads) {
      if(v.kind==='point'){F+=v.force;M0+=v.force*v.position;}
      else if(v.kind==='moment') M0+=v.moment;
      else if(v.kind==='distributed') {const h=v.end-v.start;F+=h*(v.qStart+v.qEnd)/2;M0+=v.start*h*(v.qStart+v.qEnd)/2+h*h*(v.qStart+2*v.qEnd)/6;}
      else {const [lo,hi]=loadSpan(v),[f0,m0]=Profiles.integrals(v,lo,hi,0);F+=f0;M0+=m0;}
    }
    const rows=[{name:'ΣF = 0',about:null,coeffs:unknowns.map(q=>q.type==='force'?1:0),rhs:-F,applied:F},
      {name:'ΣM about x = 0',about:0,coeffs:unknowns.map(q=>q.type==='force'?q.x:1),rhs:-M0,applied:M0}];
    for(const h of o.hinges) {
      const Mh=appliedMomentLeftOf(loads,h,eps);
      rows.push({name:`M = 0 at hinge x = ${mm(h)} mm`,about:h,coeffs:unknowns.map(q=>q.x<h-eps?(q.type==='force'?-(h-q.x):1):0),rhs:-Mh,applied:Mh});
    }
    const {rank,nullspace}=rankAndNullspace(rows.map(r=>r.coeffs),unknowns.length);
    let solution=null;
    if(rank===unknowns.length&&rows.length===unknowns.length) {
      // Square, full-rank: Gauss–Jordan on [A|b].
      const a=rows.map(r=>[...r.coeffs,r.rhs]),n=unknowns.length;
      for(let c=0;c<n;c++){let p=c;for(let i=c+1;i<n;i++)if(Math.abs(a[i][c])>Math.abs(a[p][c]))p=i;[a[c],a[p]]=[a[p],a[c]];
        const pv=a[c][c];for(let j=c;j<=n;j++)a[c][j]/=pv;for(let i=0;i<n;i++)if(i!==c){const f=a[i][c];for(let j=c;j<=n;j++)a[i][j]-=f*a[c][j];}}
      solution=a.map(r=>r[n]);
    }
    return {unknowns,rows,rank,determinate:solution!==null,degree:unknowns.length-rank,selfStress:nullspace,solution,totalForce:F,totalMoment:M0};
  }

  /**
   * Force method (consistent deformations) using the same FE solver for every released case:
   * pick redundant reaction components, solve the released (primary) structure for the loads and
   * for a unit value of each redundant, and enforce the compatibility conditions
   * delta_i + sum_j f_ij X_j = 0. Returns null fields when no simple release is found.
   */
  function forceMethod(options) {
    const o=normalize(options), stability=stabilityOf(o), L=o.length, eps=L*1e-10;
    const base=solve({...o,modes:false});
    if(stability.degree===0) return {degree:0,redundants:[],primarySupports:o.supports,delta:[],flexibility:[],X:[],fe:[],mismatch:0};
    const order=[...o.supports.filter(s=>s.x>0&&s.x<L),...o.supports.filter(s=>s.x===L),...o.supports.filter(s=>s.x===0)];
    const comps=[];
    for(const s of order){if(s.kind==='fixed')comps.push({x:s.x,type:'theta',kind:s.kind});comps.push({x:s.x,type:'v',kind:s.kind});}
    let current=o.supports.map(s=>({x:s.x,kind:s.kind,v:true,theta:s.kind==='fixed'}));
    const redundants=[];
    for(const c of comps) {
      if(redundants.length===stability.degree) break;
      const sup=current.find(s=>s.x===c.x);
      if(c.type==='v'&&sup.theta) continue; // never leave a rotation-only (sliding) restraint
      const trial=current.map(s=>s.x===c.x?{...s,[c.type]:false}:s);
      if(stabilityOf(o,trial).stable){current=trial;redundants.push(c);}
    }
    if(redundants.length!==stability.degree) return {degree:stability.degree,redundants:[],unavailable:'No simple released structure was found for this arrangement; the compatibility conditions are still enforced by K u = f.'};
    const primarySupports=current.filter(s=>s.v).map(s=>({x:s.x,kind:s.theta?'fixed':s.kind==='fixed'?'pin':s.kind}));
    const primary=extra=>{
      const model={...o,supports:primarySupports,modes:false,_transverseOnly:true,...extra};
      const p=Sections.properties(model.section), oo=normalize(model);
      const loads=oo.selfWeight?[...oo.loads,selfWeightLoad(oo,p)]:oo.loads;
      // Same anchors for every released case, so each redundant station is a mesh node.
      return assemble(oo,p,loads,o.supports.map(s=>s.x));
    };
    const read=(sys,c)=>{const j=sys.nodeAt(c.x);return c.type==='v'?sys.u[sys.vDof[j]]:sys.u[sys.thR[j]];};
    const loaded=primary({});
    const delta=redundants.map(c=>read(loaded,c));
    const unit=redundants.map(c=>primary({selfWeight:false,loads:[c.type==='v'?{kind:'point',position:c.x,force:1}:{kind:'moment',position:c.x,moment:1}]}));
    const flexibility=redundants.map(ci=>unit.map(sys=>read(sys,ci)));
    // Solve F X = -delta (small dense system).
    const n=redundants.length,a=flexibility.map((r,i)=>[...r,-delta[i]]);
    for(let c=0;c<n;c++){let p=c;for(let i=c+1;i<n;i++)if(Math.abs(a[i][c])>Math.abs(a[p][c]))p=i;[a[c],a[p]]=[a[p],a[c]];
      const pv=a[c][c];for(let j=c;j<=n;j++)a[c][j]/=pv;for(let i=0;i<n;i++)if(i!==c){const f=a[i][c];for(let j=c;j<=n;j++)a[i][j]-=f*a[c][j];}}
    const X=a.map(r=>r[n]);
    const fe=redundants.map(c=>{const r=base.reactions.find(q=>Math.abs(q.x-c.x)<=eps);return c.type==='v'?r.force:r.moment;});
    const mismatch=Math.max(...X.map((v,i)=>Math.abs(v-fe[i])/Math.max(1e-12,Math.abs(fe[i]),...fe.map(Math.abs))));
    return {degree:stability.degree,redundants,primarySupports,delta,flexibility,X,fe,mismatch};
  }

  /**
   * Internal shear and moment at station x of a solved result by exact equilibrium of the part
   * left of the cut. side='left' gives the limit x⁻ (actions AT x excluded), 'right' gives x⁺.
   */
  function internalForces(result, x, side='right') {
    const L=result.input.length, eps=L*1e-10, loads=result.loadsApplied;
    let V=0,M=0;
    for(const v of loads) if(v.kind==='distributed') {
      const t=Math.max(0,Math.min(x,v.end)-v.start),s=(v.qEnd-v.qStart)/(v.end-v.start),R=v.qStart*t+s*t*t/2;
      V-=R;M-=(x-v.start)*R-v.qStart*t*t/2-s*t*t*t/3;
    } else if(isProfile(v)) {
      const lo=loadSpan(v)[0];
      if(x>lo) {const [F,Mo]=Profiles.integrals(v,lo,x,x);V-=F;M+=Mo;}
    }
    const acts=a=>a<x-eps||(Math.abs(a-x)<=eps&&side==='right');
    for(const v of loads) {
      if(v.kind==='point'&&acts(v.position)) {V-=v.force;M-=v.force*(x-v.position);}
      else if(v.kind==='moment'&&acts(v.position)) M+=v.moment;
    }
    for(const r of result.reactions) if(acts(r.x)) {V-=r.force;M+=r.moment-r.force*(x-r.x);}
    return {V,M};
  }

  /** Every field quantity at station x (left or right limit) of a solved result. */
  function fieldAt(result, x, side='right') {
    const o=result.input, L=o.length, eps=L*1e-10, nodes=result.nodes, u=result.nodalDisplacement, n=nodes.length;
    if(typeof x!=='number'||!(x>=-eps&&x<=L+eps)) throw new Error('The station must lie on the beam.');
    x=Math.min(L,Math.max(0,x));
    // Same DOF numbering as assemble(): one rotation per node, a left/right pair at a hinge node.
    const vDof=[],thL=[],thR=[];let nd=0;
    for(let j=0;j<n;j++){vDof[j]=nd++;if(o.hinges.some(h=>Math.abs(h-nodes[j])<=eps)){thL[j]=nd++;thR[j]=nd++;}else{thL[j]=thR[j]=nd++;}}
    let e=0;
    if(side==='left') while(e<n-2&&nodes[e+1]<x-eps) e++;
    else while(e<n-2&&nodes[e+1]<=x+eps) e++;
    const a=nodes[e],h=nodes[e+1]-a,t=Math.min(1,Math.max(0,(x-a)/h)),ue=[u[vDof[e]],u[thR[e]],u[vDof[e+1]],u[thL[e+1]]];
    const {V,M}=internalForces(result,x,side), p=result.sectionProperties;
    return {x,side,V,M,v:dot(shape(t,h),ue),theta:dot(slopeShape(t,h),ue),curvature:-M/result.EI,
      stressTop:-M*p.depth/(2*p.I),stressBottom:M*p.depth/(2*p.I),tauMax:p.shearFactor*Math.abs(V)/p.A};
  }

  /** Validation and stability classification without solving (for live UI status). */
  function analyze(options) {
    try {
      const o=normalize(options);
      return {ok:true,input:o,stability:{...stabilityOf(o),nullspace:undefined}};
    } catch(error) {
      return {ok:false,error:error.message,code:error.code||'invalid',mechanism:error.mechanism||null};
    }
  }

  const loadsApi=Object.freeze({isProfile,isDist,span:loadSpan,stations:loadStations,value:loadValue,portion:loadPortion,peak:loadPeak,samples:loadSamples,profiles:Profiles});
  return {VERSION,DEFAULTS,LIMITS,GRAVITY,normalize,solve,analyze,staticsSystem,forceMethod,internalForces,fieldAt,sections:Sections,loads:loadsApi};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=BeamLearningEngine;
if(typeof window!=='undefined')window.BeamLearningEngine=BeamLearningEngine;
