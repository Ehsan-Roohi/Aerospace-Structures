"""Original teaching models. Run with numpy and matplotlib; no monument calibration."""
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
P=Path(__file__).resolve().parent
plt.rcParams.update({'font.size':11,'figure.dpi':160,'svg.fonttype':'none'})
def save(name):
 plt.tight_layout();plt.savefig(P/name);plt.close()
L,D,t,E,rho=7.5,1.1,.2,600e6,1800
A=np.pi/4*(D**2-(D-2*t)**2);I=np.pi/64*(D**4-(D-2*t)**4)
k=3*E*I/L**3
# Exact uniform-beam first frequency and mass that matches it with static tip stiffness.
f=1.875104068711961**2/(2*np.pi*L**2)*np.sqrt(E*I/(rho*A));m=k/(2*np.pi*f)**2
print(f'A={A:.8f} m2 I={I:.8f} m4 k={k:.3f} N/m f1={f:.8f} Hz m_eff={m:.3f} kg')
x=np.linspace(0,L,151);v=1000*x*x*(3*L-x)/(6*E*I)
plt.figure(figsize=(8,4));plt.plot(x,v*1e3);plt.xlabel('Distance from clamp (m)');plt.ylabel('Transverse deflection (mm)');plt.title('Uniform tube, 1 kN tip load: educational surrogate');plt.grid(alpha=.3);save('beam-deflection.svg')
# Forced two-DOF receptance, identical masses, 5% reference damping, coupling spring.
w=2*np.pi*np.linspace(.2,3.5,1100);kc=.15*k;c=2*.05*np.sqrt(k*m)
fig,axs=plt.subplots(1,2,figsize=(10,4))
for detune in [0,.08,.3]:
 K=np.array([[k+kc,-kc],[-kc,k*(1+detune)+kc]])
 response=np.array([np.linalg.solve(K-ww**2*m*np.eye(2)+1j*ww*c*np.eye(2),[1,0]) for ww in w])
 axs[0].plot(w/(2*np.pi),np.abs(response[:,1])*k,label=f'k2/k1={1+detune:.2f}')
 axs[1].plot(w/(2*np.pi),np.abs(response[:,1]/response[:,0]),label=f'k2/k1={1+detune:.2f}')
axs[0].set(ylabel='Normalized receiver response k |X2| / F0',xlabel='Excitation frequency (Hz)')
axs[1].set(ylabel='Displacement ratio |X2 / X1|',xlabel='Excitation frequency (Hz)')
for a in axs:a.grid(alpha=.3);a.legend()
fig.suptitle('Synthetic two-DOF model: coupling and detuning');save('coupled-response.svg')
# Exact free response, undamped equal towers, initial displacement of tower 1.
w1=np.sqrt(k/m);w2=np.sqrt((k+2*kc)/m);time=np.linspace(0,18,1800)
plt.figure(figsize=(9,4));plt.plot(time,.5*(np.cos(w1*time)+np.cos(w2*time)),label='Tower 1');plt.plot(time,.5*(np.cos(w1*time)-np.cos(w2*time)),label='Tower 2');plt.xlabel('Time (s)');plt.ylabel('Displacement / initial displacement');plt.title('Synthetic free response: beating, no damping');plt.legend();save('beating.svg')
r=np.linspace(0,2,700)
plt.figure(figsize=(8,4))
for z in [.02,.05,.1]:plt.plot(r,1/np.sqrt((1-r*r)**2+(2*z*r)**2),label=f'zeta={z}')
plt.xlabel('Frequency ratio r');plt.ylabel('SDOF dynamic amplification');plt.title('Steady harmonic response: damping limits amplification');plt.legend();plt.grid(alpha=.3);save('amplification.svg')
# Schema uses original vector artwork, rather than reproducing journal figures.
fig,ax=plt.subplots(figsize=(9,5))
for a in [0,9.2]:
 ax.plot([a,a],[0,7.5],lw=14,color='#537d9a');ax.scatter([a],[7.5],s=230,color='#c66a27');ax.text(a,8.2,'Tower 1' if a==0 else 'Tower 2',ha='center')
ax.plot([0,9.2],[0,0],lw=12,color='#6b9a78');ax.text(4.6,-1,'Flexible common structure',ha='center');ax.annotate('Lateral forcing',xy=(0,7),xytext=(-3,7),arrowprops={'arrowstyle':'->'});ax.text(4.6,4,'Coupling transmits forces\nand support motion',ha='center');ax.set(xlim=(-3.5,12),ylim=(-2,9));ax.axis('off');ax.set_title('Conceptual geometry — not a structural survey');save('coupling-schema.svg')
# Limiting cases are meaningful checks of the supplemental model.
K=np.diag([k,k]);u=np.linalg.solve(K-(.6*w1)**2*m*np.eye(2)+1j*.6*w1*c*np.eye(2),[1,0]);assert abs(u[1])<1e-15
assert abs((.5*(np.cos(w1*0)-np.cos(w2*0))))<1e-15
print('Uncoupled receiver and initial-condition checks passed.')
