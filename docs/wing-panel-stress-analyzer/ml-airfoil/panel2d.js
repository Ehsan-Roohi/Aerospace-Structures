/* Generated verbatim from current Wing Lab 2D module; run build_comparison.cjs. */
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
    if(pts.length<17||pts.length>1025||pts.some(p=>p.some(v=>!Number.isFinite(v))))throw Error('The 2D section needs 16–1024 finite contour panels.');
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
    if(!Number.isInteger(nHalf)||nHalf<8||nHalf>512)throw Error('Enter an integer from 8 to 512 panels per surface.');
    const ag=WingAeroPanel.aeroGeometry(g), y=eta*ag.semiSpan,st=WingGeometry.stationAt(ag,y);
    if(st.chord<1e-7)throw Error('The exact zero-chord tip is not an airfoil section. Select an inboard station.');
    const profile=WingGeometry.airfoilAt(ag,y), s=WingAirfoils.surfaces(profile,1,0,nHalf+1),pts=[];
    for(let i=nHalf;i>=0;i--)pts.push([s.xl[i],s.zl[i]]);for(let i=1;i<=nHalf;i++)pts.push([s.xu[i],s.zu[i]]);
    return {points:pts,eta,chord_mm:st.chord,incidenceDeg:st.incidenceDeg,profile};
  }
  return Object.freeze({solveCoordinates,section});
})();

