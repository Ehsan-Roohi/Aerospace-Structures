"""Finish case-specific solid/beam evidence without private absolute paths."""
from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
from pathlib import Path
import sys

import numpy as np

from wing_solid_benchmark import CRITERIA,ROOT,digest,write_json,emit
from wing_solid_two_rhs import TORQUE_CRITERIA


def read(path):return json.loads(Path(path).read_text(encoding='utf-8'))


def source_digest(path):
    """Match Git-normalized text rather than platform checkout CRLF bytes."""
    return hashlib.sha256(Path(path).read_bytes().replace(b'\r\n',b'\n')).hexdigest()


def relative(a,b,floor=1e-30):return abs(a-b)/max(abs(b),floor)


def nominal_at(cut,positions):
    local=(positions-np.array(cut['reference']))@np.array(cut['R']).T
    return np.column_stack([np.ones(len(positions)),local[:,1],local[:,2]])@np.array(cut['normal_stress_affine_coefficients'])


def stress_comparison(reference,coarse,fine,channel,E):
    if not (len(reference)==len(coarse)==len(fine)==3):
        raise RuntimeError('All three fixed complete normal cuts are required on both meshes')
    comparisons=[]
    for b,c,f in zip(reference,coarse,fine):
        if (b['y'],c['y'])!=(f['y'],f['y']):raise RuntimeError('Comparison stations differ')
        if np.linalg.norm(np.array(b['reference'])-np.array(f['reference']))>1e-9 or np.linalg.norm(np.array(b['R'])-np.array(f['R']))>1e-9:
            raise RuntimeError('Stale physical cut: regenerate against this beam reference')
        q=np.array(f['positions_mm']);w=np.array(f['weights_mm2'])
        if not len(w) or not np.all(np.isfinite(w)) or not np.all(w>0):
            raise RuntimeError('Invalid actual-material cut quadrature weights')
        local=(q-np.array(b['reference']))@np.array(b['R']).T
        strain=b[channel]['strain']
        beam=E*(strain[0]+strain[1]*local[:,2]-strain[2]*local[:,1])
        actual=nominal_at(f,q);previous=nominal_at(c,q)
        scale=max(float(np.dot(w,actual**2)),1e-30)
        l2_mesh=float(np.sqrt(np.dot(w,(previous-actual)**2)/scale))
        l2_beam=float(np.sqrt(np.dot(w,(beam-actual)**2)/scale))
        beam_rms=float(np.sqrt(np.dot(w,beam**2)/w.sum()))
        raw=np.array(f['normal_stress_MPa']);raw_scale=max(float(np.dot(w,raw**2)),1e-30)
        raw_error=float(np.sqrt(np.dot(w,(beam-raw)**2)/raw_scale))
        raw_rms_error=float(np.sqrt(np.dot(w,(beam-raw)**2)/w.sum()))
        raw_rms=float(np.sqrt(raw_scale/w.sum()))
        affine_residual=float(np.sqrt(np.dot(w,(actual-raw)**2)/raw_scale))
        fine_rms=f['nominal_normal_stress_rms_MPa'];coarse_rms=c['nominal_normal_stress_rms_MPa']
        comparisons.append(dict(y_mm=f['y'],solid_fine_nominal_rms_MPa=fine_rms,
            solid_coarse_nominal_rms_MPa=coarse_rms,beam_nominal_rms_MPa=beam_rms,
            mesh_rms_change_relative=relative(coarse_rms,fine_rms),mesh_affine_weighted_l2_relative=l2_mesh,
            beam_rms_difference_relative=relative(beam_rms,fine_rms),beam_affine_weighted_l2_relative=l2_beam,
            raw_solid_beam_weighted_l2_relative_diagnostic=raw_error,
            raw_solid_beam_rms_error_MPa=raw_rms_error,
            raw_solid_normal_stress_rms_MPa=raw_rms,
            raw_local_15_percent_target_passed=bool(raw_error<=.15),
            solid_affine_fit_residual_relative_diagnostic=affine_residual,
            diagnostic_scope='Raw local stress differences are NOT covered by the fitted nominal-stress agreement gate',
            mesh_pass=bool(max(relative(coarse_rms,fine_rms),l2_mesh)<=CRITERIA['nominal_stress_convergence']),
            beam_pass=bool(max(relative(beam_rms,fine_rms),l2_beam)<=CRITERIA['beam_nominal_stress'])))
    return comparisons


def summarize(out,reference_path,output,plot_path=None):
    beam=read(reference_path);last=beam['runs'][-1]
    if beam['solidLoadReports']['torque']!='pure_tip_My_50Nmm':raise RuntimeError('An actual completed torque solid report is required')
    study=read(out/'slender-study.json');volume=read(out/'cad-volume-reference.json')
    records={}
    sources={}
    for h in [8,5]:
        records[h]={}
        for channel,suffix in [('vertical',''),('torque','-torque')]:
            path=out/f'h{h}{suffix}-solve-report.json'
            records[h][channel]=read(path);sources[path.name]=digest(path)
            sources[f'h{h}{suffix}-solution.npz']=digest(out/f'h{h}{suffix}-solution.npz')
        sources[f'h{h}-mesh.npz']=digest(out/f'h{h}-mesh.npz')
    stress={}
    for channel,suffix in [('vertical',''),('torque','-torque')]:
        coarse=read(out/f'h8{suffix}-cut-stresses.json');fine=read(out/f'h5{suffix}-cut-stresses.json')
        stress[channel]=stress_comparison(last['cuts'],coarse,fine,channel,beam['shellMaterial']['E'])
        for h in [8,5]:sources[f'h{h}{suffix}-cut-stresses.json']=digest(out/f'h{h}{suffix}-cut-stresses.json')
    v8=records[8]['vertical'];v5=records[5]['vertical'];t8=records[8]['torque'];t5=records[5]['torque']
    convergence=dict(uniform_compliance_relative=relative(v8['compliance_mm_per_N'],v5['compliance_mm_per_N']),
        torque_theta_work_relative=relative(t8['theta_work_rad'],t5['theta_work_rad'],1e-7),
        torque_tip_ls_theta_y_relative=relative(t8['tip_rigid_fit']['rotation_rad'][1],t5['tip_rigid_fit']['rotation_rad'][1],1e-7),
        torque_ring_ls_theta_y_relative=relative(t8['ring_rigid_fit']['rotation_rad'][1],t5['ring_rigid_fit']['rotation_rad'][1],1e-7))
    agreement=dict(uniform_compliance_relative=relative(last['vertical']['complianceMmPerN'],v5['compliance_mm_per_N']),
        torque_theta_work_relative=relative(last['torque']['thetaWorkRad'],t5['theta_work_rad'],1e-7),
        beam_uniform_compliance_mm_per_N=last['vertical']['complianceMmPerN'],
        beam_torque_theta_work_rad=last['torque']['thetaWorkRad'])
    mesh_records=[]
    for h in [8,5]:
        admission=read(out/f'h{h}-volume-admission.json');mesh=read(out/f'h{h}-mesh-report.json')
        mesh_records.append(dict(h_mm=h,tetrahedra=mesh['tetrahedra'],displacement_dofs=records[h]['vertical']['dofs'],
            mesh_volume_mm3=mesh['mesh_volume_mm3'],volume_relative_error=admission['relative_volume_error'],geometry_admitted=admission['geometry_admitted'],
            uniform=records[h]['vertical'],torque=records[h]['torque']))
    algebra=all(r[c]['algebra_admitted'] for r in records.values() for c in ['vertical','torque'])
    mesh_pass=all(r['geometry_admitted'] for r in mesh_records) and convergence['uniform_compliance_relative']<=.02 and convergence['torque_theta_work_relative']<=.02 and all(c['mesh_pass'] for cc in stress.values() for c in cc)
    beam_pass=beam['convergence']['passed'] and agreement['uniform_compliance_relative']<=.10 and agreement['torque_theta_work_relative']<=.10 and all(c['beam_pass'] for cc in stress.values() for c in cc)
    raw_local_pass=all(c['raw_local_15_percent_target_passed'] for cc in stress.values() for c in cc)
    global_pass=beam['convergence']['passed'] and agreement['uniform_compliance_relative']<=.10 and agreement['torque_theta_work_relative']<=.10
    packages=['gmsh','scikit-fem','pyamg','numpy','scipy','cadquery','cadquery-ocp','vtk']
    report=dict(format='mie446-case-specific-solid-beam-verification',version=1,
        scope='Numerical comparison on this construction and these two load channels, not experimental printed-material validation or an arbitrary parameter-box bound.',
        geometry=study['study']['geometry'],material=beam['shellMaterial'],root_chord_slenderness=240/60,
        units=dict(length='mm',force='N',stress='MPa',moment='N mm',rotation='rad',energy='N mm'),
        software=dict(python=sys.version.split()[0],packages={p:importlib.metadata.version(p) for p in packages}),
        criteria={**CRITERIA,**TORQUE_CRITERIA},adaptive_cad_volume_mm3=volume['adaptive_volume_mm3'],
        raw_nonadaptive_cad_volume_mm3=volume['default_nonadaptive_volume_mm3'],adaptive_volume_convergence=volume['adaptive_convergence'],
        meshes=mesh_records,solid_mesh_convergence=convergence,beam_mesh_convergence=beam['convergence'],
        beam_solid_agreement=agreement,nominal_normal_stress=stress,
        beam_requested_elements=[r['requestedElements'] for r in beam['runs']],
        beam_actual_elements=[r['vertical']['actualElements'] for r in beam['runs']],
        beam_kinematic_diagnostics={c:{'tip_global_rotation_rad':last[c]['globalTipRotationRad'],
            'ring_axis_only':last[c].get('ringAt85Percent')} for c in ['vertical','torque']},
        passed=dict(algebra=algebra,mesh_convergence=mesh_pass,global_response_agreement=bool(global_pass),
            fitted_nominal_stress_agreement=bool(all(c['beam_pass'] for cc in stress.values() for c in cc)),
            all_nominal_scope_checks=bool(algebra and mesh_pass and beam_pass),
            raw_local_stress_15_percent_target=bool(raw_local_pass),
            full_local_stress_validation=False),
        implementation_hash_normalization='UTF-8 source bytes with CRLF normalized to LF (Git text normalization)',
        implementation_sha256={p:source_digest(ROOT/p) for p in [
            'src/mie446_wing/cad_metrics.py','src/mie446_wing/geometry.py','src/mie446_wing/wing_sections.py',
            'scripts/validation/wing_solid_benchmark.py','scripts/validation/wing_solid_two_rhs.py',
            'scripts/validation/wing_solid_summary.py',
            'scripts/validation/wing_solid_beam_reference.mjs',
            'computational/printed-wing-solver/web/engine.js','computational/printed-wing-solver/web/wing_frame3d.js',
            'computational/printed-wing-solver/web/wing_geometry.js','computational/printed-wing-solver/web/wing_airfoils.js']},
        source_sha256={'study':digest(out/'slender-study.json'),'step':digest(out/'slender-wing.step'),
            'adaptive_volume_reference':digest(out/'cad-volume-reference.json'),'beam_reference':digest(reference_path),**sources},
        limitations=['Equivalent beam-axis clamp differs from actual solid root face',
            'Nominal-scope checks pass, but the 15% raw local torque-stress comparison target fails at all three cuts; fitting an affine stress does not validate local warping stress',
            'Same-wrench beam endpoint force/couple does not resolve detailed solid tip traction',
            'No root/load-edge peak stress, buckling, bond or printed anisotropic failure certification',
            'Fixed interior normal cuts are comparison stations, not a validated Saint-Venant decay length',
            'LS physical-ring rotations and beam reference-axis rotations are not identical observables',
            'No universal error bound for arbitrary DAT airfoils, twist laws or parameter-box interior'])
    write_json(output,report)
    if plot_path:plot_profiles(out,beam,plot_path)
    emit(dict(output=Path(output).name,passed=report['passed'],mesh_convergence=convergence,beam_agreement=agreement,nominal_normal_stress=stress))


def plot_profiles(out,beam,path):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig,axes=plt.subplots(2,3,figsize=(12,7),layout='constrained')
    for row,(channel,suffix,label) in enumerate([('vertical','','Uniform tip +2 N'),('torque','-torque','Pure tip My +50 N mm')]):
        fine=read(out/f'h5{suffix}-cut-stresses.json')
        for ax,f,b in zip(axes[row],fine,beam['runs'][-1]['cuts']):
            q=np.array(f['positions_mm']);local=(q-np.array(b['reference']))@np.array(b['R']).T
            strain=b[channel]['strain'];pred=beam['shellMaterial']['E']*(strain[0]+strain[1]*local[:,2]-strain[2]*local[:,1])
            ax.scatter(local[:,2],f['normal_stress_MPa'],s=4,alpha=.35,color='#263f50',label='P2 solid samples')
            ax.scatter(local[:,2],pred,s=3,alpha=.3,color='#007c91',label='Nominal spatial beam')
            ax.axhline(0,color='#adb7bf',lw=.6);ax.grid(alpha=.15)
            ax.set_title(f'{label} · y={f["y"]:g} mm',fontsize=9)
            ax.set_xlabel('Normal-cut depth coordinate e3 (mm)')
            ax.set_ylabel('Signed normal stress t·σ·t (MPa)')
    axes[0,0].legend(fontsize=8,frameon=False)
    fig.suptitle('Actual hollow station wing: physical signed interior stress samples\nNo root/load-edge peak or arbitrary-airfoil error-bound claim',fontsize=11)
    fig.savefig(path,dpi=170);plt.close(fig)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out',required=True,type=Path);parser.add_argument('--reference',required=True,type=Path)
    parser.add_argument('--output',required=True,type=Path);parser.add_argument('--plot',type=Path)
    a=parser.parse_args();a.output.parent.mkdir(parents=True,exist_ok=True)
    summarize(a.out,a.reference,a.output,a.plot)
