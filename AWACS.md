# How AWACS Works: Radar, Airframe Integration and Structural Loads on the Boeing E-3 Sentry

*MIE 446 · Aerospace Structures · University of Massachusetts Amherst*

## Why put a radar on an aircraft?

A ground-based radar can lose sight of a low-flying aircraft behind terrain or the curvature of the Earth. Raising the antenna moves the geometric horizon farther away. For a spherical Earth of radius 6,371 km, an antenna 9 km above the surface has a geometric horizon of approximately 339 km. This is a line-of-sight estimate to the surface, **not a guaranteed detection range**. Target altitude, reflected signal strength, terrain clutter and atmospheric refraction all affect what the radar can detect.

## From a reflected pulse to an aircraft track

The delay between transmission and reception gives slant range: multiply the elapsed time by the speed of light and divide by two for the outward and return journeys. The direction of the radar beam supplies angular information. The Doppler shift helps distinguish radial motion from background returns, although an aircraft moving across the line of sight can have little radial velocity. A single echo does not establish a flight path. Measurements from successive scans must be associated with the same target to estimate its position and motion. Controllers use that picture to coordinate with other aircraft—the *control* function in **Airborne Warning and Control System**.

## How the rotodome changes the airframe

The E-3 uses a modified Boeing 707-320 airframe. The U.S. Air Force describes a rotating dome 9.1 m in diameter and 1.8 m thick, supported by two struts about 3.3 m above the fuselage. The cover has two jobs: protect the radar from the flight environment and allow its radio waves to pass through. Inside the aircraft, electrical supply, equipment cooling, wiring, operator stations and maintenance access compete for space and weight allowance.

**Follow the load into the aircraft.** Air pressure acts over the dome surface. Its resultant passes through the supporting structure and struts to the fuselage attachments; the surrounding frames and skin distribute it into the airframe. The weight and acceleration of the assembly add inertial loads. As a classroom example, a hypothetical horizontal force of 10 kN acting 3.3 m above the attachment plane produces a 33 kN·m overturning moment. That is not an E-3 design load, and dividing the force equally between the struts does not by itself balance the moment. A useful free-body diagram must show both force and moment equilibrium. Determining local stresses or fatigue life would additionally require connection geometry, stiffness and a load history that the photographs do not provide.

## What actually sets the detection limit?

Consider two aircraft over the same stretch of sea. One is high and easy to see geometrically; the other is just above the waves. Raising the receiver extends the horizon for both, but the low aircraft may share a radar resolution cell with strong sea returns. Three different questions must be answered: **Is there a propagation path? Is the echo strong enough? Can the processor distinguish it from its surroundings?** An advertised maximum range answers none of these for a particular target.

For a single antenna transmitting and receiving in free space, the ideal received power is

$P_r=\frac{P_t G^2\lambda^2\sigma}{(4\pi)^3 R^4 L}.$

Here $P_t$ is transmit power, $G$ antenna gain, $\lambda$ wavelength, $\sigma$ radar cross section and $L$ the combined loss factor. The outbound wave spreads over an area proportional to $R^2$; the scattered wave spreads again on its return. **Doubling range therefore divides received power by sixteen.** With the same receiver threshold and all else fixed, doubling transmit power buys only about 19% more range. Cross section is not simply projected area: aspect, material, wavelength and polarization matter. This calculation excludes clutter and does not predict an E-3 detection range.

### What a pulse tells us—and what it cannot tell us

An echo arriving 1.00 ms after transmission corresponds to a slant range of about 150 km. Measuring that delay does not guarantee that two nearby echoes can be separated. For an ideal matched filter, range resolution is approximately $c/(2B)$, where $B$ is waveform bandwidth. At an illustrative 10 MHz it is about 15 m. A long frequency-swept pulse can carry substantial energy; correlation with the transmitted sweep concentrates the return in delay. Pulse compression does not create energy, and its sidelobes can obscure a weaker neighbor. Nor does 15 m in range imply 15 m across the beam: at 150 km, a one-degree beam spans roughly 2.6 km. Range resolution, angular resolution and single-target tracking accuracy are different specifications.

A coherent receiver also compares phase from pulse to pulse. In a monostatic radar the Doppler frequency is $2v_r/\lambda$, with $v_r$ the relative velocity **along the line of sight**. Two targets at equal speed can therefore produce very different Doppler shifts. Looking down from a moving aircraft makes the problem harder: stationary terrain has relative velocity, and returns from different directions occupy a band of Doppler frequencies. Suppressing that band may also suppress a real target. Increasing the pulse repetition frequency allows faster phase changes to be sampled, but echoes from earlier pulses can then arrive after a later transmission. There is no single pulse spacing that optimizes both unambiguous range and velocity. [MIT Lincoln Laboratory: radar clutter and the processing chain](https://www.ll.mit.edu/sites/default/files/outreach/doc/2018-07/lecture%207.pdf).

### Why a radar plot is not yet a track

A detector compares energy in a candidate cell with a threshold. Lowering the threshold can recover weak targets but also creates false plots; a changing coastline makes a threshold estimated from nearby cells less reliable. A tracker predicts where an existing object should appear on the next scan, associates plausible measurements and updates its estimate. An aircraft moving at 250 m/s travels 2.5 km in a hypothetical ten-second revisit interval. A turn during that interval makes a straight-line prediction wrong. A display can thus show a predicted symbol between measurements; the symbol is not a fresh detection. Sharing that track with another platform also requires a common coordinate frame, timestamps and an uncertainty estimate. Two reports of the same underlying measurement should not count as independent confirmation.

## Three design innovations—and the price of each

| System | What changed | Why the change matters |
|---|---|---|
| E-3 Sentry | A rotating dorsal installation carries the surveillance antenna. | Rotation brings the aperture around the aircraft. The airframe must support a large assembly above the fuselage, and the antenna cannot point mechanically in two azimuth directions at once. |
| E-2D Advanced Hawkeye | Its AN/APY-9 combines mechanical rotation with electronic scanning. | Electronic pointing and rotation can coexist: a disc-shaped enclosure does not tell you how the beam is steered. The Navy pairs the radar with identification equipment, passive electronic support and off-board reports. [NAVAIR engineering account](https://www.navair.navy.mil/node/11416) |
| E-7A Wedgetail | A fixed dorsal MESA installation electronically steers the beam on a Boeing 737-derived platform. | Changing relative phase across an aperture changes the direction of constructive interference without turning the housing. Steering gives more freedom to revisit a sector, but time spent there is time unavailable elsewhere. Array geometry, projected aperture, electrical power and cooling still constrain coverage. [Australian Air Force](https://www.airforce.gov.au/aircraft/e-7a-wedgetail) |

The recent change is not the invention of radar or phased arrays. It is how aircraft combine scanning, processing and communications under a common power, weight and time budget. For example, longer coherent observation improves separation of nearby Doppler frequencies, but consumes time that might otherwise be spent searching another sector. Even a perfectly steerable antenna cannot remove that trade-off.

## Applications beyond counting aircraft

**Maritime surveillance.** Australia identifies simultaneous airborne and maritime tracking as a Wedgetail capability. A ship and a low aircraft may appear at similar slant range, but the surrounding sea introduces wave echoes, and the two objects have different motion histories. Maintaining both tracks is a sensor-management problem, not just a matter of drawing two symbols. [RAAF platform description](https://www.airforce.gov.au/aircraft/e-7a-wedgetail).

**Fleet coordination and rescue support.** The U.S. Navy lists search and rescue among E-2D missions alongside fleet air and surface surveillance. In a rescue scenario, an airborne controller can help coordinate search aircraft and pass their positions to ships; this is distinct from claiming that its radar can detect a person in water. In fleet surveillance, the useful product is a timely track delivered to another unit, not merely a strong return aboard the aircraft. [NAVAIR mission sheet](https://www.navair.navy.mil/sites/g/files/jejdrs536/files/2018-12/E-2D%20Advanced%20Hawkeye%20slick%20sheet.pdf).

**Combining active and passive sensors.** Active radar measures echoes from its own transmission. A passive receiver can instead observe another emitter, providing complementary evidence, but one bearing alone generally does not fix range. Association must account for time, position uncertainty and the possibility of multiple emitters. Saab describes GlobalEye as combining active and passive sensors for air, maritime and land surveillance; that is a manufacturer's capability description, not independent evidence of a detection probability for any particular target. [Saab, July 2026](https://www.saab.com/newsroom/press-releases/2026/saab-receives-order-for-globaleye).

## Who is adopting these systems? Dated evidence, not a fleet forecast

| Country or customer | What the public record establishes | What it does not establish |
|---|---|---|
| Australia | The RAAF identifies No. 2 Squadron as operating six E-7As at Williamtown. | Fleet size is not the number available on any given day. |
| Poland | Saab reported delivery of the second **Saab 340 AEW** in Q2 2024. | These aircraft are not GlobalEyes; delivery does not specify operational readiness. |
| United Arab Emirates | The same report records delivery of a fourth **GlobalEye** in Q2 2024. | A dated delivery milestone is not a current fleet count. |
| Sweden | Saab reported Sweden's order for a third GlobalEye in Q2 2024. | An order is not an in-service declaration. |
| France | Saab's 2025 annual report records a French procurement order for two GlobalEyes. | The order alone does not establish delivery or retirement of the French E-3F in Figure 10. |
| Unnamed Middle Eastern customer | On 27 July 2026 Saab announced an order for two GlobalEyes, with delivery planned for 2030. | The announcement does not identify the country or establish that it is a first-time operator. |

Sources: [RAAF operator record](https://www.airforce.gov.au/aircraft/e-7a-wedgetail); [Saab Q2 2024 delivery and order report](https://www.saab.com/globalassets/cision/documents/2024/20240719-saab-q2-2024-results-strong-order-intake-and-continuous-focus-on-capacity-increases-en-0-4871052.pdf); [Saab 2025 annual report](https://www.saab.com/globalassets/corporate/investor-relations/annual-report/2026/saab-ar25-eng.pdf); [July 2026 order announcement](https://www.saab.com/newsroom/press-releases/2026/saab-receives-order-for-globaleye).

## Structures lab: when the antenna moves with the airframe

The radar engineer needs the direction in which the antenna **actually** points. The structures engineer needs the stiffness and vibration of its support, not only its static strength. Suppose an uncompensated elastic rotation introduces a pointing bias of 0.1 degree. At 200 km the geometric cross-range offset is approximately $R\delta\theta=349$ m. This is a sensitivity calculation, **not a measured E-3 error**. A sufficiently stiff attachment might meet a pointing requirement but add mass or concentrate cyclic stress at the frames. A static proof load would test strength; strain measurements under repeated loads would address fatigue; a vibration survey correlated with antenna attitude would address dynamic pointing. Passing one test does not pass the others.

For class, compare Figures 3–5. Draw one diagram for the electromagnetic path through the cover and a second for the mechanical load path into the fuselage. Then ask what evidence would establish that the cover works: a coupon transmission measurement cannot establish full-scale pointing accuracy, just as a successful radar track cannot establish the fatigue life of a strut fitting.

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
