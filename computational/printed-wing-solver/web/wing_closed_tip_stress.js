/* Exact closed-tip geometry: section-equilibrium nominal normal stress only.
 * No displacement solution, artificial tip section, or solid-FE field is used.
 * Coordinates are aircraft x aft, y span, z up; all sections remain y=constant.
 */
const WingClosedTipStress = (() => {
  'use strict';
  const GX=[-.9602898564975363,-.7966664774136267,-.525532409916329,-.1834346424956498,.1834346424956498,.525532409916329,.7966664774136267,.9602898564975363];
  const GW=[.1012285362903763,.2223810344533745,.3137066458778873,.362683783378362,.362683783378362,.3137066458778873,.2223810344533745,.1012285362903763];
  const uniq=a=>[...new Set(a)].sort((a,b)=>a-b);
  function solve(input,tools){
    const {normalize,polyIntegrals,prescribedFlightLoads,customLine,customFraction,Geometry,GRAV=9.80665}=tools,E=tools.E;
    const {g,pla,rod,asm,load:source,crit}=normalize(input),L=g.semiSpan,chord=tools.chordAt||((g,y)=>Geometry.chordAt(g,y));
    if(g.tipChord!==0||!['elliptic','delta'].includes(g.planform))throw Error('Closed-tip normal stress requires an exact elliptic or delta zero-chord tip.');
    const zero=v=>Math.abs(v||0)<=1e-12;
    if(!zero(g.sweepDeg)||!zero(g.dihedralDeg)||!zero(Geometry.stationAt(g,0).incidenceDeg)||!zero(Geometry.stationAt(g,L).incidenceDeg)||(g.stations||[]).some(s=>!zero(s.incidenceDeg)))throw Error('Closed-tip normal stress currently requires zero user sweep, dihedral and incidence at every station.');
    if(g.rodFractions.length)throw Error('Closed-tip normal stress does not support external rods.');
    for(const [i,s]of g.spars.entries()){
      if(!['E','nu','rho','ft','fc','fs'].every(k=>Math.abs(s.material[k]-pla[k])<=1e-10*Math.max(1,Math.abs(pla[k]))))throw Error(`Closed-tip spar ${i+1} must use the same material properties as the printed shell; mixed-material union mechanics are not admitted.`);
      if(!(s.length<L))throw Error(`Closed-tip spar ${i+1} must stop at a finite hollow section inboard of the zero-area tip.`);
    }
    if(g.spars.length&&typeof E.sparParts!=='function')throw Error('Closed-tip spar geometry helper is unavailable.');
    const ribs=E.ribStations(g),seams=E.seams(g),cavityEnd=E.cavityTipLimit(g);
    if(seams.length&&!asm.seamsBonded)throw Error('Closed-tip normal stress requires bonded seams or a one-piece wing.');
    if(source.tipMass)throw Error('A mass attached at a zero-area apex needs a resolved attachment model. Move it to a finite section.');
    let base=source.kind==='flight'?prescribedFlightLoads(source,g):source.kind==='tip'?[{kind:'point',position:L,force:source.tipForce,fraction:source.tipFraction}]:source.items;
    const planformArea=(g.planform==='elliptic'?Math.PI/4:.5)*L*g.rootChord;
    // Existing flight tables are arrow-display records only. Structural integration
    // retains the exact chord law, including the elliptic endpoint square root.
    if(source.kind==='flight'&&source.distribution==='planform')base=base.map(p=>({...p,actualChordLaw:true,total:source.aircraftMass*source.loadFactor*GRAV/2}));
    if(base.some(p=>p.kind==='point'&&p.position>=L&&p.force!==0))throw Error('A point force at the zero-area apex is not admitted. Apply the load at a finite section or use a distributed load.');
    for(const[i,s]of g.spars.entries())if(s.widthMode!=='auto'&&!(s.length<cavityEnd-g.cap))throw Error(`Closed-tip fixed-width spar ${i+1} must stop inboard of the solid tip-cap region.`);
    const teChord=12*g.skin,teTransition=teChord<g.rootChord?L*(g.planform==='delta'?1-teChord/g.rootChord:Math.sqrt(1-(teChord/g.rootChord)**2)):0;
    const widthBreaks=g.spars.flatMap(s=>typeof tools.sparWidthBreaks==='function'?tools.sparWidthBreaks(g,s):typeof E.sparWidthBreaks==='function'?E.sparWidthBreaks(g,s):[]);
    const boundaries=uniq([0,L,cavityEnd,teTransition,Math.max(0,cavityEnd-g.cap),Math.min(L,g.cap),...g.spars.map(s=>s.length),...widthBreaks,...(g.stations||[]).map(s=>s.eta*L),...ribs.flatMap(y=>[Math.max(0,y-g.ribThickness/2),Math.min(L,y+g.ribThickness/2)])]);
    const sectionCache=new Map(),performanceCounters={sectionGeometryEvaluations:0,sectionTensorEvaluations:0,quadraturePointEvaluations:0,fullPanelCacheHits:0,fullPanelIntegrations:0};
    function section(y,requireTensor=false){
      if(!(y>=0&&y<L))return null;
      if(sectionCache.has(y)){const out=sectionCache.get(y);if(!requireTensor||out.tensorReady)return out;sectionCache.delete(y);}
      performanceCounters.sectionGeometryEvaluations++;
      // Only the cavity boundary is needed; omit ringLoops' torsion-mesh
      // outer-arc resampling. Intermediate straight wall nodes add no area or
      // moments, so this is the identical 120-station polygon integral.
      let inner=[];
      if(y<cavityEnd){
        if(typeof E.verticalOrdinates!=='function')inner=E.ringLoops(g,y).inner;
        else{const lower=[],upper=[],c=chord(g,y),profile=Geometry.airfoilAt(g,y);for(let i=0;i<120;i++){const u=g.cavityStart+(g.cavityEnd-g.cavityStart)*.5*(1-Math.cos(Math.PI*i/119)),x=u*c,v=E.verticalOrdinates(profile,x/c,c,g.te);if(v.upper-v.lower-2*g.skin<.8)throw Error('The material cavity is collapsed; no stress result is returned.');lower.push([x,v.lower+g.skin]);upper.push([x,v.upper-g.skin]);}inner=lower.concat(upper.reverse());}
      }
      const outer=E.outerContour(g,y,241),oi=polyIntegrals(outer),ii=polyIntegrals(inner);
      const cap=y<g.cap||y>=cavityEnd-g.cap,rib=ribs.some(q=>Math.abs(y-q)<=g.ribThickness/2),filled=cap||rib;
      const sparParts=filled?[]:E.sparParts?.(g,y)||[],sparPolygons=sparParts.flatMap(p=>p.polygons),sparIntegrals=sparPolygons.map(polyIntegrals);
      const p=oi.map((v,k)=>v-(filled?0:ii[k])+sparIntegrals.reduce((a,s)=>a+s[k],0)),A=p[0];
      if(!(A>0&&Number.isFinite(A)))throw Error(`Invalid positive-area material section at y=${y} mm.`);
      const xc=p[2]/A,zc=p[1]/A,scale=chord(g,y);
      const shellA=oi[0]-ii[0],sparA=sparIntegrals.reduce((a,p)=>a+p[0],0),extra=A-shellA-sparA;
      const out={y,A,xc,zc,scale,filled,cap,rib,shellA,sparA,capA:cap?extra:0,ribA:!cap&&rib?extra:0,tensorReady:false};
      // Mass/gravity quadrature requires area and first moments, not stiffness.
      // Recover the identical centered tensor lazily only at actual stress cuts.
      if(requireTensor){
        performanceCounters.sectionTensorEvaluations++;
        const centered=polygon=>polyIntegrals(polygon.map(q=>[(q[0]-xc)/scale,(q[1]-zc)/scale]));
        const po=centered(outer),pi=filled?[0,0,0,0,0,0]:centered(inner),sp=sparPolygons.map(centered),h=po.map((v,k)=>v-pi[k]+sp.reduce((a,s)=>a+s[k],0));
        const Izz=h[3],Ixx=h[4],Ixz=h[5],det=Ixx*Izz-Ixz*Ixz,trace=Ixx+Izz;
        if(!(scale>0&&Ixx>0&&Izz>0&&det>1e-12*trace*trace))throw Error(`The centered section tensor is singular or ill conditioned at y=${y} mm; no regularized stress is returned.`);
        Object.assign(out,{Ixx,Izz,Ixz,det,outer,sparParts,tensorReady:true});
      }
      sectionCache.set(y,out);return out;
    }
    function gauss(fn,a,b){const v=[];for(let i=0;i<8;i++){performanceCounters.quadraturePointEvaluations++;const q=fn((a+b)/2+(b-a)*GX[i]/2),w=GW[i]*(b-a)/2;for(let k=0;k<q.length;k++)v[k]=(v[k]||0)+w*q[k];}return v;}
    function integrate(fn,a,b,depth=0){
      if(!(b>a))return [0,0,0];
      const full=gauss(fn,a,b),mid=(a+b)/2,left=gauss(fn,a,mid),right=gauss(fn,mid,b),fine=left.map((v,k)=>v+right[k]);
      const okay=fine.every((v,k)=>Math.abs(v-full[k])<=2e-9*Math.max(1,Math.abs(v)));
      if(okay)return fine;
      if(depth>=16)throw Error('Closed-tip load/mass quadrature did not converge; no unverified stress is returned.');
      const u=integrate(fn,a,mid,depth+1),v=integrate(fn,mid,b,depth+1);return u.map((x,k)=>x+v[k]);
    }
    function splitIntegral(fn,a,b,breaks=boundaries){let out=null;const cuts=uniq([a,b,...breaks.filter(q=>q>a&&q<b)]);for(let i=1;i<cuts.length;i++){const v=integrate(fn,cuts[i-1],cuts[i]);if(!out)out=v;else out=out.map((x,k)=>x+v[k]);}return out||[0,0,0];}
    // With a fixed airfoil profile and no active cavity spars, every polygon vertex is
    // affine in chord on each trailing-edge branch. Area is quadratic and
    // first moments cubic in chord. Evaluate those exact polynomial identities
    // instead of rebuilding thousands of identical-topology gravity polygons.
    // Varying profiles and active cavity spars retain general polygon quadrature.
    const massModels=[],polynomialNodes=[-.75,-.25,.25,.75];
    const moments=s=>[s.A,s.A*s.xc,s.A*s.zc,s.shellA,s.ribA,s.capA,s.sparA];
    const yFromChord=c=>L*(g.planform==='delta'?1-c/g.rootChord:Math.sqrt(Math.max(0,1-(c/g.rootChord)**2)));
    function polynomialValue(model,c){const t=(c-model.center)/model.half,out=new Array(7).fill(0);for(let i=0;i<4;i++){let w=1;for(let j=0;j<4;j++)if(i!==j)w*=(t-polynomialNodes[j])/(polynomialNodes[i]-polynomialNodes[j]);for(let k=0;k<7;k++)out[k]+=w*model.values[i][k];}return out;}
    const fixedProfile=!g.stations||g.stations.every(s=>JSON.stringify(s.airfoil)===JSON.stringify(g.stations[0].airfoil));
    if(!tools.disableMassPolynomial&&fixedProfile){
      for(let i=1;i<boundaries.length;i++){
        const a=boundaries[i-1],b=boundaries[i],ca=chord(g,a),cb=chord(g,b),model={a,b,center:(ca+cb)/2,half:(ca-cb)/2};
        if(!(model.half>0))continue;
        if(g.spars.some(s=>s.length>=(a+b)/2)&&!section((a+b)/2).filled)continue;
        if(a>=cavityEnd&&ca<=teChord*(1+1e-12)){const q=(a+b)/2;model.homothetic=moments(section(q));model.chord=chord(g,q);massModels.push(model);continue;}
        if(cb===0)continue;
        model.values=polynomialNodes.map(t=>moments(section(yFromChord(model.center+model.half*t))));
        let exact=true;
        for(const t of[-.95,-.6,-.1,.1,.6,.95]){const c=model.center+model.half*t,p=polynomialValue(model,c),actual=moments(section(yFromChord(c)));if(!p.every((v,k)=>Math.abs(v-actual[k])<=2e-12*Math.max(1,Math.abs(actual[k])))){exact=false;break;}}
        if(exact)massModels.push(model);
      }
    }
    performanceCounters.exactMassPolynomialPanels=massModels.length;
    performanceCounters.exactMassPolynomialEvaluations=0;
    function massSection(y){
      const model=massModels.find(m=>y>m.a&&y<m.b);if(!model)return section(y);
      performanceCounters.exactMassPolynomialEvaluations++;
      const c=chord(g,y),ratio=model.homothetic?c/model.chord:1,p=model.homothetic?model.homothetic.map((v,k)=>v*ratio**(k===1||k===2?3:2)):polynomialValue(model,c);
      if(!(p[0]>0))return section(y);
      return {A:p[0],xc:p[1]/p[0],zc:p[2]/p[0],shellA:p[3],ribA:p[4],capA:p[5],sparA:p[6]};
    }
    const rho=pla.rho/1000,massParts=splitIntegral(y=>{const s=massSection(y);return [s.shellA,s.ribA,s.capA,s.sparA].map(a=>rho*a);},0,L);
    const mass={shell:massParts[0],ribs:massParts[1],caps:massParts[2],spars:massParts[3],rods:0,tip:0};mass.printed=mass.total=mass.shell+mass.ribs+mass.caps+mass.spars;
    const position=(p,y)=>Geometry.transformPoint(g,y,p.localPoint||[customFraction(p,y)*chord(g,y),0]);
    const loadBreaks=p=>p.kind==='table'?p.points.map(q=>q[0]):p.kind==='schrenk'?[0,L]:[p.start,p.end];
    const line=(p,y)=>p.actualChordLaw?p.total*chord(g,y)/planformArea:p.kind==='schrenk'?.5*p.total*(chord(g,y)/planformArea+4/(Math.PI*L)*Math.sqrt(Math.max(0,1-(y/L)**2))):p.kind==='distributed'?(y<p.start||y>p.end?0:p.qStart+(p.qEnd-p.qStart)*(y-p.start)/(p.end-p.start)):customLine(p,g,y);
    const loadPanelCaches=new Map(),gravityPanelCache=new Map();
    function outboardIntegral(density,a,b,y,referenceX,breaks,cache){
      const edges=uniq([a,b,...breaks.filter(q=>q>a&&q<b)]),sum=[0,0,0];
      for(let i=1;i<edges.length;i++){
        const lo=edges[i-1],hi=edges[i];let value;
        if(lo===y){
          // Keep direct local arms on the cut-containing panel: subtraction
          // of two whole-wing moments would lose the tiny apex resultants.
          value=integrate(q=>{const[f,x]=density(q);return [f,(q-y)*f,(x-referenceX)*f];},lo,hi);
        }else{
          const key=lo+':'+hi;let v=cache.get(key);
          if(v)performanceCounters.fullPanelCacheHits++;
          else{performanceCounters.fullPanelIntegrations++;v=integrate(q=>{const[f,x]=density(q);return [f,(q-lo)*f,x*f];},lo,hi);cache.set(key,v);}
          value=[v[0],v[1]+(lo-y)*v[0],v[2]-referenceX*v[0]];
        }
        for(let k=0;k<3;k++)sum[k]+=value[k];
      }
      return sum;
    }
    function sourceWrench(y,referenceX=0){
      let V=0,Mx=0,minusMy=0;
      for(const p of base){
        if(p.kind==='point'){if(p.position>=y){const P=position(p,p.position);V+=p.force;Mx+=(p.position-y)*p.force;minusMy+=(P[0]-referenceX)*p.force;}continue;}
        const bs=loadBreaks(p),a=Math.max(y,bs[0]),b=bs.at(-1);if(!(b>a))continue;
        if(!loadPanelCaches.has(p))loadPanelCaches.set(p,new Map());
        const v=outboardIntegral(q=>[line(p,q),position(p,q)[0]],a,b,y,referenceX,uniq([...boundaries,...bs]),loadPanelCaches.get(p));V+=v[0];Mx+=v[1];minusMy+=v[2];
      }
      if(source.selfWeight){const v=outboardIntegral(q=>{const s=massSection(q);return [-rho*s.A*GRAV/1000,Geometry.transformPoint(g,q,[s.xc,s.zc])[0]];},y,L,y,referenceX,boundaries,gravityPanelCache);V+=v[0];Mx+=v[1];minusMy+=v[2];}
      return {V,Mx,minusMy};
    }
    const cuts=new Map();let maxRecoveryResidual=0;
    function cutAt(y){
      if(!Number.isFinite(y)||y<0||y>L)throw Error('Stress station must lie within the physical span.');
      if(cuts.has(y))return cuts.get(y);
      if(y===L){const out={y,nominal:true,resolved:false,endZone:'tip',reason:'Zero-area apex: stress is undefined; no finite tip section is substituted.',force:[0,0,0],moment:[0,0,0],localForce:[0,0,0],localMoment:[0,0,0]};cuts.set(y,out);return out;}
      const s=section(y,true),reference=Geometry.transformPoint(g,y,[s.xc,s.zc]),w=sourceWrench(y,reference[0]);
      // Unknowns are stress coefficients for x/chord,z/chord. N=Mz=0 for global-z loads.
      const target=-w.Mx/(s.scale**3),b=-target*s.Ixz/s.det,c=target*s.Ixx/s.det;
      const recoveredX=(b*s.Ixx+c*s.Ixz)*s.scale**3,recoveredZ=(b*s.Ixz+c*s.Izz)*s.scale**3;
      const residual=Math.max(Math.abs(recoveredX),Math.abs(recoveredZ+w.Mx))/Math.max(1,Math.abs(w.Mx));maxRecoveryResidual=Math.max(maxRecoveryResidual,residual);
      if(!(residual<1e-8))throw Error('Recovered normal stress failed section moment equilibrium.');
      const out={...s,y,reference,force:[0,0,w.V],moment:[w.Mx,-w.minusMy,0],localForce:[0,0,-w.V],localMoment:[-w.minusMy,w.Mx,0],coefficientX:b,coefficientZ:c,nominal:true,resolved:true,endZone:null,recoveryResidual:residual};cuts.set(y,out);return out;
    }
    function evaluateStress(y,point,material=pla){
      const cut=cutAt(y);if(!cut.resolved)return {value:NaN,resolved:false,nominal:true,station:y,endZone:'tip',reason:cut.reason};
      const modulus=typeof material==='number'?material:material.E;
      if(!Number.isFinite(modulus)||Math.abs(modulus-pla.E)>1e-8*pla.E)throw Error('This stress-only model contains only the selected homogeneous skin/rib material.');
      const value=cut.coefficientX*(point[0]-cut.xc)/cut.scale+cut.coefficientZ*(point[1]-cut.zc)/cut.scale;
      return {value,resolved:true,nominal:true,station:y,endZone:null,reason:'Section-equilibrium nominal spanwise normal stress; local taper, rib, bond and tip concentrations are unresolved.'};
    }
    const tipStations=Array.from({length:7},(_,k)=>L*(1-10**(-k-1))),gridCount=Math.min(1001,Math.max(21,input.nGrid||5*(input.nElements||40)+1));
    const yy=uniq([...Array.from({length:gridCount},(_,i)=>L*i/(gridCount-1)),...boundaries,...base.flatMap(p=>p.kind==='point'?[p.position]:loadBreaks(p)),...tipStations]);
    const y=Float64Array.from(yy),recovered=yy.map(cutAt),tension=[],compression=[],sparStress=[];
    recovered.forEach(c=>{if(!c.resolved){tension.push(NaN);compression.push(NaN);return;}const values=c.outer.map(p=>evaluateStress(c.y,p).value);tension.push(Math.max(0,...values));compression.push(Math.max(0,...values.map(v=>-v)));for(const part of c.sparParts)part.polygons.forEach((polygon,k)=>{const v=polygon.map(p=>evaluateStress(c.y,p).value);sparStress.push({y:c.y,index:part.index,kind:['top cap','bottom cap','web'][k],material:part.s.material,tension:Math.max(0,...v),compression:Math.max(0,...v.map(x=>-x)),shear:null});});});
    const tipSamples=tipStations.map(q=>{const i=yy.indexOf(q);return {y:q,distanceToTip:L-q,chord:chord(g,q),tension:tension[i],compression:compression[i]};});
    const qtip=base.filter(p=>p.kind!=='point').reduce((v,p)=>v+line(p,L),0),qscale=Math.max(1,...base.filter(p=>p.kind!=='point').map(p=>Math.abs(line(p,L*(1-1e-6)))));
    const sqrtCoefficient=base.reduce((v,p)=>v+(p.kind==='schrenk'?.5*p.total*4/(Math.PI*L)*Math.sqrt(2/L):p.kind==='elliptic'&&p.end===L&&p.shape!=='end'?p.peak*(p.shape==='middle'?2:Math.sqrt(2))/Math.sqrt(p.end-p.start):0),0);
    const uniformDivergence=g.planform==='delta'&&Math.abs(qtip)>1e-10*qscale,sqrtDivergence=g.planform==='delta'&&!uniformDivergence&&Math.abs(sqrtCoefficient)>1e-10*qscale/Math.sqrt(L),divergent=uniformDivergence||sqrtDivergence;
    const tipBehavior={endpoint:'undefined-zero-area',status:divergent?'divergent':g.planform==='elliptic'?'vanishing-for-bounded-line-load':'limit-unclassified',samples:tipSamples,tipLineLoadNPerMm:qtip,reason:uniformDivergence?'Delta solid-tip nominal bending stress diverges as 1/(L-y) for nonzero bounded endpoint line load.':sqrtDivergence?'A noncancelling elliptic endpoint component gives unbounded nominal delta-tip bending stress; near-cancelling endpoint loads require a separate asymptotic assessment.':g.planform==='elliptic'?'For bounded line loads and no apex point force, the homothetic solid elliptic-tip nominal bending stress tends to zero; the apex itself has no stress value.':'A zero endpoint line load does not by itself determine the delta-tip limit. The displayed finite samples are not a global maximum.',globalMaximumCertified:false};
    // Display gravity as quadrature points; stress integration above remains continuous.
    const gravity=[];
    function gravityMarkers(a,b,depth=0){
      const density=q=>{const s=massSection(q),P=Geometry.transformPoint(g,q,[s.xc,s.zc]),m=rho*s.A;return [m,m*q,m*P[0]];};
      const mid=(a+b)/2,full=gauss(density,a,b),left=gauss(density,a,mid),right=gauss(density,mid,b),fine=left.map((v,k)=>v+right[k]);
      if(!fine.every((v,k)=>Math.abs(v-full[k])<=2e-9*Math.max(1,Math.abs(v)))){if(depth>=16)throw Error('Self-weight display quadrature did not converge.');gravityMarkers(a,mid,depth+1);gravityMarkers(mid,b,depth+1);return;}
      for(const[lo,hi]of[[a,mid],[mid,b]])for(let j=0;j<8;j++){const q=(lo+hi)/2+(hi-lo)*GX[j]/2,s=massSection(q),m=rho*s.A*GW[j]*(hi-lo)/2;gravity.push({kind:'point',position:q,force:-m*GRAV/1000,fraction:s.xc/chord(g,q),localPoint:[s.xc,s.zc],gravity:true,quadratureDisplay:true});}
    }
    if(source.selfWeight)for(let k=1;k<boundaries.length;k++)gravityMarkers(boundaries[k-1],boundaries[k]);
    const root=cutAt(0),applied=sourceWrench(0),displayWeight=-gravity.reduce((a,p)=>a+p.force,0),actualWeight=source.selfWeight?mass.total*GRAV/1000:0;
    const load={...source,kind:'custom',items:[...base,...gravity],sourceLoad:source,gravitySummary:source.selfWeight?{weightN:actualWeight,appliedN:applied.V+actualWeight,netN:applied.V,quadrature:'Continuous adaptive 8-point Gauss integration split at CAD cap/rib/cavity transitions; display points are quadrature markers'}:undefined};
    const limitations=['Section-equilibrium nominal spanwise normal stress on actual aircraft-y material polygons; no displacement or frame solution','Zero user sweep, dihedral and incidence only; delta planform leading-edge sweep is retained geometrically','Locally prismatic Navier stress is a beam approximation; finite taper and rib/cap transitions do not resolve 3-D concentrations','Actual CAD skin/rib/cap and integral same-material spar union is included without double counting filled sections; effective homogeneous isotropic properties','Spars have finite admitted runouts; abrupt termination stress concentrations and load transfer are unresolved','Automatic cap widths taper with actual chord down to the admitted width floor, while cap/web thicknesses remain fixed. A same-material spar inside an already solid tip is embedded material, not an additional separate I-section or extra stiffness.','Shear, torsional shear, warping, local buckling, bond/joint stresses, dynamics and overall safety certification are unavailable','The exact zero-area apex has undefined stress; finite samples are not a certified global maximum'];
    const verification={method:'Outboard load integration and polygon moment recovery',normalStressEquilibriumRelativeResidual:maxRecoveryResidual,forceBalanceResidual:root.force[2]-applied.V,momentBalanceResidual:root.moment[0]-applied.Mx,selfWeightN:actualWeight,displayQuadratureWeightN:displayWeight,displayQuadratureRelativeError:Math.abs(displayWeight-actualWeight)/Math.max(1,actualWeight),adaptiveQuadratureRelativeTolerance:2e-9,passed:maxRecoveryResidual<1e-8};
    const NaNs=()=>Float64Array.from(y,()=>NaN),V=Float64Array.from(recovered,c=>c.force[2]),M=Float64Array.from(recovered,c=>c.moment[0]),T=Float64Array.from(recovered,c=>c.moment[1]);
    const mesh={requestedElements:input.nElements||null,actualElements:0,nodeCount:0,mandatorySpanStations:boundaries,stressStations:y.length};
    const analysis3D={stressOnly:true,method:'Exact closed-tip section-equilibrium nominal normal stress (no deformation solve)',limitations,units:{length:'mm',force:'N',moment:'N mm',stress:'MPa',mass:'g'},evaluateStress,cutAt,performanceCounters,normalStress:{skinTension:tension,skinCompression:compression,spars:sparStress},resultants:recovered.map(c=>({y:c.y,force:c.force,moment:c.moment,localForce:c.localForce,localMoment:c.localMoment,endZone:c.endZone})),localM2:M,localM3:Float64Array.from(y,()=>0),localT:T,loadMapping:{endWrenches:[],method:'Original physical positions; continuous outboard wrench integration'},verification,tipBehavior,spanStations:yy,sectionSamples:[],validity:{nominalOnly:true,stressOnly:true,zeroAreaApexExcluded:true}};
    return {analysis3D,geometry:g,pla,rod,assembly:asm,load,criteria:crit,y,ySec:boundaries,sections:[],mass,V,M,T,stress:{sigTop:Float64Array.from(tension),sigBot:Float64Array.from(compression,v=>-v),spars:sparStress},ribs,seams,seamsActive:[],deflection:NaNs(),twist:NaNs(),chordwiseDeflection:NaNs(),fem:{fBending:[],fTorsion:[]},mesh,verification,tipBehavior,checks:[],governing:null,appliedForce:root.force[2],appliedMoment:root.moment[0]};
  }
  return {solve};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WingClosedTipStress;
