from pathlib import Path
import json,sys,io,base64,contextlib
sys.path.insert(0,r'D:\ChatGPT Backup\Projects\MIE402-Lab5-20261102\build\thermal_analysis_runtime')
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
p=ROOT/'notebooks/MIE446_Lecture_03_Beam_Reactions_Stress_and_Deflection.ipynb'
n=json.loads(p.read_text(encoding='utf-8'))
def src(c): return ''.join(c['source'])
def md(s,id): return dict(cell_type='markdown',id=id,metadata={},source=s.splitlines(True))
primer=r'''### 3 Compatibility: connected members must move together

**A joint has one position after deformation.** If AC, BC and CD meet at C, all three share the same horizontal motion $u_C$ and vertical motion $v_C$. They cannot each predict a different position for C. This is **compatibility**. It does not mean zero displacement or equal extension in different members.

#### What do i and j mean?

They name the **two ends of ONE member**. For AC, choose $i=A$, $j=C$. For BD, choose $i=B$, $j=D$. These are lowercase node labels, not section properties $I$ or $J$.

| Symbol | Meaning |
|---|---|
| $(x_i,y_i)$, $(x_j,y_j)$ | Original joint coordinates |
| $(u_i,v_i)$, $(u_j,v_j)$ | Joint motions: right and up are positive |
| $L$ | Original member length |
| $c=(x_j-x_i)/L$, $s=(y_j-y_i)/L$ | Signed horizontal and vertical components of the member's unit direction |

**First subtract the end motions; then project along the member.** If both ends translate by the same amount, the member does not extend.

$$
\boxed{\delta_{ij}=c(u_j-u_i)+s(v_j-v_i)}.
$$

Here $\delta$ is the **first-order change in the distance between the ends**, positive when they separate. Motion perpendicular to the original axis rotates the member but contributes no first-order extension. The formula assumes small displacements.

- Horizontal member pointing right: $c=1,s=0$, so $\delta=u_j-u_i$.
- Vertical member pointing up: $c=0,s=1$, so $\delta=v_j-v_i$.
- AC: $c=0.8,s=0.6$. If A stays fixed and C moves 0.10 mm right only, $\delta_{AC}=0.08$ mm, not 0.10 mm.
- BD points **left and up**: $c=-0.8,s=+0.6$. Moving D right while B stays fixed brings its ends closer.

For a bar, geometry and elasticity must agree:

$$
\underbrace{c(u_j-u_i)+s(v_j-v_i)}_{\text{from joint motion}}
=\underbrace{\frac{N_{ij}L}{EA_m}}_{\text{from axial force}}.
$$

Use the same joint motions in every connected member. For a taut cable this equality also holds; for a slack cable the material does not carry compression. The next figure separates these ideas.
'''
figcode=r'''#@title Compatibility and a tension-only cable: read the geometry first
import numpy as np
import matplotlib.pyplot as plt
fig,axs=plt.subplots(1,2,figsize=(13,5),layout='constrained')
a=axs[0]
i=np.array([0.,0.]); j=np.array([4.,3.]); dj=np.array([1.1,0.15]); e=np.array([.8,.6]); proj=np.dot(dj,e)*e
jp=j+dj; q=j+proj
# One fixed end isolates the projection; the formula also allows both ends to move.
a.plot([0,4],[0,3],color='black',lw=2,label='Original member')
a.plot([0,jp[0]],[0,jp[1]],'--',color='#276b9d',lw=2,label='Moved member (schematic)')
a.plot([j[0],q[0]],[j[1],q[1]],color='#ae5725',lw=5)
a.plot([q[0],jp[0]],[q[1],jp[1]],':',color='gray')
a.annotate('',jp,xytext=j,arrowprops=dict(arrowstyle='->',color='#276b9d',lw=2))
for pt,label,offset in [(i,'i: held fixed',(-5,-22)),(j,'j',(0,14)),(jp,"j: after motion",(8,0))]:
 a.scatter(*pt,s=35,color='black');a.annotate(label,pt,xytext=offset,textcoords='offset points',fontsize=11)
a.text(2.5,1.05,r'$\delta$: projection along original axis',color='#ae5725',fontsize=11)
a.text(.1,3.85,r'Blue arrow: relative motion $\mathbf{d}_j-\mathbf{d}_i$',fontsize=11)
a.text(.1,-.8,r'$\delta=c(u_j-u_i)+s(v_j-v_i)$',fontsize=14)
a.set(xlim=(-.4,7),ylim=(-1.3,4.5));a.set_aspect('equal');a.axis('off');a.legend(loc='lower right',fontsize=9)
a=axs[1]
old=np.array([[0,0],[4,0],[4,3],[0,3]],float)
new=old+np.array([[0,0],[0,0],[.8,0],[.8,0]])
for pair in [(0,1),(1,2),(2,3),(3,0)]:
 a.plot(old[list(pair),0],old[list(pair),1],':',color='gray',lw=1.5)
 a.plot(new[list(pair),0],new[list(pair),1],color='black',lw=2)
a.plot(new[[0,2],0],new[[0,2],1],color='#276b9d',lw=3)
# Curved line depicts slack qualitatively, not a calculated cable shape.
t=np.linspace(0,1,100); chord=new[1,None,:]*(1-t[:,None])+new[3,None,:]*t[:,None];chord[:,1]-=.35*np.sin(np.pi*t)
a.plot(chord[:,0],chord[:,1],'--',color='#ae5725',lw=2)
for k,name in enumerate('ABCD'):
 a.scatter(*new[k],color='black',s=30);a.annotate(name,new[k],xytext=(-8,10),textcoords='offset points')
for k in [2,3]:a.annotate('',new[k]+[.45,.5],xytext=new[k]+[-.35,.5],arrowprops=dict(arrowstyle='->'))
a.text(.1,4.1,'Illustrative rightward sway (not the solved shape)',fontsize=11)
a.text(4.7,1.65,'AC: ends separate\nCable pulls',color='#276b9d',fontsize=11)
a.text(2.0,2.45,'BD: ends approach\nCable slackens',color='#ae5725',fontsize=11)
a.text(.1,-.7,'Crossing is NOT a joint. Slack curve is illustrative.',fontsize=10)
a.set(xlim=(-.5,7),ylim=(-1.3,4.5));a.set_aspect('equal');a.axis('off')
plt.show()
'''
proof=r'''#### Why test whether a cable is in tension?

Pull a loose string: it straightens and pulls back. Push its ends together: it bends or goes slack; it cannot act like a compression bar. **A negative trial cable force means the assumed model is wrong, not that the cable pushes.** A negative force is acceptable for a bar in this axial model, but not for a cable.

For our initially taut cables, with no pretension or initial slack:

$$
N=\frac{EA_m}{L}\max(\delta,0).
$$

| Calculated endpoint change | Physical state | Cable force |
|---|---|---|
| $\delta>0$ | Taut; stretches elastically | $N=(EA_m/L)\delta>0$ |
| $\delta<0$ | Slack; ends move closer | $N=0$ |
| $\delta=0$ | Taut/slack boundary | $N=0$ |

For a slack cable, negative $\delta$ is **not compressive material strain**: its elastic extension is zero while its ends move closer. This rule would need modification for initial slack or pretension.

#### Apply compatibility to this rectangle

From the directions in the table:

$$
\delta_{AC}=0.8(u_C-u_A)+0.6(v_C-v_A),
$$
$$
\delta_{BD}=-0.8(u_D-u_B)+0.6(v_D-v_B).
$$

Add and group the horizontal and vertical motions:

$$
\delta_{AC}+\delta_{BD}
=0.8[(u_B-u_A)+(u_C-u_D)]
+0.6[(v_D-v_A)+(v_C-v_B)].
$$

The four parenthesized differences are the length changes of AB, CD, DA and BC, respectively. Hence

$$
\boxed{\delta_{AC}+\delta_{BD}
=0.8(\Delta\ell_{AB}+\Delta\ell_{CD})
+0.6(\Delta\ell_{DA}+\Delta\ell_{BC})}.
$$

This is a **geometric identity**, not a new force balance: all six endpoint changes come from the same four joint motions. It remains true when BD is slack, provided its $\delta$ means endpoint change rather than elastic cable stretch.

**Test the possibility that both cables pull.** Let $q=N_{BD}>0$. The joint equations already gave:

| Members | Force | Consequence |
|---|---|---|
| BD, AC | $q$, $q+150$ | Both cables extend: left side of the identity is positive |
| AB, DA | $-0.8q$, $-0.6q$ | Both bars shorten |
| CD, BC | $-60-0.8q$, $-0.6(q+150)$ | Both bars shorten: right side is negative |

A positive number cannot equal a negative number. **Both cables cannot remain in tension in this load case.** Equilibrium already requires AC to pull; BD cannot pull or push, so:

$$
\boxed{N_{BD}=0,\qquad N_{AC}=150\ \mathrm N}.
$$

This finds BD's zero force; its negative endpoint change will confirm actual slackness after we calculate joint motions.

| Member | Axial force (N) | State |
|---|---:|---|
| AB | 0 | Unloaded bar |
| BC | -90 | Compression |
| CD | -60 | Compression |
| DA | 0 | Unloaded bar |
| AC | +150 | Cable in tension |
| BD | 0 | Slackness to be checked |

Keep the zero-force bars AB and DA in the model: they still constrain relative axial motion. With AC active, this supported rectangle is stable; the numerical check below verifies this.
'''
algorithm=r'''
#### If the cable-state check fails, what do we do?

1. Assume which cables are taut and solve the **whole truss** with those cables and all bars.
2. If a taut cable requires $N<0$, remove its axial stiffness contribution and set its force to zero; **solve again**. Do not just erase the negative answer or take its absolute value.
3. Use the new joint motions to check every omitted cable. If its $\delta>0$, it must become taut: include it and solve again. A slack cable must have $N=0$ and $\delta\leq0$.
4. Accept the solution only when the cable states, joint equilibrium, support motions and stability all agree. The code below tests all four combinations for these two cables.

**If removing a cable leaves a mechanism:** the model may have no equilibrium under the applied load, or may have nonunique displacements. A singular solve is a structural warning. Do not invent a small stiffness or let the cable push to force an answer. Additional bracing, pretension or a finite-displacement model would be a different stated model.

For this example, $\delta_{AC}=+0.0375$ mm and $\delta_{BD}=-0.0729$ mm: AC pulls and BD is slack. The geometric identity also checks numerically:

$$
0.0375-0.0729=0.8(0-0.024)+0.6(0-0.027)=-0.0354\ \mathrm{mm}.
$$
'''
new=[]
for c in n['cells']:
 s=src(c)
 if s.startswith('## 8. Four-minute exit ticket'): continue
 if s.startswith('## 9. Homework 4 warm-up'):
  c['source']=s.replace('## 9. Homework','## 8. Homework',1).splitlines(True)
 if c.get('id') in ['truss-compatibility-figure','truss-cable-state-proof']: continue
 if s.startswith('### 3 Check compatibility') or c.get('id')=='truss-compatibility-intro':
  new.append(md(primer,'truss-compatibility-intro'))
  scope={};exec(figcode,scope)
  buf=io.BytesIO();scope['fig'].savefig(buf,format='png',dpi=160,bbox_inches='tight')
  out=ROOT/'notebooks/assets/truss-compatibility.png';out.parent.mkdir(exist_ok=True);out.write_bytes(buf.getvalue())
  new.append(dict(cell_type='code',id='truss-compatibility-figure',metadata={},source=figcode.splitlines(True),execution_count=None,outputs=[dict(output_type='display_data',metadata={},data={'image/png':base64.b64encode(buf.getvalue()).decode(),'text/plain':['Compatibility and tension-only cable schematic']})]))
  new.append(md(proof,'truss-cable-state-proof'));continue
 if s.startswith('### 6 Verify that the unloaded cable'):
  c['source']=(s.split('#### If the cable-state check fails')[0].rstrip()+'\n'+algorithm).splitlines(True)
 new.append(c)
n['cells']=new
p.write_text(json.dumps(n,ensure_ascii=False,indent=1)+'\n',encoding='utf-8')
# Re-run the existing independent truss verification without altering its solver.
scope={}
setup=next(src(c) for c in new if src(c).startswith('#@title Supported truss and whole-truss'))
check=next(src(c) for c in new if src(c).startswith('#@title Independent tension-only'))
# Headless verification: replace notebook-only display with console printing.
setup=setup.replace('from IPython.display import display','display = print')
check=check.replace('from IPython.display import display','display = print')
exec(setup,scope);exec(check,scope)
print('Saved notebook and diagram; existing truss verification passed.')



