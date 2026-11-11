"""Build original analytical figures and the A350 ULR web reading."""
from pathlib import Path
import subprocess
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/case-studies/a350-ulr';OUT.mkdir(parents=True,exist_ok=True)
plt.rcParams['svg.fonttype']='none'
m=np.linspace(0,25,101);rng=250/.00015*20*np.log((300+m)/200)/1000
fig,ax=plt.subplots(figsize=(9,4.6));ax.plot(m,rng,color='#176c8e',lw=2.5);ax.scatter([0,16.72],[rng[0],250/.00015*20*np.log(316.72/200)/1000],color='#b15123')
ax.set(xlabel='Additional fuel mass (tonnes), assumed fixed final mass',ylabel='Ideal segment range (km)',title='Extra fuel fraction: an idealized model, not A350 performance')
ax.grid(alpha=.25);fig.tight_layout();fig.savefig(OUT/'range-model.svg');plt.close(fig)
(OUT/'load-path.svg').write_text('''<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="500" viewBox="0 0 1100 500"><rect width="1100" height="500" fill="#edf4fa"/><g font-family="sans-serif" fill="#17364b"><text x="35" y="45" font-size="28">A rear tank changes load transfer and aircraft balance</text><rect x="55" y="105" width="310" height="105" rx="12" fill="#c5dce9" stroke="#176c8e"/><text x="85" y="150" font-size="23">Fuel mass + tank system</text><text x="95" y="185" font-size="18">Weight • acceleration • slosh</text><path d="M370 158H480" stroke="#b15123" stroke-width="5"/><path d="M465 145L485 158L465 171" fill="none" stroke="#b15123" stroke-width="5"/><rect x="490" y="105" width="535" height="105" rx="12" fill="white" stroke="#176c8e"/><text x="520" y="150" font-size="23">Local enclosure / support interfaces</text><text x="520" y="185" font-size="18">Actual integrated design determines the load sharing</text><path d="M750 220V280" stroke="#b15123" stroke-width="5"/><path d="M737 265L750 285L763 265" fill="none" stroke="#b15123" stroke-width="5"/><rect x="230" y="295" width="795" height="100" rx="12" fill="white" stroke="#176c8e"/><text x="260" y="337" font-size="23">Surrounding airframe → wing–body reactions / ground reactions</text><text x="260" y="373" font-size="18">CG envelope • fuselage bending • local strength • fatigue • balance</text><text x="35" y="450" font-size="18">Original conceptual load-path diagram; not an Airbus attachment or reinforcement drawing.</text></g></svg>''')
ratios=np.linspace(1,1.1,101)
fig,ax=plt.subplots(figsize=(9,4.8))
ax.plot(100*(ratios-1),100*(np.sqrt(ratios)-1),label='Airspeed at fixed lift coefficient',lw=2)
ax.plot(100*(ratios-1),100*(ratios**2-1),label='Idealized ground roll / kinetic energy',lw=2)
ax.set(xlabel='Increase in aircraft mass (%)',ylabel='Increase relative to baseline (%)',title='More weight: modest speed increase, larger runway/energy penalty')
ax.grid(alpha=.25);ax.legend();fig.tight_layout();fig.savefig(OUT/'takeoff-scaling.svg');plt.close(fig)
s=(ROOT/'A350_ULR_STRUCTURAL_CHANGES.md').read_text().replace('docs/case-studies/a350-ulr/','').replace('(READINGS.md)','(https://github.com/Ehsan-Roohi/Aerospace-Structures/blob/main/READINGS.md)')
body=subprocess.run(['pandoc','-f','markdown+tex_math_dollars','-t','html5','--mathjax'],input=s,text=True,capture_output=True,check=True).stdout
css='body{max-width:1080px;margin:30px auto;padding:25px;color:#17364b;background:#f9fbfd;font:18px/1.75 system-ui}h1{line-height:1.2}h2{margin-top:2em;color:#12647b}img{max-width:100%;height:auto}table{border-collapse:collapse;display:block;overflow:auto}th,td{border:1px solid #cbd7e0;padding:10px;text-align:left}.math.display{display:block;overflow:auto;padding:16px;background:#edf3f7}a{color:#086886}'
(OUT/'index.html').write_text('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>A350-1000ULR: structural and systems changes · MIE 446</title><style>'+css+'</style><script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"></script></head><body>'+body+'</body></html>\n')
for svg in OUT.glob('*.svg'):
    svg.write_text('\n'.join(line.rstrip() for line in svg.read_text().splitlines())+'\n')
print('Built A350 ULR reading and three original engineering figures')
