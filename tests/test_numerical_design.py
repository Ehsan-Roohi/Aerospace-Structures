"""Independent analytical checks for the numerical teaching model."""
import importlib.util
from pathlib import Path
import unittest
import numpy as np

spec=importlib.util.spec_from_file_location('wing_design_core',Path(__file__).resolve().parents[1]/'scripts/wing_design_core.py')
core=importlib.util.module_from_spec(spec); spec.loader.exec_module(core)

class NumericalDesignTests(unittest.TestCase):
    def setUp(self):
        self.c=dict(L=.7,c_root=.3,taper=.85,mass=2.,g=9.81,n=3.,B=.025,H=.032,tf=.001,tw=.001,
            E=70e9,G=70e9/2.66,nu=.33,rho=2700.,stress_allow=120e6,shear_allow=70e6,
            buckling_fs=1.5,k_buckle=4.,e=.025,defl_limit=.005,twist_limit=np.pi/180,clearance=.002,naca='4418',spar_xc=.3)

    def test_uniform_closed_form(self):
        c=self.c; r=core.assess(c,'Uniform',2001); F=c['n']*c['mass']*c['g']/2; b=r['beam']; s=r['section']
        self.assertAlmostEqual(b['V'][0],F,places=8)
        self.assertAlmostEqual(b['M'][0],F*c['L']/2,places=8)
        self.assertLess(abs(b['v'][-1]/(F*c['L']**3/(8*c['E']*s['I']))-1),1e-6)
        self.assertAlmostEqual(b['phi'][-1],c['e']*F*c['L']/(2*c['G']*s['J']),places=10)
        self.assertEqual(b['v'][0],0); self.assertAlmostEqual(b['M'][-1],0)

    def test_triangular_centroid(self):
        c=self.c; r=core.assess(c,'Root-heavy',4001)
        F=c['n']*c['mass']*c['g']/2
        self.assertLess(abs(r['beam']['M'][0]/(F*c['L']/3)-1),1e-6)

    def test_linearity_and_reversal(self):
        a=core.assess(self.c); b=core.assess(dict(self.c,n=-6))
        np.testing.assert_allclose(b['beam']['v'],-2*a['beam']['v'],atol=1e-12)
        for key in a['U']: self.assertAlmostEqual(b['U'][key],2*a['U'][key])

    def test_zero_load(self):
        a=core.assess(dict(self.c,n=0))
        self.assertEqual(max(a['U'].values()),0.)

    def test_reject_invalid_geometry(self):
        with self.assertRaises(ValueError): core.section(.01,.02,.01,.01)
        with self.assertRaises(ValueError): core.airfoil('4012')
        self.assertTrue(np.isneginf(core.packaging(dict(self.c,spar_xc=.001))['gap']).all())

    def test_symmetric_airfoil(self):
        xu,zu,xl,zl=core.airfoil('0012')
        np.testing.assert_allclose(xu,xl); np.testing.assert_allclose(zu,-zl)

    def test_taper_packaging(self):
        r=core.packaging(self.c)
        self.assertLess(r['gap'][-1],r['gap'][0])
        self.assertTrue(np.isfinite(r['gap']).all())

    def test_envelope_uses_worst_absolute_case(self):
        r=core.envelope(self.c,{'a':1.,'b':3.,'c':-5.})
        self.assertTrue(all(label=='c' for label in r['worst'].values()))

if __name__=='__main__': unittest.main()
