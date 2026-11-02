# How AWACS Works: Radar, Airframe Integration and Structural Loads on the Boeing E-3 Sentry

*MIE 446 · Aerospace Structures · University of Massachusetts Amherst*

## Why put a radar on an aircraft?

A ground-based radar can lose sight of a low-flying aircraft behind terrain or the curvature of the Earth. Raising the antenna moves the geometric horizon farther away. For a spherical Earth of radius 6,371 km, an antenna 9 km above the surface has a geometric horizon of approximately 339 km. This is a line-of-sight estimate to the surface, **not a guaranteed detection range**. Target altitude, reflected signal strength, terrain clutter and atmospheric refraction all affect what the radar can detect.

## From a reflected pulse to an aircraft track

The delay between transmission and reception gives slant range: multiply the elapsed time by the speed of light and divide by two for the outward and return journeys. The direction of the radar beam supplies angular information. The Doppler shift helps distinguish radial motion from background returns, although an aircraft moving across the line of sight can have little radial velocity. A single echo does not establish a flight path. Measurements from successive scans must be associated with the same target to estimate its position and motion. Controllers use that picture to coordinate with other aircraft—the *control* function in **Airborne Warning and Control System**.

## How the rotodome changes the airframe

The E-3 uses a modified Boeing 707-320 airframe. The U.S. Air Force describes a rotating dome 9.1 m in diameter and 1.8 m thick, supported by two struts about 3.3 m above the fuselage. The cover has two jobs: protect the radar from the flight environment and allow its radio waves to pass through. Inside the aircraft, electrical supply, equipment cooling, wiring, operator stations and maintenance access compete for space and weight allowance.

**Follow the load into the aircraft.** Air pressure acts over the dome surface. Its resultant passes through the supporting structure and struts to the fuselage attachments; the surrounding frames and skin distribute it into the airframe. The weight and acceleration of the assembly add inertial loads. As a classroom example, a hypothetical horizontal force of 10 kN acting 3.3 m above the attachment plane produces a 33 kN·m overturning moment. That is not an E-3 design load, and dividing the force equally between the struts does not by itself balance the moment. A useful free-body diagram must show both force and moment equilibrium. Determining local stresses or fatigue life would additionally require connection geometry, stiffness and a load history that the photographs do not provide.

## Historical sequence and photographic guide

The RC-121 illustrates the generation before the E-3. Engineering test and evaluation of the E-3 began in 1975; the first U.S. Air Force aircraft reached Tinker in March 1977, and NATO received its first E-3 in January 1982. The photographs below move from that history to the antenna, its structural supports and the crew who use the information.

### Figure 1. RC-121 Warning Star, 1955

<img src="https://upload.wikimedia.org/wikipedia/commons/6/69/Lockheed_RC-121C_1955.jpg" width="720" alt="RC-121 Warning Star, 1955">

The housings above and below the fuselage illustrate an earlier answer to the same surveillance problem. Airborne early warning predates the rotating disc associated with the E-3. [Original photograph, credit and license](https://commons.wikimedia.org/wiki/File:Lockheed_RC-121C_1955.jpg)

### Figure 2. The first E-3 at Tinker Air Force Base, 1977

<img src="https://upload.wikimedia.org/wikipedia/commons/5/57/First_E-3_Sentry_at_Tinker_AFB.jpg" width="720" alt="The first E-3 at Tinker Air Force Base, 1977">

The four engines and narrow fuselage show the aircraft’s Boeing 707 ancestry. The new mission equipment had to work within the weight, balance and structural limits of an existing airframe. [Original photograph, credit and license](https://commons.wikimedia.org/wiki/File:First_E-3_Sentry_at_Tinker_AFB.jpg)

### Figure 3. The AN/APY-1 antenna on display

<img src="https://upload.wikimedia.org/wikipedia/commons/4/4f/AWACS_antenna%2C_Airborne_Warning_and_Control_System_-_National_Electronics_Museum_-_DSC00416.JPG" width="720" alt="The AN/APY-1 antenna on display">

Compare the long antenna face with the circular outline in Figure 4. The antenna transmits and receives radio waves; the outer shell protects the equipment and presents a streamlined surface to the airflow. [Original photograph, credit and license](https://commons.wikimedia.org/wiki/File:AWACS_antenna%2C_Airborne_Warning_and_Control_System_-_National_Electronics_Museum_-_DSC00416.JPG)

### Figure 4. The E-3 rotodome

<img src="https://upload.wikimedia.org/wikipedia/commons/c/c5/ILA_2008_PD_185.JPG" width="720" alt="The E-3 rotodome">

The disc gives the antenna room to sweep in azimuth. Aerodynamic pressure acts on the outer surface, so the enclosure is part of the structural problem even though it is not itself the radar antenna. [Original photograph, credit and license](https://commons.wikimedia.org/wiki/File:ILA_2008_PD_185.JPG)

### Figure 5. The dome and its supports

<img src="https://upload.wikimedia.org/wikipedia/commons/f/fc/Dock_One_%288557615574%29.jpg" width="720" alt="The dome and its supports">

Notice the gap between the disc and the fuselage. A horizontal force acting above the attachment plane produces an overturning moment as well as a shear force. [Original photograph, credit and license](https://commons.wikimedia.org/wiki/File:Dock_One_%288557615574%29.jpg)

### Figure 6. Controllers during Operation Provide Comfort

<img src="https://upload.wikimedia.org/wikipedia/commons/6/61/ProvideComfortAWACScrew.jpg" width="720" alt="Controllers during Operation Provide Comfort">

Detecting a return and directing an aircraft are different tasks. Mission personnel interpret tracks in context and communicate information to other crews. [Original photograph, credit and license](https://commons.wikimedia.org/wiki/File:ProvideComfortAWACScrew.jpg)

### Figure 7. NATO mission consoles, 2008

<img src="https://upload.wikimedia.org/wikipedia/commons/e/e6/E-3_Sentry_system_operator_of_NATO.jpg" width="720" alt="NATO mission consoles, 2008">

The consoles show the human end of the measurement chain: individual echoes have to be associated across scans before they can be displayed as a useful track. [Original photograph, credit and license](https://commons.wikimedia.org/wiki/File:E-3_Sentry_system_operator_of_NATO.jpg)

### Figure 8. RAF E-3D over North Yorkshire

<img src="https://upload.wikimedia.org/wikipedia/commons/c/c2/Royal_Air_Force_%28RAF%29_E-3D_Sentry_AEW1_%28airborne_early_warning%29_aircraft%2C_registration_ZH106%2C_taking_part_in_Exercise_Taurus_Mountain_3%2C_in_the_skies_over_North_Yorkshire_in_March_2012_-_MOD_45153803_%28cropped%29.jpg" width="720" alt="RAF E-3D over North Yorkshire">

The side view places the dome upstream of the tail. An integration test must therefore consider how the disturbed airflow reaches the tail, not just the drag of the dome in isolation. [Original photograph, credit and license](https://commons.wikimedia.org/wiki/File:Royal_Air_Force_%28RAF%29_E-3D_Sentry_AEW1_%28airborne_early_warning%29_aircraft%2C_registration_ZH106%2C_taking_part_in_Exercise_Taurus_Mountain_3%2C_in_the_skies_over_North_Yorkshire_in_March_2012_-_MOD_45153803_%28cropped%29.jpg)

### Figure 9. Luxembourg-registered NATO E-3

<img src="https://upload.wikimedia.org/wikipedia/commons/9/9a/Boeing_E-3_Sentry_LX-N_90454-3.JPG" width="720" alt="Luxembourg-registered NATO E-3">

The fairing beneath the nose is separate from the main radar dome. Similar-looking external covers need not house the same type of equipment. [Original photograph, credit and license](https://commons.wikimedia.org/wiki/File:Boeing_E-3_Sentry_LX-N_90454-3.JPG)

### Figure 10. French E-3F Sentry

<img src="https://upload.wikimedia.org/wikipedia/commons/2/26/Boeing_E-3F_Sentry_%288%29.jpg" width="720" alt="French E-3F Sentry">

Use the profile to sketch the lines of action of dome weight and drag. Their lever arms depend on the attachment point about which moments are taken. [Original photograph, credit and license](https://commons.wikimedia.org/wiki/File:Boeing_E-3F_Sentry_%288%29.jpg)

### Figure 11. NATO E-3A at Paine Field

<img src="https://upload.wikimedia.org/wikipedia/commons/6/6c/NATO_E3A_AWACS_Paine_Field_WA_Jul15_DSC8405.jpg" width="720" alt="NATO E-3A at Paine Field">

The oblique view separates the two supports visually. It does not reveal the internal fittings, frame reinforcement or actual load split between them. [Original photograph, credit and license](https://commons.wikimedia.org/wiki/File:NATO_E3A_AWACS_Paine_Field_WA_Jul15_DSC8405.jpg)

### Figure 12. Royal Saudi Air Force E-3A

<img src="https://upload.wikimedia.org/wikipedia/commons/1/1f/Royal_Saudi_Air_Force_E-3A_Sentry.jpg" width="720" alt="Royal Saudi Air Force E-3A">

The aircraft shares the characteristic dorsal disc with the other E-3 variants. A common external arrangement is not evidence of identical internal mission equipment. [Original photograph, credit and license](https://commons.wikimedia.org/wiki/File:Royal_Saudi_Air_Force_E-3A_Sentry.jpg)

## Sources

- [U.S. Air Force: E-3 Sentry mission and aircraft specifications](https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104504/e-3-sentry-awacs/)
- [Air Combat Command: E-3 Sentry fact sheet and service history (February 2023)](https://www.acc.af.mil/Portals/92/Docs/Fact%20Sheets%20-%202020%20Update/Facts%20Sheets%20-%202023%20Update/E3%20Sentry_FEB%202023.pdf)
- [Fars News: introductory article that prompted this case study (in Persian)](https://farsnews.ir/Navidrezamousavi/1793574775574791879/%D8%A2%D9%88%D8%A7%DA%A9%D8%B3-%DA%86%DB%8C%D8%B3%D8%AA-%D9%88-%DA%86%DA%AF%D9%88%D9%86%D9%87-%D8%B3%D8%A7%D8%AE%D8%AA%D9%87-%D9%85%DB%8C-%D8%B4%D9%88%D8%AF)
