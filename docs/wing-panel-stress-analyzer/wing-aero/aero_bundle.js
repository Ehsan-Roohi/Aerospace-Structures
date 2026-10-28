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

;
/* Station-based semi-wing geometry. Units mm, degrees, x aft / y projected span / z up.
 * Conventions follow NASA OpenVSP's default unrotated-to-dihedral section layout:
 * sections remain in aircraft x-z planes; sweep is measured at an explicit x/c;
 * incidence is absolute, positive nose-up, about an explicit chord reference.
 * https://www.nasa.gov/reference/openvsp-wings/
 * Geometric twist changes incidence; changing spanwise airfoil is aerodynamic twist,
 * not a prediction of its zero-lift angle or resulting lift distribution (NASA SP-367).
 * This module defines geometry, not a swept/curved beam structural formulation.
 */
const WingGeometry = (() => {
  'use strict';
  const A = typeof WingAirfoils !== 'undefined' ? WingAirfoils : (typeof require === 'function' ? require('./wing_airfoils.js') : null);
  const LIMITS = Object.freeze({stations:9, sweepDeg:60, dihedralDeg:45, incidenceDeg:30});
  const deg = Math.PI / 180;
  const finite = (v, name, lo, hi) => {
    if (!Number.isFinite(v) || v < lo || v > hi) throw Error(`${name} must be finite and between ${lo} and ${hi}.`);
    return v;
  };
  function normalizeGeometryFields(g) {
    const out = {};
    if(g.planform!=null){if(!['linear','elliptic','delta'].includes(g.planform))throw Error('Choose linear, elliptic or delta planform.');out.planform=g.planform;}
    for (const [name, limit] of [['sweepDeg',LIMITS.sweepDeg],['dihedralDeg',LIMITS.dihedralDeg]]) {
      if (Object.hasOwn(g,name)) out[name] = finite(g[name], name, -limit, limit);
    }
    for (const name of ['sweepReferenceFraction','twistReferenceFraction']) {
      if (Object.hasOwn(g,name)) out[name] = finite(g[name], name, 0, 1);
    }
    if(g.planform==='elliptic'&&(g.tipChord===0||!Object.hasOwn(g,'sweepReferenceFraction')))out.sweepReferenceFraction=.5;
    if(g.planform==='delta')out.sweepReferenceFraction=1;
    if (Object.hasOwn(g,'twistEnabled')) {
      if (typeof g.twistEnabled !== 'boolean') throw Error('twistEnabled must be true or false.');
      out.twistEnabled = g.twistEnabled;
    }
    if (g.airfoil != null) out.airfoil = A.normalizeProfile(g.airfoil);
    if (g.stations != null) {
      if (!Array.isArray(g.stations) || g.stations.length < 2 || g.stations.length > LIMITS.stations)
        throw Error(`Use 2–${LIMITS.stations} wing stations including the root and tip.`);
      out.stations = Object.freeze(g.stations.map((s,i) => {
        if (!s || typeof s !== 'object' || Array.isArray(s) || Object.keys(s).some(k => !['eta','airfoil','incidenceDeg'].includes(k)))
          throw Error(`Wing station ${i+1}: use eta, airfoil and incidenceDeg only.`);
        const eta = finite(s.eta, `Wing station ${i+1} eta`, 0, 1);
        if (i && eta <= g.stations[i-1].eta) throw Error('Wing stations must be strictly increasing from eta = 0 to eta = 1.');
        if (i && (eta-g.stations[i-1].eta)*g.semiSpan < .1-1e-8) throw Error('Distinct wing stations must be separated by at least 0.1 mm.');
        return Object.freeze({eta, airfoil:A.normalizeProfile(s.airfoil), incidenceDeg:finite(s.incidenceDeg ?? 0, `Wing station ${i+1} incidenceDeg`, -LIMITS.incidenceDeg, LIMITS.incidenceDeg)});
      }));
      if (out.stations[0].eta !== 0 || out.stations.at(-1).eta !== 1) throw Error('Wing stations must include exactly eta = 0 at the root and eta = 1 at the tip.');
      if (g.twistEnabled !== true && out.stations.some(s => s.incidenceDeg !== 0)) throw Error('Enable geometric twist before entering nonzero station incidence, or set every incidence to zero.');
    }
    return out;
  }
  const closedTip=g=>g.tipChord===0&&['elliptic','delta'].includes(g.planform);
  const chordAt = (g,y) => {const e=Math.max(0,Math.min(1,y/g.semiSpan));return g.planform==='elliptic'?Math.sqrt(g.rootChord**2*(1-e*e)+g.tipChord**2*e*e):g.rootChord+e*(g.tipChord-g.rootChord);};
  const chordDerivative=(g,y)=>g.planform==='elliptic'?(g.tipChord**2-g.rootChord**2)*(y/g.semiSpan)/(g.semiSpan*chordAt(g,y)):(g.tipChord-g.rootChord)/g.semiSpan;
  const area = g => {if(g.planform!=='elliptic')return (g.rootChord+g.tipChord)*g.semiSpan/2;const k=Math.sqrt(Math.max(0,1-(g.tipChord/g.rootChord)**2));return g.semiSpan*(g.tipChord+g.rootChord*(k?Math.asin(k)/k:1))/2;};
  function stationAt(g,y) {
    finite(y,'Span station y',0,g.semiSpan);
    const eta=y/g.semiSpan, ss=g.stations;
    let incidenceDeg=0, inboard=0, blend=0;
    if (ss) {
      while (inboard < ss.length-2 && eta > ss[inboard+1].eta) inboard++;
      blend=(eta-ss[inboard].eta)/(ss[inboard+1].eta-ss[inboard].eta);
      incidenceDeg=ss[inboard].incidenceDeg+(ss[inboard+1].incidenceDeg-ss[inboard].incidenceDeg)*blend;
    }
    // Omitted sweep reference means legacy leading-edge alignment, not an
    // implicit quarter-chord shift of every existing tapered study.
    const chord=chordAt(g,y), sweepReferenceFraction=g.planform==='delta'?1:(g.sweepReferenceFraction ?? (g.planform==='elliptic'?.5:0));
    return {eta,y,chord,incidenceDeg,inboard,blend,
      xLE:y*Math.tan((g.sweepDeg ?? 0)*deg)+sweepReferenceFraction*(g.rootChord-chord),
      zLE:y*Math.tan((g.dihedralDeg ?? 0)*deg),
      twistReferenceFraction:g.twistReferenceFraction ?? .25};
  }
  function airfoilAt(g,y) {
    if (!g.stations) return g.airfoil ?? g.naca;
    const s=stationAt(g,y), a=g.stations[s.inboard].airfoil, b=g.stations[s.inboard+1].airfoil;
    if (s.blend === 0) return a;
    if (s.blend === 1) return b;
    if (JSON.stringify(a) === JSON.stringify(b)) return a;
    return A.blendProfiles(a,b,s.blend);
  }
  function transformPoint(g,y,point) {
    const s=stationAt(g,y), a=s.incidenceDeg*deg, ca=Math.cos(a), sa=Math.sin(a), pivot=s.twistReferenceFraction*s.chord;
    const dx=point[0]-pivot,z=point[1];
    return [s.xLE+pivot+ca*dx+sa*z,y,s.zLE-sa*dx+ca*z];
  }
  function inversePoint(g,point) {
    const s=stationAt(g,point[1]), a=s.incidenceDeg*deg, ca=Math.cos(a), sa=Math.sin(a), pivot=s.twistReferenceFraction*s.chord;
    const dx=point[0]-s.xLE-pivot,z=point[2]-s.zLE;
    return [pivot+ca*dx-sa*z,sa*dx+ca*z];
  }
  function analysisCapability(g) {
    const reasons=[];
    if(g.planform&&g.planform!=='linear')reasons.push('non-legacy planform');
    if (Math.abs(g.sweepDeg ?? 0)>1e-12) reasons.push('sweep');
    if (Math.abs(g.dihedralDeg ?? 0)>1e-12) reasons.push('dihedral');
    if ((g.stations ?? []).some(s => Math.abs(s.incidenceDeg)>1e-12)) reasons.push('section incidence / geometric twist');
    // A nonzero sweep-reference location also shifts a tapered wing's sections.
    // Existing legacy wings instead align their leading edges exactly.
    if ((g.sweepReferenceFraction ?? 0)!==0 && g.rootChord!==g.tipChord)
      reasons.push('a chord-reference sweep line that shifts the leading edge of a tapered wing');
    return {supported:reasons.length===0, mode:reasons.length?'geometry-only':'straight-beam', reasons,
      loadFrame:'Aircraft +z (up); N for point loads, N/mm per projected y for line loads.',
      message:reasons.length?`Geometry and CAD export are available, but structural Solve is not supported for ${reasons.join(', ')}. The current solver is a straight, untwisted spanwise beam, not a validated 3-D swept/dihedral frame. Set these angles to zero and align the leading edge to use this solver; no straight-wing stress or safety result will be substituted.`:'Straight, untwisted spanwise beam approximation; local sections may vary. Loads are prescribed, not computed from aerodynamic twist.'};
  }
  return {LIMITS,closedTip,normalizeGeometryFields,chordAt,chordDerivative,area,stationAt,airfoilAt,transformPoint,inversePoint,analysisCapability};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WingGeometry;

;
/* Wing AeroStruct aerodynamic surface-panel core. Development version, NOT published; a separate
 * application from Wing Lab (Wing Lab 1.3 is unchanged).
 *
 * Original implementation of a classical low-order panel method for the finite-thickness wing surface:
 *   - constant-strength source and doublet quadrilaterals on the actual airfoil surface;
 *   - internal Dirichlet condition: perturbation potential zero inside the closed wing;
 *   - Morino trailing-edge Kutta condition (wake doublet = upper minus lower TE doublet);
 *   - flat prescribed wake of semi-infinite constant-strength doublet strips along body +x;
 *   - right semi-wing plus its mirror image (symmetric flight only);
 *   - surface velocity from the tangential gradient of the doublet (= surface perturbation
 *     potential), pressure from incompressible Bernoulli, induced drag in the Trefftz plane;
 *   - rounded aerodynamic tip by default (no flat cap), so every surface pressure is integrated;
 *   - six-component strip loads for the structural model (forces and moments, nothing dropped);
 *   - an executed mesh-refinement sequence with Richardson extrapolation, an uncertainty estimate
 *     and an admission test (torque error relative to the torque itself, see admission()).
 * No source code, header or binary from any other panel program was used.
 *
 * Published theory implemented here:
 *   Hess & Smith (1967) Prog. Aerosp. Sci. 8:1-138 (constant-strength surface panels).
 *   Morino & Kuo (1974) AIAA J. 12(2):191-197 (Green's-identity potential formulation, Kutta condition).
 *   Maskew (1987) NASA CR-4023, VSAERO theory (internal Dirichlet condition).
 *   Katz & Plotkin (2001) Low-Speed Aerodynamics, 2nd ed., ch. 9-12.
 *   Van Oosterom & Strackee (1983) IEEE Trans. Biomed. Eng. 30(2):125-126 (triangle solid angle).
 *   Newman (1986) J. Eng. Math. 20:113-126 (source and normal-dipole quadrilateral integrals).
 *   Richardson (1911) Phil. Trans. R. Soc. A 210:307-357; Roache (1998) Verification and Validation in
 *   Computational Science and Engineering; Celik et al. (2008) J. Fluids Eng. 130:078001 (observed order
 *   with non-uniform refinement ratios); Fritsch & Carlson (1980) SIAM J. Numer. Anal. 17:238-246 (PCHIP).
 *
 * Scope, enforced or reported, never silently extended:
 *   steady, incompressible (Mach <= 0.3 enforced, no compressibility correction), inviscid,
 *   attached flow; symmetric flight only (sideslip 0, no rotation rates); rigid geometry; sharp
 *   aerodynamic trailing edge (the printed trailing-edge thickness is a manufacturing feature and
 *   is closed for the aerodynamic surface); flat wake along body +x (not relaxed, not aligned with
 *   the freestream). No stall, separation, transition, viscous drag or leading-edge vortex lift.
 *
 * Units: geometry mm; speed m/s; density kg/m^3; pressure Pa; force N; moment N mm.
 * Axes: aircraft axes, x aft, y right semi-span, z up. Freestream (air relative to the
 * wing) V (cos a, 0, sin a): positive angle of attack a is air arriving from below the nose.
 * Browser: global WingAeroPanel. Node: require('./wing_aero_panel.js').
 */
const WingAeroPanel = (() => {
  'use strict';
  const VERSION = '0.3.1';
  // Browser/Worker: globals from the inlined or bundled scripts. Node: this directory first, then the
  // shared geometry sources in ../web/ (reused unchanged).
  const nodeLoad = name => {
    if (typeof require !== 'function') return null;
    for (const path of ['./' + name, '../web/' + name]) { try { return require(path); } catch (error) { if (!error || error.code !== 'MODULE_NOT_FOUND' || !String(error.message).includes(name)) throw error; } }
    return null;
  };
  const Airfoils = typeof WingAirfoils !== 'undefined' ? WingAirfoils : nodeLoad('wing_airfoils.js');
  const Geometry = typeof WingGeometry !== 'undefined' ? WingGeometry : nodeLoad('wing_geometry.js');
  if (!Airfoils || !Geometry) throw new Error('Load wing_airfoils.js and wing_geometry.js before wing_aero_panel.js.');
  const INV4PI = 1 / (4 * Math.PI), DEG = Math.PI / 180;
  // Hot kernels use module-scope references (avoids global-object lookups in VM contexts and Workers).
  const sqrt = Math.sqrt, atan2 = Math.atan2, logn = Math.log, absv = Math.abs;
  const DEFAULT_FLOW = Object.freeze({ speed: 15, density: 1.225, alphaDeg: 4, betaDeg: 0, viscosity: 1.81e-5, speedOfSound: 340.29 });
  // tipClosure 'rounded' (default): the tip section thickness is rounded off over a short length so the surface
  // closes on itself and every pressure is integrated. 'flat' keeps a flat cap whose pressure is NOT integrated
  // (diagnostic only; see evaluate and the documentation).
  const DEFAULT_MESH = Object.freeze({ chordPanels: 32, spanPanels: 16, spanSpacing: 'sine', farField: 6, tipClosure: 'rounded', roundingStrips: 'auto' });
  const LIMITS = Object.freeze({ chordPanels: [6, 96], spanPanels: [4, 48], maxPanels: 4800, maxMach: 0.3, warnMach: 0.2,
    warnAlphaDeg: 8, maxAlphaDeg: 15, lowReynolds: 5e5, keepMatrixPanels: 1600, speedOfSound: [290, 360], modelCache: 8 });
  const SCOPE = Object.freeze({
    method: 'Low-order constant-strength source/doublet surface panels on the finite-thickness wing; internal Dirichlet condition; Morino Kutta condition; flat semi-infinite wake along body +x; symmetric image half-wing.',
    flow: 'Steady, incompressible, inviscid, attached. Mach <= 0.3 enforced; no compressibility correction.',
    excluded: ['stall and separation', 'boundary layer, transition and viscous (profile) drag', 'leading-edge vortex lift of slender or delta wings', 'compressibility', 'sideslip, roll/yaw rates and asymmetric flight', 'wake relaxation and wake roll-up', 'aeroelastic coupling (geometry is rigid)', 'fuselage, ground effect, control surfaces', 'blunt trailing-edge base flow (trailing edge is closed sharp for aerodynamics)'],
    claim: 'Numerical potential-flow estimate; accuracy is demonstrated only by the listed benchmark tests, not certified.',
  });

  // ------------------------------------------------------------------ small helpers
  const finiteIn = (v, name, lo, hi) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) throw new Error(`${name} must be a finite number between ${lo} and ${hi}.`); return v; };
  const intIn = (v, name, lo, hi) => { if (!Number.isInteger(v) || v < lo || v > hi) throw new Error(`${name} must be an integer from ${lo} to ${hi}.`); return v; };
  const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

  // ------------------------------------------------------------------ kernels
  // Signed solid angle subtended at P by the oriented triangle (a, b, c): positive on the side of
  // (b - a) x (c - a). Van Oosterom & Strackee (1983) with r_i = P - v_i.
  function triAngle(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz) {
    const x1 = px - ax, y1 = py - ay, z1 = pz - az, x2 = px - bx, y2 = py - by, z2 = pz - bz, x3 = px - cx, y3 = py - cy, z3 = pz - cz;
    const l1 = sqrt(x1 * x1 + y1 * y1 + z1 * z1), l2 = sqrt(x2 * x2 + y2 * y2 + z2 * z2), l3 = sqrt(x3 * x3 + y3 * y3 + z3 * z3);
    const det = x1 * (y2 * z3 - z2 * y3) + y1 * (z2 * x3 - x2 * z3) + z1 * (x2 * y3 - y2 * x3);
    const den = l1 * l2 * l3 + (x1 * x2 + y1 * y2 + z1 * z2) * l3 + (x1 * x3 + y1 * y3 + z1 * z3) * l2 + (x2 * x3 + y2 * y3 + z2 * z3) * l1;
    return 2 * atan2(det, den);
  }
  // Solid angle of the semi-infinite triangle (a, a + R u, b), R -> infinity, u a unit vector:
  // the R -> infinity limit of the same formula after dividing numerator and denominator by R.
  function semiInfiniteAngle(px, py, pz, ax, ay, az, ux, uy, uz, bx, by, bz) {
    const x1 = px - ax, y1 = py - ay, z1 = pz - az, x3 = px - bx, y3 = py - by, z3 = pz - bz;
    const l1 = sqrt(x1 * x1 + y1 * y1 + z1 * z1), l3 = sqrt(x3 * x3 + y3 * y3 + z3 * z3);
    const det = -(x1 * (uy * z3 - uz * y3) + y1 * (uz * x3 - ux * z3) + z1 * (ux * y3 - uy * x3));
    const den = l1 * l3 - (x1 * ux + y1 * uy + z1 * uz) * l3 + (x1 * x3 + y1 * y3 + z1 * z3) - (ux * x3 + uy * y3 + uz * z3) * l1;
    return 2 * atan2(det, den);
  }

  // ------------------------------------------------------------------ panel surface
  // nodes: flat [x,y,z,...]; quads: flat vertex indices, counter-clockwise about the outward normal.
  // A quad may collapse one edge (triangle). Non-planar quads: the doublet uses the true edges
  // (watertight vortex rings), the source uses the quad flattened into its mean plane.
  function buildSurface(nodes, quads) {
    const n = quads.length / 4;
    if (!Number.isInteger(n) || n < 4) throw new Error('A panel surface needs at least four quadrilaterals.');
    const PV = new Float64Array(12 * n), PC = new Float64Array(3 * n), PN = new Float64Array(3 * n), PL = new Float64Array(3 * n), PM = new Float64Array(3 * n);
    const PF = new Float64Array(8 * n), PA = new Float64Array(n), PD = new Float64Array(n), PW = new Float64Array(n), SELF = new Float64Array(n);
    let maxWarp = 0;
    const tri = (a, b, c, out) => { // area and centroid of a 3-D triangle
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx, area = 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
      out.a = area; out.x = (a[0] + b[0] + c[0]) / 3; out.y = (a[1] + b[1] + c[1]) / 3; out.z = (a[2] + b[2] + c[2]) / 3;
    };
    const t1 = {}, t2 = {};
    for (let k = 0; k < n; k++) {
      const v = [0, 1, 2, 3].map(q => { const i = quads[4 * k + q]; if (!(i >= 0 && 3 * i + 2 < nodes.length)) throw new Error('Panel references a missing node.'); return [nodes[3 * i], nodes[3 * i + 1], nodes[3 * i + 2]]; });
      for (let q = 0; q < 4; q++) for (let d = 0; d < 3; d++) PV[12 * k + 3 * q + d] = v[q][d];
      const d1 = [v[2][0] - v[0][0], v[2][1] - v[0][1], v[2][2] - v[0][2]], d2 = [v[3][0] - v[1][0], v[3][1] - v[1][1], v[3][2] - v[1][2]];
      let nx = d1[1] * d2[2] - d1[2] * d2[1], ny = d1[2] * d2[0] - d1[0] * d2[2], nz = d1[0] * d2[1] - d1[1] * d2[0];
      const nn = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (!(nn > 0)) throw new Error(`Panel ${k} has zero area.`);
      nx /= nn; ny /= nn; nz /= nn; PA[k] = 0.5 * nn;
      // centroid: mean of the two diagonal splits (exact for planar quads and for triangles)
      let C = [0, 0, 0];
      for (const [a, b, c, d] of [[0, 1, 2, 3], [1, 2, 3, 0]]) {
        tri(v[a], v[b], v[c], t1); tri(v[a], v[c], v[d], t2); const s = t1.a + t2.a;
        C[0] += 0.5 * (t1.a * t1.x + t2.a * t2.x) / s; C[1] += 0.5 * (t1.a * t1.y + t2.a * t2.y) / s; C[2] += 0.5 * (t1.a * t1.z + t2.a * t2.z) / s;
      }
      PC[3 * k] = C[0]; PC[3 * k + 1] = C[1]; PC[3 * k + 2] = C[2]; PN[3 * k] = nx; PN[3 * k + 1] = ny; PN[3 * k + 2] = nz;
      // in-plane axes: l from the 0-3 edge midpoint towards the 1-2 edge midpoint
      let lx = (v[1][0] + v[2][0] - v[0][0] - v[3][0]), ly = (v[1][1] + v[2][1] - v[0][1] - v[3][1]), lz = (v[1][2] + v[2][2] - v[0][2] - v[3][2]);
      let dot = lx * nx + ly * ny + lz * nz; lx -= dot * nx; ly -= dot * ny; lz -= dot * nz;
      let ll = Math.sqrt(lx * lx + ly * ly + lz * lz);
      if (!(ll > 1e-12 * Math.sqrt(PA[k]))) { lx = d1[0]; ly = d1[1]; lz = d1[2]; dot = lx * nx + ly * ny + lz * nz; lx -= dot * nx; ly -= dot * ny; lz -= dot * nz; ll = Math.sqrt(lx * lx + ly * ly + lz * lz); }
      lx /= ll; ly /= ll; lz /= ll;
      const mx = ny * lz - nz * ly, my = nz * lx - nx * lz, mz = nx * ly - ny * lx;
      PL[3 * k] = lx; PL[3 * k + 1] = ly; PL[3 * k + 2] = lz; PM[3 * k] = mx; PM[3 * k + 1] = my; PM[3 * k + 2] = mz;
      let rmax = 0, warp = 0;
      for (let q = 0; q < 4; q++) {
        const ex = v[q][0] - C[0], ey = v[q][1] - C[1], ez = v[q][2] - C[2];
        rmax = Math.max(rmax, Math.sqrt(ex * ex + ey * ey + ez * ez)); warp = Math.max(warp, Math.abs(ex * nx + ey * ny + ez * nz));
        PF[8 * k + 2 * q] = ex * lx + ey * ly + ez * lz; PF[8 * k + 2 * q + 1] = ex * mx + ey * my + ez * mz;
      }
      PD[k] = 2 * rmax; PW[k] = warp; maxWarp = Math.max(maxWarp, warp / (2 * rmax));
    }
    const S = { count: n, nodes, quads, PV, PC, PN, PL, PM, PF, PA, PD, PW, SELF, maxWarpRatio: maxWarp };
    for (let k = 0; k < n; k++) SELF[k] = sourceLocal(S, k, 0, 0, 0);
    return S;
  }
  // (1/4pi) * integral dS/r over the flattened panel k, field point in panel-local coordinates.
  function sourceLocal(S, k, x, y, z) {
    const F = S.PF, o = 8 * k;
    let sum = 0, omega = 0;
    for (let e = 0; e < 4; e++) {
      const a = o + 2 * e, b = o + 2 * ((e + 1) & 3), xa = F[a], ya = F[a + 1], xb = F[b], yb = F[b + 1];
      const ex = xb - xa, ey = yb - ya, d = sqrt(ex * ex + ey * ey);
      if (!(d > 1e-14 * S.PD[k])) continue;
      const ra = sqrt((x - xa) * (x - xa) + (y - ya) * (y - ya) + z * z), rb = sqrt((x - xb) * (x - xb) + (y - yb) * (y - yb) + z * z);
      const perp = (ex * (y - ya) - ey * (x - xa)) / d, den = ra + rb - d;
      if (den > 1e-15 * (ra + rb) && absv(perp) > 0) sum += perp * logn((ra + rb + d) / den);
    }
    if (z !== 0) omega = triAngle(x, y, z, F[o], F[o + 1], 0, F[o + 2], F[o + 3], 0, F[o + 4], F[o + 5], 0) + triAngle(x, y, z, F[o], F[o + 1], 0, F[o + 4], F[o + 5], 0, F[o + 6], F[o + 7], 0);
    return (sum - z * omega) * INV4PI;
  }
  // Influence of panel k (unit source, unit doublet) at a field point not on the panel.
  // Doublet sign: +1/2 just outside (normal side), -1/2 just inside.
  let outS = 0, outD = 0;
  function influence(S, k, px, py, pz, far2) {
    const c = 3 * k, dx = px - S.PC[c], dy = py - S.PC[c + 1], dz = pz - S.PC[c + 2], r2 = dx * dx + dy * dy + dz * dz;
    const nx = S.PN[c], ny = S.PN[c + 1], nz = S.PN[c + 2];
    const lim = far2 * S.PD[k] * S.PD[k];
    if (r2 > lim) { const r = sqrt(r2), a = S.PA[k] * INV4PI; outS = a / r; outD = a * (dx * nx + dy * ny + dz * nz) / (r2 * r); return; }
    const V = S.PV, o = 12 * k;
    outD = (triAngle(px, py, pz, V[o], V[o + 1], V[o + 2], V[o + 3], V[o + 4], V[o + 5], V[o + 6], V[o + 7], V[o + 8]) +
      triAngle(px, py, pz, V[o], V[o + 1], V[o + 2], V[o + 6], V[o + 7], V[o + 8], V[o + 9], V[o + 10], V[o + 11])) * INV4PI;
    outS = sourceLocal(S, k, dx * S.PL[c] + dy * S.PL[c + 1] + dz * S.PL[c + 2], dx * S.PM[c] + dy * S.PM[c + 1] + dz * S.PM[c + 2], dx * nx + dy * ny + dz * nz);
  }

  // ------------------------------------------------------------------ dense LU (partial pivoting)
  function luFactor(a, n) {
    const piv = new Int32Array(n);
    for (let k = 0; k < n; k++) {
      let p = k, best = absv(a[k * n + k]);
      for (let i = k + 1; i < n; i++) { const v = absv(a[i * n + k]); if (v > best) { best = v; p = i; } }
      if (!(best > 0)) throw new Error('The panel influence matrix is singular; check the mesh for duplicate or inverted panels.');
      piv[k] = p;
      if (p !== k) for (let j = 0; j < n; j++) { const t = a[k * n + j]; a[k * n + j] = a[p * n + j]; a[p * n + j] = t; }
      const inv = 1 / a[k * n + k], rk = k * n;
      for (let i = k + 1; i < n; i++) {
        const ri = i * n, f = a[ri + k] * inv; a[ri + k] = f;
        if (f !== 0) for (let j = k + 1; j < n; j++) a[ri + j] -= f * a[rk + j];
      }
    }
    return piv;
  }
  function luSolve(a, n, piv, b) {
    const x = Float64Array.from(b);
    for (let k = 0; k < n; k++) { const p = piv[k]; if (p !== k) { const t = x[k]; x[k] = x[p]; x[p] = t; } }
    for (let i = 1; i < n; i++) { let s = x[i]; const ri = i * n; for (let j = 0; j < i; j++) s -= a[ri + j] * x[j]; x[i] = s; }
    for (let i = n - 1; i >= 0; i--) { let s = x[i]; const ri = i * n; for (let j = i + 1; j < n; j++) s -= a[ri + j] * x[j]; x[i] = s / a[ri + i]; }
    return x;
  }

  // ------------------------------------------------------------------ assembly and unit solutions
  // options: image (mirror about y = 0, symmetric flow), wake {count, ax..: TE points, dir, upper, lower},
  // farField (point-singularity approximation beyond farField panel diameters; Infinity = exact).
  function assemble(S, options = {}) {
    const n = S.count, image = !!options.image, far2 = (options.farField ?? DEFAULT_MESH.farField) ** 2;
    const A = new Float64Array(n * n), bx = new Float64Array(n), by = new Float64Array(n), bz = new Float64Array(n);
    const W = options.wake || null;
    for (let i = 0; i < n; i++) {
      const px = S.PC[3 * i], py = S.PC[3 * i + 1], pz = S.PC[3 * i + 2], row = i * n;
      let sx = 0, sy = 0, sz = 0;
      for (let k = 0; k < n; k++) {
        let s, d;
        if (k === i) { s = S.SELF[k]; d = -0.5; } else { influence(S, k, px, py, pz, far2); s = outS; d = outD; }
        let sMirror = 0;
        if (image) { influence(S, k, px, -py, pz, far2); d += outD; sMirror = outS; }
        A[row + k] = d;
        const nx = S.PN[3 * k], ny = S.PN[3 * k + 1], nz = S.PN[3 * k + 2], st = s + sMirror;
        sx += st * nx; sz += st * nz; sy += (s - sMirror) * ny;
      }
      bx[i] = sx; by[i] = sy; bz[i] = sz;
      if (W) for (let w = 0; w < W.count; w++) {
        const o = 3 * w;
        let d = semiInfiniteAngle(px, py, pz, W.a[o], W.a[o + 1], W.a[o + 2], W.dir[0], W.dir[1], W.dir[2], W.b[o], W.b[o + 1], W.b[o + 2]);
        if (image) d += semiInfiniteAngle(px, -py, pz, W.a[o], W.a[o + 1], W.a[o + 2], W.dir[0], W.dir[1], W.dir[2], W.b[o], W.b[o + 1], W.b[o + 2]);
        d *= INV4PI; for (let q = 0; q < W.kuttaWidth; q++) { const c = W.kuttaWeights[w * W.kuttaWidth + q]; if (c) A[row + W.kuttaPanels[w * W.kuttaWidth + q]] += d * c; }
      }
    }
    return { A, bx, by, bz };
  }
  // Restarted GMRES (modified Gram-Schmidt, Givens rotations) with Jacobi (row-diagonal) scaling.
  // The internal-Dirichlet doublet system is a second-kind integral equation (diagonal near -1/2),
  // so Krylov iterations converge quickly; the caller verifies the true residual and falls back to LU.
  // Block-Jacobi preconditioner: LU of the diagonal blocks [start, size] (one spanwise strip each for
  // the wing, so the chordwise and Kutta coupling of a strip is inverted exactly).
  function blockPreconditioner(A, n, blocks) {
    const list = blocks && blocks.length ? blocks : Array.from({ length: n }, (_, i) => [i, 1]);
    const factors = list.map(([s, m]) => { const B = new Float64Array(m * m); for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) B[i * m + j] = A[(s + i) * n + s + j]; const piv = luFactor(B, m); return { s, m, B, piv }; });
    return (v, out) => { for (const f of factors) { const x = luSolve(f.B, f.m, f.piv, v.subarray(f.s, f.s + f.m)); out.set(x, f.s); } };
  }
  function gmres(A, n, b, options = {}) {
    const tol = options.tol ?? 1e-12, m = Math.min(options.restart ?? 60, n), maxIter = options.maxIter ?? 400;
    const precond = options.precond || blockPreconditioner(A, n, options.blocks), tmp = new Float64Array(n);
    const mv = (v, out) => { for (let i = 0; i < n; i++) { let s = 0; const r = i * n; for (let k = 0; k < n; k++) s += A[r + k] * v[k]; tmp[i] = s; } precond(tmp, out); };
    const pb = new Float64Array(n); precond(Float64Array.from(b), pb);
    const bn = Math.sqrt(pb.reduce((s, v) => s + v * v, 0)) || 1;
    const x = new Float64Array(n), r = new Float64Array(n), w = new Float64Array(n), V = Array.from({ length: m + 1 }, () => new Float64Array(n));
    const H = Array.from({ length: m + 1 }, () => new Float64Array(m)), cs = new Float64Array(m), sn = new Float64Array(m), gg = new Float64Array(m + 1);
    let it = 0, rel = Infinity;
    while (it < maxIter) {
      mv(x, r); for (let i = 0; i < n; i++) r[i] = pb[i] - r[i];
      const beta = Math.sqrt(r.reduce((s, v) => s + v * v, 0)); rel = beta / bn;
      if (rel <= tol) break;
      for (let i = 0; i < n; i++) V[0][i] = r[i] / beta;
      gg.fill(0); gg[0] = beta;
      let j = 0;
      for (; j < m && it < maxIter; j++, it++) {
        mv(V[j], w);
        for (let i = 0; i <= j; i++) { let h = 0; const vi = V[i]; for (let q = 0; q < n; q++) h += w[q] * vi[q]; H[i][j] = h; for (let q = 0; q < n; q++) w[q] -= h * vi[q]; }
        const hn = Math.sqrt(w.reduce((s, v) => s + v * v, 0)); H[j + 1][j] = hn;
        if (hn > 0) for (let q = 0; q < n; q++) V[j + 1][q] = w[q] / hn;
        for (let i = 0; i < j; i++) { const t = cs[i] * H[i][j] + sn[i] * H[i + 1][j]; H[i + 1][j] = -sn[i] * H[i][j] + cs[i] * H[i + 1][j]; H[i][j] = t; }
        const den = Math.hypot(H[j][j], H[j + 1][j]); cs[j] = H[j][j] / den; sn[j] = H[j + 1][j] / den;
        H[j][j] = den; H[j + 1][j] = 0; gg[j + 1] = -sn[j] * gg[j]; gg[j] = cs[j] * gg[j];
        rel = Math.abs(gg[j + 1]) / bn;
        if (rel <= tol || hn === 0) { j++; it++; break; }
      }
      const y = new Float64Array(j);
      for (let i = j - 1; i >= 0; i--) { let s = gg[i]; for (let k = i + 1; k < j; k++) s -= H[i][k] * y[k]; y[i] = s / H[i][i]; }
      for (let i = 0; i < j; i++) { const vi = V[i], yi = y[i]; for (let q = 0; q < n; q++) x[q] += yi * vi[q]; }
      if (rel <= tol) break;
    }
    return { x, iterations: it, preconditionedRelativeResidual: rel };
  }
  function trueResidual(A, n, x, b) {
    let rmax = 0, bmax = 0;
    for (let i = 0; i < n; i++) { let s = -b[i]; const r = i * n; for (let k = 0; k < n; k++) s += A[r + k] * x[k]; rmax = Math.max(rmax, Math.abs(s)); bmax = Math.max(bmax, Math.abs(b[i])); }
    return rmax / Math.max(bmax, 1e-300);
  }
  // Solves for the doublet strengths of unit freestreams along x, z (and y without the image).
  // solver: 'auto' (LU up to luMaxPanels, GMRES above with LU fallback), 'lu' or 'gmres'.
  function unitSolutions(S, options = {}) {
    const n = S.count, t0 = now(), sys = assemble(S, options), t1 = now();
    const rhs = [Float64Array.from(sys.bx, v => -v), Float64Array.from(sys.bz, v => -v), ...(options.image ? [] : [Float64Array.from(sys.by, v => -v)])];
    const mode = options.solver ?? 'auto', useGmres = mode === 'gmres' || (mode === 'auto' && n > (options.luMaxPanels ?? 900));
    let solutions = null, method = 'LU with partial pivoting', iterations = null, residual = 0;
    if (useGmres) {
      const precond = blockPreconditioner(sys.A, n, options.blocks);
      const out = rhs.map(b => gmres(sys.A, n, b, { ...options, precond })), res = out.map((o, i) => trueResidual(sys.A, n, o.x, rhs[i]));
      if (res.every(r => r <= 1e-9)) { solutions = out.map(o => o.x); method = `restarted GMRES(60), ${options.blocks ? 'strip block-Jacobi' : 'Jacobi'} preconditioning`; iterations = out.map(o => o.iterations); residual = Math.max(...res); }
      else method = `LU fallback after GMRES residual ${Math.max(...res).toExponential(2)}`;
    }
    const t2 = now();
    if (!solutions) {
      const keep = n <= (options.keepMatrixPanels ?? LIMITS.keepMatrixPanels) ? Float64Array.from(sys.A) : null;
      const piv = luFactor(sys.A, n);
      solutions = rhs.map(b => luSolve(sys.A, n, piv, b));
      residual = keep ? Math.max(...solutions.map((x, i) => trueResidual(keep, n, x, rhs[i]))) : null;
    }
    const t3 = now();
    return { mux: solutions[0], muz: solutions[1], muy: options.image ? null : solutions[2], method, iterations,
      timing: { assembleMs: t1 - t0, solveMs: t3 - t1 }, relativeResidual: residual };
  }

  // ------------------------------------------------------------------ surface gradient
  // Lagrange derivative weights at s[t] through three parameter values s[0..2].
  function lagrange3(s0, s1, s2, t) {
    const st = [s0, s1, s2][t];
    return [((st - s1) + (st - s2)) / ((s0 - s1) * (s0 - s2)), ((st - s0) + (st - s2)) / ((s1 - s0) * (s1 - s2)), ((st - s0) + (st - s1)) / ((s2 - s0) * (s2 - s1))];
  }
  // Directional derivative and tangent along three points P[], values f[], at point index t.
  function lineDerivative(P, f, t) {
    if (P.length === 2) { const d = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]], l2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2]; return { T: d.map(v => v / Math.sqrt(l2)), df: (f[1] - f[0]) / Math.sqrt(l2) }; }
    const d01 = Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]), d12 = Math.hypot(P[2][0] - P[1][0], P[2][1] - P[1][1], P[2][2] - P[1][2]);
    const w = lagrange3(0, d01, d01 + d12, t);
    return { T: [0, 1, 2].map(c => w[0] * P[0][c] + w[1] * P[1][c] + w[2] * P[2][c]), df: w[0] * f[0] + w[1] * f[1] + w[2] * f[2] };
  }
  // Solve [T1; T2; n] g = [d1; d2; 0] for the tangential gradient g.
  function tangentialGradient(T1, d1, T2, d2, n) {
    const M = [T1, T2, n], r = [d1, d2, 0];
    const det3 = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const D = det3(M);
    if (!(Math.abs(D) > 1e-14)) throw new Error('Degenerate surface-gradient stencil: two difference directions are parallel.');
    return [0, 1, 2].map(c => det3(M.map((row, i) => row.map((v, j) => (j === c ? r[i] : v)))) / D);
  }
  // Tangential velocity of each panel for a freestream V and doublet mu (perturbation potential).
  // Default 'unfolded' scheme: the three-point line derivatives of the previous scheme, taken on the SURFACE. Each
  // stencil neighbour's centroid is rotated into the plane of panel k about the edge(s) it shares with the chain
  // towards k (the surface is unfolded flat), so the line through the stencil lies in k's tangent plane and the
  // parameter is the surface distance. On a smooth, resolved surface this differs from the previous scheme only at
  // second order; where the surface folds back within a panel width (a thin leading edge; the flattened leading- and
  // trailing-edge parts of the rounded tip, where the section scale tau goes to zero; across the tip seam) the
  // straight chord between centroids was much shorter than the surface path and pointed nearly along the panel
  // normal, which inflated dmu/ds and made the 3 x 3 gradient system nearly singular.
  // Patch panels are the quads (i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1) of a structured grid: edge v3v0 / v1v2
  // is shared with neighbour i - 1 / i + 1, edge v0v1 / v2v3 with j - 1 / j + 1 (checked; otherwise 'legacy').
  // Boundaries: 'wrap', 'open' (one-sided), 'mirror' (y = 0 image) and, for the last row of a closed rounded tip,
  // jEnd 'seam': the surface continues across the tip edge onto the opposite panel seam(i) of the same row, which
  // shares that edge (no wake leaves the tip edge, so the doublet is continuous across it). The two stencil
  // directions stay as the grid gives them (oblique with sweep, dihedral and taper); nothing is orthogonalised.
  function surfaceVelocity(S, layout, mu, Vinf, options = {}) {
    if ((options.scheme ?? 'unfolded') === 'legacy') return surfaceVelocityLegacy(S, layout, mu, Vinf);
    const n = S.count, out = new Float64Array(3 * n), PV = S.PV, PN = S.PN, PC = S.PC;
    const vtx = (k, q) => [PV[12 * k + 3 * q], PV[12 * k + 3 * q + 1], PV[12 * k + 3 * q + 2]];
    const C = k => [PC[3 * k], PC[3 * k + 1], PC[3 * k + 2]], N = k => [PN[3 * k], PN[3 * k + 1], PN[3 * k + 2]];
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    // rotate X about the line (Ea, Eb) by the angle that turns plane normal nFrom into nTo
    const hinge = (X, Ea, Eb, nFrom, nTo) => {
      const d = sub(Eb, Ea), l = Math.sqrt(dot(d, d));
      if (!(l > 0)) return X;
      const e = [d[0] / l, d[1] / l, d[2] / l], ef = dot(e, nFrom), et = dot(e, nTo);
      const phi = Math.atan2(dot(e, crs(nFrom, nTo)), dot(nFrom, nTo) - ef * et), c = Math.cos(phi), s = Math.sin(phi);
      const v = sub(X, Ea), ev = dot(e, v), w = crs(e, v);
      return [0, 1, 2].map(q => Ea[q] + v[q] * c + w[q] * s + e[q] * ev * (1 - c));
    };
    const edge = (k, e) => [vtx(k, e), vtx(k, (e + 1) & 3)];
    const shares = (k, ek, m, em) => { const [a0, a1] = edge(k, ek), [b0, b1] = edge(m, em), tol = 1e-4 * (S.PD[k] + S.PD[m]);
      const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) <= tol;
      return (near(a0, b1) && near(a1, b0)) || (near(a0, b0) && near(a1, b1)); };
    // centroid of m, unfolded into the plane of k across k's edge ek (m adjacent to k)
    const unfold1 = (k, ek, m, X = C(m), nm = N(m)) => { const [a, b] = edge(k, ek); return hinge(X, a, b, nm, N(k)); };
    const toPlane = (k, X) => { const nk = N(k), h = dot(sub(X, C(k)), nk); return [X[0] - h * nk[0], X[1] - h * nk[1], X[2] - h * nk[2]]; };
    for (const patch of layout.patches) {
      const { ni, nj, index } = patch;
      let structured = !patch.cross && ni >= 3 && nj >= 3;
      if (structured) for (let j = 0; j < nj && structured; j++) for (let i = 0; i < ni && structured; i++) {
        const k = index(i, j);
        if ((i < ni - 1 || patch.iMode === 'wrap') && !shares(k, 1, index((i + 1) % ni, j), 3)) structured = false;
        if (j < nj - 1 && !shares(k, 2, index(i, j + 1), 0)) structured = false;
        if (j === nj - 1 && patch.jEnd === 'seam' && !shares(k, 2, index(patch.seam(i), j), 2)) structured = false;
      }
      if (!structured) { // tip-cap row, tiny or unstructured patches: previous scheme
        const v = surfaceVelocityLegacy(S, { patches: [patch] }, mu, Vinf);
        for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) { const k = index(i, j); for (let c = 0; c < 3; c++) out[3 * k + c] = v[3 * k + c]; }
        continue;
      }
      for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) {
        const k = index(i, j), Ck = C(k), nk = N(k);
        // chordwise (i): neighbour i - 1 across k's edge 3, i + 1 across k's edge 1
        let P, f, t;
        if (patch.iMode === 'wrap' || (i > 0 && i < ni - 1)) {
          const a = index((i - 1 + ni) % ni, j), b = index((i + 1) % ni, j);
          P = [unfold1(k, 3, a), Ck, unfold1(k, 1, b)]; f = [mu[a], mu[k], mu[b]]; t = 1;
        } else if (i === 0) { // one-sided: i + 2 unfolded into i + 1's plane, then both into k's
          const b = index(1, j), c = index(2, j), cb = unfold1(b, 1, c);
          P = [Ck, unfold1(k, 1, b), unfold1(k, 1, b, cb)]; f = [mu[k], mu[b], mu[c]]; t = 0;
        } else {
          const b = index(ni - 2, j), a = index(ni - 3, j), ab = unfold1(b, 3, a);
          P = [unfold1(k, 3, b, ab), unfold1(k, 3, b), Ck]; f = [mu[a], mu[b], mu[k]]; t = 2;
        }
        const di = lineDerivative(P.map(X => toPlane(k, X)), f, t);
        // spanwise (j): neighbour j - 1 across k's edge 0, j + 1 across k's edge 2
        if (j > 0 && j < nj - 1) {
          const a = index(i, j - 1), b = index(i, j + 1);
          P = [unfold1(k, 0, a), Ck, unfold1(k, 2, b)]; f = [mu[a], mu[k], mu[b]]; t = 1;
        } else if (j === 0 && patch.jMode === 'mirror') { // image about y = 0 shares the root edge; same doublet
          const b = index(i, 1);
          P = [unfold1(k, 0, -1, [Ck[0], -Ck[1], Ck[2]], [nk[0], -nk[1], nk[2]]), Ck, unfold1(k, 2, b)]; f = [mu[k], mu[k], mu[b]]; t = 1;
        } else if (j === nj - 1 && patch.jEnd === 'seam') { // closed rounded tip: across the tip edge onto the other surface
          const a = index(i, j - 1), b = index(patch.seam(i), j);
          P = [unfold1(k, 0, a), Ck, unfold1(k, 2, b)]; f = [mu[a], mu[k], mu[b]]; t = 1;
        } else if (j === 0) {
          const b = index(i, 1), c = index(i, 2), cb = unfold1(b, 2, c);
          P = [Ck, unfold1(k, 2, b), unfold1(k, 2, b, cb)]; f = [mu[k], mu[b], mu[c]]; t = 0;
        } else {
          const b = index(i, nj - 2), a = index(i, nj - 3), ab = unfold1(b, 0, a);
          P = [unfold1(k, 0, b, ab), unfold1(k, 0, b), Ck]; f = [mu[a], mu[b], mu[k]]; t = 2;
        }
        const dj = lineDerivative(P.map(X => toPlane(k, X)), f, t);
        const g = tangentialGradient(di.T, di.df, dj.T, dj.df, nk);
        const vn = Vinf[0] * nk[0] + Vinf[1] * nk[1] + Vinf[2] * nk[2];
        for (let c = 0; c < 3; c++) out[3 * k + c] = Vinf[c] - vn * nk[c] + g[c];
      }
    }
    return out;
  }
  function surfaceVelocityLegacy(S, layout, mu, Vinf) {
    const n = S.count, out = new Float64Array(3 * n), C = k => [S.PC[3 * k], S.PC[3 * k + 1], S.PC[3 * k + 2]];
    const nrm = k => [S.PN[3 * k], S.PN[3 * k + 1], S.PN[3 * k + 2]];
    const stencil = (len, idx, mode, pos, val, at) => {
      // returns {P, f, t} for index idx along a line of length len
      if (mode === 'wrap') return { P: [pos((idx - 1 + len) % len), pos(idx), pos((idx + 1) % len)], f: [val((idx - 1 + len) % len), val(idx), val((idx + 1) % len)], t: 1 };
      if (len === 1) return null;
      if (len === 2) return { P: [pos(0), pos(1)], f: [val(0), val(1)], t: idx };
      if (idx === 0 && mode === 'mirror') return { P: [at.mirrorPos(), pos(0), pos(1)], f: [val(0), val(0), val(1)], t: 1 };
      if (idx === 0) return { P: [pos(0), pos(1), pos(2)], f: [val(0), val(1), val(2)], t: 0 };
      if (idx === len - 1) return { P: [pos(len - 3), pos(len - 2), pos(len - 1)], f: [val(len - 3), val(len - 2), val(len - 1)], t: 2 };
      return { P: [pos(idx - 1), pos(idx), pos(idx + 1)], f: [val(idx - 1), val(idx), val(idx + 1)], t: 1 };
    };
    for (const patch of layout.patches) {
      const { ni, nj, index } = patch;
      for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) {
        const k = index(i, j), nk = nrm(k);
        const si = stencil(ni, i, patch.iMode, q => C(index(q, j)), q => mu[index(q, j)], {});
        const sj = stencil(nj, j, patch.jMode, q => C(index(i, q)), q => mu[index(i, q)], { mirrorPos: () => { const c = C(index(i, 0)); return [c[0], -c[1], c[2]]; } });
        let g;
        const a = lineDerivative(si.P, si.f, si.t);
        if (sj) { const b = lineDerivative(sj.P, sj.f, sj.t); g = tangentialGradient(a.T, a.df, b.T, b.df, nk); }
        else if (patch.cross) { const c = patch.cross(i, j); const P0 = C(c[0]), P1 = C(c[1]); const b = lineDerivative([P0, P1], [mu[c[0]], mu[c[1]]], 0); g = tangentialGradient(a.T, a.df, b.T, b.df, nk); }
        else throw new Error('A one-row patch needs a cross-direction rule.');
        const vn = Vinf[0] * nk[0] + Vinf[1] * nk[1] + Vinf[2] * nk[2];
        for (let c = 0; c < 3; c++) out[3 * k + c] = Vinf[c] - vn * nk[c] + g[c];
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ wing geometry adapter
  const GEOMETRY_KEYS = ['planform', 'semiSpan', 'rootChord', 'tipChord', 'sweepDeg', 'dihedralDeg', 'sweepReferenceFraction', 'twistReferenceFraction', 'twistEnabled', 'airfoil', 'naca', 'stations'];
  const GEOMETRY_DEFAULTS = Object.freeze({ naca: '2412', semiSpan: 450, rootChord: 160, tipChord: 100 }); // engine.js DEFAULT_GEOMETRY values
  // Accepts a WingEngine.makeGeometry result or a raw study geometry; keeps only the outer-surface fields.
  // Field names that look like geometry but are not Wing Lab names: refused, so a misspelling cannot
  // silently fall back to a default (a WingEngine.makeGeometry result never contains them).
  const MISNAMED = Object.freeze({ dihedral: 'dihedralDeg', sweep: 'sweepDeg', span: 'semiSpan (half span, mm)', semispan: 'semiSpan', chord: 'rootChord and tipChord',
    rootchord: 'rootChord', tipchord: 'tipChord', taper: 'tipChord', twist: 'stations[].incidenceDeg with twistEnabled', incidence: 'stations[].incidenceDeg',
    incidenceDeg: 'stations[].incidenceDeg', alpha: 'the flow field alphaDeg', alphaDeg: 'the flow field alphaDeg', aoa: 'the flow field alphaDeg', airfoilName: 'naca or airfoil' });
  const squash = k => String(k).toLowerCase().replace(/[^a-z]/g, '');
  const MISNAMED_SQUASHED = new Map([...Object.entries(MISNAMED).map(([k, v]) => [squash(k), v]),
    ...['sweepangle', 'sweepangledeg', 'dihedralangle', 'dihedralangledeg', 'twistdeg', 'twistangle', 'spanmm', 'halfspan', 'aspectratio'].map(k => [k, 'the Wing Lab geometry names (semiSpan, rootChord, tipChord, sweepDeg, dihedralDeg, stations)'])]);
  function aeroGeometry(raw = {}) {
    for (const k of Object.keys(raw || {})) {
      // refuse geometry-like names that are not Wing Lab names, including case and separator variants of
      // real names (dihedral_deg, SemiSpan), so a typing error cannot fall back silently to a default
      const sq = squash(k), real = GEOMETRY_KEYS.find(n => squash(n) === sq);
      if (real && real !== k) throw new Error(`Unknown geometry field "${k}": use ${real}.`);
      if (!real && MISNAMED_SQUASHED.has(sq)) throw new Error(`Unknown geometry field "${k}": use ${MISNAMED_SQUASHED.get(sq)}.`);
    }
    const g = { ...GEOMETRY_DEFAULTS };
    for (const k of GEOMETRY_KEYS) if (raw[k] !== undefined && raw[k] !== null) g[k] = raw[k];
    for (const k of ['semiSpan', 'rootChord']) finiteIn(g[k], k + ' (mm)', 1e-3, 1e6);
    finiteIn(g.tipChord, 'tipChord (mm)', 0, g.rootChord);
    Object.assign(g, Geometry.normalizeGeometryFields(g));
    if (!(g.tipChord > 0) && !Geometry.closedTip(g)) throw new Error('A zero tip chord is supported only for the exact elliptic or delta closed-tip planforms.');
    return Object.freeze(g);
  }
  // Canonical text of the outer aerodynamic shape (every field the panel mesh depends on). A stored aerodynamic load
  // belongs to the wing with the same key (the application keeps its SHA-256 with the load).
  // Defaults are written out, so equivalent descriptions of the same wing (a field omitted or set to its default) agree.
  function geometryKey(rawGeometry) {
    const g = aeroGeometry(rawGeometry), planform = g.planform ?? 'linear';
    return JSON.stringify({ planform, semiSpan: g.semiSpan, rootChord: g.rootChord, tipChord: g.tipChord, sweepDeg: g.sweepDeg ?? 0, dihedralDeg: g.dihedralDeg ?? 0,
      sweepReferenceFraction: g.sweepReferenceFraction ?? (planform === 'elliptic' ? 0.5 : planform === 'delta' ? 1 : 0), twistReferenceFraction: g.twistReferenceFraction ?? 0.25,
      sections: g.stations ? g.stations.map(st => [st.eta, st.airfoil, st.incidenceDeg]) : [g.airfoil ?? g.naca] });
  }
  function sectionLoop(g, y, nHalf) {
    const c = Geometry.chordAt(g, y);
    if (!(c > 1e-9 * g.rootChord)) return null; // exact closed tip: the station collapses to one point
    const s = Airfoils.surfaces(Geometry.airfoilAt(g, y), c, 0, nHalf + 1); // te = 0: sharp aerodynamic TE
    const pts = [];
    for (let i = 0; i <= nHalf; i++) pts.push([s.xl[nHalf - i], s.zl[nHalf - i]]);
    for (let i = 1; i <= nHalf; i++) pts.push([s.xu[i], s.zu[i]]);
    return pts;
  }
  function spanStations(g, nSpan, spacing) {
    const L = g.semiSpan, ys = [];
    for (let j = 0; j <= nSpan; j++) { const t = j / nSpan; ys.push(spacing === 'uniform' ? L * t : spacing === 'cosine' ? L * (1 - Math.cos(Math.PI * t)) / 2 : L * Math.sin(Math.PI * t / 2)); }
    ys[0] = 0; ys[nSpan] = L;
    for (const yb of (g.stations || []).map(s => s.eta * L).filter(y => y > 1e-9 * L && y < L * (1 - 1e-9))) {
      let k = 1; while (k < ys.length - 1 && Math.abs(ys[k + 1] - yb) < Math.abs(ys[k] - yb)) k++;
      const local = Math.min(ys[k] - ys[k - 1], ys[k + 1] - ys[k]);
      if (Math.abs(ys[k] - yb) <= 0.3 * local) ys[k] = yb; else { ys.push(yb); ys.sort((a, b) => a - b); }
    }
    return ys;
  }
  // Panel mesh of the right semi-wing. options.sectionLoop(y, nHalf) may supply local [x, z] points
  // (lower TE -> LE -> upper TE, 2 nHalf + 1 points) for analytic benchmark sections.
  function wingMesh(g, mesh = {}, limits = LIMITS) {
    const m = { ...DEFAULT_MESH, ...mesh };
    const nHalf = intIn(m.chordPanels, 'Chordwise panels per surface', ...limits.chordPanels), ni = 2 * nHalf;
    intIn(m.spanPanels, 'Spanwise panels', ...limits.spanPanels);
    if (!['sine', 'cosine', 'uniform'].includes(m.spanSpacing)) throw new Error('Span spacing must be sine (tip-clustered), cosine or uniform.');
    if (!['flat', 'rounded'].includes(m.tipClosure)) throw new Error('Tip closure must be flat or rounded.');
    let ys = spanStations(g, m.spanPanels, m.spanSpacing);
    const closed = Geometry.closedTip(g), L = g.semiSpan;
    let loop = m.sectionLoop || ((y, h) => sectionLoop(g, y, h)), rounding = null;
    if (m.tipClosure === 'rounded' && !closed) {
      // Rounded aerodynamic tip: inside the last l of span the section thickness about its camber line is
      // scaled by tau = sqrt(1 - ((y - (L - l)) / l)^2), so the surface closes on a sharp side edge at y = L
      // (no flat cap). l = half the tip section's maximum thickness (a semicircular-like spanwise rounding).
      const tip = loop(L, nHalf), base = loop;
      const tMax = Math.max(...tip.map((p, i) => Math.hypot(p[0] - tip[ni - i][0], p[1] - tip[ni - i][1])));
      // rounding strips refine with the spanwise mesh ('auto': max(2, round(spanPanels / 4))), so a spanwise
      // refinement study also refines the tip rounding
      const ell = Math.min(0.5 * tMax, 0.25 * L), y0 = L - ell, mRound = m.roundingStrips === 'auto' ? Math.max(2, Math.round(m.spanPanels / 4)) : m.roundingStrips;
      ys = [...ys.filter(y => y < y0 - 0.25 * ell / mRound), ...Array.from({ length: mRound + 1 }, (_, k) => y0 + ell * Math.sin(Math.PI / 2 * k / mRound))];
      ys[ys.length - 1] = L;
      loop = (y, h) => {
        const pts = base(y, h); if (!pts || y <= y0) return pts;
        const tau = Math.sqrt(Math.max(0, 1 - ((y - y0) / ell) ** 2));
        return pts.map((p, i) => { const q = pts[ni - i], cx = 0.5 * (p[0] + q[0]), cz = 0.5 * (p[1] + q[1]); return [cx + tau * (p[0] - cx), cz + tau * (p[1] - cz)]; });
      };
      rounding = { length_mm: ell, start_mm: y0, strips: mRound };
    }
    const ns = ys.length - 1;
    const nodes = new Float64Array(3 * (ni + 1) * (ns + 1)), sections = [];
    for (let j = 0; j <= ns; j++) {
      const y = ys[j], pts = loop(y, nHalf);
      if (pts && pts.length !== ni + 1) throw new Error('A section loop must have 2 nHalf + 1 points.');
      for (let i = 0; i <= ni; i++) {
        const P = Geometry.transformPoint(g, y, pts ? pts[i] : [0, 0]), o = 3 * (j * (ni + 1) + i);
        nodes[o] = P[0]; nodes[o + 1] = P[1]; nodes[o + 2] = P[2];
      }
      const st = Geometry.stationAt(g, y);
      sections.push({ y, chord: st.chord, xLE: st.xLE, zLE: st.zLE, incidenceDeg: st.incidenceDeg, collapsed: !pts });
    }
    if (!closed && sections[ns].collapsed) throw new Error('Only closed elliptic or delta tips may collapse to a point.');
    const roundedTip = !!rounding; // the tip edge closes the surface: no cap panels
    const node = (i, j) => j * (ni + 1) + i;
    const quads = [];
    for (let j = 0; j < ns; j++) for (let i = 0; i < ni; i++) quads.push(node(i, j), node(i + 1, j), node(i + 1, j + 1), node(i, j + 1));
    const wingPanels = ni * ns;
    const hasCap = !sections[ns].collapsed && !roundedTip;
    if (hasCap) for (let i = 0; i < nHalf; i++) quads.push(node(i, ns), node(i + 1, ns), node(ni - i - 1, ns), node(ni - i, ns));
    const S = buildSurface(nodes, Int32Array.from(quads));
    if (S.count > limits.maxPanels) throw new Error(`The panel mesh has ${S.count} panels; at most ${limits.maxPanels} are allowed in the browser.`);
    for (let k = wingPanels; k < S.count; k++) if (!(S.PN[3 * k + 1] > 0.99)) throw new Error('Tip-cap panel orientation check failed.');
    const index = (i, j) => j * ni + i;
    // a rounded tip closes the surface: the last row continues across the tip edge onto the opposite surface
    const patches = [{ ni, nj: ns, index, iMode: 'open', jMode: 'mirror', ...(roundedTip ? { jEnd: 'seam', seam: i => ni - 1 - i } : {}) }];
    if (hasCap) patches.push({ ni: nHalf, nj: 1, index: i => wingPanels + i, iMode: 'open', jMode: 'open', cross: i => [index(i, ns - 1), index(ni - 1 - i, ns - 1)] });
    // Morino Kutta condition: wake doublet = upper minus lower trailing-edge panel doublet. (A linear
    // extrapolation of each surface doublet to the TE edge was tested on exact Karman-Trefftz wings and
    // converged erratically, so it is not offered.) Weights are stored generally for the assembly.
    const kutta = 'centroid', width = 4;
    const wake = { count: ns, a: new Float64Array(3 * ns), b: new Float64Array(3 * ns), dir: m.wakeDirection ? m.wakeDirection.slice() : [1, 0, 0], upper: new Int32Array(ns), lower: new Int32Array(ns), kutta, kuttaWidth: width, kuttaPanels: new Int32Array(width * ns), kuttaWeights: new Float64Array(width * ns) };
    for (let j = 0; j < ns; j++) {
      for (let c = 0; c < 3; c++) { wake.a[3 * j + c] = nodes[3 * node(0, j) + c]; wake.b[3 * j + c] = nodes[3 * node(0, j + 1) + c]; }
      wake.upper[j] = index(ni - 1, j); wake.lower[j] = index(0, j);
      const side = (k1, k2, sign, o) => {
        wake.kuttaPanels[width * j + o] = k1; wake.kuttaWeights[width * j + o] = sign;
        wake.kuttaPanels[width * j + o + 1] = k2; wake.kuttaWeights[width * j + o + 1] = 0;
      };
      side(index(ni - 1, j), index(ni - 2, j), 1, 0); side(index(0, j), index(1, j), -1, 2);
    }
    const blocks = Array.from({ length: ns }, (_, j) => [j * ni, ni]);
    if (hasCap) blocks.push([wingPanels, nHalf]);
    return { S, layout: { patches }, wake, ys, sections, nHalf, ni, ns, wingPanels, hasCap, closedTip: closed, roundedTip: rounding, blocks, options: { chordPanels: nHalf, spanPanels: m.spanPanels, spanSpacing: m.spanSpacing, farField: m.farField, tipClosure: m.tipClosure, kutta }, index };
  }

  // ------------------------------------------------------------------ reference quantities
  function references(g) {
    const L = g.semiSpan, N = 400;
    let S = 0, Sc2 = 0, Scy = 0, Sx = 0, Sz = 0;
    // y = L sin(theta): smooth integrands for square-root (elliptic) chord laws; Simpson in theta.
    for (let k = 0; k <= N; k++) {
      const th = (Math.PI / 2) * k / N, y = L * Math.sin(th), w = (k === 0 || k === N ? 1 : k % 2 ? 4 : 2) * (Math.PI / 2) / (3 * N) * L * Math.cos(th);
      const st = Geometry.stationAt(g, Math.min(L, y)), c = st.chord;
      S += w * c; Sc2 += w * c * c; Scy += w * c * y; Sx += w * c * st.xLE; Sz += w * c * st.zLE;
    }
    const half = Geometry.area(g), mac = Sc2 / S;
    return { semiArea_mm2: half, area_mm2: 2 * half, span_mm: 2 * L, aspectRatio: (2 * L) ** 2 / (2 * half), mac_mm: mac, yMac_mm: Scy / S,
      momentPoint_mm: [Sx / S + 0.25 * mac, 0, Sz / S], areaQuadratureCheck: S / half - 1 };
  }

  // ------------------------------------------------------------------ input checks
  const FLOW_KEYS = ['speed', 'density', 'alphaDeg', 'betaDeg', 'viscosity', 'speedOfSound'];
  const MESH_KEYS = ['chordPanels', 'spanPanels', 'spanSpacing', 'farField', 'tipClosure', 'roundingStrips'];
  function normalizeFlow(raw = {}) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Flow conditions must be an object.');
    for (const k of Object.keys(raw)) if (!FLOW_KEYS.includes(k)) throw new Error(`Unknown flow field "${k}".`);
    const f = { ...DEFAULT_FLOW, ...raw };
    finiteIn(f.speed, 'Speed V (m/s)', 1e-3, 200); finiteIn(f.density, 'Density rho (kg/m^3)', 1e-3, 5);
    finiteIn(f.alphaDeg, 'Angle of attack (deg)', -LIMITS.maxAlphaDeg, LIMITS.maxAlphaDeg);
    if (f.betaDeg !== 0) throw new Error('Sideslip is not supported: this version solves symmetric flight only (beta = 0).');
    finiteIn(f.viscosity, 'Dynamic viscosity (Pa s)', 1e-7, 1e-2); finiteIn(f.speedOfSound, 'Speed of sound in air (m/s)', ...LIMITS.speedOfSound);
    const mach = f.speed / f.speedOfSound;
    if (mach > LIMITS.maxMach) throw new Error(`Mach ${mach.toFixed(3)} exceeds 0.3. This incompressible module has no validated compressibility treatment; reduce the speed.`);
    return Object.freeze({ ...f, mach });
  }
  function normalizeMesh(raw = {}, limits = LIMITS) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Mesh options must be an object.');
    for (const k of Object.keys(raw)) if (!MESH_KEYS.includes(k)) throw new Error(`Unknown mesh field "${k}".`);
    const m = { ...DEFAULT_MESH, ...raw };
    intIn(m.chordPanels, 'Chordwise panels per surface', ...limits.chordPanels); intIn(m.spanPanels, 'Spanwise panels', ...limits.spanPanels);
    if (!['flat', 'rounded'].includes(m.tipClosure)) throw new Error('Tip closure must be flat or rounded.');
    if (m.roundingStrips !== 'auto') intIn(m.roundingStrips, 'Tip rounding strips', 2, 16);
    if (!['sine', 'cosine', 'uniform'].includes(m.spanSpacing)) throw new Error('Span spacing must be sine, cosine or uniform.');
    if (m.farField !== Infinity) finiteIn(m.farField, 'Far-field ratio', 3, 1e9);
    return Object.freeze(m);
  }

  // ------------------------------------------------------------------ prepare (cached) and evaluate
  // options: cache (Map), progress(text), solver ('auto' | 'lu' | 'gmres'), and for analytic benchmark
  // sections only: sectionLoop(y, nHalf) with a sectionKey string identifying it in the cache key.
  function prepare(rawGeometry, rawMesh = {}, options = {}) {
    // options.referenceLimits: larger meshes for Node reference studies only (the Worker never passes it)
    const limits = options.referenceLimits ? { ...LIMITS, ...options.referenceLimits } : LIMITS;
    const g = aeroGeometry(rawGeometry), mesh = normalizeMesh(rawMesh, limits);
    if (options.sectionLoop && typeof options.sectionKey !== 'string') throw new Error('A custom section loop needs a sectionKey for caching.');
    const key = JSON.stringify([GEOMETRY_KEYS.map(k => g[k] ?? null), mesh, options.sectionKey ?? null, options.solver ?? 'auto', options.wakeDirection ?? null, options.gradientScheme ?? 'unfolded']);
    const cache = options.cache;
    if (cache && cache.has(key)) { const hit = cache.get(key); hit.lastCacheHit = true; return hit; }
    const t0 = now(), wm = wingMesh(g, { ...mesh, sectionLoop: options.sectionLoop, wakeDirection: options.wakeDirection }, limits), t1 = now();
    options.progress?.(`Assembling ${wm.S.count} panels with the mirror image and ${wm.wake.count} wake strips...`);
    const sol = unitSolutions(wm.S, { image: true, wake: wm.wake, farField: mesh.farField, solver: options.solver, blocks: wm.blocks });
    // Unit-freestream tangential velocities: V_t(a) = V (cos a Ux + sin a Uz).
    // options.gradientScheme: 'unfolded' (default) or 'legacy' (the previous straight-chord stencil, for comparison only)
    const gs = { scheme: options.gradientScheme ?? 'unfolded' };
    const Ux = surfaceVelocity(wm.S, wm.layout, sol.mux, [1, 0, 0], gs), Uz = surfaceVelocity(wm.S, wm.layout, sol.muz, [0, 0, 1], gs);
    const model = { version: VERSION, key, geometry: g, mesh, wm, sol, Ux, Uz, refs: references(g), timing: { meshMs: t1 - t0, ...sol.timing }, lastCacheHit: false };
    if (cache) { if (cache.size >= LIMITS.modelCache) cache.delete(cache.keys().next().value); cache.set(key, model); }
    return model;
  }

  // Trefftz-plane analysis of the wake trace (y-z plane; wake along +x), per unit V.
  // Midpoint rule for a piecewise-constant doublet trace: each segment is a 2-D doublet panel
  // (point vortices at its ends); normalwash at segment midpoints; D/(rho/2) = -sum mu w l.
  function trefftzMidpoint(trace, mu) {
    const ns = mu.length, segs = [];
    for (let j = 0; j < ns; j++) segs.push({ a: trace[j], b: trace[j + 1], mu: mu[j] });
    for (let j = 0; j < ns; j++) segs.push({ a: [-trace[j + 1][0], trace[j + 1][1]], b: [-trace[j][0], trace[j][1]], mu: mu[j] });
    const grad = (v, P) => { const X = v[0] - P[0], Y = v[1] - P[1], r2 = X * X + Y * Y; return r2 > 0 ? [Y / r2, -X / r2] : [0, 0]; };
    let dragOverHalfRho = 0, liftOverRhoV = 0;
    const wn = new Float64Array(ns);
    for (let i = 0; i < ns; i++) {
      const s = segs[i], ty = s.b[0] - s.a[0], tz = s.b[1] - s.a[1], l = Math.hypot(ty, tz), n = [-tz / l, ty / l], P = [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2];
      let vy = 0, vz = 0;
      for (const q of segs) { const gb = grad(q.b, P), ga = grad(q.a, P), f = q.mu / (2 * Math.PI); vy += f * (gb[0] - ga[0]); vz += f * (gb[1] - ga[1]); }
      wn[i] = vy * n[0] + vz * n[1];
      dragOverHalfRho += -2 * s.mu * wn[i] * l; // x2: the mirror half is identical
      liftOverRhoV += 2 * s.mu * ty;            // side forces of the two halves cancel
    }
    return { dragOverHalfRho, liftOverRhoV, normalwash: wn };
  }
  // The midpoint rule is first order in the strip width (-3.6% on an exact elliptic loading with 16
  // sine-spaced strips). Drag is therefore evaluated on a continuous piecewise-linear reconstruction
  // of the strip strengths (nodes at strip midpoints, mirror-symmetric at the root, zero at the tip),
  // sub-divided `refine` times. Lift is the exact Kutta-Joukowski sum of the discrete wake.
  function trefftz(trace, mu, refine = 16) {
    const ns = mu.length, base = trefftzMidpoint(trace, mu);
    if (refine <= 1) return { ...base, method: 'midpoint' };
    const s = [0]; for (let j = 0; j < ns; j++) s.push(s[j] + Math.hypot(trace[j + 1][0] - trace[j][0], trace[j + 1][1] - trace[j][1]));
    const mid = Array.from({ length: ns }, (_, j) => (s[j] + s[j + 1]) / 2), total = s[ns];
    const muAt = x => {
      if (x <= mid[0]) return mu[0];
      if (x >= mid[ns - 1]) return mu[ns - 1] * (total - x) / (total - mid[ns - 1]);
      let j = 0; while (j < ns - 2 && x > mid[j + 1]) j++;
      return mu[j] + (mu[j + 1] - mu[j]) * (x - mid[j]) / (mid[j + 1] - mid[j]);
    };
    const fine = [trace[0]], fineMu = [];
    for (let j = 0; j < ns; j++) for (let p = 1; p <= refine; p++) {
      const t = p / refine, a = trace[j], b = trace[j + 1];
      fine.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
      fineMu.push(muAt(s[j] + (t - 0.5 / refine) * (s[j + 1] - s[j])));
    }
    const r = trefftzMidpoint(fine, fineMu);
    return { dragOverHalfRho: r.dragOverHalfRho, liftOverRhoV: base.liftOverRhoV, normalwash: base.normalwash, dragMidpointOverHalfRho: base.dragOverHalfRho, method: `piecewise-linear reconstruction, ${refine} sub-segments per strip` };
  }

  function evaluate(model, rawFlow = {}) {
    const flow = normalizeFlow(rawFlow), t0 = now();
    const { wm, sol, refs, geometry: g } = model, S = wm.S, n = S.count;
    const a = flow.alphaDeg * DEG, ca = Math.cos(a), sa = Math.sin(a), V = flow.speed;
    const q = 0.5 * flow.density * V * V, qmm = q * 1e-6; // Pa and N/mm^2
    const eD = [ca, 0, sa], eL = [-sa, 0, ca];
    const mu = new Float64Array(n), cp = new Float64Array(n), force = new Float64Array(3 * n), capForce = [0, 0, 0];
    // The flat tip cap closes the surface for the potential solution, but its pressure is NOT integrated
    // into loads: its trailing corner is the potential-flow edge singularity where the side edge of the wake
    // (the tip vortex) leaves the wing, so the cap Cp there is unbounded under chordwise refinement and the
    // cap force (purely spanwise, since Wing Lab sections lie in planes y = const) does not converge.
    // Cap pressures and that unconverged force are reported separately as diagnostics only.
    let maxCp = -Infinity, minCp = Infinity, capMinCp = null, capMaxCp = null;
    for (let k = 0; k < n; k++) {
      mu[k] = V * (ca * model.sol.mux[k] + sa * model.sol.muz[k]);
      const vx = ca * model.Ux[3 * k] + sa * model.Uz[3 * k], vy = ca * model.Ux[3 * k + 1] + sa * model.Uz[3 * k + 1], vz = ca * model.Ux[3 * k + 2] + sa * model.Uz[3 * k + 2];
      cp[k] = 1 - (vx * vx + vy * vy + vz * vz);
      if (k < wm.wingPanels) { maxCp = Math.max(maxCp, cp[k]); minCp = Math.min(minCp, cp[k]); }
      else { capMinCp = Math.min(capMinCp ?? Infinity, cp[k]); capMaxCp = Math.max(capMaxCp ?? -Infinity, cp[k]); }
      const f = -cp[k] * qmm * S.PA[k];
      if (k < wm.wingPanels) { force[3 * k] = f * S.PN[3 * k]; force[3 * k + 1] = f * S.PN[3 * k + 1]; force[3 * k + 2] = f * S.PN[3 * k + 2]; }
      else for (let d = 0; d < 3; d++) capForce[d] += f * S.PN[3 * k + d];
    }
    // semi-wing resultants (right half, body axes): about the root origin and about the moment point
    const sum = (from, to, ref) => { const F = [0, 0, 0], M = [0, 0, 0]; for (let k = from; k < to; k++) { const fx = force[3 * k], fy = force[3 * k + 1], fz = force[3 * k + 2], rx = S.PC[3 * k] - ref[0], ry = S.PC[3 * k + 1] - ref[1], rz = S.PC[3 * k + 2] - ref[2]; F[0] += fx; F[1] += fy; F[2] += fz; M[0] += ry * fz - rz * fy; M[1] += rz * fx - rx * fz; M[2] += rx * fy - ry * fx; } return { F, M }; };
    const origin = sum(0, n, [0, 0, 0]), atRef = sum(0, n, refs.momentPoint_mm);
    const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    const Sref = refs.area_mm2, liftFull = 2 * dot(origin.F, eL), dragFull = 2 * dot(origin.F, eD), pitchFull = 2 * atRef.M[1];
    const CL = liftFull / (qmm * Sref), CDp = dragFull / (qmm * Sref), Cm = pitchFull / (qmm * Sref * refs.mac_mm);
    // strips
    const strips = [], wakeMu = new Float64Array(wm.ns), trace = [];
    for (let j = 0; j < wm.ns; j++) trace.push([wm.wake.a[3 * j + 1], wm.wake.a[3 * j + 2]]);
    trace.push([wm.wake.b[3 * (wm.ns - 1) + 1], wm.wake.b[3 * (wm.ns - 1) + 2]]);
    let kuttaMax = 0, kuttaInterior = 0;
    for (let j = 0; j < wm.ns; j++) {
      const y0 = wm.ys[j], y1 = wm.ys[j + 1], ym = 0.5 * (y0 + y1), st = Geometry.stationAt(g, ym), chord = st.chord;
      const qc = Geometry.transformPoint(g, ym, [0.25 * chord, 0]);
      const F = [0, 0, 0], M = [0, 0, 0]; let Xz = 0;
      for (let i = 0; i < wm.ni; i++) {
        const k = wm.index(i, j), fx = force[3 * k], fy = force[3 * k + 1], fz = force[3 * k + 2], rx = S.PC[3 * k] - qc[0], ry = S.PC[3 * k + 1] - qc[1], rz = S.PC[3 * k + 2] - qc[2];
        F[0] += fx; F[1] += fy; F[2] += fz; M[0] += ry * fz - rz * fy; M[1] += rz * fx - rx * fz; M[2] += rx * fy - ry * fx; Xz += fz * S.PC[3 * k];
      }
      { let g = 0; for (let q = 0; q < wm.wake.kuttaWidth; q++) g += wm.wake.kuttaWeights[q + wm.wake.kuttaWidth * j] * mu[wm.wake.kuttaPanels[q + wm.wake.kuttaWidth * j]]; wakeMu[j] = g; }
      const dCpTE = cp[wm.wake.upper[j]] - cp[wm.wake.lower[j]]; kuttaMax = Math.max(kuttaMax, Math.abs(dCpTE));
      if (y1 <= 0.9 * g.semiSpan) kuttaInterior = Math.max(kuttaInterior, Math.abs(dCpTE));
      const dy = y1 - y0, lift = dot(F, eL);
      strips.push({ y0, y1, yMid: ym, chord, force_N: F, momentAboutQuarterChord_Nmm: M, quarterChordPoint_mm: qc,
        cl: chord > 0 ? lift / (qmm * chord * dy) : 0, clKuttaJoukowski: chord > 0 ? 2 * wakeMu[j] / (V * chord) : 0,
        xCenterOfPressure_mm: Math.abs(F[2]) > 0 ? Xz / F[2] : null, gamma: wakeMu[j], trailingEdgeDeltaCp: dCpTE });
    }
    const tr = trefftz(trace, Array.from(wakeMu, v => v / V));
    const CLt = 2 * tr.liftOverRhoV / Sref, CDi = tr.dragOverHalfRho / Sref; // per unit V: L/(q S) = 2 (L/rhoV)/(V S)
    const ar = refs.aspectRatio, e = CDi > 1e-12 && Math.abs(CLt) > 1e-6 ? CLt * CLt / (Math.PI * ar * CDi) : null;
    const reynolds = flow.density * V * (refs.mac_mm * 1e-3) / flow.viscosity;
    const warnings = [];
    const incid = (g.stations || []).map(s => s.incidenceDeg), aLocal = Math.max(...[0, ...incid].map(i => Math.abs(flow.alphaDeg + i)));
    if (aLocal > LIMITS.warnAlphaDeg) warnings.push(`Local geometric angle reaches ${aLocal.toFixed(1)} deg. This attached-flow model does not predict stall; treat results beyond the linear range as unsupported.`);
    if (flow.mach > LIMITS.warnMach) warnings.push(`Mach ${flow.mach.toFixed(3)}: compressibility (about ${(100 * (1 / Math.sqrt(1 - flow.mach ** 2) - 1)).toFixed(1)}% Prandtl-Glauert) is not applied.`);
    if (reynolds < LIMITS.lowReynolds) warnings.push(`Reynolds number ${reynolds.toExponential(2)} (mean aerodynamic chord): laminar separation and low-Re effects can reduce lift slope and maximum lift substantially; inviscid results are optimistic.`);
    if (g.planform === 'delta' || Math.abs(g.sweepDeg || 0) > 45) warnings.push('Highly swept or delta planform: leading-edge vortex lift is not modelled; attached-flow results are not reliable beyond small angles.');
    if (!wm.closedTip && g.tipChord < 0.05 * g.rootChord) warnings.push(`Tip chord ${(100 * g.tipChord / g.rootChord).toPrecision(2)}% of the root chord: the tip panels become slivers and local tip pressures are unreliable. For a pointed tip use the exact delta or elliptic closed-tip planform.`);
    if (kuttaInterior > 0.1) warnings.push(`Trailing-edge pressure mismatch up to ${kuttaInterior.toFixed(3)} (Cp) inboard of 90% semi-span: refine the chordwise mesh near the trailing edge.`);
    const dCL = CL !== 0 ? Math.abs(CLt - CL) / Math.abs(CL) : 0;
    if (dCL > 0.03 && Math.abs(CL) > 0.05) warnings.push(`Pressure-integrated and Trefftz lift differ by ${(100 * dCL).toFixed(1)}%: the mesh is too coarse for load use.`);
    if (maxCp > 1.02) warnings.push(`Maximum Cp ${maxCp.toFixed(3)} exceeds the stagnation value 1: the local mesh is inadequate.`);
    return {
      version: VERSION, scope: SCOPE, flow: { ...flow, dynamicPressure_Pa: q, reynoldsMac: reynolds },
      reference: refs, mesh: { panels: n, wingPanels: wm.wingPanels, tipCapPanels: n - wm.wingPanels, wakeStrips: wm.ns, chordPanelsPerSurface: wm.nHalf, spanStations: wm.ys.slice(), closedTip: wm.closedTip, roundedTip: wm.roundedTip, maxWarpRatio: S.maxWarpRatio, ...model.mesh },
      coefficients: { CL, CDpressure: CDp, CDiTrefftz: CDi, CLTrefftz: CLt, Cm, spanEfficiencyTrefftz: e },
      aircraft: { lift_N: liftFull, dragPressure_N: dragFull, dragInducedTrefftz_N: CDi * qmm * Sref, pitchingMomentAboutReference_Nmm: pitchFull },
      semiWing: { force_N: origin.F, momentAboutRootOrigin_Nmm: origin.M, momentAboutReference_Nmm: atRef.M,
        tipCap: wm.hasCap ? { integrated: false, unconvergedPressureForce_N: capForce, minCp: capMinCp, maxCp: capMaxCp } : null },
      strips, panels: { cp, mu, force_N: force, centroid_mm: S.PC, normal: S.PN, area_mm2: S.PA, count: n, wingPanels: wm.wingPanels },
      diagnostics: { maxCp, minCp, tipCapMinCp: capMinCp, tipCapMaxCp: capMaxCp, trailingEdgeDeltaCpMax: kuttaMax, trailingEdgeDeltaCpInboard90: kuttaInterior, liftTrefftzRelativeDifference: dCL,
        linearSolver: sol.method, gmresIterations: sol.iterations, linearRelativeResidual: sol.relativeResidual, trefftzDragMethod: tr.method, normalwashTrefftz: tr.normalwash },
      warnings, timing: { ...model.timing, evaluateMs: now() - t0 },
    };
  }
  function solve(rawGeometry, rawFlow = {}, rawMesh = {}, options = {}) { return evaluate(prepare(rawGeometry, rawMesh, options), rawFlow); }

  // Angle of attack giving a target aircraft lift (both halves, N) at the given speed and density.
  // Uses the cached unit solutions (no new linear solve). Secant iteration on the attached-flow model;
  // the answer is refused outside the admitted angle range rather than extrapolated.
  function alphaForLift(model, rawFlow, targetLift_N) {
    finiteIn(targetLift_N, 'Target lift (N)', -1e6, 1e6);
    const lift = a => evaluate(model, { ...rawFlow, alphaDeg: a }).aircraft.lift_N - targetLift_N;
    let a0 = 0, a1 = 4, f0 = lift(a0), f1 = lift(a1);
    for (let it = 0; it < 40; it++) {
      if (Math.abs(f1) <= 1e-10 * Math.max(1, Math.abs(targetLift_N))) break;
      const a2 = a1 - f1 * (a1 - a0) / (f1 - f0);
      if (!Number.isFinite(a2) || Math.abs(a2) > LIMITS.maxAlphaDeg) throw new Error(`The target lift needs |alpha| > ${LIMITS.maxAlphaDeg} deg at this speed and density, outside the attached-flow range of this module.`);
      a0 = a1; f0 = f1; a1 = a2; f1 = lift(a1);
    }
    return { alphaDeg: a1, residual_N: f1 };
  }
  // Chordwise Cp along one spanwise strip, split into lower and upper surfaces (x/c on the local chord).
  function stripChordwiseCp(model, result, j) {
    const wm = model.wm, g = model.geometry, S = wm.S;
    if (!Number.isInteger(j) || j < 0 || j >= wm.ns) throw new Error('Strip index out of range.');
    const lower = [], upper = [];
    for (let i = 0; i < wm.ni; i++) {
      const k = wm.index(i, j), c = [S.PC[3 * k], S.PC[3 * k + 1], S.PC[3 * k + 2]], chord = Geometry.chordAt(g, c[1]);
      const local = Geometry.inversePoint(g, c), xc = chord > 0 ? local[0] / chord : 0;
      (i < wm.nHalf ? lower : upper).push([xc, result.panels.cp[k]]);
    }
    lower.reverse();
    return { y_mm: result.strips[j].yMid, chord_mm: result.strips[j].chord, lower, upper };
  }
  // Structured-clone-friendly summary for a Worker reply or a study report (no per-panel arrays).
  function compactResult(model, result, options = {}) {
    const { panels, diagnostics, ...rest } = result;
    const { normalwashTrefftz, ...diag } = diagnostics;
    return { ...rest, diagnostics: diag, stripLoads: stripWrenches(result), chordwise: options.chordwise === false ? null : result.strips.map((_, j) => stripChordwiseCp(model, result, j)) };
  }
  // ------------------------------------------------------------------ panel resultant about any point
  function resultantOfPanels(result, about = [0, 0, 0]) {
    const P = result.panels, F = [0, 0, 0], M = [0, 0, 0];
    for (let k = 0; k < P.count; k++) { const f = [P.force_N[3 * k], P.force_N[3 * k + 1], P.force_N[3 * k + 2]], dx = P.centroid_mm[3 * k] - about[0], dy = P.centroid_mm[3 * k + 1] - about[1], dz = P.centroid_mm[3 * k + 2] - about[2]; for (let d = 0; d < 3; d++) F[d] += f[d]; M[0] += dy * f[2] - dz * f[1]; M[1] += dz * f[0] - dx * f[2]; M[2] += dx * f[1] - dy * f[0]; }
    return { force: F, moment: M };
  }
  // ------------------------------------------------------------------ six-component strip loads
  // Exact algebra of the structural transfer (aerostruct/engine.js uses the same definition):
  //   strip j on [y0, y1] has the pressure resultant force F_j and moment M_j about the aircraft origin;
  //   it is carried as a uniform force intensity f_j = F_j / (y1 - y0) on the load line
  //   r(y) = transformPoint(g, y, [0.25 c(y), 0]) plus a uniform couple intensity
  //   m_j = (M_j - (integral of r dy over [y0, y1]) x f_j) / (y1 - y0).
  //   Then the integral of f is F_j and the integral of r x f + m is M_j, so the force and the moment about
  //   ANY point equal those of the panel pressures (to the quadrature tolerance of the line integral).
  const LOAD_LINE_FRACTION = 0.25;
  const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const GAUSS4 = [[0.06943184420297371, 0.1739274225687269], [0.33000947820757187, 0.3260725774312731], [0.6699905217924281, 0.3260725774312731], [0.9305681557970262, 0.1739274225687269]];
  // Adaptive 4-point Gauss-Legendre quadrature of a vector function (bisection until two levels agree).
  function adaptiveIntegral(fn, a, b, tolerance = 1e-12, depth = 20) {
    const gauss = (lo, hi) => { let out = null; for (const [t, w] of GAUSS4) { const v = fn(lo + t * (hi - lo)); if (!out) out = new Array(v.length).fill(0); for (let i = 0; i < v.length; i++) out[i] += v[i] * w * (hi - lo); } return out; };
    const refine = (lo, hi, whole, d) => {
      const mid = 0.5 * (lo + hi), left = gauss(lo, mid), right = gauss(mid, hi), sum = left.map((v, i) => v + right[i]);
      let rel = 0; for (let i = 0; i < sum.length; i++) rel = Math.max(rel, Math.abs(sum[i] - whole[i]) / Math.max(1, Math.abs(sum[i])));
      if (d === 0 || rel <= tolerance) return sum;
      const x = refine(lo, mid, left, d - 1), y = refine(mid, hi, right, d - 1); return x.map((v, i) => v + y[i]);
    };
    return refine(a, b, gauss(a, b), depth);
  }
  function loadLinePoint(g, y, fraction = LOAD_LINE_FRACTION) { return Geometry.transformPoint(g, y, [fraction * Geometry.chordAt(g, y), 0]); }
  function lineIntegral(g, a, b, fraction = LOAD_LINE_FRACTION) { return b > a ? adaptiveIntegral(y => loadLinePoint(g, y, fraction), a, b) : [0, 0, 0]; }
  // Rows [y0, y1, Fx, Fy, Fz, Mx, My, Mz] of the wing-surface strips (moment about the aircraft origin). The flat
  // tip cap, if any, is excluded exactly as in evaluate(); the rows sum to semiWing.force_N and momentAboutRootOrigin_Nmm.
  function stripWrenches(result) {
    const P = result.panels, ni = 2 * result.mesh.chordPanelsPerSurface;
    return result.strips.map((st, j) => {
      const w = [st.y0, st.y1, 0, 0, 0, 0, 0, 0];
      for (let i = 0; i < ni; i++) {
        const k = j * ni + i, fx = P.force_N[3 * k], fy = P.force_N[3 * k + 1], fz = P.force_N[3 * k + 2], x = P.centroid_mm[3 * k], y = P.centroid_mm[3 * k + 1], z = P.centroid_mm[3 * k + 2];
        w[2] += fx; w[3] += fy; w[4] += fz; w[5] += y * fz - z * fy; w[6] += z * fx - x * fz; w[7] += x * fy - y * fx;
      }
      return w;
    });
  }
  function checkRows(rows, L, name) {
    if (!Array.isArray(rows) || !rows.length) throw new Error(`${name}: give at least one strip.`);
    rows.forEach((r, i) => {
      if (!Array.isArray(r) || r.length !== 8 || !r.every(Number.isFinite)) throw new Error(`${name}: strip ${i + 1} must be [y0, y1, Fx, Fy, Fz, Mx, My, Mz] with finite numbers.`);
      if (!(r[0] >= 0 && r[1] > r[0] && r[1] <= L * (1 + 1e-12))) throw new Error(`${name}: strip ${i + 1} must satisfy 0 <= y0 < y1 <= semi-span.`);
      if (i && Math.abs(r[0] - rows[i - 1][1]) > 1e-9 * L) throw new Error(`${name}: strips must be contiguous from the root to the tip.`);
    });
    if (rows[0][0] !== 0 || Math.abs(rows[rows.length - 1][1] - L) > 1e-9 * L) throw new Error(`${name}: strips must cover the semi-span from y = 0 to the tip.`);
  }
  // Uniform force and couple intensities of each strip (see the algebra above).
  function stripRepresentation(g, rows, fraction = LOAD_LINE_FRACTION) {
    return rows.map(r => {
      const [y0, y1] = r, h = y1 - y0, F = r.slice(2, 5), M = r.slice(5, 8), f = F.map(v => v / h), c = cross3(lineIntegral(g, y0, y1, fraction), f);
      return { y0, y1, F, M, f, m: M.map((v, d) => (v - c[d]) / h) };
    });
  }
  // Wrench [F; M about the origin] of the load-line part beyond y* of a strip representation (exact for it).
  function outboardOfStation(g, rep, ystar, fraction = LOAD_LINE_FRACTION) {
    const W = [0, 0, 0, 0, 0, 0];
    for (const s of rep) {
      if (s.y1 <= ystar) continue;
      if (s.y0 >= ystar) { for (let d = 0; d < 3; d++) { W[d] += s.F[d]; W[3 + d] += s.M[d]; } continue; }
      const h = s.y1 - ystar, c = cross3(lineIntegral(g, ystar, s.y1, fraction), s.f);
      for (let d = 0; d < 3; d++) { W[d] += s.f[d] * h; W[3 + d] += c[d] + s.m[d] * h; }
    }
    return W;
  }
  // Monotone piecewise-cubic Hermite interpolation (Fritsch & Carlson 1980; end slopes as in Moler's pchip).
  function pchip(x, v) {
    const n = x.length, h = new Float64Array(n - 1), del = new Float64Array(n - 1), d = new Float64Array(n);
    for (let i = 0; i < n - 1; i++) { h[i] = x[i + 1] - x[i]; del[i] = (v[i + 1] - v[i]) / h[i]; }
    if (n === 2) { d[0] = d[1] = del[0]; }
    else {
      for (let i = 1; i < n - 1; i++) if (del[i - 1] * del[i] > 0) { const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; d[i] = (w1 + w2) / (w1 / del[i - 1] + w2 / del[i]); }
      const end = (h0, h1, d0, d1) => { let s = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1); if (Math.sign(s) !== Math.sign(d0)) s = 0; else if (Math.sign(d0) !== Math.sign(d1) && Math.abs(s) > Math.abs(3 * d0)) s = 3 * d0; return s; };
      d[0] = end(h[0], h[1], del[0], del[1]); d[n - 1] = end(h[n - 2], h[n - 3], del[n - 2], del[n - 3]);
    }
    return t => {
      if (t <= x[0]) return v[0]; if (t >= x[n - 1]) return v[n - 1];
      let lo = 0, hi = n - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (x[mid] <= t) lo = mid; else hi = mid; }
      const s = (t - x[lo]) / h[lo], s2 = s * s, s3 = s2 * s;
      return (2 * s3 - 3 * s2 + 1) * v[lo] + (s3 - 2 * s2 + s) * h[lo] * d[lo] + (-2 * s3 + 3 * s2) * v[lo + 1] + (s3 - s2) * h[lo] * d[lo + 1];
    };
  }
  // Outboard (cut) wrench of one mesh level as a continuous function of the station: exact sums at the level's
  // strip boundaries, PCHIP between them (a smooth reconstruction, used to combine levels with different strips).
  function cumulativeWrench(rows) {
    const n = rows.length, x = [rows[0][0], ...rows.map(r => r[1])], v = Array.from({ length: 6 }, () => new Float64Array(n + 1));
    for (let k = n - 1; k >= 0; k--) for (let d = 0; d < 6; d++) v[d][k] = v[d][k + 1] + rows[k][2 + d];
    const f = v.map(c => pchip(x, c));
    return { x, at: y => f.map(fn => fn(y)) };
  }

  // ------------------------------------------------------------------ mesh-refinement sequence and admission
  // A sequence refines the chordwise panels at a fixed spanwise mesh and the spanwise strips at a fixed
  // chordwise mesh (7 solves; the base mesh is shared). Each direction has four levels with 1/n proportional
  // to 6 : 4 : 3 : 2. The delivered load is the Richardson extrapolation of the quadratic polynomial in 1/n
  // through the three finest levels of each direction, combined additively:
  //   Q_ext = Q_chord(1/c -> 0) + Q_span(1/s -> 0) - Q(base).
  // The same fixed level weights apply to every quantity, so the extrapolated strip loads, their resultants and
  // the cut loads are one consistent, exactly conservative load set. The uncertainty of Q_ext is
  //   U = Fs * sum over the two directions of max( spread + stability, kappa * |correction| ),
  // spread = largest difference between the linear (two finest), quadratic (three finest) and observed-order
  // (Celik et al. 2008, order bounded to [0.5, 2]) extrapolations, stability = change of the quadratic
  // extrapolation when the three coarser levels are used instead, correction = quadratic extrapolation minus the
  // finest level (what the extrapolation added), Fs = 1.25, kappa = 0.5. The correction term keeps U from
  // claiming that an extrapolation removed more than half of its own correction when the levels agree with each
  // other but are not yet asymptotic (the spanwise observed order still falls from about 0.9 to 0.7 between 32
  // and 96 strips). Validated against far finer reference meshes (validation/reference_study.mjs) in
  // test_wing_aero_admission.mjs and the documentation.
  const SEQUENCES = Object.freeze({
    standard: Object.freeze({ label: 'Standard', chord: Object.freeze([16, 24, 32, 48]), span: Object.freeze([8, 12, 16, 24]), baseChord: 32, baseSpan: 16 }),
    fine: Object.freeze({ label: 'Fine', chord: Object.freeze([32, 48, 64, 96]), span: Object.freeze([16, 24, 32, 48]), baseChord: 32, baseSpan: 16 }),
  });
  // Admission (no absolute torque floor; every criterion is stated in the admission table):
  //  * torque at each structural cut is RESOLVED only if U_T <= 10% of |T| AND every mesh that carries weight in the
  //    delivered load gives a torque of the same sign as T. Otherwise its magnitude is not resolved, and its sign is
  //    not resolved either if U_T >= |T| or the meshes disagree in sign. Torque values are shown only if every
  //    reported cut is resolved.
  //  * twist (needs the structure): with the frame elements' torsional compliance k = (element length / projected
  //    length) / GJ (twist per unit torque per unit projected span) the twist uncertainty is
  //        dtheta(y) = integral from 0 to y of Ubar(eta) k(eta) d eta,
  //    Ubar = upper envelope of U_T at 16 equally spaced cuts (zero at the tip). The twist claim is
  //        'resolved'   every reported torque resolved and dtheta <= 10% |theta| at 25, 50, 75% span and at the tip;
  //        'negligible' otherwise, if the bound on the true twist |theta| + dtheta, applied as an incidence change with
  //                     the thin-airfoil lift slope 2 pi (an upper bound for the sectional response), changes the
  //                     semi-wing lift by at most 1% (half the lift-consistency tolerance):
  //                     q 2 pi integral of c (|theta| + dtheta) dy <= 0.01 |L|. Torque and twist values are withheld
  //                     (only the bound is reported); the rest of the coupled result is shown;
  //        'unresolved' otherwise: the coupled result is withheld (the app refuses rather than overclaims).
  //  * one-way coupling (needs the structure): the load is computed on the rigid wing, so the computed twist itself,
  //    applied as an incidence change with the same lift slope, must change the lift by at most 2% (the
  //    lift-consistency tolerance); a more flexible wing is refused (aeroelastic redistribution is not modelled);
  //  * root force and root bending moment: U / magnitude <= 5%; lift: extrapolated pressure and Trefftz-plane lift
  //    within 2% of max(|CL|, 0.05).
  const ADMISSION = Object.freeze({ safetyFactor: 1.25, correctionFraction: 0.5, orderBounds: Object.freeze([0.5, 2]),
    torqueTolerance: 0.10, twistTolerance: 0.10, twistLiftFraction: 0.01, sectionLiftSlope: 2 * Math.PI, torsionStations: 16, rigidWingTolerance: 0.02,
    forceTolerance: 0.05, bendingTolerance: 0.05, liftConsistencyTolerance: 0.02, liftConsistencyFloorCL: 0.05,
    stations: Object.freeze([0.25, 0.5, 0.75]) });
  function sequenceDefinition(name) { const d = SEQUENCES[name]; if (!d) throw new Error(`Unknown mesh sequence "${name}": use ${Object.keys(SEQUENCES).join(' or ')}.`); return d; }
  function sequenceMeshes(name) {
    const d = sequenceDefinition(name), list = [], add = (c, s) => { if (!list.some(m => m.chordPanels === c && m.spanPanels === s)) list.push({ chordPanels: c, spanPanels: s }); };
    d.chord.forEach(c => add(c, d.baseSpan)); d.span.forEach(s => add(d.baseChord, s));
    return list;
  }
  // Lagrange weights of the polynomial through (h_i, Q_i) evaluated at h = 0.
  const lagrangeWeights0 = h => h.map((hi, i) => h.reduce((w, hj, j) => (j === i ? w : w * (0 - hj) / (hi - hj)), 1));
  function sequenceWeights(name) {
    const d = sequenceDefinition(name), w = new Map(), add = (c, s, v) => { const k = c + 'x' + s; w.set(k, (w.get(k) || 0) + v); };
    const three = a => a.slice(a.length - 3), wc = lagrangeWeights0(three(d.chord).map(v => 1 / v)), ws = lagrangeWeights0(three(d.span).map(v => 1 / v));
    three(d.chord).forEach((c, i) => add(c, d.baseSpan, wc[i])); three(d.span).forEach((s, i) => add(d.baseChord, s, ws[i])); add(d.baseChord, d.baseSpan, -1);
    return [...w.entries()].map(([k, v]) => { const [c, s] = k.split('x').map(Number); return { chordPanels: c, spanPanels: s, weight: v }; }).filter(x => Math.abs(x.weight) > 1e-12);
  }
  // Observed order of convergence from three levels n3 < n2 < n1 (Celik et al. 2008, non-uniform ratios).
  function observedOrder(n3, n2, n1, f3, f2, f1, bounds = ADMISSION.orderBounds) {
    const r21 = n1 / n2, r32 = n2 / n3, e21 = f2 - f1, e32 = f3 - f2, scale = Math.max(Math.abs(f1), Math.abs(f2), Math.abs(f3), 1e-300);
    if (Math.abs(e21) <= 1e-13 * scale || Math.abs(e32) <= 1e-13 * scale) return { order: null, orderUsed: null, monotone: false, extrapolated: f1 };
    const sgn = Math.sign(e32 / e21);
    if (sgn < 0) return { order: null, orderUsed: 1, monotone: false, extrapolated: f1 + (f1 - f2) / (r21 - 1) }; // oscillatory: first order
    let p = 1;
    for (let it = 0; it < 200; it++) { const pn = Math.abs(Math.log(Math.abs(e32 / e21)) + Math.log((r21 ** p - 1) / (r32 ** p - 1))) / Math.log(r21); if (!Number.isFinite(pn)) { p = NaN; break; } if (Math.abs(pn - p) < 1e-12) { p = pn; break; } p = pn; }
    const used = Number.isFinite(p) ? Math.min(bounds[1], Math.max(bounds[0], p)) : 1;
    return { order: Number.isFinite(p) ? p : null, orderUsed: used, monotone: true, extrapolated: f1 + (f1 - f2) / (r21 ** used - 1) };
  }
  // Extrapolated value and uncertainty of a scalar that is linear in the level loads: levelValue(c, s).
  function sequenceEstimate(name, levelValue, settings = ADMISSION) {
    const d = sequenceDefinition(name);
    const dir = (ns, val) => {
      const m = ns.length, h = ns.map(v => 1 / v), Q = ns.map(val), lin = (a, w) => w.reduce((t, wi, i) => t + wi * Q[a + i], 0);
      const quad = lin(m - 3, lagrangeWeights0(h.slice(m - 3))), quad0 = lin(m - 4, lagrangeWeights0(h.slice(m - 4, m - 1))), linear = lin(m - 2, lagrangeWeights0(h.slice(m - 2)));
      const ob = observedOrder(ns[m - 3], ns[m - 2], ns[m - 1], Q[m - 3], Q[m - 2], Q[m - 1], settings.orderBounds);
      const spread = Math.max(Math.abs(quad - linear), Math.abs(quad - ob.extrapolated), Math.abs(ob.extrapolated - linear)), stability = Math.abs(quad - quad0);
      const correction = quad - Q[m - 1], kappa = settings.correctionFraction ?? ADMISSION.correctionFraction, term = Math.max(spread + stability, kappa * Math.abs(correction));
      return { levels: ns.slice(), values: Q, quadratic: quad, linear, observed: ob.extrapolated, observedOrder: ob.order, monotone: ob.monotone, quadraticCoarse: quad0, spread, stability, finest: Q[m - 1],
        correction, term, correctionGoverns: kappa * Math.abs(correction) > spread + stability };
    };
    const chord = dir(d.chord, c => levelValue(c, d.baseSpan)), span = dir(d.span, s => levelValue(d.baseChord, s)), base = levelValue(d.baseChord, d.baseSpan);
    return { value: chord.quadratic + span.quadratic - base, uncertainty: settings.safetyFactor * (chord.term + span.term),
      base, finest: chord.finest + span.finest - base, chord, span };
  }
  // Runs every mesh of a sequence (Worker or Node). Models are cached by geometry and mesh, so a new angle of
  // attack or speed on the same wing costs only the surface evaluations. options: cache, progress(text),
  // targetLift_N (trims alpha so the EXTRAPOLATED pressure lift of both halves equals it), tipClosure, solver.
  function runSequence(rawGeometry, rawFlow = {}, name = 'standard', options = {}) {
    const def = sequenceDefinition(name), meshes = sequenceMeshes(name), cache = options.cache || new Map(), t0 = now();
    const tipClosure = options.tipClosure ?? DEFAULT_MESH.tipClosure;
    const models = meshes.map((m, i) => {
      options.progress?.(`Mesh ${i + 1} of ${meshes.length}: ${2 * m.chordPanels} × ${m.spanPanels} panels (around × spanwise)…`);
      return prepare(rawGeometry, { ...m, tipClosure }, { cache, solver: options.solver, referenceLimits: options.referenceLimits });
    });
    const weights = sequenceWeights(name), weightOf = m => weights.find(w => w.chordPanels === m.chordPanels && w.spanPanels === m.spanPanels)?.weight || 0;
    let alphaDeg = normalizeFlow(rawFlow).alphaDeg, trim = null;
    if (options.targetLift_N != null) {
      finiteIn(options.targetLift_N, 'Target lift (N)', -1e6, 1e6);
      const lift = a => models.reduce((t, model, i) => t + weightOf(meshes[i]) * evaluate(model, { ...rawFlow, alphaDeg: a }).aircraft.lift_N, 0) - options.targetLift_N;
      let a0 = 0, a1 = 4, f0 = lift(a0), f1 = lift(a1);
      for (let it = 0; it < 40 && Math.abs(f1) > 1e-10 * Math.max(1, Math.abs(options.targetLift_N)); it++) {
        const a2 = a1 - f1 * (a1 - a0) / (f1 - f0);
        if (!Number.isFinite(a2) || Math.abs(a2) > LIMITS.maxAlphaDeg) throw new Error(`The target lift needs |alpha| > ${LIMITS.maxAlphaDeg} deg at this speed and density, outside the attached-flow range of this module.`);
        a0 = a1; f0 = f1; a1 = a2; f1 = lift(a1);
      }
      alphaDeg = a1; trim = { alphaDeg: a1, residual_N: f1, liftMeasure: 'extrapolated pressure lift of both halves' };
    }
    const flow = { ...rawFlow, alphaDeg }, results = models.map(model => evaluate(model, flow));
    const levels = results.map((r, i) => ({ chordPanels: meshes[i].chordPanels, spanPanels: meshes[i].spanPanels, panels: r.mesh.panels, strips: stripWrenches(r),
      coefficients: { CL: r.coefficients.CL, CLTrefftz: r.coefficients.CLTrefftz, CDpressure: r.coefficients.CDpressure, CDiTrefftz: r.coefficients.CDiTrefftz, Cm: r.coefficients.Cm },
      liftN: r.aircraft.lift_N, roundedTip: r.mesh.roundedTip, closedTip: r.mesh.closedTip, tipCap: r.semiWing.tipCap,
      diagnostics: { minCp: r.diagnostics.minCp, maxCp: r.diagnostics.maxCp, liftTrefftzRelativeDifference: r.diagnostics.liftTrefftzRelativeDifference, linearSolver: r.diagnostics.linearSolver, linearRelativeResidual: r.diagnostics.linearRelativeResidual, trailingEdgeDeltaCpInboard90: r.diagnostics.trailingEdgeDeltaCpInboard90 },
      warnings: r.warnings, timing: r.timing, modelCacheHit: !!models[i].lastCacheHit }));
    const bi = meshes.findIndex(m => m.chordPanels === def.baseChord && m.spanPanels === def.baseSpan);
    return { version: VERSION, kind: 'meshSequence', sequence: name, label: def.label, definition: { chord: def.chord.slice(), span: def.span.slice(), baseChord: def.baseChord, baseSpan: def.baseSpan },
      weights, flow: results[bi].flow, reference: results[bi].reference, scope: SCOPE, tipClosure, levels, base: compactResult(models[bi], results[bi]), trim, timing: { totalMs: now() - t0 } };
  }
  // Delivery stations: the finest spanwise level's strip boundaries (its rounded-tip zone merged into the last
  // strip), snapped to structural stations within 0.25 mm, wide strips halved, every station kept at least
  // 0.1 mm from all others (the structural engine's rule for distinct load and rib stations).
  function deliveryStations(levelRows, roundedTip, L, snap = []) {
    let nodes = [0, ...levelRows.map(r => r[1])];
    if (roundedTip) nodes = [...nodes.filter(y => y <= roundedTip.start_mm + 1e-9 * L && y < L), L];
    nodes[0] = 0; nodes[nodes.length - 1] = L;
    const stations = [...new Set(snap.filter(t => Number.isFinite(t) && t > 0 && t < L))];
    for (const t of stations) { let k = -1, best = Infinity; for (let i = 1; i < nodes.length - 1; i++) { const d = Math.abs(nodes[i] - t); if (d < best) { best = d; k = i; } } if (k > 0 && best > 0 && best < 0.25) nodes[k] = t; }
    nodes = [...new Set(nodes)].sort((a, b) => a - b);
    // strips wider than L/32 are halved once: the delivered load is uniform within a strip, so a finer delivery
    // grid reduces its interpolation difference from the extrapolated cut loads (that difference is part of U)
    nodes = nodes.flatMap((y, i) => (i && y - nodes[i - 1] > L / 32 ? [0.5 * (nodes[i - 1] + y), y] : [y]));
    return nodes.filter((y, i) => i === 0 || i === nodes.length - 1 || (stations.every(t => t === y || Math.abs(t - y) >= 0.1) && y - nodes[i - 1] >= 0.1 && nodes[i + 1] - y >= 0.1));
  }
  // Combines a sequence into the delivered (extrapolated) six-component strip load. options.snapStations.
  function combineSequence(rawGeometry, seq, options = {}) {
    const g = aeroGeometry(rawGeometry), L = g.semiSpan, def = sequenceDefinition(seq?.sequence);
    if (Geometry.closedTip(g)) throw new Error('Structural aerodynamic loads are not available for an exact zero-chord tip: the structural model of a closed tip is a section-stress study without the spatial beam.');
    // a flat tip cap closes the potential solution but its pressure is not integrated (non-convergent edge singularity),
    // so such a load would omit the tip side force: only the rounded tip (the default) is delivered to the structure
    if (seq?.tipClosure === 'flat' || (seq?.levels || []).some(l => l && l.tipCap)) throw new Error('A flat tip cap leaves its pressure out of the load, so this sequence cannot be applied to the structure: use the rounded tip (the default).');
    const find = (c, s) => { const l = (seq.levels || []).find(v => v.chordPanels === c && v.spanPanels === s); if (!l) throw new Error(`The mesh sequence has no ${2 * c} × ${s} level.`); return l; };
    for (const m of sequenceMeshes(seq.sequence)) checkRows(find(m.chordPanels, m.spanPanels).strips, L, `Level ${2 * m.chordPanels} × ${m.spanPanels}`);
    const weights = sequenceWeights(seq.sequence), cum = weights.map(w => ({ w: w.weight, f: cumulativeWrench(find(w.chordPanels, w.spanPanels).strips) }));
    const finest = find(def.baseChord, def.span[def.span.length - 1]), nodes = deliveryStations(finest.strips, finest.roundedTip, L, options.snapStations || []);
    const C = y => { const W = [0, 0, 0, 0, 0, 0]; for (const { w, f } of cum) { const v = f.at(y); for (let d = 0; d < 6; d++) W[d] += w * v[d]; } return W; };
    const values = nodes.map(C); values[values.length - 1] = [0, 0, 0, 0, 0, 0];
    const strips = nodes.slice(0, -1).map((y0, i) => [y0, nodes[i + 1], ...values[i].map((v, d) => v - values[i + 1][d])]);
    const est = f => sequenceEstimate(seq.sequence, (c, s) => f(find(c, s)));
    const coefficients = { CL: est(l => l.coefficients.CL), CLTrefftz: est(l => l.coefficients.CLTrefftz), CDpressure: est(l => l.coefficients.CDpressure), CDiTrefftz: est(l => l.coefficients.CDiTrefftz), Cm: est(l => l.coefficients.Cm) };
    const rootWrench = [0, 1, 2, 3, 4, 5].map(d => est(l => l.strips.reduce((t, r) => t + r[2 + d], 0)));
    const lift = { pressure: coefficients.CL.value, trefftz: coefficients.CLTrefftz.value, relativeDifference: Math.abs(coefficients.CL.value - coefficients.CLTrefftz.value) / Math.max(Math.abs(coefficients.CL.value), ADMISSION.liftConsistencyFloorCL) };
    const drag = { pressure: coefficients.CDpressure.value, trefftz: coefficients.CDiTrefftz.value, difference: coefficients.CDpressure.value - coefficients.CDiTrefftz.value, combinedUncertainty: coefficients.CDpressure.uncertainty + coefficients.CDiTrefftz.uncertainty };
    return { version: VERSION, kind: 'aeroStrips', sequence: seq.sequence, lineFraction: LOAD_LINE_FRACTION, strips, stations: nodes, weights, coefficients, rootWrench,
      deliveredRootWrench: strips.reduce((W, r) => W.map((v, d) => v + r[2 + d]), [0, 0, 0, 0, 0, 0]), consistency: { lift, drag } };
  }
  // Admission of a combined load against the structural axis. cuts: [{ y, reference: [x, y, z], normal: [..],
  // root: true for the root (all loads, no plane), structuralTorque (optional, the engine's own cut torque of the
  // delivered load, used as a transfer check) }]. options.torsion (optional, from the structural result):
  // { cuts: [cut at k L / n, k = 0 .. n - 1, root first], elements: [{ y0, y1, k }] (twist per unit torque per unit
  // projected span), twist: { y: [...], theta: [...] } (rad, the coupled solution) }. Returns rows, the twist claim and
  // an overall decision; it never changes the load.
  function admission(rawGeometry, seq, combined, cuts, options = {}) {
    const g = aeroGeometry(rawGeometry), L = g.semiSpan, set = { ...ADMISSION, ...(options.settings || {}) };
    sequenceDefinition(seq.sequence);
    if (!combined || combined.sequence !== seq.sequence) throw new Error('Combine this mesh sequence before the admission test.');
    if (!Array.isArray(cuts) || !cuts.length || !cuts[0].root) throw new Error('The admission test needs the structural root cut first.');
    const q = seq.flow.dynamicPressure_Pa * 1e-6, refs = seq.reference, weighted = sequenceWeights(seq.sequence);
    const levelCum = new Map(), find = (c, s) => { const k = c + 'x' + s; if (!levelCum.has(k)) { const l = seq.levels.find(v => v.chordPanels === c && v.spanPanels === s); if (!l) throw new Error(`The mesh sequence has no ${2 * c} × ${s} level.`); levelCum.set(k, cumulativeWrench(l.strips)); } return levelCum.get(k); };
    const delivered = stripRepresentation(g, combined.strips, combined.lineFraction);
    const unit = v => { const l = Math.hypot(...v); if (!(l > 0)) throw new Error('A structural cut normal is zero.'); return v.map(x => x / l); };
    const crossing = (P, n) => {
      const s = y => dot3(loadLinePoint(g, y, combined.lineFraction).map((v, d) => v - P[d]), n);
      if (s(0) >= 0) return 0; if (s(L) < 0) return L;
      let lo = 0, hi = L; for (let k = 0; k < 64; k++) { const mid = 0.5 * (lo + hi); if (s(mid) < 0) lo = mid; else hi = mid; }
      return 0.5 * (lo + hi);
    };
    // delivered torque, its sequence estimate and uncertainty, and the torques of the weighted meshes at one cut
    const torqueAt = cut => {
      const P = cut.reference, n = unit(cut.normal), ystar = cut.root ? 0 : crossing(P, n);
      const about = W => ({ F: W.slice(0, 3), M: [W[3] - (P[1] * W[2] - P[2] * W[1]), W[4] - (P[2] * W[0] - P[0] * W[2]), W[5] - (P[0] * W[1] - P[1] * W[0])] });
      const memo = new Map(), levelW = (c, s) => { const k = c + 'x' + s; if (!memo.has(k)) memo.set(k, about(find(c, s).at(ystar))); return memo.get(k); };
      const dw = about(outboardOfStation(g, delivered, ystar, combined.lineFraction));
      const torque = w => dot3(w.M, n), est = sequenceEstimate(seq.sequence, (c, s) => torque(levelW(c, s)), set);
      const T = torque(dw), interp = Math.abs(T - est.value), U = est.uncertainty + interp;
      const meshTorques = weighted.map(w => ({ chordPanels: w.chordPanels, spanPanels: w.spanPanels, weight: w.weight, torque: torque(levelW(w.chordPanels, w.spanPanels)) }));
      const signsAgree = T !== 0 && meshTorques.every(m => Math.sign(m.torque) === Math.sign(T));
      return { ystar, n, levelW, dw, T, U, est, interp, meshTorques, signsAgree };
    };
    const rows = [];
    for (const cut of cuts) {
      const t = torqueAt(cut), relative = t.T !== 0 ? t.U / Math.abs(t.T) : Infinity;
      const resolved = relative <= set.torqueTolerance && t.signsAgree, signResolved = t.U < Math.abs(t.T) && t.signsAgree;
      const label = cut.root ? 'Root torque (shear-centre axis)' : `Torque at ${Math.round(100 * cut.y / L)}% span (y ${(+cut.y).toFixed(1)} mm)`;
      const row = { kind: 'torque', label, y: cut.root ? 0 : cut.y, crossing_mm: t.ystar, value: t.T, uncertainty: t.U, sequenceUncertainty: t.est.uncertainty, interpolation: t.interp,
        relative, measure: relative, tolerance: set.torqueTolerance, resolved, signResolved, meshSignsAgree: t.signsAgree, meshTorques: t.meshTorques,
        status: resolved ? 'resolved' : signResolved ? 'magnitude not resolved' : 'sign not resolved', admitted: resolved, estimate: t.est };
      if (Number.isFinite(cut.structuralTorque)) row.transferResidual = cut.structuralTorque - t.T;
      rows.push(row);
      if (cut.root) {
        const vec = (fn, name, tol, kind) => {
          const v = fn(t.dw), est = [0, 1, 2].map(d => sequenceEstimate(seq.sequence, (c, s) => fn(t.levelW(c, s))[d], set));
          const U = Math.hypot(...est.map((x, d) => x.uncertainty + Math.abs(v[d] - x.value))), mag = Math.hypot(...v), e2 = mag > 0 ? U / mag : Infinity;
          rows.push({ kind, label: name, value: mag, vector: v, uncertainty: U, measure: e2, relative: e2, tolerance: tol, resolved: e2 <= tol, admitted: e2 <= tol, estimate: est });
        };
        vec(w => w.F, 'Root force |F|', set.forceTolerance, 'force');
        vec(w => { const tq = dot3(w.M, t.n); return w.M.map((v, d) => v - tq * t.n[d]); }, 'Root bending moment |M_b|', set.bendingTolerance, 'bending');
      }
    }
    const lc = combined.consistency.lift;
    rows.push({ kind: 'liftConsistency', label: 'Lift: pressure vs Trefftz plane', value: lc.pressure, reference: lc.trefftz, measure: lc.relativeDifference, relative: lc.relativeDifference, tolerance: set.liftConsistencyTolerance, resolved: lc.relativeDifference <= set.liftConsistencyTolerance, admitted: lc.relativeDifference <= set.liftConsistencyTolerance });
    const torqueRows = rows.filter(r => r.kind === 'torque'), torqueResolved = torqueRows.every(r => r.resolved);
    // twist claim from the structure's torsional compliance
    let twist = null;
    if (options.torsion) {
      const tor = options.torsion;
      if (!Array.isArray(tor.cuts) || !tor.cuts.length || !tor.cuts[0].root || !Array.isArray(tor.elements) || !tor.elements.length || !tor.twist) throw new Error('The twist assessment needs the structure: torsion cuts from the root, frame elements and the twist.');
      const tcut = tor.cuts.map(c => { const t = torqueAt(c); return { y: c.root ? 0 : c.y, T: t.T, U: t.U }; });
      const Y = [...tcut.map(c => c.y), L], Uv = [...tcut.map(c => c.U), 0];
      for (let i = 1; i < Y.length; i++) if (!(Y[i] > Y[i - 1])) throw new Error('Torsion cuts must increase from the root to the tip.');
      const els = tor.elements.map(e => ({ y0: e.y0, y1: e.y1, k: e.k }));
      if (!els.every(e => Number.isFinite(e.k) && e.k > 0 && e.y1 > e.y0)) throw new Error('Torsional compliance must be positive and finite on every frame element.');
      const dtheta = y => { let s = 0; for (let i = 0; i < Y.length - 1 && Y[i] < y; i++) { const a = Y[i], b = Math.min(Y[i + 1], y), Ub = Math.max(Uv[i], Uv[i + 1]); for (const e of els) { const lo = Math.max(a, e.y0), hi = Math.min(b, e.y1); if (hi > lo) s += Ub * e.k * (hi - lo); } } return s; };
      const ty = Array.from(tor.twist.y), tv = Array.from(tor.twist.theta);
      const thetaAt = y => { if (y <= ty[0]) return tv[0]; if (y >= ty[ty.length - 1]) return tv[tv.length - 1]; let lo = 0, hi = ty.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ty[m] <= y) lo = m; else hi = m; } const f = (y - ty[lo]) / (ty[hi] - ty[lo]); return tv[lo] + f * (tv[hi] - tv[lo]); };
      for (const c of tcut) { c.theta = thetaAt(c.y); c.dtheta = dtheta(c.y); }
      const stations = [...set.stations, 1].map(f => { const y = f * L, th = thetaAt(y), d = dtheta(y); return { y, theta: th, dtheta: d, bound: Math.abs(th) + d, relative: th !== 0 ? d / Math.abs(th) : Infinity }; });
      const N = 240, h = L / N, a0 = set.sectionLiftSlope; let I = 0, I0 = 0, maxBound = 0;
      for (let i = 0; i <= N; i++) { const y = i * h, w = i === 0 || i === N ? 0.5 : 1, c = Geometry.chordAt(g, y), th = Math.abs(thetaAt(y)), d = dtheta(y); I += w * c * (th + d); I0 += w * c * th; maxBound = Math.max(maxBound, th + d); }
      const CL = combined.coefficients.CL.value, Lsemi = Math.abs(CL) * q * refs.semiArea_mm2, liftChange = q * a0 * I * h, rigidChange = q * a0 * I0 * h;
      const liftEffect = Lsemi > 0 ? liftChange / Lsemi : Infinity, rigidWingEffect = Lsemi > 0 ? rigidChange / Lsemi : Infinity;
      const twistRelative = stations.every(st => st.relative <= set.twistTolerance), worstRelative = Math.max(...stations.map(st => st.relative));
      const status = torqueResolved && twistRelative ? 'resolved' : liftEffect <= set.twistLiftFraction ? 'negligible' : 'unresolved';
      twist = { status, stations, cuts: tcut, tipTheta: stations[stations.length - 1].theta, tipDtheta: stations[stations.length - 1].dtheta, maxBound, liftEffect, liftEffectTolerance: set.twistLiftFraction,
        rigidWingEffect, meanTolerance: Lsemi > 0 ? set.twistLiftFraction * Lsemi / (q * a0 * refs.semiArea_mm2) : 0, worstRelative, relativeTolerance: set.twistTolerance, torqueResolved, sectionLiftSlope: a0,
        method: 'dtheta(y) = integral of max(U_T) k over [0, y] with the frame elements\' torsional compliance k = (length / projected length) / GJ; negligible if q 2 pi integral c (|theta| + dtheta) dy <= 1% of |lift|.' };
      for (const r of torqueRows) if (!r.resolved) r.admitted = status === 'negligible';
      rows.push({ kind: 'twist', label: 'Twist (shear-centre axis)', y: L, value: twist.tipTheta, uncertainty: twist.tipDtheta, bound: maxBound, status,
        measure: status === 'resolved' ? worstRelative : liftEffect, relative: worstRelative, tolerance: status === 'resolved' ? set.twistTolerance : set.twistLiftFraction, resolved: status === 'resolved', admitted: status !== 'unresolved', twist });
      const rigidOk = rigidWingEffect <= set.rigidWingTolerance;
      rows.push({ kind: 'aeroelastic', label: 'One-way coupling: twist effect on lift', value: rigidWingEffect, measure: rigidWingEffect, relative: rigidWingEffect, tolerance: set.rigidWingTolerance, resolved: rigidOk, admitted: rigidOk });
    }
    const failed = rows.filter(r => !r.admitted);
    const notes = torqueRows.filter(r => !r.resolved).map(r => `${r.label}: ${r.status} (${r.value.toPrecision(3)} ± ${r.uncertainty.toPrecision(2)} N mm${r.meshSignsAgree ? '' : '; the meshes disagree in sign'})`);
    if (twist && twist.rigidWingEffect > set.rigidWingTolerance) notes.push(`The computed twist would change the lift by ${(100 * twist.rigidWingEffect).toFixed(1)}% if fed back: the rigid-wing load is not consistent with this flexible structure (aeroelastic redistribution is not modelled).`);
    return { version: VERSION, sequence: seq.sequence, admitted: failed.length === 0, rows, failed: failed.map(r => r.label), settings: set, twist, notes,
      claims: { torque: torqueResolved ? 'shown' : 'withheld', twist: twist ? (twist.status === 'resolved' ? 'shown' : 'withheld') : (torqueResolved ? 'not assessed' : 'withheld') },
      drag: combined.consistency.drag,
      method: 'Richardson extrapolation of a chordwise and a spanwise four-level refinement sequence (quadratic in 1/n through the three finest levels, combined additively); U = 1.25 x sum over the two directions of max(spread of the linear, quadratic and observed-order extrapolations + one-level stability, 0.5 x |extrapolation correction|). Torque resolved only if U <= 10% of |T| and the weighted meshes agree in sign (no absolute floor). Twist from the structure\'s torsional compliance: resolved (shown) if every torque is resolved and the twist bound is within 10% of the twist; otherwise withheld and admitted only if the bound would change the lift by at most 1% (thin-airfoil lift slope), else the coupled result is withheld. One-way coupling: the computed twist may change the lift by at most 2%.' };
  }

  return Object.freeze({ VERSION, SCOPE, LIMITS, DEFAULT_FLOW, DEFAULT_MESH, triAngle, semiInfiniteAngle, buildSurface, sourceLocal,
    geometryKey, influence: (S, k, P, far = Infinity) => { influence(S, k, P[0], P[1], P[2], far === Infinity ? Infinity : far * far); return { source: outS, doublet: outD }; },
    assemble, unitSolutions, luFactor, luSolve, gmres, surfaceVelocity, aeroGeometry, sectionLoop, spanStations, wingMesh, references, trefftz, trefftzMidpoint,
    normalizeFlow, normalizeMesh, prepare, evaluate, solve, alphaForLift, stripChordwiseCp, compactResult, resultantOfPanels,
    LOAD_LINE_FRACTION, SEQUENCES, ADMISSION, loadLinePoint, lineIntegral, stripWrenches, stripRepresentation, outboardOfStation, pchip, cumulativeWrench,
    sequenceMeshes, sequenceWeights, observedOrder, sequenceEstimate, runSequence, deliveryStations, combineSequence, admission });
})();
if (typeof module !== 'undefined' && module.exports) module.exports = WingAeroPanel;
