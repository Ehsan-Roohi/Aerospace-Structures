"""Review build only. Preserve existing UI; port guarded zero-tip source edits."""
from pathlib import Path
import difflib,hashlib,json,re,subprocess
R=Path(__file__).resolve().parents[2]; app=R/'docs/wing-panel-stress-analyzer'; web=R/'computational/printed-wing-solver/web'
page=(app/'index.html').read_text(encoding='utf-8');before=page
def module(text,name):
    if name=='WingStudyIO':
        start=text.index(';(function (root, factory)');end=text.index('\n}));',start)+len('\n}));\n');return start,end,text[start:end]
    start=text.index('const '+name+' =');m=re.search(r"if\s*\([^\n]*module\.exports\s*=\s*"+name+r";[^\n]*\n?",text[start:])
    if not m:raise RuntimeError('Missing export '+name)
    return start,start+m.end(),text[start:start+m.end()]
def replace_module(text,name,source):
    a,b,_=module(text,name);_,_,new=module(source,name);return text[:a]+new+text[b:]
patches=[]
def change_source(name,edits):
    global page
    a,b,old=module(page,name);new=old
    for x,y in edits:
        if x not in new:
            if y in new:continue
            raise RuntimeError('Missing unique source fragment: '+x[:80])
        if new.count(x)!=1:raise RuntimeError('Ambiguous source fragment '+x[:80])
        new=new.replace(x,y)
    page=page[:a]+new+page[b:];return old,new
old,new=change_source('WingEngine',[
 ("      if(input.aeroLoad!=null)restrictions.push('Six-component aerodynamic loads need the spatial beam, which is not available for an exact zero-chord tip (section-stress study only). Use a finite tip chord.');\n",""),
 ("Exact apex stress and deformation are unresolved; torsion, shear, local buckling and 3-D stress concentrations are not assessed.","Exact-apex stress is undefined. Nominal transverse bending components are available; torsion, shear, local buckling, full displacement and 3-D stress concentrations are not assessed.")])
patches.extend(difflib.unified_diff(old.splitlines(True),new.splitlines(True),fromfile='a/computational/printed-wing-solver/aerostruct/engine.js',tofile='b/computational/printed-wing-solver/aerostruct/engine.js'))
old,new=change_source('WingStudyIO',[
 ("if (!own(lv, 'roundedTip') || lv.roundedTip === null) issues.err(join(p, 'roundedTip'), 'must be the rounded-tip record {length_mm, start_mm, strips}: an applied aerodynamic load is solved with the rounded tip (a flat tip cap leaves its pressure out of the load; an exact zero-chord tip cannot take the load)');\n        else {",
  "if (geometry?.tipChord===0&&['delta','elliptic'].includes(geometry.planform)&&lv.roundedTip===null) { /* Exact closed tip: no artificial rounded-tip record. */ }\n        else if (!own(lv, 'roundedTip') || lv.roundedTip === null) issues.err(join(p, 'roundedTip'), 'must be the rounded-tip record for a nonzero-tip aerodynamic wing');\n        else {")])
patches.extend(difflib.unified_diff(old.splitlines(True),new.splitlines(True),fromfile='a/computational/printed-wing-solver/aerostruct/wing_study_io.js',tofile='b/computational/printed-wing-solver/aerostruct/wing_study_io.js'))
for name,source in [('WingClosedTipStress',web/'wing_closed_tip_stress.js'),('WingAeroPanel',app/'wing-aero/wing_aero_panel.js'),('WingAeroUI',app/'ui/wing-aero-ui.js')]:page=replace_module(page,name,source.read_text(encoding='utf-8'))
old="function aeroWithheldMessage(result=R){return aeroTorqueWithheld(result)?"
new="function aeroWithheldMessage(result=R){if(result?.aeroAdmission?.mode==='closed-tip-rigid-load-sectional-response')return 'Exact-tip sectional response: nominal normal stress and pure-bending components only. Torsional stiffness, shear-centre torque and aeroelastic feedback are not assessed; exact-apex stress is undefined.';return aeroTorqueWithheld(result)?"
if old in page:
    page=page.replace(old,new)
    patches.extend(difflib.unified_diff([old+'\n'],[new+'\n'],fromfile='a/computational/printed-wing-solver/aerostruct/wing_aerostruct_template.html',tofile='b/computational/printed-wing-solver/aerostruct/wing_aerostruct_template.html'))
for old,new in [
    ("if(r.analysis3D?.aeroLoad&&!r.aeroNamed)return `Aerodynamic panel load (${r.analysis3D.aeroLoad.label}; six components)${r.load.kind==='custom'&&!r.load.items.filter(p=>!p.gravity).length&&!r.load.sourceLoad?'':' + '+wingLoadName({...r,aeroNamed:true})}`;",
     "if(r.analysis3D?.aeroLoad&&!r.aeroNamed){const other=r.load.sourceLoad||r.load,hasOther=other.selfWeight||(other.kind==='custom'?other.items.some(p=>!p.gravity):other.kind==='tip'?other.tipForce!==0:true);return `Aerodynamic panel load (${r.analysis3D.aeroLoad.label}; six components)${hasOther?' + '+wingLoadName({...r,aeroNamed:true}):''}`;}"),
    ("if(r.load.sourceLoad)return wingLoadName({...r,load:r.load.sourceLoad})+' + 1-g wing self-weight';","if(r.load.sourceLoad)return wingLoadName({...r,load:r.load.sourceLoad})+(r.load.gravitySummary?' + 1-g wing self-weight':'');")]:
    if old in page:
        page=page.replace(old,new)
        patches.extend(difflib.unified_diff([old+'\n'],[new+'\n'],fromfile='a/computational/printed-wing-solver/aerostruct/wing_aerostruct_template.html',tofile='b/computational/printed-wing-solver/aerostruct/wing_aerostruct_template.html'))
# Preserve complete source lines and context in a replayable source-port patch.
# Exclude inlined libraries from the template diff: their owned sources carry
# those edits separately, and the template normally contains build placeholders.
page=page.replace("b.tip.slopeFinite?'Finite tip slope.':'Exact-tip slope is unbounded; global small-rotation assumptions fail.'", "b.tip.slopeStatus==='undetermined-leading-cancellation'?'Exact-tip slope is undetermined; global small-rotation validity is not established.':b.tip.slopeFinite?'Finite tip slope.':'Exact-tip slope is unbounded; global small-rotation assumptions fail.'")
page=page.replace("${bending.tip.slopeFinite?'Finite':'Unbounded'}", "${bending.tip.slopeStatus==='undetermined-leading-cancellation'?'Undetermined; withheld':bending.tip.slopeFinite?'Finite':'Unbounded'}")
page=page.replace('nominal spanwise normal stress · prescribed loads · exact apex undefined', "nominal spanwise normal stress · ${R.analysis3D.aeroLoad?'six-component rigid-wing aerodynamic load':'prescribed loads'} · exact apex undefined")
baseline=subprocess.check_output(['git','show','HEAD:docs/wing-panel-stress-analyzer/index.html'],cwd=R).decode('utf-8').replace('\r\n','\n')
port_parts=[]
for name,filename in [('WingEngine','engine.js'),('WingStudyIO','wing_study_io.js')]:
    old=module(baseline,name)[2];new=module(page,name)[2]
    port_parts.extend(difflib.unified_diff(old.splitlines(True),new.splitlines(True),fromfile='a/computational/printed-wing-solver/aerostruct/'+filename,tofile='b/computational/printed-wing-solver/aerostruct/'+filename))
old_template,new_template=baseline,page
for name in ['WingEngine','WingStudyIO','WingClosedTipStress','WingAeroPanel','WingAeroUI']:
    for which in ['old','new']:
        text=old_template if which=='old' else new_template
        a,b,_=module(text,name);text=text[:a]+'/* SOURCE LIBRARY '+name+' */\n'+text[b:]
        if which=='old':old_template=text
        else:new_template=text
port_parts.extend(difflib.unified_diff(old_template.splitlines(True),new_template.splitlines(True),fromfile='a/computational/printed-wing-solver/aerostruct/wing_aerostruct_template.html',tofile='b/computational/printed-wing-solver/aerostruct/wing_aerostruct_template.html'))
(app/'ui/09-zero-tip-structural-transfer.patch').write_text(''.join(port_parts),encoding='utf-8')
(app/'index.html').write_text(page,encoding='utf-8',newline='\n')
alias=R/'docs/wing-panel-stress-analyzer/wing-lab.html'
if alias.exists():alias.write_text(page,encoding='utf-8',newline='\n')
# The worker runs the same aerodynamic solver; only its public transfer helper
# is updated. Panel pressure/influence equations are unmodified.
bundle=app/'wing-aero/aero_bundle.js';data=bundle.read_text(encoding='utf-8')
bundle.write_text(replace_module(data,'WingAeroPanel',(app/'wing-aero/wing_aero_panel.js').read_text(encoding='utf-8')),encoding='utf-8',newline='\n')
print(json.dumps({'before_sha256':hashlib.sha256(before.encode()).hexdigest(),'review_sha256':hashlib.sha256(page.encode()).hexdigest(),'published':False},indent=2))
