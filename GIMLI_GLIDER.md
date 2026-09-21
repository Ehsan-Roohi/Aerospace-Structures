# The Gimli Glider: an aerospace-structures case study

**MIE 446 · Aerospace Structures · UMass Amherst**  
**Case:** Air Canada Flight 143 · Boeing 767-233, registration C-GAUN · 23 July 1983

On 23 July 1983, a nearly new Boeing 767 ran out of fuel at 41,000 ft during a scheduled flight from Montreal to Edmonton, with an intermediate stop in Ottawa. Both engines stopped. Most electronic displays went dark, normal hydraulic power was lost, and the crew had no checklist for gliding a transport-category jet with both engines inoperative. Seventeen minutes later, the aircraft stopped on a former military runway at Gimli, Manitoba. All 69 occupants survived.

The event is often presented as a story about a pounds-to-kilograms error and exceptional piloting. Both are true, but they are incomplete. For an aerospace-structures course, the more useful question is broader:

> **How did the aircraft remain controllable, transmit abnormal loads, protect its occupants, and come to rest after several layers of the intended system had failed?**

This reading is an original MIE 446 case study. It is not a translation or reproduction of the Zoomit article. The technical narrative is based primarily on the Canadian Board of Inquiry report, archived by the FAA, and the photographs are used under the licenses identified at the end of the page.

![Air Canada Boeing 767 C-GAUN four months before the accident](https://upload.wikimedia.org/wikipedia/commons/2/28/C-GAUN_Aircraft_%28cropped%29.jpg)

*C-GAUN four months before the accident. Photograph: Pierre Langlois, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:C-GAUN_Aircraft_(cropped).jpg), CC BY-SA 4.0.*

## 1. The aircraft and the first failed defense

C-GAUN was the 47th Boeing 767 produced and had entered Air Canada service only a few months earlier. The 767 represented a new generation of wide-body aircraft: electronic flight instruments, a two-person flight deck, and extensive automation replaced many functions and displays found in older three-crew aircraft.

Fuel quantity was normally calculated by the fuel-quantity indication system (FQIS). The system used two processing channels so that one channel could continue operating after the other failed. Before Flight 143, a fault had appeared in the system. Maintenance actions, changing crews, an ambiguous logbook entry, a circuit breaker that had been tagged but was no longer pulled, and the absence of a serviceable replacement unit eventually left the cockpit fuel gauges blank.

The important lesson is not that one component failed. Components fail, which is why redundancy exists. The accident developed because the redundancy, maintenance communication, dispatch rules, manual measurement, unit convention, and independent cross-check did not remain independent defenses.

![Failure chain from fuel indication fault to dual-engine flameout](docs/case-studies/gimli-glider/fuel-chain.svg)

## 2. The calculation that put too little fuel on board

With the fuel indication unavailable, the fuel in the tanks was measured manually as a volume. The flight plan, however, required fuel mass in kilograms. At Montreal, the measured quantity already aboard was 7,682 L, and the required dispatch fuel was 22,300 kg.

Using the correct density, approximately 0.803 kg/L:

$$
m_{\mathrm{onboard}}=(7{,}682\ \mathrm{L})(0.803\ \mathrm{kg/L})=6{,}169\ \mathrm{kg}
$$

$$
m_{\mathrm{add}}=22{,}300-6{,}169=16{,}131\ \mathrm{kg}
$$

$$
V_{\mathrm{add}}=\frac{16{,}131\ \mathrm{kg}}{0.803\ \mathrm{kg/L}}\approx20{,}088\ \mathrm{L}
$$

Instead, the density supplied as 1.77 lb/L was treated as if it were a kilogram-per-litre value. Only about 4,917 L was added. The airplane departed with roughly 10,100 kg of fuel rather than the required 22,300 kg. A second manual check at Ottawa repeated the same unit error and appeared to confirm the first result.

Dimensional analysis would have exposed the inconsistency. Numbers are not measurements until their units travel with them. In structural work, the same class of mistake can affect pressure, force, stress, toughness, fastener strength, section properties, or material allowables. A finite-element result can be numerically converged and still be physically wrong if its unit system or input provenance is wrong.

## 3. From powered airliner to glider

Near Red Lake, Ontario, fuel-pressure warnings appeared. The left engine stopped, followed shortly by the right. Engine-driven generators and pumps were no longer available. Much of the electronic flight deck went dark, and the crew was left with limited battery-powered instrumentation.

The Boeing 767's primary control surfaces are too large to be moved directly by pilot muscle force. Hydraulic power is therefore essential. When both engines stopped, a ram air turbine (RAT) deployed into the airstream. The RAT converted the aircraft's forward motion into limited hydraulic power, preserving control of essential systems. It did not restore normal capability: hydraulic authority decreased as airspeed decreased, and the crew did not regain the normal high-lift and braking configuration of a powered approach.

The crew initially considered Winnipeg, but their measured altitude loss showed that it was beyond reach. First Officer Maurice Quintal suggested the former Royal Canadian Air Force base at Gimli, where he had once served. The pilots did not know that part of the runway had become a motorsport complex and that people, cars, campers, and cyclists were present.

![Simplified unpowered glide and landing sequence](docs/case-studies/gimli-glider/glide-and-landing.svg)

Captain Robert Pearson, who had glider experience, held approximately 220 kt while the crew estimated the achievable range. The reported in-flight estimate was a loss of about 5,000 ft over 10 nautical miles, corresponding to a glide ratio near 12:1 under the actual conditions. The number should be understood as an operational estimate, not a clean-aircraft performance measurement.

## 4. The approach: energy had to go somewhere

Approaching Gimli, the aircraft was too high and too fast. In normal powered flight, the crew could use thrust, flaps, slats, speed brakes, or a go-around to reshape the energy state. Here, the options were sharply restricted. The gear had been lowered by gravity; the main gear locked, but the nose gear did not. Normal flap and slat extension was unavailable.

Pearson used a forward slip: rudder and aileron inputs placed the aircraft in a cross-controlled attitude, increasing drag and steepening the descent without the same increase in forward speed. This is familiar in sailplanes and light aircraft but highly unusual in a large swept-wing transport. The slip also disturbed airflow through the RAT, reducing the already limited hydraulic power and making the recovery more difficult.

For structures students, the energy balance is central. At touchdown, the aircraft still carried kinetic and potential energy. With no powered go-around available, every joule had to be dissipated through aerodynamic drag, tire and brake work, landing-gear deformation, friction, local structural damage, or continued motion down the runway:

$$
E_{\mathrm{available}} \approx \frac{1}{2}mV^2 + mgh
$$

Because kinetic energy varies with the square of speed, even a modest increase in touchdown speed produces a much larger energy-management problem. Emergency design is therefore not simply a question of whether one member remains below yield. The aircraft is a system of competing load paths and energy absorbers.

## 5. Touchdown, gear collapse, and load paths

The 767 touched down on the converted runway. Hard braking blew two tires. The unlocked nose gear folded back into its bay, and the nose contacted the pavement. The aircraft also encountered a central guardrail installed for the drag strip. The collapsed nose and the friction generated by the fuselage contact increased deceleration and helped the aircraft stop before reaching the largest concentration of people at the far end.

![Flight 143 after the emergency landing at Gimli](https://upload.wikimedia.org/wikipedia/commons/9/98/Air_Canada_Flight_143_after_emergency_landing_2.jpg)

*Flight 143 after the emergency landing. The nose is down after the unlocked nose gear collapsed. Source: FAA, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Air_Canada_Flight_143_after_emergency_landing_2.jpg), public domain.*

The event offers several structural observations:

1. **The main landing gear carried the first major impact and braking loads.** Those loads entered the airframe through reinforced attachment structure rather than through the thin fuselage skin alone.
2. **The failed nose-gear state changed the load path.** Once the nose contacted the runway, local fuselage structure and skin experienced abrasion, bending, and concentrated contact loads for which normal landing operation is not intended.
3. **Local damage did not become global collapse.** The pressure shell, floor structure, wing carry-through region, and major cabin load paths remained sufficiently intact to preserve survivable space.
4. **Controlled damage can dissipate energy.** The nose-gear collapse was not a desired design outcome, but deformation, tire failure, braking, and sliding converted motion into heat, fracture, and plastic work.
5. **Post-touchdown geometry affected evacuation.** With the nose down and the tail elevated, the rear evacuation slides did not reach the ground as intended, contributing to minor injuries. Structural deformation can therefore change the performance of systems that are not themselves damaged.

No serious injuries occurred. A small fire near the nose was extinguished by people at the track. The aircraft was repaired and returned to service, an outcome that also shows the difference between visible local damage and loss of primary structural integrity.

## 6. What this case does—and does not—prove

The safe outcome should not be interpreted as evidence that the aircraft was designed to glide routinely without engines or to land with an unlocked nose gear. The sequence depended on crew decisions, remaining control authority, weather and visibility, a reachable runway, and several fortunate details. A different speed, surface, obstacle distribution, crosswind, structural contact point, or delay could have produced a very different result.

Nor was the accident caused by a single person entering a wrong number. The official inquiry identified equipment, procedural, training, maintenance, documentation, and organizational deficiencies. Treating the event only as “human error” hides the engineering question: why was one incorrect unit factor able to pass through every available defense?

This is directly relevant to structural analysis. A trustworthy stress calculation also needs several independent defenses:

- a correct free-body diagram and load path;
- consistent units and sign conventions;
- verified geometry and section properties;
- realistic supports and load introduction;
- appropriate material allowables and failure modes;
- a second calculation, limiting case, experiment, or physical reasonableness check.

Redundancy is useful only when the redundant channels do not share the same hidden assumption. Two calculations using the same wrong density are not two independent checks.

## 7. Questions for MIE 446 discussion

1. Draw a qualitative free-body diagram for the aircraft immediately after main-gear touchdown but before the nose contacts the runway. Identify lift, weight, inertial effects, gear reactions, tire forces, and pitching moment.
2. Redraw the load path after the nose gear collapses. Which fuselage regions would you inspect first, and why?
3. If touchdown speed increases by 15%, by what percentage does kinetic energy increase? What does that imply for brakes, tires, gear stroke, and stopping distance?
4. Why are two manual calculations not independent verification if both use the same unit factor?
5. Which outcomes in this event are examples of designed resilience, and which are fortunate but should not be claimed as design features?
6. The airplane was repaired and returned to service. What nondestructive inspections and alignment checks would you request before accepting that decision?

## 8. Watch and explore

- [Air Canada 604 “Gimli Glider” — aircraft footage on YouTube](https://www.youtube.com/watch?v=2MHy6yy3Z00) (short visual supplement; verify claims against the investigation report).
- [Air Disasters: “Gimli Glider” — Smithsonian Channel episode](https://tv.apple.com/us/episode/gimli-glider/umc.cmc.18nqsf7nrm48s3a2cxh1oj8zk) (45 min; availability may depend on region or subscription).
- [Gimli Glider video results on YouTube](https://www.youtube.com/results?search_query=Gimli+Glider+Air+Canada+Flight+143) (use the source-evaluation checklist below before relying on a retelling).

When watching a reconstruction, compare it with the official record. Check whether it distinguishes verified facts from dramatization, preserves the sequence of maintenance and dispatch decisions, reports units with every quantity, and avoids assigning the entire accident to one arithmetic mistake.

## 9. Sources and image licenses

The principal technical source is the **[Final Report of the Board of Inquiry into the Air Canada Boeing 767 accident at Gimli](https://www.faa.gov/sites/faa.gov/files/2024-12/AirCanada143_C-GAUN.pdf)**, hosted by the U.S. Federal Aviation Administration. Useful supplementary sources are the [Government of Canada account](https://www.canada.ca/en/department-national-defence/maple-leaf/rcaf/migration/2018/from-the-avro-arrow-to-the-gimli-glider.html), the [Aviation Safety Network occurrence record](https://aviation-safety.net/asndb/327590), and Merran Williams, *The 156-tonne Gimli Glider*, *Flight Safety Australia*, July–August 2003.

Image credits:

- `c-gaun-before-accident.jpg`: Pierre Langlois, [Wikimedia Commons source page](https://commons.wikimedia.org/wiki/File:C-GAUN_Aircraft_(cropped).jpg), CC BY-SA 4.0.
- `flight-143-after-landing.jpg`: FAA, [Wikimedia Commons source page](https://commons.wikimedia.org/wiki/File:Air_Canada_Flight_143_after_emergency_landing_2.jpg), public domain.
- `c-gaun-retired.jpg`: Akradecki, [Wikimedia Commons source page](https://commons.wikimedia.org/wiki/File:Aca-767-C-GAUN-604-080201-01-8.jpg), CC BY-SA 3.0/GFDL.
- `fuel-chain.svg` and `glide-and-landing.svg`: original MIE 446 diagrams created for this case study.

## Epilogue

C-GAUN was repaired, returned to commercial service, and retired in 2008.

![C-GAUN after retirement at Mojave](https://upload.wikimedia.org/wikipedia/commons/a/a7/Aca-767-C-GAUN-604-080201-01-8.jpg)

*The Gimli Glider after retirement at Mojave in 2008. Photograph: Akradecki, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Aca-767-C-GAUN-604-080201-01-8.jpg), CC BY-SA 3.0/GFDL.*

The lasting engineering lesson is not simply that a skilled crew saved an aircraft. It is that technical systems fail through chains, while survivability comes from interacting layers: structural continuity, emergency control power, load-path redundancy, energy absorption, crew judgment, and disciplined verification.
