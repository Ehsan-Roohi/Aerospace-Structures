"""Execute the lesson's actual cells; check equilibrium, limits and answer feedback."""
import contextlib
import io
import json
from pathlib import Path
import unittest
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[1]


class LoadMomentLessonTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.nb = json.loads((ROOT/'notebooks/MIE446_Lecture_02_Finite_Wings_and_Load_Paths.ipynb').read_text(encoding='utf-8'))
        cls.cells = {c['id']: ''.join(c['source']) for c in cls.nb['cells']}
        # Rich display is not used by the load cells; avoid a test-only IPython dependency.
        cls.setup = cls.cells['922e99ea'].replace('from IPython.display import Markdown, display', '')
        plt.show = lambda: None

    def run_case(self, force=1200., span=4., ratio=.5, hand=None):
        ns = {}
        src = self.cells['3835cf36'].replace('HALF_WING_FORCE_N = 1200.0', f'HALF_WING_FORCE_N = {force!r}')
        src = src.replace('LOAD_SEMI_SPAN_M = 4.0', f'LOAD_SEMI_SPAN_M = {span!r}')
        src = src.replace('TRAPEZOID_TIP_TO_ROOT_RATIO = 0.50', f'TRAPEZOID_TIP_TO_ROOT_RATIO = {ratio!r}')
        output = io.StringIO()
        try:
            with contextlib.redirect_stdout(output):
                exec(self.setup, ns)
                exec(self.cells['b4c325a8'], ns)
                ns.update(hand or {})
                exec(src, ns)
            return ns, output.getvalue()
        finally:
            plt.close('all')

    def test_all_default_notebook_code_executes(self):
        ns = {}
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                for cell in self.nb['cells']:
                    if cell['cell_type'] == 'code':
                        src = self.setup if cell['id']=='922e99ea' else ''.join(cell['source'])
                        exec(compile(src, cell['id'], 'exec'), ns)
            self.assertEqual(len(ns['loads']), 4)
            self.assertAlmostEqual(ns['MR'], -ns['F']*ns['ybar'])
        finally:
            plt.close('all')

    def test_defaults_match_hand_derived_values(self):
        ns, _ = self.run_case()
        exact = {'Uniform': 2400., 'Root-heavy triangular': 1600.,
                 'Trapezoidal': 6400/3, 'Elliptical': 6400/np.pi}
        for name, value in exact.items():
            with self.subTest(name=name):
                self.assertTrue(np.isclose(ns['root_moments'][name], value, rtol=2e-5))

    def test_trapezoid_limits_and_custom_scales(self):
        for force, span in [(9., .45), (1200., 4.), (2.5, .8)]:
            for ratio in [0., .5, 1., 2.]:
                with self.subTest(force=force, span=span, ratio=ratio):
                    ns, _ = self.run_case(force, span, ratio)
                    expected = force*span*(1+2*ratio)/(3*(1+ratio))
                    self.assertTrue(np.isclose(ns['root_moments']['Trapezoidal'], expected, rtol=2e-5))
                    if ratio==0:
                        np.testing.assert_allclose(ns['loads']['Trapezoidal'], ns['loads']['Root-heavy triangular'])
                    if ratio==1:
                        np.testing.assert_allclose(ns['loads']['Trapezoidal'], ns['loads']['Uniform'])
                    if ratio>1:
                        self.assertGreater(ns['centroids']['Trapezoidal'], span/2)

    def test_fixed_hand_problem_not_graded_against_custom_inputs(self):
        answers = {'HAND_UNIFORM_NM':2.025, 'HAND_TRIANGULAR_NM':1.350,
                   'HAND_TRAPEZOIDAL_NM':1.800, 'HAND_ELLIPTICAL_NM':1.719}
        _, output = self.run_case(1200., 4., 2., answers)
        self.assertEqual(output.count('numerical value agrees'), 4)
        self.assertNotIn('revise', output)

    def test_missing_and_wrong_answers_are_not_marked_correct(self):
        _, output = self.run_case(hand={'HAND_UNIFORM_NM':1.})
        self.assertIn('Uniform: revise', output)
        self.assertEqual(output.count('unanswered'), 4)  # one setup explanation + three feedback rows
        self.assertNotIn('numerical value agrees', output)

    def test_invalid_physical_inputs(self):
        for changes in [{'force':0.}, {'force':-1.}, {'span':0.}, {'ratio':-1.}]:
            with self.subTest(changes=changes):
                with self.assertRaises(ValueError):
                    self.run_case(**changes)

    def test_tip_heavy_triangle_and_cut_lever_arm(self):
        y=np.linspace(0,4,20001)
        w=600*y/4
        integrate=getattr(np, 'trapezoid', None) or np.trapz
        self.assertTrue(np.isclose(integrate(w,y),1200))
        self.assertTrue(np.isclose(integrate(y*w,y),3200))
        cut=1.5
        out=y[y>=cut]
        # A uniform intensity q on the remaining length has moment q*(s-cut)^2/2.
        correct=integrate((out-cut)*300,out)
        self.assertTrue(np.isclose(correct,300*(4-cut)**2/2))
        self.assertGreater(integrate(out*300,out),correct)

    def test_theory_and_figures_precede_prediction(self):
        ids=[c['id'] for c in self.nb['cells']]
        for ident in ['l02-load-uniform','l02-load-triangle','l02-load-trapezoid','l02-load-ellipse','l02-load-practice']:
            self.assertLess(ids.index(ident),ids.index('b4c325a8'))
        for name in ['Load_Strip_To_Moment','Load_Uniform','Load_Triangular','Load_Tip_Heavy_Triangle','Load_Trapezoidal','Load_Elliptical']:
            for ext in ['png','svg']:
                self.assertTrue((ROOT/f'docs/assets/lecture02/{name}.{ext}').is_file())


if __name__=='__main__':
    unittest.main()
