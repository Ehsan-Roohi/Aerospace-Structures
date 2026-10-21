"""Independent closed-form, matrix, stress and browser-engine checks for Lecture 04."""
import ast
import json
from pathlib import Path
import subprocess
import numpy as np
import nbformat

ROOT=Path(__file__).resolve().parents[1]
path=ROOT/'notebooks/MIE446_Lecture_04_Mohr_Circle_Virtual_Work_and_Unit_Load.ipynb'
nb=json.loads(path.read_text(encoding='utf-8'))
nbformat.validate(nbformat.from_dict(nb))
env={}
exec(nb['cells'][1]['source'],env)
for c in nb['cells']:
    if c['cell_type']=='code' and 'def fe_solution(' in c['source']:
        tree=ast.parse(c['source'])
        exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef)],type_ignores=[]),'FE definitions','exec'),env)
force,fe,disp=env['force_solution'],env['fe_solution'],env['beam_displacement']
for a in [45.,135.,225.,292.5,405.]:
    for P in [-2.,0.,2.,4.]:
        s=force(450.,2000.,20.,10.,P,a);L=s['L'];EI=s['EI']
        RB=-P*a*a*(3*L-2*a)/L**3;CB=P*a*a*(L-a)/L**2
        exact=np.array([-P-RB,-P*a*(L-a)**2/L**2,RB,CB])
        np.testing.assert_allclose([s['RA'],s['CA'],s['RB'],s['CB']],exact,atol=1e-10)
        np.testing.assert_allclose(s['F'],np.array([[L**3/3,L**2/2],[L**2/2,L]])/EI,atol=1e-12)
        np.testing.assert_allclose(s['compatibility'],0,atol=1e-12)
        x=np.linspace(0,L,103)
        for n in [2,10,30,40]:
            r=fe(L,EI,P,a,n)
            np.testing.assert_allclose(r['r'][r['fixed']],exact,atol=5e-7)
            np.testing.assert_allclose(r['evaluate'](x),disp(x,s),atol=1e-8)
            np.testing.assert_allclose(r['energy'],.5*P*disp(a,s),atol=1e-9)
baseline=force(450,2000,20,10,2,225)
assert abs(disp(225,baseline)-.284765625)<1e-12
for E,h,scale in [(4000,10,.5),(2000,20,.125)]:
    s=force(450,E,20,h,2,225)
    np.testing.assert_allclose([s['RA'],s['CA'],s['RB'],s['CB']],[-1,-112.5,-1,112.5])
    np.testing.assert_allclose(disp(225,s),.284765625*scale)
M=float(env['beam_moment'](75,baseline));V=1.;z=2.5;I=baseline['I']
sx=-M*z/I;txz=-1.5*V/200*(1-(2*z/10)**2)
np.testing.assert_allclose([sx,txz],[.05625,-.005625])
for S in [np.array([[40,15],[15,10]]),np.array([[sx,txz],[txz,0]])]:
    for angle in [0,25,45,90,137]:
        a=np.deg2rad(angle);Q=np.array([[np.cos(a),np.sin(a)],[-np.sin(a),np.cos(a)]])
        rotated=Q@S@Q.T
        np.testing.assert_allclose(np.linalg.eigvalsh(rotated),np.linalg.eigvalsh(S),atol=1e-12)
        C=np.trace(S)/2;R=np.hypot((S[0,0]-S[1,1])/2,S[0,1])
        assert np.isclose((rotated[0,0]-C)**2+rotated[0,1]**2,R**2)

# Actual current browser engine: direct solve and explanatory force method.
engine=ROOT/'computational/printed-wing-solver/web/beam_learning_engine.js'
js='''const B=require(process.argv[1]);const o={length:450,E:2000,density:1.24,elements:30,
section:{shape:'rectangle',width:20,height:10},supports:[{x:0,kind:'fixed'},{x:450,kind:'fixed'}],
loads:[{kind:'point',position:225,force:2}],selfWeight:false,modes:false};
const r=B.solve(o),f=B.forceMethod(o);console.log(JSON.stringify({reactions:r.reactions,
field:B.fieldAt(r,225),fm:f,probe:B.fieldAt(r,75)}));'''
output=subprocess.run(['node','-e',js,str(engine)],check=True,capture_output=True,text=True)
r=json.loads(output.stdout)
np.testing.assert_allclose([[q['force'],q['moment']] for q in r['reactions']],[[-1,-112.5],[-1,112.5]],atol=1e-6)
assert abs(r['field']['v']-.284765625)<1e-8
assert r['fm']['mismatch']<1e-8
assert [q['type'] for q in r['fm']['redundants']]==['theta','v']
np.testing.assert_allclose(r['fm']['X'],[112.5,-1],atol=1e-6)
F=np.array(r['fm']['flexibility'])[np.ix_([1,0],[1,0])]
np.testing.assert_allclose(F,baseline['F'],atol=1e-9)
assert abs(r['probe']['M']-M)<1e-7 and abs(r['probe']['V']-V)<1e-7
figures=0
for c in nb['cells']:
    if c['cell_type']=='code':
        compile(c['source'],str(path),'exec')
        assert c['execution_count'] is not None
        assert not any(o['output_type']=='error' for o in c['outputs'])
        figures+=sum('image/png' in o.get('data',{}) for o in c['outputs'])
assert figures>=7
assert len({c['id'] for c in nb['cells']})==len(nb['cells'])
print(f'PASS: {len(nb["cells"])} cells, {figures} saved figures; 80 FE comparisons, closed-form reactions, energy, compatibility, Mohr invariance and actual app-engine/force-method agreement.')
