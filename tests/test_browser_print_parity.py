"""Independent CadQuery and binary-STL checks for the browser print path."""
import json
import struct
import subprocess
from pathlib import Path
import pytest
from mie446_wing import WingParameters, BondedSparSpec, build_wing
from mie446_wing.geometry import exact_bounding_box
from mie446_wing.cad_metrics import adaptive_volume
ROOT=Path(__file__).parents[1]

@pytest.mark.slow
def test_browser_mesh_matches_cad_and_union_volume(tmp_path):
    script=r"""
import Module from './computational/printed-wing-solver/web/vendor/manifold-3.5.4/manifold.js';
import P from './computational/printed-wing-solver/web/wing_print_mesh.js';
import fs from 'node:fs';import path from 'node:path';
const m=await Module();m.setup();const base={naca:'0020',semiSpan:260,rootChord:180,tipChord:80,skin:.8,cavityEnd:.8,modules:1,rodFractions:[],interiorRibs:3};
for(const shape of ['linear','elliptic','delta','elliptic-spar']){
 const geometry={...base,planform:shape.split('-')[0]};
 if(shape.endsWith('-spar'))geometry.spars=[{fraction:.35,length:260,topWidth:8,topThickness:.8,bottomWidth:8,bottomThickness:.8,webThickness:.6,material:{name:'PLA',E:2000,nu:.35,rho:1.24,ft:15,fc:50,fs:10}}];
 const r=await P.build({geometry},m);fs.writeFileSync(path.join(process.argv[1],shape+'.stl'),Buffer.from(r.files[0].bytes));fs.writeFileSync(path.join(process.argv[1],shape+'.json'),JSON.stringify(r.report));
}
"""
    subprocess.run(['node','--input-type=module','-e',script,str(tmp_path)],cwd=ROOT,check=True,capture_output=True,text=True,encoding='utf-8',timeout=120)
    for name in ['linear','elliptic','delta','elliptic-spar']:
        shape=name.split('-')[0]
        p=WingParameters(planform=shape,naca='0020',root_chord_mm=180,tip_chord_mm=80,semi_span_mm=260,skin_mm=.8,cavity_x_end=.8,module_count=1,spars=(),interior_rib_count=3,sweep_reference_fraction=.5 if shape=='elliptic' else 1 if shape=='delta' else 0,bonded_spars=(BondedSparSpec(.35,260,8,.8,8,.8,.6),) if name.endswith('-spar') else ())
        cad=build_wing(p)
        # A Boolean union cannot create more material than its inputs contain.
        total_inputs=adaptive_volume(cad.skin)+sum(adaptive_volume(x) for x in cad.ribs+cad.bonded_spars)
        cad_volume=adaptive_volume(cad.complete)
        assert cad_volume<=total_inputs+max(.1,1e-5*total_inputs)
        report=json.loads((tmp_path/(name+'.json')).read_text())
        assert report['plasticVolumeMm3']==pytest.approx(cad_volume,rel=.02)
        box=exact_bounding_box(cad.complete)
        for actual,expected in zip(report['modules'][0]['sizeMm'],[box.xlen,box.ylen,box.zlen]):
            assert actual==pytest.approx(expected,abs=.15)
        # No JS mesh parser, triangulator or topology helper is reused here.
        data=(tmp_path/(name+'.stl')).read_bytes();count=struct.unpack_from('<I',data,80)[0]
        assert len(data)==84+50*count
        edges={};volume=0
        for i in range(count):
            row=struct.unpack_from('<12fH',data,84+50*i);verts=[tuple(row[3+3*j:6+3*j]) for j in range(3)];a,b,c=verts
            assert len(set(verts))==3
            volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6
            for j in range(3):
                a,b=verts[j],verts[(j+1)%3];key=tuple(sorted([a,b]));n,sign=edges.get(key,(0,0));edges[key]=(n+1,sign+(1 if a<b else -1))
        assert all(n==2 and sign==0 for n,sign in edges.values())
        assert volume==pytest.approx(report['plasticVolumeMm3'],abs=.001)
