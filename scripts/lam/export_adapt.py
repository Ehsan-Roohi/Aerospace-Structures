"""Run a pinned upstream ADAPT model and export pressure/force posterior for Wing Lab.
No upstream source or weights are redistributed. Install dependencies separately.
"""
import argparse, hashlib, importlib.util, json, pickle, sys, time
from pathlib import Path
COMMIT='5353a862ec8c453788efef4e8aa8040148efbe6c'
EXPECTED={'airfoil_pca.pkl':'ff0c41c7628f8551d400b2204951eca7894032cf292cde8187183eaed3d47641','svdkl_pcaInput_weights.pt':'bcb4a29c5dcbd9e5d544bee2f03c0a443222ed13e6ee4c6807e521b41bdd0f3a','svdkl_pcaInput_weights_params.pt':'988e86dd2075f2706adba8ac04726f41cbef9c8d6e45c627ebddf279a0b123ff'}
def weights(surface_u,surface_l,np):
 n=len(surface_u)+len(surface_l);w=np.zeros((3,n))
 for surface,offset,sign in [(surface_u,0,1),(surface_l,len(surface_u),-1)]:
  for i,((x,z),(xx,zz)) in enumerate(zip(surface[:-1],surface[1:])):
   dx,dz=xx-x,zz-z;a=z*dz+(x-.25)*dx;b=zz*dz+(xx-.25)*dx;k=offset+i
   w[0,k:k+2]+=sign*dz/2;w[1,k:k+2]-=sign*dx/2
   w[2,k]+=sign*(2*a+b)/6;w[2,k+1]+=sign*(a+2*b)/6
 return w

def main():
 p=argparse.ArgumentParser();p.add_argument('--upstream',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--clark-y',type=Path);p.add_argument('--custom-name',default='Clark Y');p.add_argument('--alpha-step',type=float,default=4.);a=p.parse_args();assert 0<a.alpha_step<=4 and abs(round(4/a.alpha_step)*a.alpha_step-4)<1e-9
 for name,expected in EXPECTED.items():
  assert hashlib.sha256((a.upstream/'ADAPT/model'/name).read_bytes()).hexdigest()==expected,'Unexpected upstream checkpoint'
 import numpy as np,torch,gpytorch,pandas,scipy,sklearn
 torch.set_num_threads(2);torch.manual_seed(446)
 # Restrict all checkpoint loads to explicitly reviewed package globals.
 from gpytorch.constraints import GreaterThan
 from gpytorch.likelihoods import FixedNoiseGaussianLikelihood
 from gpytorch.likelihoods.noise_models import FixedGaussianNoise,HomoskedasticNoise
 from gpytorch.utils.transforms import inv_softplus
 from torch.nn.modules.module import _WrappedHook
 import codecs
 allow=[getattr,set,GreaterThan,FixedNoiseGaussianLikelihood,FixedGaussianNoise,HomoskedasticNoise,inv_softplus,torch.nn.Softplus,_WrappedHook,codecs.encode,np.dtype,np.core.multiarray.scalar,np.dtypes.Float64DType]
 torch.serialization.add_safe_globals(allow);original_load=torch.load
 def safe_load(*args,**kwargs):kwargs['weights_only']=True;return original_load(*args,**kwargs)
 torch.load=safe_load
 class PCAReader(pickle.Unpickler):
  def find_class(self,module,name):
   import collections
   approved={('torch._utils','_rebuild_tensor_v2'):torch._utils._rebuild_tensor_v2,('torch.storage','_load_from_bytes'):torch.storage._load_from_bytes,('collections','OrderedDict'):collections.OrderedDict}
   if (module,name) in approved:return approved[(module,name)]
   if module=='numpy' and name in ('ndarray','dtype'):return getattr(np,name)
   if module in ('numpy.core.multiarray','numpy._core.multiarray') and name=='_reconstruct':return np.core.multiarray._reconstruct
   raise pickle.UnpicklingError('Unapproved PCA global: '+module+'.'+name)
 pickle.load=lambda file,*args,**kwargs:PCAReader(file).load()
 source=a.upstream/'ADAPT/adapt.py';assert hashlib.sha1(b'blob '+str(source.stat().st_size).encode()+b'\0'+source.read_bytes()).hexdigest()=='9ebeb52726f438e1422f1e4b22b3acfc3dcaecd9'
 spec=importlib.util.spec_from_file_location('upstream_adapt',source);adapt=importlib.util.module_from_spec(spec);spec.loader.exec_module(adapt)
 model,_=adapt.unpack_model(model_version='pca',output_device=torch.device('cpu'))
 candidates=[('NACA 0012','NACA 0012'),('NACA 2412','NACA 2412'),('NACA 4412','NACA 4412')]
 if a.clark_y:candidates.append((a.custom_name,str(a.clark_y)))
 cases=[];start=time.perf_counter()
 for name,geometry in candidates:
  for alpha in [round(i*a.alpha_step,8) for i in range(round(4/a.alpha_step)+1)]:
   x=torch.tensor((1-np.cos(np.linspace(0,np.pi,81)))/2)
   inp=adapt.input_data(geometry,alpha=alpha,mach=.15,manual_points=[x,x],num_auto_points=len(x),output_device=torch.device('cpu'),model_version='pca')
   result=model.predict(inp,get_coeff=False,num_weights=1);dist=result['cp_distribution'];mean=dist.mean.detach().cpu().numpy();cov=dist.covariance_matrix.detach().cpu().numpy()
   upper=np.column_stack([x.numpy(),inp.splines[0](x.numpy())]);lower=np.column_stack([x.numpy(),inp.splines[1](x.numpy())]);w=weights(upper,lower,np)
   case={'airfoil':name,'alphaDeg':alpha,'mach':.15,'nominalRe':3e6,'upper':upper.tolist(),'lower':lower.tolist(),'cpMean':mean.tolist(),'cpStd':np.sqrt(np.diag(cov)).tolist(),'forceMoment':{'order':['CA','CN','CmQuarterNoseUp'],'mean':(w@mean).tolist(),'covariance':(w@cov@w.T).tolist()}}
   cases.append(case);print(name,alpha,case['forceMoment']['mean'],flush=True)
 output={'format':'wing-lam-screen-v1','upstream':{'repo':'https://github.com/hwlee924/Large-Airfoil-Model','commit':COMMIT,'sourceBlob':'9ebeb52726f438e1422f1e4b22b3acfc3dcaecd9','weightsSha256':EXPECTED},'paper':'https://doi.org/10.1016/j.ast.2026.113783','versions':{m.__name__:m.__version__ for m in [np,torch,gpytorch,pandas,scipy,sklearn]},'execution':'Actual local CPU inference with upstream PCA ADAPT; 1 checkpoint, no retraining. Joint covariance propagated through pressure integration. Not independent experimental validation.','domain':'Published Re > 1e6; alpha [-4,12] deg; Mach [0,.9]. Re is context only and not consumed by ADAPT. No low-Re calibration, friction/total drag, finite-wing lift or structural approval.','runtimeSeconds':time.perf_counter()-start,'cases':cases}
 a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(output,indent=2)+'\n',encoding='utf-8')
if __name__=='__main__':main()
