(()=>{
 'use strict';const $=s=>document.querySelector(s),T=TrussEngine;
 let model={nodes:[],members:[]},result=null,selected=null,tool='select',first=null;
 let view={xmin:0,ymin:0,width:1200,height:700};
 const reactionControl=document.createElement('label');reactionControl.innerHTML='<input type="checkbox" id="reactionView"> Reaction FBD · replace supports with solved reactions';$('#trussCanvas').before(reactionControl);$('#reactionView').onchange=draw;
 $('a[href="#manual"]').onclick=()=>{$('#manual').open=true;};
 const num=v=>Number(v.toPrecision(6)),fmt=v=>Number(v).toPrecision(5),escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const status=(s,error=false)=>{$('#status').textContent=s;$('#status').dataset.error=error;};
 function dirty(){result=null;$('#csv').disabled=true;$('#results').innerHTML='';$('#resultSummary').textContent='Inputs changed. Solve to obtain current results.';draw();}
 function coords(n){return [60+(n.x-view.xmin)/view.width*880,470-(n.y-view.ymin)/view.height*420];}
 function draw(){
  const map=new Map(model.nodes.map(n=>[n.id,n]));let svg='<svg viewBox="0 0 1000 530" role="img" aria-label="Editable planar truss model"><defs><marker id="loadArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8Z" fill="#a328ae"/></marker><marker id="reactionArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8Z" fill="#08754c"/></marker></defs>';
  svg+='<path d="M30 490h50m-50 0v-50" stroke="#426480" fill="none"/><text x="82" y="495" font-size="14">+x</text><text x="20" y="433" font-size="14">+y</text>';
  if(result){const scale=result.maxDisplacement>0?.07*Math.min(view.width,view.height)/result.maxDisplacement:1;
   model.members.forEach(m=>{const a=result.nodes.find(n=>n.id===m.a),b=result.nodes.find(n=>n.id===m.b),p=coords({x:a.x+scale*a.ux,y:a.y+scale*a.uy}),q=coords({x:b.x+scale*b.ux,y:b.y+scale*b.uy});svg+=`<path d="M${p}L${q}" stroke="#71849a" stroke-width="2" stroke-dasharray="6 4" fill="none"/>`;});
   svg+=`<text x="60" y="24" font-size="14">Dashed displacement ×${fmt(scale)} (visual amplification only)</text>`;
  }
  model.members.forEach((m,i)=>{const a=coords(map.get(m.a)),b=coords(map.get(m.b)),f=result?.members[i].force,color=!result?'#365e80':Math.abs(f)<1e-8?'#71849a':f>0?'#086ac7':'#b65009';
   svg+=`<g data-member="${i}" role="button" tabindex="0" aria-label="Member ${i+1}, nodes ${m.a} to ${m.b}"><path d="M${a}L${b}" stroke="transparent" stroke-width="18"/><path d="M${a}L${b}" stroke="${selected?.type==='member'&&selected.index===i?'#e58a00':color}" stroke-width="${selected?.type==='member'&&selected.index===i?7:4}"/><text x="${(a[0]+b[0])/2+6}" y="${(a[1]+b[1])/2-6}" font-size="13">M${i+1}</text></g>`;
  });
  function arrow(n,fx,fy,reaction){if(Math.hypot(fx,fy)<1e-9)return;const [x,y]=coords(n),len=Math.hypot(fx,fy),dx=45*fx/len,dy=-45*fy/len,color=reaction?'#08754c':'#a328ae',marker=reaction?'reactionArrow':'loadArrow',offset=reaction?20:0;
   svg+=`<path d="M${x-dx+offset} ${y-dy-offset}L${x+offset} ${y-offset}" stroke="${color}" stroke-width="2" marker-end="url(#${marker})"/><text x="${x-dx+offset+5}" y="${y-dy-offset-6}" fill="${color}" font-size="12">${reaction?'R':'F'}=(${fmt(fx)}, ${fmt(fy)}) N</text>`;
  }
  model.nodes.forEach((n,i)=>{const [x,y]=coords(n);if(n.support!=='free'&&!(result&&$('#reactionView').checked)){
   const roller=n.support!=='pin';svg+=`<g stroke="#08754c" stroke-width="2" fill="#e7f4ec" transform="translate(${x},${y})${n.support==='rollerX'?' rotate(90)':''}"><path d="M0 4L-12 22H12Z"/>${roller?'<circle cx="-7" cy="26" r="3"/><circle cx="7" cy="26" r="3"/><path d="M-18 31H18"/>':'<path d="M-18 25H18m-14 0l-5 6m13-6l-5 6m13-6l-5 6m13-6l-5 6"/>'}</g>`;
  }arrow(n,n.fx,n.fy,false);if(result&&$('#reactionView').checked)arrow(n,result.nodes[i].rx,result.nodes[i].ry,true);
   svg+=`<g data-node="${n.id}" role="button" tabindex="0" aria-label="Node ${n.id}, x ${n.x}, y ${n.y}"><circle cx="${x}" cy="${y}" r="11" fill="${selected?.type==='node'&&selected.id===n.id?'#ffd68c':'white'}" stroke="#173b60" stroke-width="2"/><text x="${x+13}" y="${y-13}" font-size="14">N${n.id}</text></g>`;
  });
  svg+=`<text x="60" y="517" font-size="13">View x: ${num(view.xmin)}…${num(view.xmin+view.width)} mm; y: ${num(view.ymin)}…${num(view.ymin+view.height)} mm. Arrow lengths are schematic, not a force scale.</text></svg>`;
  $('#trussCanvas').innerHTML=svg;
 }
 function field(name,label,v){return `<label>${label}<input name="${name}" type="number" step="any" value="${v}" required></label>`;}
 function selection(){
  const form=$('#editForm');form.hidden=!selected;if(!selected){$('#selectionText').textContent='Choose Select and click a node or member.';return;}
  if(selected.type==='node'){const n=model.nodes.find(n=>n.id===selected.id);if(!n){selected=null;selection();return;}$('#selectionText').textContent=`Node ${n.id} · nodal load and restraint`;
   $('#editFields').innerHTML=field('x','x (mm)',n.x)+field('y','y (mm)',n.y)+`<label>Support<select name="support">${[['free','Free'],['pin','Pin · x and y fixed'],['rollerY','Roller Y · y fixed'],['rollerX','Roller X · x fixed']].map(([k,l])=>`<option value="${k}" ${n.support===k?'selected':''}>${l}</option>`).join('')}</select></label>`+field('fx','Fx (N, +right)',n.fx)+field('fy','Fy (N, +up)',n.fy);
  }else{const m=model.members[selected.index];$('#selectionText').textContent=`Member ${selected.index+1} · N${m.a} to N${m.b}`;$('#editFields').innerHTML=field('E','E (MPa)',m.E)+field('A','A (mm²)',m.A);}
 }
 const read=(id)=>{const e=$(id);if(!e||e.value.trim()===''||!Number.isFinite(+e.value))throw Error('Enter complete finite numeric values.');return +e.value;};
 function addNode(x,y){if(model.nodes.length>=60)throw Error('Limit: 60 nodes.');if(model.nodes.some(n=>Math.hypot(n.x-x,n.y-y)<1e-7))throw Error('A node already exists at this position.');const id=Math.max(0,...model.nodes.map(n=>n.id))+1;model.nodes.push({id,x,y,fx:0,fy:0,support:'free'});selected={type:'node',id};dirty();selection();status(`Node ${id} added. Edit its exact coordinates and restraint on the left.`);}
 function choose(el){
  const node=el.closest('[data-node]'),member=el.closest('[data-member]');
  if(node){const id=+node.dataset.node;if(tool==='member'){
   if(first===null){first=id;status(`First node ${id}. Choose the second node.`);return;}
   const proposed={...model,members:[...model.members,{a:first,b:id,E:read('#newE'),A:read('#newA')}]};T.normalize(proposed);model=proposed;first=null;dirty();status('Member added. Choose two more nodes, or Select to edit.');return;
  }selected={type:'node',id};selection();draw();return;}
  if(member&&tool==='select'){selected={type:'member',index:+member.dataset.member};selection();draw();}
 }
 function remove(){if(!selected)return;if(selected.type==='node'){const id=selected.id;model.nodes=model.nodes.filter(n=>n.id!==id);model.members=model.members.filter(m=>m.a!==id&&m.b!==id);}else model.members.splice(selected.index,1);selected=null;first=null;dirty();selection();status('Selection deleted; connected members are removed with a deleted node.');}
 function attempt(fn){try{fn();}catch(e){status(e.message,true);}}
 $('#nodeForm').onsubmit=e=>{e.preventDefault();attempt(()=>addNode(read('#nodeX'),read('#nodeY')));};
 $('#editForm').onsubmit=e=>{e.preventDefault();attempt(()=>{const copy=JSON.parse(JSON.stringify(model)),form=$('#editForm'),get=k=>{const q=form.elements.namedItem(k);if(q.value.trim()===''||!Number.isFinite(+q.value))throw Error('Enter complete numeric values.');return +q.value;};
  if(selected.type==='node'){const n=copy.nodes.find(n=>n.id===selected.id);Object.assign(n,{x:get('x'),y:get('y'),fx:get('fx'),fy:get('fy'),support:form.elements.namedItem('support').value});if(copy.nodes.some(v=>v.id!==n.id&&Math.hypot(v.x-n.x,v.y-n.y)<1e-7))throw Error('Coincident nodes are not allowed.');}
  else Object.assign(copy.members[selected.index],{E:get('E'),A:get('A')});model=T.normalize(copy);dirty();selection();status('Changes applied. Solve to update results.');});};
 $('#deleteSelected').onclick=remove;
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){first=null;status('Member selection cancelled.');}if(e.key==='Delete'&&!e.target.closest('input,textarea,select,[contenteditable]')&&selected){e.preventDefault();remove();}});
 document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>{tool=b.dataset.tool;first=null;document.querySelectorAll('[data-tool]').forEach(v=>v.setAttribute('aria-pressed',String(v===b)));status(tool==='node'?'Click an empty position to add a node (snapped to 10 mm).':tool==='member'?'Click two nodes to connect them.':'Click a node or member to edit or Delete.');});
 $('#trussCanvas').onclick=e=>attempt(()=>{
  if(tool==='node'&&!e.target.closest('[data-node]')){const svg=$('#trussCanvas svg'),p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;const q=p.matrixTransform(svg.getScreenCTM().inverse());addNode(Math.round((view.xmin+(q.x-60)/880*view.width)/10)*10,Math.round((view.ymin+(470-q.y)/420*view.height)/10)*10);return;}choose(e.target);
 });
 $('#trussCanvas').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();attempt(()=>choose(e.target));}};
 $('#clear').onclick=()=>{if(model.nodes.length&&!window.confirm('Remove all truss nodes, members, supports and loads?'))return;model={nodes:[],members:[]};selected=null;first=null;dirty();selection();status('Empty model. No loads or supports.');};
 function fit(){const ns=model.nodes;if(!ns.length)return;const xs=ns.map(n=>n.x),ys=ns.map(n=>n.y),dx=Math.max(...xs)-Math.min(...xs),dy=Math.max(...ys)-Math.min(...ys),size=Math.max(dx,dy,100);view={xmin:Math.min(...xs)-size*.08,ymin:Math.min(...ys)-size*.08,width:Math.max(dx,size*.4)+size*.16,height:Math.max(dy,size*.4)+size*.16};$('#rangeX').value=num(view.width);$('#rangeY').value=num(view.height);draw();}
 $('#fit').onclick=fit;for(const id of ['rangeX','rangeY'])$('#'+id).onchange=()=>attempt(()=>{const width=read('#rangeX'),height=read('#rangeY');if(width<=0||height<=0)throw Error('View dimensions must be positive.');view.width=width;view.height=height;draw();});
 function tables(r){const table=(head,rows)=>`<table><thead><tr>${head.map(v=>`<th>${escape(v)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(v=>`<td>${escape(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  return '<h3>Members · positive = tension; negative = compression</h3>'+table(['Member','Nodes','Force (N)','Stress (MPa)','Extension (mm)'],r.members.map((m,i)=>[i+1,`${m.a}–${m.b}`,fmt(m.force),fmt(m.stress),fmt(m.extension)]))+'<h3>Nodes · global +x right, +y up</h3>'+table(['Node','ux (mm)','uy (mm)','Rx (N)','Ry (N)'],r.nodes.map(n=>[n.id,fmt(n.ux),fmt(n.uy),fmt(n.rx),fmt(n.ry)]));
 }
 $('#solve').onclick=()=>attempt(()=>{result=null;$('#csv').disabled=true;$('#results').innerHTML='';$('#resultSummary').textContent='No current result.';draw();const r=T.solve(model);result=r;$('#csv').disabled=false;$('#results').innerHTML=tables(r);$('#resultSummary').textContent=`Maximum displacement ${fmt(r.maxDisplacement)} mm. Global equilibrium residuals: ΣFx=${fmt(r.equilibrium.fx)} N; ΣFy=${fmt(r.equilibrium.fy)} N; ΣM=${fmt(r.equilibrium.m)} N·mm.`;const lengths=r.members.map(m=>m.L);status(r.maxDisplacement>.05*Math.min(...lengths)?'Solved, but displacement exceeds 5% of the shortest member: small-displacement results may be inappropriate.':'Solved. Tension blue; compression orange. No compression buckling or cable slackening check.');draw();});
 function download(text,type,name){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 $('#image').onclick=()=>download($('#trussCanvas').innerHTML,'image/svg+xml','truss-model.svg');
 $('#csv').onclick=()=>{if(!result)return;const rows=[['member','node_a','node_b','force_N_tension_positive','stress_MPa','extension_mm'],...result.members.map((m,i)=>[i+1,m.a,m.b,m.force,m.stress,m.extension]),[],['node','ux_mm','uy_mm','Rx_N_right_positive','Ry_N_up_positive'],...result.nodes.map(n=>[n.id,n.ux,n.uy,n.rx,n.ry])];download(rows.map(r=>r.join(',')).join('\n'),'text/csv','truss-results.csv');};
 $('#example').onclick=()=>{if(model.nodes.length&&!confirm('Replace the current model with the optional braced bay?'))return;model={nodes:[{id:1,x:0,y:0,support:'pin',fx:0,fy:0},{id:2,x:1000,y:0,support:'rollerY',fx:0,fy:0},{id:3,x:0,y:400,support:'free',fx:0,fy:50},{id:4,x:1000,y:400,support:'free',fx:0,fy:50}],members:[[1,2],[1,3],[2,4],[3,4],[1,4]].map(([a,b])=>({a,b,E:70000,A:100}))};selected=null;first=null;dirty();selection();fit();status('Optional generic braced bay loaded with two +50 N nodal forces. Not a historical aircraft model. Press Solve.');};
 window.TrussLab={state:()=>JSON.parse(JSON.stringify({model,result})),setModel:m=>{model=T.normalize(m);selected=null;dirty();selection();fit();}};draw();
})();
