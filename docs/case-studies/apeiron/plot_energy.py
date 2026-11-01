from pathlib import Path
from calculations import extended_results
p=Path(__file__).resolve().parent
import matplotlib
matplotlib.use('Agg')
matplotlib.rcParams['svg.fonttype']='none'
import matplotlib.pyplot as plt
x=extended_results()
fig,axs=plt.subplots(1,2,figsize=(12,4.6),layout='constrained')
fig.suptitle('How much mechanical energy does the carrier supply?',fontsize=17)
axs[0].barh(['Altitude: 13.7 km','Illustrative speed: 230 m/s','Combined carrier state','Potential gain: 90 km'],[x['release_potential_MJ_kg'],x['illustrative_release_kinetic_MJ_kg'],x['illustrative_carrier_energy_MJ_kg'],x['potential_90km_MJ_kg']],color=['#237aa0','#b87c27','#255379','#7a8897'])
axs[0].invert_yaxis();axs[0].set_xlim(0,1.0)
axs[1].barh(['Combined carrier state','Surface → 200-km orbit'],[x['illustrative_carrier_energy_MJ_kg'],x['surface_to_orbit_200km_MJ_kg']],color=['#255379','#7a8897']);axs[1].invert_yaxis();axs[1].set_xlim(0,36)
for ax in axs:
 ax.set_xlabel('Specific energy (MJ/kg)');ax.spines[['top','right']].set_visible(False);ax.bar_label(ax.containers[0],fmt='%.3f',padding=5)

fig.savefig(p/'energy-budget.svg');fig.savefig(p/'energy-budget.png',dpi=120)
