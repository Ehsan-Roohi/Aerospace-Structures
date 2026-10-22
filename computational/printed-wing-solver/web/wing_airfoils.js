/* Wing airfoil geometry, v1. Coordinates are x/c,z/c; no aerodynamic polars.
 * Sources: NACA TR 537; PDAS naca456mean3.html / naca456thick4.html;
 * UIUC Airfoil Data Site ads.html (Selig and Lednicer conventions).
 * Coordinate imports describe one simple, single-element section. They do not
 * certify stall, aerodynamic performance, manufacturability or structural safety.
 */
const WingAirfoils = (() => {
  'use strict';
  const VERSION = 1, SAMPLE_COUNT = 161, MAX_POINTS = 2048;
  const normalized = new WeakSet();
  const cosine = n => Array.from({length:n},(_,i)=>.5*(1-Math.cos(Math.PI*i/(n-1))));
  const finite = (v,label) => {if(typeof v!=='number'||!Number.isFinite(v))throw new Error(`${label} must be finite.`);return v;};
  const text = (v,fallback,max=160) => {const s=v==null?fallback:String(v);if(s.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s))throw new Error('Airfoil metadata is too long or contains control characters.');return s;};
  function interp(x,p) {
    if(x<=p[0][0])return p[0][1];if(x>=p[p.length-1][0])return p[p.length-1][1];
    let lo=0,hi=p.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(p[m][0]<=x)lo=m;else hi=m;}
    const f=(x-p[lo][0])/(p[hi][0]-p[lo][0]);return p[lo][1]+f*(p[hi][1]-p[lo][1]);
  }
  function series(spec) {
    const raw=typeof spec==='string'?spec:spec.code;
    const m=String(raw||'').trim().match(/^(?:NACA\s*)?(\d{4}|\d{5})$/i);
    if(!m)throw new Error('Use a four-digit NACA code, or a supported non-reflex five-digit code (e.g. 23012). Other families can be loaded as DAT coordinates.');
    const code=m[1],kind=code.length===4?'naca4':'naca5';
    if(typeof spec==='object'&&spec.kind!==kind)throw new Error('Airfoil family and NACA code do not agree.');
    if(+code.slice(-2)===0)throw new Error('Airfoil thickness must be positive.');
    if(kind==='naca4'&&+code[0]&&+code[1]===0)throw new Error('A cambered NACA section needs a nonzero camber position.');
    if(kind==='naca5'&&!/^[1-9][1-5]0\d{2}$/.test(code))throw new Error('Analytic five-digit support is the non-reflex 210–250 mean-line family. Load reflex or modified sections as DAT coordinates.');
    return Object.freeze({kind,code});
  }
  function branch(points,label,{unit=true}={}) {
    if(!Array.isArray(points)||points.length<3||points.length>MAX_POINTS)throw new Error(`${label} needs 3–${MAX_POINTS} coordinate pairs.`);
    const out=[];
    for(const q of points){if(!Array.isArray(q)||q.length!==2)throw new Error(`${label} needs [x/c,z/c] pairs.`);const p=[finite(q[0],label+' x'),finite(q[1],label+' z')];
      const prev=out[out.length-1];if(prev&&Math.abs(prev[0]-p[0])<1e-12&&Math.abs(prev[1]-p[1])<1e-12)continue;
      if(prev&&p[0]<=prev[0])throw new Error(`${label} must progress monotonically from leading to trailing edge; folded or multi-element sections are not supported.`);
      if(unit&&(p[0]<-1e-8||p[0]>1+1e-8||Math.abs(p[1])>1))throw new Error(`${label} is not a normalized single airfoil.`);out.push(p);
    }
    if(out.length<3)throw new Error(`${label} has too few distinct points.`);
    if(unit&&(Math.abs(out[0][0])>1e-8||Math.abs(out[out.length-1][0]-1)>1e-8))throw new Error(`${label} must cover x/c=0 through 1.`);
    return out;
  }
  function validatePair(upper,lower) {
    if(Math.abs(upper[0][1]-lower[0][1])>1e-7)throw new Error('The upper and lower surfaces must share a closed leading edge.');
    const xs=[...new Set([...upper.map(p=>p[0]),...lower.map(p=>p[0])])].sort((a,b)=>a-b);let thick=0;
    for(const x of xs){const gap=interp(x,upper)-interp(x,lower);if(gap< -1e-9)throw new Error('Airfoil surfaces intersect or upper/lower ordering is invalid.');if(x>1e-8&&x<1-1e-8&&gap<=0)throw new Error('Airfoil has an interior zero-thickness pinch.');thick=Math.max(thick,gap);}
    if(thick<1e-4||thick>.8)throw new Error('The airfoil thickness is degenerate or outside the supported single-section range (0.01%–80% chord).');
  }
  function normalizeProfile(spec) {
    if(spec&&typeof spec==='object'&&normalized.has(spec))return spec;
    if(typeof spec==='string'||spec?.kind==='naca4'||spec?.kind==='naca5'){const p=series(spec);normalized.add(p);return p;}
    if(!spec||typeof spec!=='object'||Array.isArray(spec)||spec.kind!=='coordinates')throw new Error('Unknown airfoil profile. Use naca4, naca5, or normalized coordinates.');
    if(spec.version!=null&&spec.version!==VERSION)throw new Error('Unsupported airfoil coordinate version.');
    const upper=branch(spec.upper,'Upper surface'),lower=branch(spec.lower,'Lower surface');validatePair(upper,lower);
    const source=spec.source||{};if(typeof source!=='object'||Array.isArray(source))throw new Error('Airfoil source metadata must be an object.');
    const p={kind:'coordinates',version:VERSION,name:text(spec.name,'Imported airfoil'),upper:upper.map(Object.freeze),lower:lower.map(Object.freeze),source:{format:text(source.format,'coordinates',32),filename:text(source.filename,'',180),normalization:'unit-chord'}};
    if(source.url!=null){const url=text(source.url,'',1024);if(!/^https?:\/\//i.test(url))throw new Error('Airfoil provenance URL must use http or https.');p.source.url=url;}
    if(source.family!=null)p.source.family=text(source.family,'',80);
    Object.freeze(p.upper);Object.freeze(p.lower);Object.freeze(p.source);Object.freeze(p);normalized.add(p);return p;
  }
  function camber(spec,x) {
    const p=normalizeProfile(spec);finite(x,'Chord fraction');if(x<0||x>1)throw new Error('Chord fraction must be between 0 and 1.');
    if(p.kind==='blend'){const a=camber(p.a,x),b=camber(p.b,x);return {yc:(1-p.f)*a.yc+p.f*b.yc,slope:(1-p.f)*a.slope+p.f*b.slope};}
    if(p.kind==='coordinates'){
      const h=1e-5,a=Math.max(0,x-h),b=Math.min(1,x+h),mean=v=>(interp(v,p.upper)+interp(v,p.lower))/2;
      return {yc:mean(x),slope:(mean(b)-mean(a))/(b-a)};
    }
    if(p.kind==='naca4'){
      const m=+p.code[0]/100,pos=+p.code[1]/10;if(m===0)return {yc:0,slope:0};
      if(x<pos)return {yc:m/(pos*pos)*(2*pos*x-x*x),slope:2*m/(pos*pos)*(pos-x)};
      const q=(1-pos)*(1-pos);return {yc:m/q*(1-2*pos+2*pos*x-x*x),slope:2*m/q*(pos-x)};
    }
    const i=+p.code[1]-1,r=[.058,.126,.2025,.29,.391][i],k=[361.4,51.64,15.957,6.643,3.23][i]*(+p.code[0]/2);
    return x<r?{yc:k/6*(x**3-3*r*x*x+r*r*(3-r)*x),slope:k/6*(3*x*x-6*r*x+r*r*(3-r))}:{yc:k*r**3/6*(1-x),slope:-k*r**3/6};
  }
  function halfThickness(p,x,chord,te) {
    const t=+p.code.slice(-2)/100,natural=5*t*(.2969-.126-.3516+.2843-.1015);
    const yt=5*t*(.2969*Math.sqrt(x)-.126*x-.3516*x*x+.2843*x**3-.1015*x**4);
    return te==null?yt:yt+(te/(2*chord)-natural)*x**4;
  }
  function dimensions(chord,te,count) {
    finite(chord,'Chord');if(chord<=0)throw new Error('Chord must be positive.');if(te!=null&&(finite(te,'Trailing-edge thickness')<0))throw new Error('Trailing-edge thickness cannot be negative.');
    if(!Number.isInteger(count)||count<3||count>MAX_POINTS)throw new Error('Use 3–2048 airfoil samples.');
  }
  function surfaces(spec,chord=1,te=null,count=241) {
    const p=normalizeProfile(spec);dimensions(chord,te,count);const xs=cosine(count),xu=[],zu=[],xl=[],zl=[];
    if(p.kind==='blend'){const a=surfaces(p.a,chord,te,count),b=surfaces(p.b,chord,te,count);return Object.fromEntries(['xu','zu','xl','zl'].map(key=>[key,a[key].map((v,i)=>(1-p.f)*v+p.f*b[key][i])]));}
    if(p.kind==='coordinates'){
      const natural=p.upper[p.upper.length-1][1]-p.lower[p.lower.length-1][1],d=te==null?0:(te/chord-natural)/2;
      for(const x of xs){xu.push(x*chord);xl.push(x*chord);zu.push((interp(x,p.upper)+d*x**4)*chord);zl.push((interp(x,p.lower)-d*x**4)*chord);}
    } else for(const x of xs){const {yc,slope}=camber(p,x),th=Math.atan(slope),yt=halfThickness(p,x,chord,te);xu.push((x-yt*Math.sin(th))*chord);zu.push((yc+yt*Math.cos(th))*chord);xl.push((x+yt*Math.sin(th))*chord);zl.push((yc-yt*Math.cos(th))*chord);}
    return {xu,zu,xl,zl};
  }
  function verticalOrdinates(spec,x,chord=1,te=null) {
    const p=normalizeProfile(spec);dimensions(chord,te,3);const {yc,slope}=camber(p,x);
    if(p.kind==='blend'){const a=verticalOrdinates(p.a,x,chord,te),b=verticalOrdinates(p.b,x,chord,te);return Object.fromEntries(['upper','lower','camber'].map(key=>[key,(1-p.f)*a[key]+p.f*b[key]]));}
    if(p.kind==='coordinates'){
      const natural=p.upper[p.upper.length-1][1]-p.lower[p.lower.length-1][1],d=te==null?0:(te/chord-natural)/2;
      return {upper:(interp(x,p.upper)+d*x**4)*chord,lower:(interp(x,p.lower)-d*x**4)*chord,camber:yc*chord};
    }
    const vh=halfThickness(p,x,chord,te)*Math.cos(Math.atan(slope));return {lower:(yc-vh)*chord,camber:yc*chord,upper:(yc+vh)*chord};
  }
  // Import rotates the chord from the foremost point to the midpoint of the
  // two trailing-edge endpoints onto x, then translates/scales to unit chord.
  // Monotone input is preserved; never sort points to conceal a folded contour.
  function canonicalize(a,b,meta) {
    if(a.length<3||b.length<3)throw new Error('Each DAT surface needs at least three points.');
    const all=[...a,...b],minX=Math.min(...all.map(p=>p[0]));
    const le=all.filter(p=>Math.abs(p[0]-minX)<1e-10).reduce((r,p,_,v)=>[r[0]+p[0]/v.length,r[1]+p[1]/v.length],[0,0]);
    const ends=[a[a.length-1],b[b.length-1]],te=[(ends[0][0]+ends[1][0])/2,(ends[0][1]+ends[1][1])/2];
    const dx=te[0]-le[0],dz=te[1]-le[1],length2=dx*dx+dz*dz;if(!(length2>1e-16))throw new Error('Cannot determine a nonzero DAT chord.');
    const transform=p=>[((p[0]-le[0])*dx+(p[1]-le[1])*dz)/length2,(-(p[0]-le[0])*dz+(p[1]-le[1])*dx)/length2];
    let aa=a.map(transform),bb=b.map(transform);
    // Finite-thickness TE endpoints can have unequal chordwise positions;
    // project only these endpoints onto x/c=1, retaining their z coordinates.
    for(const arr of [aa,bb]){if(Math.abs(arr[0][0])>.005||Math.abs(arr[arr.length-1][0]-1)>.01)throw new Error('DAT surfaces do not share a leading edge and trailing-edge chord.');arr[0]=[0,arr[0][1]];arr[arr.length-1]=[1,arr[arr.length-1][1]];}
    if(Math.abs(aa[0][1]-bb[0][1])>1e-5)throw new Error('DAT leading edge is open.');aa[0]=bb[0]=[0,0];
    aa=branch(aa,'DAT first surface');bb=branch(bb,'DAT second surface');
    if(interp(.4,aa)<interp(.4,bb))[aa,bb]=[bb,aa];validatePair(aa,bb);
    const xs=cosine(SAMPLE_COUNT),upper=xs.map(x=>[x,interp(x,aa)]),lower=xs.map(x=>[x,interp(x,bb)]);
    return normalizeProfile({kind:'coordinates',version:VERSION,name:meta.name,upper,lower,source:meta.source});
  }
  function parseDat(input,options={}) {
    if(typeof input!=='string'||input.length>262144)throw new Error('Choose a plain-text DAT file smaller than 256 KiB.');
    const rows=[];let name='',first=true;
    for(const [i,line] of input.replace(/^\uFEFF/,'').replace(/\x1a\s*$/,'').split(/\r?\n/).entries()){
      const s=line.replace(/#.*$/,'').trim();if(!s)continue;
      const tokens=s.split(/[\s,]+/),pair=tokens.length===2&&tokens.every(v=>/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eEdD][+-]?\d+)?$/.test(v));
      if(!pair){if(first){name=text(s,'Imported airfoil');first=false;continue;}throw new Error(`DAT line ${i+1}: expected exactly two finite coordinates.`);}
      first=false;const p=tokens.map(v=>Number(v.replace(/[dD]/,'e')));p.forEach(v=>finite(v,'DAT coordinate'));rows.push(p);
    }
    if(rows.length<5||rows.length>MAX_POINTS*2+1)throw new Error('DAT needs at least five coordinates (three per surface, with a shared leading edge) and no more than 4096 points.');
    let a,b,format;const n=rows[0];
    if(n.every(v=>Number.isInteger(v)&&v>=3)&&n[0]+n[1]===rows.length-1){format='lednicer';a=rows.slice(1,n[0]+1);b=rows.slice(n[0]+1);}
    else {
      if(n.some(v=>v>2)&&n.every(v=>Number.isInteger(v)&&v>=3))throw new Error('Lednicer surface counts do not match the coordinate rows.');
      format='selig';const min=Math.min(...rows.map(p=>p[0])),k=rows.findIndex(p=>p[0]===min),max=Math.max(...rows.map(p=>p[0]));
      if(k<2||k>rows.length-3||rows[0][0]<min+.9*(max-min)||rows[rows.length-1][0]<min+.9*(max-min))throw new Error('Selig DAT must start at one trailing edge, wrap once around the leading edge, and end at the other trailing edge.');
      a=rows.slice(0,k+1).reverse();b=rows.slice(k);
    }
    const source={format,filename:options.filename||'',normalization:'unit-chord'};if(options.sourceUrl)source.url=options.sourceUrl;if(options.family)source.family=options.family;
    return canonicalize(a,b,{name:name||options.name||'Imported airfoil',source});
  }
  function blendProfiles(a,b,f,count=SAMPLE_COUNT) {
    finite(f,'Airfoil interpolation fraction');if(f<0||f>1)throw new Error('Airfoil interpolation fraction must lie between 0 and 1.');a=normalizeProfile(a);b=normalizeProfile(b);
    if(f===0)return a;if(f===1)return b;if(a===b||JSON.stringify(a)===JSON.stringify(b))return a;
    dimensions(1,null,count);
    // Runtime-only blend, never an external JSON profile. Interpolate actual
    // aligned surface points, not vertical ordinates converted into a new
    // profile: that conversion would jump at analytic NACA station endpoints.
    // Endpoints remain their exact specified profiles and share cosine sample
    // parameters. Their positive thickness vectors blend continuously.
    const p=Object.freeze({kind:'blend',a,b,f});normalized.add(p);return p;
  }
  function profileAt(stations,eta) {
    if(!Array.isArray(stations)||stations.length<2)throw new Error('Airfoil stations need root and tip.');finite(eta,'Span fraction');
    if(eta<=stations[0].eta)return normalizeProfile(stations[0].airfoil);if(eta>=stations[stations.length-1].eta)return normalizeProfile(stations[stations.length-1].airfoil);
    for(let i=1;i<stations.length;i++)if(eta<=stations[i].eta){const a=stations[i-1],b=stations[i];if(!(b.eta>a.eta))throw new Error('Airfoil station positions must increase.');return blendProfiles(a.airfoil,b.airfoil,(eta-a.eta)/(b.eta-a.eta));}
    throw new Error('Cannot locate airfoil station.');
  }
  const SOURCES=Object.freeze({dat:'https://m-selig.ae.illinois.edu/ads.html',database:'https://m-selig.ae.illinois.edu/ads/coord_database.html',naca5:'https://www.pdas.com/naca456mean3.html',nacaThickness:'https://www.pdas.com/naca456thick4.html',nacaReport:'https://ntrs.nasa.gov/citations/19930091610'});
  // CURATED_DATA is inserted below from the cited UIUC coordinate files.
  const CURATED_DATA = {"ag24":"AG24 Bubble Dancer DLG by Mark Drela | The AG2x airfoils are intended to be used on composite versions of the Bubble Dancer and the Allegro-Lite.\r\n     1.000000    0.000312\r\n     0.994048    0.001043\r\n     0.982038    0.002630\r\n     0.968488    0.004486\r\n     0.954647    0.006421\r\n     0.940769    0.008378\r\n     0.926890    0.010328\r\n     0.913006    0.012258\r\n     0.899118    0.014165\r\n     0.885230    0.016048\r\n     0.871339    0.017908\r\n     0.857451    0.019744\r\n     0.843559    0.021562\r\n     0.829670    0.023357\r\n     0.815779    0.025130\r\n     0.801883    0.026879\r\n     0.787989    0.028602\r\n     0.774091    0.030297\r\n     0.760188    0.031964\r\n     0.746285    0.033600\r\n     0.732376    0.035204\r\n     0.718461    0.036776\r\n     0.704547    0.038313\r\n     0.690631    0.039813\r\n     0.676709    0.041277\r\n     0.662788    0.042702\r\n     0.648868    0.044087\r\n     0.634943    0.045432\r\n     0.621017    0.046736\r\n     0.607093    0.047997\r\n     0.593166    0.049214\r\n     0.579236    0.050389\r\n     0.565310    0.051517\r\n     0.551385    0.052600\r\n     0.537456    0.053635\r\n     0.523528    0.054622\r\n     0.509606    0.055558\r\n     0.495682    0.056443\r\n     0.481756    0.057276\r\n     0.467835    0.058053\r\n     0.453918    0.058774\r\n     0.440000    0.059437\r\n     0.426087    0.060040\r\n     0.412180    0.060579\r\n     0.398274    0.061053\r\n     0.384372    0.061458\r\n     0.370481    0.061792\r\n     0.356594    0.062050\r\n     0.342711    0.062231\r\n     0.328841    0.062328\r\n     0.314984    0.062338\r\n     0.301131    0.062254\r\n     0.287296    0.062074\r\n     0.273479    0.061789\r\n     0.259672    0.061394\r\n     0.245889    0.060883\r\n     0.232132    0.060248\r\n     0.218395    0.059480\r\n     0.204696    0.058572\r\n     0.191034    0.057514\r\n     0.177412    0.056295\r\n     0.163854    0.054904\r\n     0.150354    0.053325\r\n     0.136934    0.051545\r\n     0.123613    0.049542\r\n     0.110400    0.047296\r\n     0.097342    0.044784\r\n     0.084457    0.041971\r\n     0.071816    0.038832\r\n     0.059466    0.035323\r\n     0.047533    0.031413\r\n     0.036200    0.027083\r\n     0.025838    0.022393\r\n     0.017129    0.017634\r\n     0.010712    0.013341\r\n     0.006482    0.009857\r\n     0.003763    0.007107\r\n     0.001997    0.004865\r\n     0.000855    0.002963\r\n     0.000198    0.001287\r\n     0.000001   -0.000230\r\n     0.000293   -0.001719\r\n     0.001184   -0.003235\r\n     0.002714   -0.004738\r\n     0.004994   -0.006301\r\n     0.008364   -0.008034\r\n     0.013488   -0.010053\r\n     0.021193   -0.012377\r\n     0.031412   -0.014726\r\n     0.043212   -0.016796\r\n     0.055804   -0.018519\r\n     0.068780   -0.019918\r\n     0.081987   -0.021042\r\n     0.095351   -0.021938\r\n     0.108824   -0.022639\r\n     0.122377   -0.023175\r\n     0.135989   -0.023565\r\n     0.149652   -0.023827\r\n     0.163351   -0.023977\r\n     0.177085   -0.024026\r\n     0.190844   -0.023986\r\n     0.204622   -0.023867\r\n     0.218421   -0.023675\r\n     0.232237   -0.023420\r\n     0.246064   -0.023106\r\n     0.259909   -0.022740\r\n     0.273764   -0.022326\r\n     0.287631   -0.021871\r\n     0.301514   -0.021381\r\n     0.315408   -0.020856\r\n     0.329313   -0.020301\r\n     0.343234   -0.019718\r\n     0.357166   -0.019111\r\n     0.371111   -0.018482\r\n     0.385067   -0.017835\r\n     0.399034   -0.017173\r\n     0.413004   -0.016498\r\n     0.426962   -0.015813\r\n     0.440907   -0.015121\r\n     0.454842   -0.014424\r\n     0.468769   -0.013723\r\n     0.482685   -0.013021\r\n     0.496593   -0.012319\r\n     0.510494   -0.011617\r\n     0.524394   -0.010919\r\n     0.538286   -0.010224\r\n     0.552174   -0.009535\r\n     0.566059   -0.008852\r\n     0.579942   -0.008177\r\n     0.593817   -0.007511\r\n     0.607689   -0.006857\r\n     0.621556   -0.006214\r\n     0.635419   -0.005585\r\n     0.649276   -0.004971\r\n     0.663131   -0.004372\r\n     0.676986   -0.003788\r\n     0.690839   -0.003221\r\n     0.704693   -0.002670\r\n     0.718548   -0.002136\r\n     0.732407   -0.001619\r\n     0.746265   -0.001122\r\n     0.760127   -0.000645\r\n     0.773993   -0.000194\r\n     0.787859    0.000230\r\n     0.801731    0.000622\r\n     0.815611    0.000975\r\n     0.829491    0.001286\r\n     0.843374    0.001550\r\n     0.857263    0.001759\r\n     0.871153    0.001909\r\n     0.885046    0.001991\r\n     0.898943    0.001997\r\n     0.912839    0.001920\r\n     0.926737    0.001758\r\n     0.940634    0.001501\r\n     0.954532    0.001149\r\n     0.968401    0.000707\r\n     0.982019    0.000185\r\n     0.994039   -0.000364\r\n     1.000000   -0.000659\r\n","e205":"E205  (10.48%)               \r\n   1.00000  0.00000\r\n   0.99655  0.00039\r\n   0.98649  0.00174\r\n   0.97049  0.00427\r\n   0.94916  0.00778\r\n   0.92285  0.01196\r\n   0.89175  0.01668\r\n   0.85624  0.02199\r\n   0.81684  0.02786\r\n   0.77412  0.03419\r\n   0.72866  0.04088\r\n   0.68108  0.04777\r\n   0.63204  0.05470\r\n   0.58218  0.06147\r\n   0.53217  0.06782\r\n   0.48265  0.07342\r\n   0.43410  0.07785\r\n   0.38680  0.08081\r\n   0.34101  0.08214\r\n   0.29699  0.08177\r\n   0.25496  0.07970\r\n   0.21508  0.07606\r\n   0.17764  0.07111\r\n   0.14302  0.06507\r\n   0.11157  0.05811\r\n   0.08360  0.05040\r\n   0.05937  0.04211\r\n   0.03909  0.03344\r\n   0.02292  0.02461\r\n   0.01097  0.01589\r\n   0.00331  0.00766\r\n   0.00002  0.00055\r\n   0.00233 -0.00506\r\n   0.01065 -0.00988\r\n   0.02419 -0.01420\r\n   0.04291 -0.01776\r\n   0.06669 -0.02053\r\n   0.09534 -0.02252\r\n   0.12864 -0.02378\r\n   0.16627 -0.02436\r\n   0.20783 -0.02435\r\n   0.25290 -0.02384\r\n   0.30097 -0.02292\r\n   0.35149 -0.02168\r\n   0.40388 -0.02021\r\n   0.45751 -0.01859\r\n   0.51174 -0.01689\r\n   0.56591 -0.01516\r\n   0.61938 -0.01345\r\n   0.67149 -0.01180\r\n   0.72160 -0.01023\r\n   0.76911 -0.00876\r\n   0.81343 -0.00740\r\n   0.85400 -0.00614\r\n   0.89034 -0.00497\r\n   0.92195 -0.00380\r\n   0.94860 -0.00252\r\n   0.97017 -0.00125\r\n   0.98635 -0.00036\r\n   0.99651 -0.00003\r\n   1.00000  0.00000\r\n","naca632615":"NACA 63(2)-615\r\n1.00000     0.00000\r\n0.95042     0.01245\r\n0.90089     0.02398\r\n0.85127     0.03555\r\n0.80153     0.04693\r\n0.75163     0.05800\r\n0.70159     0.06847\r\n0.65139     0.07809\r\n0.60105     0.08665\r\n0.55058     0.09393\r\n0.50000     0.09974\r\n0.44932     0.10384\r\n0.39857     0.10598\r\n0.34778     0.10587\r\n0.29700     0.10331\r\n0.24625     0.09830\r\n0.19558     0.09066\r\n0.14504     0.08010\r\n0.09473     0.06578\r\n0.06973     0.05667\r\n0.04492     0.04560\r\n0.02050     0.03129\r\n0.00866     0.02159\r\n0.00418     0.01634\r\n0.00205     0.01317\r\n0.00000     0.00000\r\n0.00795     -0.01017\r\n0.01082     -0.01214\r\n0.01634     -0.01517\r\n0.02950     -0.02013\r\n0.05508     -0.02664\r\n0.08027     -0.03123\r\n0.10527     -0.03476\r\n0.15496     -0.03972\r\n0.20442     -0.04290\r\n0.25375     -0.04460\r\n0.30300     -0.04499\r\n0.35222     -0.04407\r\n0.40143     -0.04172\r\n0.45068     -0.03814\r\n0.50000     -0.03356\r\n0.54942     -0.02823\r\n0.59895     -0.02239\r\n0.64861     -0.01629\r\n0.69841     -0.01015\r\n0.74837     -0.00430\r\n0.79847     0.00083\r\n0.84873     0.00483\r\n0.89911     0.00704\r\n0.94958     0.00651\r\n1.00000     0.00000\r\n","s1223":"  S1223\r\n  1.00000     0.00000\r\n  0.99838     0.00126\r\n  0.99417     0.00494\r\n  0.98825     0.01037\r\n  0.98075     0.01646\r\n  0.97111     0.02250\r\n  0.95884     0.02853\r\n  0.94389     0.03476\r\n  0.92639     0.04116\r\n  0.90641     0.04768\r\n  0.88406     0.05427\r\n  0.85947     0.06089\r\n  0.83277     0.06749\r\n  0.80412     0.07402\r\n  0.77369     0.08044\r\n  0.74166     0.08671\r\n  0.70823     0.09277\r\n  0.67360     0.09859\r\n  0.63798     0.10412\r\n  0.60158     0.10935\r\n  0.56465     0.11425\r\n  0.52744     0.11881\r\n  0.49025     0.12303\r\n  0.45340     0.12683\r\n  0.41721     0.13011\r\n  0.38193     0.13271\r\n  0.34777     0.13447\r\n  0.31488     0.13526\r\n  0.28347     0.13505\r\n  0.25370     0.13346\r\n  0.22541     0.13037\r\n  0.19846     0.12594\r\n  0.17286     0.12026\r\n  0.14863     0.11355\r\n  0.12591     0.10598\r\n  0.10482     0.09770\r\n  0.08545     0.08879\r\n  0.06789     0.07940\r\n  0.05223     0.06965\r\n  0.03855     0.05968\r\n  0.02694     0.04966\r\n  0.01755     0.03961\r\n  0.01028     0.02954\r\n  0.00495     0.01969\r\n  0.00155     0.01033\r\n  0.00005     0.00178\r\n  0.00044    -0.00561\r\n  0.00264    -0.01120\r\n  0.00789    -0.01427\r\n  0.01718    -0.01550\r\n  0.03006    -0.01584\r\n  0.04627    -0.01532\r\n  0.06561    -0.01404\r\n  0.08787    -0.01202\r\n  0.11282    -0.00925\r\n  0.14020    -0.00563\r\n  0.17006    -0.00075\r\n  0.20278     0.00535\r\n  0.23840     0.01213\r\n  0.27673     0.01928\r\n  0.31750     0.02652\r\n  0.36044     0.03358\r\n  0.40519     0.04021\r\n  0.45139     0.04618\r\n  0.49860     0.05129\r\n  0.54639     0.05534\r\n  0.59428     0.05820\r\n  0.64176     0.05976\r\n  0.68832     0.05994\r\n  0.73344     0.05872\r\n  0.77660     0.05612\r\n  0.81729     0.05219\r\n  0.85500     0.04706\r\n  0.88928     0.04088\r\n  0.91966     0.03387\r\n  0.94573     0.02624\r\n  0.96693     0.01822\r\n  0.98255     0.01060\r\n  0.99268     0.00468\r\n  0.99825     0.00115\r\n  1.00000     0.00000\r\n","sc20412":"NASA SC(2)-0412 AIRFOIL\r\n      103.      103.\r\n\r\n 0.000000  0.000000\r\n 0.002000  0.009200\r\n 0.005000  0.014100\r\n 0.010000  0.019000\r\n 0.020000  0.025300\r\n 0.030000  0.029700\r\n 0.040000  0.033000\r\n 0.050000  0.035700\r\n 0.060000  0.038000\r\n 0.070000  0.040000\r\n 0.080000  0.041800\r\n 0.090000  0.043400\r\n 0.100000  0.044800\r\n 0.110000  0.046100\r\n 0.120000  0.047300\r\n 0.130000  0.048400\r\n 0.140000  0.049400\r\n 0.150000  0.050400\r\n 0.160000  0.051300\r\n 0.170000  0.052200\r\n 0.180000  0.053000\r\n 0.190000  0.053700\r\n 0.200000  0.054400\r\n 0.210000  0.055000\r\n 0.220000  0.055600\r\n 0.230000  0.056200\r\n 0.240000  0.056700\r\n 0.250000  0.057100\r\n 0.260000  0.057500\r\n 0.270000  0.057900\r\n 0.280000  0.058300\r\n 0.290000  0.058600\r\n 0.300000  0.058900\r\n 0.310000  0.059100\r\n 0.320000  0.059300\r\n 0.330000  0.059500\r\n 0.340000  0.059700\r\n 0.350000  0.059800\r\n 0.360000  0.059900\r\n 0.370000  0.060000\r\n 0.380000  0.060100\r\n 0.390000  0.060100\r\n 0.400000  0.060100\r\n 0.410000  0.060100\r\n 0.420000  0.060100\r\n 0.430000  0.060000\r\n 0.440000  0.059900\r\n 0.450000  0.059800\r\n 0.460000  0.059700\r\n 0.470000  0.059500\r\n 0.480000  0.059300\r\n 0.490000  0.059100\r\n 0.500000  0.058800\r\n 0.510000  0.058500\r\n 0.520000  0.058200\r\n 0.530000  0.057800\r\n 0.540000  0.057400\r\n 0.550000  0.057000\r\n 0.560000  0.056500\r\n 0.570000  0.056000\r\n 0.580000  0.055500\r\n 0.590000  0.054900\r\n 0.600000  0.054300\r\n 0.610000  0.053600\r\n 0.620000  0.052900\r\n 0.630000  0.052200\r\n 0.640000  0.051400\r\n 0.650000  0.050600\r\n 0.660000  0.049700\r\n 0.670000  0.048800\r\n 0.680000  0.047900\r\n 0.690000  0.046900\r\n 0.700000  0.045900\r\n 0.710000  0.044900\r\n 0.720000  0.043900\r\n 0.730000  0.042800\r\n 0.740000  0.041700\r\n 0.750000  0.040600\r\n 0.760000  0.039400\r\n 0.770000  0.038200\r\n 0.780000  0.037000\r\n 0.790000  0.035800\r\n 0.800000  0.034500\r\n 0.810000  0.033200\r\n 0.820000  0.031900\r\n 0.830000  0.030600\r\n 0.840000  0.029200\r\n 0.850000  0.027800\r\n 0.860000  0.026400\r\n 0.870000  0.025000\r\n 0.880000  0.023500\r\n 0.890000  0.022000\r\n 0.900000  0.020500\r\n 0.910000  0.019000\r\n 0.920000  0.017400\r\n 0.930000  0.015800\r\n 0.940000  0.014200\r\n 0.950000  0.012500\r\n 0.960000  0.010800\r\n 0.970000  0.009000\r\n 0.980000  0.007200\r\n 0.990000  0.005300\r\n 1.000000  0.003300\r\n\r\n 0.000000  0.000000\r\n 0.002000 -0.009200\r\n 0.005000 -0.014100\r\n 0.010000 -0.019000\r\n 0.020000 -0.025300\r\n 0.030000 -0.029600\r\n 0.040000 -0.032900\r\n 0.050000 -0.035600\r\n 0.060000 -0.037900\r\n 0.070000 -0.040000\r\n 0.080000 -0.041800\r\n 0.090000 -0.043400\r\n 0.100000 -0.044900\r\n 0.110000 -0.046300\r\n 0.120000 -0.047600\r\n 0.130000 -0.048800\r\n 0.140000 -0.049900\r\n 0.150000 -0.050900\r\n 0.160000 -0.051800\r\n 0.170000 -0.052700\r\n 0.180000 -0.053500\r\n 0.190000 -0.054200\r\n 0.200000 -0.054900\r\n 0.210000 -0.055500\r\n 0.220000 -0.056100\r\n 0.230000 -0.056700\r\n 0.240000 -0.057200\r\n 0.250000 -0.057700\r\n 0.260000 -0.058100\r\n 0.270000 -0.058500\r\n 0.280000 -0.058800\r\n 0.290000 -0.059100\r\n 0.300000 -0.059300\r\n 0.310000 -0.059500\r\n 0.320000 -0.059700\r\n 0.330000 -0.059800\r\n 0.340000 -0.059900\r\n 0.350000 -0.060000\r\n 0.360000 -0.060000\r\n 0.370000 -0.060000\r\n 0.380000 -0.059900\r\n 0.390000 -0.059800\r\n 0.400000 -0.059600\r\n 0.410000 -0.059400\r\n 0.420000 -0.059200\r\n 0.430000 -0.058900\r\n 0.440000 -0.058600\r\n 0.450000 -0.058200\r\n 0.460000 -0.057800\r\n 0.470000 -0.057300\r\n 0.480000 -0.056800\r\n 0.490000 -0.056200\r\n 0.500000 -0.055500\r\n 0.510000 -0.054700\r\n 0.520000 -0.053900\r\n 0.530000 -0.053000\r\n 0.540000 -0.052000\r\n 0.550000 -0.050900\r\n 0.560000 -0.049800\r\n 0.570000 -0.048600\r\n 0.580000 -0.047300\r\n 0.590000 -0.045900\r\n 0.600000 -0.044400\r\n 0.610000 -0.042900\r\n 0.620000 -0.041300\r\n 0.630000 -0.039700\r\n 0.640000 -0.038000\r\n 0.650000 -0.036200\r\n 0.660000 -0.034400\r\n 0.670000 -0.032600\r\n 0.680000 -0.030700\r\n 0.690000 -0.028800\r\n 0.700000 -0.026900\r\n 0.710000 -0.025000\r\n 0.720000 -0.023100\r\n 0.730000 -0.021200\r\n 0.740000 -0.019300\r\n 0.750000 -0.017400\r\n 0.760000 -0.015500\r\n 0.770000 -0.013700\r\n 0.780000 -0.011900\r\n 0.790000 -0.010200\r\n 0.800000 -0.008500\r\n 0.810000 -0.006800\r\n 0.820000 -0.005200\r\n 0.830000 -0.003700\r\n 0.840000 -0.002300\r\n 0.850000 -0.000900\r\n 0.860000  0.000300\r\n 0.870000  0.001400\r\n 0.880000  0.002400\r\n 0.890000  0.003200\r\n 0.900000  0.003800\r\n 0.910000  0.004300\r\n 0.920000  0.004500\r\n 0.930000  0.004500\r\n 0.940000  0.004200\r\n 0.950000  0.003800\r\n 0.960000  0.003100\r\n 0.970000  0.002200\r\n 0.980000  0.001000\r\n 0.990000 -0.000500\r\n 1.000000 -0.002200\r\n","clarky":" CLARK Y AIRFOIL\r\n      61.0      61.0\r\n \r\n 0.0000000 0.0000000\r\n 0.0005000 0.0023390\r\n 0.0010000 0.0037271\r\n 0.0020000 0.0058025\r\n 0.0040000 0.0089238\r\n 0.0080000 0.0137350\r\n 0.0120000 0.0178581\r\n 0.0200000 0.0253735\r\n 0.0300000 0.0330215\r\n 0.0400000 0.0391283\r\n 0.0500000 0.0442753\r\n 0.0600000 0.0487571\r\n 0.0800000 0.0564308\r\n 0.1000000 0.0629981\r\n 0.1200000 0.0686204\r\n 0.1400000 0.0734360\r\n 0.1600000 0.0775707\r\n 0.1800000 0.0810687\r\n 0.2000000 0.0839202\r\n 0.2200000 0.0861433\r\n 0.2400000 0.0878308\r\n 0.2600000 0.0890840\r\n 0.2800000 0.0900016\r\n 0.3000000 0.0906804\r\n 0.3200000 0.0911857\r\n 0.3400000 0.0915079\r\n 0.3600000 0.0916266\r\n 0.3800000 0.0915212\r\n 0.4000000 0.0911712\r\n 0.4200000 0.0905657\r\n 0.4400000 0.0897175\r\n 0.4600000 0.0886427\r\n 0.4800000 0.0873572\r\n 0.5000000 0.0858772\r\n 0.5200000 0.0842145\r\n 0.5400000 0.0823712\r\n 0.5600000 0.0803480\r\n 0.5800000 0.0781451\r\n 0.6000000 0.0757633\r\n 0.6200000 0.0732055\r\n 0.6400000 0.0704822\r\n 0.6600000 0.0676046\r\n 0.6800000 0.0645843\r\n 0.7000000 0.0614329\r\n 0.7200000 0.0581599\r\n 0.7400000 0.0547675\r\n 0.7600000 0.0512565\r\n 0.7800000 0.0476281\r\n 0.8000000 0.0438836\r\n 0.8200000 0.0400245\r\n 0.8400000 0.0360536\r\n 0.8600000 0.0319740\r\n 0.8800000 0.0277891\r\n 0.9000000 0.0235025\r\n 0.9200000 0.0191156\r\n 0.9400000 0.0146239\r\n 0.9600000 0.0100232\r\n 0.9700000 0.0076868\r\n 0.9800000 0.0053335\r\n 0.9900000 0.0029690\r\n 1.0000000 0.0005993\r\n \r\n 0.0000000 0.0000000\r\n 0.0005000 -.0046700\r\n 0.0010000 -.0059418\r\n 0.0020000 -.0078113\r\n 0.0040000 -.0105126\r\n 0.0080000 -.0142862\r\n 0.0120000 -.0169733\r\n 0.0200000 -.0202723\r\n 0.0300000 -.0226056\r\n 0.0400000 -.0245211\r\n 0.0500000 -.0260452\r\n 0.0600000 -.0271277\r\n 0.0800000 -.0284595\r\n 0.1000000 -.0293786\r\n 0.1200000 -.0299633\r\n 0.1400000 -.0302404\r\n 0.1600000 -.0302546\r\n 0.1800000 -.0300490\r\n 0.2000000 -.0296656\r\n 0.2200000 -.0291445\r\n 0.2400000 -.0285181\r\n 0.2600000 -.0278164\r\n 0.2800000 -.0270696\r\n 0.3000000 -.0263079\r\n 0.3200000 -.0255565\r\n 0.3400000 -.0248176\r\n 0.3600000 -.0240870\r\n 0.3800000 -.0233606\r\n 0.4000000 -.0226341\r\n 0.4200000 -.0219042\r\n 0.4400000 -.0211708\r\n 0.4600000 -.0204353\r\n 0.4800000 -.0196986\r\n 0.5000000 -.0189619\r\n 0.5200000 -.0182262\r\n 0.5400000 -.0174914\r\n 0.5600000 -.0167572\r\n 0.5800000 -.0160232\r\n 0.6000000 -.0152893\r\n 0.6200000 -.0145551\r\n 0.6400000 -.0138207\r\n 0.6600000 -.0130862\r\n 0.6800000 -.0123515\r\n 0.7000000 -.0116169\r\n 0.7200000 -.0108823\r\n 0.7400000 -.0101478\r\n 0.7600000 -.0094133\r\n 0.7800000 -.0086788\r\n 0.8000000 -.0079443\r\n 0.8200000 -.0072098\r\n 0.8400000 -.0064753\r\n 0.8600000 -.0057408\r\n 0.8800000 -.0050063\r\n 0.9000000 -.0042718\r\n 0.9200000 -.0035373\r\n 0.9400000 -.0028028\r\n 0.9600000 -.0020683\r\n 0.9700000 -.0017011\r\n 0.9800000 -.0013339\r\n 0.9900000 -.0009666\r\n 1.0000000 -.0005993\r\n"};
  const catalog = Object.freeze([
    {id:'naca0012',name:'NACA 0012',family:'NACA 4-digit · symmetric',profile:{kind:'naca4',code:'0012'}},
    {id:'naca2412',name:'NACA 2412',family:'NACA 4-digit · cambered',profile:{kind:'naca4',code:'2412'}},
    {id:'naca4415',name:'NACA 4415',family:'NACA 4-digit · cambered',profile:{kind:'naca4',code:'4415'}},
    {id:'naca23012',name:'NACA 23012',family:'NACA 5-digit · non-reflex',profile:{kind:'naca5',code:'23012'}},
    {id:'naca632615',name:'NACA 63(2)-615',family:'NACA 6-series · coordinate data'},
    {id:'sc20412',name:'NASA SC(2)-0412',family:'NASA supercritical · coordinate data'},
    {id:'clarky',name:'Clark Y',family:'Clark · coordinate data'},
    {id:'e205',name:'Eppler 205',family:'Eppler · coordinate data'},
    {id:'ag24',name:'Drela AG24',family:'Drela · coordinate data'},
    {id:'s1223',name:'Selig S1223',family:'Selig · coordinate data'}
  ].map(p=>Object.freeze({...p,url:p.profile?(p.profile.kind==='naca5'?SOURCES.naca5:SOURCES.nacaThickness):`https://m-selig.ae.illinois.edu/ads/coord/${p.id}.dat`})));
  const presetCache=new Map();
  function preset(id) {const entry=catalog.find(p=>p.id===id);if(!entry)throw new Error('Unknown airfoil library entry.');if(!presetCache.has(id))presetCache.set(id,entry.profile?normalizeProfile(entry.profile):parseDat(CURATED_DATA[id],{filename:id+'.dat',sourceUrl:entry.url,family:entry.family}));return presetCache.get(id);}
  return Object.freeze({VERSION,SAMPLE_COUNT,SOURCES,catalog,preset,normalizeProfile,parseDat,surfaces,verticalOrdinates,camber,blendProfiles,profileAt});
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WingAirfoils;
