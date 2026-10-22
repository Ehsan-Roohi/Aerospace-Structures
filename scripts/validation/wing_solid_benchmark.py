"""Independent, optional local 3-D solid benchmark (NOT a student dependency).

Stages run in separate processes to limit CAD/mesher/FE peak memory.  Install
gmsh 4.15.2 and scikit-fem 12.0.2 into an isolated QA directory, not the course
environment. Units: mm, N, MPa. Constitutive model: small-strain isotropic PLA.
No stress singularity, failure, anisotropy, or flightworthiness certification.

Predeclared criteria (do not tune after seeing results): CAD mesh volume .5%;
force/moment equilibrium 1e-5; free residual 1e-7; symmetry 1e-12; energy 1e-7;
finest-pair compliance change 2%, away-root nominal stress change 5%; eventual
beam comparison 10% compliance and 15% nominal normal stress. Root/load-edge
peak stresses are deliberately excluded. Mesh sizes: 12, 8, 5 mm, subject to
local memory admission; the thin walls additionally constrain mesh sizes.

Official APIs: https://gmsh.info/doc/texinfo/gmsh.html ;
https://scikit-fem.readthedocs.io/en/latest/listofexamples.html#example-11
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import time

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
CRITERIA = dict(mesh_volume_relative=.005, force_moment_relative=1e-5,
                residual_relative=1e-7, symmetry_relative=1e-12,
                energy_relative=1e-7, compliance_convergence=.02,
                nominal_stress_convergence=.05, beam_compliance=.10,
                beam_nominal_stress=.15)


def write_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2, allow_nan=False, default=lambda v: v.item()), encoding='utf-8',newline='\n')


def emit(value):
    print(json.dumps(value, allow_nan=False, default=lambda v: v.item()), flush=True)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


CASES={
    'baseline':dict(tip=48,sweep=12,dihedral=6,incidence=(2,-2)),
    'sweep':dict(tip=45,sweep=15,dihedral=0,incidence=(0,0)),
    'dihedral':dict(tip=45,sweep=0,dihedral=10,incidence=(0,0)),
    'combined':dict(tip=45,sweep=15,dihedral=10,incidence=(4,-4)),
    'forward':dict(tip=45,sweep=-15,dihedral=0,incidence=(0,0)),
}


def cad(out,case='baseline'):
    import cadquery as cq
    from mie446_wing import import_wing_lab_study, build_wing, validate_wing
    from mie446_wing.geometry import exact_bounding_box
    from mie446_wing.cad_metrics import adaptive_volume
    source = ROOT / 'tests/fixtures/wing_lab_station_browser.json'
    doc = json.loads(source.read_text(encoding='utf-8'))
    g = doc['study']['geometry']
    settings=CASES[case]
    root = dict(kind='naca5', code='23018')
    tip = dict(kind='naca4', code='0018')
    spar = dict(g['spars'][0])
    spar.update(fraction=.35, length=240, topWidth=4, bottomWidth=4,
                topThickness=.8, bottomThickness=.8, webThickness=.6)
    g.update(semiSpan=240, rootChord=60, tipChord=settings['tip'], modules=1,
             airfoil=root, stations=[dict(eta=0, airfoil=root, incidenceDeg=settings['incidence'][0]),
                                     dict(eta=1, airfoil=tip, incidenceDeg=settings['incidence'][1])],
             customInteriorRibs=[80, 160], rodFractions=[], spars=[spar],
             cavityStart=.10, cavityEnd=.78,sweepDeg=settings['sweep'],dihedralDeg=settings['dihedral'],
             twistEnabled=any(settings['incidence']), sweepReferenceFraction=.25,
             twistReferenceFraction=.25)
    # A benchmark load, not a silent alteration of a student's saved design.
    doc['study']['load']['items'] = [dict(kind='point', position=240, force=2, fraction=.35)]
    doc['study']['analysis'] = dict(nElements=80)
    path = out / 'slender-study.json'
    write_json(path, doc)
    p = import_wing_lab_study(path.read_bytes()).parameters
    start = time.perf_counter()
    wing = build_wing(p)
    validation = validate_wing(wing)
    if not validation.passed:
        raise RuntimeError(str(validation))
    cq.exporters.export(wing.complete, str(out / 'slender-wing.step'))
    box = exact_bounding_box(wing.complete)
    report = dict(case=case, criteria=CRITERIA,
                  elapsed_seconds=time.perf_counter()-start,
                  source_fixture_sha256=digest(source), study_sha256=digest(path),
                  step_sha256=digest(out/'slender-wing.step'),
                  volume_mm3=adaptive_volume(wing.complete),
                  raw_nonadaptive_volume_mm3=wing.complete.Volume(),
                  extents_mm=[box.xlen, box.ylen, box.zlen],
                  valid=wing.complete.isValid(), solids=len(wing.complete.Solids()),
                  E_MPa=2000, nu=.35, span_mm=240, force_N=[0, 0, 2])
    write_json(out/'cad-report.json', report)
    emit(report)


def volume_reference(out):
    """Independent convergence, retaining the inaccurate default for audit."""
    import cadquery as cq
    from OCP.BRepGProp import BRepGProp
    from OCP.GProp import GProp_GProps
    step=out/'slender-wing.step'
    shape=cq.importers.importStep(str(step)).val()
    samples=[]
    for eps in [1e-5,1e-7,1e-9]:
        prop=GProp_GProps()
        error=BRepGProp.VolumeProperties_s(shape.wrapped,prop,eps,True,False)
        samples.append(dict(eps=eps,reported_error=float(error),volume_mm3=prop.Mass()))
    actual=samples[-1]['volume_mm3']
    if max(abs(s['volume_mm3']/actual-1) for s in samples)>1e-8:
        raise RuntimeError('Adaptive B-rep volume reference did not converge independently')
    report=dict(step_sha256=digest(step),default_nonadaptive_volume_mm3=shape.Volume(),
                adaptive_volume_mm3=actual,adaptive_convergence=samples,
                method='OCP BRepGProp adaptive surface Gauss quadrature; no mesh reference or tolerance relaxation')
    write_json(out/'cad-volume-reference.json',report)
    admissions=[]
    for path in out.rglob('*-mesh-report.json'):
        raw=json.loads(path.read_text(encoding='utf-8'))
        if raw['step_sha256']!=report['step_sha256']:
            raise RuntimeError('Mesh/reference STEP hash mismatch')
        relative=abs(raw['mesh_volume_mm3']/actual-1)
        jac=raw.get('minimum_determinant_jacobian',raw['minimum_absolute_six_volume'])
        admission=dict(raw_report=str(path),reference_sha256=digest(out/'cad-volume-reference.json'),
                       relative_volume_error=relative,geometry_admitted=bool(relative<=CRITERIA['mesh_volume_relative'] and jac>0 and raw['negative_orientation_count']==0 and
                           ('curved' not in raw['geometry'] or 'minimum_determinant_jacobian' in raw)),
                       mesh_volume_mm3=raw['mesh_volume_mm3'],adaptive_cad_volume_mm3=actual,
                       unchanged_volume_threshold=CRITERIA['mesh_volume_relative'])
        write_json(path.with_name(path.name.replace('-mesh-report','-volume-admission')),admission)
        admissions.append(admission)
    emit(dict(reference=report,admissions=admissions))


def mesh(out, h,curvature,quadratic):
    import gmsh
    start = time.perf_counter()
    gmsh.initialize()
    try:
        gmsh.option.setNumber('General.NumThreads', 2)
        gmsh.option.setNumber('General.Verbosity', 2)
        gmsh.option.setString('Geometry.OCCTargetUnit', 'MM')
        gmsh.model.occ.importShapes(str(out/'slender-wing.step'))
        gmsh.model.occ.synchronize()
        volumes = gmsh.model.getEntities(3)
        if len(volumes) != 1:
            raise RuntimeError(f'Expected one actual connected CAD volume, got {volumes}')
        raw_gmsh_volume = gmsh.model.occ.getMass(*volumes[0])
        cad_volume=raw_gmsh_volume
        reference_kind='provisional non-adaptive OCC value; run independent volume-reference stage'
        cad_path=out/'cad-report.json'
        if cad_path.exists():
            initial= json.loads(cad_path.read_text(encoding='utf-8'))
            if initial.get('step_sha256')==digest(out/'slender-wing.step') and 'raw_nonadaptive_volume_mm3' in initial:
                cad_volume=initial['volume_mm3']
                reference_kind='adaptive B-rep material volume; independent convergence stage still required'
        gmsh.option.setNumber('Mesh.MeshSizeMax', h)
        gmsh.option.setNumber('Mesh.MeshSizeMin', .4)
        gmsh.option.setNumber('Mesh.MeshSizeFromCurvature', curvature)
        gmsh.option.setNumber('Mesh.MeshSizeExtendFromBoundary', 1)
        gmsh.option.setNumber('Mesh.Algorithm', 6)
        gmsh.option.setNumber('Mesh.Algorithm3D', 1)
        gmsh.model.mesh.generate(3)
        gmsh.model.mesh.optimize('Netgen')
        if quadratic:
            gmsh.model.mesh.setOrder(2)
            gmsh.model.mesh.optimize('HighOrder')
        tags, xyz, _ = gmsh.model.mesh.getNodes()
        order = np.argsort(tags)
        tags, xyz = tags[order], np.asarray(xyz).reshape(-1, 3)[order]
        types, element_tags, nodes = gmsh.model.mesh.getElements(3)
        if list(types) != [11 if quadratic else 4]:
            raise RuntimeError(f'Unexpected tetrahedral element type: {types}')
        tet = np.searchsorted(tags, nodes[0]).reshape(-1, 10 if quadratic else 4)
        if not np.all(tags[tet.ravel()] == nodes[0]):
            raise RuntimeError('Unmapped node tags')
        if quadratic:
            # Match by reference-node coordinates, not an assumed file ordering.
            from skfem import ElementTetP2,MeshTet2,Basis
            gmsh_ref=np.array(gmsh.model.mesh.getElementProperties(11)[4]).reshape(-1,3)
            target=ElementTetP2().doflocs
            perm=[int(np.argmin(np.linalg.norm(gmsh_ref-q,axis=1))) for q in target]
            if np.max(np.linalg.norm(gmsh_ref[perm]-target,axis=1))>1e-10:
                raise RuntimeError('Cannot establish Gmsh/FE quadratic node correspondence')
            tet=tet[:,perm]
        corners = xyz[tet[:,:4]]
        det = np.linalg.det(np.stack([corners[:, i]-corners[:, 0] for i in [1, 2, 3]], axis=2))
        if np.any(np.abs(det) < 1e-14):
            raise RuntimeError('Degenerate tetrahedra')
        mesh_volume = float(np.abs(det).sum()/6)
        if quadratic:
            mapping_mesh=MeshTet2(xyz.T,tet.T)
            mapping_basis=Basis(mapping_mesh,ElementTetP2(),intorder=6)
            mesh_volume=float(mapping_basis.dx.sum())
            jacobian=mapping_basis.mapping.detDF(mapping_basis.X)
            if np.any(jacobian<=0):
                raise RuntimeError('Inverted curved element Jacobian at volume quadrature')
        qualities = gmsh.model.mesh.getElementQualities(element_tags[0], 'minSICN')
        min_jacobians=gmsh.model.mesh.getElementQualities(element_tags[0], 'minDetJac')
        integration_points,integration_weights=gmsh.model.mesh.getIntegrationPoints(int(types[0]),'Gauss6')
        _,gmsh_det,_=gmsh.model.mesh.getJacobians(int(types[0]),integration_points)
        gmsh_volume=float(np.abs(np.asarray(gmsh_det).reshape(-1,len(integration_weights)))@np.asarray(integration_weights) @ np.ones(len(tet)))
        edges = np.unique(np.sort(tet[:, [[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]]].reshape(-1,2), axis=1), axis=0)
        name = f'h{h:g}'
        np.savez_compressed(out/f'{name}-mesh.npz', points=xyz, tetrahedra=tet,quadratic=quadratic)
        report = dict(mesh_size_max_mm=h, curvature_samples_per_circle=curvature,nodes=len(xyz), tetrahedra=len(tet),
                      estimated_vector_P2_dofs=3*(len(xyz) if quadratic else len(xyz)+len(edges)),
                      mesh_volume_mm3=mesh_volume, cad_volume_mm3=cad_volume,
                      raw_nonadaptive_gmsh_cad_volume_mm3=raw_gmsh_volume,
                      cad_volume_reference=reference_kind,
                      independent_gmsh_integrated_volume_mm3=gmsh_volume,
                      relative_volume_error=abs(mesh_volume/cad_volume-1),
                      minimum_absolute_six_volume=float(abs(det).min()),
                      negative_orientation_count=int((det<0).sum()),
                      minimum_scaled_inverse_condition_number=float(min(qualities)),
                      minimum_determinant_jacobian=float(min(min_jacobians)),
                      geometry_admitted=bool(abs(mesh_volume/cad_volume-1)<=CRITERIA['mesh_volume_relative'] and min(min_jacobians)>0),
                      elapsed_seconds=time.perf_counter()-start,
                      step_sha256=digest(out/'slender-wing.step'),
                      geometry=('conforming curved tetra10 on STEP; P2 displacement' if quadratic else 'conforming first-order tetrahedra on STEP; P2 displacement'))
        write_json(out/f'{name}-mesh-report.json', report)
        emit(report)
    finally:
        gmsh.finalize()


def solve(out, h, max_dofs):
    from skfem import MeshTet,MeshTet2, Basis, FacetBasis, ElementVector, ElementTetP2, LinearForm, asm, condense, solve as fe_solve
    from skfem.models.elasticity import linear_elasticity, lame_parameters
    from scipy.sparse.linalg import cg
    from pyamg import smoothed_aggregation_solver
    start = time.perf_counter()
    name = f'h{h:g}'
    admission_path=out/f'{name}-volume-admission.json'
    if not admission_path.exists() or not json.loads(admission_path.read_text(encoding='utf-8'))['geometry_admitted']:
        raise RuntimeError('Run independent volume-reference/admission stage before solving this mesh')
    data = np.load(out/f'{name}-mesh.npz')
    quadratic=bool(data.get('quadratic',False))
    m = (MeshTet2 if quadratic else MeshTet)(data['points'].T, data['tetrahedra'].T)
    basis = Basis(m, ElementVector(ElementTetP2()), intorder=6 if quadratic else 4)
    emit(dict(stage='admission', dofs=basis.N, tetrahedra=m.nelements))
    if basis.N > max_dofs:
        raise RuntimeError(f'{basis.N} DOFs exceeds admitted {max_dofs}; no matrix allocated')
    tip = m.facets_satisfying(lambda x: np.isclose(x[1], 240, atol=1e-7), boundaries_only=True)
    root = m.facets_satisfying(lambda x: np.isclose(x[1], 0, atol=1e-7), boundaries_only=True)
    if not len(tip) or not len(root):
        raise RuntimeError('Missing actual root or tip face')
    fb = FacetBasis(m, basis.elem, facets=tip, intorder=6 if quadratic else 4)
    area = float(fb.dx.sum())
    tip_centroid = np.einsum('ifq,fq->i', fb.global_coordinates(), fb.dx)/area
    force = np.array([0.,0.,2.])
    @LinearForm
    def load(v, w):
        return 2/area*v[2]
    f = asm(load, fb)
    lam, mu = lame_parameters(2000, .35)
    K = asm(linear_elasticity(lam, mu), basis)
    symmetry = float(np.sqrt((K-K.T).power(2).sum())/np.sqrt(K.power(2).sum()))
    D = basis.get_dofs(facets=root).all()
    kc, fc, u, I = condense(K, f, D=D)
    emit(dict(stage='factor', free_dofs=len(I), nnz=kc.nnz, elapsed_seconds=time.perf_counter()-start))
    # Six exact unconstrained rigid-body fields, restricted to free rows.
    xyz=basis.doflocs[:,::3].T
    modes=np.zeros((basis.N,6))
    modes[0::3,0]=1; modes[1::3,1]=1; modes[2::3,2]=1
    for j,axis in enumerate(np.eye(3)):
        modes[:,3+j]=np.cross(np.broadcast_to(axis,xyz.shape),xyz).ravel()
    candidates=modes[I]
    # Normalize each candidate for numerically stable tentative interpolation.
    candidates/=np.linalg.norm(candidates,axis=0)
    ml=smoothed_aggregation_solver(kc.tobsr(blocksize=(3,3)),B=candidates,
                                   symmetry='symmetric',max_coarse=100,
                                   presmoother=('block_gauss_seidel',{'sweep':'symmetric'}),
                                   postsmoother=('block_gauss_seidel',{'sweep':'symmetric'}))
    iterations=[0]
    def progress(x):
        iterations[0]+=1
        if iterations[0]%100==0:
            emit(dict(stage='cg',iteration=iterations[0],relative_residual=float(np.linalg.norm(kc@x-fc)/np.linalg.norm(fc))))
        if time.perf_counter()-start>1200:
            raise RuntimeError('Predeclared local solve time cap 1200 seconds reached')
    warm_path=out/f'{name}-solution.npz'
    warm=False
    if warm_path.exists():
        old=np.load(warm_path)
        if np.array_equal(old['element_dofs'],basis.element_dofs) and np.array_equal(old['doflocs'],basis.doflocs):
            u=old['u'].copy();warm=True
    if not warm:
        u[I],info=cg(kc,fc,M=ml.aspreconditioner(),rtol=1e-10,atol=0,maxiter=3000,callback=progress)
        if info:
            raise RuntimeError(f'CG not converged: info={info}')
    refinement=[]
    # Recursive Krylov residuals can drift for thin-wall ill-conditioned solids.
    # Recompute the actual stored-matrix residual and correct it explicitly.
    for step in range(3):
        residual=fc-kc@u[I]
        measured=float(np.linalg.norm(residual)/np.linalg.norm(fc))
        refinement.append(measured)
        if measured<CRITERIA['residual_relative']*.2:
            break
        delta,info=cg(kc,residual,M=ml.aspreconditioner(),rtol=1e-3,atol=0,maxiter=500)
        u[I]+=delta
    r = K@u-f
    free_residual = float(np.linalg.norm(r[I])/max(np.linalg.norm(f),1e-30))
    vector_values = u.reshape(-1,3)
    force_reaction = r.reshape(-1,3).sum(axis=0)
    moment_reaction = np.cross(basis.doflocs[:, ::3].T, r.reshape(-1,3)).sum(axis=0)
    applied_moment = np.cross(tip_centroid, force)
    energy = float(u@(K@u)/2)
    work = float(f@u)
    tip_mean = np.einsum('ifq,fq->i', fb.interpolate(u), fb.dx)/area
    report = dict(mesh_size_max_mm=h, dofs=basis.N, free_dofs=len(I),
                  tip_area_mm2=area, tip_centroid_mm=tip_centroid.tolist(),
                  force_N=force.tolist(), applied_moment_Nmm=applied_moment.tolist(),
                  reaction_N=force_reaction.tolist(), reaction_moment_Nmm=moment_reaction.tolist(),
                  force_balance_relative=float(np.linalg.norm(force_reaction+force)/2),
                  moment_balance_relative=float(np.linalg.norm(moment_reaction+applied_moment)/np.linalg.norm(applied_moment)),
                  symmetry_relative=symmetry, free_residual_relative=free_residual,
                  energy_Nmm=energy, work_Nmm=work, energy_relative=abs(2*energy-work)/abs(work),
                  tip_mean_displacement_mm=tip_mean.tolist(), compliance_mm_per_N=float(tip_mean[2]/2),
                  solver='CG with six-rigid-body-mode smoothed aggregation AMG',iterations=iterations[0],
                  independently_recomputed_refinement_residuals=refinement,
                  elapsed_seconds=time.perf_counter()-start, criteria=CRITERIA,
                  clamp='all three translations on complete physical root face, constraining six rigid modes',
                  stress_scope='No certification of root clamp or load edge peak stresses')
    report['algebra_admitted']=bool(report['force_balance_relative']<=CRITERIA['force_moment_relative'] and
        report['moment_balance_relative']<=CRITERIA['force_moment_relative'] and
        free_residual<=CRITERIA['residual_relative'] and symmetry<=CRITERIA['symmetry_relative'] and
        report['energy_relative']<=CRITERIA['energy_relative'])
    np.savez_compressed(out/f'{name}-solution.npz', u=u, element_dofs=basis.element_dofs,
                        doflocs=basis.doflocs, points=m.p, tetrahedra=m.t,quadratic=quadratic)
    write_json(out/f'{name}-solve-report.json', report)
    emit(report)


def patch_test(out):
    from skfem import MeshTet, Basis, ElementVector, ElementTetP2, asm, condense, solve
    from skfem.models.elasticity import linear_elasticity, lame_parameters
    m = MeshTet.init_tensor(np.linspace(0,10,4),np.linspace(0,2,3),np.linspace(0,2,3))
    b = Basis(m,ElementVector(ElementTetP2()),intorder=4)
    lam,mu = lame_parameters(2000,.35)
    K=asm(linear_elasticity(lam,mu),b)
    exact=np.empty(b.N)
    exact[0::3]=1e-4*b.doflocs[0,0::3]
    exact[1::3]=-.35e-4*b.doflocs[1,1::3]
    exact[2::3]=-.35e-4*b.doflocs[2,2::3]
    D=b.get_dofs().all()
    u=solve(*condense(K,np.zeros(b.N),x=exact,D=D))
    predicted_energy=.5*2000*(1e-4)**2*40
    report=dict(dofs=b.N,maximum_absolute_affine_error=float(abs(u-exact).max()),
                energy_relative=float(abs(.5*u@(K@u)/predicted_energy-1)),
                purpose='3-D isotropic vector P2 affine uniaxial patch, all-boundary exact displacement',
                E_MPa=2000,nu=.35)
    if report['maximum_absolute_affine_error']>1e-12 or report['energy_relative']>1e-10:
        raise RuntimeError(report)
    write_json(out/'affine-patch-report.json',report)
    emit(report)


def cut_stresses(out,h,frames_path,channel='uniform'):
    """Integrate actual solid tensor stresses on complete beam-normal cuts.

    A plane intersects every conforming tetrahedron independently; it does NOT
    fill the cavity or treat aircraft-y as the span tangent. Quadratic FE
    displacement gives linear stress per straight-sided tetrahedron. A 3-point
    triangle rule integrates stress and second-order nominal-fit moments.
    """
    from skfem.models.elasticity import lame_parameters
    prefix=f'h{h:g}'+('-torque' if channel=='torque' else '')
    solution=np.load(out/f'{prefix}-solution.npz')
    if bool(solution.get('quadratic',False)):
        raise RuntimeError('Complete-plane stress integration requires affine tetrahedral geometry')
    p,t,u,ed=(solution[k] for k in ('points','tetrahedra','u','element_dofs'))
    xyz=p[:,t].transpose(2,1,0)
    edge_pairs=[(0,1),(1,2),(0,2),(0,3),(1,3),(2,3)]
    lam,mu=lame_parameters(2000,.35)
    results=[]
    frames=json.loads(Path(frames_path).read_text(encoding='utf-8'))
    if isinstance(frames,dict):
        if frames.get('format')!='mie446-spatial-beam-solid-reference':
            raise RuntimeError('Unrecognized beam reference for physical cuts')
        frames=frames['runs'][-1]['cuts']
    for frame in frames:
        origin=np.array(frame['reference']);R=np.array(frame['R']);normal=R[0]
        distances=(xyz-origin)@normal
        candidates=np.flatnonzero((distances.min(axis=1)<0)&(distances.max(axis=1)>0))
        positions=[];weights=[];tensors=[]
        for elem in candidates:
            vertices=xyz[elem];d=distances[elem]
            polygon=[]
            for a,b in [(0,1),(0,2),(0,3),(1,2),(1,3),(2,3)]:
                if d[a]*d[b]<0:
                    polygon.append(vertices[a]+d[a]/(d[a]-d[b])*(vertices[b]-vertices[a]))
                elif abs(d[a])<1e-10:
                    polygon.append(vertices[a])
            polygon=np.unique(np.round(polygon,12),axis=0)
            if len(polygon)<3:
                continue
            centre=polygon.mean(axis=0)
            delta=polygon-centre
            polygon=polygon[np.argsort(np.arctan2(delta@R[2],delta@R[1]))]
            jac=np.stack([vertices[i]-vertices[0] for i in [1,2,3]],axis=1)
            inv=np.linalg.inv(jac)
            gl=np.vstack((-inv.sum(axis=0),inv))
            elem_u=u[ed[:,elem]].reshape(10,3)
            for i in range(1,len(polygon)-1):
                tri=polygon[[0,i,i+1]]
                area=np.linalg.norm(np.cross(tri[1]-tri[0],tri[2]-tri[0]))/2
                for bary in [[2/3,1/6,1/6],[1/6,2/3,1/6],[1/6,1/6,2/3]]:
                    q=np.array(bary)@tri
                    l123=inv@(q-vertices[0]);ls=np.r_[1-l123.sum(),l123]
                    grad=[(4*ls[j]-1)*gl[j] for j in range(4)]
                    grad.extend(4*(ls[a]*gl[b]+ls[b]*gl[a]) for a,b in edge_pairs)
                    du=elem_u.T@np.asarray(grad)
                    eps=(du+du.T)/2
                    sig=2*mu*eps+lam*np.trace(eps)*np.eye(3)
                    positions.append(q);weights.append(area/3);tensors.append(sig)
        q=np.array(positions);w=np.array(weights);sig=np.array(tensors)
        if not len(q):
            raise RuntimeError(f'Empty physical cut: {frame}')
        sigtt=np.einsum('i,nij,j->n',normal,sig,normal)
        local=(q-origin)@R.T
        design=np.column_stack([np.ones(len(q)),local[:,1],local[:,2]])
        beta=np.linalg.lstsq(design*w[:,None]**.5,sigtt*w**.5,rcond=None)[0]
        nominal=design@beta
        traction=sig@normal
        force=np.einsum('ni,n->i',traction,w)
        moment=np.einsum('ni,n->i',np.cross(q-origin,traction),w)
        result=dict(y=frame['y'],reference=origin.tolist(),R=R.tolist(),area_mm2=float(w.sum()),
                    quadrature_count=len(w),normal_stress_affine_coefficients=beta.tolist(),
                    normal_stress_rms_MPa=float(np.sqrt(np.dot(w,sigtt**2)/w.sum())),
                    nominal_normal_stress_rms_MPa=float(np.sqrt(np.dot(w,nominal**2)/w.sum())),
                    integrated_force_N=force.tolist(),integrated_moment_Nmm=moment.tolist(),
                    positions_mm=q.tolist(),weights_mm2=w.tolist(),stress_tensors_MPa=sig.tolist(),
                    normal_stress_MPa=sigtt.tolist(),nominal_normal_stress_MPa=nominal.tolist())
        results.append(result)
    path=out/f'{prefix}-cut-stresses.json'
    write_json(path,results)
    emit(dict(path=str(path),cuts=[{k:v for k,v in r.items() if k not in ('positions_mm','weights_mm2','stress_tensors_MPa','normal_stress_MPa','nominal_normal_stress_MPa')} for r in results]))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('stage',choices=['cad','mesh','solve','patch','cuts','volume'])
    parser.add_argument('--out',type=Path,required=True)
    parser.add_argument('--h',type=float,default=12)
    parser.add_argument('--curvature',type=int,default=12)
    parser.add_argument('--quadratic',action='store_true')
    parser.add_argument('--case',choices=list(CASES),default='baseline')
    parser.add_argument('--max-dofs',type=int,default=70000)
    parser.add_argument('--frames',type=Path)
    parser.add_argument('--channel',choices=['uniform','torque'],default='uniform')
    args=parser.parse_args()
    args.out.mkdir(parents=True,exist_ok=True)
    if args.stage=='cad': cad(args.out,args.case)
    elif args.stage=='volume': volume_reference(args.out)
    elif args.stage=='mesh': mesh(args.out,args.h,args.curvature,args.quadratic)
    elif args.stage=='solve': solve(args.out,args.h,args.max_dofs)
    elif args.stage=='patch': patch_test(args.out)
    else: cut_stresses(args.out,args.h,args.frames,args.channel)
