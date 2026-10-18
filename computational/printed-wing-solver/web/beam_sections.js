/*
 * Beam Sections — MIE 446 cross-section library for the Euler–Bernoulli teaching model.
 * Browser: BeamSections.properties(section). Node: require('./beam_sections.js').
 *
 * Homogeneous, prismatic, doubly symmetric sections bent about their horizontal axis.
 * Units: mm, N, MPa = N/mm². z is measured UPWARD from the neutral (centroidal) axis and
 * c is the extreme-fibre distance (depth/2 for every shape here).
 *
 *   rectangle {width:b, height:h}
 *   circle    {diameter:d}
 *   tube      {outerDiameter:D, thickness:t}                        0 < t < D/2
 *   box       {width:B, height:H, thickness:t}                      uniform wall, 2t < min(B,H)
 *   ibeam     {flangeWidth:bf, height:h, flangeThickness:tf, webThickness:tw}   2tf < h, tw <= bf
 *
 * Normal stress: sigma(z) = -M z / I (sagging M > 0 puts the top, z > 0, in compression).
 * Shear stress: tau(z) = V Q(z) / (I b(z)) (Zhuravskii/Jourawski). It is the AVERAGE vertical
 * shear stress across the total material width b(z) cut by the line at height z. Where that
 * line crosses two separate walls (tube, box webs) b(z) is the sum of both walls; by symmetry
 * each wall carries the same tau. In wide flanges the formula gives only a small average of the
 * vertical component; the real flange shear flow runs mainly along the flange and is not shown.
 * For every shape here the maximum of Q/b is at the neutral axis, so tau_max = k |V| / A with
 * k = A Q_NA / (I b_NA): k = 3/2 for a solid rectangle and 4/3 for a solid circle.
 * Local/shell buckling, crippling, holes and clamp or contact stress concentrations are outside
 * this beam model.
 */
const BeamSections = (() => {
  'use strict';
  const MAX_DIMENSION = 1e5;   // mm; protects imports and links from absurd values
  const SHAPES = Object.freeze({
    rectangle: {label:'Solid rectangle', fields:[['width','b','Width'],['height','h','Depth']],
      defaults:{width:20,height:10}},
    circle: {label:'Solid circle', fields:[['diameter','d','Diameter']], defaults:{diameter:16}},
    tube: {label:'Circular tube', fields:[['outerDiameter','D','Outer diameter'],['thickness','t','Wall thickness']],
      defaults:{outerDiameter:20,thickness:2}},
    box: {label:'Rectangular hollow box', fields:[['width','B','Outer width'],['height','H','Outer depth'],['thickness','t','Wall thickness']],
      defaults:{width:16,height:20,thickness:2}},
    ibeam: {label:'Symmetric I-section', fields:[['flangeWidth','b_f','Flange width'],['height','h','Overall depth'],
      ['flangeThickness','t_f','Flange thickness'],['webThickness','t_w','Web thickness']],
      defaults:{flangeWidth:16,height:20,flangeThickness:2.5,webThickness:2}}
  });

  function positive(value, name) {
    if(typeof value!=='number'||!Number.isFinite(value)) throw new Error(`${name} must be a finite number.`);
    if(value<=0) throw new Error(`${name} must be greater than zero.`);
    if(value>MAX_DIMENSION) throw new Error(`${name} must not exceed ${MAX_DIMENSION} mm.`);
    return value;
  }

  /** Returns a validated copy holding only the dimensions of the chosen shape. */
  function normalize(section) {
    if(!section||typeof section!=='object') throw new Error('Choose a cross-section.');
    const shape=section.shape===undefined?'rectangle':section.shape;
    if(typeof shape!=='string'||!Object.prototype.hasOwnProperty.call(SHAPES,shape))
      throw new Error('Cross-section must be rectangle, circle, tube, box or ibeam.');
    const out={shape};
    for(const [key,symbol,label] of SHAPES[shape].fields) out[key]=positive(section[key],`${label} ${symbol}`);
    if(shape==='tube'&&!(out.thickness<out.outerDiameter/2))
      throw new Error(`Tube wall thickness t must be less than D/2 = ${out.outerDiameter/2} mm. Use the solid circle for a filled section.`);
    if(shape==='box'&&!(2*out.thickness<Math.min(out.width,out.height)))
      throw new Error(`Box wall thickness t must be less than half the smaller outer dimension (${Math.min(out.width,out.height)/2} mm).`);
    if(shape==='ibeam') {
      if(!(2*out.flangeThickness<out.height)) throw new Error(`I-section flanges overlap: 2 t_f must be less than the overall depth h = ${out.height} mm.`);
      if(!(out.webThickness<=out.flangeWidth)) throw new Error('I-section web thickness t_w must not exceed the flange width b_f.');
    }
    return out;
  }

  /** Area, second moment, extreme fibre, first moment and shear factor for a section. */
  function properties(section) {
    const s=normalize(section);
    let A,I,c,Qna,bNA,width,shearFactor,widthAt,firstMoment,junctions=[],slender=[];
    if(s.shape==='rectangle') {
      const b=s.width,h=s.height;
      // Same operation order as the original rectangle-only engine: results stay bit-identical.
      A=b*h;I=b*h**3/12;c=h/2;width=b;Qna=b*h*h/8;bNA=b;shearFactor=1.5;
      widthAt=z=>Math.abs(z)<=h/2?b:0;
      firstMoment=z=>Math.abs(z)>=h/2?0:b/2*(h*h/4-z*z);
    } else if(s.shape==='circle') {
      const R=s.diameter/2;
      A=Math.PI*R*R;I=Math.PI*R**4/4;c=R;width=2*R;Qna=2*R**3/3;bNA=2*R;shearFactor=4/3;
      widthAt=z=>Math.abs(z)<R?2*Math.sqrt(R*R-z*z):0;
      firstMoment=z=>Math.abs(z)>=R?0:2/3*(R*R-z*z)**1.5;
    } else if(s.shape==='tube') {
      const R=s.outerDiameter/2,r=R-s.thickness;
      A=Math.PI*(R*R-r*r);I=Math.PI*(R**4-r**4)/4;c=R;width=2*R;Qna=2/3*(R**3-r**3);bNA=2*s.thickness;
      shearFactor=A*Qna/(I*bNA);
      widthAt=z=>{const a=Math.abs(z);if(a>=R)return 0;const outer=2*Math.sqrt(R*R-z*z);return a<r?outer-2*Math.sqrt(r*r-z*z):outer;};
      firstMoment=z=>{const a=Math.abs(z);if(a>=R)return 0;return 2/3*((R*R-z*z)**1.5-(a<r?(r*r-z*z)**1.5:0));};
      if(s.outerDiameter/s.thickness>20) slender.push(`Thin tube: D/t = ${(s.outerDiameter/s.thickness).toFixed(1)} > 20. Local shell buckling or ovalization may govern; not checked by this beam model.`);
    } else if(s.shape==='box') {
      const B=s.width,H=s.height,t=s.thickness,hi=H-2*t,bi=B-2*t;
      A=B*H-bi*hi;I=(B*H**3-bi*hi**3)/12;c=H/2;width=B;Qna=B*(H*H-hi*hi)/8+t*hi*hi/4;bNA=2*t;
      shearFactor=A*Qna/(I*bNA);junctions=[hi/2,-hi/2];
      widthAt=(z,side=0)=>{const a=Math.abs(z);if(a>H/2)return 0;if(Math.abs(a-hi/2)<1e-12*H)return side>0?B:2*t;return a>hi/2?B:2*t;};
      firstMoment=z=>{const a=Math.abs(z);if(a>=H/2)return 0;return a>=hi/2?B/2*(H*H/4-z*z):B*(H*H-hi*hi)/8+t*(hi*hi/4-z*z);};
      if(Math.max(B,H)/t>20) slender.push(`Thin box walls: ${(Math.max(B,H)/t).toFixed(1)} > 20 times the wall thickness. Local wall buckling may govern; not checked by this beam model.`);
    } else {
      const bf=s.flangeWidth,h=s.height,tf=s.flangeThickness,tw=s.webThickness,hw=h-2*tf;
      A=2*bf*tf+hw*tw;I=(bf*h**3-(bf-tw)*hw**3)/12;c=h/2;width=bf;Qna=bf*(h*h-hw*hw)/8+tw*hw*hw/8;bNA=tw;
      shearFactor=A*Qna/(I*bNA);junctions=[hw/2,-hw/2];
      widthAt=(z,side=0)=>{const a=Math.abs(z);if(a>h/2)return 0;if(Math.abs(a-hw/2)<1e-12*h)return side>0?bf:tw;return a>hw/2?bf:tw;};
      firstMoment=z=>{const a=Math.abs(z);if(a>=h/2)return 0;return a>=hw/2?bf/2*(h*h/4-z*z):bf*(h*h-hw*hw)/8+tw*(hw*hw-4*z*z)/8;};
      if(bf/2/tf>8) slender.push(`Slender flange outstand: (b_f/2)/t_f = ${(bf/2/tf).toFixed(1)} > 8. Flange local buckling may govern; not checked.`);
      if(hw/tw>30) slender.push(`Slender web: h_w/t_w = ${(hw/tw).toFixed(1)} > 30. Web buckling or crippling under point loads may govern; not checked.`);
    }
    return {shape:s.shape,label:SHAPES[s.shape].label,section:s,A,I,c,depth:2*c,width,S:I/c,Qna,bNA,shearFactor,
      junctions,slender,widthAt,firstMoment};
  }

  /** sigma(z) = -M z / I. Returns samples from the bottom fibre to the top fibre. */
  function stressProfile(props, M, n=21) {
    const out=[];
    for(let i=0;i<n;i++){const z=-props.c+2*props.c*i/(n-1);out.push({z,sigma:-M*z/props.I});}
    return out;
  }

  /**
   * tau(z) = V Q / (I b) from the bottom fibre to the top fibre. At a flange–web junction the
   * profile holds two samples at the same z (flange width, then web width, in the order met
   * when moving upward) so the jump caused by the change in b is drawn, not smoothed.
   */
  function shearProfile(props, V, n=61) {
    const tol=1e-9*props.c, points=[];
    for(let i=0;i<n;i++) {
      const z=-props.c+2*props.c*i/(n-1);
      if(!props.junctions.some(j=>Math.abs(j-z)<=tol)) points.push({z,side:0,order:0});
    }
    // side +1 = outer (flange) width, −1 = inner (web) width.
    for(const z of props.junctions) points.push({z,side:z<0?1:-1,order:0},{z,side:z<0?-1:1,order:1});
    points.sort((a,b)=>a.z-b.z||a.order-b.order);
    return points.map(({z,side})=>{
      const b=props.widthAt(z,side),Q=props.firstMoment(z);
      return {z,b,Q,tau:b>0?V*Q/(props.I*b):0};
    });
  }

  /** Mass per unit length in g/mm from density in g/cm³ (1 g/cm³ = 1e-3 g/mm³). */
  const massPerLength=(props,density)=>density*props.A/1000;
  /** Self-weight line load in N/mm: rho[g/cm³]·1e3 kg/m³ × A[mm²]·1e-6 m² × g[m/s²] / 1000 mm/m. */
  const selfWeightLine=(props,density,g=9.80665)=>density*1000*props.A*1e-6*g/1000;

  /** Sections with the same area A as the given one, using stated, fixed proportions. */
  function equalMassCandidates(A) {
    if(!(A>0)||!Number.isFinite(A)) throw new Error('Area must be positive.');
    const a=Math.sqrt(A),b=Math.sqrt(A/2),d=Math.sqrt(4*A/Math.PI),D=Math.sqrt(A/(0.09*Math.PI)),H=Math.sqrt(A/0.36),h=Math.sqrt(72*A/11);
    return [
      {name:'Solid square',rule:'b = h',section:{shape:'rectangle',width:a,height:a}},
      {name:'Solid rectangle, upright',rule:'h = 2b',section:{shape:'rectangle',width:b,height:2*b}},
      {name:'Solid circle',rule:'same area',section:{shape:'circle',diameter:d}},
      {name:'Circular tube',rule:'D/t = 10',section:{shape:'tube',outerDiameter:D,thickness:D/10}},
      {name:'Square box',rule:'B = H, H/t = 10',section:{shape:'box',width:H,height:H,thickness:H/10}},
      {name:'I-section',rule:'h = 2b_f, t_f = t_w = h/12',section:{shape:'ibeam',flangeWidth:h/2,height:h,flangeThickness:h/12,webThickness:h/12}}
    ];
  }

  function describe(section) {
    const s=normalize(section),f=v=>Number(v.toFixed(3));
    if(s.shape==='rectangle') return `Solid rectangle ${f(s.width)} × ${f(s.height)} mm (b × h)`;
    if(s.shape==='circle') return `Solid circle d = ${f(s.diameter)} mm`;
    if(s.shape==='tube') return `Circular tube D = ${f(s.outerDiameter)} mm, t = ${f(s.thickness)} mm`;
    if(s.shape==='box') return `Hollow box ${f(s.width)} × ${f(s.height)} mm (B × H), t = ${f(s.thickness)} mm`;
    return `I-section b_f = ${f(s.flangeWidth)}, h = ${f(s.height)}, t_f = ${f(s.flangeThickness)}, t_w = ${f(s.webThickness)} mm`;
  }

  return {SHAPES,MAX_DIMENSION,normalize,properties,stressProfile,shearProfile,massPerLength,selfWeightLine,equalMassCandidates,describe};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=BeamSections;
if(typeof window!=='undefined')window.BeamSections=BeamSections;
