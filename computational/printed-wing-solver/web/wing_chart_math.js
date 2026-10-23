/* Rendering-only helpers: accept ordinary/typed arrays without changing solver data. */
const WingChartMath=(()=>{
 'use strict';let serial=0;
 function range(values,includeZero=false){let min=includeZero?0:Infinity,max=includeZero?0:-Infinity;for(const v of values||[])if(Number.isFinite(v)){min=Math.min(min,v);max=Math.max(max,v);}return Number.isFinite(min)&&Number.isFinite(max)?[min,max]:[0,1];}
 function ticks(min,max,count=4){
  if(!Number.isFinite(min)||!Number.isFinite(max))return [0,1];if(min>max)[min,max]=[max,min];
  if(min===0&&max===0)return [-1,0,1];
  const scale=Math.max(Math.abs(min),Math.abs(max)),a=min/scale,b=max/scale,n=Math.max(1,Math.min(20,count));
  const low=a===b?a-.1:a,high=a===b?b+.1:b,span=high-low,realMag=10**Math.floor(Math.log10(scale)+Math.log10(span/n))||Number.MIN_VALUE,mag=realMag/scale;
  const step=[1,2,2.5,5,10].map(v=>v*mag).find(v=>span/v<=n+.5)||10*mag;
  const first=Math.floor(low/step),last=Math.ceil(high/step),out=[];
  for(let i=first;i<=last&&out.length<100;i++){const v=i===0?0:i*step*scale;if(Number.isFinite(v)&&(!out.length||v>out.at(-1)))out.push(v);}
  if(!out.length)return min===max?[0,min]:[min,max];
  if(out[0]>min)out.unshift(min);if(out.at(-1)<max)out.push(max);
  if(out.length===1){if(out[0]>0)out.unshift(0);else out.push(0);}return out;
 }
 function fraction(v,lo,hi){const scale=Math.max(Math.abs(lo),Math.abs(hi))||1,span=hi/scale-lo/scale;return span?(v/scale-lo/scale)/span:.5;}
 function format(v,digits=3){if(!Number.isFinite(v))return 'unresolved';if(v===0)return '0';return Math.abs(v)>=1e5||Math.abs(v)<1e-3?v.toExponential(digits-1).replace('e+','e'):String(+v.toPrecision(digits));}
 function segments(xs,ys){const out=[];let run=[];for(let i=0;i<(xs?.length||0);i++){if(Number.isFinite(xs[i])&&Number.isFinite(ys?.[i]))run.push([xs[i],ys[i]]);else if(run.length){out.push(run);run=[];}}if(run.length)out.push(run);return out;}
 function path(runs,X,Y){return runs.map(run=>run.map(([x,y],i)=>(i?'L':'M')+X(x).toFixed(2)+','+Y(y).toFixed(2)).join('')).join('');}
 function at(xs,ys,x){let previous=null;for(let i=0;i<(xs?.length||0);i++){const a=xs[i],b=ys?.[i];if(!Number.isFinite(a)||!Number.isFinite(b)){previous=null;continue;}if(a===x)return b;if(previous&&previous[0]<x&&a>x){const f=fraction(x,previous[0],a);return (1-f)*previous[1]+f*b;}previous=[a,b];}return NaN;}
 return {range,ticks,fraction,format,segments,path,at,clipId:()=>`wing-chart-clip-${++serial}`};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WingChartMath;
