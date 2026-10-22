"""Optional isolated QA: matched bending/torque channels on actual STEP meshes.

Uses the existing conforming tetra4 geometry with true quadratic vector solid
elasticity, not a beam or shell. Constant isotropic E=2000 MPa, nu=.35. The
degree-two stiffness rule is exact for P2 gradients on affine tetrahedra; the
``patch`` command independently compares it with degree-four integration.
No student dependency, CAD, solver physics, or manufacturing gate is changed.

Predeclared torque gates: mesh rotation 2%, beam comparison 10%; absolute
near-zero floors 1e-7 rad / 1e-5 mm. Existing bending, stress, volume and algebra
criteria from wing_solid_benchmark remain unchanged. Cases are individual
checks, not bounds on arbitrary airfoils or a multidimensional design box.
"""
from __future__ import annotations

import argparse
import ctypes
import json
import os
from pathlib import Path
import time

import numpy as np

from wing_solid_benchmark import CRITERIA,digest,emit,write_json

EDGE_PAIRS=[(0,1),(1,2),(0,2),(0,3),(1,3),(2,3)]
TORQUE_CRITERIA=dict(rotation_mesh_relative=.02,rotation_beam_relative=.10,
                     near_zero_rotation_absolute_rad=1e-7,
                     near_zero_translation_absolute_mm=1e-5)


def available_memory():
    if os.name=='nt':
        class MemoryStatus(ctypes.Structure):
            _fields_=[('length',ctypes.c_ulong),('load',ctypes.c_ulong),
                      ('total',ctypes.c_ulonglong),('available',ctypes.c_ulonglong),
                      ('page_total',ctypes.c_ulonglong),('page_available',ctypes.c_ulonglong),
                      ('virtual_total',ctypes.c_ulonglong),('virtual_available',ctypes.c_ulonglong),
                      ('extended_available',ctypes.c_ulonglong)]
        status=MemoryStatus();status.length=ctypes.sizeof(status)
        if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
            raise OSError('Cannot establish physical-memory admission')
        return int(status.available)
    entries={line.split(':')[0]:line.split(':')[1].strip() for line in Path('/proc/meminfo').read_text().splitlines()}
    return int(entries['MemAvailable'].split()[0])*1024


def p2_shapes(ls):
    return np.r_[ls*(2*ls-1),[4*ls[a]*ls[b] for a,b in EDGE_PAIRS]]


def rigid_fit(q,values,weights):
    area=weights.sum();centre=np.einsum('ni,n->i',q,weights)/area
    r=q-centre
    B=np.zeros((len(q),3,6));B[:,:,:3]=np.eye(3)
    B[:,0,4]=r[:,2];B[:,0,5]=-r[:,1]
    B[:,1,3]=-r[:,2];B[:,1,5]=r[:,0]
    B[:,2,3]=r[:,1];B[:,2,4]=-r[:,0]
    lhs=(B*weights[:,None,None]**.5).reshape(-1,6)
    rhs=(values*weights[:,None]**.5).ravel()
    fit=np.linalg.lstsq(lhs,rhs,rcond=None)[0]
    residual=values-np.einsum('nij,j->ni',B,fit)
    return dict(centre_mm=centre.tolist(),translation_mm=fit[:3].tolist(),
                rotation_rad=fit[3:].tolist(),area_mm2=float(area),
                weighted_warping_residual_mm=float(np.sqrt(np.einsum('ni,ni,n->',residual,residual,weights)/area)),
                interpretation='Least-squares kinematics; rotation is not assumed equal to traction work-conjugate rotation')


def ring_samples(m,basis,u,y):
    """Complete solid cut at aircraft y, preserving hollow regions."""
    xyz=m.p[:,m.t].transpose(2,1,0)
    distances=xyz[:,:,1]-y
    candidates=np.flatnonzero((distances.min(axis=1)<0)&(distances.max(axis=1)>0))
    qlist=[];wlist=[];values=[]
    rules=[]
    for a,w in [(.445948490915965,.223381589678011),(.091576213509771,.109951743655322)]:
        rules.extend([(np.array(b),w) for b in [(a,a,1-2*a),(a,1-2*a,a),(1-2*a,a,a)]])
    for elem in candidates:
        vertices=xyz[elem];d=distances[elem];polygon=[]
        for a,b in [(0,1),(0,2),(0,3),(1,2),(1,3),(2,3)]:
            if d[a]*d[b]<0:
                polygon.append(vertices[a]+d[a]/(d[a]-d[b])*(vertices[b]-vertices[a]))
        polygon=np.unique(np.round(polygon,12),axis=0)
        if len(polygon)<3: continue
        centre=polygon.mean(axis=0);r=polygon-centre
        polygon=polygon[np.argsort(np.arctan2(r[:,2],r[:,0]))]
        inv=np.linalg.inv(np.stack([vertices[i]-vertices[0] for i in [1,2,3]],axis=1))
        elem_u=u[basis.element_dofs[:,elem]].reshape(10,3)
        for i in range(1,len(polygon)-1):
            tri=polygon[[0,i,i+1]]
            area=np.linalg.norm(np.cross(tri[1]-tri[0],tri[2]-tri[0]))/2
            for bary,w in rules:
                q=bary@tri;l123=inv@(q-vertices[0]);ls=np.r_[1-l123.sum(),l123]
                qlist.append(q);wlist.append(area*w);values.append(p2_shapes(ls)@elem_u)
    if not qlist: raise RuntimeError('Empty physical ring')
    return np.array(qlist),np.array(values),np.array(wlist)


def patch(out):
    from skfem import MeshTet,Basis,ElementVector,ElementTetP2,asm
    from skfem.models.elasticity import lame_parameters,linear_elasticity
    m=MeshTet.init_tensor([0,1,3],[0,.4,1],[0,.6,1])
    e=ElementVector(ElementTetP2());lam,mu=lame_parameters(2000,.35)
    low=asm(linear_elasticity(lam,mu),Basis(m,e,intorder=2))
    high=asm(linear_elasticity(lam,mu),Basis(m,e,intorder=4))
    relative=float(np.sqrt((low-high).power(2).sum()/high.power(2).sum()))
    if relative>1e-12: raise RuntimeError('Degree-two rule did not reproduce full exact stiffness')
    # The independent ring interpolator must reproduce a general P2 vector field.
    q=np.array([.2,.3,.1]);ls=np.r_[1-q.sum(),q]
    nodes=ElementTetP2().doflocs
    field=lambda x:np.array([x[0]**2+x[1]*x[2],x[1]**2+x[0],x[2]**2-x[0]*x[1]])
    interpolation_error=float(np.linalg.norm(p2_shapes(ls)@np.array([field(x) for x in nodes])-field(q)))
    if interpolation_error>1e-14:raise RuntimeError('Independent P2 interpolation failed')
    b=Basis(m,e,intorder=2);locations=b.doflocs[:,::3].T
    translation=np.array([.12,-.05,.04]);rotation=np.array([.02,.03,-.01])
    values=translation+np.cross(np.broadcast_to(rotation,locations.shape),locations)
    ring_q,ring_u,ring_w=ring_samples(m,b,values.ravel(),.55)
    fit=rigid_fit(ring_q,ring_u,ring_w)
    ring_rotation_error=float(np.linalg.norm(np.array(fit['rotation_rad'])-rotation))
    ring_area_error=float(abs(ring_w.sum()/3-1))
    if ring_rotation_error>1e-13 or ring_area_error>1e-12:raise RuntimeError('Independent complete-plane rigid fit failed')
    report=dict(exact_stiffness_quadrature_relative=relative,p2_interpolation_absolute_error=interpolation_error,
                ring_rigid_rotation_absolute_error=ring_rotation_error,ring_area_relative_error=ring_area_error,
                volume_rule='Polynomial degree two exact P2 affine-tetra homogeneous elastic stiffness',
                torque_criteria=TORQUE_CRITERIA)
    write_json(out/'two-rhs-patch-report.json',report);emit(report)


def serialize_rings(out,h,channels):
    from skfem import MeshTet,Basis,ElementVector,ElementTetP2
    for channel in channels:
        prefix=f'h{h:g}'+('-torque' if channel=='torque' else '')
        solution=np.load(out/f'{prefix}-solution.npz')
        if bool(solution.get('quadratic',False)):raise RuntimeError('Ring sampling requires affine tetrahedral geometry')
        m=MeshTet(solution['points'],solution['tetrahedra'])
        b=Basis(m,ElementVector(ElementTetP2()),intorder=2)
        if not np.array_equal(b.element_dofs,solution['element_dofs']):raise RuntimeError('Saved FE topology differs from ring sampler')
        q,u,w=ring_samples(m,b,solution['u'],204)
        report=dict(load_channel='uniform_tip_2N' if channel=='uniform' else 'pure_tip_My_50Nmm',
                    aircraft_y_mm=204,positions_mm=q.tolist(),weights_mm2=w.tolist(),displacements_mm=u.tolist(),
                    rigid_fit=rigid_fit(q,u,w),solution_sha256=digest(out/f'{prefix}-solution.npz'))
        write_json(out/f'{prefix}-ring-samples.json',report)
        emit(dict(channel=channel,samples=len(w),area_mm2=float(w.sum()),rigid_fit=report['rigid_fit']))


def run(out,h,channels,max_dofs,min_free_gb):
    from skfem import MeshTet,Basis,FacetBasis,ElementVector,ElementTetP2,LinearForm,asm,condense
    from skfem.models.elasticity import linear_elasticity,lame_parameters
    from scipy.sparse.linalg import cg
    from pyamg import smoothed_aggregation_solver
    started=time.perf_counter();name=f'h{h:g}'
    free=available_memory()
    emit(dict(stage='memory_admission',available_bytes=free,required_bytes=min_free_gb*1024**3))
    if free<min_free_gb*1024**3:raise RuntimeError('Insufficient admitted physical RAM; no matrix allocated')
    admission=json.loads((out/f'{name}-volume-admission.json').read_text(encoding='utf-8'))
    if not admission['geometry_admitted']:raise RuntimeError('Actual CAD/mesh geometry admission failed')
    data=np.load(out/f'{name}-mesh.npz')
    if bool(data.get('quadratic',False)):raise RuntimeError('This exact-quadrature benchmark requires affine tetrahedral geometry')
    m=MeshTet(data['points'].T,data['tetrahedra'].T)
    basis=Basis(m,ElementVector(ElementTetP2()),intorder=2)
    emit(dict(stage='dof_admission',dofs=basis.N,tetrahedra=m.nelements))
    if basis.N>max_dofs:raise RuntimeError('DOF admission exceeded; no matrix allocated')
    root=m.facets_satisfying(lambda x:np.isclose(x[1],0,atol=1e-7),boundaries_only=True)
    tip=m.facets_satisfying(lambda x:np.isclose(x[1],240,atol=1e-7),boundaries_only=True)
    if not len(root) or not len(tip):raise RuntimeError('Missing complete physical root/tip')
    fb=FacetBasis(m,basis.elem,facets=tip,intorder=4)
    q=fb.global_coordinates();weights=fb.dx;area=float(weights.sum())
    centre=np.einsum('ifq,fq->i',q,weights)/area
    inertia_x=float(np.einsum('fq,fq->',(q[0]-centre[0])**2,weights))
    @LinearForm
    def uniform(v,w):return 2/area*v[2]
    @LinearForm
    def torque(v,w):return -50/inertia_x*(w.x[0]-centre[0])*v[2]
    forces=dict(uniform=asm(uniform,fb),torque=asm(torque,fb))
    lam,mu=lame_parameters(2000,.35)
    K=asm(linear_elasticity(lam,mu),basis)
    symmetry=float(np.sqrt((K-K.T).power(2).sum()/K.power(2).sum()))
    D=basis.get_dofs(facets=root).all()
    kc,_,empty,I=condense(K,np.zeros(basis.N),D=D)
    xyz=basis.doflocs[:,::3].T
    modes=np.zeros((basis.N,6));modes[0::3,0]=1;modes[1::3,1]=1;modes[2::3,2]=1
    for j,axis in enumerate(np.eye(3)):modes[:,3+j]=np.cross(np.broadcast_to(axis,xyz.shape),xyz).ravel()
    candidates=modes[I];candidates/=np.linalg.norm(candidates,axis=0)
    ml=smoothed_aggregation_solver(kc.tobsr(blocksize=(3,3)),B=candidates,symmetry='symmetric',max_coarse=100,
        presmoother=('block_gauss_seidel',{'sweep':'symmetric'}),postsmoother=('block_gauss_seidel',{'sweep':'symmetric'}))
    emit(dict(stage='shared_matrix_ready',dofs=basis.N,free_dofs=len(I),nnz=kc.nnz,elapsed_seconds=time.perf_counter()-started))
    original_uniform=None
    existing=out/f'{name}-solve-report.json'
    preserved=out/f'{name}-degree4-original-solve-report.json'
    if existing.exists():
        previous=json.loads(existing.read_text(encoding='utf-8'))
        if 'volume_rule' not in previous:
            if preserved.exists():raise RuntimeError('Original degree-four report already exists; do not overwrite audit')
            preserved.write_bytes(existing.read_bytes())
            old_solution=out/f'{name}-solution.npz'
            (out/f'{name}-degree4-original-solution.npz').write_bytes(old_solution.read_bytes())
    if preserved.exists():original_uniform=json.loads(preserved.read_text(encoding='utf-8'))
    for channel in channels:
        channel_start=time.perf_counter();f=forces[channel];fc=f[I];u=empty.copy();iterations=[0]
        prefix=name if channel=='uniform' else name+'-torque'
        def progress(x):
            iterations[0]+=1
            if iterations[0]%100==0:emit(dict(stage='cg',channel=channel,iteration=iterations[0],relative_residual=float(np.linalg.norm(kc@x-fc)/np.linalg.norm(fc))))
            if time.perf_counter()-channel_start>1200:raise RuntimeError('Per-channel local 1200-second solve cap reached')
        u[I],info=cg(kc,fc,M=ml.aspreconditioner(),rtol=1e-10,atol=0,maxiter=3000,callback=progress)
        if info:raise RuntimeError(f'CG channel did not converge: {info}')
        refinement=[]
        for step in range(3):
            residual=fc-kc@u[I];relative=float(np.linalg.norm(residual)/np.linalg.norm(fc));refinement.append(relative)
            if relative<CRITERIA['residual_relative']*.2:break
            correction,info=cg(kc,residual,M=ml.aspreconditioner(),rtol=1e-3,atol=0,maxiter=500)
            u[I]+=correction
        r=K@u-f;force=f.reshape(-1,3).sum(axis=0)
        moment=np.cross(xyz,f.reshape(-1,3)).sum(axis=0)
        reaction=r.reshape(-1,3).sum(axis=0);reaction_moment=np.cross(xyz,r.reshape(-1,3)).sum(axis=0)
        target_force=np.array([0,0,2.]) if channel=='uniform' else np.zeros(3)
        target_moment=np.cross(centre,target_force) if channel=='uniform' else np.array([0,50.,0])
        load_force_error=float(np.linalg.norm(force-target_force)/2)
        load_moment_error=float(np.linalg.norm(moment-target_moment)/np.linalg.norm(target_moment))
        if max(load_force_error,load_moment_error)>1e-10:raise RuntimeError('Actual distributed load wrench does not match prescribed channel')
        energy=float(u@(K@u)/2);work=float(f@u)
        tip_values=fb.interpolate(u);tip_mean=np.einsum('ifq,fq->i',tip_values,weights)/area
        tip_fit=rigid_fit(q.reshape(3,-1).T,tip_values.reshape(3,-1).T,weights.ravel())
        ring_q,ring_u,ring_w=ring_samples(m,basis,u,204)
        ring_fit=rigid_fit(ring_q,ring_u,ring_w);ring_fit['aircraft_y_mm']=204
        report=dict(load_channel='uniform_tip_2N' if channel=='uniform' else 'pure_tip_My_50Nmm',
            load_definition=(dict(kind='uniform_vertical_tip_traction',traction_N_per_mm2=2/area) if channel=='uniform' else
                dict(kind='linear_x_vertical_tip_traction',slope_N_per_mm3=-50/inertia_x,centre_x_mm=float(centre[0]),second_area_moment_mm4=inertia_x)),
            mesh_size_max_mm=h,dofs=basis.N,free_dofs=len(I),tip_area_mm2=area,tip_centroid_mm=centre.tolist(),
            force_N=force.tolist(),applied_moment_Nmm=moment.tolist(),requested_force_N=target_force.tolist(),requested_moment_Nmm=target_moment.tolist(),
            load_force_error_relative=load_force_error,load_moment_error_relative=load_moment_error,
            reaction_N=reaction.tolist(),reaction_moment_Nmm=reaction_moment.tolist(),
            force_balance_relative=float(np.linalg.norm(reaction+force)/2),
            moment_balance_relative=float(np.linalg.norm(reaction_moment+moment)/np.linalg.norm(target_moment)),
            free_residual_relative=float(np.linalg.norm(r[I])/np.linalg.norm(f)),symmetry_relative=symmetry,
            energy_Nmm=energy,work_Nmm=work,energy_relative=abs(2*energy-work)/abs(work),
            theta_work_rad=work/50 if channel=='torque' else None,
            compliance_mm_per_N=work/4 if channel=='uniform' else None,
            tip_mean_displacement_mm=tip_mean.tolist(),tip_rigid_fit=tip_fit,ring_rigid_fit=ring_fit,
            solver='CG + six-rigid-body-mode smoothed aggregation; matrix/AMG reused across RHS',
            iterations=iterations[0],independently_recomputed_refinement_residuals=refinement,
            elapsed_seconds=time.perf_counter()-channel_start,total_elapsed_seconds=time.perf_counter()-started,
            criteria={**CRITERIA,**TORQUE_CRITERIA},volume_rule='exact polynomial degree two on affine P2 solid stiffness',
            mesh_sha256=digest(out/f'{name}-mesh.npz'),
            clamp='Complete physical root face, all three solid translations fixed',
            limitations=['No root/load-edge peak stress certification','Interior normal stress is nominal; no validated Saint-Venant decay length',
                         'LS rotations are kinematic diagnostics, not assumed energy-conjugate rotations'])
        report['algebra_admitted']=bool(report['force_balance_relative']<=CRITERIA['force_moment_relative'] and
            report['moment_balance_relative']<=CRITERIA['force_moment_relative'] and report['free_residual_relative']<=CRITERIA['residual_relative'] and
            symmetry<=CRITERIA['symmetry_relative'] and report['energy_relative']<=CRITERIA['energy_relative'])
        if channel=='uniform' and original_uniform is not None:
            difference=abs(report['compliance_mm_per_N']/original_uniform['compliance_mm_per_N']-1)
            report['uniform_quadrature_crosscheck']=dict(original_degree4_compliance_mm_per_N=original_uniform['compliance_mm_per_N'],
                current_exact_degree2_compliance_mm_per_N=report['compliance_mm_per_N'],relative_difference=difference,
                numerical_equivalence_threshold=1e-6,passed=bool(difference<=1e-6))
            if difference>1e-6:report['algebra_admitted']=False
        np.savez_compressed(out/f'{prefix}-solution.npz',u=u,element_dofs=basis.element_dofs,doflocs=basis.doflocs,points=m.p,tetrahedra=m.t,quadratic=False)
        write_json(out/f'{prefix}-solve-report.json',report);emit(report)
        if not report['algebra_admitted']:raise RuntimeError('Stored independent algebra criteria failed; no subsequent channel launched')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('stage',choices=['patch','solve','rings'])
    parser.add_argument('--out',required=True,type=Path)
    parser.add_argument('--h',type=float,default=8)
    parser.add_argument('--channels',nargs='+',choices=['uniform','torque'],default=['uniform','torque'])
    parser.add_argument('--max-dofs',type=int,default=150000)
    parser.add_argument('--min-free-gb',type=float,default=2.5)
    args=parser.parse_args();args.out.mkdir(parents=True,exist_ok=True)
    if args.stage=='patch':patch(args.out)
    elif args.stage=='rings':serialize_rings(args.out,args.h,args.channels)
    else:run(args.out,args.h,args.channels,args.max_dofs,args.min_free_gb)
