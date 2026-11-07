"""Independent teaching calculations, not measured patent performance.
Run: python calculations.py --output DIRECTORY
Dependencies: numpy, matplotlib. Outputs six original SVGs and checked JSON.
"""
from pathlib import Path
import argparse,json,math
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Circle,Wedge,FancyArrowPatch

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=Path,default=Path('reproduced'));a=parser.parse_args();out=a.output;out.mkdir(exist_ok=True,parents=True)
    plt.rcParams.update({'font.size':12,'svg.fonttype':'none','axes.spines.top':False,'axes.spines.right':False})
    def save(fig,name):fig.tight_layout();fig.savefig(out/name,bbox_inches='tight');fig.savefig(out/(Path(name).stem+'.png'),dpi=120,bbox_inches='tight');plt.close(fig)
    fig,axes=plt.subplots(1,2,figsize=(10,4.8))
    for k,ax in enumerate(axes):
        ax.set(xlim=(-1.4,1.4),ylim=(-1.4,1.4),aspect='equal');ax.axis('off');ax.add_patch(Circle((0,0),1.1,fc='#e7f0f5',ec='#32596d',lw=3));ax.add_patch(Circle((0,0),.22,fc='#537f98'))
        for n in range(5):
            angle=72*n;ax.add_patch(Wedge((0,0),1.05,angle,angle+22,width=.81,fc='#6d8b9e'));ax.add_patch(Wedge((0,0),.98,angle+(18 if k else 32),angle+(50 if k else 64),width=.7,fc='#d5a45d',alpha=.85))
        ax.add_patch(FancyArrowPatch((-.6,1.2),(.6,1.2),connectionstyle='arc3,rad=-.4',arrowstyle='-|>',mutation_scale=18,lw=2,color='#154e6a'));ax.set_title('Wheel frame: φ(t)' if not k else 'Cover frame: ψ(t) = φ(t) + θ(t)')
    fig.suptitle('Original schematic · reference frames, not patent dimensions',fontsize=15);save(fig,'relative-rotation.svg')
    speed=np.linspace(0,200,300);v=speed/3.6;rho=1.225;dA=.015;power=.5*rho*v**3*dA
    fig,ax=plt.subplots(figsize=(9,4.7));ax.plot(speed,power,lw=3,c='#176889');ax.set(xlabel='Vehicle speed (km/h)',ylabel='Calculated aerodynamic power difference (W)',title='Assumed whole-vehicle Δ(CᴅA) = 0.015 m²');save(fig,'drag-power.svg')
    C=2500;Tinfty=25;T0=100;heat=3000;time=np.linspace(0,600,400)
    fig,ax=plt.subplots(figsize=(9,4.7));cross={}
    for label,H in [('Open (assumed)',15),('Closed (assumed)',7.5)]:
        eq=Tinfty+heat/H;tau=C/H;T=eq+(T0-eq)*np.exp(-time/tau);ax.plot(time,T,lw=2.5,label=f'{label}: H = {H:g} W/K');cross[label]=-tau*math.log((180-eq)/(T0-eq))
    ax.axhline(180,c='#aa5628',ls='--',label='Chosen classroom threshold 180°C');ax.set(xlabel='Time (s)',ylabel='Effective assembly temperature (°C)',title='Lumped model · C = 2500 J/K · heat input 3000 W');ax.legend();save(fig,'thermal-response.svg')
    mass=.03;radius=.18;Rt=.33;force=mass*radius*(v/Rt)**2
    fig,ax=plt.subplots(figsize=(9,4.7));ax.plot(speed,force,lw=3,c='#176889');ax.set(xlabel='Vehicle speed (km/h)',ylabel='Centrifugal attachment force (N)',title='Illustrative component: m = 0.030 kg, r = 0.18 m, tire R = 0.33 m');save(fig,'centrifugal-load.svg')
    L=.12;b=.05;E=70e9;pressure=1500;thickness=np.linspace(.001,.003,200);I=b*thickness**3/12;q=pressure*b;delta=q*L**4/(8*E*I);stress=3*pressure*L**2/thickness**2
    fig,(ax,bx)=plt.subplots(1,2,figsize=(11,4.7));ax.plot(thickness*1000,delta*1000,lw=3);ax.set(xlabel='Blade thickness (mm)',ylabel='Tip deflection (mm)',title='Uniform-pressure cantilever surrogate');bx.plot(thickness*1000,stress/1e6,lw=3,c='#aa5628');bx.set(xlabel='Blade thickness (mm)',ylabel='Root bending stress (MPa)',title='L = 120 mm, Δp = 1500 Pa');save(fig,'blade-stiffness.svg')
    vals=[.833333333333,.2,.5,.8,2.666666666667];names=['Pressure bending','Thermal approach','Runout','Tolerance','Remaining'];colors=['#205f80','#4c8ead','#9cbacb','#d49b52','#5f9469'];fig,ax=plt.subplots(figsize=(10,3.8));left=0
    for value,name,color in zip(vals,names,colors):ax.barh([0],[value],left=left,color=color,label=f'{name}: {value:.3g} mm');left+=value
    ax.set(xlim=(0,5),xlabel='Contribution to 5 mm nominal gap (mm)',yticks=[],title='Independent clearance budget · values are chosen inputs');ax.legend(ncol=2,loc='upper center',bbox_to_anchor=(.5,-.25));fig.subplots_adjust(bottom=.35);save(fig,'clearance-budget.svg')
    baseI=b*.002**3/12;basedelta=q*L**4/(8*E*baseI);stressbase=3*pressure*L**2/.002**2
    result={'drag_power_84_kmh_W':float(.5*rho*(84/3.6)**3*dA),'drag_power_120_kmh_W':float(.5*rho*(120/3.6)**3*dA),'thermal_threshold_time_s':cross,'centrifugal_120_kmh_N':mass*radius*((120/3.6)/Rt)**2,'centrifugal_200_kmh_N':mass*radius*((200/3.6)/Rt)**2,'beam_force_N':q*L,'beam_root_moment_Nm':q*L**2/2,'beam_deflection_mm':basedelta*1000,'beam_stress_MPa':stressbase/1e6,'remaining_gap_mm':5-(basedelta*1000+.2+.5+.8),'minimum_thickness_for_1mm_residual_mm':2*(basedelta*1000/2.5)**(1/3),'vehicle_kinetic_energy_100kmh_kJ':.5*1800*(100/3.6)**2/1000}
    assert abs(result['beam_deflection_mm']-.833142857142857)<1e-8
    assert abs(result['centrifugal_120_kmh_N']-55.09641873)<1e-5
    assert result['remaining_gap_mm']>0
    (out/'checked-values.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
if __name__=='__main__':main()
