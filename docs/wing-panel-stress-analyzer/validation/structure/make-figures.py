"""Replot the published actual-sample CSV files; requires NumPy and Matplotlib.

Run from any directory: python make-figures.py
No solver outputs are altered, fitted, clipped or interpolated by this script.
Rotation fits were computed from the raw solid displacement fields as documented
in index.html; their sample coverage and residuals are retained in *-twist.csv.
"""
from pathlib import Path
import csv
import numpy as np
import matplotlib as mpl
mpl.use('Agg')
if 'font.enable_last_resort' in mpl.rcParams:
    mpl.rcParams['font.enable_last_resort'] = False
import matplotlib.pyplot as plt
HERE=Path(__file__).resolve().parent
mpl.rcParams.update({'font.family':'Times New Roman','font.size':16,'axes.titlesize':18,'axes.labelsize':17,'xtick.labelsize':14,'ytick.labelsize':14,'legend.fontsize':15,'svg.fonttype':'none'})
def rows(name):
    with (HERE/name).open(encoding='utf-8',newline='') as f:return list(csv.DictReader(f))
def col(r,key):return np.array([float(x[key]) for x in r])
for motion in [True,False]:
    fig,axes=plt.subplots(2,2,figsize=(15.5,10.5 if motion else 10.8),layout='constrained')
    for j,channel in enumerate(['uniform','torque']):
        data=[r for r in rows(channel+('-motion.csv' if motion else '-stress.csv')) if r['resolved']=='True']
        x=col(data,'y_mm' if motion else 'normal_foot_station_mm')
        solid=col(data,'solid_uz_mm' if motion else 'solid_normal_MPa')
        beam=col(data,'beam_uz_mm' if motion else 'current_beam_normal_MPa')
        axes[0,j].scatter(x,solid,s=8,color='#151515',alpha=.22,label='CalculiX 2.23: actual material nodes' if motion else 'CalculiX 2.23 solid: actual IPs',rasterized=True)
        axes[0,j].scatter(x,beam,s=7,color='#1767b3',alpha=.20,label='Current solver: same physical nodes' if motion else 'Current solver: same physical IPs',rasterized=True)
        if motion:
            f=rows(channel+'-twist.csv');y=col(f,'y_mm')
            axes[1,j].plot(y,col(f,'solid_rigid_fit_axis_rotation_deg'),color='#151515',marker='o',ms=5.5,mfc='white',lw=1.7,label='CalculiX: nodal-band rigid-motion fit')
            axes[1,j].plot(y,col(f,'beam_axis_rotation_deg'),color='#1767b3',lw=2,ls='--',label='Current solver: equivalent-section rotation')
        else:axes[1,j].scatter(x,beam-solid,s=7,color='#a33820',alpha=.22,label='Current solver minus CalculiX',rasterized=True)
        axes[0,j].set_title('Upward tip force: 2 N' if channel=='uniform' else 'Pure global moment: My = 50 N mm',pad=13)
        axes[0,j].set_ylabel('Signed vertical displacement uz (mm)' if motion else 'Signed normal stress (MPa)')
        axes[1,j].set_ylabel('Rotation about local span axis (degrees)' if motion else 'Matched-point stress difference (MPa)')
        for i in [0,1]:
            ax=axes[i,j];ax.set_xlim(-4,244);ax.axhline(0,color='#777',lw=.7);ax.grid(alpha=.15)
            ax.legend(loc='best',markerscale=3 if i==0 else 1,framealpha=.96)
            ax.set_xlabel('Aircraft span coordinate y (mm)' if motion else 'Beam normal-foot span station (mm)')
            if not motion:
                for y in [80,160]:ax.axvline(y,color='#777',ls=':',lw=1.1,zorder=0)
    fig.suptitle('Structural comparison: signed displacement and section-rotation diagnostics' if motion else 'Structural comparison: raw signed stresses across the sampled wing',fontsize=22)
    fig.supxlabel('Rotations use only the stated interior bands; no physical tip-twist value is inferred.' if motion else 'Both load cases: 7,188 resolved matched samples; no stress fitting. Dotted lines mark the ribs.',fontsize=16)
    stem='motion-profiles' if motion else 'stress-profiles'
    for ext in ['svg','png','pdf']:fig.savefig(HERE/(stem+'.'+ext),dpi=190)
    plt.close(fig)
