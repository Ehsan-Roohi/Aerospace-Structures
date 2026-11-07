// Independent planar, inextensible elastica BVP: theta''=-lambda*cos(theta).
// Scalar bisection + independent RK4; no quaternion/spatial solver supplies the reference.
const assert=require('node:assert/strict'),B=require('./wing_nonlinear_beam.js');
const lambda=1,N=12000,h=1/N;
const rhs=s=>[s[1],-lambda*Math.cos(s[0]),Math.cos(s[0]),Math.sin(s[0])];
function integrate(k){let s=[0,k,0,0];for(let i=0;i<N;i++){const a=rhs(s),b=rhs(s.map((v,j)=>v+h*a[j]/2)),c=rhs(s.map((v,j)=>v+h*b[j]/2)),d=rhs(s.map((v,j)=>v+h*c[j]));s=s.map((v,j)=>v+h*(a[j]+2*b[j]+2*c[j]+d[j])/6);}return s;}
let lo=0,hi=1;for(let i=0;i<48;i++){const mid=(lo+hi)/2;if(integrate(mid)[1]>0)hi=mid;else lo=mid;}const reference=integrate((lo+hi)/2),L=300,EI=3e7,n=20,input={nodes:Array.from({length:n+1},(_,i)=>[L*i/n,0,0]),elements:Array.from({length:n},(_,i)=>({a:i,b:i+1,spanStart:L*i/n,spanEnd:L*(i+1)/n,EA:1e14,EI22:EI,EI33:EI,GJ:EI,orientation:[0,1,0]})),pointLoads:[{y:L,force:[0,EI/L**2,0]}]},r=B.solve(input);
assert.ok(Math.abs(r.tipPosition[0]/L-reference[2])<1e-8);assert.ok(Math.abs(r.tipPosition[1]/L-reference[3])<1e-8);assert.ok(Math.abs(r.at(L).rotation[2]-reference[0])<1e-8);
console.log(JSON.stringify({passed:true,independentScalarReference:{tipRotation:reference[0],xOverL:reference[2],yOverL:reference[3]},spatialSolver:{tipRotation:r.at(L).rotation[2],xOverL:r.tipPosition[0]/L,yOverL:r.tipPosition[1]/L}},null,2));
