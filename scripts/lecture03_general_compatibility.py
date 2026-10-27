"""Add a general compatibility recipe and a fixed-fixed beam with a middle roller."""
from pathlib import Path


def add_general_compatibility(cells):
    explanation = r"""### Compatibility, one step at a time

**The idea is simple: the bent beam must still fit its supports.** First calculate how the slope changes; then calculate how the height changes. For this example, EI is constant.

#### 1. Add the small changes in slope

A very short piece of beam has length dx. Its bending moment changes the slope by

$$d\theta=-\frac{M(x)}{EI}\,dx.$$

Add those small changes from the left end A to the right end B:

$$\boxed{\theta(L)-\theta(0)=-\frac{1}{EI}\int_0^L M(x)\,dx}.$$

Read the left side as **final slope minus starting slope**. It is the total change in slope along the beam. The integral adds up all the small changes; it does not give the final slope unless the starting slope is zero. The minus sign follows our downward-positive displacement and sagging-positive moment convention.

For two clamps, θ(0) = 0 and θ(L) = 0. Therefore

$$0-0=-\frac{1}{EI}\int_0^L M(x)\,dx.$$

The positive and negative moment regions must balance in this integral. This does not mean the moment is zero everywhere.

#### 2. Add the small changes in height

The slope tells us how much the height changes over a short distance:

$$dv=\theta(x)\,dx.$$

For example, a constant small slope of 0.01 rad over 100 mm changes the downward displacement by approximately 1 mm. Adding all the actual slopes along the beam gives

$$\boxed{v(L)-v(0)=\int_0^L\theta(x)\,dx}.$$

For two clamps, v(0) = v(L) = 0, so this second integral must also be zero. **Zero change in slope and zero change in height are two different conditions.** One does not replace the other.

We can therefore work in two familiar steps: **integrate M to get θ; integrate θ to get v.** Keep the starting value each time. There is no need to begin with a combined weighted-integral formula. If EI varies along the beam, keep 1/EI(x) inside the first integral.

**Where did the earlier term xθ(0) come from?** A straight beam starting with a small slope θ(0) would already change height by xθ(0), even without bending. The combined formula separates this initial tilt from the displacement caused by curvature. Here the left clamp makes θ(0) = 0, so that term is zero. Using the two integration steps above includes the same effect without needing the combined formula.

#### 3. What changes when we add a support?

The procedure stays the same:

1. Use equilibrium to write M(x) in terms of the unknown reactions.
2. Integrate to obtain θ(x) and v(x), applying the starting support conditions.
3. At every additional support, require the motion that the support prevents: a clamp fixes both height and slope; a vertical roller fixes height only. Solve these independent conditions with equilibrium.

The following example shows how this works with one extra support. The beam remains continuous across the roller: its displacement and slope do not jump there.

#### Example: two end clamps and one middle roller

The load P = 2 N acts at **x = L/4**. The roller C is at **x = L/2**. A is at zero and B is at L. First draw the physical supports; then replace them with reactions in a separate free-body diagram, as the figure below does.

| Support | What it prevents | Unknown reactions | Geometric conditions |
|---|---|---|---|
| A: left clamp | Vertical movement and rotation | R<sub>A</sub>, C<sub>A</sub> | v(0) = 0, θ(0) = 0 |
| C: middle roller | Vertical movement only | R<sub>C</sub> | v(L/2) = 0 |
| B: right clamp | Vertical movement and rotation | R<sub>B</sub>, C<sub>B</sub> | v(L) = 0, θ(L) = 0 |

There are five transverse reactions but only two whole-beam equilibrium equations. This leaves **three redundants**. The two conditions at A fix the starting displacement and slope when we integrate. The three remaining conditions determine the remaining reactions:

- **v(L/2) = 0:** the beam stays at the roller's height at C.
- **v(L) = 0:** the right clamp keeps B at its original height.
- **θ(L) = 0:** the right clamp keeps the tangent at B horizontal.

**Do not add θ(L/2) = 0:** the roller does not hold the beam horizontal. Also, the beam is not cut at C. Its material can still transmit an internal bending moment across that section, even though the roller supplies no external reaction couple. Thus **M(L/2) need not be zero**. An actual internal hinge would be a different model.

#### Step 1: write the moment for three possible cut positions

In the free-body diagram, assume **all reactions downward and both reaction couples clockwise**. These are positive reference directions, not a prediction of their actual directions. A negative answer reverses the corresponding arrow. The internal moment M is still sagging-positive, as in the rest of the notebook.

Isolate the part to the **left** of the cut. A force enters its moment balance only once that force lies on the isolated part:

$$M(x)=\begin{cases}
C_A-R_Ax,&0\leq x<L/4,\\
C_A-R_Ax-P(x-L/4),&L/4\leq x<L/2,\\
C_A-R_Ax-P(x-L/4)-R_C(x-L/2),&L/2\leq x\leq L.
\end{cases}$$

Before L/4, the left part contains only the actions at A. After L/4, include P with lever arm x − L/4. After L/2, also include R<sub>C</sub> with lever arm x − L/2. The right-support reactions do not appear in these left-part cuts inside the span; we recover them later from whole-beam equilibrium.

#### Step 2: integrate each contribution

For constant EI, integrate M once to obtain slope and again to obtain displacement. Multiply the entries in each integration column below by **−1/EI**. The starting values v(0) = θ(0) = 0 are already applied.

| Contribution to M | After one integration, for θ | After two integrations, for v |
|---|---|---|
| C<sub>A</sub> | C<sub>A</sub>x | C<sub>A</sub>x²/2 |
| −R<sub>A</sub>x | −R<sub>A</sub>x²/2 | −R<sub>A</sub>x³/6 |
| −P(x − L/4), after the load | −P(x − L/4)²/2 | −P(x − L/4)³/6 |
| −R<sub>C</sub>(x − L/2), after C | −R<sub>C</sub>(x − L/2)²/2 | −R<sub>C</sub>(x − L/2)³/6 |

For example, the load contribution gains a squared lever arm after the first integration and a cubed lever arm after the second. The factors 2 and 6 come from integrating once and then again. **Before its force position, each delayed contribution is zero.** At that position its new terms start at zero, so the beam's displacement and slope stay continuous.

#### Step 3: turn each support condition into one equation

**Equation 1 comes from θ(L) = 0.** Use the first-integration column at x = L. The lever arms are L − L/4 = 3L/4 for P and L − L/2 = L/2 for R<sub>C</sub>. Because θ(L) is zero, the common nonzero factor −1/EI cancels:

$$C_AL-\frac{R_AL^2}{2}-\frac{P(3L/4)^2}{2}-\frac{R_C(L/2)^2}{2}=0.$$

**Equation 2 comes from v(L) = 0.** Use the second-integration column at x = L, with the same two lever arms:

$$\frac{C_AL^2}{2}-\frac{R_AL^3}{6}-\frac{P(3L/4)^3}{6}-\frac{R_C(L/2)^3}{6}=0.$$

**Equation 3 comes from v(L/2) = 0.** Now evaluate displacement at C instead of at B. The load P is L/4 away from C. The term associated with R<sub>C</sub> starts at C, so its cubed lever arm is zero there:

$$\frac{C_A(L/2)^2}{2}-\frac{R_A(L/2)^3}{6}-\frac{P(L/4)^3}{6}=0.$$

R<sub>C</sub> is determined together with the other unknowns through the first two equations; its absence from the third does not mean that the middle support has no effect.

Solve these three equations for C<sub>A</sub>, R<sub>A</sub> and R<sub>C</sub>. Finally use **whole-beam equilibrium** to find R<sub>B</sub> and C<sub>B</sub>:

$$R_A+R_C+R_B+P=0,$$

$$C_A+C_B+R_C\frac{L}{2}+R_BL+P\frac{L}{4}=0.$$

The code below checks these two balances and all five prescribed support motions. Its nonzero θ(C) shows that a roller permits rotation. A roller underneath the beam must also remain in contact; the upward R<sub>C</sub> in this example satisfies that contact direction.

**Special case:** if P acts exactly over C rather than at L/4, C can carry the whole load directly: R<sub>C</sub> = −P, with zero other reactions and zero bending in this ideal model. We use L/4 here to show a nontrivial compatibility calculation.

This is still the integration method used in this lecture. A later unit-load/flexibility formulation organizes the same independent conditions into a matrix; adding more supports does not require inventing new equilibrium laws.
"""
    explanation += '\n\n**[Open and solve this exact example in Beam Lab](https://ehsan-roohi.github.io/Aerospace-Structures/wing-lab.html?beam=eyJ2IjoyLCJtIjp7Imxlbmd0aCI6NDUwLCJFIjoyMDAwLCJkZW5zaXR5IjoxLjI0LCJlbGVtZW50cyI6NjAsInNlY3Rpb24iOnsic2hhcGUiOiJyZWN0YW5nbGUiLCJ3aWR0aCI6MjAsImhlaWdodCI6MTB9LCJzdXBwb3J0cyI6W3sieCI6MCwia2luZCI6ImZpeGVkIn0seyJ4IjoyMjUsImtpbmQiOiJyb2xsZXIifSx7IngiOjQ1MCwia2luZCI6ImZpeGVkIn1dLCJoaW5nZXMiOltdLCJsb2FkcyI6W3sia2luZCI6InBvaW50IiwicG9zaXRpb24iOjExMi41LCJmb3JjZSI6Mn1dLCJzZWxmV2VpZ2h0IjpmYWxzZX19#beam)** — L = 450 mm; fixed ends at 0 and 450 mm; roller at 225 mm; 2 N downward at 112.5 mm; rectangular section 20 × 10 mm; E = 2000 MPa. The link replaces the current Beam Lab study with this example.\n'
    code = Path(__file__).with_name('lecture03_middle_support_example.py').read_text(encoding='utf-8')
    where = next(i for i,c in enumerate(cells) if c['cell_type']=='markdown' and '## 3. A cut reveals' in c['source'])
    cells[where:where] = [dict(cell_type='markdown',id='general-compatibility',metadata={},source=explanation),
                        dict(cell_type='code',id='middle-support-example',metadata={},source=code,execution_count=None,outputs=[])]
