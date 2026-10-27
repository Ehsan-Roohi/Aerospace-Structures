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

#### Example: keep both end clamps and add a vertical roller at C

Let A be x = 0, C be x = a = L/2, and B be x = L. The five transverse unknowns are Rₐ, Cₐ, R꜀, R<sub>B</sub> and C<sub>B</sub>. There are two independent equilibrium equations, so this beam has **three redundants**. Build the shape from A with v(0) = θ(0) = 0. The three remaining geometric equations are

$$\boxed{v(a)=0},\qquad \boxed{v(L)=0},\qquad \boxed{\theta(L)=0}.$$

**Do not add θ(a) = 0:** a roller permits rotation. Also, a roller underneath a continuous beam is not an internal hinge: M(a) need not be zero. If the roller can lift off, the assumed contact must be checked after solving; the example below has an upward contact reaction.

For a 2 N downward point load at b = L/4, and with every transverse reaction positive downward and every external couple positive clockwise, the moment from a left-part cut is

$$M(x)=C_A-R_Ax-P\max(x-b,0)-R_C\max(x-a,0).$$

A max term activates only after the cut passes that force. With constant EI, the three displacement/rotation conditions reduce to

$$C_AL-\frac{R_AL^2}{2}-\frac{P(L-b)^2}{2}-\frac{R_C(L-a)^2}{2}=0,$$

$$\frac{C_AL^2}{2}-\frac{R_AL^3}{6}-\frac{P(L-b)^3}{6}-\frac{R_C(L-a)^3}{6}=0,$$

$$\frac{C_Aa^2}{2}-\frac{R_Aa^3}{6}-\frac{P\max(a-b,0)^3}{6}=0.$$

These three equations determine Cₐ, Rₐ and R꜀. Then whole-beam equilibrium determines R<sub>B</sub> and C<sub>B</sub>. The code below checks all five prescribed motions and plots the continuous shape; the slope at C is free to be nonzero.

**Special case:** if the original middle point force is placed exactly over the newly added support at C, that support can carry the whole force directly: R꜀ = −P, with zero bending and zero other reactions in this ideal model. That is a special load path, not the general three-redundant solution. We move the demonstration load to L/4 to make the compatibility calculation visible.

This is still the integration method used in this lecture. A later unit-load/flexibility formulation organizes the same independent conditions into a matrix; adding more supports does not require inventing new equilibrium laws.
"""
    code = Path(__file__).with_name('lecture03_middle_support_example.py').read_text(encoding='utf-8')
    where = next(i for i,c in enumerate(cells) if c['cell_type']=='markdown' and '## 3. A cut reveals' in c['source'])
    cells[where:where] = [dict(cell_type='markdown',id='general-compatibility',metadata={},source=explanation),
                        dict(cell_type='code',id='middle-support-example',metadata={},source=code,execution_count=None,outputs=[])]
