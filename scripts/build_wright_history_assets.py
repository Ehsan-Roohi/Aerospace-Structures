"""Historical photo extraction and original teaching charts for Wright reading.

Pass the 2023 NPS factory HSR PDF as the first argument. Embedded historical
photos are copied byte-for-byte; no generative edits or colourization.
"""
import sys
from pathlib import Path
from pypdf import PdfReader
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle

OUT = Path(__file__).resolve().parents[1] / 'docs/assets/wright-controls'
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':17,
                     'svg.fonttype':'none','svg.hashsalt':'wright-history'})
B,R,K,G = '#176b9c','#bd3745','#20394e','#b08300'

if len(sys.argv) > 1:
    reader = PdfReader(sys.argv[1])
    photos = [(26,0,'factory_rib_propeller_department_1911.jpg'),
              (28,0,'factory_machine_shop_1911.jpg'),
              (29,0,'factory_model_b_assembly_1911.jpg'),
              (30,0,'factory_model_f_assembly_1913.jpg')]
    for page,index,name in photos:
        im = reader.pages[page].images[index]
        assert im.image.width > 1000 and im.data[:2] == b'\xff\xd8'
        (OUT/name).write_bytes(im.data)
        print(f'Extracted PDF page {page+1}, {im.name}, {im.image.size}: {name}')

def save(fig,name):
    fig.savefig(OUT/(name+'.png'),dpi=185,bbox_inches='tight')
    fig.savefig(OUT/(name+'.svg'),bbox_inches='tight',metadata={'Date':None})
    plt.close(fig)

fig,axs=plt.subplots(1,2,figsize=(14,7),layout='constrained')
ax=axs[0]
ax.bar(['Wrights: cash-outlay\nrecollection'],[1000],color=B,width=.5)
ax.scatter([0],[1000],marker='v',s=150,color=R,zorder=5)
ax.text(0,1700,'LESS THAN $1,000',ha='center',color=B,fontsize=22)
ax.set(ylim=(0,80000),ylabel='Historical nominal US dollars',title='Early experiments: different accounting scopes')
ax.grid(axis='y',alpha=.2);ax.set_axisbelow(True)
ax.text(.5,.58,'Retrospective cash estimate\nNot an audited project account\nOwn labour not fully priced',
        transform=ax.transAxes,ha='center',fontsize=17)
ax=axs[1]
ax.bar(['Langley: allocated\nproject funds'],[50000],color=B,width=.5,label='War Department: $50,000')
ax.bar(['Langley: allocated\nproject funds'],[20000],bottom=[50000],color=G,width=.5,label='Smithsonian: $20,000')
ax.text(0,72500,'$70,000 allocated',ha='center',fontsize=22,color=K)
ax.set(ylim=(0,80000),title='Not a like-for-like efficiency ratio')
ax.grid(axis='y',alpha=.2);ax.set_axisbelow(True)
ax.legend(loc='upper right',bbox_to_anchor=(1,-.15),fontsize=14)
fig.suptitle('Funding, cash expenditure and sale income are different quantities',fontsize=23)
save(fig,'funding_scopes')

fig,ax=plt.subplots(figsize=(13,6),layout='constrained')
ax.barh(['1909 Army purchase'],[25000],color=B,label='Base contract: $25,000')
ax.barh(['1909 Army purchase'],[5000],left=[25000],color=G,label='Speed bonus: $5,000')
ax.text(15000,0,'$30,000 final payment',ha='center',va='center',color='white',fontsize=23)
ax.set(xlim=(0,34000),xlabel='Nominal dollars in the 1909 transaction',title='A later sale—not funding for the first 1903 flight')
ax.legend(loc='upper center',bbox_to_anchor=(.5,-.15),ncol=2,fontsize=15)
save(fig,'army_purchase_price')

fig,ax=plt.subplots(figsize=(14,9));ax.axis('off');ax.set(xlim=(0,14),ylim=(0,9))
items=[('1  Read, sketch, specify','Home, literature, calculations and design decisions',7),
       ('2  Make components','Spars, ribs, propellers, engine parts, wire and fabric',4.7),
       ('3  Assemble and inspect','Alignment, clearances, joints and control travel',2.4),
       ('4  Test and revise','Load / propulsion checks, flight evidence and maintenance',.1)]
for title,body,y in items:
    ax.add_patch(Rectangle((.4,y),13.2,1.65,facecolor='#eef5fa',edgecolor=B,lw=2))
    ax.text(7,y+1.1,title,ha='center',fontsize=23,color=K)
    ax.text(7,y+.43,body,ha='center',fontsize=17)
    if y>.5:ax.annotate('',xy=(7,y-.55),xytext=(7,y),arrowprops={'arrowstyle':'->','lw':3,'color':G})
ax.set_title('From a successful prototype to repeatable manufacture',fontsize=24,pad=20)
fig.text(.5,-.005,'Interpretive engineering sequence, not a dimensioned reconstruction of the factory floor or an archival process chart.',ha='center',fontsize=13)
fig.tight_layout();save(fig,'manufacturing_sequence')
assert 50000+20000 == 70000
assert 25000+5000 == 30000
print('Three charts generated; dollar totals checked.')
