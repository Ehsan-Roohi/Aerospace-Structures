"""Build the original figures and web edition of the jet-stream reading."""
from pathlib import Path
import subprocess
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/case-studies/jet-streams'
OUT.mkdir(parents=True,exist_ok=True)
plt.rcParams['svg.fonttype']='none'
fig,ax=plt.subplots(figsize=(9,4.5))
wind=np.linspace(-300,300,301)
ax.plot(wind,6000/(900+wind),lw=2.4,color='#176c8e')
for u in [-200,0,200]:ax.scatter(u,6000/(900+u),color='#b15123',zorder=3)
ax.set(xlabel='Along-track wind (km/h): negative = headwind',ylabel='Flight time (hours)',title='Same distance and true airspeed, different travel times')
ax.grid(alpha=.25);fig.tight_layout();fig.savefig(OUT/'flight-time.svg');plt.close(fig)
(OUT/'velocity.svg').write_text('''<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="400" viewBox="0 0 1000 400"><rect width="1000" height="400" fill="#edf4fa"/><defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#176c8e"/></marker></defs><g font-family="sans-serif" font-size="22" fill="#18364a"><text x="40" y="45" font-size="28">Velocity addition: aircraft + moving air mass</text><g stroke="#176c8e" stroke-width="7" marker-end="url(#a)"><path d="M80 120H580"/><path d="M580 120H780"/><path d="M80 255H780"/></g><text x="190" y="95">Airspeed: 250 m/s</text><text x="590" y="165">Tailwind: 100 m/s</text><text x="245" y="235">Groundspeed: 350 m/s</text><text x="40" y="335">Mach and dynamic pressure use airspeed, not groundspeed.</text><text x="40" y="375" font-size="17">Illustrative aligned vectors. Crosswind requires a wind triangle.</text></g></svg>''')
(OUT/'gust-loads.svg').write_text('''<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="530" viewBox="0 0 1000 530"><rect width="1000" height="530" fill="#edf4fa"/><g font-family="sans-serif" font-size="21" fill="#18364a"><text x="35" y="45" font-size="28">What changes the load on the wing?</text><rect x="30" y="75" width="940" height="150" rx="12" fill="white" stroke="#176c8e"/><text x="55" y="112" font-weight="bold">Uniform tailwind at fixed true airspeed</text><text x="55" y="155">Groundspeed changes → trip time changes</text><text x="55" y="193">Air-relative flow unchanged → no added load from uniform wind alone</text><rect x="30" y="250" width="940" height="215" rx="12" fill="white" stroke="#b15123"/><text x="55" y="290" font-weight="bold">Vertical gust / changing local airflow</text><text x="55" y="333">Incidence changes → lift increment → wing bending and torsion</text><text x="55" y="376">Ribs / skin → spars → wing root → fuselage</text><text x="55" y="420">Dynamic response also depends on modes, mass, damping and controls.</text><text x="35" y="505" font-size="17">Conceptual load paths. No actual aircraft geometry or certification loads implied.</text></g></svg>''')
text=(ROOT/'JET_STREAMS_FLIGHT_SPEED_AND_LOADS.md').read_text().replace('docs/case-studies/jet-streams/','').replace('(READINGS.md)','(https://github.com/Ehsan-Roohi/Aerospace-Structures/blob/main/READINGS.md)')
body=subprocess.run(['pandoc','-f','markdown+tex_math_dollars','-t','html5','--mathjax'],input=text,text=True,capture_output=True,check=True).stdout
player='''<video controls preload="none" poster="https://svs.gsfc.nasa.gov/vis/a000000/a003800/a003864/jetstream.00600.jpg" aria-label="NASA historical polar jet stream animation"><source src="https://svs.gsfc.nasa.gov/vis/a000000/a003800/a003864/jetstream.mp4" type="video/mp4"><p><a href="https://svs.gsfc.nasa.gov/3864/">Watch the animation on NASA SVS</a></p></video>'''
# Match the generated heading by text rather than depending on Pandoc's numbered id.
import re
body,count=re.subn(r'(<h2[^>]*>6\. Flight time,\s+fuel and the slow return journey</h2>)',lambda m:player+m.group(1),body,count=1)
if count!=1:raise RuntimeError('Video insertion anchor missing')
style='''body{margin:0;background:#edf3f7;color:#18364a;font:18px/1.75 system-ui}main{max-width:1050px;margin:auto;background:white;padding:40px}h1{line-height:1.2}h2{color:#125c73;margin-top:2em}a{color:#086886}img,video{max-width:100%;height:auto}video{width:100%}table{border-collapse:collapse;display:block;overflow:auto}td,th{border:1px solid #ccd7df;padding:10px;text-align:left}.math.display{display:block;overflow:auto;padding:16px;background:#f1f6fa}nav{padding:12px;background:#edf3f7}@media(max-width:640px){main{padding:20px}body{font-size:16px}}'''
(OUT/'index.html').write_text(f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Jet streams, flight speed and structural loads · MIE 446</title><style>{style}</style><script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"></script></head><body><main><nav><a href="https://github.com/Ehsan-Roohi/Aerospace-Structures/blob/main/READINGS.md">All course readings</a> · <a href="../../wing-lab.html">BeamLab</a></nav>{body}</main></body></html>\n')
print('Built jet-stream reading and three original figures')
