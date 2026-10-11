#!/bin/bash
# Final pass: validation, overlays, photo matches, glTF export, renders (sequential: 2 CPUs)
set -x
cd "$(dirname "$0")"
# page scans p-000.jpg ... p-167.jpg of the manual: set D520_SCANS (default ../scans)
SCANS=${D520_SCANS:-../scans}
mkdir -p ../build
B=../build/d520.blend
python3 d520_validate.py $B --out ../validation > ../build/final_validate.log 2>&1
python3 d520_overlay.py $B $SCANS/p-061.jpg ../renders > ../build/final_overlay.log 2>&1
python3 d520_photomatch.py $B ../renders/photomatch --samples 40 > ../build/final_photo.log 2>&1
python3 d520_export.py $B ../export/d520_web.glb --max-tex 2048 --jpeg 80 > ../build/final_export_web.log 2>&1
python3 d520_export.py $B ../export/d520.glb --max-tex 4096 --jpeg 92 > ../build/final_export_full.log 2>&1
R="python3 d520_render.py $B ../renders --samples 64 --res 1600x1200"
$R --view hero --tag hero > ../build/r1.log 2>&1
$R --view hero_right --tag hero_right > ../build/r2.log 2>&1
$R --view rear34 --tag rear34 > ../build/r3.log 2>&1
$R --view top34 --tag top34 > ../build/r4.log 2>&1
$R --view hero --tag controls --controls "rudder=1,elevator=1,aileron=1,flaps=1" > ../build/r5.log 2>&1
$R --view under --tag gear_up --controls "gear=1" > ../build/r6.log 2>&1
$R --view cockpit --tag cockpit --controls "canopy=1" > ../build/r7.log 2>&1
$R --view hero_right --tag at_rest --controls "attitude=1,canopy=1" > ../build/r8.log 2>&1
echo ALLDONE > ../build/final_done
