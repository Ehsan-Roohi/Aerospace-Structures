"""Replace Lecture 1's wide effector table with source-linked photo reading cards.

Only the existing 7A-11 markdown cell and a revision marker are changed. Its
section title, elevon equations, activity and all other notebook cells survive.
"""
from pathlib import Path
from html import escape
import json

ROOT = Path(__file__).resolve().parents[1]
NB = ROOT / 'notebooks/MIE446_Lecture_01_Trust_Forces_Airfoils.ipynb'
RAW = 'https://raw.githubusercontent.com/Ehsan-Roohi/Aerospace-Structures/main/docs/assets/lecture01/'
START = '<!-- BEGIN EFFECTOR PHOTO CARDS -->'
END = '<!-- END EFFECTOR PHOTO CARDS -->'

CARDS = [
 dict(key='elevon', title='1. Elevon — one panel, two control roles',
      photo='Controls_X48B_Winglets.jpg',
      alt='X-48B in flight, with its swept wing trailing edge and upright winglets visible',
      caption='X-48B research UAV. The upright winglets are not elevons; look along the wing trailing edge below and inboard of them.',
      source='https://www.nasa.gov/image-article/x-48b-first-flight/', credit='NASA / Carla Thomas',
      evidence='https://www.nasa.gov/wp-content/uploads/2021/09/171791main_FS-090-DFRC.pdf',
      evidence_name='NASA X-48 fact sheet',
      look='Find the rear edge of each swept wing. An elevon is a hinged portion of that edge, not the whole wing and not the vertical winglet. This oblique photograph locates the region; it does not resolve every hinge or commanded angle.',
      motion='The left and right panels rotate about their hinges. Same-sense trailing-edge motion supplies a pitch-control channel; opposite-sense motion supplies a roll-control channel. The two requests can be added.',
      force='Deflection changes local aerodynamic loading. For the generic aft-of-CG arrangement below, trailing edges up reduce upward loading and give a nose-up increment; unequal left/right increments give roll.',
      structure='Panel pressure → hinge fittings AND actuator anchors → rear spar, ribs and wing skin.',
      check='If both panels move up, why should you not call that command “right roll”?'),
 dict(key='ruddervator', title='2. Ruddervator — resolve the force on an inclined tail',
      photo='Controls_MQ9_Vtail.jpg',
      alt='Front oblique photograph of an MQ-9 showing two inclined aft surfaces and a separate ventral surface',
      caption='MQ-9 Reaper. The two aft surfaces form a V when viewed from the front or rear. A separate ventral surface is also present.',
      source='https://commons.wikimedia.org/wiki/File:MQ-9_Reaper_in_flight_(2007).jpg', credit='U.S. Air Force / Staff Sgt. Brian Ferguson; public domain',
      evidence='https://www.acc.af.mil/Portals/92/Docs/ACC%20SAFETY/COMBAT%20EDGE/TCE_Winter_2026_web.pdf',
      evidence_name='USAF ruddervator reference, p. 16',
      look='Look at the aft fuselage near the pusher propeller for the two inclined tail surfaces. The moving trailing-edge portion is the ruddervator; the fixed supporting tail surface is not itself the control panel.',
      motion='A mixer combines pitch and yaw requests into two local panel deflections. Sketch each panel rotating relative to its own inclined tail, rather than describing both simply as “up” in the photograph.',
      force='Resolve each local normal force into vertical and lateral components. Mirror-symmetric forces can add vertically and cancel laterally; a differential pattern can do the reverse. Exact signs and gains depend on geometry.',
      structure='Hinge and actuator reactions → inclined tail spar/root fittings → rear fuselage. The fittings receive combined vertical and lateral loading.',
      check='Why does one ruddervator reaching its travel limit affect both requested channels?'),
 dict(key='spoileron', title='3. Spoileron — a spoiler used asymmetrically for roll',
      photo='MIE446_L01_Example_B737_Descent.jpg',
      alt='Passenger-window view of raised spoiler panels on the upper surface of a Boeing 737 wing',
      caption='737 spoiler hardware during descent. The raised panels are on the upper wing surface, ahead of the trailing edge.',
      source='https://commons.wikimedia.org/wiki/File:Qantas_Boeing_737-800_spoiler_deployed_for_descent.jpg',
      credit='Jg4817; CC BY-SA 3.0; existing course thumbnail',
      evidence='https://www.faa.gov/sites/faa.gov/files/08_phak_ch6.pdf', evidence_name='FAA Flight Controls, spoilers',
      look='Identify the rectangular panel lifted above the wing and the dark gap beneath it. Do not confuse it with the trailing-edge flap or the winglet at the tip.',
      motion='The panel rises into the airflow. “Spoiler” identifies the hardware; “spoileron” describes its asymmetric roll-control use. Raising both sides can instead provide speed-brake or lift-dump functions.',
      force='Deploying a right-wing spoiler generally reduces right-wing lift and increases drag: right-wing-down roll and a nose-right yaw contribution under our body axes. The full response depends on the aircraft and other controls.',
      structure='Pressure on the raised panel → hinge brackets AND actuator support → local ribs/spars/skin. Do not put all of the load into the actuator alone.',
      check='This photo shows only one wing. Can it establish an asymmetric roll command? No: the opposite wing and command history are not shown.'),
 dict(key='split-drag', title='4. Split drag rudder — opening a panel into two halves',
      photo='Controls_X48C_Split_Open.jpg',
      alt='X-48C on the lakebed with upper and lower split aileron halves visibly opened near the wing tips',
      caption='Actual opened split surfaces on X-48C after landing. Look especially at the separated red upper and lower surfaces at image right.',
      source='https://www.nasa.gov/image-article/x-48c-deploys-split-ailerons/', credit='NASA / Carla Thomas; ED12-0255-59',
      evidence='https://www.nasa.gov/aeronautics/x-36-tailless-fighter/', evidence_name='NASA X-36 directional-control example',
      look='Unlike an ordinary single flap, the upper and lower portions separate like a clamshell. The gap and two distinct edges are the identifying visual cues.',
      motion='Opening the halves exposes more area to the flow. NASA identifies the photographed X-48C deployment as post-landing drag/speed reduction, not as an observed yaw command.',
      force='The generic yaw-control use is differential drag: more drag on one outboard side creates a yaw moment toward that side. Opening both sides similarly can provide braking. Do not assume that lift or roll coupling is exactly zero.',
      structure='Each half has its own pressure load and hinge reaction; both hinge and actuation branches enter the local wing structure.',
      check='How would a symmetric braking deployment differ from the asymmetric deployment needed for a drag-based yaw command?'),
 dict(key='differential-thrust', title='5. Differential thrust — change magnitude, not nozzle direction',
      photo='Controls_Centurion_Motors.jpg',
      alt='Centurion flying wing with many propellers spread across the span and four underwing pods',
      caption='Centurion research UAV. Follow the row of propellers along the span; the motor forces act at different lateral distances from the CG.',
      source='https://www.nasa.gov/reference/centurion/', credit='NASA; EC98-44803-115',
      evidence='https://www.nasa.gov/reference/centurion/', evidence_name='NASA Centurion control description',
      look='Locate an outboard motor on each half-wing. The important geometry is the lateral separation of the thrust lines, not simply the number of motors.',
      motion='The motors remain in place while their commanded power changes. NASA documents turns and yaw control on Centurion through differential power on outboard motors. A still photo does not reveal the power settings.',
      force='For forward thrust, the body-axis yaw contribution is <i>M</i><sub>z</sub> = −<i>yF</i><sub>x</sub>. More forward thrust on the right alone tends to yaw the nose left. Compare that sign with additional right-wing drag in the preceding card.',
      structure='Propeller thrust and motor torque → motor mounts → supporting wing structure. A motor is a structural load input, not merely an electrical component.',
      check='If all thrust lines passed through the CG, would unequal thrust necessarily produce the same yaw moment?'),
 dict(key='vectoring', title='6. Thrust vectoring — turn the jet, obtain a reaction',
      photo='Controls_HARV_Ground_Test.jpg',
      alt='Rear quarter view of F-18 HARV during a ground test showing metal vectoring vanes beside a bright exhaust plume',
      caption='F-18 HARV ground test, 1991. The metal vanes surrounding the exhaust are visible; the luminous plume is not an aerodynamic control surface.',
      source='https://www.nasa.gov/reference/f-18-harv/', credit='NASA; EC91-0075-33',
      evidence='https://www.nasa.gov/reference/f-18-harv/', evidence_name='NASA HARV hardware description',
      look='Find the hot exhaust exit and the paddle-like hardware around it. This is a real research-aircraft test, not a drawing of a generic tilting nozzle.',
      motion='HARV used external vanes that could enter the exhaust stream. Other vectoring systems swivel a nozzle or tilt a propulsion unit; do not attribute those different mechanisms to this photograph.',
      force='Changing exhaust momentum direction produces a reaction on the aircraft. The control moment depends on that force and its lever arm from the CG. Distinguish exhaust direction from the opposite reaction-force direction.',
      structure='Hot-gas forces → vanes and actuator attachments → supporting aft-airframe structure; propulsion reactions also reach the engine mounts. Heat and vibration accompany these mechanical loads.',
      check='What changed here that did not change in the differential-thrust example?'),
 dict(key='circulation', title='7. Circulation control — change the flow through slots',
      photo='Controls_AMELIA_Blowing.jpg',
      alt='AMELIA physical wind-tunnel model with smoke passing over the wing from a visualization wand',
      caption='AMELIA circulation-control wind-tunnel model. The white smoke is a flow tracer from the wand, not a photograph of the pressurized slot jet itself.',
      source='https://www.nasa.gov/aeronautics/amelias-innovations-inspire-unusual-dedication/', credit='NASA / Dominic Hart; ACD12-0003-019',
      evidence='https://www.nasa.gov/aeronautics/amelias-innovations-inspire-unusual-dedication/', evidence_name='NASA AMELIA blowing description',
      look='Follow the smoke over the wing and locate the leading/trailing-edge regions. NASA describes narrow blowing slots along these edges; their small openings are not individually resolved in this whole-model view.',
      motion='The controlled quantity is supplied airflow. Jets through slots alter the surrounding flow and wing loading. The mechanism does not require a new external panel deflection for each change in blowing.',
      force='A left/right difference in aerodynamic force can generate a control moment. This AMELIA photograph demonstrates a research test setup, not a measured UAV roll command; see 7A-13 for the MAGMA flight-control example.',
      structure='Aerodynamic force enters the wing; supply pressure and jet reactions load slot lips, internal ducts and their supports. A fixed exterior does not mean zero actuator-system or structural loads.',
      check='Why should you not label the visible smoke wand as the aircraft’s circulation-control actuator?'),
 dict(key='allocation', title='8. Fly-by-wire and control allocation — the command layer',
      photo='Controls_F8_Flight_Computer.jpg',
      alt='Open equipment bays on the NASA F-8 digital fly-by-wire test aircraft showing electronics and wiring',
      caption='F-8 digital fly-by-wire electronics, 1971. Open bays reveal physical computing equipment and wiring, rather than another moving aerodynamic surface.',
      source='https://www.nasa.gov/image-detail/amf-e-24741/', credit='NASA; E-24741',
      evidence='https://www.nasa.gov/gallery/f-8-digital-fly-by-wire/', evidence_name='NASA F-8 digital fly-by-wire archive',
      look='Locate the open equipment bays. This historical installation makes the command-processing hardware visible; it is not a diagram of a modern UAV allocator.',
      motion='Fly-by-wire transmits and processes electrical commands. Control allocation distributes requested moments among available physical effectors. Feedback can update commands using measured aircraft motion; these related functions are not identical.',
      force='A computer does not create an aircraft control force directly. A commanded servo, motor or airflow valve must change a physical force. Surface limits can prevent the requested moment from being achieved.',
      structure='Equipment trays carry avionics mass/vibration loads. The large control reactions still enter through the commanded surfaces, motors, hinges and mounts—not through the software.',
      check='Trace one complete chain: roll request → mixer → two actuators → elevon motion → aerodynamic forces → wing reactions.'),
]

def cards_html():
    parts = [START,
        '<p style="font-family:Times New Roman,Times,serif;color:#000"><b>Read one mechanism at a time.</b> Each photograph is paired with a visual reading guide and a structural explanation. Click a photo to enlarge it. These examples include research UAVs, crewed test aircraft and a wind-tunnel model; their labels identify which is which. A photograph establishes visible hardware, not an entire flight-control law.</p>']
    for c in CARDS:
        parts.append(f'<h4 id="effector-{c["key"]}" style="font-family:Times New Roman,Times,serif;color:#000">{c["title"]}</h4>')
        parts.append(f'''<table class="effector-card" width="100%" style="table-layout:fixed;font-family:Times New Roman,Times,serif;color:#000;border-collapse:collapse;margin-bottom:24px"><tr>
<td width="46%" valign="top" style="padding:10px;vertical-align:top;border:1px solid #aaa">
<a href="{RAW}{c['photo']}"><img src="{RAW}{c['photo']}" alt="{escape(c['alt'])}" width="460" style="width:100%;max-width:560px;height:auto"></a>
<p><b>Photo reading:</b> {c['caption']}</p>
<p style="font-size:0.9em">{c['credit']}. <a style="color:#000" href="{c['source']}">Photo source / credit</a>. <a style="color:#000" href="{c['evidence']}">{c['evidence_name']}</a>.</p>
</td><td width="54%" valign="top" style="padding:10px;vertical-align:top;border:1px solid #aaa">
<p><b>1. Locate the hardware.</b> {c['look']}</p>
<p><b>2. Describe the change.</b> {c['motion']}</p>
<p><b>3. Explain the force and moment.</b> {c['force']}</p>
<p><b>4. Follow the structural load.</b> {c['structure']}</p>
<p><b>Quick check:</b> {c['check']}</p>
</td></tr></table>''')
    parts.append('<p style="font-family:Times New Roman,Times,serif;color:#000"><b>Three distinctions to keep:</b> spoiler versus asymmetric spoileron use; differential thrust magnitude versus vectored thrust direction; and a physical effector versus the software that commands it. Use the body-axis cross product in 7A-3b whenever a moment sign is uncertain.</p>')
    parts.append(END)
    return '\n\n'.join(parts)

def enrich_notebook(notebook):
    target = next(c for c in notebook['cells'] if c.get('id') == 'l01-controls-effectors')
    text = ''.join(target['source'])
    if START in text:
        before, rest = text.split(START, 1)
        _, after = rest.split(END, 1)
    else:
        before, rest = text.split('| Mechanism | Physical change |', 1)
        _, after = rest.split('**A generic elevon mixer:**', 1)
        after = '\n\n**A generic elevon mixer:**' + after
    text = before + cards_html() + after
    text = text.replace('width="1250"', 'width="1000" style="max-width:100%;height:auto"')
    target['source'] = text.splitlines(keepends=True)
    notebook.setdefault('metadata', {}).setdefault('mie446', {})['effector_photo_cards_revision'] = '2026-10-01'
    return notebook

if __name__ == '__main__':
    nb = json.loads(NB.read_text(encoding='utf-8'))
    enrich_notebook(nb)
    NB.write_text(json.dumps(nb, ensure_ascii=False, indent=1)+'\n', encoding='utf-8')
    # Preview uses the same cards, with local images for a reproducible visual check.
    preview = '<!doctype html><html lang="en"><meta charset="utf-8"><title>Lecture 1 — control mechanisms</title><style>body{font:18px/1.35 "Times New Roman",serif;color:#000;max-width:1150px;margin:24px auto;padding:18px}h4{font-size:23px;margin:30px 0 12px}p{margin:0 0 12px}img{display:block}a{color:#000}</style><h1>7A-11. Real hardware: eight control mechanisms</h1>' + cards_html() + '</html>'
    (ROOT/'docs/lecture01-control-mechanisms.html').write_text(preview.replace(RAW, 'assets/lecture01/'), encoding='utf-8')
    print('Updated only 7A-11: eight photo cards; existing mixer and other cells preserved.')
