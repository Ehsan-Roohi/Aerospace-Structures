/* Map the verified linear D.520 beam profile onto the existing exterior aircraft mesh.
 * This visualisation changes selected geometry only, never the structural solver or flight controls. */
(function(root){
  'use strict';
  function validate(profile){
    if(!profile || !Array.isArray(profile.stations) || profile.stations.length<2) throw new Error('Missing deformation stations');
    let last=-Infinity;
    for(const s of profile.stations){
      if(!['y','w','slope','twist','axisHeight','axisChord'].every(k=>Number.isFinite(s[k])) || s.y<=last) throw new Error('Invalid deformation profile');
      last=s.y;
    }
    return profile;
  }
  function sample(profile,y){
    const st=profile.stations, first=st[0], last=st[st.length-1];
    if(y<=first.y) return {...first};
    if(y>=last.y){return {...last,y,w:last.w+last.slope*(y-last.y)};}
    let lo=0,hi=st.length-1;
    while(hi-lo>1){const m=(lo+hi)>>1;if(st[m].y<y)lo=m;else hi=m;}
    const a=st[lo],b=st[hi],u=(y-a.y)/(b.y-a.y),out={y};
    for(const k of ['w','slope','twist','axisHeight','axisChord']) out[k]=a[k]+u*(b[k]-a[k]);
    return out;
  }
  function deformPoint(p,profile,{mode='original',n=1,bendScale=1,twistScale=1}={}){
    if(!['original','bending','torsion','both'].includes(mode))throw new Error('Unknown wing deformation');
    if(!p.every(Number.isFinite) || ![n,bendScale,twistScale].every(Number.isFinite))throw new Error('Non-finite deformation input');
    if(mode==='original')return [...p];
    const s=sample(profile,Math.abs(p[0]));
    const theta=(mode==='bending'?0:s.twist*n*twistScale), dy=p[1]-s.axisHeight,dz=p[2]-s.axisChord;
    const w=mode==='torsion'?0:s.w*n*bendScale;
    return [p[0],s.axisHeight+dy*Math.cos(theta)-dz*Math.sin(theta)+w,s.axisChord+dy*Math.sin(theta)+dz*Math.cos(theta)];
  }
  function wingMember(o,frame){
    for(let p=o;p && p!==frame;p=p.parent)if(/^(Wing|Flap|Aileron)_[LR]$/.test(p.name))return true;
    return false;
  }
  async function mount({THREE,root:aircraft,frame,scene,camera,controls,document:doc=root.document,profile:provided}){
    const profile=validate(provided || await (async()=>{const r=await root.fetch('wing_deformation_profile.json');if(!r.ok)throw new Error('Deformation data unavailable');return r.json();})());
    if(!frame)throw new Error('Aircraft reference frame missing');
    const records=[];
    aircraft.traverse(o=>{if(o.isMesh && wingMember(o,frame) && o.geometry.getAttribute('position'))records.push({mesh:o});});
    if(!records.some(r=>/^Wing_[LR]$/.test(r.mesh.name)))throw new Error('Wing geometry missing');
    const blue=new THREE.MeshStandardMaterial({color:0x268bc0,roughness:0.68,metalness:0.1,side:THREE.DoubleSide});
    const grey=new THREE.MeshBasicMaterial({color:0xadb8bd,transparent:true,opacity:0.35,depthWrite:false,side:THREE.DoubleSide});
    for(const r of records){
      r.material=r.mesh.material;
      // Clone to avoid deforming any geometry shared with an unrelated scene node.
      r.mesh.geometry=r.mesh.geometry.clone();
      r.positions=r.mesh.geometry.getAttribute('position').array.slice();
      r.normals=r.mesh.geometry.getAttribute('normal')?.array.slice();
      r.ghost=new THREE.Mesh(r.mesh.geometry.clone(),grey);r.ghost.name=`Original_${r.mesh.name}`;
      r.ghost.matrixAutoUpdate=false;r.ghost.renderOrder=2;r.ghost.visible=false;scene.add(r.ghost);
    }
    let mode='original',pending=null;
    const view=doc.defaultView || root;
    const q=s=>doc.querySelector(s), opts=()=>({mode,n:+q('#wing-flex-n').value,bendScale:+q('#wing-flex-bend').value,twistScale:+q('#wing-flex-twist').value});
    function update(){
      const settings=opts();aircraft.updateMatrixWorld(true);frame.updateMatrixWorld(true);
      const frameInv=new THREE.Matrix4().copy(frame.matrixWorld).invert();
      const v=new THREE.Vector3();
      for(const r of records){
        const mesh=r.mesh, geo=mesh.geometry, pos=geo.getAttribute('position');
        r.ghost.matrix.copy(mesh.matrixWorld);r.ghost.matrixWorldNeedsUpdate=true;
        r.ghost.visible=mode!=='original' && q('#wing-flex-reference').checked;
        if(mode==='original'){
          pos.array.set(r.positions);if(r.normals)geo.getAttribute('normal').array.set(r.normals);
          mesh.material=r.material;
        }else{
          const toFrame=new THREE.Matrix4().multiplyMatrices(frameInv,mesh.matrixWorld);
          const fromFrame=new THREE.Matrix4().copy(toFrame).invert();
          for(let i=0;i<pos.count;i++){
            v.fromArray(r.positions,i*3).applyMatrix4(toFrame);
            v.fromArray(deformPoint([v.x,v.y,v.z],profile,settings)).applyMatrix4(fromFrame);
            pos.setXYZ(i,v.x,v.y,v.z);
          }
          geo.computeVertexNormals();mesh.material=blue;
        }
        pos.needsUpdate=true;if(geo.getAttribute('normal'))geo.getAttribute('normal').needsUpdate=true;
        geo.computeBoundingSphere();geo.computeBoundingBox();
      }
      const end=profile.stations[profile.stations.length-1], physicalW=end.w*settings.n*1000, physicalT=end.twist*settings.n*180/Math.PI;
      q('#wing-flex-bend-value').textContent=`×${settings.bendScale}`;q('#wing-flex-twist-value').textContent=`×${settings.twistScale}`;
      q('#wing-flex-status').textContent=mode==='original'?'Original geometry. Select 3-D bending, torsion or both to compare.':`${mode==='both'?'Bending + torsion':mode==='bending'?'Bending':'Torsion'} on the actual wing mesh. Blue = deformed; transparent grey = original. Engine ${profile.engine}, baseline scaled to ${settings.n} g.`;
      q('#wing-flex-values').textContent=`At rib 1 (y = ${end.y.toFixed(2)} m), before magnification: shear-centre displacement ${physicalW.toFixed(2)} mm; nose-up twist ${physicalT.toFixed(3)}°. ${mode==='original'?'No deformation displayed.':`Displayed bending offset ${(mode==='torsion'?0:physicalW*settings.bendScale/1000).toFixed(3)} m; displayed twist ${(mode==='bending'?0:physicalT*settings.twistScale).toFixed(1)}°. These are exaggerated separately for teaching.`}`;
    }
    function schedule(){if(pending!=null)view.cancelAnimationFrame(pending);pending=view.requestAnimationFrame(()=>{pending=null;update();});}
    doc.querySelectorAll('[data-wing-flex]').forEach(b=>{b.disabled=false;b.addEventListener('click',()=>{
      mode=b.dataset.wingFlex;doc.querySelectorAll('[data-wing-flex]').forEach(x=>{x.setAttribute('aria-pressed',String(x===b));x.classList.toggle('ghost',x!==b);});update();
    });});
    for(const id of ['wing-flex-n','wing-flex-bend','wing-flex-twist','wing-flex-reference']){
      const el=q('#'+id);el.disabled=false;el.addEventListener(el.type==='range'?'input':'change',schedule);
    }
    for(const [id,position] of [['wing-flex-front',[0,3,-17]],['wing-flex-oblique',[-10.5,5,-4.5]]]){
      const el=q('#'+id);el.disabled=false;el.addEventListener('click',()=>{camera.position.set(...position);controls.target.set(0,1.7,3.1);controls.update();});
    }
    update();return {update,records,profile};
  }
  const api={validate,sample,deformPoint,wingMember,mount};
  if(typeof module==='object' && module.exports)module.exports=api;
  else root.D520WingDeformation=api;
})(typeof window==='object'?window:globalThis);
