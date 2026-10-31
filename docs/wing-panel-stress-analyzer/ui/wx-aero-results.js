/* Wing AeroStruct aerodynamic results plus a separate, explicit 2-D section solver below.
 * The 3-D views draw only the wing panel method's stored output:
 *  - surface Cp and p − p∞ = q∞ Cp at the panel centroids of the BASE mesh (result.base.chordwise; one solved mesh of
 *    the sequence, not extrapolated), placed on the planform from the strip edges, chords and quarter-chord points;
 *  - sectional Cp of one base-mesh strip;
 *  - spanwise lift of the delivered (extrapolated) strip load, the base mesh and every other mesh of the sequence;
 *  - extrapolated coefficients with their uncertainty, mesh convergence, consistency checks and the admission record.
 * Shown without a structural solve and withheld when the wing shape or the flow inputs changed after the solve.
 * Neither solver supplies viscosity, stall, boundary layers or streamlines. The independent 2-D solver
 * reports its own tangential velocity and is never substituted for a 3-D wing result.
 * Browser: global WingAeroStructResults.install(env). */
/* Independent 2-D linear-vorticity panel method with the INTERIOR AT REST (stream-function formulation).
 * Unit chord and unit freestream; straight panels; vortex strength gamma linear on each panel (node values).
 * Unknowns: the N + 1 node strengths (the sharp trailing edge carries a lower value gamma[0] and an upper value
 * gamma[N]) and the internal stream function psi0. Equations:
 *   psi(node i) = psi0 at the N distinct nodes: zero volume flux through every panel and no interior circulation;
 *   Kutta gamma[0] + gamma[N] = 0: equal speeds leave the edge from both surfaces;
 *   trailing-edge closure for the doubled edge node: zero interior velocity along the bisector of the edge angle at
 *   the point inside the edge at half the shorter edge-panel length.
 * Why (replacing the earlier midpoint-impermeability formulation, which left the interior flow free): at a cusp the two
 * edge panels nearly coincide, and equal and opposite strengths on them (an interior jet the old Kutta row allowed)
 * barely change the outer flow. The old solution carried gamma[0] = -gamma[N] = -452 at 160 panels on the exact
 * Joukowski airfoil (exact edge speed 0.924), hence the last-panel Cp spike. At a finite wedge it reversed the edge
 * strengths, left about 0.46 V of interior velocity in the edge wedge and a first-order lift error.
 * Surface velocity (interior at rest): v = inner flow + sheet jump = -gamma t (MachLine panel_get_velocity_jump and
 * panel_get_velocity: v = U (inner_flow + dv), adapted to 1-D). Panel Cp = 1 - |v|^2 at the panel mid-point.
 * cl, cm and pressureDrag: Cp at the mid-point times the panel length, as before. 'integrated': Cp = 1 - gamma(s)^2 is
 * quadratic on each panel; it is fitted exactly from the vertex and mid-point values and integrated, with its first
 * moment about the panel centroid (the panel couple), as MachLine's panel_get_quadratic_pressure_params,
 * panel_get_avg_pressure_coef and panel_get_moment_about_centroid do on triangles (adapted to straight 2-D panels).
 * MachLine: MIT licence, Copyright (c) 2021 USU Aero Lab (https://github.com/usuaero/MachLine; notice in
 * THIRD_PARTY_NOTICES.md). Adapted formulas only; no MachLine code is executed here.
 * Formulation references: M. Drela, XFOIL (1989) for the stream-function linear-vorticity method and an interior
 * trailing-edge condition (reference only; no XFOIL/GPL code is used); J. Katz & A. Plotkin, Low-Speed Aerodynamics,
 * 2nd ed., sec. 11.4. This is inviscid, not XFOIL's viscous formulation.
 */
window.WingAirfoilPanel2D = (() => {
  'use strict';
  const PI2 = 2 * Math.PI;
  function solveLinear(A, rhs) {
    const n=rhs.length, a=A.map((r,i)=>Float64Array.from([...r,rhs[i]]));
    for(let k=0;k<n;k++){
      let p=k;for(let i=k+1;i<n;i++)if(Math.abs(a[i][k])>Math.abs(a[p][k]))p=i;
      if(Math.abs(a[p][k])<1e-13)throw Error('Singular 2D panel system: check the section contour.');
      [a[p],a[k]]=[a[k],a[p]];
      for(let i=k+1;i<n;i++){const f=a[i][k]/a[k][k];for(let j=k+1;j<=n;j++)a[i][j]-=f*a[k][j];a[i][k]=0;}
    }
    const x=new Float64Array(n);for(let i=n-1;i>=0;i--){let s=a[i][n];for(let j=i+1;j<n;j++)s-=a[i][j]*x[j];x[i]=s/a[i][i];}return x;
  }
  // Velocity at c of the panel's unit linear sheets (strength 1 at its start node, resp. end node); analytic.
  function influences(p, c, self=false) {
    const dx=c[0]-p.a[0], dz=c[1]-p.a[1], X=dx*p.tx+dz*p.tz, Y=-dx*p.tz+dz*p.tx, L=p.length;
    let beta=self?0:Math.atan2(Y,X-L)-Math.atan2(Y,X);
    if(beta>Math.PI)beta-=PI2;if(beta< -Math.PI)beta+=PI2;
    const log=self?0:.5*Math.log((X*X+Y*Y)/((X-L)**2+Y*Y));
    const u=-beta/PI2,v=log/PI2,ub=-(X*beta-Y*log)/(L*PI2),vb=(X*log-L+Y*beta)/(L*PI2);
    const world=(u,v)=>[p.tx*u-p.tz*v,p.tz*u+p.tx*v];
    return [world(u-ub,v-vb),world(ub,vb)];
  }
  // Stream function at c of the same unit sheets: psi = -(1/2 pi) int_0^L g(s) ln r ds (r the distance to the point at s);
  // I0 = int ln r ds = F(L - X) - F(-X), F(u) = u ln(u^2 + Y^2)/2 - u + Y atan(u / Y); I1 = int s ln r ds = [G] + X I0,
  // G(u) = ((u^2 + Y^2) ln(u^2 + Y^2) - u^2) / 4. Continuous across the sheet (only the velocity jumps).
  const xlnx=w=>w>0?w*Math.log(w):0;
  function streamInfluences(p, c) {
    const dx=c[0]-p.a[0], dz=c[1]-p.a[1], X=dx*p.tx+dz*p.tz, Y=-dx*p.tz+dz*p.tx, L=p.length, Y2=Y*Y;
    const F=u=>.5*(u*u+Y2>0?u*Math.log(u*u+Y2):0)-u+(Y!==0?Y*Math.atan(u/Y):0), G=u=>.25*(xlnx(u*u+Y2)-u*u);
    const I0=F(L-X)-F(-X), I1=G(L-X)-G(-X)+X*I0;
    return [-(I0-I1/L)/PI2,-(I1/L)/PI2];
  }
  function inside(pts, c) { // even-odd rule on the closed contour
    let inn=false;for(let i=0,j=pts.length-2;i<pts.length-1;j=i++){const a=pts[i],b=pts[j];if((a[1]>c[1])!==(b[1]>c[1])&&c[0]<(b[0]-a[0])*(c[1]-a[1])/(b[1]-a[1])+a[0])inn=!inn;}return inn;
  }
  function solveCoordinates(raw, alphaDeg=0) {
    if(!Number.isFinite(alphaDeg)||Math.abs(alphaDeg)>15)throw Error('Use a 2D angle of attack between -15 and 15 degrees. Stall is not modelled.');
    let pts=raw.map(p=>[+p[0],+p[1]]);
    if(pts.length<17||pts.length>641||pts.some(p=>p.some(v=>!Number.isFinite(v))))throw Error('The 2D section needs 16–640 finite contour panels.');
    if(Math.hypot(pts[0][0]-pts.at(-1)[0],pts[0][1]-pts.at(-1)[1])>1e-7)throw Error('The 2D aerodynamic trailing edge must close.');
    let area=0;for(let i=0;i<pts.length-1;i++)area+=pts[i][0]*pts[i+1][1]-pts[i+1][0]*pts[i][1];
    if(area>0)pts.reverse(); // Clockwise contour: left normal is outward.
    const N=pts.length-1, panels=[];
    for(let i=0;i<N;i++){const a=pts[i],b=pts[i+1],L=Math.hypot(b[0]-a[0],b[1]-a[1]);if(L<1e-10)throw Error('Zero-length 2D panel.');const tx=(b[0]-a[0])/L,tz=(b[1]-a[1])/L;panels.push({a,b,length:L,tx,tz,nx:-tz,nz:tx,x:.5*(a[0]+b[0]),z:.5*(a[1]+b[1])});}
    const angle=alphaDeg*Math.PI/180, ca=Math.cos(angle),sa=Math.sin(angle), n=N+2, A=Array.from({length:n},()=>new Float64Array(n)), B=new Float64Array(n);
    // rows 0 .. N-1: psi(node i) - psi0 = -psi_inf(node i), psi_inf = z cos(alpha) - x sin(alpha)
    for(let i=0;i<N;i++){const c=pts[i];for(let j=0;j<N;j++){const s=streamInfluences(panels[j],c);A[i][j]+=s[0];A[i][j+1]+=s[1];}A[i][N+1]=-1;B[i]=-(c[1]*ca-c[0]*sa);}
    A[N][0]=A[N][N]=1; // Kutta
    // trailing-edge closure: interior bisector of the edge angle, point at half the shorter edge panel inside the edge
    const e0=[pts[1][0]-pts[0][0],pts[1][1]-pts[0][1]], e1=[pts[N-1][0]-pts[N][0],pts[N-1][1]-pts[N][1]], l0=Math.hypot(...e0), l1=Math.hypot(...e1);
    const bs=[e0[0]/l0+e1[0]/l1,e0[1]/l0+e1[1]/l1], bl=Math.hypot(...bs);
    if(!(bl>1e-6))throw Error('The trailing-edge panels fold back on each other; the edge angle is not defined.');
    const bis=[bs[0]/bl,bs[1]/bl], dTE=.5*Math.min(l0,l1), PB=[pts[0][0]+dTE*bis[0],pts[0][1]+dTE*bis[1]];
    if(!inside(pts,PB))throw Error('The trailing-edge closure point is not inside the section: check the contour near the trailing edge.');
    for(let j=0;j<N;j++){const uv=influences(panels[j],PB);for(let k=0;k<2;k++)A[N+1][j+k]+=uv[k][0]*bis[0]+uv[k][1]*bis[1];}
    B[N+1]=-(ca*bis[0]+sa*bis[1]);
    const x=solveLinear(A,B), gamma=x.subarray(0,N+1), psi0=x[N+1], rows=new Float64Array(n);let maxResidual=0;
    for(let i=0;i<n;i++){let r=-B[i];for(let j=0;j<n;j++)r+=A[i][j]*x[j];rows[i]=r;maxResidual=Math.max(maxResidual,Math.abs(r));}
    // impermeability, reported separately: mean normal velocity of each panel = (psi(b) - psi(a)) / L from the solved rows
    // (exact flux balance), and the pointwise exterior normal velocity at the panel mid-points (discretisation level)
    let fluxResidual=0,midpointNormalVelocity=0;
    for(let i=0;i<N;i++){const p=panels[i];fluxResidual=Math.max(fluxResidual,Math.abs(rows[(i+1)%N]-rows[i])/p.length);
      let vn=ca*p.nx+sa*p.nz;for(let j=0;j<N;j++){const uv=influences(panels[j],[p.x,p.z],i===j);for(let k=0;k<2;k++)vn+=gamma[j+k]*(uv[k][0]*p.nx+uv[k][1]*p.nz);}midpointNormalVelocity=Math.max(midpointNormalVelocity,Math.abs(vn));}
    maxResidual=Math.max(maxResidual,fluxResidual); // the system rows and the panel-mean normal velocity
    let Fx=0,Fz=0,My=0,mFx=0,mFz=0,mMy=0,circulation=0;
    for(let i=0;i<N;i++){const p=panels[i],ga=gamma[i],gb=gamma[i+1],gm=.5*(ga+gb);
      p.vt=-gm;p.cp=1-gm*gm;p.side=i<N/2?'lower':'upper'; // exterior tangential velocity (contour direction) and Cp at the mid-point
      // quadratic Cp(xi) = c0 + c1 xi + c2 xi^2 on xi = s / L - 1/2, exact from Cp(a), Cp(mid), Cp(b)
      const cpa=1-ga*ga,cpb=1-gb*gb,c1=cpb-cpa,c2=2*(cpa+cpb-2*p.cp),ICp=p.length*(p.cp+c2/12),Mc=p.length*p.length*c1/12;
      p.cpAverage=ICp/p.length;p.coupleAboutMidpoint=Mc;p.cpStart=cpa;p.cpEnd=cpb;
      const qx=-ICp*p.nx,qz=-ICp*p.nz;Fx+=qx;Fz+=qz;My+=p.z*qx-(p.x-.25)*qz+Mc; // exact integral; couple = int (s - L/2) Cp ds
      const mx=-p.cp*p.nx*p.length,mz=-p.cp*p.nz*p.length;mFx+=mx;mFz+=mz;mMy+=p.z*mx-(p.x-.25)*mz; // mid-point rule (published convention)
      circulation+=gm*p.length;
    }
    if(maxResidual>1e-8||panels.some(p=>!Number.isFinite(p.cp)))throw Error('The 2D panel solution failed its residual check.');
    const tauDeg=Math.acos(Math.max(-1,Math.min(1,(e0[0]*e1[0]+e0[1]*e1[1])/(l0*l1))))*180/Math.PI;
    const nodes=pts.map((c,i)=>({x:c[0],z:c[1],vt:-gamma[i],cp:1-gamma[i]*gamma[i],side:i===0?'lower trailing edge':i===N?'upper trailing edge':i<N/2?'lower':i===N/2?'leading edge':'upper'}));
    return {alphaDeg,panels,nodes,gamma:Array.from(gamma),psi0,cl:mFz*ca-mFx*sa,clCirculation:-2*circulation,cm:mMy,pressureDrag:mFx*ca+mFz*sa,
      integrated:{cl:Fz*ca-Fx*sa,cm:My,pressureDrag:Fx*ca+Fz*sa,note:'exact integral of the quadratic panel Cp, with the panel couples'},
      maxResidual,kuttaResidual:Math.abs(gamma[0]+gamma[N]),fluxResidual,midpointNormalVelocity,
      trailingEdge:{includedAngleDeg:tauDeg,closurePoint:PB,speedLower:-gamma[0],speedUpper:-gamma[N],cpNode:1-gamma[0]*gamma[0],
        note:'Node value at the panel scale. In exact potential flow a finite edge angle stagnates at the edge point itself (Cp = 1, approached like s^(2 tau/(2 pi - tau))); a cusp (tau = 0) leaves the edge at a finite speed.'},
      formulation:'linear vorticity, interior at rest (psi = psi0 at the nodes), Kutta gamma0 + gammaN = 0, interior-bisector trailing-edge closure',
      scope:'2D inviscid attached incompressible flow; no finite-wing induced drag, viscosity or stall.'};
  }
  function section(g,eta,nHalf){
    if(!Number.isFinite(eta)||eta<0||eta>1)throw Error('Section eta must be between 0 and 1.');
    if(![20,40,80,160].includes(nHalf))throw Error('Unsupported 2D panel count.');
    const ag=WingAeroPanel.aeroGeometry(g), y=eta*ag.semiSpan,st=WingGeometry.stationAt(ag,y);
    if(st.chord<1e-7)throw Error('The exact zero-chord tip is not an airfoil section. Select an inboard station.');
    const profile=WingGeometry.airfoilAt(ag,y), s=WingAirfoils.surfaces(profile,1,0,nHalf+1),pts=[];
    for(let i=nHalf;i>=0;i--)pts.push([s.xl[i],s.zl[i]]);for(let i=1;i<=nHalf;i++)pts.push([s.xu[i],s.zu[i]]);
    return {points:pts,eta,chord_mm:st.chord,incidenceDeg:st.incidenceDeg,profile};
  }
  return Object.freeze({solveCoordinates,section});
})();

window.WingAeroStructResults = (() => {
  'use strict';
  const VIEWS = [
    ['cp', 'Surface Cp · upper & lower'],
    ['dp', 'Surface p − p∞ (Pa)'],
    ['section', '3D wing · sectional Cp vs x/c'],
    ['span', 'Spanwise lift'],
    ['cl', 'Section lift coefficient cl(y)'],
    ['gamma', 'Circulation Γ(y)'],
    ['cm', 'Section pitching moment cm(y)'],
    ['te', 'Trailing-edge Cp difference'],
    ['foil2d', '2D airfoil · independent Cp'],
    ['coef', 'Solver report & load CSV'],
  ];
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  // Blue = negative limit, green = zero, red = positive limit. Only the colour mapping changes.
  const NEG = [[0, 255, 0], [0, 255, 255], [0, 0, 255]];
  const POS = [[0, 255, 0], [255, 255, 0], [255, 0, 0]];
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sig = (v, d = 4) => (v == null || !Number.isFinite(v) ? '–' : Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(2).replace('-', '−') : String(Number(v.toPrecision(d))).replace('-', '−'));
  const csvNum = (v) => (v == null || !Number.isFinite(v) ? '' : String(+v.toPrecision(10)));
  function colour(v, lo, hi, exponent = 1) {
    const neg = v < 0, ramp = neg ? NEG : POS, ratio = neg ? (lo < 0 ? Math.min(1, v / lo) : 1) : (hi > 0 ? Math.min(1, v / hi) : v > 0 ? 1 : 0), t = Math.max(0, ratio) ** exponent;
    const f = t * (ramp.length - 1), i = Math.min(ramp.length - 2, Math.floor(f)), u = f - i, c = ramp[i].map((x, k) => Math.round(x + u * (ramp[i + 1][k] - x)));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }
  // Panels of the base mesh on the planform: span y (mm) and chordwise x (mm, leading edge up). Strip edges and Cp are
  // the solver's; the leading edge and chord of a strip edge are interpolated between the strip midpoints.
  function surfaceField(base) {
    const strips = base.strips, field = base.chordwise;
    if (!Array.isArray(strips) || !Array.isArray(field) || strips.length !== field.length || strips.length < 2) return null;
    const mids = strips.map((s) => ({ y: s.yMid, le: s.quarterChordPoint_mm[0] - 0.25 * s.chord, c: s.chord }));
    const at = (y) => {
      let k = 0; while (k < mids.length - 2 && y > mids[k + 1].y) k++;
      const A = mids[k], B = mids[k + 1], t = (y - A.y) / ((B.y - A.y) || 1);
      return { le: A.le + t * (B.le - A.le), c: Math.max(0, A.c + t * (B.c - A.c)) };
    };
    const panels = [], q = base.flow.dynamicPressure_Pa;
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    strips.forEach((s, j) => {
      const A = at(s.y0), B = at(s.y1);
      for (const side of ['upper', 'lower']) {
        const pts = field[j][side].map((p, i) => ({ i, xc: p[0], cp: p[1] })).sort((a, b) => a.xc - b.xc);
        const edges = [0, ...pts.slice(1).map((p, k) => (pts[k].xc + p.xc) / 2), 1];
        pts.forEach((p, k) => {
          const poly = [[s.y0, A.le + edges[k] * A.c], [s.y1, B.le + edges[k] * B.c], [s.y1, B.le + edges[k + 1] * B.c], [s.y0, A.le + edges[k + 1] * A.c]];
          for (const [y, x] of poly) { xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); }
          const mid = at(s.yMid);
          panels.push({ side, j, k, sourceIndex: p.i, n: pts.length, xc: p.xc, cp: p.cp, dp: q * p.cp, y: s.yMid, y0: s.y0, y1: s.y1, chord: s.chord, x: mid.le + p.xc * mid.c, poly });
        });
      }
    });
    return { panels, xmin, xmax, ymin, ymax, strips: strips.length, q };
  }
  // Recreate only the base mesh geometry, with the solver's own mesh builder. No aerodynamic solve, interpolation
  // of Cp, fabricated velocities or structural surface is used. Preserve the original array index even when x/c is sorted.
  function surfaceField3D(base, geometry) {
    const f = surfaceField(base), m = base.mesh;
    if (!f || typeof WingAeroPanel === 'undefined') return null;
    const wm = WingAeroPanel.wingMesh(WingAeroPanel.aeroGeometry(geometry), {
      chordPanels: m.chordPanelsPerSurface, spanPanels: m.spanPanels,
      spanSpacing: m.spanSpacing || 'sine', tipClosure: m.tipClosure || (m.roundedTip ? 'rounded' : 'flat'),
      roundingStrips: m.roundingStrips ?? 'auto'
    });
    if (wm.ns !== base.strips.length || wm.wingPanels !== f.panels.length) throw new Error('Stored Cp and reconstructed base mesh do not match.');
    for (const p of f.panels) {
      if (Math.abs(wm.ys[p.j] - p.y0) > 1e-7 || Math.abs(wm.ys[p.j + 1] - p.y1) > 1e-7) throw new Error('Stored Cp strip boundaries do not match the base mesh.');
      const i = p.side === 'lower' ? wm.nHalf - 1 - p.sourceIndex : wm.nHalf + p.sourceIndex;
      const k = wm.index(i, p.j), o = 12 * k;
      p.vertices = Array.from({ length: 4 }, (_, v) => Array.from(wm.S.PV.slice(o + 3 * v, o + 3 * v + 3)));
      p.panelIndex = k;
    }
    const ag = WingAeroPanel.aeroGeometry(geometry), y = .35 * ag.semiSpan, c = WingGeometry.chordAt(ag, y);
    f.edges = { le: WingGeometry.transformPoint(ag, y, [0, 0]), te: WingGeometry.transformPoint(ag, y, [c, 0]), chord: c };
    return f;
  }
  function extremes(panels, key) {
    let lo = null, hi = null;
    for (const p of panels) { if (!lo || p[key] < lo[key]) lo = p; if (!hi || p[key] > hi[key]) hi = p; }
    return { lo, hi };
  }
  function displayScale(panels, key, mode = 'contrast', manualCp = null, q = 1) {
    const ex = extremes(panels, key), factor = key === 'dp' ? q : 1;
    let lo = Math.min(0, ex.lo[key]), hi = Math.max(0, ex.hi[key]);
    if (mode === 'manual' && manualCp) [lo, hi] = manualCp.map(v => v * factor);
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo > 0 || hi < 0 || lo > hi || (mode === 'manual' && lo === hi)) throw new Error('Colour limits must be finite, increasing and include zero.');
    if (lo === hi) hi = 1; // an all-zero field remains green, with a non-degenerate legend
    return { lo, hi, min: ex.lo[key], max: ex.hi[key], exponent: mode === 'contrast' ? 0.5 : 1, mode,
      below: panels.filter(p => p[key] < lo).length, above: panels.filter(p => p[key] > hi).length };
  }
  function pressureMeshCheck(result) {
    const rows = (result.levels || []).filter(l => Number.isFinite(l.diagnostics?.minCp) && Number.isFinite(l.diagnostics?.maxCp));
    const d = result.definition || {}, comparisons = [];
    for (const [direction, fixed, key] of [['chord', 'spanPanels', 'chordPanels'], ['span', 'chordPanels', 'spanPanels']]) {
      const fixedValue = direction === 'chord' ? d.baseSpan : d.baseChord;
      const line = rows.filter(l => l[fixed] === fixedValue).sort((a, b) => a[key] - b[key]);
      if (line.length < 2) continue;
      const [a, b] = line.slice(-2), changes = ['minCp', 'maxCp'].map(k => Math.abs(b.diagnostics[k] - a.diagnostics[k]) / Math.max(0.1, Math.abs(a.diagnostics[k]), Math.abs(b.diagnostics[k])));
      comparisons.push({ direction, from: a[key], to: b[key], change: Math.max(...changes) });
    }
    return { rows, comparisons, sensitive: comparisons.some(c => c.change > 0.1), certified: false };
  }
  function spanQuantities(base) {
    const qmm = base.flow.dynamicPressure_Pa * 1e-6;
    return base.strips.map(s => ({ y0:s.y0, y1:s.y1, y:s.yMid, cl:s.cl, clKJ:s.clKuttaJoukowski,
      gamma:s.gamma * 1e-3, cm:qmm > 0 && s.chord > 0 ? s.momentAboutQuarterChord_Nmm[1] / (qmm * s.chord ** 2 * (s.y1-s.y0)) : null,
      te:s.trailingEdgeDeltaCp })); // Γ: solver's (m/s)*mm -> m²/s; cm uses the projected strip reference c² Δy.
  }
  const niceStep = (span, n) => { const raw = span / n, mag = 10 ** Math.floor(Math.log10(raw)), r = raw / mag; return (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag; };

  // Match a requested geometric station to an actually solved 3-D strip.
  // No Cp is interpolated or substituted from an independent 2-D solution.
  function nearestSectionIndex(sections, y) {
    if(!Array.isArray(sections)||!sections.length||!Number.isFinite(y))return -1;
    let best=-1, distance=Infinity;
    sections.forEach((s,j)=>{const d=Math.abs(s.y_mm-y);if(Number.isFinite(d)&&d<distance){best=j;distance=d;}});
    return best;
  }
  function install(env) {
    const { el, ui, strip, view, state, openAero, exportStructureFigure, reportNode } = env;
    const select = el('select', { id: 'wxAeroView', class: 'tool', 'aria-label': 'Aerodynamic results' },
      el('option', { value: '', text: 'Aero results…' }), ...VIEWS.map(([v, t]) => el('option', { value: v, text: t })));
    const group = el('div', { class: 'wx-aero-sel', role: 'group', 'aria-label': 'Aerodynamic results' }, select);
    const title = el('h3', { id: 'wxArTitle' }), source = el('p', { class: 'wx-ar-src', id: 'wxArSource' });
    const station = el('select', { id: 'wxArStation', 'aria-label': 'Base-mesh strip for the sectional Cp', hidden: true });
    const projection = el('select', { id: 'wxArProjection', 'aria-label': 'Pressure surface view' },
      el('option', { value: '3d', text: '3D · drag to rotate' }),
      el('option', { value: 'upper', text: 'Upper surface' }),
      el('option', { value: 'lower', text: 'Lower surface' }),
      el('option', { value: 'planform', text: '2D · both surfaces' }));
    const resetView = el('button', { type: 'button', class: 'btn', text: 'Reset 3D view' });
    const panelToggle = el('button', { type: 'button', class: 'btn', id: 'wxArPanels', text: 'Show panels', 'aria-pressed': 'false' });
    const scaleMode = el('select', { id: 'wxArScale', 'aria-label': 'Pressure colour scale' },
      el('option', { value: 'contrast', text: 'Colour: Auto · contrast' }),
      el('option', { value: 'linear', text: 'Colour: Full range · linear' }),
      el('option', { value: 'manual', text: 'Colour: Manual range' }));
    const scaleMin = el('input', { id: 'wxArScaleMin', type: 'number', step: 'any', 'aria-label': 'Minimum pressure colour limit' });
    const scaleMax = el('input', { id: 'wxArScaleMax', type: 'number', step: 'any', 'aria-label': 'Maximum pressure colour limit' });
    const scaleApply = el('button', { type: 'button', class: 'btn', text: 'Apply range' });
    const scaleUnit = el('span', { class: 'wx-ar-scale-unit' });
    const scaleError = el('span', { class: 'wx-ar-scale-error', role: 'alert' });
    const manualTools = el('span', { class: 'wx-ar-manual', hidden: true }, el('label', {}, 'Min ', scaleMin), el('label', {}, 'Max ', scaleMax), scaleUnit, scaleApply, scaleError);
    const scaleStatus = el('div', { class: 'wx-ar-scale-status', role: 'status', 'aria-live': 'polite' });
    const meshSummary = el('summary', { text: 'Cp mesh check' });
    const meshBody = el('div', { class: 'wx-ar-mesh-body' });
    const meshDetails = el('details', { class: 'wx-ar-mesh', id: 'wxArMeshCheck' }, meshSummary, meshBody);
    const scaleInfo = el('div', { class: 'wx-ar-scale-info' }, scaleStatus, meshDetails);
    const clearBtn = el('button', { type: 'button', class: 'btn', id: 'wxArClear', text: 'Clear probes', hidden: true });
    const pngBtn = el('button', { type: 'button', class: 'btn', id: 'wxArPng', text: 'Export current figure (PNG)' });
    const csvBtn = el('button', { type: 'button', class: 'btn', id: 'wxArCsv', text: 'Export aerodynamic data (CSV)', disabled: true });
    const backBtn = el('button', { type: 'button', class: 'btn', id: 'wxArBack', 'aria-label': 'Close the aerodynamic result and show the structural view' }, 'Back', el('span', { class: 'wx-long', text: ' to structure view' }));
    const foilEta=el('input',{id:'wxFoilEta',type:'number',min:'0',max:'1',step:'.05',value:'.5','aria-label':'2D section span fraction eta'});
    const foilY=el('input',{id:'wxFoilY',type:'number',min:'0',step:'any','aria-label':'2D section distance from root in millimetres'});
    const foilRib=el('select',{id:'wxFoilRib','aria-label':'Choose a rib or spanwise station for the independent 2D section'});
    const foilStation=el('span',{id:'wxFoilStation',class:'note'});
    const foilAlpha=el('input',{id:'wxFoilAlpha',type:'number',min:'-15',max:'15',step:'.5',value:'4','aria-label':'2D angle of attack relative to section chord, degrees'});
    const foilN=el('select',{id:'wxFoilN','aria-label':'2D panels per surface'},...[40,80,160].map(n=>el('option',{value:String(n),text:String(n),selected:n===80})));
    const foilSolve=el('button',{type:'button',class:'btn primary',id:'wxFoilSolve',text:'Solve 2D airfoil'});
    const foilCompare3D=el('button',{type:'button',class:'btn',id:'wxFoilCompare3D',text:'3D Cp near this station',title:'Compare with an actually solved finite-wing strip; a 3D aerodynamic solve is required.'});
    const sectionCompare2D=el('button',{type:'button',class:'btn',id:'wxSectionCompare2D',text:'Independent 2D at this station',hidden:true});
    const foilControls=el('div',{class:'wx-ar-tools',id:'wxFoilControls',hidden:true},el('label',{},'Use rib / station ',foilRib),el('label',{},'Section η ',foilEta),el('label',{},'y from root (mm) ',foilY),el('label',{},'α to local chord (°) ',foilAlpha),el('label',{},'Panels / side ',foilN),foilSolve,foilCompare3D,foilStation);
    let foil2D=null,foilBusy=false,foilMessage='Choose a section and its 2D angle of attack, then press Solve 2D airfoil. A wing aerodynamic solve is not required.';
    const canvas = el('canvas', { id: 'wxArCanvas', role: 'img', tabindex: '0', 'aria-label': 'Aerodynamic result' });
    const html = el('div', { id: 'wxArHtml', class: 'wx-ar-html', hidden: true });
    // The legacy live report is moved here once. Its original IDs, station selection and CSV handler
    // stay connected even when another result is selected; it never appears in an input dropdown.
    const coefficientReport = el('div', { id: 'wxCoefficientReport' });
    const reportExport = el('button', { type: 'button', class: 'btn primary', id: 'wxReportCsv', text: 'Download aerodynamic load (CSV)' });
    reportExport.addEventListener('click', () => csvBtn.click());
    const reportHost = el('div', { id: 'wxArReport', class: 'wx-ar-html', hidden: true }, reportExport, coefficientReport);
    if (reportNode) {
      reportNode.open = false; reportNode.hidden = true;
      reportNode.querySelector('summary').textContent = 'Detailed solver output · section plots & load CSV';
      reportHost.append(reportNode);
    }
    const notice = el('div', { id: 'wxArNotice', class: 'wx-ar-notice', hidden: true });
    const probeBox = el('div', { id: 'wxArProbe', class: 'wx-ar-probe', role: 'status', 'aria-live': 'polite' });
    const overlay = el('section', { id: 'wxAeroResult', class: 'wx-aero-result', hidden: true, 'aria-label': 'Aerodynamic result view' },
      el('header', { class: 'wx-ar-head' }, el('div', { class: 'wx-ar-titles' }, title, source), el('div', { class: 'wx-ar-tools' }, projection, resetView, panelToggle, scaleMode, manualTools, station, sectionCompare2D, clearBtn, backBtn), foilControls, scaleInfo),
      el('div', { class: 'wx-ar-body' }, canvas, html, reportHost, notice), probeBox);
    const loading = view.querySelector('#loading');
    view.insertBefore(overlay, loading || null);
    let kind = '', probes = [], hits = [], sectionJ = 0, drawn = null;
    let surfaceMode = '3d', yaw = -0.32, elevation = 0.72, zoom = 1, drag = null, dragged = false, drawFrame = 0;
    let showPanels = false;
    let manualCp = null, activeScale = null;
    const scaleCache = new WeakMap(), checkCache = new WeakMap();
    function currentScale(b, key) {
      let f = scaleCache.get(b); if (!f) { f = surfaceField(b); if (f) scaleCache.set(b, f); }
      return f && displayScale(f.panels, key, scaleMode.value, manualCp, b.flow.dynamicPressure_Pa);
    }
    function syncManual(b) {
      if (!manualCp) { const v = currentScale(b, 'cp'); manualCp = [v.lo, v.hi]; }
      const factor = kind === 'dp' ? b.flow.dynamicPressure_Pa : 1;
      scaleMin.value = String(+(manualCp[0] * factor).toPrecision(8)); scaleMax.value = String(+(manualCp[1] * factor).toPrecision(8));
      scaleUnit.textContent = kind === 'dp' ? 'Pa' : 'Cp';
    }
    scaleMode.addEventListener('change', () => { scaleError.textContent = ''; const s = data(); if (s && scaleMode.value === 'manual') syncManual(s.result.base); render(); });
    function applyRange() {
      const s = data(); if (!s) return;
      const lo = Number(scaleMin.value), hi = Number(scaleMax.value);
      if (!scaleMin.value.trim() || !scaleMax.value.trim() || !Number.isFinite(lo) || !Number.isFinite(hi) || lo > 0 || hi < 0 || lo >= hi) {
        scaleError.textContent = 'Enter Min < Max, with Min ≤ 0 and Max ≥ 0.'; return;
      }
      const factor = kind === 'dp' ? s.result.base.flow.dynamicPressure_Pa : 1;
      if (!(factor > 0)) { scaleError.textContent = 'A positive dynamic pressure is needed for a range in Pa.'; return; }
      manualCp = [lo / factor, hi / factor]; scaleError.textContent = ''; render();
    }
    scaleApply.addEventListener('click', applyRange);
    for (const input of [scaleMin, scaleMax]) input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applyRange(); } });
    panelToggle.addEventListener('click', () => { showPanels = !showPanels; panelToggle.setAttribute('aria-pressed', String(showPanels)); panelToggle.textContent = showPanels ? 'Hide panels' : 'Show panels'; render(); });
    const meshCache = new WeakMap();
    const redrawSurface = () => { if (!drawFrame) drawFrame = requestAnimationFrame(() => { drawFrame = 0; const s = data(); if (s && !overlay.hidden && ['cp', 'dp'].includes(kind)) draw(canvas, s); }); };
    projection.addEventListener('change', () => {
      surfaceMode = projection.value; zoom = 1; probes = []; probeBox.textContent = '';
      if (surfaceMode === '3d') { yaw = -0.32; elevation = 0.72; }
      if (surfaceMode === 'upper') { yaw = 0; elevation = Math.PI / 2; }
      if (surfaceMode === 'lower') { yaw = 0; elevation = -Math.PI / 2; }
      render();
    });
    resetView.addEventListener('click', () => { surfaceMode = projection.value = '3d'; yaw = -0.32; elevation = 0.72; zoom = 1; render(); });

    const download = (name, blob) => { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); };
    const data = () => { const s = state(); return s.status === 'ok' ? s : null; };
    const flowText = (b) => `V ${sig(b.flow.speed)} m/s · ρ ${sig(b.flow.density)} kg/m³ · α ${sig(b.flow.alphaDeg)}° · q∞ = ½ρV² = ${sig(b.flow.dynamicPressure_Pa)} Pa`;
    // The rounded tip replaces the outermost stations of the spanwise setting with its own strips, so the solved
    // strip count (wakeStrips) is reported as it is, with the rounding strips named inside it.
    const tipStrips = (b) => { const t = b.mesh && b.mesh.roundedTip; const n = t ? (Array.isArray(t.strips) ? t.strips.length : +t.strips) : 0; return Number.isFinite(n) ? n : 0; };
    const meshText = (b) => {
      const m = b.mesh, ns = m.wakeStrips || (b.chordwise ? b.chordwise.length : 0), t = tipStrips(b);
      return `base mesh: ${m.chordPanelsPerSurface} panels per surface along the chord × ${ns} spanwise strips${t ? ` (the outer ${t} round the tip; spanwise setting ${m.spanPanels})` : ''} = ${m.wingPanels} panels`;
    };

    function show(next) {
      kind = next; select.value = next; probes = []; probeBox.textContent = '';
      overlay.hidden = !next; strip.classList.toggle('wx-aero-active', !!next); view.classList.toggle('wx-aero-on', !!next);   // phones give the result view more height
      if (!next) { pngBtn.disabled = false; pngBtn.hidden = false; csvBtn.disabled = true; }
      if (next) render();
    }
    const close = () => show('');
    let foilRibKey='';
    function syncSectionControls(){
      const g=ui.state().geometry,L=+g.semiSpan,eta=+foilEta.value;
      foilY.max=String(L);foilY.value=foilEta.value.trim()&&Number.isFinite(eta)?String(+(eta*L).toPrecision(10)):'';
      foilStation.textContent=`η = y / projected semi-span · 0 root, 1 tip · semi-span ${sig(L)} mm. Independent 2D flow, not a slice of the 3D pressure result.`;
      let ribs=[];
      try{if(typeof WingEngine!=='undefined')ribs=WingEngine.ribStations(WingEngine.makeGeometry(g));}catch(_){/* Geometry validation belongs to the existing editor. */}
      const key=JSON.stringify([L,ribs]);
      if(key!==foilRibKey){foilRibKey=key;foilRib.replaceChildren(el('option',{value:'',text:'Custom section'}),...[['Root',0],['Mid-span',L/2],['Tip',L],...ribs.map((y,i)=>[`Rib R${i+1}`,y])].map(([label,y])=>el('option',{value:String(y),text:`${label} · y ${sig(y)} mm`})));
      }
      const match=[...foilRib.options].find(o=>o.value!==''&&Math.abs(+o.value-eta*L)<1e-7*Math.max(1,L));foilRib.value=match?match.value:'';
    }
    function chooseSection(y){
      const L=+ui.state().geometry.semiSpan;if(!Number.isFinite(y)||!(L>0)||y<0||y>L)return;
      foilEta.value=String(+(y/L).toPrecision(12));probes=[];show('foil2d');foilSolve.focus();
    }
    foilCompare3D.addEventListener('click',()=>{
      const s=data();if(!s||!foilEta.value.trim())return;const requested=+foilEta.value*+ui.state().geometry.semiSpan;
      const j=nearestSectionIndex(s.result.base.chordwise,requested);if(j<0)return;
      sectionJ=j;show('section');
    });
    sectionCompare2D.addEventListener('click',()=>{
      const s=data(),section=s?.result.base.chordwise[sectionJ];if(section)chooseSection(section.y_mm);
    });
    foilRib.addEventListener('change',()=>{if(foilRib.value!=='')chooseSection(+foilRib.value);});
    foilY.addEventListener('change',()=>{if(foilY.value.trim())chooseSection(+foilY.value);});
    window.addEventListener?.('wing-open-2d-section',e=>chooseSection(e.detail?.y));
    const foilInputKey=()=>JSON.stringify([ui.state().geometry,foilEta.value,foilAlpha.value,foilN.value]);
    const foilCurrent=()=>foil2D&&foil2D.key===foilInputKey();
    foilSolve.addEventListener('click',async()=>{
      if(foilBusy)return;foilBusy=true;foilSolve.disabled=true;foilMessage='Solving the 2D section and its half-density mesh…';render();
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      try{
        if(!foilEta.value.trim()||!foilAlpha.value.trim())throw Error('Enter section η and a 2D angle of attack.');
        const key=foilInputKey(),n=+foilN.value,sec=window.WingAirfoilPanel2D.section(ui.state().geometry,+foilEta.value,n),coarse=window.WingAirfoilPanel2D.section(ui.state().geometry,+foilEta.value,n/2);
        const r=window.WingAirfoilPanel2D.solveCoordinates(sec.points,+foilAlpha.value),old=window.WingAirfoilPanel2D.solveCoordinates(coarse.points,+foilAlpha.value);
        foil2D={...r,section:sec,coarse:old,key,n};foilMessage='';probes=[];
      }catch(e){foil2D=null;foilMessage=e.message;}
      finally{foilBusy=false;foilSolve.disabled=false;render();}
    });
    for(const e of [foilEta,foilAlpha,foilN])e.addEventListener('change',()=>{probes=[];render();});
    select.addEventListener('change', () => show(select.value));
    backBtn.addEventListener('click', () => { close(); select.focus(); });
    for (const b of strip.querySelectorAll('[data-plot]')) b.addEventListener('click', close, true);
    const more = strip.querySelector('#wingMoreResults'); if (more) more.addEventListener('change', () => { if (more.value) close(); }, true);
    clearBtn.addEventListener('click', () => { probes = []; probeBox.textContent = ''; render(); });
    station.addEventListener('change', () => { sectionJ = +station.value; probes = []; render(); });

    function setNotice(text, withButton) {
      canvas.hidden = true; html.hidden = true; notice.hidden = false; notice.replaceChildren(el('p', { text }));
      if (withButton) { const b = el('button', { type: 'button', class: 'btn primary', text: 'Open Aerodynamics' }); b.addEventListener('click', () => openAero()); notice.append(b); }
      sectionCompare2D.hidden=true;for (const b of [pngBtn, csvBtn, clearBtn]) b.disabled = true; station.hidden = true; projection.hidden = true; resetView.hidden = true; panelToggle.hidden = true; scaleMode.hidden = true; manualTools.hidden = true; scaleInfo.hidden = true; probeBox.textContent = '';
    }
    function render() {
      if (!kind || overlay.hidden) return;
      const label = (VIEWS.find(([v]) => v === kind) || [, ''])[1];
      title.textContent = label;
      reportHost.hidden = true; reportExport.disabled = true;
      foilControls.hidden=kind!=='foil2d';sectionCompare2D.hidden=kind!=='section';
      if(kind==='foil2d'){renderFoil();return;}
      const s = state();
      if (s.status === 'none') { source.textContent = 'No aerodynamic solution in this session.'; setNotice('Open Aerodynamics, set the flow conditions and press Solve Aerodynamics. These results do not need a structural solve.', true); return; }
      if (s.status === 'running') { source.textContent = 'Solving the aerodynamic mesh sequence…'; setNotice('The aerodynamic solve is running; the result appears here when it finishes.', false); return; }
      if (s.status === 'stale') { source.textContent = 'Out of date: ' + s.why + '.'; setNotice(`These aerodynamic results belong to an earlier ${/flow/.test(s.why) ? 'set of flow inputs' : 'wing shape'} and are withheld. Press Solve Aerodynamics to compute the current case.`, true); return; }
      const { result, combined } = s, b = result.base;
      notice.hidden = true; pngBtn.disabled = false; csvBtn.disabled = false;
      station.hidden = kind !== 'section'; clearBtn.hidden = kind === 'coef'; clearBtn.disabled = !probes.length;
      projection.hidden = !['cp', 'dp'].includes(kind); resetView.hidden = projection.hidden || surfaceMode === 'planform';
      panelToggle.hidden = projection.hidden;
      scaleMode.hidden = projection.hidden; manualTools.hidden = projection.hidden || scaleMode.value !== 'manual'; scaleInfo.hidden = projection.hidden;
      if (!projection.hidden) {
        const key = kind === 'dp' ? 'dp' : 'cp', unit = key === 'dp' ? 'Pa' : 'Cp';
        activeScale = currentScale(b, key); if (!manualTools.hidden) syncManual(b);
        const v = activeScale, clipped = v.below + v.above;
        scaleStatus.textContent = `${v.exponent === 0.5 ? 'Auto contrast · √ colour mapping · full range' : v.mode === 'manual' ? 'Manual · linear colour mapping' : 'Full range · linear colour mapping'}. True min ${sig(v.min)}, max ${sig(v.max)} ${unit}.${clipped ? ` Hatched panels outside range: ${v.below} below, ${v.above} above (one semi-wing). Probes and CSV keep the actual values.` : ' No values clipped.'}`;
        let check = checkCache.get(result); if (!check) { check = pressureMeshCheck(result); checkCache.set(result, check); }
        meshSummary.textContent = check.sensitive ? 'Cp mesh check · peaks are mesh-sensitive' : 'Cp mesh check · local peaks not certified';
        meshBody.innerHTML = `<p>Global lift convergence does not certify local pressure peaks. Extrema below are from each whole solved aerodynamic mesh; their panel locations can move with refinement.</p><div class="wae-scroll"><table><thead><tr><th>Chord × span setting</th><th>Min Cp</th><th>Max Cp</th></tr></thead><tbody>${check.rows.map(l => `<tr><td>${l.chordPanels} × ${l.spanPanels}</td><td>${sig(l.diagnostics.minCp)}</td><td>${sig(l.diagnostics.maxCp)}</td></tr>`).join('')}</tbody></table></div><p>${check.comparisons.map(c => `${c.direction}: ${c.from} → ${c.to}, extrema change ${sig(100 * c.change, 3)}%`).join('; ') || 'No comparable mesh refinements stored.'}. ${check.sensitive ? 'Changes exceed 10% on the last refinement in at least one direction; inspect the tip/edge peak with a finer sequence.' : 'This is an extrema sensitivity check, not a local Cp convergence certificate.'}</p>`;
      }
      canvas.style.touchAction = !projection.hidden && surfaceMode !== 'planform' ? 'none' : 'auto';
      canvas.style.cursor = !projection.hidden && surfaceMode !== 'planform' ? 'grab' : 'crosshair';
      pngBtn.hidden = kind === 'coef';
      if (kind === 'coef') { canvas.hidden = true; html.hidden = true; reportHost.hidden = false; reportExport.disabled = csvBtn.disabled; source.textContent = `${result.label} · ${flowText(b)}`; renderCoefficients(s); probeBox.textContent = ''; return; }
      html.hidden = true; canvas.hidden = false;
      if (kind === 'section') {
        station.replaceChildren(...b.chordwise.map((c, j) => el('option', { value: String(j), text: `Strip ${j + 1} · y = ${sig(c.y_mm)} mm (η ${sig(c.y_mm / (b.reference.span_mm / 2), 3)})${b.mesh?.roundedTip && c.y_mm >= b.mesh.roundedTip.start_mm ? ' · rounded tip: unvalidated Cp' : ''}` })));
        sectionJ = Math.min(sectionJ, b.chordwise.length - 1); station.value = String(sectionJ);
      }
      if (kind === 'span') {
        const fz = combined.rootWrench[2], cl = combined.coefficients.CL;
        source.textContent = `Semi-wing lift ${sig(fz.value)} ± ${sig(fz.uncertainty, 2)} N extrapolated (finest meshes ${sig(fz.finest)} N, base mesh ${sig(fz.base)} N); both halves ${sig(2 * fz.value)} N; CL ${sig(cl.value)} ± ${sig(cl.uncertainty, 2)}. ${combined.structuralLoadAvailable === false ? 'Solid: base aerodynamic mesh; grey: the other meshes. No structural strip load has been generated for this zero-chord tip.' : `Solid: strip load delivered to the structure (extrapolated over all ${result.levels.length} meshes); dashed: base mesh; grey: the other meshes.`} ${flowText(b)}.`;
      } else if (kind === 'section') {
        source.textContent = `Finite-wing 3D pressure at solved strip y = ${sig(b.chordwise[sectionJ].y_mm)} mm; includes the model's downwash and spanwise interaction. This is not an isolated 2D airfoil solve. Cp < 0 is suction. ${flowText(b)}.`;
        if (b.mesh?.roundedTip && b.chordwise[sectionJ]?.y_mm >= b.mesh.roundedTip.start_mm) source.textContent += ' Rounded-tip sample: local Cp and the trailing-edge peak are unvalidated. Values are preserved; inspect the mesh check and inboard sections.';
      } else if (['cl', 'gamma', 'cm', 'te'].includes(kind)) {
        source.textContent = `Semi-wing strip samples of the ${meshText(b)}; these local values are not extrapolated. ${kind === 'te' ? 'Cp upper − Cp lower at the last panel centroids near the trailing edge; the Kutta condition requires equality at the edge, not Cp = 0.' : kind === 'gamma' ? 'Wake circulation from the solved doublet jump (m²/s).' : kind === 'cm' ? 'Pitching moment about each strip quarter chord; body +y moment is nose-up, divided by q∞ c² Δy.' : 'Pressure-integrated cl compared with 2Γ/(V c) from the solved wake.'} ${flowText(b)}.`;
        if(b.mesh?.roundedTip)source.textContent+=` Rounded-tip zone: y ≥ ${sig(b.mesh.roundedTip.start_mm,5)} mm. Abrupt local Cp/cm changes there are not validated physical predictions; use the inboard sections and the mesh checks.`;
      } else {
        const f = surfaceField(b), key = kind === 'dp' ? 'dp' : 'cp', ex = f ? extremes(f.panels, key) : null, at = (p) => `${p.side} surface, y ${sig(p.y, 4)} mm, x/c ${sig(p.xc, 3)}`;
        source.textContent = `Panel-centroid values of the ${meshText(b)} (one solved mesh of the ${result.sequence} sequence, not extrapolated${combined.structuralLoadAvailable === false ? '; no structural load generated' : '; the delivered structural load is extrapolated'}). ${ex ? `Minimum ${sig(ex.lo[key])} (${at(ex.lo)}); maximum ${sig(ex.hi[key])} (${at(ex.hi)}). ` : ''}${flowText(b)}.`;
      }
      draw(canvas, s);
    }
    function sizeCanvas(c) {
      const r = c.parentElement.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.max(280, Math.floor(r.width)), H = Math.max(220, Math.floor(r.height));
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);   // CSS size follows the container (100%)
      const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return { ctx, W, H };
    }
    function draw(c, s, exportSize) {
      const { ctx, W, H } = exportSize ? exportSize : sizeCanvas(c);
      ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
      let top = 0;
      if (exportSize) {   // the image carries its own title, case and source
        ctx.fillStyle = '#14212e'; ctx.font = `700 22px ${FONT}`; ctx.fillText(exportSize.title, 24, 34);
        ctx.font = `14px ${FONT}`; ctx.fillStyle = '#4e5f71'; top = Math.max(96, wrapText(ctx, exportSize.source, 24, 58, W - 48, 18) + 12);
      }
      if (kind === 'cp' || kind === 'dp') {
        if (surfaceMode === 'planform') drawSurface(ctx, W, H, top, s, !exportSize);
        else drawSurface3D(ctx, W, H, top, s, !exportSize);
      }
      else if (kind === 'section') drawSection(ctx, W, H, top, s, !exportSize);
      else if (kind === 'span') drawSpan(ctx, W, H, top, s, !exportSize);
      else if (['cl', 'gamma', 'cm', 'te'].includes(kind)) drawMetric(ctx, W, H, top, s, !exportSize);
      else if (kind === 'foil2d') drawFoil(ctx,W,H,top,!exportSize);
    }
    function wrapText(ctx, text, x, y, maxW, lh) {
      let line = '';
      for (const word of String(text).split(' ')) { const t = line ? line + ' ' + word : word; if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, y); line = word; y += lh; } else line = t; }
      if (line) ctx.fillText(line, x, y);
      return y + lh;
    }
    // Colour-bar ticks: the two ends first (labelled min and max), then zero and the halves wherever they still fit.
    const tickOrder = (lo, hi) => [lo, hi, 0, lo / 2, hi / 2].filter((v, i, a) => a.indexOf(v) === i);
    const tickLabel = (v, lo, hi) => (v === hi ? (activeScale?.mode === 'manual' ? '≥ ' : 'max ') : v === lo ? (activeScale?.mode === 'manual' ? '≤ ' : 'min ') : '') + sig(v, 3);
    const panelColour = (v, lo, hi) => colour(v, lo, hi, activeScale?.exponent || 1);
    function hatchPanel(ctx, pts, v) {
      if (!activeScale || (v >= activeScale.lo && v <= activeScale.hi)) return;
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      ctx.save(); ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.4;
      for (let x = x0 - (y1 - y0); x <= x1; x += 8) { ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x + y1 - y0, y1); ctx.stroke(); }
      ctx.restore();
    }
    function scaleCaption() {
      const v = activeScale;
      return `Blue: negative · green: zero · red: positive · ${v?.exponent === 0.5 ? '√ contrast, full range' : v?.mode === 'manual' ? 'manual range; hatching = outside limits' : 'linear, full range'}`;
    }
    function colourbar(ctx, x, y, h, lo, hi, unit) {   // vertical, beside the maps
      const w = 16, steps = 120;
      for (let i = 0; i < steps; i++) { const v = hi - (hi - lo) * (i + 0.5) / steps; ctx.fillStyle = panelColour(v, lo, hi); ctx.fillRect(x, y + h * i / steps, w, h / steps + 0.6); }
      ctx.strokeStyle = '#7a8a9b'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w, h);
      ctx.fillStyle = '#14212e'; ctx.font = `700 13px ${FONT}`; ctx.fillText(unit, x - 2, y - 10);
      ctx.font = `12px ${FONT}`;
      const placed = [];
      for (const v of tickOrder(lo, hi)) {
        const ty = y + h * (hi - v) / ((hi - lo) || 1);
        if (placed.some((p) => Math.abs(p - ty) < 15)) continue;
        placed.push(ty); ctx.fillRect(x + w, ty, 4, 1); ctx.fillText(tickLabel(v, lo, hi), x + w + 7, ty + 4);
      }
    }
    function colourbarH(ctx, x, y, w, lo, hi, unit) {   // horizontal, under the maps on narrow screens (low values left)
      const h = 12, steps = 120;
      for (let i = 0; i < steps; i++) { const v = lo + (hi - lo) * (i + 0.5) / steps; ctx.fillStyle = panelColour(v, lo, hi); ctx.fillRect(x + w * i / steps, y, w / steps + 0.6, h); }
      ctx.strokeStyle = '#7a8a9b'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w, h);
      ctx.fillStyle = '#14212e'; ctx.font = `700 12px ${FONT}`; ctx.fillText(unit, x, y - 6);
      ctx.font = `11px ${FONT}`;
      const boxes = [];
      for (const v of tickOrder(lo, hi)) {
        const tx = x + w * (v - lo) / ((hi - lo) || 1), t = tickLabel(v, lo, hi), tw = ctx.measureText(t).width, bx = Math.min(x + w - tw, Math.max(x, tx - tw / 2));
        if (boxes.some(([a, b]) => bx < b + 6 && bx + tw > a - 6)) continue;
        boxes.push([bx, bx + tw]); ctx.fillRect(tx, y + h, 1, 4); ctx.fillText(t, bx, y + h + 15);
      }
    }
    function fit(ctx, options, maxW) {   // the first wording that fits maxW, else the last one shortened with an ellipsis
      for (const t of options) if (ctx.measureText(t).width <= maxW) return t;
      let t = options[options.length - 1];
      while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
      return t + '…';
    }
    function drawSurface(ctx, W, H, top, s, interactive) {
      const b = s.result.base, f = surfaceField(b), key = kind === 'dp' ? 'dp' : 'cp', unit = kind === 'dp' ? 'p − p∞ (Pa)' : 'Cp';
      if (!f) { ctx.fillStyle = '#9a5800'; ctx.font = `14px ${FONT}`; ctx.fillText('This solution has no stored panel field to draw.', 20, top + 30); return; }
      const { lo, hi } = extremes(f.panels, key); activeScale = currentScale(b, key); const vlo = activeScale.lo, vhi = activeScale.hi;
      const narrow = W < 560;   // narrow screens: the colour bar goes under the maps so the maps keep the width
      const left = narrow ? 34 : 54, right = narrow ? 12 : 120, titleH = 22, gap = 34, bottom = narrow ? 112 : 70, spanW = f.ymax - f.ymin, chordH = f.xmax - f.xmin;
      const stacked = Math.min((W - left - right) / spanW, (H - top - 2 * titleH - gap - bottom - 10) / (2 * chordH));
      const beside = Math.min((W - left - right - gap) / (2 * spanW), (H - top - titleH - bottom - 10) / chordH);
      const sc = Math.max(stacked, beside), sideBySide = beside > stacked, mapH = chordH * sc, mapW = spanW * sc;
      const used = sideBySide ? titleH + mapH + bottom : 2 * (titleH + mapH) + gap + bottom, y0 = top + 10 + Math.max(0, (H - top - 10 - used) / 2) + titleH;
      const origin = sideBySide ? { upper: [left, y0], lower: [left + mapW + gap, y0] } : { upper: [left, y0], lower: [left, y0 + mapH + gap + titleH] };
      const maps = { upper: origin.upper[1], lower: origin.lower[1] };
      const X = (y, side = 'upper') => origin[side][0] + (y - f.ymin) * sc, Y = (side, x) => maps[side] + (x - f.xmin) * sc;
      hits = [];
      for (const p of f.panels) {
        const pts = p.poly.map(([y, x]) => [X(y, p.side), Y(p.side, x)]);
        ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath();
        const c = panelColour(p[key], vlo, vhi); ctx.fillStyle = c; ctx.strokeStyle = showPanels ? 'rgba(20,33,46,0.65)' : c; ctx.lineWidth = showPanels ? 0.65 : 0.6; ctx.fill(); ctx.stroke(); hatchPanel(ctx, pts, p[key]);
        hits.push({ p, pts });
      }
      // titles: the longest wording that ends before the next map or the colour bar
      const barX = W - right + 28, titleEnd = narrow ? W - 8 : barX - 12;
      ctx.font = `700 13px ${FONT}`; ctx.fillStyle = '#14212e';
      ctx.fillText(fit(ctx, ['Upper surface (suction side), top view', 'Upper surface (suction side)', 'Upper surface'], (sideBySide ? origin.lower[0] - 12 : titleEnd) - origin.upper[0]), origin.upper[0], maps.upper - 8);
      ctx.fillText(fit(ctx, ['Lower surface, same top-view orientation', 'Lower surface, same orientation', 'Lower surface'], titleEnd - origin.lower[0]), origin.lower[0], maps.lower - 8);
      ctx.font = `12px ${FONT}`; ctx.fillStyle = '#4e5f71';
      for (const side of ['upper', 'lower']) {
        const lx = origin[side][0] - (narrow ? 26 : 30);
        if (side === 'upper' || !sideBySide) { ctx.fillText('LE', lx, maps[side] + 12); ctx.fillText('TE', lx, maps[side] + mapH); }
        if (side === 'lower' || sideBySide) {
          const edge = maps[side] + mapH, step = niceStep(spanW, sideBySide || narrow ? 4 : 6);
          for (let y = 0; y <= f.ymax + 1e-9; y += step) { const px = X(y, side), t = sig(y, 4); ctx.fillRect(px, edge + 2, 1, 5); ctx.fillText(t, px - ctx.measureText(t).width / 2, edge + 20); }
          ctx.fillText('span y (mm), root at left', X(f.ymin, side), edge + 36);
        }
      }
      if (narrow) colourbarH(ctx, left, maps.lower + mapH + 62, Math.min(W - left - 14, 420), vlo, vhi, unit);
      else colourbar(ctx, barX, maps.upper, Math.max(120, sideBySide ? mapH : maps.lower + mapH - maps.upper), vlo, vhi, unit);
      ctx.fillStyle = '#4e5f71'; ctx.font = `11px ${FONT}`; ctx.fillText(fit(ctx, [scaleCaption()], W - 28), 14, H - 10);
      drawn = { f, key, unit };
      probes.forEach((pr, n) => {
        const h = hits.find((t) => t.p === pr) || hits.find((t) => t.p.side === pr.side && t.p.j === pr.j && t.p.k === pr.k); if (!h) return;
        const cx = h.pts.reduce((a, q) => a + q[0], 0) / 4, cy = h.pts.reduce((a, q) => a + q[1], 0) / 4;
        ctx.beginPath(); ctx.arc(cx, cy, 8, 0, 2 * Math.PI); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = '#14212e'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = '#14212e'; ctx.font = `700 11px ${FONT}`; ctx.fillText(String(n + 1), cx - 3.5, cy + 4);
      });
      if (interactive) canvas.setAttribute('aria-label', `${unit} on the upper and lower surfaces, base mesh; minimum ${sig(lo[key])}, maximum ${sig(hi[key])}. Click a panel for its value.`);
    }
    function drawSurface3D(ctx, W, H, top, s, interactive) {
      const b = s.result.base, key = kind === 'dp' ? 'dp' : 'cp', unit = kind === 'dp' ? 'p − p∞ (Pa)' : 'Cp';
      let f = meshCache.get(b);
      try { if (!f) { f = surfaceField3D(b, ui.state().geometry); if (f) meshCache.set(b, f); } }
      catch (error) {
        hits = []; ctx.fillStyle = '#b42318'; ctx.font = `14px ${FONT}`;
        wrapText(ctx, '3D surface unavailable: ' + error.message + ' Use the 2D view or solve the current geometry again.', 20, top + 35, W - 40, 20); return;
      }
      if (!f) { hits = []; return; }
      const ex = extremes(f.panels, key); activeScale = currentScale(b, key); const lo = activeScale.lo, hi = activeScale.hi;
      const mirror = !!document.getElementById('wingFullSymmetric')?.checked;
      const panels = [...f.panels];
      if (mirror) for (const p of f.panels) panels.push({ ...p, mirrored: true, y: -p.y, vertices: p.vertices.map(([x, y, z]) => [x, -y, z]) });
      const cy = Math.cos(yaw), sy = Math.sin(yaw), ce = Math.cos(elevation), se = Math.sin(elevation);
      const project = ([x, y, z]) => [y * cy - x * sy, (x * cy + y * sy) * se - z * ce, (x * cy + y * sy) * ce + z * se];
      const faces = panels.map((p) => { const pts = p.vertices.map(project); return { p, pts, depth: pts.reduce((a, v) => a + v[2], 0) / 4 }; });
      const all = faces.flatMap((f) => f.pts), xmin = Math.min(...all.map((v) => v[0])), xmax = Math.max(...all.map((v) => v[0])), ymin = Math.min(...all.map((v) => v[1])), ymax = Math.max(...all.map((v) => v[1]));
      const narrow = W < 560, left = 24, right = narrow ? 90 : 125, upper = top + 42, bottom = 42;
      const aw = Math.max(40, W - left - right), ah = Math.max(40, H - upper - bottom);
      const scale = zoom * Math.min(aw / Math.max(1e-6, xmax - xmin), ah / Math.max(1e-6, ymax - ymin)) * 0.9;
      const X = (v) => left + aw / 2 + (v - (xmin + xmax) / 2) * scale, Y = (v) => upper + ah / 2 + (v - (ymin + ymax) / 2) * scale;
      faces.sort((a, b) => a.depth - b.depth);
      hits = [];
      ctx.save(); ctx.beginPath(); ctx.rect(0, upper - 10, W - right + 10, H - upper - bottom + 20); ctx.clip();
      for (const face of faces) {
        const pts = face.pts.map((v) => [X(v[0]), Y(v[1])]), col = panelColour(face.p[key], lo, hi);
        ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
        ctx.fillStyle = col; ctx.strokeStyle = showPanels ? 'rgba(20,33,46,0.65)' : col; ctx.lineWidth = showPanels ? 0.65 : 0.5; ctx.fill(); ctx.stroke(); hatchPanel(ctx, pts, face.p[key]);
        hits.push({ p: face.p, pts });
      }
      // Select only the last painted (frontmost) face. Draw probe numbers on visible panels only.
      probes.forEach((pr, n) => {
        const hit = hits.find((h) => h.p.side === pr.side && h.p.j === pr.j && h.p.k === pr.k && !!h.p.mirrored === !!pr.mirrored);
        if (!hit) return;
        const x = hit.pts.reduce((a, v) => a + v[0], 0) / 4, y = hit.pts.reduce((a, v) => a + v[1], 0) / 4;
        ctx.beginPath(); ctx.arc(x, y, 8, 0, 2 * Math.PI); ctx.fillStyle = 'white'; ctx.fill(); ctx.strokeStyle = '#14212e'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = '#14212e'; ctx.font = `700 11px ${FONT}`; ctx.fillText(String(n + 1), x - 3, y + 4);
      });
      ctx.restore();
      ctx.fillStyle = '#14212e'; ctx.font = `600 13px ${FONT}`;
      ctx.fillText(fit(ctx, [mirror ? 'Full wing · symmetric Cp' : '3D aerodynamic surface', '3D surface'], W - right - 25), left, top + 22);
      ctx.font = `11px ${FONT}`; ctx.fillStyle = '#4e5f71';
      ctx.fillText(fit(ctx, [scaleCaption()], W - 35), left, H - 12);
      colourbar(ctx, W - right + 22, upper, Math.max(80, ah), lo, hi, unit);
      if (f.edges) {
        const tag = (P, text, dy) => {
          const p = project(P), x = X(p[0]), y = Y(p[1]);
          ctx.strokeStyle = '#14212e'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+16,y+dy); ctx.stroke();
          ctx.font = `700 12px ${FONT}`; const w = ctx.measureText(text).width;
          ctx.fillStyle = 'rgba(255,255,255,.94)'; ctx.fillRect(x+17,y+dy-12,w+8,17); ctx.fillStyle='#14212e'; ctx.fillText(text,x+21,y+dy+1);
        };
        tag(f.edges.le,'LE · leading edge',-30); tag(f.edges.te,'TE · trailing edge',30);
        const a = b.flow.alphaDeg * Math.PI/180, len = Math.max(.5*f.edges.chord, .07*b.reference.span_mm), P = f.edges.le;
        const start = [P[0]-len*Math.cos(a),P[1],P[2]-len*Math.sin(a)], end = [P[0]-.15*len*Math.cos(a),P[1],P[2]-.15*len*Math.sin(a)];
        const p=project(start), e=project(end), x=X(p[0]), y=Y(p[1]), ex=X(e[0]), ey=Y(e[1]), angle=Math.atan2(ey-y,ex-x);
        ctx.strokeStyle='#14212e';ctx.fillStyle='#14212e';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(ex,ey);ctx.stroke();ctx.beginPath();ctx.moveTo(ex,ey);ctx.lineTo(ex-8*Math.cos(angle-.45),ey-8*Math.sin(angle-.45));ctx.lineTo(ex-8*Math.cos(angle+.45),ey-8*Math.sin(angle+.45));ctx.closePath();ctx.fill();ctx.font=`700 12px ${FONT}`;ctx.fillText('Flow →',x-15,y-9);
      }
      // Aircraft axes rotate with the surface; scale is graphical only.
      const ox = left + 28, oy = H - 56;
      for (const [P, label, col] of [[[1, 0, 0], '+x', '#b42318'], [[0, 1, 0], '+y', '#16834a'], [[0, 0, 1], '+z', '#175cd3']]) {
        const a = project(P); ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + 25 * a[0], oy + 25 * a[1]); ctx.stroke();
        ctx.fillStyle = col; ctx.font = `700 10px ${FONT}`; ctx.fillText(label, ox + 30 * a[0] - 4, oy + 30 * a[1] + 4);
      }
      drawn = { f, key, unit, threeDimensional: true };
      if (interactive) canvas.setAttribute('aria-label', `3D ${unit} on the actual aerodynamic base-mesh surface. True minimum ${sig(ex.lo[key])}, maximum ${sig(ex.hi[key])}. ${scaleCaption()}. Drag to rotate; click a surface panel for its signed value.`);
    }
    const FRAME = { L: 70, R: 24 };
    function chartFrame(ctx, W, H, top, xr, yr, xl, yl, head = 1, reverseY = false) {   // head = text rows reserved above the frame
      const L = FRAME.L, R = FRAME.R, T = top + 26 + 22 * head, B = 52, w = W - L - R, h = H - T - B;
      const X = (v) => L + (v - xr[0]) / (xr[1] - xr[0]) * w, Y = (v) => T + (reverseY ? v - yr[0] : yr[1] - v) / (yr[1] - yr[0]) * h;
      ctx.strokeStyle = '#d4dce5'; ctx.lineWidth = 1; ctx.fillStyle = '#4e5f71'; ctx.font = `13px ${FONT}`;
      const sx = niceStep(xr[1] - xr[0], w < 360 ? 4 : 8), sy = niceStep(yr[1] - yr[0], 6);
      for (let v = Math.ceil(xr[0] / sx) * sx; v <= xr[1] + 1e-9; v += sx) { const t = sig(v, 3); ctx.beginPath(); ctx.moveTo(X(v), T); ctx.lineTo(X(v), T + h); ctx.stroke(); ctx.fillText(t, X(v) - ctx.measureText(t).width / 2, T + h + 16); }
      for (let v = Math.ceil(yr[0] / sy) * sy; v <= yr[1] + 1e-9; v += sy) { const t = sig(Math.abs(v)<1e-10*sy?0:v, 3); ctx.beginPath(); ctx.moveTo(L, Y(v)); ctx.lineTo(L + w, Y(v)); ctx.stroke(); ctx.fillText(t, L - 8 - ctx.measureText(t).width, Y(v) + 4); }
      ctx.strokeStyle = '#7a8a9b'; ctx.strokeRect(L + 0.5, T + 0.5, w, h);
      if (yr[0] < 0 && yr[1] > 0) { ctx.strokeStyle = '#4e5f71'; ctx.beginPath(); ctx.moveTo(L, Y(0)); ctx.lineTo(L + w, Y(0)); ctx.stroke(); }
      ctx.fillStyle = '#14212e'; ctx.font = `700 13px ${FONT}`; const xt = fit(ctx, [xl], w); ctx.fillText(xt, L + w / 2 - ctx.measureText(xt).width / 2, T + h + 38);
      ctx.save(); ctx.translate(18, T + h / 2); ctx.rotate(-Math.PI / 2); const yt = fit(ctx, [yl], h); ctx.fillText(yt, -ctx.measureText(yt).width / 2, 0); ctx.restore();
      return { X, Y, L, T, w, h };
    }
    // Legend and note above the plot frame, wrapped into as many rows as the width needs.
    const itemWidth = (ctx, label) => 32 + ctx.measureText(label).width + 22;
    function headRows(ctx, W, items, note) {
      ctx.font = `14px ${FONT}`;
      const maxW = W - FRAME.L - FRAME.R, rows = [[]]; let used = 0;
      for (const it of items) { const iw = itemWidth(ctx, it[0]); if (used + iw > maxW && rows[rows.length - 1].length) { rows.push([]); used = 0; } rows[rows.length - 1].push(it); used += iw; }
      const noteRow = note && used + 16 + ctx.measureText(note).width > maxW;   // the note gets its own row when it does not fit beside the legend
      return { rows, note, noteRow: !!noteRow, count: rows.length + (noteRow ? 1 : 0) };
    }
    function drawHead(ctx, fr, head) {
      ctx.font = `14px ${FONT}`;
      const rowY = (i) => fr.T - 26 - 22 * (head.count - 1 - i);
      head.rows.forEach((items, i) => {
        let x = fr.L; const y = rowY(i);
        for (const [label, colourValue, dash] of items) { ctx.strokeStyle = colourValue; ctx.lineWidth = 2.2; ctx.setLineDash(dash || []); ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 26, y - 4); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#14212e'; ctx.fillText(label, x + 32, y); x += itemWidth(ctx, label); }
      });
      if (head.note) {
        ctx.fillStyle = '#4e5f71';
        const y = head.noteRow ? rowY(head.count - 1) : rowY(head.rows.length - 1), t = head.noteRow ? fit(ctx, [head.note], fr.w) : head.note;
        ctx.fillText(t, head.noteRow ? fr.L : fr.L + fr.w - ctx.measureText(t).width, y);
      }
    }
    function renderFoil(){
      syncSectionControls();
      foilCompare3D.disabled=!data()||!foilEta.value.trim()||!Number.isFinite(+foilEta.value);
      for(const e of [station,projection,resetView,scaleMode,manualTools,scaleInfo])e.hidden=true;
      panelToggle.hidden=false;clearBtn.hidden=false;clearBtn.disabled=!probes.length;html.hidden=true;pngBtn.hidden=false;
      canvas.style.touchAction='auto';canvas.style.cursor='crosshair';
      const valid=foilCurrent()&&!foilBusy;
      pngBtn.disabled=csvBtn.disabled=!valid;
      if(!valid){canvas.hidden=true;notice.hidden=false;notice.replaceChildren(el('p',{text:foilBusy?foilMessage:foil2D?'Inputs changed. Press Solve 2D airfoil to update this independent section solution.':foilMessage}));source.textContent='Independent 2D inviscid airfoil analysis · no 3D downwash or finite-wing induced drag';return;}
      notice.hidden=true;canvas.hidden=false;const r=foil2D,delta=Math.abs(r.cl-r.coarse.cl);
      source.textContent=`η ${sig(r.section.eta)} · chord ${sig(r.section.chord_mm)} mm · α2D ${sig(r.alphaDeg)}° relative to local chord (entered directly; wing incidence is ${sig(r.section.incidenceDeg)}°). 2D cl = ${sig(r.cl,5)}, circulation cl = ${sig(r.clCirculation,5)}, 2D cm¼ = ${sig(r.cm,5)}. ${2*r.n} contour panels; half-density change: Δcl ${sig(delta,3)}, Δcm ${sig(Math.abs(r.cm-r.coarse.cm),3)}. System / mean-flux residual ${sig(r.maxResidual,2)}; midpoint normal-velocity residual ${sig(r.midpointNormalVelocity,2)}. Inviscid, sharp TE; no viscosity/stall. The half-density change is not a certified error bound.`;
      draw(canvas,null);
    }
    function drawFoil(ctx,W,H,top,interactive){
      const r=foil2D, values=r.panels.map(p=>p.cp),lo=Math.min(...values),hi=Math.max(...values),pad=.08*((hi-lo)||1);
      const head=headRows(ctx,W,[['upper · selected mesh','#2166ac'],['lower · selected mesh','#b2182b',[7,5]],['half-density mesh','#8796a5',[2,3]]],'Isolated 2D · prescribed local α · no wing downwash');
      const fr=chartFrame(ctx,W,H-115,top,[0,1],[lo-pad,hi+pad],'x/c · leading edge 0 → trailing edge 1','Cp · suction up',head.count,true);hits=[];
      for(const [result,coarse] of [[r.coarse,true],[r,false]])for(const side of ['upper','lower']){
        const ps=result.panels.filter(p=>p.side===side).sort((a,b)=>a.x-b.x);ctx.strokeStyle=coarse?'#8796a5':side==='upper'?'#2166ac':'#b2182b';ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=coarse?1:2;ctx.setLineDash(coarse?[2,3]:side==='lower'?[7,5]:[]);ctx.beginPath();ps.forEach((p,i)=>i?ctx.lineTo(fr.X(p.x),fr.Y(p.cp)):ctx.moveTo(fr.X(p.x),fr.Y(p.cp)));ctx.stroke();ctx.setLineDash([]);
        if(!coarse)ps.forEach((p,i)=>{const at=[fr.X(p.x),fr.Y(p.cp)];ctx.beginPath();ctx.arc(...at,2,0,Math.PI*2);ctx.fill();hits.push({point:{kind:'foil2d',side,xc:p.x,cp:p.cp,vt:p.vt,i},at});});
      }
      drawHead(ctx,fr,head);
      const scale=Math.min(W-140,650),left=(W-scale)/2,base=H-62;
      ctx.strokeStyle='#14212e';ctx.lineWidth=1.5;ctx.beginPath();r.panels.forEach((p,i)=>{if(!i)ctx.moveTo(left+p.a[0]*scale,base-p.a[1]*scale);ctx.lineTo(left+p.b[0]*scale,base-p.b[1]*scale);});ctx.stroke();
      if(showPanels){ctx.fillStyle='#14212e';for(const p of r.panels){ctx.beginPath();ctx.arc(left+p.a[0]*scale,base-p.a[1]*scale,1.7,0,2*Math.PI);ctx.fill();}}
      ctx.font=`12px ${FONT}`;ctx.fillStyle='#4e5f71';ctx.fillText('LE',left-24,base);ctx.fillText('TE',left+scale+8,base);ctx.fillText('Unit chord · same shape + α → same isolated 2D Cp',left,H-12);
      for(const p of probes){const h=hits.find(h=>h.point.side===p.side&&h.point.i===p.i);if(h){ctx.strokeStyle='#14212e';ctx.beginPath();ctx.arc(...h.at,7,0,2*Math.PI);ctx.stroke();}}
      if(interactive)canvas.setAttribute('aria-label','Independent 2D airfoil Cp: same normalized profile and entered angle give the same Cp at different wing stations; no finite-wing downwash. Upper and lower surfaces, selected and half-density meshes. Click a selected-mesh point to read Cp and tangential speed.');
    }
    function drawSection(ctx, W, H, top, s, interactive) {
      const b = s.result.base, sec = b.chordwise[sectionJ], q = b.flow.dynamicPressure_Pa;
      const all = [...sec.upper, ...sec.lower].map((p) => p[1]), lo = Math.min(...all), hi = Math.max(...all), pad = 0.06 * ((hi - lo) || 1);
      const head = headRows(ctx, W, [['upper surface', '#2166ac'], ['lower surface', '#b2182b', [7, 5]]],
        `3D strip ${sectionJ + 1} of ${b.chordwise.length}: y = ${sig(sec.y_mm)} mm, local chord ${sig(sec.chord_mm)} mm; p − p∞ = q∞ Cp, q∞ = ${sig(q)} Pa`);
      const fr = chartFrame(ctx, W, H, top, [0, 1], [lo - pad, hi + pad], 'x/c (0 = leading edge, 1 = trailing edge)', 'Cp (negative / suction up)', head.count, true);
      hits = [];
      const series = [['upper', '#2166ac', []], ['lower', '#b2182b', [7, 5]]];
      for (const [side, col, dash] of series) {
        const pts = sec[side].slice().sort((a, c) => a[0] - c[0]);
        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash(dash); ctx.beginPath();
        pts.forEach(([x, cp], i) => (i ? ctx.lineTo(fr.X(x), fr.Y(cp)) : ctx.moveTo(fr.X(x), fr.Y(cp)))); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = col;
        pts.forEach(([x, cp], i) => { ctx.beginPath(); ctx.arc(fr.X(x), fr.Y(cp), 2.6, 0, 2 * Math.PI); ctx.fill(); hits.push({ point: { side, j: sectionJ, k: i, n: pts.length, xc: x, cp, dp: q * cp, y: sec.y_mm, chord: sec.chord_mm }, at: [fr.X(x), fr.Y(cp)] }); });
      }
      drawHead(ctx, fr, head);
      probes.forEach((pr, n) => { const h = hits.find((t) => t.point.side === pr.side && t.point.k === pr.k && pr.j === sectionJ); if (!h) return; ctx.beginPath(); ctx.arc(h.at[0], h.at[1], 8, 0, 2 * Math.PI); ctx.strokeStyle = '#14212e'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = '#14212e'; ctx.font = `700 11px ${FONT}`; ctx.fillText(String(n + 1), h.at[0] + 9, h.at[1] - 8); });
      drawn = { section: sec };
      if (interactive) canvas.setAttribute('aria-label', `Finite-wing 3D sectional pressure coefficient at solved strip y = ${sig(sec.y_mm)} mm; includes spanwise flow interaction; upper and lower surfaces.`);
    }
    function stepRows(rows) { return rows.map((r) => ({ y0: r[0], y1: r[1], fz: r[4], w: r[4] / ((r[1] - r[0]) || 1) })); }
    function drawSpan(ctx, W, H, top, s, interactive) {
      const r = s.result, c = s.combined, b = r.base, aeroOnly = c.structuralLoadAvailable === false, delivered = stepRows(c.strips), baseRows = stepRows(b.stripLoads), meshes = r.levels.map((l) => ({ l, rows: stepRows(l.strips) }));
      const allW = [...delivered, ...baseRows, ...meshes.flatMap((m) => m.rows)].map((v) => v.w), ymax = Math.max(...(aeroOnly ? baseRows : delivered).map((v) => v.y1));
      const lo = Math.min(0, ...allW), hi = Math.max(0, ...allW), pad = 0.06 * ((hi - lo) || 1);
      const head = headRows(ctx, W, [...(aeroOnly ? [[`base aerodynamic mesh ${b.mesh.chordPanelsPerSurface} × ${b.mesh.spanPanels}`, '#0a5fc2']] : [['delivered to the structure (extrapolated)', '#0a5fc2'], [`base mesh ${b.mesh.chordPanelsPerSurface} × ${b.mesh.spanPanels}`, '#14212e', [6, 4]]]), ['other meshes of the sequence', 'rgba(122,138,155,0.8)']], '');
      const fr = chartFrame(ctx, W, H, top, [0, ymax], [lo - (lo < 0 ? pad : 0), hi + pad], 'span y (mm), root at left', 'lift per unit span Fz/Δy (N/mm)', head.count);
      const step = (rows, col, width, dash) => { ctx.strokeStyle = col; ctx.lineWidth = width; ctx.setLineDash(dash || []); ctx.beginPath(); rows.forEach((v, i) => { if (i === 0) ctx.moveTo(fr.X(v.y0), fr.Y(v.w)); else ctx.lineTo(fr.X(v.y0), fr.Y(v.w)); ctx.lineTo(fr.X(v.y1), fr.Y(v.w)); }); ctx.stroke(); ctx.setLineDash([]); };
      for (const m of meshes) step(m.rows, 'rgba(122,138,155,0.45)', 1);
      step(baseRows, aeroOnly ? '#0a5fc2' : '#14212e', aeroOnly ? 2.6 : 1.6, aeroOnly ? [] : [6, 4]);
      if (!aeroOnly) step(delivered, '#0a5fc2', 2.6);
      hits = (aeroOnly ? baseRows : delivered).map((v, i) => ({ point: { kind: 'strip', series: aeroOnly ? 'Base-mesh' : 'Delivered', i, ...v }, at: [fr.X((v.y0 + v.y1) / 2), fr.Y(v.w)] }));
      const fz = c.rootWrench[2], semi = fz.value;
      drawHead(ctx, fr, head);
      probes.forEach((pr, n) => { const h = hits.find((t) => t.point.i === pr.i); if (!h) return; ctx.beginPath(); ctx.arc(h.at[0], h.at[1], 8, 0, 2 * Math.PI); ctx.strokeStyle = '#14212e'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = '#14212e'; ctx.font = `700 11px ${FONT}`; ctx.fillText(String(n + 1), h.at[0] + 9, h.at[1] - 8); });
      drawn = { delivered };
      if (interactive) canvas.setAttribute('aria-label', `Spanwise lift per unit span: ${aeroOnly ? 'base aerodynamic mesh and remaining meshes; no structural load generated' : 'delivered extrapolated strip load, base mesh and the other meshes'}. Semi-wing lift ${sig(semi)} N.`);
    }
    function drawMetric(ctx,W,H,top,s,interactive) {
      const rows=spanQuantities(s.result.base), def={cl:['Section lift coefficient cl',''],gamma:['Wake circulation Γ','m²/s'],cm:['Quarter-chord pitching moment coefficient cm',''],te:['Trailing-edge Cp upper − Cp lower','']}[kind];
      const series=[[kind,def[0],'#175cd3',[]],...(kind==='cl'?[['clKJ','Wake: 2Γ/(V c)','#b54708',[6,4]]]:[])];
      const values=series.flatMap(([k])=>rows.map(r=>r[k])).filter(Number.isFinite), lo=Math.min(0,...values), hi=Math.max(0,...values), pad=.08*((hi-lo)||1);
      const head=headRows(ctx,W,series.map(([,label,c,dash])=>[label,c,dash]),'Base-mesh strip midpoints; no values inferred outside the sampled span');
      const fr=chartFrame(ctx,W,H,top,[0,s.result.base.reference.span_mm/2],[lo-pad,hi+pad],'semi-span y (mm)',def[0]+(def[1]?` (${def[1]})`:''),head.count);
      const tip=s.result.base.mesh?.roundedTip,tipStart=tip?.start_mm;
      if(Number.isFinite(tipStart)){ctx.fillStyle='rgba(210,125,0,.13)';ctx.fillRect(fr.X(tipStart),fr.Y(hi+pad),fr.X(s.result.base.reference.span_mm/2)-fr.X(tipStart),fr.Y(lo-pad)-fr.Y(hi+pad));ctx.fillStyle='#8b4b00';ctx.font=`12px ${FONT}`;ctx.fillText('Amber: rounded tip · local values not certified',fr.L+8,fr.Y(hi+pad)+17);}
      hits=[];
      for(const [key,label,c,dash] of series){
        ctx.lineWidth=2;
        for(let i=1;i<rows.length;i++){const a=rows[i-1],b=rows[i];if(!Number.isFinite(a[key])||!Number.isFinite(b[key]))continue;const uncertain=Number.isFinite(tipStart)&&b.y>=tipStart;ctx.strokeStyle=uncertain?'#a65b00':c;ctx.setLineDash(uncertain?[3,4]:dash);ctx.beginPath();ctx.moveTo(fr.X(a.y),fr.Y(a[key]));ctx.lineTo(fr.X(b.y),fr.Y(b[key]));ctx.stroke();}
        ctx.setLineDash([]);rows.forEach((r,i)=>{if(!Number.isFinite(r[key]))return;const at=[fr.X(r.y),fr.Y(r[key])],uncertain=Number.isFinite(tipStart)&&r.y>=tipStart;ctx.fillStyle=uncertain?'#a65b00':c;ctx.beginPath();ctx.arc(...at,3,0,2*Math.PI);ctx.fill();hits.push({point:{kind:'metric',i,series:label,y:r.y,value:r[key],unit:def[1],uncertain},at});});
      }
      drawHead(ctx,fr,head);drawn={rows};
      probes.forEach((p,n)=>{const h=hits.find(h=>h.point.i===p.i&&h.point.series===p.series);if(h){ctx.strokeStyle='#14212e';ctx.beginPath();ctx.arc(...h.at,8,0,2*Math.PI);ctx.stroke();ctx.fillStyle='#14212e';ctx.fillText(String(n+1),h.at[0]+10,h.at[1]-8);}});
      if(interactive)canvas.setAttribute('aria-label',`${def[0]} versus semi-span. Click a sample for its value.`);
    }
    function probeText(p, n) {
      if(p.kind==='foil2d')return `${n}. 2D ${p.side} · x/c ${sig(p.xc)} · Cp ${sig(p.cp)} · Vt/V∞ ${sig(p.vt)}`;
      if(p.kind==='metric')return `${n}. ${p.series} · y ${sig(p.y)} mm · ${sig(p.value)} ${p.unit}${p.uncertain?' · rounded-tip sample: local accuracy not certified':''}`;
      if (p.kind === 'strip') return `${n}. ${p.series || 'Delivered'} strip ${p.i + 1}: y ${sig(p.y0, 4)}–${sig(p.y1, 4)} mm · Fz ${sig(p.fz)} N · Fz/Δy ${sig(p.w)} N/mm`;
      const s = state(), b = s.result && s.result.base, eta = b ? p.y / (b.reference.span_mm / 2) : NaN;
      return `${n}. ${p.mirrored ? 'Mirrored ' : ''}${p.side === 'upper' ? 'Upper' : 'Lower'} surface · strip ${p.j + 1}, panel ${p.k + 1} of ${p.n} from the leading edge · y ${sig(p.y, 4)} mm (η ${sig(eta, 3)}) · x/c ${sig(p.xc, 3)}${Number.isFinite(p.x) ? ` · x ≈ ${sig(p.x, 4)} mm` : ''} · Cp ${sig(p.cp)} · p − p∞ ${sig(p.dp)} Pa`;
    }
    function showProbes() { probeBox.replaceChildren(...probes.map((p, i) => el('div', { text: probeText(p, i + 1) }))); clearBtn.disabled = !probes.length; }
    canvas.addEventListener('click', (e) => {
      if (dragged) { dragged = false; return; }
      if (!kind || !hits.length) return;
      const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      let picked = null;
      if (kind === 'cp' || kind === 'dp') {
        const inside = (pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi) c = !c; } return c; };
        const h = hits.slice().reverse().find((t) => inside(t.pts)); picked = h && h.p;
      } else {
        let best = null; for (const h of hits) { const d = Math.hypot(h.at[0] - x, h.at[1] - y); if (d < 18 && (!best || d < best.d)) best = { d, h }; }
        picked = best && best.h.point;
      }
      if (!picked) return;
      if (kind !== 'span' && picked.j != null) sectionJ = picked.j;
      probes = [...probes.filter((p) => p !== picked), picked].slice(-8);
      render(); showProbes();
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (!['cp', 'dp'].includes(kind) || surfaceMode === 'planform') return;
      drag = { x: e.clientX, y: e.clientY, yaw, elevation }; dragged = false; canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) < 4 && !dragged) return;
      dragged = true; surfaceMode = projection.value = '3d'; yaw = drag.yaw + dx * 0.006;
      elevation = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, drag.elevation - dy * 0.006)); redrawSurface();
    });
    for (const name of ['pointerup', 'pointercancel']) canvas.addEventListener(name, () => { drag = null; });
    canvas.addEventListener('wheel', (e) => {
      if (!['cp', 'dp'].includes(kind) || surfaceMode === 'planform') return;
      e.preventDefault(); zoom = Math.max(0.45, Math.min(4, zoom * Math.exp(-e.deltaY * 0.001))); redrawSurface();
    }, { passive: false });
    canvas.addEventListener('keydown', (e) => {
      if (!['cp', 'dp'].includes(kind) || surfaceMode === 'planform') return;
      if (e.key === 'ArrowLeft') yaw -= 0.12;
      else if (e.key === 'ArrowRight') yaw += 0.12;
      else if (e.key === 'ArrowUp') elevation = Math.min(Math.PI / 2, elevation + 0.12);
      else if (e.key === 'ArrowDown') elevation = Math.max(-Math.PI / 2, elevation - 0.12);
      else if (e.key === '+' || e.key === '=') zoom = Math.min(4, zoom * 1.15);
      else if (e.key === '-') zoom = Math.max(0.45, zoom / 1.15);
      else return;
      e.preventDefault(); surfaceMode = projection.value = '3d'; redrawSurface();
    });
    document.getElementById('wingFullSymmetric')?.addEventListener('change', () => { if (!overlay.hidden) render(); });
    pngBtn.addEventListener('click', () => {
      if (!kind) { exportStructureFigure?.(); return; }
      const s = kind==='foil2d'?foilCurrent():data(); if (!s || kind === 'coef') return;
      const W = 1800, H = kind === 'section' || kind === 'span' ? 1000 : Math.round(1800 * Math.max(0.55, canvas.clientHeight / Math.max(1, canvas.clientWidth))) + 96;
      const off = document.createElement('canvas'); off.width = W; off.height = H; const ctx = off.getContext('2d');
      draw(off, s, { ctx, W, H, title: 'Wing AeroStruct · ' + title.textContent, source: source.textContent + (['cp', 'dp'].includes(kind) ? ' ' + scaleStatus.textContent : '') });
      off.toBlob((blob) => blob && download(`wing-aero-${kind}.png`, blob), 'image/png');
      render();   // the probes list and the screen canvas are unchanged; redraw restores the screen hit areas
    });
    csvBtn.addEventListener('click', () => {
      if(kind==='foil2d'){
        if(!foilCurrent())return;
        const r=foil2D,lines=[`# Independent 2D linear vortex panel solution (interior at rest); alpha relative to local chord ${r.alphaDeg} deg; eta ${r.section.eta}; chord ${r.section.chord_mm} mm.`, `# cl_pressure ${r.cl}; cl_circulation ${r.clCirculation}; cm_quarter_chord ${r.cm}; numerical_pressure_drag ${r.pressureDrag} (discretization residual, NOT profile drag); cl_cm_exact_quadratic_integral ${r.integrated.cl} ${r.integrated.cm}; residual_panel_mean_normal_velocity_and_system ${r.maxResidual}; midpoint_normal_velocity_max ${r.midpointNormalVelocity}; trailing_edge_angle_deg ${r.trailingEdge.includedAngleDeg}.`, '# Two meshes are independent 2D solves. No 3D wing result is used.','mesh,surface,x_over_c,z_over_c,Cp,Vt_over_Vinf',...[['selected',r],['half_density',r.coarse]].flatMap(([name,r])=>r.panels.map(p=>[name,p.side,p.x,p.z,p.cp,p.vt].join(',')))];
        download('airfoil-2d-panel.csv',new Blob([lines.join('\n')+'\n'],{type:'text/csv'}));return;
      }
      const s = data(); if (!s) return;
      const r = s.result, b = r.base, head = [`# MIE 446 Wing AeroStruct (development) aerodynamic result: ${title.textContent}. Lines starting with # are comments.`, `# ${r.label}`, `# ${flowText(b)}; ${r.sequence} sequence (${r.levels.length} meshes)`];
      let lines = [], name = `wing-aero-${kind}.csv`;
      if (kind === 'cp' || kind === 'dp') {
        const f = surfaceField(b);
        lines = [...head, `# Cp at the panel centroids of the ${meshText(b)}; one solved mesh, not extrapolated. p - p_inf = q_inf * Cp. x_mm is the planform position of the centroid (leading edge plus x/c times the local chord).`,
          'surface,strip,panel_from_LE,y0_mm,y1_mm,y_mid_mm,eta,x_over_c,x_mm,Cp,p_minus_pinf_Pa',
          ...f.panels.map((p) => [p.side, p.j + 1, p.k + 1, csvNum(p.y0), csvNum(p.y1), csvNum(p.y), csvNum(p.y / (b.reference.span_mm / 2)), csvNum(p.xc), csvNum(p.x), csvNum(p.cp), csvNum(p.dp)].join(','))];
      } else if (kind === 'section') {
        const sec = b.chordwise[sectionJ];
        lines = [...head, `# Strip ${sectionJ + 1} of ${b.chordwise.length} of the base mesh: y = ${csvNum(sec.y_mm)} mm, local chord ${csvNum(sec.chord_mm)} mm.`, 'surface,panel_from_LE,x_over_c,Cp,p_minus_pinf_Pa',
          ...['upper', 'lower'].flatMap((side) => sec[side].slice().sort((a, c) => a[0] - c[0]).map((p, i) => [side, i + 1, csvNum(p[0]), csvNum(p[1]), csvNum(b.flow.dynamicPressure_Pa * p[1])].join(',')))];
        name = `wing-aero-section-strip${sectionJ + 1}.csv`;
      } else if (['cl', 'gamma', 'cm', 'te'].includes(kind)) {
        lines = [...head, '# Local values of the base aerodynamic mesh; no extrapolation. Gamma in m2/s; cm about the strip quarter chord, body +y nose-up, normalized by q_inf*c^2*dy.',
          `# Rounded aerodynamic tip begins at y ${b.mesh?.roundedTip?.start_mm??'not applicable'} mm. Flagged local values are not certified; all actual samples are retained.`,
          'y0_mm,y1_mm,y_mid_mm,cl_pressure,cl_Kutta_Joukowski,Gamma_m2_per_s,cm_quarter_chord,Cp_upper_TE_minus_Cp_lower_TE,rounded_tip_sample',
          ...spanQuantities(b).map(p => [...[p.y0,p.y1,p.y,p.cl,p.clKJ,p.gamma,p.cm,p.te].map(csvNum),Number.isFinite(b.mesh?.roundedTip?.start_mm)&&p.y>=b.mesh.roundedTip.start_mm?1:0].join(','))];
      } else if (kind === 'span') {
        lines = [...head, s.combined.structuralLoadAvailable === false ? '# Aerodynamic results only. base = base mesh; mesh_CxS = one solved mesh of the sequence. No structural strip load was generated.' : '# Spanwise strip loads. delivered = extrapolated load given to the structure; base = base mesh; mesh_CxS = one mesh of the sequence (chord panels per surface x span panels).', 'series,y0_mm,y1_mm,Fz_N,Fz_per_mm_N_per_mm',
          ...stepRows(s.combined.strips).map((v) => ['delivered', csvNum(v.y0), csvNum(v.y1), csvNum(v.fz), csvNum(v.w)].join(',')),
          ...stepRows(b.stripLoads).map((v) => ['base', csvNum(v.y0), csvNum(v.y1), csvNum(v.fz), csvNum(v.w)].join(',')),
          ...r.levels.flatMap((l) => stepRows(l.strips).map((v) => [`mesh_${l.chordPanels}x${l.spanPanels}`, csvNum(v.y0), csvNum(v.y1), csvNum(v.fz), csvNum(v.w)].join(',')))];
      } else if (kind === 'coef' && typeof WingAeroUI !== 'undefined') {
        const a = ui.aero(); name = `wing-aerostruct-alpha${sig(b.flow.alphaDeg, 4)}-V${sig(b.flow.speed, 4)}.csv`.replace(/[^A-Za-z0-9_.-]/g, '_');
        download(name, new Blob([WingAeroUI.csv(WingAeroUI.recordFromSequence(r, a.solvedKey), s.combined, s.admission || null)], { type: 'text/csv' })); return;
      }
      download(name, new Blob([lines.join('\n') + '\n'], { type: 'text/csv' }));
    });
    function renderCoefficients(s) {
      const r = s.result, c = s.combined, b = r.base, cf = c.coefficients;
      const row = (name, e, unit = '') => `<tr><td>${name}</td><td>${sig(e.value)} ± ${sig(e.uncertainty, 2)}${unit}</td><td>${sig(e.finest)}</td><td>${sig(e.base)}</td></tr>`;
      const conv = (name, e) => `<tr><td>${name}</td><td>${e.chord.levels.map((n, i) => `${n}: ${sig(e.chord.values[i])}`).join('<br>')}</td><td>${e.span.levels.map((n, i) => `${n}: ${sig(e.span.values[i])}`).join('<br>')}</td><td>${sig(e.chord.observedOrder, 3)} / ${sig(e.span.observedOrder, 3)}</td></tr>`;
      const meshRows = r.levels.map((l) => { const w = (c.weights.find((x) => x.chordPanels === l.chordPanels && x.spanPanels === l.spanPanels) || { weight: 0 }).weight, F = l.strips.reduce((t, v) => t + v[4], 0); return `<tr><td>${2 * l.chordPanels} × ${l.spanPanels}</td><td>${l.panels ?? '–'}</td><td>${sig(l.coefficients.CL)}</td><td>${sig(F)}</td><td>${sig(w, 3)}</td></tr>`; }).join('');
      const lc = c.consistency.lift, dc = c.consistency.drag, adm = s.admission;
      const S = ui.state(), applied = S.aeroLoad;
      let admHtml = '<p class="note">This aerodynamic load is not applied to the structure. Use Apply aerodynamic loads to structure in Aerodynamics to run the admission test.</p>';
      if (c.structuralLoadAvailable === false) admHtml = '<p class="note">Aerodynamic results are available. Transfer to the spatial-beam structural model is unavailable for an exact zero-chord tip; no structural load has been generated.</p>';
      else if (applied && adm && typeof WingAeroUI !== 'undefined') { const v = WingAeroUI.admissionVerdict(adm); admHtml = `<div class="wae-box ${v.ok ? 'ok' : 'no'}"><p class="${v.ok ? 'wae-ok' : 'wae-no'}">${v.html}</p>${WingAeroUI.admissionTable(adm)}</div>`; }
      else if (applied) admHtml = '<p class="note">The load is applied; the admission test runs with the next Solve Structure / Stress.</p>';
      coefficientReport.innerHTML = `<div class="wae">
        <h4>Computed coefficients (both halves) · mesh-extrapolated estimates</h4>
        <p class="note">U estimates mesh-discretization uncertainty. These are not measurements or error percentages against an external reference.</p>
        ${typeof WingAeroUI!=='undefined'?WingAeroUI.provenanceHelp():''}
        <div class="wae-scroll"><table><thead><tr><th>Quantity</th><th>Extrapolated ± U (mesh)</th><th>Finest-direction combination</th><th>Base mesh</th></tr></thead><tbody>
          ${row('Lift coefficient C<sub>L</sub>, pressure integral', cf.CL)}${row('C<sub>L</sub>, Trefftz plane', cf.CLTrefftz)}${row('Induced drag C<sub>Di</sub>, Trefftz plane', cf.CDiTrefftz)}
          ${row('Pressure drag C<sub>D,p</sub> (inviscid; equals C<sub>Di</sub> in exact potential flow)', cf.CDpressure)}${row('Pitching moment C<sub>m</sub> about ¼ MAC (nose-up +)', cf.Cm)}
          ${row('Semi-wing lift F<sub>z</sub>', c.rootWrench[2], ' N')}</tbody></table></div>
        <p class="note">No viscous (skin-friction) drag, stall or boundary layer is computed: attached, incompressible potential flow only.</p>
        <h4>Mesh convergence</h4>
        <div class="wae-scroll"><table><thead><tr><th>Quantity</th><th>Chordwise refinement (panels per surface: value)</th><th>Spanwise refinement (panels: value)</th><th>Observed order chord / span</th></tr></thead><tbody>${conv('C<sub>L</sub>', cf.CL)}${conv('C<sub>Di</sub> Trefftz', cf.CDiTrefftz)}${conv('C<sub>m</sub>', cf.Cm)}${conv('Semi-wing F<sub>z</sub> (N)', c.rootWrench[2])}</tbody></table></div>
        <div class="wae-scroll"><table><thead><tr><th>Mesh (around × spanwise)</th><th>Panels</th><th>C<sub>L</sub></th><th>F<sub>z</sub> (N)</th><th>Extrapolation weight</th></tr></thead><tbody>${meshRows}</tbody></table></div>
        <p class="note">Internal consistency (same flow solution): pressure and Trefftz-plane lift differ by ${sig(100 * lc.relativeDifference, 3)} % (criterion 2 %); pressure and induced drag differ by ${sig(dc.difference, 2)} (combined mesh U ${sig(dc.combinedUncertainty, 2)}). These checks do not compare with experiment. Re (MAC) ${sig(b.flow.reynoldsMac, 3)} is reported, not used to calculate a viscous polar; Mach ${sig(b.flow.mach, 3)}. Linear solver: ${esc(b.diagnostics.linearSolver || '')}, relative residual ${sig(b.diagnostics.linearRelativeResidual, 2)} (equation solve, not aerodynamic accuracy).</p>
        ${(b.warnings || []).map((w) => `<p class="wae-warn">${esc(w)}</p>`).join('')}
        <h4>Structural load: admission</h4>${admHtml}</div>`;
    }
    if (window.ResizeObserver) new ResizeObserver(() => { if (!overlay.hidden && kind !== 'coef') render(); }).observe(canvas.parentElement);
    let lastRefresh = [];
    return { refresh: () => { if (!overlay.hidden) { const s=state(), key=kind==='foil2d'?[foilInputKey()]:[s.status,s.why,s.result,s.combined,s.admission]; if(key.length!==lastRefresh.length||key.some((v,i)=>v!==lastRefresh[i])){lastRefresh=key;render();if(probes.length)showProbes();} } }, close, show, get kind() { return kind; }, element: overlay, selector: group, pngButton:pngBtn, csvButton:csvBtn };
  }
  return Object.freeze({ install, VIEWS, surfaceField, surfaceField3D, colour, displayScale, pressureMeshCheck, spanQuantities, nearestSectionIndex });
})();
