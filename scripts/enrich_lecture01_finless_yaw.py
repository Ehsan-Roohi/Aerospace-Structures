"""Update only Lecture 1 section 7A-12; keep cell IDs, code and outputs stable."""
from pathlib import Path
import json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon, Arc

ROOT = Path(__file__).resolve().parents[1]
NB = ROOT/'notebooks/MIE446_Lecture_01_Trust_Forces_Airfoils.ipynb'
RAW = 'https://raw.githubusercontent.com/Ehsan-Roohi/Aerospace-Structures/main/docs/assets/lecture01/'
XREF = 'https://www.scielo.br/j/jatm/a/LRXDrQqY4wyQh4SSGnssPPp/?lang=en'
BREF = 'https://ntrs.nasa.gov/api/citations/19990052675/downloads/19990052675.pdf#page=83'
MOOG = 'https://cisb.org.br/images/pdf/MarioValdo.pdf#page=71'
MOOG_NEWS = 'https://www.moog.com/news/corporate-press-releases/2011/index-1/moog-system-maneuvers-aircraft-primary-flight-surfaces-during-first-flight-of-x-47b-navy-unmanned-combat-air-system.html'

def build_diagram():
    plt.rcParams.update({'font.family':'Times New Roman','font.size':12,'mathtext.fontset':'stix',
                         'text.color':'black','axes.labelcolor':'black','svg.fonttype':'none'})
    fig, axes = plt.subplots(1,3,figsize=(15,5.8))
    fig.subplots_adjust(left=.03,right=.985,top=.84,bottom=.24,wspace=.13)
    for ax in axes:
        ax.set(xlim=(0,10),ylim=(0,8)); ax.axis('off')
    def arrow(ax,start,end):
        ax.annotate('',xy=end,xytext=start,arrowprops=dict(arrowstyle='->',color='black',lw=1.8))
    a=axes[0]
    a.set_title('A. Spoiler + trailing-edge surface',fontsize=15,pad=15)
    a.plot([.5,7.2],[3.7,3.7],color='black',lw=2)
    a.plot([3.2,4.3],[3.7,5.3],color='black',lw=3)
    a.plot([7.2,8.6],[3.7,2.9],color='black',lw=3)
    a.text(3.3,5.65,'Raised spoiler',ha='center')
    a.text(7.2,2.2,'Trailing-edge panel',ha='center')
    arrow(a,(.8,6.6),(2.8,6.6)); a.text(.8,7.1,'Relative airflow')
    a.text(5,1,'Section view: generic paired action',ha='center')
    a.text(5,.15,'Drag changes; lift/pitch/roll may also change.',ha='center',fontsize=11)
    a=axes[1]
    a.set_title('B. Split drag rudder',fontsize=15,pad=15)
    a.plot([.5,5.3],[3.7,3.7],color='black',lw=2)
    a.plot([5.3,8.5],[3.7,5.1],color='black',lw=3)
    a.plot([5.3,8.5],[3.7,2.3],color='black',lw=3)
    a.text(7.2,5.7,'Upper half',ha='center');a.text(7.2,1.7,'Lower half',ha='center')
    arrow(a,(.8,6.6),(2.8,6.6));a.text(.8,7.1,'Relative airflow')
    a.text(5,.9,'Section view: two halves separate',ha='center')
    a.text(5,.15,'Both halves load their hinges and actuators.',ha='center',fontsize=11)
    a=axes[2]
    a.set_title('C. Why more right drag gives right yaw',fontsize=15,pad=15)
    a.add_patch(Polygon([(5,6.8),(.8,3.5),(3.6,3.5),(5,4.1),(6.4,3.5),(9.2,3.5)],
                        facecolor='#eeeeee',edgecolor='black',lw=1.5))
    a.plot(5,4.7,'ko');a.text(4.3,4.25,'CG')
    arrow(a,(5,4.7),(5,7.5)); a.text(5.2,7.1,'+x (forward)')
    arrow(a,(5,4.7),(9.6,4.7));a.text(8.4,5.05,'+y (right)')
    arrow(a,(8,3.7),(8,1.6));a.text(8.3,2.35,'Extra drag\nΔFx < 0',fontsize=11)
    a.plot([5,8],[1.2,1.2],color='black',lw=1);a.plot([5,5],[1,1.4],color='black');a.plot([8,8],[1,1.4],color='black')
    a.text(6.5,.55,'Lateral lever arm y > 0',ha='center',fontsize=11)
    a.add_patch(Arc((5,4.7),3,3,theta1=20,theta2=85,color='black',lw=1.5))
    arrow(a,(6.43,5.32),(6.48,5.12));a.text(6.7,6.1,'Nose-right\nΔMz > 0',fontsize=11)
    a.text(1.6,2.3,'TOP VIEW\n+z into page',fontsize=11)
    fig.suptitle('No vertical fin does not mean no yaw-control moment',fontsize=19,y=.97)
    fig.text(.5,.14,r'$\Delta M_z=x\Delta F_y-y\Delta F_x \quad\Rightarrow\quad \Delta M_z=y\Delta D>0$',ha='center',fontsize=19)
    fig.text(.5,.055,'Original teaching schematics: not aircraft dimensions, surface counts, panel locations or flight-control laws.',ha='center',fontsize=12)
    for ext in ['png','svg']:
        fig.savefig(ROOT/f'docs/assets/lecture01/Controls_Finless_Yaw.{ext}',dpi=170,facecolor='white')
    plt.close(fig)

def photo(name,alt,caption):
    return f'<figure style="margin:16px 0"><a href="{RAW}{name}"><img src="{RAW}{name}" alt="{alt}" width="900" style="max-width:100%;height:auto"></a><figcaption>{caption}</figcaption></figure>'

def lesson_html():
    return f'''<section style="font-family:Times New Roman,Times,serif;color:#000;line-height:1.4">
<h3>7A-12. X-47B and B-2: how do aircraft without a vertical tail control yaw?</h3>
<p><b>Learning target:</b> identify the physical effector, explain the change in force, obtain the yaw-moment sign, and trace the reaction into the wing. A vertical rudder is one way to generate yaw, not a requirement for yaw control.</p>

<h4>7A-12a. X-47B: coordinate spoilers and trailing-edge controls</h4>
{photo('Controls_X47B_Finless.jpg','X-47B taking off; no upright vertical tail is visible','X-47B unmanned demonstrator. U.S. Air Force / Rob Densmore, 4 February 2011. <a style="color:#000" href="https://commons.wikimedia.org/wiki/File:X-47B_110204-F-1162D-119.jpg">Photo and public-domain record</a>.')}
<p><b>Look first:</b> trace the swept wings and their rear edges. There is no upright fin. This front/underside photograph is useful for the overall layout; upper-wing spoiler deployment and the individual commands are not resolved.</p>
{photo('Controls_X47B_Moog_Locations.png','Moog aircraft and actuator illustration with original leader lines locating the X-47B inboard elevon, outboard elevon and spoiler','<b>Where are the X-47B surfaces?</b> The actuator supplier\'s aircraft illustration labels the <b>inboard elevon, outboard elevon and spoiler</b>. Original labels/leader lines retained; click to enlarge. Moog, Flight Control Technology, ABIMAQ workshop, May 2012, slide 70 / PDF p. 71. <a style="color:#000" href="'+MOOG+'">Open supplier slide</a>. Source copyright retained; figure excerpt, not a new reconstruction.')}
<p><b>Read the leader lines, not the actuator pictures:</b> the photographs in the boxes show the mechanisms <i>inside</i> the aircraft; each line points toward its surface on the airframe. This is a <b>wing-control detail</b>: the nose lies outside the crop toward the upper right; the full slide is linked above. The inner and outer elevons lie along the trailing edge. The supplier locates its spoiler in the outer-wing region. This is an aircraft-specific location reference, whereas the section-view sketches below explain how the mechanisms move.</p>
<p><b>Terminology:</b> <i>elevon</i> combines elevator-like pitch control with aileron-like roll control. Moog's <a style="color:#000" href="{MOOG_NEWS}">first-flight announcement</a> identifies aileron, elevon and spoiler flight surfaces. Its slide uses “outboard elevon.” Do not infer an additional surface from the two naming conventions, or relabel the X-47B spoiler as a B-2 clamshell.</p>
<p><b>Aircraft-specific evidence:</b> published technical literature describes the X-47 approach as <b>spoilers combined with trailing-edge control surfaces</b>, citing Whittenbury's X-47B design-development paper. This is not simply the B-2's split-rudder arrangement. <a style="color:#000" href="{XREF}">Open research paper, Introduction</a>; design reference: <a style="color:#000" href="https://doi.org/10.2514/6.2011-7041">Whittenbury, AIAA 2011-7041</a>. The public research description establishes the mechanism family, not a complete X-47B command schedule.</p>
<p><b>Explain the physics step by step:</b></p>
<ol>
<li><b>Change aerodynamic loading on one side.</b> Deploying a spoiler can increase drag and reduce lift on that wing. Coordinated trailing-edge motion changes the local loading as well.</li>
<li><b>Use the drag difference for yaw.</b> A net drag increase on the right acts behind the direction of travel at a right-side lever arm. Its yaw contribution turns the nose right; a greater left-side drag increment gives the opposite sign.</li>
<li><b>Manage the coupled motion.</b> The lift change also tends to roll the aircraft and can affect pitch. The other surfaces must be coordinated to obtain the requested combination of yaw, roll and pitch. Do not teach “raise a spoiler and obtain pure yaw.”</li>
</ol>
<p><b>Structural bridge:</b> spoiler pressure and trailing-edge panel pressure enter through two sets of hinge fittings and actuator anchors, then ribs, spars and skins. The yaw command therefore changes distributed wing loads, not just an abstract heading variable.</p>

<h4>7A-12b. B-2 Spirit: split drag rudders on a crewed flying wing</h4>
{photo('Controls_B2_Flying_Wing.jpg','B-2 from above and in front, showing its flying-wing planform and trailing-edge regions','B-2 Spirit: a <b>crewed aircraft, not a UAV</b>. U.S. Air Force / Staff Sgt. Bennie J. Davis III, 30 May 2006. <a style="color:#000" href="https://commons.wikimedia.org/wiki/File:B-2_Spirit_original.jpg">Original photo / public-domain record</a>; image content unchanged.')}
<p><b>Locate:</b> start at each wingtip and follow the outer trailing edge inward. The split drag rudders occupy the outboard trailing-edge regions. Elevons lie farther inboard, and GLAS is on the centerline aft edge. The overall photograph is not enough to distinguish every panel: use the manufacturer's labeled map next, then the real opened-surface photograph.</p>
<p><b>Documented hardware:</b> Northrop Grumman engineers identify upper/lower split drag rudders for yaw, elevons for pitch/roll, and a centerline gust-load-alleviation surface. Their flight-control architecture drawing labels the outboard split rudders. <a style="color:#000" href="{BREF}">Dreim, Jacobson and Britt, “Simulation of Non-Linear Transonic Aeroelastic Behavior on the B-2,” 1999, printed p. 515, Fig. 7 (PDF p. 83)</a>.</p>
{photo('Controls_B2_Figure7_Source.png','Original Northrop Grumman B-2 Figure 7: split drag rudders at the outer trailing edges, inboard middle and outboard elevons, centerline GLAS, flight-control computers and sensors','<b>Source map: B-2 flight-control architecture.</b> Figure 7 from the supplied NASA proceedings, printed p. 515 / PDF p. 83. Original labels retained. <a style="color:#000" href="'+BREF+'">Full source page</a>; <a style="color:#000" href="https://ntrs.nasa.gov/citations/19990052682">paper / authors / public-use record</a>. The scan has limited resolution; the reading guide below spells out the labels.')}
<p><b>Read the B-2 map from the centerline toward either wingtip:</b> <b>GLAS → inboard elevon → middle elevon → outboard elevon → split drag rudder</b>. There are <b>three elevon pairs</b>, not three surfaces total. Each outboard drag-rudder assembly has upper and lower portions. “Outboard elevon” is therefore <i>not</i> another name for “split drag rudder.”</p>
<p><b>Separate moving hardware from electronics:</b> ADS = air-data system, AMSS = attitude/motion sensors, FCC = flight-control computer. These sense or command; they are not surfaces exposed to the flow. GLAS = gust-load-alleviation surface: the central moving panel participates in pitch control and load response.</p>
{photo('Controls_B2_Open_Annotated.png','Real B-2 landing photograph enlarged with arrows pointing to the raised upper and lowered lower halves of an outboard split drag rudder','<b>Real hardware, not a sketch:</b> the two black panels at the outboard trailing edge separate above and below the wing. USAF / SRA Diane S. Robinson, Le Bourget, 11 June 1995, DF-ST-96-00221. <a style="color:#000" href="https://commons.wikimedia.org/wiki/File:B-2_Spirit_at_Le_Bourget_Airport.JPEG">Original photograph / public-domain record</a>. Cropped for clarity; teaching arrows added without altering aircraft geometry. The still image shows opening, not the instantaneous left/right yaw command.')}
<ol>
<li><b>Open the two halves:</b> upper and lower portions separate like a clamshell, increasing local drag.</li>
<li><b>Make drag unequal:</b> more right-side drag produces a nose-right yaw contribution; more left-side drag produces nose-left yaw. “More” can mean unequal openings, not necessarily one fully closed side.</li>
<li><b>Distinguish yaw from braking:</b> equal drag increments on both sides cancel their yaw contributions in an ideal symmetric model while adding braking drag. Actual lift/roll/pitch coupling need not vanish.</li>
</ol>
<p><b>Structural bridge:</b> both halves have pressure loads, hinge reactions and actuator reactions. Follow both load branches into the outer wing and wing box. The flight-control computer coordinates the hardware; it does not itself supply the aerodynamic force.</p>

<h4>Which force changes, and what does the aircraft do?</h4>
<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%;min-width:650px;color:#000;font-family:Times New Roman,Times,serif">
<thead><tr><th style="border:1px solid #000;padding:9px;text-align:left">Physical control / location</th><th style="border:1px solid #000;padding:9px;text-align:left">Motion and aerodynamic change</th><th style="border:1px solid #000;padding:9px;text-align:left">Moment and structural consequence</th></tr></thead>
<tbody>
<tr><td style="border:1px solid #000;padding:9px">B-2 split drag rudder<br>Outboard trailing edge</td><td style="border:1px solid #000;padding:9px">Upper/lower halves separate. Local rearward drag increases; lift may also change.</td><td style="border:1px solid #000;padding:9px">Unequal left/right drag gives yaw; equal increments add braking drag. Each half loads its hinges and actuator anchors.</td></tr>
<tr><td style="border:1px solid #000;padding:9px">Elevons<br>B-2: inner, middle and outer pairs<br>X-47B: supplier-labeled inner/outer panels</td><td style="border:1px solid #000;padding:9px">Panels change the section loading. In the simple attached-flow picture, trailing edge down tends to increase local upward force; up tends to decrease it.</td><td style="border:1px solid #000;padding:9px">Symmetric changes can command pitch; differential changes can command roll. Exact mixing varies. Hinge reactions enter the rear-wing structure and alter wing bending/torsion.</td></tr>
<tr><td style="border:1px solid #000;padding:9px">X-47B spoiler<br>Outer-wing region in supplier illustration</td><td style="border:1px solid #000;padding:9px">Deploying a spoiler disrupts local flow: drag can increase and lift decrease.</td><td style="border:1px solid #000;padding:9px">Drag asymmetry contributes yaw; vertical-force asymmetry also contributes roll. Coordinated trailing-edge controls manage coupling.</td></tr>
<tr><td style="border:1px solid #000;padding:9px">B-2 GLAS<br>Centerline trailing edge</td><td style="border:1px solid #000;padding:9px">Central-panel motion changes aft aerodynamic loading.</td><td style="border:1px solid #000;padding:9px">Pitch/load response rather than a wingtip drag-rudder role. In an ideal symmetric centerline model it has no lateral lever arm for direct roll.</td></tr>
</tbody></table></div>
<p><b>Two elevon examples — qualitative, not an aircraft command schedule:</b> if aft upward force increases equally on both sides, its aft lever arm gives a nose-down pitch contribution. If the right wing gains upward force while the left loses it, the right wing rises and the left drops: left bank (negative roll about the forward body axis). Changing only one panel usually changes more than one moment.</p>
<p><b>Connect pressure to structure:</b> the surface force is the resultant of distributed pressure and shear, not a force produced by the actuator alone. Pressure → movable panel → hinge fittings and actuator anchors → supporting ribs/rear spar/skins → wing box → root. Offsets from the wing's structural reference line also introduce torsion. Larger deflection does not mean a known force unless speed, angle of attack and aerodynamic response are specified.</p>

<h4>7A-12c. One moment balance explains both approaches</h4>
{photo('Controls_Finless_Yaw.png','Three teaching schematics: spoiler and trailing-edge panel, split drag-rudder halves, and top-view right drag with nose-right yaw','Read A and B as local mechanism sketches, then C as the whole-aircraft moment balance. These are teaching schematics, not measured reconstructions of either aircraft.')}
<p>Reuse the body axes from <b>7A-3b</b>: <i>x</i> forward, <i>y</i> right, <i>z</i> down, moments about the CG. For an isolated rearward force increment, Δ<i>F</i><sub>x</sub> = −Δ<i>D</i>, Δ<i>F</i><sub>y</sub> = 0. Thus:</p>
<p style="text-align:center;font-size:1.2em">Δ<i>M</i><sub>z</sub> = <i>x</i>Δ<i>F</i><sub>y</sub> − <i>y</i>Δ<i>F</i><sub>x</sub> = <i>y</i>Δ<i>D</i>.</p>
<p><b>Check pitch and roll with the same force:</b> for an isolated upward increment Δ<i>L</i>, Δ<i>F</i><sub>z</sub> = −Δ<i>L</i>. Its vertical-force contributions are Δ<i>M</i><sub>x</sub> = −<i>y</i>Δ<i>L</i> and Δ<i>M</i><sub>y</sub> = <i>x</i>Δ<i>L</i>. An aft surface has <i>x</i> &lt; 0, so added upward force gives a nose-down contribution. These are force-arm contributions; the complete surface loading can also include aerodynamic couples and other force components.</p>
<p><b>Two-minute calculation — invented classroom loads, not aircraft measurements:</b> place the right/left drag increments at <i>y</i> = ±4 m. Let Δ<i>D</i><sub>R</sub> = 30 N and Δ<i>D</i><sub>L</sub> = 10 N. Then Δ<i>M</i><sub>z</sub> = 4(30 − 10) = <b>+80 N·m</b>: nose-right tendency. Total added drag is 40 N. With 20 N on each side, the same 40 N braking increment gives <b>zero net yaw increment</b> in this simplified model.</p>
<p><b>Link back to Lilienthal (7A-3b):</b> an aft vertical rudder can generate yaw through <i>xF</i><sub>y</sub>; an outboard drag device can generate yaw through −<i>yF</i><sub>x</sub>. A tip vane can alter several force components. Name the force and lever arm before naming the control role.</p>
<p><b>Instructor check:</b> ask students to sketch the two drag arrows, mark the CG, predict the yaw sign, and draw both hinge and actuator load paths. Then ask: “What extra aerodynamic information would you need to predict roll?” Answer: the accompanying vertical-force changes and their lever arms, not only the drag difference. Yaw moment alone also does not specify the aircraft's complete turn trajectory.</p>
</section>'''

def enrich_finless_yaw(notebook):
    target=next(c for c in notebook['cells'] if c.get('id')=='l01-controls-x47')
    target['source']=(lesson_html()+'\n').splitlines(keepends=True)
    notebook.setdefault('metadata',{}).setdefault('mie446',{})['finless_yaw_revision']='2026-10-07'
    return notebook

def main():
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--lesson-only', action='store_true', help='Preserve existing mechanism schematic assets')
    args = parser.parse_args()
    if not args.lesson_only:
        build_diagram()
    nb=json.loads(NB.read_text(encoding='utf-8'))
    enrich_finless_yaw(nb)
    NB.write_text(json.dumps(nb,ensure_ascii=False,indent=1)+'\n',encoding='utf-8')
    preview='<!doctype html><html lang="en"><meta charset="utf-8"><title>Lecture 1: finless yaw control</title><style>body{font:19px/1.4 "Times New Roman",serif;color:#000;max-width:1080px;margin:24px auto;padding:18px}h3{font-size:30px}h4{font-size:25px;margin-top:36px}a{color:#000}figure img{display:block}figcaption{font-size:16px;margin-top:10px}li{margin:12px 0}p{margin:16px 0}</style>'+lesson_html()+'</html>'
    (ROOT/'docs/lecture01-finless-yaw.html').write_text(preview.replace(RAW,'assets/lecture01/'),encoding='utf-8')
    print('Updated 7A-12 only; X-47B, B-2, mechanism schematic and moment exercise.')

if __name__=='__main__': main()
