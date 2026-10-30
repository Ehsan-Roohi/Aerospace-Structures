"""Sync reviewed UI modules and apply display-only improvements to the deployed bundle.

Run once against the 0.3.3 page. No panel/structural numerical kernel is changed.
The checked-in page and alias remain the executable source of the template edits.
"""
from pathlib import Path
import subprocess, difflib

ROOT=Path(__file__).resolve().parents[2]
APP=ROOT/'docs/wing-panel-stress-analyzer'
BASE='d8841c3'  # Published 0.3.3 baseline; this is a one-time migration.
page=(APP/'index.html').read_text(encoding='utf-8')

def once(old,new):
    global page
    assert page.count(old)==1, (old[:90],page.count(old))
    page=page.replace(old,new)

# Preserve the currently deployed higher-order Help and rounded-tip labels in
# the editable modules, then use those modules verbatim in the bundle.
old=subprocess.check_output(['git','show',BASE+':docs/wing-panel-stress-analyzer/ui/wing-aero-ui.js'],cwd=ROOT).decode().replace('\r\n','\n').strip()
once(old,(APP/'ui/wing-aero-ui.js').read_text(encoding='utf-8').strip())
for name,next_marker in [('wx-aero-results.js','/* Wing AeroStruct UI shell:'),('wx-shell.js','</script>')]:
    source=(APP/'ui'/name).read_text(encoding='utf-8').strip()
    a=page.index(source[:80]);b=page.index(next_marker,a+1)
    page=page[:a]+source+'\n\n'+page[b:]
old=subprocess.check_output(['git','show',BASE+':docs/wing-panel-stress-analyzer/ui/wx-shell.css'],cwd=ROOT).decode().replace('\r\n','\n').strip()
once(old,(APP/'ui/wx-shell.css').read_text(encoding='utf-8').strip())
before=page

# A rib is a convenient section location, not a separate aerodynamic body.
once("    $('#wpPick').setAttribute('aria-pressed',String(partPick));", """    let sectionButton=$('#wpAnalyzeSection');
    if(!sectionButton){sectionButton=el('button',{id:'wpAnalyzeSection',type:'button',class:'btn',text:'Analyze this section (2D)'});host.append(sectionButton);sectionButton.onclick=()=>{if(partSelection?.kind!=='rib')return;const y=partSelection.station;printedWorkspace?.close();window.dispatchEvent(new CustomEvent('wing-open-2d-section',{detail:{y}}));};}
    sectionButton.hidden=partSelection?.kind!=='rib';sectionButton.disabled=running;
    $('#wpPick').setAttribute('aria-pressed',String(partPick));""")
once("    studyFiles: () => studyFiles, aero: () => wingAero,", """    studyFiles: () => studyFiles, aero: () => wingAero,
    deformation: () => ({enabled:!!S.deformed,multiplier:R?(deformAmount().scale||0):0,visualOnly:true}),""")

# Cache identical field evaluations per mesh and solved result. No interpolation,
# section point, stress formula or value is changed. Re-solving invalidates it.
once('  let range = { min: 0, max: 1 };', """  function meshFieldValues(mesh,kind){
    const u=mesh.userData,key=kind+':'+S.stressComponent;
    if(u.fieldResult!==R){u.fieldResult=R;u.fieldValues=new Map();}
    if(!u.fieldValues.has(key)){const values=new Float64Array(u.by.length);for(let i=0;i<values.length;i++)values[i]=fieldValue(u.by[i],u.bx[i],u.bz[i],kind,u);u.fieldValues.set(key,values);}
    return u.fieldValues.get(key);
  }
  function finishContour(mesh){const a=mesh.geometry.attributes;if(a.wingFraction){a.wingFraction.needsUpdate=true;a.wingValid.needsUpdate=true;}}
  let range = { min: 0, max: 1 };""")
once("valid.array[i]=selected?(Number.isFinite(value)?1:0):-1;f.needsUpdate=true;valid.needsUpdate=true;", "valid.array[i]=selected?(Number.isFinite(value)?1:0):-1;")
once('for (const m of meshes) { const u = m.userData; for (let i = 0; i < u.by.length; i++) { const v = fieldValue(u.by[i], u.bx[i], u.bz[i], kind,u);', 'for (const m of meshes) { const u = m.userData,values=meshFieldValues(m,kind); for (let i = 0; i < u.by.length; i++) { const v = values[i];')
once('const u=m.userData,pos=m.geometry.attributes.position.array,col=m.geometry.attributes.color.array;', 'const u=m.userData,pos=m.geometry.attributes.position.array,col=m.geometry.attributes.color.array,values=kind?meshFieldValues(m,kind):null;')
once('const value=selected?fieldValue(u.by[i],u.bx[i],u.bz[i],kind,u):null;', 'const value=selected?values[i]:null;')
once('m.geometry.attributes.position.needsUpdate=true;m.geometry.attributes.color.needsUpdate=true;m.geometry.computeVertexNormals();m.geometry.computeBoundingSphere();', 'finishContour(m);m.geometry.attributes.position.needsUpdate=true;m.geometry.attributes.color.needsUpdate=true;m.geometry.computeVertexNormals();m.geometry.computeBoundingSphere();')
once('const colorOf = (y, x, z, base,member) => {\n      if (!useField) return base;\n      const v = fieldValue(y, x, z, kind,member);', 'const visualScale=deformAmount().scale;\n    const colorOf = (v, base) => {\n      if (!useField) return base;')
once("deformAmount().scale*at(R.chordwiseDeflection,y):0);\n    };", "visualScale*at(R.chordwiseDeflection,y):0);\n    };")
once('const isRod = u.kind === "rod";\n      for (let i', 'const isRod = u.kind === "rod",values=useField?meshFieldValues(m,kind):null;\n      for (let i')
once('contourSample(m,i,useField?fieldValue(u.by[i],u.bx[i],u.bz[i],kind,u):0,useField&&kind!==\'fos\'&&(S.plot!==\'stress\'||selectedStress));', 'contourSample(m,i,useField?values[i]:0,useField&&kind!==\'fos\'&&(S.plot!==\'stress\'||selectedStress));')
once('selectedStress ? colorOf(u.by[i],u.bx[i],u.bz[i],base[u.kind],u)', 'selectedStress ? colorOf(values[i],base[u.kind])')
once('isRod?base.rod:colorOf(u.by[i],u.bx[i],u.bz[i],base[u.kind],u);', 'isRod?base.rod:colorOf(values?.[i],base[u.kind]);')
once('      m.geometry.attributes.position.needsUpdate = true;\n      m.geometry.attributes.color.needsUpdate = true;', '      finishContour(m);\n      m.geometry.attributes.position.needsUpdate = true;\n      m.geometry.attributes.color.needsUpdate = true;')

# Do not draw an unchanged GPU frame sixty times per second. OrbitControls
# returns true while the camera/damping is moving; animated modes stay live.
once('  let lastT = performance.now();\n  function loop(t) {', '  let lastT = performance.now(),lastStaticPaint=0,sceneDirty=true;\n  function loop(t) {')
once('|| document.hidden || running || $("#app > main.view")', '|| document.hidden || running || resultRendering || $("#app > main.view")')
once('    controls.update();\n    renderAircraftAxes();', "    const cameraMoving=controls.update();\n    if(!sceneDirty&&!cameraMoving&&S.plot!=='mode'&&t-lastStaticPaint<250){lastT=t;requestAnimationFrame(loop);return;}\n    sceneDirty=false;lastStaticPaint=t;\n    renderAircraftAxes();")
once('  function applyResultNow() {\n    updateModel();', '  function applyResultNow() {\n    sceneDirty=true;\n    updateModel();')

port=''.join(difflib.unified_diff(before.splitlines(keepends=True),page.splitlines(keepends=True),fromfile='a/docs/wing-panel-stress-analyzer/index.html',tofile='b/docs/wing-panel-stress-analyzer/index.html'))
(APP/'ui/10-student-feedback-display.patch').write_text(port,encoding='utf-8',newline='\n')
for name in ['index.html','wing-lab.html']:(APP/name).write_text(page,encoding='utf-8',newline='\n')
print('Synced UI sources and display-only template edits; numerical kernels unchanged.')
