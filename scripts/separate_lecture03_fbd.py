"""Keep the supported physical system separate from its external free body."""
import uuid

HELPERS=r'''
def beam_system_or_fbd(ax, kind, title, station=225., uniform=False, generic=False, fbd=False):
    """One representation per panel: supports OR their replacement reactions."""
    clean_beam(ax,title)
    if not fbd:
        support(ax,0,'pin' if kind=='simple' else 'fixed')
        if kind=='simple': support(ax,L,'roller')
        if kind=='fixed': support(ax,L+9,'fixed')
    # Applied loads stay in both drawings.
    if uniform or generic:
        for xx in np.linspace(45,L-25,8): arrow(ax,(xx,32),(xx,2))
        ax.text(90,43,'q (N/mm)' if generic else 'q = 2/450 N/mm; total = 2 N',fontsize=12)
    if not uniform:
        arrow(ax,(station,40),(station,2))
        ax.text(min(station+12,365),49,'P (N)' if generic else 'P = 2 N down',fontsize=12)
    if fbd:
        rootforce='RA (unknown)' if generic else 'RA = 2 N up' if kind=='cantilever' else 'RA = 1 N up'
        arrow(ax,(0,-27),(0,-2),'#176441')
        ax.text(15,-25,rootforce,fontsize=12,color='#176441')
        if kind!='cantilever':
            arrow(ax,(L,-27),(L,-2),'#176441')
            ax.text(333,-25,'RB = 1 N up',fontsize=12,color='#176441')
        if kind!='simple':
            moment='CA (unknown)' if generic else 'CA = 112.5 N mm CCW' if kind=='fixed' else 'CA = 450 N mm CCW' if uniform or station==L/2 else 'CA = 900 N mm CCW'
            ax.add_patch(FancyArrowPatch((25,20),(-30,20),connectionstyle='arc3,rad=1',
                         arrowstyle='-|>',mutation_scale=18,color='#d46a1f',lw=2))
            ax.text(-42,54,moment,fontsize=12,color='#d46a1f')
        if kind=='fixed':
            ax.add_patch(FancyArrowPatch((L-25,20),(L+30,20),connectionstyle='arc3,rad=-1',
                         arrowstyle='-|>',mutation_scale=18,color='#d46a1f',lw=2))
            ax.text(330,54,'CB = 112.5 N mm CW',fontsize=12,color='#d46a1f')
        if kind=='simple': ax.text(100,57,'CA = CB = 0; axial reaction Rx = 0',fontsize=12)
        elif not generic: ax.text(190,-63,'Axial reaction Rx = 0',fontsize=11)
    else:
        ax.text(5,-65,'Physical supports shown; no reaction arrows in this panel.',fontsize=12)
    if station<L and not uniform and not generic:
        dimension(ax,(0,-42),(station,-42),'a = 225 mm',(0,-8))
        dimension(ax,(station,-42),(L,-42),'L − a = 225 mm',(0,-8))
    else:
        dimension(ax,(0,-42),(L,-42),'L = 450 mm',(0,-8))
    ax.set_ylim(-78,68)
'''

def separate(cells):
    def get(fragment):
        return next(c for c in cells if fragment in c['source'])
    get('0. Setup and clear plotting conventions')['source'] += '\n'+HELPERS
    # Reaction comparison: equations below each pair belong to its free body.
    for kind,tag,name in [('cantilever','Figure 1A','Cantilever'),
                          ('simple','Figure 1B','Pin–roller'),
                          ('fixed','Figure 1C','Fixed–fixed')]:
        get('#@title '+tag)['source']=f'''#@title {tag} — supported system first, free body second
fig,axes=plt.subplots(2,1,figsize=(12,8),layout='constrained')
beam_system_or_fbd(axes[0],{kind!r},'1. {name}: physical beam, supports and applied centre force')
beam_system_or_fbd(axes[1],{kind!r},'2. Same beam isolated: supports removed, replaced by reactions',fbd=True)
plt.show()
'''
    tip=get('Figure 2 — external free body')
    # Preserve the existing isolated outboard-cut drawing, which has no support.
    cut=tip['source'].split('ax=panels[1]',1)[1].rsplit('plt.show()',1)[0]
    tip['source']=r'''#@title Figure 2 — physical tip-load system, external free body, isolated cut
fig,panels=plt.subplots(3,1,figsize=(12,11),layout='constrained')
beam_system_or_fbd(panels[0],'cantilever','1. Tip load: physical support and applied force only',station=L)
beam_system_or_fbd(panels[1],'cantilever','2. External free body: support removed, RA and CA replace it',station=L,fbd=True)
ax=panels[2]
'''+cut+r'''
plt.show()
'''
    get('Figure 6A — line load versus')['source']=r'''#@title Figure 6A — uniform-load system and two valid free-body representations
fig,axes=plt.subplots(3,1,figsize=(12,11),layout='constrained')
beam_system_or_fbd(axes[0],'cantilever','1. Physical system: clamp and applied distributed load only',uniform=True)
beam_system_or_fbd(axes[1],'cantilever','2. Free body: clamp removed; line load and replacement reactions',uniform=True,fbd=True)
beam_system_or_fbd(axes[2],'cantilever','3. Equivalent resultant free body: same reactions, not same deformation',station=L/2,fbd=True)
axes[2].text(240,24,'F = qL at centroid L/2',fontsize=12)
plt.show()
'''
    get('Figure 3 — first the loaded beam')['source']=r'''#@title Figure 3 — physical beam, its free body, then V and M diagrams
V=np.full_like(x,P);M=-P*(L-x)
fig,axes=plt.subplots(4,1,figsize=(12,12),layout='constrained')
beam_system_or_fbd(axes[0],'cantilever','1. Example A: supported physical beam and applied tip force',station=L)
beam_system_or_fbd(axes[1],'cantilever','2. Free body: no support geometry; applied load and reactions',station=L,fbd=True)
for ax,yy,label in zip(axes[2:],[V,M],['Shear V (N)','Sagging-positive M (N mm)']):
    ax.plot(x,yy,lw=3);ax.fill_between(x,yy,0,alpha=.12)
    ax.axhline(0,color='gray');ax.set_ylabel(label);ax.grid(alpha=.2);ax.set_xlim(0,L)
axes[2].set_title('3. Internal shear from the same beam')
axes[3].set_title('4. Internal moment from the same beam')
axes[3].set_xlabel('x from the fixed root (mm)')
plt.show()
'''
    symbol=get('Figure 0A — locate coordinates')
    cross=symbol['source'].split('ax=axes[1]',1)[1].rsplit('plt.show()',1)[0]
    symbol['source']=r'''#@title Figure 0A — physical loads, their free body and section dimensions
fig,axes=plt.subplots(3,1,figsize=(12,12),layout='constrained')
beam_system_or_fbd(axes[0],'cantilever','1. Locate P and q on the physical supported beam',station=L,generic=True)
beam_system_or_fbd(axes[1],'cantilever','2. Locate RA and CA on its free body: support removed',station=L,generic=True,fbd=True)
ax=axes[2]
'''+cross+r'''
plt.show()
'''
    intro=get('## 2. Calculate support reactions')
    intro['source'] += r'''

**Two drawings, two roles:** first draw the supported physical system with applied loads only. Next isolate the same beam, remove every support symbol and replace it by the relevant reaction force/couple. Keep the applied loads on that free body. Equilibrium equations below the pair refer to the second drawing. A load-only drawing is not a complete free body.
'''
    for c in cells:
        c['source']=c['source'].strip()
        c['id']=uuid.uuid5(uuid.NAMESPACE_URL,c['source']).hex[:8]
