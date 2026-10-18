/*
 * Beam Solution — MIE 446 Beam Lab "Show the solution" builder (HTML text from a solved study).
 * Needs BeamLearningEngine and BeamDiagrams. Pure functions; the UI caches the HTML per result.
 *
 * Hand equations use the hand convention common in statics (reaction forces up +, couples
 * counter-clockwise +) and say so; the app's tables use force down + and clockwise +. The two
 * differ only in the sign of reactions. Closed-form "hand-check" formulas are shown ONLY when the
 * study is exactly one of the classic textbook cases; every other number comes from the solver:
 * equilibrium equations are formed and solved here, compatibility numbers (released-structure
 * displacements and flexibilities) are computed by the same FE solver, and the general solution
 * is always K u = f. Nothing is presented as a symbolic derivation that was not performed.
 */
const BeamSolution = (() => {
  'use strict';
  const B = typeof BeamLearningEngine!=='undefined' ? BeamLearningEngine : require('./beam_learning_engine.js');
  const D = typeof BeamDiagrams!=='undefined' ? BeamDiagrams : require('./beam_diagrams.js');
  const esc = D.esc, f = (v,s=4) => D.fmt(v,s);
  const S = (name, sub) => `${name}<sub>${esc(sub)}</sub>`;
  const frac = (num, den) => `<span class="bl-frac"><span>${num}</span><span>${den}</span></span>`;
  const eq = (lines, cls='') => `<div class="bl-eq ${cls}">${lines.map(l=>`<span class="bl-eqline">${l}</span>`).join('')}</div>`;
  const lbl = t => `<span class="lbl">${t}</span>`;
  const name = i => String.fromCharCode(65+i);
  const tiny = (v, scale) => Math.abs(v) <= 1e-9*Math.max(1, scale);
  /** Direction mark for a printed value; none when the value prints as 0. */
  const dir = (v, pos, neg) => Math.abs(v) < 1e-13 ? '' : v >= 0 ? pos : neg;
  /** Relative agreement for prose: round-off-level differences are not printed as "0". */
  const agreement = err => err<1e-12 ? 'better than 10⁻¹² (relative)' : `${f(err,2)} (relative)`;

  /** Linear combination "a·X + b·Y − c = 0" with clean signs; terms: [{c, html}], constant. */
  function linear(terms, constant=0, rhs='0') {
    let out='';
    const add=(c,html)=>{
      if(Math.abs(c)<1e-15) return;
      const mag=Math.abs(c), body=html===null?f(mag):(Math.abs(mag-1)<1e-12?html:`${f(mag)} ${html}`);
      out+=out?(c<0?' − ':' + '):(c<0?'−':'');
      out+=body;
    };
    terms.forEach(t=>add(t.c,t.html));
    add(constant,null);
    return `${out||'0'} = ${rhs}`;
  }

  /** "a − b + c" from [{sign, body}] with a clean leading sign. */
  function signedSum(terms) {
    if(!terms.length) return '0';
    return terms.map((t,k)=>(k===0?(t.sign<0?'−':''):(t.sign<0?' − ':' + '))+t.body).join('');
  }

  /** Resultant W (down +), centroid and clockwise moment about xA of each applied action. */
  function actions(loads, xA) {
    return loads.map(v=>{
      if(v.kind==='point') return {v,W:v.force,xbar:v.position,M:v.force*(v.position-xA)};
      if(v.kind==='moment') return {v,W:0,xbar:null,M:v.moment};
      const h=v.end-v.start, W=h*(v.qStart+v.qEnd)/2, M0=v.start*W+h*h*(v.qStart+2*v.qEnd)/6;
      // A load whose intensity changes sign can have zero resultant: it then acts as a pure couple.
      const zero=Math.abs(W)<=1e-12*h*Math.max(Math.abs(v.qStart),Math.abs(v.qEnd));
      return {v,W:zero?0:W,xbar:zero?null:M0/W,M:M0-(zero?0:W)*xA};
    });
  }
  /** Moment of one action about xA for an equation: (W)(arm), or the couple itself when W = 0. */
  function momentBody(a, xA) {
    return a.xbar===null?f(Math.abs(a.M)):`(${f(Math.abs(a.W))})(${f(Math.abs(a.xbar-xA))})`;
  }
  function describe(v) {
    if(v.selfWeight) return `Self-weight ρgA = ${f(v.qStart)} N/mm on 0–${f(v.end)} mm`;
    if(v.kind==='point') return `Point force ${f(Math.abs(v.force))} N ${v.force>=0?'↓':'↑'} at x = ${f(v.position)} mm`;
    if(v.kind==='moment') return `Couple ${f(Math.abs(v.moment))} N·mm ${v.moment>=0?'↻':'↺'} at x = ${f(v.position)} mm`;
    const shape=v.qStart===v.qEnd?'Uniform':v.qStart===0||v.qEnd===0?'Triangular':'Trapezoidal';
    return `${shape} ${f(v.qStart)} → ${f(v.qEnd)} N/mm on ${f(v.start)}–${f(v.end)} mm`;
  }

  /** Hand-convention equilibrium system (↑ +, ↺ + about the first support A) and its solution. */
  function handStatics(model, result) {
    const L=model.length, eps=L*1e-10, sup=model.supports, xA=sup.length?sup[0].x:0;
    const loads=result.loadsApplied, acts=actions(loads,xA);
    const unknowns=[];
    sup.forEach((s,i)=>{unknowns.push({i,x:s.x,type:'R',html:S('R',name(i))});if(s.kind==='fixed')unknowns.push({i,x:s.x,type:'M',html:S('C',name(i))});});
    const Wtot=acts.reduce((a,b)=>a+b.W,0), Mtot=acts.reduce((a,b)=>a+b.M,0);
    // ΣF↑: Σ R − Σ W = 0.   ΣM_A (↺+): Σ M + Σ R (x − xA) − Σ M_cw(loads) = 0.
    const rows=[{key:'F',coeffs:unknowns.map(u=>u.type==='R'?1:0),constant:-Wtot},
      {key:'M',coeffs:unknowns.map(u=>u.type==='R'?u.x-xA:1),constant:-Mtot}];
    for(const h of model.hinges) {
      // Left part about the hinge (↺+): Σ M_left + Σ R_left (x − h) ... a force R↑ at x < h turns the part clockwise about h.
      const left=loads.filter(v=>v.kind==='distributed'?v.start<h-eps:v.position<h-eps);
      let Mh=0;
      for(const v of left) {
        if(v.kind==='point') Mh+=v.force*(h-v.position);            // ↓ load left of h: counter-clockwise about h
        else if(v.kind==='moment') Mh-=v.moment;                    // clockwise couple: −(↺)
        else {const e=Math.min(v.end,h), t=e-v.start, s=(v.qEnd-v.qStart)/(v.end-v.start), R=v.qStart*t+s*t*t/2;
          Mh+=(h-v.start)*R-v.qStart*t*t/2-s*t*t*t/3;}
      }
      rows.push({key:'H',h,coeffs:unknowns.map(u=>u.x<h-eps?(u.type==='R'?-(h-u.x):1):0),constant:Mh});
    }
    const n=unknowns.length, A=rows.map(r=>r.coeffs);
    // rank / null space (self-equilibrated reaction sets)
    const {rank,nullspace}=rankNull(A,n);
    let solution=null;
    if(rank===n&&rows.length===n) solution=solveSquare(A,rows.map(r=>-r.constant));
    const fe=unknowns.map(u=>{const r=result.reactions[u.i];return u.type==='R'?-r.force:-r.moment;});
    return {xA,acts,unknowns,rows,rank,nullspace,solution,fe,Wtot,Mtot};
  }
  function rankNull(rows, ncol, tol=1e-10) {
    const a=rows.map(r=>[...r]), scale=Math.max(1,...a.flat().map(Math.abs)), piv=[];let r=0;
    for(let c=0;c<ncol&&r<a.length;c++){let p=r;for(let i=r+1;i<a.length;i++)if(Math.abs(a[i][c])>Math.abs(a[p][c]))p=i;
      if(Math.abs(a[p][c])<=tol*scale)continue;[a[r],a[p]]=[a[p],a[r]];const pv=a[r][c];for(let j=c;j<ncol;j++)a[r][j]/=pv;
      for(let i=0;i<a.length;i++)if(i!==r&&a[i][c]!==0){const k=a[i][c];for(let j=c;j<ncol;j++)a[i][j]-=k*a[r][j];}piv.push(c);r++;}
    const nullspace=[];for(let q=0;q<ncol;q++)if(!piv.includes(q)){const v=Array(ncol).fill(0);v[q]=1;piv.forEach((c,i)=>{v[c]=-a[i][q];});nullspace.push(v);}
    return {rank:piv.length,nullspace};
  }
  function solveSquare(A,b) {
    const n=b.length,a=A.map((r,i)=>[...r,b[i]]);
    for(let c=0;c<n;c++){let p=c;for(let i=c+1;i<n;i++)if(Math.abs(a[i][c])>Math.abs(a[p][c]))p=i;[a[c],a[p]]=[a[p],a[c]];
      const pv=a[c][c];for(let j=c;j<=n;j++)a[c][j]/=pv;for(let i=0;i<n;i++)if(i!==c){const k=a[i][c];for(let j=c;j<=n;j++)a[i][j]-=k*a[c][j];}}
    return a.map(r=>r[n]);
  }

  /* ------------------------------------------------ classic benchmarks */

  // Closed forms only for exact textbook cases (no self-weight, a single listed load).
  function benchmark(model, result) {
    if(model.selfWeight||model.hinges.length||model.loads.length!==1) return null;
    const L=model.length, EI=result.EI, v=model.loads[0], sup=model.supports, kinds=sup.map(s=>s.kind).join('-');
    const at=x=>{const i=result.x.findIndex(s=>Math.abs(s-x)<=L*1e-9);return i<0?null:result.deflection[i];};
    const full=v.kind==='distributed'&&v.start===0&&v.end===L&&v.qStart===v.qEnd, q=full?v.qStart:0;
    const P=v.kind==='point'?v.force:0, mid=v.kind==='point'&&Math.abs(v.position-L/2)<=L*1e-12;
    const ends=sup.length===2&&sup[0].x===0&&sup[1].x===L, cant=sup.length===1&&sup[0].kind==='fixed'&&(sup[0].x===0||sup[0].x===L);
    const symL=`L = ${f(L)} mm`, symEI=`EI = ${f(EI)} N·mm²`;
    if(cant&&v.kind==='point') {
      const a=Math.abs(v.position-sup[0].x), free=sup[0].x===0?L:0;
      if(Math.abs(a-L)<=L*1e-12) return {name:'Cantilever, point force at the free end',formula:`v<sub>tip</sub> = ${frac('PL³','3EI')}`,
        subst:`${frac(`(${f(P)})(${f(L)})³`,`3 (${f(EI)})`)}`,exact:P*L**3/(3*EI),fe:at(free),where:`x = ${f(free)} mm`};
      return {name:'Cantilever, point force at distance a from the clamp',formula:`v<sub>tip</sub> = ${frac('Pa²(3L − a)','6EI')}`,
        subst:frac(`(${f(P)})(${f(a)})²(3·${f(L)} − ${f(a)})`,`6 (${f(EI)})`),exact:P*a*a*(3*L-a)/(6*EI),fe:at(free),where:`x = ${f(free)} mm`};
    }
    if(cant&&full) {const free=sup[0].x===0?L:0;return {name:'Cantilever, uniform load over the whole span',formula:`v<sub>tip</sub> = ${frac('qL⁴','8EI')}`,
      subst:frac(`(${f(q)})(${f(L)})⁴`,`8 (${f(EI)})`),exact:q*L**4/(8*EI),fe:at(free),where:`x = ${f(free)} mm`};}
    if(ends&&['pin-roller','roller-pin','pin-pin'].includes(kinds)) {
      if(mid) return {name:'Simply supported, centre point force',formula:`v<sub>max</sub> = ${frac('PL³','48EI')}`,subst:frac(`(${f(P)})(${f(L)})³`,`48 (${f(EI)})`),exact:P*L**3/(48*EI),fe:at(L/2),where:`x = ${f(L/2)} mm`};
      if(full) return {name:'Simply supported, uniform load',formula:`v<sub>max</sub> = ${frac('5qL⁴','384EI')}`,subst:frac(`5 (${f(q)})(${f(L)})⁴`,`384 (${f(EI)})`),exact:5*q*L**4/(384*EI),fe:at(L/2),where:`x = ${f(L/2)} mm`};
    }
    if(ends&&kinds==='fixed-fixed') {
      if(mid) return {name:'Fixed–fixed, centre point force',formula:`v<sub>max</sub> = ${frac('PL³','192EI')}`,subst:frac(`(${f(P)})(${f(L)})³`,`192 (${f(EI)})`),exact:P*L**3/(192*EI),fe:at(L/2),where:`x = ${f(L/2)} mm`};
      if(full) return {name:'Fixed–fixed, uniform load',formula:`v<sub>max</sub> = ${frac('qL⁴','384EI')}`,subst:frac(`(${f(q)})(${f(L)})⁴`,`384 (${f(EI)})`),exact:q*L**4/(384*EI),fe:at(L/2),where:`x = ${f(L/2)} mm`};
    }
    if(ends&&full&&(kinds==='fixed-pin'||kinds==='fixed-roller'||kinds==='pin-fixed'||kinds==='roller-fixed')) {
      const prop=sup[0].kind==='fixed'?1:0;
      return {name:'Propped cantilever, uniform load (prop reaction)',formula:`R<sub>prop</sub> = ${frac('3qL','8')}`,subst:frac(`3 (${f(q)})(${f(L)})`,'8'),
        exact:3*q*L/8,fe:-result.reactions[prop].force,where:`support at x = ${f(sup[prop].x)} mm (↑)`,unit:'N'};
    }
    return null;
  }

  /* ------------------------------------------------------------- render */

  function render(model, result, opts={}) {
    const W=opts.width||760, L=model.length, EI=result.EI, props=result.sectionProperties, st=result.stability;
    const hs=handStatics(model,result), n=hs.unknowns.length, h=model.hinges.length, degree=st.degree;
    const scale=Math.max(1,...result.reactions.map(r=>Math.abs(r.force)*L),...result.reactions.map(r=>Math.abs(r.moment)));
    const supName=x=>{const i=model.supports.findIndex(s=>Math.abs(s.x-x)<=L*1e-10);return i<0?'?':name(i);};
    let html=`<div class="bl-solution">`;
    html+=`<p class="bl-sub">Worked solution for the <b>current solved study</b>. Hand equations below use <b>reaction forces ↑ positive and couples ↺ positive</b>; the app's tables use force ↓ and clockwise ↻ positive, so only the reaction signs differ. Displacement v is positive downward and θ = dv/dx is clockwise in both.</p>`;
    if(opts.assessed) html+=`<div class="bl-callout warn"><b>${esc(opts.assessed)}</b> Work the problem by hand first, then open the steps to compare.</div><details class="bl-reveal"><summary class="bl-btn">Reveal worked steps</summary>`;
    html+=`<div class="bl-steps">`;

    // 1 — physical problem
    html+=`<section><h3>The physical problem</h3>${D.beamSchematic(model,{width:W,selfWeight:result.selfWeight.enabled?{q:result.selfWeight.q}:null,label:'Step 1: physical beam with its supports and applied loads'})}
      <p>${esc(props.label)} · A = ${f(props.A)} mm² · I = ${f(props.I)} mm⁴ · c = ${f(props.c)} mm · E = ${f(model.E)} MPa · EI = ${f(EI)} N·mm²${result.selfWeight.enabled?` · self-weight ρgA = ${f(result.selfWeight.q)} N/mm (${f(result.selfWeight.total)} N in total)`:''}.</p></section>`;

    // 2 — free body
    const unknownList=model.supports.map((s,i)=>`<tr><td><b>${name(i)}</b> · x = ${f(s.x)} mm</td><td>${s.kind}</td><td>${s.kind==='fixed'?`${S('R',name(i))}, ${S('H',name(i))}, ${S('C',name(i))}`:s.kind==='pin'?`${S('R',name(i))}, ${S('H',name(i))}`:S('R',name(i))}</td></tr>`).join('');
    html+=`<section><h3>Free-body diagram: replace every support by its reactions</h3>
      ${D.freeBody(model,result,{width:W,mode:'unknown',label:'Step 2: free-body diagram with unknown reactions in assumed directions; no support symbols'})}
      <div class="bl-tablewrap"><table class="bl-table"><tr><th>Support</th><th>Type</th><th>Planar reactions</th></tr>${unknownList}</table></div>
      <p class="bl-help">A pin supplies R and H, a roller only R, a clamp R, H and a couple C (a reaction couple, not the internal moment M). This model solves <b>transverse bending only</b> (v and θ). With no axial load and no temperature change, ΣF<sub>x</sub> = 0 gives H = 0 when one support restrains axial motion${st.axialRestraints>1?`; here ${st.axialRestraints} supports restrain it, so the axial problem is itself redundant (degree ${st.axialDegree}) but still gives H = 0 for these transverse loads`:''}. Axial force and thermal stress are not solved.</p></section>`;

    // 3 — count
    const verdict=degree===0?`<b>Statically determinate</b>: ${n} unknowns and ${2+h} independent equations, so equilibrium alone gives every reaction.`
      :`<b>Statically indeterminate to degree ${degree}</b>: ${n} transverse unknowns but only ${2+h} independent equilibrium equations. ${degree} more equation${degree>1?'s':''} must come from how the beam deforms (compatibility).`;
    html+=`<section><h3>Count unknowns and equations</h3>
      ${eq([`${lbl('unknowns')} r = ${n}`,`${lbl('equations')} ΣF<sub>y</sub> = 0, ΣM = 0${h?` and M = 0 at ${h} hinge${h>1?'s':''}`:''} → ${2+h}`,`${lbl('degree')} r − ${2+h} = ${degree}`])}
      <p>${verdict}</p></section>`;

    // 4 — equilibrium with numbers
    const actRows=hs.acts.map(a=>`<tr><td>${esc(describe(a.v))}</td><td class="num">${a.v.kind==='moment'?'—':f(a.W)}</td><td class="num">${a.xbar!==null?f(a.xbar):a.v.kind==='moment'?'—':'— (W = 0: a net couple)'}</td><td class="num">${f(-a.M)}</td></tr>`).join('');
    const xA=hs.xA, Aname=model.supports.length?'A':'O';
    const detailed=hs.acts.length<=4;
    const lines=hs.rows.map(r=>{
      const terms=[];
      hs.unknowns.forEach((u,k)=>{
        const c=r.coeffs[k];
        if(Math.abs(c)<1e-15) return;
        terms.push(r.key!=='F'&&u.type==='R'?{sign:Math.sign(c),body:`(${f(Math.abs(c))}) ${u.html}`}:{sign:Math.sign(c),body:u.html});
      });
      if(detailed&&r.key==='F') hs.acts.filter(a=>Math.abs(a.W)>1e-15).forEach(a=>terms.push({sign:-Math.sign(a.W),body:f(Math.abs(a.W))}));
      else if(detailed&&r.key==='M') hs.acts.filter(a=>Math.abs(a.M)>1e-15).forEach(a=>terms.push({sign:-Math.sign(a.M),body:momentBody(a,xA)}));
      else if(Math.abs(r.constant)>1e-15) terms.push({sign:Math.sign(r.constant),body:f(Math.abs(r.constant))});
      const title=r.key==='F'?`ΣF<sub>y</sub> = 0 (↑ +)`:r.key==='M'?`ΣM<sub>${Aname}</sub> = 0 (↺ +, about x = ${f(xA)} mm)`:`M = 0 at hinge x = ${f(r.h)} mm (left part, ↺ +)`;
      return `${lbl(title)}${signedSum(terms)} = 0${r.key==='F'?' &nbsp;[N]':' &nbsp;[N, mm]'}`;
    });
    html+=`<section><h3>Equilibrium equations with your numbers</h3>
      <div class="bl-tablewrap"><table class="bl-table"><tr><th>Applied load</th><th class="num">Resultant W (N, ↓ +)</th><th class="num">Acts at x̄ (mm)</th><th class="num">Moment about ${Aname} (N·mm, ↺ +)</th></tr>${actRows||'<tr><td colspan="4">No applied load.</td></tr>'}
      <tr><td><b>Total</b></td><td class="num"><b>${f(hs.Wtot)}</b></td><td></td><td class="num"><b>${f(-hs.Mtot)}</b></td></tr></table></div>
      <p class="bl-help">A distributed load is replaced by its resultant W acting at its centroid x̄ <i>only</i> for whole-beam equilibrium; it does not give the same internal V, M or deflection.</p>
      ${eq(lines,'bl-eq-left')}`;
    if(degree===0&&hs.solution) {
      html+=solveDeterminate(model,hs);
    } else if(degree>0) {
      const N=hs.nullspace[0], big=Math.max(...N.map(Math.abs)), Nn=N.map(v=>v/big);
      const items=hs.unknowns.map((u,k)=>Math.abs(Nn[k])>1e-12?`${u.html} = ${f(Nn[k],3)}${u.type==='R'?' N':' N·mm'}`:null).filter(Boolean).join(', ');
      html+=`<div class="bl-callout"><b>Why equilibrium alone is not enough.</b> The reactions found below satisfy these ${2+h} equations — but so does the reactions plus λ times this self-balancing set, for any λ:<br><span class="num">${items}</span>.<br>It produces no net force and no net moment (with no load at all), so equilibrium cannot decide λ. ${degree>1?`There are ${degree} independent such sets.`:''} The deformation of the beam decides it.</div>`;
    }
    html+=`</section>`;

    // 5 — compatibility (indeterminate)
    if(degree>0) html+=compatibility(model,result,opts,supName,W);

    // 6 — reactions
    const rx=result.reactions.map((r,i)=>{
      const sti=result.stations.find(s=>Math.abs(s.x-r.x)<=L*1e-10)||{};
      return `<tr><td><b>${name(i)}</b> · ${r.kind} · x = ${f(r.x)} mm</td><td class="num">${f(-r.force,5)}</td><td class="num">${r.kind==='fixed'?f(-r.moment,5):'0 (free to rotate)'}</td><td class="num">${f(r.force,5)}</td><td class="num">${r.kind==='fixed'?f(r.moment,5):'0'}</td><td class="num">${r.kind==='fixed'?'0 (clamped)':f(sti.thetaRight??sti.thetaLeft,4)}</td></tr>`;
    }).join('');
    html+=`<section><h3>Reactions in their actual directions</h3>
      ${D.freeBody(model,result,{width:W,mode:'solved',label:'Step 6: free-body diagram with the solved reactions drawn in their actual directions'})}
      <div class="bl-tablewrap"><table class="bl-table"><tr><th>Support</th><th class="num">R (N, ↑ +)</th><th class="num">C (N·mm, ↺ +)</th><th class="num">App R (↓ +)</th><th class="num">App C (↻ +)</th><th class="num">θ (rad)</th></tr>${rx}</table></div>
      <p>Check: ΣF residual = ${f(result.equilibrium.force,3)} N; ΣM residual = ${f(result.equilibrium.moment,3)} N·mm (round-off only).</p></section>`;

    // 7 — internal resultants, curvature, stress, deflection
    html+=internalChain(model,result,supName);

    // 8 — K u = f
    const bm=benchmark(model,result);
    const cons=result.dofs.constrained.map(c=>`${c.type==='v'?'v':'θ'}(${f(c.x)}) = 0 <span class="bl-help">(${c.kind} ${supName(c.x)})</span>`).join('<br>');
    html+=`<section><h3>The general numerical solution: K u = f</h3>
      <p>For any supports and loads, the computer divides the beam into ${result.dofs.elements} cubic Hermite elements (every load, support and hinge station is a node). Each node has a displacement v and a rotation θ${result.dofs.hingeNodes.length?`; a hinge node has two rotations (θ⁻, θ⁺) so the moment there is released`:''}. Element stiffness matrices and consistent load vectors are assembled into</p>
      ${eq([`<b>K</b> <b>u</b> = <b>f</b>, &nbsp; ${result.dofs.total} unknown nodal values`])}
      <div class="bl-cols"><div><h4>Boundary conditions imposed (${result.dofs.constrained.length})</h4><p class="num">${cons}</p></div>
      <div><h4>What is solved</h4><p>The ${result.dofs.free} free values of <b>u</b> come from the reduced system; reactions are recovered as <b>r</b> = <b>K u</b> − <b>f</b> at the constrained values. V and M then follow exactly from equilibrium with those reactions; σ = −Mz/I and τ = VQ/(Ib) from the section. For a uniform beam the nodal values are exact (cubic elements reproduce EI v⁗ = q at the nodes).</p></div></div>
      ${bm?`<div class="bl-box"><h4>Hand-check available for this exact textbook case: ${esc(bm.name)}</h4>${eq([`${bm.formula} = ${bm.subst} = <b>${f(bm.exact)} ${bm.unit||'mm'}</b>`])}<p>Solver: ${f(bm.fe)} ${bm.unit||'mm'} at ${esc(bm.where)} (difference ${bm.fe===null?'—':f(Math.abs(bm.fe-bm.exact)/Math.max(Math.abs(bm.exact),1e-30)*100,2)+' %'}). Use closed forms only for the cases they were derived for.</p></div>`
        :`<p class="bl-help">No closed-form formula is shown because this study is not one of the classic textbook cases; the equilibrium, compatibility and K u = f results above are the solution.</p>`}
    </section>`;
    html+=`</div>${opts.assessed?'</details>':''}</div>`;
    return html;
  }

  function solveDeterminate(model, hs) {
    const sup=model.supports, n=hs.unknowns.length;
    let html='';
    // Clockwise moments of the loads about A (the ones the reactions must balance).
    const cw=hs.acts.filter(a=>Math.abs(a.M)>1e-15).map(a=>({sign:Math.sign(a.M),body:momentBody(a,hs.xA)}));
    const momentSum=hs.acts.length<=4?signedSum(cw):f(hs.Mtot);
    if(!hs.acts.length) {
      // No applied load: every equation has nothing on its load side, so every reaction is zero.
      html+=`<p>No load acts on the beam, so each equilibrium equation reads (reactions) = 0 and every reaction is zero.</p>`
        +eq([hs.unknowns.map(u=>`${u.html} = <b>0</b> ${u.type==='R'?'N':'N·mm'}`).join(', &nbsp; ')]);
    } else if(n===2&&hs.unknowns.every(u=>u.type==='R')) {
      const [a,b]=hs.unknowns, arm=b.x-a.x, Rb=hs.solution[1], Ra=hs.solution[0];
      html+=`<p>Two unknown forces: take moments about A to eliminate R<sub>A</sub>, then sum forces.</p>`+eq([
        `${S('R','B')} = ${frac(momentSum,`${f(arm)}`)} = <b>${f(Rb,5)} N</b> ${dir(Rb,'(↑)','(↓)')}`,
        `${S('R','A')} = ${f(hs.Wtot)} − (${f(Rb,5)}) = <b>${f(Ra,5)} N</b> ${dir(Ra,'(↑)','(↓)')}`]);
    } else if(n===2&&hs.unknowns[1].type==='M') {
      const R=hs.solution[0], M=hs.solution[1];
      html+=`<p>A single clamp: the force equation gives R directly and the moment equation gives the clamp couple.</p>`+eq([
        `${S('R','A')} = ΣW = <b>${f(R,5)} N</b> ${dir(R,'(↑)','(↓)')}`,
        `${S('C','A')} = ${momentSum} = <b>${f(M,5)} N·mm</b> ${dir(M,'(↺)','(↻)')}`]);
    } else {
      html+=`<p>Solving these ${n} equations simultaneously (each hinge adds one equation, M = 0, for one extra unknown):</p>`+eq([hs.unknowns.map((u,k)=>`${u.html} = <b>${f(hs.solution[k],5)}</b> ${u.type==='R'?'N':'N·mm'}`).join(', &nbsp; ')]);
    }
    const err=Math.max(...hs.solution.map((v,k)=>Math.abs(v-hs.fe[k])/Math.max(1e-12,...hs.fe.map(Math.abs))));
    html+=`<p class="bl-help">These hand values agree with the FE reactions to ${agreement(err)}.</p>`;
    return html;
  }

  function compatibility(model, result, opts, supName, W) {
    let fm;
    try {fm=opts.forceMethod||B.forceMethod({...model,elements:result.input.elements});} catch(e) {return `<section><h3>Compatibility</h3><p class="bl-err">${esc(e.message)}</p></section>`;}
    const conds=result.dofs.constrained.map(c=>`${c.type==='v'?'v':'θ'}(${f(c.x)} mm) = 0`).join(', &nbsp; ');
    let html=`<section><h3>Compatibility: the extra equations come from deformation</h3>
      <p>Every support also prescribes a displacement: <span class="num">${conds}</span>. Equilibrium cannot see these conditions; bending deformation (EI v″ = −M) links the reactions to them.</p>`;
    if(!fm.redundants.length) return html+`<p>${esc(fm.unavailable||'')}</p></section>`;
    const labelOf=c=>`${c.type==='v'?'R':'C'}<sub>${supName(c.x)}</sub>`;
    const qty=c=>c.type==='v'?`v<sub>${supName(c.x)}</sub>`:`θ<sub>${supName(c.x)}</sub>`;
    const unitD=c=>c.type==='v'?'mm':'rad', unitF=(ci,cj)=>`${ci.type==='v'?'mm':'rad'}/${cj.type==='v'?'N':'N·mm'}`;
    const primary={...model,supports:fm.primarySupports};
    // Hand convention: unit redundants act UP (force) or COUNTER-CLOCKWISE (couple).
    const fh=fm.flexibility.map(r=>r.map(v=>-v)), Xh=fm.X.map(v=>-v), feh=fm.fe.map(v=>-v);
    html+=`<p><b>Method of consistent deformations.</b> Remove ${fm.redundants.length} redundant restraint${fm.redundants.length>1?'s':''} (${fm.redundants.map(labelOf).join(', ')}) to leave a stable, determinate <i>released structure</i>:</p>
      ${D.beamSchematic(primary,{width:W,selfWeight:result.selfWeight.enabled?{q:result.selfWeight.q}:null,label:'Released (primary) structure with the applied loads; the redundant restraints are removed'})}
      <p>1. Under the applied loads the released structure moves where the support used to be:</p>
      ${eq(fm.redundants.map((c,i)=>`Δ<sub>${i+1}</sub> = ${qty(c)} (released) = <b>${f(fm.delta[i])} ${unitD(c)}</b>`))}
      <p>2. A unit redundant (1 N upward, or 1 N·mm counter-clockwise) at each released point gives the flexibility coefficients f<sub>ij</sub>:</p>
      <div class="bl-tablewrap"><table class="bl-table"><tr><th></th>${fm.redundants.map((c,j)=>`<th class="num">X<sub>${j+1}</sub> = ${labelOf(c)} = 1</th>`).join('')}</tr>
      ${fm.redundants.map((ci,i)=>`<tr><td>${qty(ci)}</td>${fh[i].map((v,j)=>`<td class="num">${f(v)} ${unitF(ci,fm.redundants[j])}</td>`).join('')}</tr>`).join('')}</table></div>
      ${fm.redundants.length>1?`<p class="bl-help">f<sub>ij</sub> = f<sub>ji</sub> (Maxwell's reciprocal theorem): ${f(fh[0][1])} vs ${f(fh[1][0])}.</p>`:''}
      <p>3. Compatibility — the real supports do not move:</p>`;
    if(fm.redundants.length===1) {
      const c=fm.redundants[0];
      html+=eq([`${qty(c)} = Δ<sub>1</sub> + f<sub>11</sub> X<sub>1</sub> = 0`,
        `X<sub>1</sub> = ${labelOf(c)} = −${frac('Δ<sub>1</sub>','f<sub>11</sub>')} = −${frac(`${f(fm.delta[0])} ${unitD(c)}`,`${f(fh[0][0])} ${unitF(c,c)}`)} = <b>${f(Xh[0],5)} ${c.type==='v'?'N':'N·mm'}</b>`]);
    } else {
      html+=eq(fm.redundants.map((c,i)=>`${qty(c)}: &nbsp; ${linear(fm.redundants.map((cj,j)=>({c:fh[i][j],html:`X<sub>${j+1}</sub>`})),fm.delta[i])}`),'bl-eq-left');
      html+=eq([fm.redundants.map((c,j)=>`X<sub>${j+1}</sub> = ${labelOf(c)} = <b>${f(Xh[j],5)}</b> ${c.type==='v'?'N':'N·mm'}`).join(', &nbsp; ')]);
    }
    html+=`<p>4. The FE solution gives ${fm.redundants.map((c,j)=>`${labelOf(c)} = ${f(feh[j],5)}`).join(', ')} — the same values (they agree to ${agreement(fm.mismatch)}). With the redundants known, the remaining reactions follow from the equilibrium equations above.</p>
      <p class="bl-help">Δ and f were computed by the same beam solver applied to the released structure. They are the numbers a hand solution would obtain from deflection tables or integration; they are not a symbolic derivation for arbitrary loads.</p></section>`;
    return html;
  }

  function internalChain(model, result, supName) {
    const L=model.length, props=result.sectionProperties, EI=result.EI, ex=result.extremes;
    const big=k=>Math.max(...result[k].map(Math.abs),1e-300);
    const zs={V:big('shear'),M:big('moment'),v:big('deflection'),t:big('rotation')};
    const z=(v,scale)=>v===null?null:Math.abs(v)<=1e-9*scale?0:v;
    const rows=result.stations.map(s0=>{
      const s={...s0,Vleft:z(s0.Vleft,zs.V),Vright:z(s0.Vright,zs.V),Mleft:z(s0.Mleft,zs.M),Mright:z(s0.Mright,zs.M),v:z(s0.v,zs.v),thetaLeft:z(s0.thetaLeft,zs.t),thetaRight:z(s0.thetaRight,zs.t)};
      const what=[...s.kinds.map(k=>k==='support'?`support ${supName(s.x)}`:k==='force'?'point force':k==='couple'?'couple':'hinge'),
        ...(s.x===0?['left end']:[]),...(s.x===L?['right end']:[])];
      const pair=(a,b,d=4)=>a===null?f(b,d):b===null?f(a,d):Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(a),Math.abs(b))?f(a,d):`${f(a,d)} | ${f(b,d)}`;
      return `<tr><td class="num">${f(s.x)}</td><td>${esc(what.join(', ')||'load boundary')}</td><td class="num">${pair(s.Vleft,s.Vright)}</td><td class="num">${pair(s.Mleft,s.Mright)}</td><td class="num">${f(s.v,4)}</td><td class="num">${pair(s.thetaLeft,s.thetaRight,4)}</td></tr>`;
    }).join('');
    const Mx=ex.moment, kappa=-Mx.value/EI, sigma=Math.abs(Mx.value)*props.c/props.I, Vx=ex.shear;
    const topState=Mx.value>0?'Compression on top, tension at the bottom (sagging)':Mx.value<0?'Tension on top, compression at the bottom (hogging)':'No bending';
    return `<section><h3>From reactions to V, M, curvature, stress and deflection</h3>
      <p>Cut the beam at x and keep the left part: V(x) is the downward force on its cut face that balances the left-part forces, and M(x) the counter-clockwise couple that balances their moments. Hence dM/dx = V and dV/dx = −q. A point force P ↓ makes V drop by P, and a support reaction R (app sign, ↓ +) is such a force: V(x⁺) − V(x⁻) = −R, so V(0⁺) = −R at a left-end support; a clockwise couple C makes M jump up by C; a hinge forces M = 0; at a pin, roller or free end M = 0 unless a couple acts there, and θ is not prescribed.</p>
      <div class="bl-tablewrap"><table class="bl-table"><tr><th class="num">x (mm)</th><th>Station</th><th class="num">V (N) left | right</th><th class="num">M (N·mm) left | right</th><th class="num">v (mm)</th><th class="num">θ (rad) left | right</th></tr>${rows}</table></div>
      <div class="bl-cols"><div>${eq([`|M|<sub>max</sub> = ${f(Math.abs(Mx.value))} N·mm at x = ${f(Mx.x)} mm`,
        `κ = v″ = −${frac('M','EI')} = −${frac(f(Mx.value),f(EI))} = ${f(kappa)} mm⁻¹`,
        `σ<sub>max</sub> = ${frac('|M| c','I')} = ${frac(`${f(Math.abs(Mx.value))} × ${f(props.c)}`,f(props.I))} = <b>${f(sigma)} MPa</b>`])}
        <p>${esc(topState)}. Curvature is largest where |M| is largest, not where the deflection is largest.</p></div>
        <div>${eq([`|V|<sub>max</sub> = ${f(Math.abs(Vx.value))} N at x = ${f(Vx.x)} mm`,
        `τ<sub>max</sub> = ${frac('|V| Q<sub>NA</sub>','I b<sub>NA</sub>')} = ${f(props.shearFactor,4)} ${frac('|V|','A')} = <b>${f(props.shearFactor*Math.abs(Vx.value)/props.A)} MPa</b>`,
        `|v|<sub>max</sub> = <b>${f(Math.abs(result.extremes.deflection.value))} mm</b> at x = ${f(result.extremes.deflection.x)} mm`])}
        <p>v(x) satisfies EI v″ = −M(x) with the support conditions listed below; integrating twice and using those conditions gives the deflection curve.</p></div></div></section>`;
  }

  return {render,handStatics,benchmark,actions,linear,frac};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=BeamSolution;
if(typeof window!=='undefined')window.BeamSolution=BeamSolution;
