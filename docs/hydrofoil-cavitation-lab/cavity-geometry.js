/* Geometric post-processing of the actual 2-D cavity samples. No flow model. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CavityGeometry=api;})(typeof globalThis==='undefined'?this:globalThis,function(){
 'use strict';
 const finite=(x,name)=>{if(!Number.isFinite(x))throw Error(name+' must be finite.');return x;};
 function measure(height,chord,span){
  if(!Array.isArray(height)||height.length<2)throw Error('At least two actual cavity nodes are required.');
  finite(chord,'Chord');if(chord<=0)throw Error('Chord must be positive.');
  if(span!==undefined&&span!==null){finite(span,'Uniform span');if(span<=0)throw Error('Uniform span must be positive.');}
  let area=0,min=Infinity,max=-Infinity;
  const nodes=height.map(p=>{finite(p.x,'x/c');finite(p.y,'Cavity y/c');finite(p.h,'Signed gap h/c');min=Math.min(min,p.h);max=Math.max(max,p.h);return{x:p.x,y:p.y,h:p.h,foilY:p.y-p.h};});
  for(let i=1;i<nodes.length;i++){
   const a=nodes[i-1],b=nodes[i];if(b.x<=a.x)throw Error('Cavity x stations must increase strictly; no sorting or clipping is applied.');
   area+=(a.h+b.h)*(b.x-a.x)/2;
  }
  return{nodes,signedAreaPerSpan:area*chord*chord,minimumGap:min*chord,maximumGap:max*chord,
   nonnegativeGap:min>=0,uniformSpan:span??null,extrudedVolume:span==null||min<0?null:span*area*chord*chord,
   units:{signedAreaPerSpan:'m² (m³ per metre span)',gap:'m',extrudedVolume:'m³'},
   interpretation:'Trapezoidal integration over the actual sampled 2-D section. An optional uniform extrusion is not a 3-D flow solution or cloud-shedding prediction.'};
 }
 function esc(t){return String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));}
 function extrusionSvg(height,chord,span,{accepted=false}={}){
  if(!accepted)return '<p>No accepted 3-D volume: this cavity trial has not passed its physical checks.</p>';
  const m=measure(height,chord,span);if(m.extrudedVolume===null)return '<p>Negative cavity gap: no physical extrusion is displayed.</p>';
  const W=900,H=340,pad=40,raw=(x,y,z)=>[x+.34*y,-z-.20*y],pts=[];
  for(const p of m.nodes)for(const b of [0,span])for(const z of [p.y,p.foilY])pts.push(raw(p.x*chord,b,z*chord));
  let xmin=Math.min(...pts.map(p=>p[0])),xmax=Math.max(...pts.map(p=>p[0])),ymin=Math.min(...pts.map(p=>p[1])),ymax=Math.max(...pts.map(p=>p[1]));
  const scale=Math.min((W-2*pad)/(xmax-xmin),(H-100)/(ymax-ymin||1)),X=p=>pad+(p[0]-xmin)*scale,Y=p=>75+(p[1]-ymin)*scale;
  const point=(p,b,foil=false)=>{const q=raw(p.x*chord,b,(foil?p.foilY:p.y)*chord);return X(q).toFixed(3)+','+Y(q).toFixed(3);};
  let s=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Uniform extrusion of the solved two-dimensional cavity section"><rect width="100%" height="100%" fill="white"/><style>text{font-family:'Times New Roman',serif;fill:black}</style><text x="20" y="26" font-size="21" font-weight="bold">Uniform extrusion of the 2-D cavity section</text><text x="20" y="50" font-size="16">Assumed span ${esc(span)} m · volume ${(m.extrudedVolume*1e9).toPrecision(5)} mm³ · no spanwise flow solved</text>`;
  const poly=(ps,color)=>`<polygon points="${ps.join(' ')}" fill="${color}" fill-opacity=".32" stroke="#075e85" stroke-width=".8"/>`;
  for(let i=1;i<m.nodes.length;i++){const a=m.nodes[i-1],b=m.nodes[i];s+=poly([point(a,0),point(b,0),point(b,span),point(a,span)],'#45c5e4');}
  for(const b of [0,span])s+=poly([...m.nodes.map(p=>point(p,b)),...m.nodes.slice().reverse().map(p=>point(p,b,true))],'#159cbd');
  s+='<text x="20" y="325" font-size="16">True geometry; no thickness exaggeration. This is not a detached cloud or a 3-D cavitation solution.</text></svg>';
  return s;
 }
 return Object.freeze({measure,extrusionSvg});
});
