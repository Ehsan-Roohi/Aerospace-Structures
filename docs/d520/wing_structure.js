/* Educational stress projection and idealised internal members from the existing section solver.
 * Grey/uncoloured geometry deliberately has no inferred stress. No new FE solve takes place here. */
(function(root){
  'use strict';
  const lerp=(a,b,u)=>a+(b-a)*u;
  function bracket(st,y){
    if(y<st[0].y-1e-6 || y>st.at(-1).y+1e-6)return null;
    let a=0,b=st.length-1;while(b-a>1){const m=(a+b)>>1;if(st[m].y<y)a=m;else b=m;}
    return [st[a],st[b],Math.max(0,Math.min(1,(y-st[a].y)/(st[b].y-st[a].y)))];
  }
  function normal(s,x,z){return s.sx*(x-s.xc)+s.sz*(z-s.zc);}
  function distance(p,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],d=dx*dx+dz*dz;
    const u=d?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/d)):0;
    return Math.hypot(p[0]-a[0]-u*dx,p[1]-a[1]-u*dz);
  }
  function wallAt(s,x,z,kind){
    let best=null,d=Infinity;
    for(const w of s.walls){if(kind==='skin'? !['u','l'].includes(w.kind):w.kind!==kind)continue;
      const di=distance([x,z],s.nodes[w.a],s.nodes[w.b]);if(di<d){d=di;best=w;}}
    // Do not colour the trailing-edge region or a missing lower-skin panel by borrowing a distant wall.
    return best && d<0.025 ? best : null;
  }
  function stressAt(profile,p,n=1,kind='skin'){
    const pair=bracket(profile.structure.stations,Math.abs(p[0]));if(!pair)return null;
    const [a,b,u]=pair,x=p[2]+2.380,z=p[1]-1.845;
    const wa=wallAt(a,x,z,kind),wb=wallAt(b,x,z,kind);if(!wa || !wb)return null;
    const sigma=n*lerp(normal(a,x,z),normal(b,x,z),u),tau=n*lerp(wa.tau,wb.tau,u);
    return {sigma,tau,vm:Math.hypot(sigma,Math.sqrt(3)*tau)};
  }
  function colour(v,max,signed){
    // The viewer outputs sRGB; vertex attributes must be linear to match the CSS colour bar.
    const linear=rgb=>rgb.map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4);
    if(v==null || !Number.isFinite(v))return linear([0.53,0.57,0.59]);
    const t=Math.max(-1,Math.min(1,v/(max||1)));
    if(signed){const white=[0.94,0.94,0.90],end=t<0?[0.05,0.25,0.85]:[0.90,0.10,0.06];return linear(white.map((c,i)=>lerp(c,end[i],Math.abs(t))));}
    const stops=[[0.05,0.25,0.85],[0.05,0.75,0.8],[0.98,0.85,0.10],[0.90,0.10,0.06]],q=Math.max(0,t)*3,k=Math.min(2,Math.floor(q));return linear(stops[k].map((c,i)=>lerp(c,stops[k+1][i],q-k)));
  }
  function limits(profile){const vals={sigma:0,tau:0,vm:0};
    for(const s of profile.structure.stations){for(const w of s.walls){for(const id of [w.a,w.b]){
      const [x,z]=s.nodes[id],sg=normal(s,x,z),ta=w.tau;
      vals.sigma=Math.max(vals.sigma,Math.abs(sg));vals.tau=Math.max(vals.tau,Math.abs(ta));vals.vm=Math.max(vals.vm,Math.hypot(sg,Math.sqrt(3)*ta));}}
      for(const p of [...s.caps,...s.stringers]){vals.sigma=Math.max(vals.sigma,Math.abs(p.sigma));vals.vm=Math.max(vals.vm,Math.abs(p.sigma));}}
    return Object.fromEntries(Object.entries(vals).map(([k,v])=>[k,6*v]));
  }
  function mount({THREE,frame,camera,controls,profile,records,document:doc,refresh,deformPoint}){
    if(!profile.structure)throw new Error('Structural stress data missing');
    const q=s=>doc.querySelector(s),internal=new THREE.Group();internal.name='D520_Idealised_Structure';frame.add(internal);
    const meshes=[],st=profile.structure.stations,scale=limits(profile),members={spars:0xe2a83c,ribs:0x41997a,stringers:0x843caf};
    let lastShape=null;
    const ribOutlines=[];
    const buffers={spars:[],ribs:[],stringers:[]},stresses={spars:[],ribs:[],stringers:[]};
    function point(y,x,z,side){return [side*y,z+1.845,x-2.380];}
    function quad(kind,ps,ss){for(const i of [0,1,2,0,2,3]){buffers[kind].push(...ps[i]);stresses[kind].push(ss?.[i]||null);}}
    function val(s,x,z,tau=0){return {sigma:normal(s,x,z),tau,vm:Math.hypot(normal(s,x,z),Math.sqrt(3)*tau)};}
    for(const side of [-1,1]){
      for(let k=0;k<st.length-1;k++){
        const a=st[k],b=st[k+1];
        for(const kind of ['web','fs']){
          const wa=a.walls.find(w=>w.kind===kind),wb=b.walls.find(w=>w.kind===kind);
          const p=[a.nodes[wa.a],b.nodes[wb.a],b.nodes[wb.b],a.nodes[wa.b]],secs=[a,b,b,a],ta=[wa.tau,wb.tau,wb.tau,wa.tau];
          quad('spars',p.map(([x,z],i)=>point(secs[i].y,x,z,side)),p.map(([x,z],i)=>val(secs[i],x,z,ta[i])));
        }
        for(let i=0;i<a.caps.length;i++){
          const ca=a.caps[i],cb=b.caps[i],p=[[ca.x-ca.width/2,ca.z],[cb.x-cb.width/2,cb.z],[cb.x+cb.width/2,cb.z],[ca.x+ca.width/2,ca.z]],secs=[a,b,b,a];
          quad('spars',p.map(([x,z],j)=>point(secs[j].y,x,z,side)),[ca,cb,cb,ca].map(c=>({sigma:c.sigma,tau:null,vm:Math.abs(c.sigma)})));
        }
        for(let i=0;i<a.stringers.length;i++){
          const ca=a.stringers[i],cb=b.stringers[i],dir=i%2===0?-1:1;
          const p=[[ca.x,ca.z-dir*ca.height/2],[cb.x,cb.z-dir*cb.height/2],[cb.x,cb.z+dir*cb.height/2],[ca.x,ca.z+dir*ca.height/2]],secs=[a,b,b,a];
          quad('stringers',p.map(([x,z],j)=>point(secs[j].y,x,z,side)),[ca,cb,cb,ca].map(c=>({sigma:c.sigma,tau:null,vm:Math.abs(c.sigma)})));
        }
      }
      for(const rib of profile.structure.ribs){
        const s=st.reduce((best,v)=>Math.abs(v.y-rib.y)<Math.abs(best.y-rib.y)?v:best,st[0]);
        const m=(s.nodes.length-1)/2,start=rib.number===22?s.walls.find(w=>w.kind==='web').b:0;
        const ring=[...s.nodes.slice(start,m+1),...s.nodes.slice(m+Math.max(1,start)).reverse()].map(([x,z])=>point(rib.y,x,z,side));
        const rg=new THREE.BufferGeometry().setFromPoints(ring.map(p=>new THREE.Vector3(...p)));
        const line=new THREE.LineLoop(rg,new THREE.LineBasicMaterial({color:0x186647,toneMapped:false}));line.name=`Idealised_Rib_${rib.number}_${side}`;internal.add(line);ribOutlines.push({line,base:rg.attributes.position.array.slice()});
        for(const w of s.walls.filter(w=>w.kind==='u')){
          const a=s.nodes[w.a],b=s.nodes[w.b];if(rib.number===22 && a[0]<s.nodes[s.walls.find(w=>w.kind==='web').a][0]-1e-6)continue;
          // Nodes use upper indices 0..m and lower m+1..2m, shared leading-edge node 0.
          const m=(s.nodes.length-1)/2,lo=id=>s.nodes[id===0?0:m+id];
          quad('ribs',[a,b,lo(w.b),lo(w.a)].map(([x,z])=>point(rib.y,x,z,side)),null);
        }
      }
    }
    for(const kind of Object.keys(buffers)){
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(buffers[kind],3));g.computeVertexNormals();
      const mat=new THREE.MeshBasicMaterial({color:members[kind],side:THREE.DoubleSide,transparent:kind==='ribs',opacity:kind==='ribs'?0.26:1,depthWrite:kind!=='ribs',toneMapped:false});
      const stress=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,toneMapped:false});
      const mesh=new THREE.Mesh(g,mat);mesh.name='Idealised_'+kind;internal.add(mesh);
      meshes.push({mesh,kind,base:g.attributes.position.array.slice(),values:stresses[kind],mat,stress});
    }
    const arrows=new THREE.Group();arrows.name='Illustrative_Pressure_Arrows';internal.add(arrows);
    const arrowRecords=[];
    for(const side of [-1,1])for(const y of [0.86,1.66,2.54,3.49,4.44]){
      const s=st.reduce((best,v)=>Math.abs(v.y-y)<Math.abs(best.y-y)?v:best,st[0]),p=point(y,s.xc,s.nodes[8][1]+0.18,side);
      const a=new THREE.ArrowHelper(new THREE.Vector3(0,1,0),new THREE.Vector3(...p),0.35,0x087990,0.10,0.06);arrows.add(a);arrowRecords.push({arrow:a,p});
    }
    const fittings=new THREE.Group();fittings.name='Idealised_Fitting_Locations';internal.add(fittings);
    for(const side of [-1,1]){const s=st.reduce((b,v)=>Math.abs(v.y-profile.fittingY)<Math.abs(b.y-profile.fittingY)?v:b,st[0]);
      const f=new THREE.Mesh(new THREE.SphereGeometry(0.06,12,8),new THREE.MeshBasicMaterial({color:0xdb301d,toneMapped:false}));f.position.fromArray(point(profile.fittingY,s.xc,s.zc,side));f.userData.base=f.position.toArray();fittings.add(f);}
      for(const r of records){r.colourCache=new Map();r.stressMaterial=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,toneMapped:false});r.transparentMaterial=Array.isArray(r.material)?r.material.map(m=>m.clone()):r.material.clone();}
    const pathText={all:'Gold: main spar and lighter false spar. Purple: skin-attached spanwise blade stringers. Green: chordwise ribs (no solved rib stress). Red dots: schematic fitting locations, not detailed joints. The coloured structural surfaces are a solver-based idealisation inside the actual aircraft model.',
      skin:'1 · Aerodynamic pressure acts on the skin. The skin distributes local pressure to ribs and stiffeners, carries longitudinal bending stress, and carries closed-cell shear flow. Upward arrows are illustrative positive-g pressure resultants, not a pressure CFD contour; negative n reverses them.',
      ribs:'2 · Ribs preserve the airfoil shape, support panels/stiffeners and transfer local or concentrated loads into the wing box. They do not replace the spanwise spar. This model includes their mass and spacing but does not solve rib stress; green does not mean low stress.',
      spars:'3 · The main spar at 0.37c has upper/lower caps carrying much of the bending force couple and a web carrying shear. The lighter false spar at 0.73c supports the rear box/control-surface region. Connected skin and webs carry torsional shear around the cells. Stringers share normal load and stabilise the skin; the main and false spars are not equivalent beams.',
      fittings:'4 · Fuselage fittings supply reactions to the accumulated outboard loading. The centre section continues inward of the fittings. Red dots only locate the idealised support stations; joint geometry and stress concentrations are NOT analysed.'};
    function update(settings){
      const field=q('#wing-stress-field').value,skin=q('#wing-skin-view').value,path=q('#wing-load-path').value,visible=q('#wing-show-structure').checked,n=settings.n;
      const frameInv=new THREE.Matrix4().copy(frame.matrixWorld).invert(),v=new THREE.Vector3();
      for(const r of records){
        const wing=/^Wing_[LR]$/.test(r.mesh.name);r.mesh.visible=!wing||skin!=='hidden';if(wing && skin==='hidden')r.ghost.visible=false;
        if(field!=='off'){
          const mat=r.stressMaterial;mat.transparent=wing&&skin==='transparent';mat.opacity=mat.transparent?0.22:1;mat.depthWrite=!mat.transparent;
          const key=field+':'+n;
          if(!r.colourCache.has(key)){
            const tf=new THREE.Matrix4().multiplyMatrices(frameInv,r.mesh.matrixWorld),colors=[];
            for(let i=0;i<r.positions.length;i+=3){v.fromArray(r.positions,i).applyMatrix4(tf);const s=wing?stressAt(profile,[v.x,v.y,v.z],n):null;
              colors.push(...colour(s?(field==='tau'?Math.abs(s.tau):s[field]):null,scale[field],field==='sigma'));}
            r.colourCache.set(key,new THREE.Float32BufferAttribute(colors,3));
          }
          r.mesh.geometry.setAttribute('color',r.colourCache.get(key));r.mesh.material=mat;
        }else if(wing&&skin==='transparent'){
          const mats=Array.isArray(r.transparentMaterial)?r.transparentMaterial:[r.transparentMaterial];for(const m of mats){m.transparent=true;m.opacity=0.16;m.depthWrite=false;}r.mesh.material=r.transparentMaterial;
        }
      }
      internal.visible=visible;
      const shapeKey=JSON.stringify(settings),shapeChanged=shapeKey!==lastShape;
      for(const r of ribOutlines){r.line.visible=q('#wing-show-ribs').checked;const pos=r.line.geometry.attributes.position;
        if(shapeChanged){for(let i=0;i<r.base.length;i+=3)pos.setXYZ(i/3,...deformPoint(Array.from(r.base.subarray(i,i+3)),profile,settings));pos.needsUpdate=true;r.line.geometry.computeBoundingSphere();}}
      for(const r of meshes){
        r.mesh.visible=q('#wing-show-'+r.kind).checked;
        const active=path==='all'||path===r.kind||(path==='skin'&&r.kind==='stringers');
        r.mat.opacity=r.kind==='ribs'?(active?0.26:0.10):(active?1:0.20);r.mat.transparent=r.kind==='ribs'||!active;r.mat.depthWrite=r.kind!=='ribs'&&active;
        const g=r.mesh.geometry,pos=g.attributes.position;
        if(shapeChanged){for(let i=0;i<r.base.length;i+=3){const p=deformPoint(Array.from(r.base.subarray(i,i+3)),profile,settings);pos.setXYZ(i/3,...p);}
          pos.needsUpdate=true;g.computeVertexNormals();g.computeBoundingSphere();}
        if(field!=='off'&&r.kind!=='ribs'){
          const colors=r.values.flatMap(s=>colour(s && s[field==='tau'?'tau':field]!=null ? (field==='tau'?Math.abs(n*s.tau):field==='vm'?Math.abs(n)*s.vm:n*s.sigma):null,scale[field],field==='sigma'));
          g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));r.mesh.material=r.stress;r.stress.transparent=!active;r.stress.opacity=active?1:0.20;r.stress.depthWrite=active;
        }else r.mesh.material=r.mat;
      }
      lastShape=shapeKey;
      arrows.visible=path==='skin';for(const a of arrowRecords){a.arrow.position.fromArray(deformPoint(a.p,profile,settings));a.arrow.setDirection(new THREE.Vector3(0,Math.sign(n),0));}
      fittings.visible=path==='fittings'||path==='all';for(const f of fittings.children)f.position.fromArray(deformPoint(f.userData.base,profile,settings));
      q('#wing-load-path-text').textContent=pathText[path];
      const bar=field==='sigma'?'linear-gradient(90deg,#0d40d9,#f0f0e6,#e6190f)':'linear-gradient(90deg,#0d40d9,#0dbfcc,#fad91a,#e6190f)';
      q('#wing-stress-legend').innerHTML=field==='off'?'Member colours identify roles; they are not stress values.':`<div style="height:14px;background:${bar};margin:8px 0"></div>${field==='sigma'?`−${scale[field].toFixed(1)} compression · 0 · +${scale[field].toFixed(1)} tension`:`0 · ${scale[field].toFixed(1)} MPa maximum scale`} (fixed MPa scale). Grey = unavailable. Caps/stringers: normal stress only; their shear is unavailable.`;
      const overlay=q('#wing-stress-overlay');overlay.style.display=field==='off'&&!visible?'none':'block';
      overlay.innerHTML=field==='off'?'Idealised cutaway<br>Gold: spars · purple: stringers<br>Green: ribs (stress not solved)':`${field==='sigma'?'σ · blue compression, red tension':field==='tau'?'|τ| · shear magnitude':'Equivalent stress'} · n = ${n}<div style="height:8px;background:${bar};margin:4px 0"></div>${field==='sigma'?`−${scale[field].toFixed(1)} … +${scale[field].toFixed(1)}`:`0 … ${scale[field].toFixed(1)}`} MPa · grey: unavailable`;
      if(field==='off'){q('#wing-stress-max').textContent='Select a stress field to report calculated peak locations.';return;}
      const peaks={skin:null,web:null,cap:null,stringer:null};
      const add=(kind,s,value)=>{if(value==null)return;if(!peaks[kind]||Math.abs(value)>Math.abs(peaks[kind].value))peaks[kind]={y:s.y,value};};
      for(const s of st){for(const w of s.walls){const [xa,za]=s.nodes[w.a],[xb,zb]=s.nodes[w.b],sig=n*normal(s,(xa+xb)/2,(za+zb)/2),tau=n*w.tau;
          add(['u','l'].includes(w.kind)?'skin':'web',s,field==='sigma'?sig:field==='tau'?Math.abs(tau):Math.hypot(sig,Math.sqrt(3)*tau));}
        for(const c of s.caps)add('cap',s,field==='tau'?null:field==='sigma'?n*c.sigma:Math.abs(n*c.sigma));
        for(const c of s.stringers)add('stringer',s,field==='tau'?null:field==='sigma'?n*c.sigma:Math.abs(n*c.sigma));}
      q('#wing-stress-max').textContent=Object.entries(peaks).map(([kind,p])=>p?`${kind}: peak ${p.value.toFixed(2)} MPa at |y| = ${p.y.toFixed(2)} m`:`${kind}: shear not solved`).join(' · ')+'. Peaks are sampled section/panel results, not rivet-hole or rib stresses.';
    }
    for(const id of ['wing-stress-field','wing-skin-view','wing-show-structure','wing-show-spars','wing-show-ribs','wing-show-stringers','wing-load-path']){
      const el=q('#'+id);el.disabled=false;el.addEventListener('change',refresh);
    }
    q('#wing-cutaway').disabled=false;q('#wing-cutaway').addEventListener('click',()=>{
      q('#wing-skin-view').value='hidden';q('#wing-show-structure').checked=true;for(const k of ['spars','ribs','stringers'])q('#wing-show-'+k).checked=true;
      camera.position.set(-8,4,-1);controls.target.set(-2.7,1.5,3.1);controls.update();refresh();
    });
    q('#wing-structure-camera').disabled=false;q('#wing-structure-camera').addEventListener('click',()=>{camera.position.set(-8,4,-1);controls.target.set(-2.7,1.5,3.1);controls.update();});
    return {update,internal,meshes,scale};
  }
  const api={bracket,normal,stressAt,colour,limits,mount};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.D520WingStructure=api;
})(typeof window==='object'?window:globalThis);
