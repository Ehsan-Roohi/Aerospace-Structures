"""Reproduce numerical figures and worked examples in LEAVES_ON_RAILS.md.
Run: python calculations.py --output DIRECTORY
Dependencies: numpy, matplotlib. Does not fit or simulate experimental data.
Schematics and photographs are separately supplied static assets.
"""
from pathlib import Path
import argparse,json,math
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

def moisture_cot(m):
    return 1.306*np.exp(-.2017*np.asarray(m))+.04757*np.exp(.008406*np.asarray(m))

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=Path('reproduced'))
    args=parser.parse_args();out=args.output;out.mkdir(parents=True,exist_ok=True)
    plt.rcParams.update({'font.size':12,'svg.fonttype':'none','axes.spines.top':False,'axes.spines.right':False})
    def save(fig,name):
        fig.tight_layout();fig.savefig(out/name);plt.close(fig)
    mu=np.array([.3,.1,.05,.01]);v=80/3.6;g=9.81;distance=v*v/(2*mu*g)
    fig,ax=plt.subplots(figsize=(9,4.5));ax.barh([str(x) for x in mu],distance,color='#197395');ax.invert_yaxis();ax.set(xlabel='Ideal stopping distance (m)',ylabel='Assumed constant adhesion coefficient',title='80 km/h · level track · instantaneous braking',xlim=(0,2900))
    for i,d in enumerate(distance):ax.text(d+25,i,f'{d:.1f} m',va='center')
    save(fig,'stopping.svg')
    m=np.linspace(8.8,54.8,400);fig,ax=plt.subplots(figsize=(9,4.5));ax.plot(m,moisture_cot(m),lw=3,label='Jaffé et al. (2026), Eq. 1',color='#197395');ax.axhline(.1,ls='--',color='#aa4c22',label='Study reference CoT = 0.1');ax.set(xlabel='Layer moisture reading (%WME; not water mass %)',ylabel='Coefficient of traction',title='Published fit reconstruction · no raw data points');ax.legend();save(fig,'moisture-fit.svg')
    x=np.linspace(-1,1,150);y=x[:,None];z=np.sqrt(np.maximum(0,1-x[None,:]**2-y**2));z[x[None,:]**2+y**2>1]=np.nan
    fig,(ax,bx)=plt.subplots(1,2,figsize=(11,4.4));im=ax.imshow(z,extent=(-6,6,-8,8),origin='lower',cmap='viridis',aspect='equal');ax.set(xlabel='x (mm)',ylabel='y (mm)',title='Illustrative elliptical patch');fig.colorbar(im,ax=ax,label='p / p₀');bx.plot(x,np.sqrt(1-x*x),lw=3);bx.axhline(2/3,ls='--',color='#a54d2d',label='Area mean = 2p₀ / 3');bx.set(xlabel='x/a at y = 0',ylabel='p / p₀',title='Hertz centerline section');bx.legend();save(fig,'hertz-pressure.svg')
    fig,ax=plt.subplots(figsize=(9,4.6));x=np.linspace(0,8,350)
    for c in [.3,.1,.02]:ax.plot(x,c*(1-np.exp(-x/.65))*(1-.025*x),label=f'Illustrative envelope μ = {c:g}',lw=2.5)
    ax.set(xlabel='Longitudinal creepage magnitude (%)',ylabel='|Fₜ| / N',title='Conceptual traction curves — not fitted experimental data');ax.legend();save(fig,'creepage.svg')
    fig,ax=plt.subplots(figsize=(9,4.6));grade=np.linspace(0,.045,300)
    for c in [.05,.03,.01]:
        t=np.arctan(grade);a=g*(c*np.cos(t)-np.sin(t));d=np.where(a>0,v*v/(2*np.maximum(a,1e-9)),np.nan);ax.plot(100*grade,d,label=f'μ = {c:.2f}',lw=2)
    ax.set(xlabel='Downhill gradient (%)',ylabel='Ideal stopping distance (m)',ylim=(0,3500),title='80 km/h · no delay · adhesion-limited wheel braking');ax.legend();save(fig,'gradient-sensitivity.svg')
    I=math.pi/64*(.12**4-.1**4);Z=I/.06
    lo,hi=8.8,25
    for _ in range(60):
        mid=(lo+hi)/2
        if moisture_cot(mid)>.1:lo=mid
        else:hi=mid
    mmin=math.log((1.306*.2017)/(.04757*.008406))/(.2017+.008406)
    result={'stopping_distance_m':dict(zip(map(str,mu),distance.tolist())),
            'moisture_cot':{str(m):float(moisture_cot(m)) for m in [10,20,25,40]},
            'fit_crossing_cot_0.1_wme':mid,'fit_minimum_wme':mmin,'fit_minimum_cot':float(moisture_cot(mmin)),
            'beam_I_m4':I,'beam_Z_m3':Z,
            'beam_cases':[{'force_N':f,'stress_MPa':f*.8/Z/1e6,'deflection_mm':f*.8**3/(3*70e9*I)*1000} for f in [21000,700]],
            'dose_two_rails_L_per_min_at_80_kmh':2*2e-3*v*60}
    assert abs(result['beam_cases'][0]['stress_MPa']-191.2705605)<1e-4
    assert abs(distance[-1]-2516.958661)<1e-3
    assert abs(mid-16.668131)<1e-5
    (out/'checked-values.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
if __name__=='__main__':main()
