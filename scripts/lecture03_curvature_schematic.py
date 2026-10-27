"""One curvature contribution, not a hinge in the physical beam."""
import matplotlib.pyplot as plt
import numpy as np
fig, ax = plt.subplots(figsize=(11, 3.8))
s0, x0, slope = 3., 8., .12
ax.plot([0, x0], [0, 0], color='0.65', lw=2, linestyle='--')
ax.plot([0, s0], [0, 0], color='#183c50', lw=3)
ax.plot([s0, x0], [0, slope*(x0-s0)], color='#146ca4', lw=3)
ax.scatter([0,s0,x0],[0,0,0],color='#183c50',s=25,zorder=5)
for xx,label in [(0,'0'),(s0,'s'),(x0,'x')]:
    ax.text(xx,-.16,label,ha='center',va='bottom',fontsize=13)
ax.annotate('',xy=(s0,-.48),xytext=(x0,-.48),arrowprops=dict(arrowstyle='<->',color='0.25'))
ax.text((s0+x0)/2,-.55,'Remaining distance: x − s',ha='center',va='bottom',fontsize=12)
ax.annotate('',xy=(x0,.6),xytext=(x0,0),arrowprops=dict(arrowstyle='<->',color='#146ca4'))
ax.text(x0+.17,.3,'Displacement contribution\n= (x − s) × slope change',va='center',fontsize=11)
ax.annotate('One small slope change at s',xy=(s0+.8,.096),xytext=(3.25,.95),fontsize=12,
            arrowprops=dict(arrowstyle='->',color='#146ca4'))
ax.set_title('Why the displacement integral contains (x − s)',loc='left',fontsize=15,pad=16)
ax.text(0,1.45,'Contribution sketch only: the actual beam is smooth; no internal hinge is introduced.',fontsize=11)
ax.set_xlim(-.25,11.4); ax.set_ylim(1.65,-.8); ax.axis('off')
fig.tight_layout()
plt.show()
