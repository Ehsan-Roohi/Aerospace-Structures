"""Manual, explicitly bounded reads of all resolved open triangles in Fig. 3.

Source image is obtained from the cited primary report and is not bundled. The points are not simulated
data and have not been used to fit any current solver parameter.
"""
import csv,hashlib,json,math
import os
from pathlib import Path
import numpy as np
from PIL import Image
P=Path(__file__).resolve().parent
if os.name=='nt' and not str(P).startswith('\\\\?\\'): P=Path('\\\\?\\'+str(P))
image=P/'uhlman-jiang1977-figure3-upright.png'
assert Image.open(image).size==(1426,1102)
# Three-point affine calibration includes the slight scan-axis skew.
origin=np.array([255.,837.])
x_tick=np.array([986.,833.])       # alpha/sigma=0.10, l/c=0
y_tick=np.array([251.,247.])       # alpha/sigma=0, l/c=0.80
transform=np.column_stack(((x_tick-origin)/.10,(y_tick-origin)/.80))
# Ordered by cavity length. All five resolved OPEN triangular data markers.
pixels=[[738,597],[712,589],[753,544],[782,447],[805,264]]
points=[]
for i,xy in enumerate(pixels,1):
 q,l=np.linalg.solve(transform,np.array(xy)-origin)
 sigma=math.radians(4)/q
 points.append(dict(id='alpha4-cavity-pressure-'+str(i),pixel=xy,alpha_over_sigma=float(q),
                    cavity_length_over_chord=float(l),
                    sigma_using_alpha_radians=float(sigma),
                    sigma_reading_bounds_using_ratio=[math.radians(4)/(q+.001),math.radians(4)/(q-.001)],
                    length_below_reported_instability_threshold=bool(l<.75),
                    measured_pressure_basis='Actual measured cavity pressure: open triangle',
                    measurement_not_current_prediction=True))
data=dict(
 source=dict(authors='J. S. Uhlman Jr. and C.-W. Jiang',year=1977,report='MIT 83481-2, DTIC ADA045767',
             title='Experiments on a Partially Cavitating Plano-Convex Hydrofoil with Comparison to Theory',
             primaryURL='https://apps.dtic.mil/sti/pdfs/ADA045767.pdf',
             retrievedCopy='https://archive.org/download/DTIC_ADA045767/DTIC_ADA045767.pdf',
             pdfSha256=hashlib.sha256((P/'uhlman-jiang1977.pdf').read_bytes()).hexdigest(),
             figure=3,pdfPage=24,printedPage=14),
 geometry=dict(type='2D plano-convex; upper parabolic, lower flat',thicknessRatio=.06,chord_inches=4,
               chord_m=.1016,span_inches=19.75,tunnel_width_inches=20,tunnel_height_inches=20,
               upper_reconstruction='z/c = 4*0.06*(x/c)*(1-x/c)',
               reconstructionStatus='Derived from the stated parabolic suction side, mid-chord thickness and closed endpoints; not a printed coordinate table.'),
 flow=dict(alpha_degrees=4,per_point_speed_m_s=None,per_point_Reynolds=None,
           velocity_note='Speed was varied for each point; 9.1 m/s is the facility maximum, not the test speed.',
           pressure_note='Open and filled triangles use measured cavity pressure and vapor pressure, respectively; do not merge them.'),
 calibration=dict(image=image.name,imageSha256=hashlib.sha256(image.read_bytes()).hexdigest(),
                  origin=origin.tolist(),ratio_0_10_tick=x_tick.tolist(),length_0_80_tick=y_tick.tolist(),
                  affinePixelMatrix=transform.tolist(),sourceScale=1.8,rotationDegrees=-90),
 manualDigitizationBounds=dict(alpha_over_sigma=.001,cavity_length_over_chord=.01,
                               scope='Conservative reading bounds only, not experimental confidence intervals.'),
 sigma_conversion_assumption='Alpha is expressed in radians when converting the plotted alpha/sigma ratio. The figure labels alpha=4 degrees but does not print the ratio angle unit; retain the original ratio and this inference.',
 selection='All five resolved open triangular points retained, including l/c>0.75. No theory lines or vapor-pressure markers digitized here.',
 limitations=['Per-point speed/Re and formal measurement uncertainty absent from this report.',
              'Tunnel and boundary-layer effects are not represented by current unbounded inviscid geometry.',
              'Current NACA-only hydrofoil must gain the actual custom profile before a matched calculation.',
              'Current recovery/detachment physics must be declared, not fitted to these lengths.',
              'The report warns of instability at l/c>0.75; retain the point but do not claim steady validation there.'],
 points=points)
(P/'uhlman-alpha4-open-points.json').write_text(json.dumps(data,indent=2))
with (P/'uhlman-alpha4-open-points.csv').open('w',newline='') as f:
 w=csv.DictWriter(f,fieldnames=['id','alpha_over_sigma','cavity_length_over_chord','sigma_using_alpha_radians','length_below_reported_instability_threshold'])
 w.writeheader();w.writerows({k:p[k] for k in w.fieldnames} for p in points)
print(json.dumps(points,indent=2))
