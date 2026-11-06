"""Reproduce hypothetical measurement/structural classroom examples."""
import json, math
from pathlib import Path
m,a,L,b,t,E,fpx=.10,2.,.10,.020,.003,70e9,600.
I=b*t**3/12;F=m*a;M=F*L
out={'assumption':'Hypothetical static laboratory cantilever; not flight performance', 'force_N':F,'root_moment_Nm':M,'I_m4':I,'tip_deflection_mm':F*L**3/(3*E*I)*1000,'tip_slope_rad':F*L**2/(2*E*I),'nominal_stress_MPa':M*(t/2)/I/1e6,'image_shift_px':fpx*F*L**2/(2*E*I),'bias_example_10s_m':.5*.01*10**2,'bias_example_60s_m':.5*.01*60**2}
assert math.isclose(out['tip_deflection_mm'],.02116402116402116)
assert math.isclose(out['image_shift_px'],.19047619047619047)
Path(__file__).with_name('calculations.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps(out,indent=2))
