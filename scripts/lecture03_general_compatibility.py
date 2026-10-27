"""Add a general compatibility recipe and a fixed-fixed beam with a middle roller."""
from pathlib import Path


def add_general_compatibility(cells):
    explanation = r"""### Extension: a general recipe when the beam has more redundant reactions

Write the rotation relation as a **difference**, so neither end condition disappears:

$$\boxed{\theta(x)-\theta(0)=-\int_0^x\frac{M(s)}{EI(s)}\,ds}.$$

After integrating once more, keep the initial rotation term too:

$$\boxed{v(x)-v(0)-x\theta(0)
=-\int_0^x(x-s)\frac{M(s)}{EI(s)}\,ds}.$$

The minus sign follows this notebook's convention: downward v is positive and sagging M is positive. These formulas allow variable EI(s); it must stay inside the integrals. The starting values are zero only when the starting support actually restrains those motions.

**General procedure for this linear transverse-bending model**

1. Draw the supports and list their unknown transverse reactions and reaction couples. For a stable beam, subtract the number of independent whole-beam equilibrium equations to count the remaining redundants. This planar bending model has two such equilibrium equations: vertical force and moment balance. A general planar frame may also require axial equilibrium and a different count.
2. Write M(x) in terms of the unknown reactions, using separate intervals at loads, supports and stiffness changes. An interior support changes the force diagram; it does not automatically create a hinge.
3. Integrate curvature, keeping the starting displacement and rotation constants. Apply the actual support conditions: a clamp prescribes v and θ; an ordinary vertical roller prescribes v only. Settlement or imposed rotation gives a prescribed nonzero value, not zero.
4. Solve equilibrium and the **independent** geometric conditions together. A released-force formulation gives one independent compatibility equation for each redundant. Alternatively, solve all reaction and integration-constant unknowns together; the four end conditions then also determine the two integration constants.
5. At an ordinary continuous interior section, v and θ remain continuous. Use those matching conditions if you introduce separate integration constants on each interval; do not count continuity twice when a single integrated formula already enforces it. Check reactions, end conditions and the resulting shape.

#### Example: keep both end clamps and add a vertical roller at C

Let A be x = 0, C be x = a = L/2, and B be x = L. The five transverse unknowns are Rₐ, Cₐ, R꜀, Rᵦ and Cᵦ. There are two independent equilibrium equations, so this beam has **three redundants**. Build the shape from A with v(0) = θ(0) = 0. The three remaining geometric equations are

$$\boxed{v(a)=0},\qquad \boxed{v(L)=0},\qquad \boxed{\theta(L)=0}.$$

**Do not add θ(a) = 0:** a roller permits rotation. Also, a roller underneath a continuous beam is not an internal hinge: M(a) need not be zero. If the roller can lift off, the assumed contact must be checked after solving; the example below has an upward contact reaction.

For a 2 N downward point load at b = L/4, and with every transverse reaction positive downward and every external couple positive clockwise, the moment from a left-part cut is

$$M(x)=C_A-R_Ax-P\max(x-b,0)-R_C\max(x-a,0).$$

A max term activates only after the cut passes that force. With constant EI, the three displacement/rotation conditions reduce to

$$C_AL-\frac{R_AL^2}{2}-\frac{P(L-b)^2}{2}-\frac{R_C(L-a)^2}{2}=0,$$

$$\frac{C_AL^2}{2}-\frac{R_AL^3}{6}-\frac{P(L-b)^3}{6}-\frac{R_C(L-a)^3}{6}=0,$$

$$\frac{C_Aa^2}{2}-\frac{R_Aa^3}{6}-\frac{P\max(a-b,0)^3}{6}=0.$$

These three equations determine Cₐ, Rₐ and R꜀. Then whole-beam equilibrium determines Rᵦ and Cᵦ. The code below checks all five prescribed motions and plots the continuous shape; the slope at C is free to be nonzero.

**Special case:** if the original middle point force is placed exactly over the newly added support at C, that support can carry the whole force directly: R꜀ = −P, with zero bending and zero other reactions in this ideal model. That is a special load path, not the general three-redundant solution. We move the demonstration load to L/4 to make the compatibility calculation visible.

This is still the integration method used in this lecture. A later unit-load/flexibility formulation organizes the same independent conditions into a matrix; adding more supports does not require inventing new equilibrium laws.
"""
    code = Path(__file__).with_name('lecture03_middle_support_example.py').read_text(encoding='utf-8')
    where = next(i for i,c in enumerate(cells) if c['cell_type']=='markdown' and '## 3. A cut reveals' in c['source'])
    cells[where:where] = [dict(cell_type='markdown',id='general-compatibility',metadata={},source=explanation),
                        dict(cell_type='code',id='middle-support-example',metadata={},source=code,execution_count=None,outputs=[])]
