/*
 * Beam Diagrams — MIE 446 Beam Lab SVG builders. Pure functions: model/result in, SVG text out.
 * Colours come from CSS classes (beam_lab.css), so every figure follows the light/dark theme and
 * prints in black-and-white-safe form. One user unit is drawn at about one CSS pixel; callers pass
 * the container width so labels stay readable from 360 px phones to wide desktops.
 *
 * Physical diagrams show supports and never their reactions. Free-body diagrams show reactions
 * (and the cut-face V, M) and never support symbols. Sign conventions follow the engine:
 * load/v positive down, couples clockwise positive, sagging M positive, V = dM/dx. Reaction couples are
 * named C_A, C_B, … (as in Lecture 03) so that they are never confused with the internal moment M.
 */
const BeamDiagrams = (() => {
  'use strict';
  const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const r1 = v => Math.round(v*10)/10;
  const clampWidth = w => Math.max(320,Math.min(1240,Number.isFinite(w)&&w>0?w:760));
  const SUP = {'-':'⁻','0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹'};
  let uid = 0;
  const nextId = prefix => `${prefix}${++uid}`;

  /** Readable engineering number: plain decimals for ordinary sizes, ×10ⁿ otherwise. */
  function fmt(v, sig=4) {
    if(v===null||v===undefined||!Number.isFinite(v)) return '—';
    if(v===0||Math.abs(v)<1e-13) return '0';
    const a=Math.abs(v);
    if(a>=1e-3&&a<1e6) {
      const digits=Math.max(0,sig-1-Math.floor(Math.log10(a)));
      return String(Number(v.toFixed(Math.min(digits,8)))).replace('-','−');
    }
    const [m,e]=v.toExponential(sig-1).split('e');
    return `${m.replace('-','−')} × 10${String(Number(e)).split('').map(c=>SUP[c]).join('')}`;
  }
  const signed = (v,sig=4) => (v>0?'+':'')+fmt(v,sig);

  function niceStep(span, count) {
    const raw=span/Math.max(1,count), p=10**Math.floor(Math.log10(raw)), n=raw/p;
    return (n<=1?1:n<=2?2:n<=2.5?2.5:n<=5?5:10)*p;
  }
  function niceTicks(min, max, count=4) {
    if(!(max>min)) {const d=Math.abs(min)||1;min-=d;max+=d;}
    const step=niceStep(max-min,count), lo=Math.floor(min/step+1e-9)*step, hi=Math.ceil(max/step-1e-9)*step, ticks=[];
    for(let v=lo;v<=hi+step*1e-6;v+=step) ticks.push(Math.abs(v)<step*1e-9?0:v);
    return {ticks,min:lo,max:hi,step};
  }

  const svgOpen=(W,H,label,cls='')=>`<svg class="bl-svg ${cls}" viewBox="0 0 ${r1(W)} ${r1(H)}" width="${r1(W)}" height="${r1(H)}" style="max-width:${r1(W)}px" role="img" aria-label="${esc(label)}" preserveAspectRatio="xMidYMid meet"><title>${esc(label)}</title>`;
  const text=(x,y,s,cls='bl-tx',anchor='middle',extra='')=>`<text x="${r1(x)}" y="${r1(y)}" class="${cls}" text-anchor="${anchor}"${extra}>${esc(s)}</text>`;
  /** Text whose "_X" parts are drawn as subscripts (R_A, M_B, t_f); content is escaped. */
  function label(x,y,s,cls='bl-tx',anchor='middle') {
    const parts=String(s).split(/_([A-Za-z0-9]+)/);
    if(parts.length===1) return text(x,y,s,cls,anchor);
    let out='',low=false;
    parts.forEach((p,i)=>{
      if(!p) return;
      const sub=i%2===1;
      out+=sub!==low?`<tspan dy="${sub?3.5:-3.5}"${sub?' class="bl-subtx"':''}>${esc(p)}</tspan>`:`<tspan${low?' class="bl-subtx"':''}>${esc(p)}</tspan>`;
      low=sub;
    });
    return `<text x="${r1(x)}" y="${r1(y)}" class="${cls}" text-anchor="${anchor}">${out}</text>`;
  }
  const line=(x1,y1,x2,y2,cls)=>`<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" class="${cls}"/>`;

  /** Straight arrow with a filled head at (x2, y2). */
  function arrow(x1,y1,x2,y2,cls,head=8) {
    const L=Math.hypot(x2-x1,y2-y1)||1, ux=(x2-x1)/L, uy=(y2-y1)/L, bx=x2-ux*head, by=y2-uy*head, w=head*0.45;
    return `<g class="${cls}">${line(x1,y1,bx,by,'bl-shaft')}<path d="M${r1(x2)} ${r1(y2)}L${r1(bx-uy*w)} ${r1(by+ux*w)}L${r1(bx+uy*w)} ${r1(by-ux*w)}Z" class="bl-head"/></g>`;
  }
  /** Couple: 270° arc around (cx, cy); clockwise on screen when cw is true. */
  function coupleArrow(cx,cy,r,cw,cls,head=8) {
    const a0=cw?-200:20, a1=cw?60:-240, rad=a=>a*Math.PI/180;
    const p=a=>[cx+r*Math.cos(rad(a)),cy+r*Math.sin(rad(a))];
    const [x0,y0]=p(a0),[x1,y1]=p(a1);
    const t=cw?[-Math.sin(rad(a1)),Math.cos(rad(a1))]:[Math.sin(rad(a1)),-Math.cos(rad(a1))];
    const bx=x1-t[0]*head*0.2, by=y1-t[1]*head*0.2, tipx=x1+t[0]*head*0.8, tipy=y1+t[1]*head*0.8, w=head*0.5;
    return `<g class="${cls}"><path d="M${r1(x0)} ${r1(y0)}A${r} ${r} 0 1 ${cw?1:0} ${r1(x1)} ${r1(y1)}" class="bl-shaft" fill="none"/><path d="M${r1(tipx)} ${r1(tipy)}L${r1(bx-t[1]*w)} ${r1(by+t[0]*w)}L${r1(bx+t[1]*w)} ${r1(by-t[0]*w)}Z" class="bl-head"/></g>`;
  }
  const hatch=(x1,y,x2,dir=1,step=7,len=7)=>{let d='';for(let x=x1;x<=x2+0.1;x+=step)d+=`M${r1(x)} ${r1(y)}l${-len*0.7*dir} ${len}`;return `<path d="${d}" class="bl-hatch"/>`;};

  /* ----------------------------------------------------------- supports */

  function supportSymbol(kind, x, yBottom, end, attrs='') {
    const g=c=>`<g class="bl-support" data-support-kind="${kind}" ${attrs}>${c}</g>`;
    if(kind==='fixed') {
      if(end==='left') return g(`<rect x="${r1(x-14)}" y="${r1(yBottom-36)}" width="14" height="48" class="bl-wall"/>${line(x,yBottom-36,x,yBottom+12,'bl-ground')}${hatchV(x-14,yBottom-36,yBottom+12)}`);
      if(end==='right') return g(`<rect x="${r1(x)}" y="${r1(yBottom-36)}" width="14" height="48" class="bl-wall"/>${line(x,yBottom-36,x,yBottom+12,'bl-ground')}${hatchV(x,yBottom-36,yBottom+12)}`);
      return g(`<rect x="${r1(x-9)}" y="${r1(yBottom-30)}" width="18" height="44" class="bl-wall"/>${line(x-9,yBottom+14,x+9,yBottom+14,'bl-ground')}`);
    }
    const tri=`<path d="M${r1(x)} ${r1(yBottom)}l-12 19h24Z" class="bl-sup"/>`;
    if(kind==='pin') return g(`${tri}${line(x-20,yBottom+19,x+20,yBottom+19,'bl-ground')}${hatch(x-16,yBottom+19,x+20)}`);
    return g(`${tri}<circle cx="${r1(x-6)}" cy="${r1(yBottom+23.5)}" r="4" class="bl-roll"/><circle cx="${r1(x+6)}" cy="${r1(yBottom+23.5)}" r="4" class="bl-roll"/>${line(x-20,yBottom+28,x+20,yBottom+28,'bl-ground')}${hatch(x-16,yBottom+28,x+20)}`);
  }
  function hatchV(x,y1,y2){let d='';for(let y=y1+4;y<=y2;y+=7)d+=`M${r1(x)} ${r1(y)}l6 -6`;return `<path d="${d}" class="bl-hatch"/>`;}

  /* --------------------------------------------------------------- loads */

  const LANE = 52; // one distributed-load band (30 px) plus its label row
  // Distributed-load helpers of the engine (linear, elliptic, parabolic, table); loaded lazily.
  const LDS = () => (typeof BeamLearningEngine!=='undefined' ? BeamLearningEngine : require('./beam_learning_engine.js')).loads;
  const isDist = v => v.kind==='distributed'||v.kind==='elliptic'||v.kind==='parabolic'||v.kind==='table';
  // A clipped part of a curved or table load (free bodies) carries _clip = [s, e].
  const spanOf = v => v._clip||(v.kind==='table'?[v.points[0][0],v.points[v.points.length-1][0]]:[v.start,v.end]);
  function lanesFor(list) {
    // Colour intervals in spatial order, not insertion order. Keep the result indexed
    // by the original load so editing/reordering never detaches its diagram or handle.
    const lanes=[], assigned=[];
    const ordered=list.map((v,i)=>({i,span:spanOf(v)})).sort((u,v)=>u.span[0]-v.span[0]||u.span[1]-v.span[1]||u.i-v.i);
    ordered.forEach(({i,span:[a,b]})=>{
      let k=lanes.findIndex(end=>end<=a+1e-9);
      if(k<0){k=lanes.length;lanes.push(b);} else lanes[k]=b;
      assigned[i]=k;
    });
    return assigned;
  }
  const SHAPE_SHORT={start:'max at start',end:'max at end',middle:'symmetric'};
  // Draft models (not yet solved) hold a curved load as entered (total or peak): complete it for drawing.
  function normLoad(v) {
    if((v.kind==='elliptic'||v.kind==='parabolic')&&!(Number.isFinite(v.peak)&&Number.isFinite(v.total))) {
      try {return {...v,...LDS().profiles.normalizeCurve(v,{min:-Infinity,max:Infinity,lengthUnit:'mm'})};} catch(e) {return {...v,peak:0,total:0};}
    }
    return v;
  }

  /**
   * Loads drawn above the beam whose top edge is at yTop. Returns {svg, labels}.
   * Downward loads point down onto the beam; upward loads point up from it.
   */
  function drawLoads(loads, X, yTop, opts={}) {
    loads=loads.map(normLoad);
    const dist=loads.filter(isDist), lanes=lanesFor(dist), laneH=opts.laneH||LANE;
    const qmax=Math.max(...dist.map(v=>v.kind==='distributed'?Math.max(Math.abs(v.qStart),Math.abs(v.qEnd)):LDS().peak(v)),1e-12);
    let svg='';
    dist.forEach((v,i)=>{
      if(v.kind!=='distributed') {
        // Curved and table loads: envelope through sampled intensities (drawing only; results use exact integrals).
        const L=LDS(), [a,b]=spanOf(v), base=yTop-4-lanes[i]*laneH, h=30, x0=X(a), x1=X(b), denom=opts.scaleMode==='independent'?Math.max(L.peak(v),1e-30):qmax, hq=q=>h*Math.abs(q)/denom, cls='bl-load';
        const pts=L.samples(v,a,b);
        svg+=`<path d="M${r1(x0)} ${r1(base)}${pts.map(([x,q])=>`L${r1(X(x))} ${r1(base-hq(q))}`).join('')}L${r1(x1)} ${r1(base)}Z" class="${cls}-fill" data-load-kind="${v.kind}"/>`;
        const n=Math.max(2,Math.round((x1-x0)/26));
        for(let k=0;k<=n;k++) {
          const x=a+(b-a)*k/n,q=L.value(v,x),hh=hq(q),xx=X(x);
          if(hh<3) continue;
          svg+=q>=0?arrow(xx,base-hh,xx,base,cls,6):arrow(xx,base,xx,base-hh,cls,6);
        }
        svg+=`<polyline points="${pts.map(([x,q])=>`${r1(X(x))},${r1(base-hq(q))}`).join(' ')}" class="${cls} bl-env" fill="none"/>`;
        const part=L.portion(v,a,b,0), F=part.W;
        const name=v.kind==='table'?`table (${v.points.length} rows)`:`${v.kind} (${SHAPE_SHORT[v.shape]})`;
        const label=v._clip?`${name} part: W = ${fmt(Math.abs(F))} N ${F>=0?'↓':'↑'}`:`${name}: F = ${fmt(Math.abs(F))} N ${F>=0?'↓':'↑'}${v.kind==='table'?'':`, w₀ = ${fmt(Math.abs(v.peak))} N/mm`}`;
        svg+=text(Math.min(Math.max((x0+x1)/2,90),opts.width-90),base-h-6,label,'bl-tx-s bl-tx-load');
        return;
      }
      const base=yTop-4-lanes[i]*laneH, h=30, x0=X(v.start), x1=X(v.end);
      const denom=opts.scaleMode==='independent'?Math.max(Math.abs(v.qStart),Math.abs(v.qEnd),1e-30):qmax;
      const hq=q=>h*Math.abs(q)/denom;
      const cls=v.selfWeight?'bl-sw':'bl-load';
      const env=`M${r1(x0)} ${r1(base)}L${r1(x0)} ${r1(base-hq(v.qStart))}L${r1(x1)} ${r1(base-hq(v.qEnd))}L${r1(x1)} ${r1(base)}Z`;
      svg+=`<path d="${env}" class="${cls}-fill"/>`;
      const n=Math.max(2,Math.round((x1-x0)/26));
      for(let k=0;k<=n;k++) {
        const t=k/n,q=v.qStart+(v.qEnd-v.qStart)*t,x=x0+(x1-x0)*t,hh=hq(q);
        if(hh<3) continue;
        svg+=q>=0?arrow(x,base-hh,x,base,cls,6):arrow(x,base,x,base-hh,cls,6);
      }
      svg+=`<path d="M${r1(x0)} ${r1(base-hq(v.qStart))}L${r1(x1)} ${r1(base-hq(v.qEnd))}" class="${cls} bl-env"/>`;
      const label=v.selfWeight?`self-weight ρgA = ${fmt(v.qStart)} N/mm`:v.qStart===v.qEnd?`q = ${fmt(v.qStart)} N/mm`:`q = ${fmt(v.qStart)} → ${fmt(v.qEnd)} N/mm`;
      svg+=text(Math.min(Math.max((x0+x1)/2,90),opts.width-90),base-h-6,label,`bl-tx-s ${v.selfWeight?'bl-tx-m':'bl-tx-load'}`);
    });
    // Point forces and couples in front of the distributed loads; labels alternate rows if crowded.
    const rows=[-1e9,-1e9];
    const topOfLoads=yTop-4-Math.max(0,...lanes.map(k=>k+1))*laneH;
    const len=Math.max(48,yTop-topOfLoads+8);
    for(const v of loads.filter(p=>p.kind==='point')) {
      const x=X(v.position);
      svg+=v.force>=0?arrow(x,yTop-len,x,yTop-1,'bl-load bl-point',9):arrow(x,yTop-1,x,yTop-len,'bl-load bl-point',9);
      const row=x-rows[0]>96?0:1;rows[row]=x;
      svg+=text(Math.min(Math.max(x,48),opts.width-48),yTop-len-8-row*16,`P = ${fmt(Math.abs(v.force))} N ${v.force>=0?'↓':'↑'}`,'bl-tx-s bl-tx-load bl-tx-b');
    }
    for(const v of loads.filter(p=>p.kind==='moment')) {
      const x=X(v.position);
      svg+=coupleArrow(x,yTop+6,17,v.moment>=0,'bl-load bl-couple');
      svg+=text(Math.min(Math.max(x,60),opts.width-60),yTop-18,`C = ${fmt(Math.abs(v.moment))} N·mm ${v.moment>=0?'↻':'↺'}`,'bl-tx-s bl-tx-load bl-tx-b');
    }
    return {svg,height:len+40};
  }

  function loadHeight(loads) {
    const dist=loads.filter(isDist), lanes=lanesFor(dist);
    const top=Math.max(0,...lanes.map(k=>k+1))*LANE;
    // Point-force labels need two rows above the arrows; without point forces only a small margin.
    return Math.max(48,top+12)+(loads.some(v=>v.kind==='point')?44:4);
  }

  function stationList(model) {
    const xs=[0,model.length,...model.supports.map(s=>s.x),...model.hinges,
      ...model.loads.flatMap(v=>isDist(v)?spanOf(v):[v.position])];
    return [...new Set(xs.map(v=>Number(v.toPrecision(12))))].sort((a,b)=>a-b);
  }

  function dimensionLine(model, X, y, W) {
    const L=model.length, x0=X(0), x1=X(L);
    let svg=line(x0,y,x1,y,'bl-dim')+line(x0,y-6,x0,y+6,'bl-dim')+line(x1,y-6,x1,y+6,'bl-dim');
    let last=-1e9;
    const stations=stationList(model);
    stations.forEach((s,i)=>{
      const x=X(s),end=i===0||i===stations.length-1;
      svg+=line(x,y-4,x,y+4,'bl-dim');
      if(end||(x-last>40&&x1-x>40)) {svg+=text(x,y+17,fmt(s),'bl-tx-s bl-tx-m');last=x;}
    });
    svg+=text((x0+x1)/2,y+34,`span L = ${fmt(L)} mm`,'bl-tx-s bl-tx-b');
    return svg;
  }

  /* ------------------------------------------------- physical schematic */

  /**
   * Physical supported beam (supports + applied loads; never reactions).
   * opts: width, result (deflected shape when showDeflection), cut:{x}, ghost:{x,kind}, selfWeight:{q}
   */
  function beamSchematic(model, opts={}) {
    const W=clampWidth(opts.width), L=model.length, pad=58;
    const X=x=>pad+(W-2*pad)*x/L;
    const loads=[...model.loads];
    if(opts.selfWeight&&opts.selfWeight.q>0) loads.push({kind:'distributed',start:0,end:L,qStart:opts.selfWeight.q,qEnd:opts.selfWeight.q,selfWeight:true});
    const yTop=12+loadHeight(loads), yAxis=yTop+6, yBottom=yTop+12, yDim=yBottom+60, H=yDim+44;
    let svg=svgOpen(W,H,opts.label||`Physical beam: ${model.supports.length} support(s), ${model.loads.length} applied load(s), span ${fmt(L)} mm`,'bl-schematic')
      .replace('<svg ',`<svg data-x0="${r1(X(0))}" data-x1="${r1(X(L))}" data-length="${L}" data-w="${r1(W)}" `);
    svg+=`<rect x="0" y="0" width="${r1(W)}" height="${r1(H)}" class="bl-hit" data-beam-hit="1"/>`;
    svg+=`<rect x="${r1(X(0))}" y="${r1(yTop)}" width="${r1(X(L)-X(0))}" height="12" rx="2" class="bl-beam"/>`;
    model.supports.forEach((s,i)=>{
      const end=s.x===0?'left':s.x===L?'right':'interior';
      const drag=end==='interior'?` data-draggable="support" tabindex="-1"`:'';
      svg+=supportSymbol(s.kind,X(s.x),yBottom,end,`data-support-index="${i}" data-x="${s.x}"${drag}`);
      svg+=text(end==='left'?X(s.x)-6:end==='right'?X(s.x)+6:X(s.x),yBottom+48,s.kind,`bl-tx-s bl-tx-m`,end==='left'?'start':end==='right'?'end':'middle');
    });
    model.hinges.forEach((h,i)=>{svg+=`<g class="bl-hinge" data-hinge="1" data-hinge-index="${i}" data-x="${h}" data-draggable="hinge"><circle cx="${r1(X(h))}" cy="${r1(yAxis)}" r="6" class="bl-hinge-c"/></g>`;});
    svg+=drawLoads(loads,X,yTop,{width:W,scaleMode:opts.loadScale}).svg;
    const handleLanes=lanesFor(loads.filter(isDist));
    let distributedHandle=0;
    if(opts.interactive) model.loads.forEach((v,i)=>{
      const a=v.kind==='table'?v.points[0][0]:isDist(v)?v.start:v.position;
      const b=v.kind==='table'?v.points.at(-1)[0]:isDist(v)?v.end:v.position;
      const lane=isDist(v)?handleLanes[distributedHandle++]:0;
      const x=X((a+b)/2), y=yTop-14-(isDist(v)?lane*LANE:(i%3)*23);
      svg+=`<g class="bl-load-handle" data-load-handle="${i}" tabindex="0" role="button" aria-label="Load ${i+1}: click to select, Delete to remove, drag to move, Enter or double-click to edit"><title>Load ${i+1}: click to select; Delete to remove; drag to move; Enter or double-click to edit magnitude and position</title>${line(x,y+10,X((a+b)/2),yTop-2,'bl-load-link')}<circle cx="${r1(x)}" cy="${y}" r="10"/>${text(x,y+4,String(i+1),'bl-tx-s')}</g>`;
    });
    if(opts.loadPreview) {
      const a=X(opts.loadPreview.start),b=X(opts.loadPreview.end);
      svg+=`<g class="bl-selection" aria-label="Selected load position, not applied"><rect x="${r1(a-2)}" y="${r1(yTop-10)}" width="${r1(Math.max(4,b-a+4))}" height="32"/>${text((a+b)/2,yTop-16,'Selection only — enter magnitude','bl-tx-s')}</g>`;
    }
    if(opts.result&&opts.showDeflection) {
      const r=opts.result, peak=Math.max(...r.deflection.map(Math.abs));
      if(peak>0) {
        const amp=30, pts=r.x.map((x,i)=>`${r1(X(x))},${r1(yAxis+amp*r.deflection[i]/peak)}`).join(' ');
        const factor=amp/(peak*(W-2*pad)/L);
        svg=svg.replace('<svg ',`<svg data-exaggeration="${fmt(factor,2)}" `);
        svg+=`<polyline points="${pts}" class="bl-defl"/>`;
      }
    }
    if(opts.ghost&&Number.isFinite(opts.ghost.x)) {
      const gx=X(opts.ghost.x);
      svg+=`<g class="bl-ghost">${opts.ghost.kind==='hinge'?`<circle cx="${r1(gx)}" cy="${r1(yAxis)}" r="7" class="bl-hinge-c"/>`:supportSymbol(opts.ghost.kind,gx,yBottom,opts.ghost.x===0?'left':opts.ghost.x===L?'right':'interior').replace('data-support-kind','data-ghost-kind')}${text(gx,yBottom+48,`${opts.ghost.kind} at x = ${fmt(opts.ghost.x)} mm`,'bl-tx-s bl-tx-b')}</g>`;
    }
    svg+=dimensionLine(model,X,yDim,W);
    if(opts.cut&&Number.isFinite(opts.cut.x)) {
      const cx=X(opts.cut.x);
      svg+=`<g class="bl-cutline" data-cut-handle="1">${line(cx,8,cx,yDim-12,'bl-cut')}<circle cx="${r1(cx)}" cy="14" r="9" class="bl-cut-handle"/>${text(cx+(cx>W-120?-14:14),18,`cut x = ${fmt(opts.cut.x)} mm`,'bl-tx-s bl-tx-cut',cx>W-120?'end':'start')}</g>`;
    }
    return svg+'</svg>';
  }

  /** Small plot of a line-load table w(x) for the CSV preview (rows as dots, linear between them). */
  function tablePreview(points, opts={}) {
    const W=Math.max(260,Math.min(560,opts.width||420)), H=164, padL=54, padR=14, padT=28, padB=34;   // axis title above the tick labels
    const xs=points.map(p=>p[0]), ws=points.map(p=>p[1]);
    const x0=Math.min(...xs), x1=Math.max(...xs), lo=Math.min(0,...ws), hi=Math.max(0,...ws), span=(hi-lo)||1;
    const X=x=>padL+(W-padL-padR)*(x1>x0?(x-x0)/(x1-x0):0.5), Y=w=>padT+(H-padT-padB)*(hi-w)/span;
    let svg=svgOpen(W,H,opts.label||`Line-load table: ${points.length} rows`,'bl-tablepreview');
    svg+=line(padL,Y(0),W-padR,Y(0),'bl-axis')+line(padL,padT,padL,H-padB,'bl-axis');
    svg+=`<polyline points="${points.map(p=>`${r1(X(p[0]))},${r1(Y(p[1]))}`).join(' ')}" class="bl-load bl-env" fill="none"/>`;
    for(const p of points) svg+=`<circle cx="${r1(X(p[0]))}" cy="${r1(Y(p[1]))}" r="2.6" class="bl-dot"/>`;
    svg+=text(padL,H-padB+16,fmt(x0),'bl-tx-s bl-tx-m','start')+text(W-padR,H-padB+16,fmt(x1),'bl-tx-s bl-tx-m','end')+text((padL+W-padR)/2,H-4,`${opts.xLabel||'x'} (${opts.xUnit||'mm'})`,'bl-tx-s bl-tx-m');
    svg+=text(padL-6,Y(hi)+4,fmt(hi),'bl-tx-s bl-tx-m','end')+text(padL-6,Y(lo)+4,fmt(lo),'bl-tx-s bl-tx-m','end')+text(4,12,`w (${opts.wUnit||'N/mm'})`,'bl-tx-s bl-tx-m','start');
    return svg+'</svg>';
  }

  /* ------------------------------------------------------ free bodies */

  const supportName=i=>String.fromCharCode(65+i);
  /** A solved reaction that is zero (to round-off, or printed as 0) is labelled 0 and drawn without an arrow. */
  function zeroTolerance(loads, L) {
    loads=loads.map(normLoad);
    let F=0, C=0;
    for(const v of loads) {
      if(v.kind==='point') F+=Math.abs(v.force);
      else if(v.kind==='moment') C+=Math.abs(v.moment);
      else if(v.kind==='distributed') F+=Math.abs(v.end-v.start)*Math.max(Math.abs(v.qStart),Math.abs(v.qEnd));
      else if(isDist(v)) {const [a,b]=spanOf(v);F+=Math.abs(b-a)*LDS().peak(v);}
    }
    return {force:Math.max(1e-12*(F+C/L),1e-13), moment:Math.max(1e-12*(F*L+C),1e-13)};
  }
  /**
   * Whole-beam free-body diagram: supports removed and replaced by reactions.
   * mode 'unknown': symbolic reactions drawn in their positive (assumed) directions, R ↓ and C ↻.
   * mode 'solved': solved reactions drawn in their ACTUAL directions and labelled with their SIGNED values in the
   * single convention (R ↓ +, C ↻ +): a negative R points up, a negative C turns counter-clockwise.
   * mode 'solved' : reactions in their actual directions with magnitudes from the result.
   */
  // Reaction labels below the beam, R first and then C at a clamp; a label that would overlap one already placed on
  // its row moves down a row (widths over-estimated for 12.5 px semi-bold type). Returns the number of rows used.
  function placeLabels(items) {
    const est=s=>7*String(s).replace(/_([A-Za-z0-9]+)/g,'$1').length+8, rows=[];
    for(const it of items) {
      const w=est(it.s), x0=it.anchor==='start'?it.x:it.anchor==='end'?it.x-w:it.x-w/2, x1=x0+w;
      let r=it.after?it.after.row+1:0;
      while((rows[r]||[]).some(([a,b])=>!(x1<=a||x0>=b))) r++;
      (rows[r]=rows[r]||[]).push([x0,x1]);it.row=r;
    }
    return rows.length;
  }
  function freeBody(model, result, opts={}) {
    const W=clampWidth(opts.width), L=model.length, pad=92, mode=opts.mode||'solved', narrow=W<560;
    const X=x=>pad+(W-2*pad)*x/L;
    const loads=result?result.loadsApplied:model.loads;
    const reactions=result?result.reactions:model.supports.map(s=>({x:s.x,kind:s.kind,force:NaN,moment:NaN}));
    const tol=zeroTolerance(loads,L);
    // Unknowns: drawn in the positive directions (R ↓, C ↻). Solved: actual directions, labelled with signed values.
    const items=[];
    reactions.forEach((r,i)=>{
      const n=supportName(i), x=X(r.x), anchor=r.x===0?'start':r.x===L?'end':'middle', lx=anchor==='start'?x-30:anchor==='end'?x+30:x;
      const zeroF=mode!=='unknown'&&Math.abs(r.force)<=tol.force;
      const R={x:lx,anchor,s:mode==='unknown'?`R_${n} (assumed ↓ +)`:zeroF?`R_${n} = 0 N`:`R_${n} = ${signed(r.force)} N`};items.push(R);
      if(r.kind==='fixed') {const zeroM=mode!=='unknown'&&Math.abs(r.moment)<=tol.moment;items.push({x:lx,anchor,after:R,s:mode==='unknown'?`C_${n} (assumed ↻ +)`:zeroM?`C_${n} = 0 N·mm`:`C_${n} = ${signed(r.moment)} N·mm`});}
    });
    const nRows=placeLabels(items);
    const yTop=12+loadHeight(loads), yAxis=yTop+6, yBottom=yTop+12, yDim=yBottom+100+Math.max(0,nRows-2)*16, H=yDim+(narrow?74:60);
    let svg=svgOpen(W,H,opts.label||(mode==='unknown'?'Free-body diagram: supports replaced by unknown reactions in their positive directions (R down, C clockwise)':'Free-body diagram: supports replaced by the solved reactions, drawn in their actual directions and labelled with signed values (R down positive, C clockwise positive)'),'bl-fbd');
    svg+=`<rect x="${r1(X(0))}" y="${r1(yTop)}" width="${r1(X(L)-X(0))}" height="12" rx="2" class="bl-beam"/>`;
    model.hinges.forEach(h=>{svg+=`<circle cx="${r1(X(h))}" cy="${r1(yAxis)}" r="6" class="bl-hinge-c"/>`;});
    svg+=drawLoads(loads,X,yTop,{width:W}).svg;
    if(opts.resultants===true) for(const v of loads.filter(isDist).map(normLoad)) {
      let Wt,xbar;
      if(v.kind==='distributed') {const h=v.end-v.start;Wt=h*(v.qStart+v.qEnd)/2;if(Math.abs(Wt)<1e-12) continue;xbar=v.start+h*(v.qStart+2*v.qEnd)/(3*(v.qStart+v.qEnd));}
      else {const [a,b]=spanOf(v),part=LDS().portion(v,a,b,0);Wt=part.W;xbar=part.xbar;if(xbar===null||Math.abs(Wt)<1e-12) continue;}
      const [lo,hi]=spanOf(v);
      if(xbar<lo-1e-9||xbar>hi+1e-9) continue;
      svg+=`<g class="bl-resultant">${line(X(xbar),yBottom+2,X(xbar),yBottom+30,'bl-res-line')}</g>`;
      svg+=text(X(xbar),yBottom+42,`W = ${fmt(Math.abs(Wt))} N ${Wt>0?'↓':'↑'} at x̄ = ${fmt(xbar)}`,'bl-tx-s bl-tx-m');
    }
    reactions.forEach((r,i)=>{
      const x=X(r.x), n=supportName(i);
      const up=mode==='unknown'?false:r.force<0, zeroF=mode!=='unknown'&&Math.abs(r.force)<=tol.force;
      if(!zeroF) svg+=`<g data-ext="R" data-support="${n}" data-dir="${up?'up':'down'}">${up?arrow(x,yBottom+46,x,yBottom+2,'bl-react',9):arrow(x,yBottom+2,x,yBottom+46,'bl-react',9)}</g>`;
      if(r.kind==='fixed') {
        const cw=mode==='unknown'?true:r.moment>0, zeroM=mode!=='unknown'&&Math.abs(r.moment)<=tol.moment;
        if(!zeroM) svg+=`<g data-ext="C" data-support="${n}" data-dir="${cw?'cw':'ccw'}">${coupleArrow(x,yAxis,22,cw,'bl-react')}</g>`;
      }
      if(r.kind!=='roller') {
        // Complete planar free body: the horizontal reaction exists but is zero for transverse loads.
        const end=r.x===0||r.x===L, dir=r.x===L?1:-1;
        const y=end?yAxis:yBottom+24, x1=end?x+dir*(r.kind==='fixed'?30:8):x-6, x0=end?x1+dir*44:x-40;
        svg+=`<g class="bl-axial">${arrow(x0,y,x1,y,'bl-react bl-dashed',7)}</g>`;
        svg+=label(end?(x0+x1)/2:x0-4,end?y-9:y+4,`H_${n} = 0`,'bl-tx-xs bl-tx-m',end?'middle':'end');
      }
    });
    for(const it of items) svg+=label(it.x,yBottom+62+16*it.row,it.s,'bl-tx-s bl-tx-react bl-tx-b',it.anchor);
    svg+=dimensionLine(model,X,yDim,W);
    if(reactions.length) {
      const key=mode==='unknown'?['Unknown reactions drawn in their positive directions:','R ↓ +, C ↻ +.']:['Reactions: signed values (R ↓ +, C ↻ +);','arrows in the actual directions.'];
      svg+=narrow?text(W/2,yDim+54,key[0],'bl-tx-xs bl-tx-m')+text(W/2,yDim+68,key[1],'bl-tx-xs bl-tx-m'):text(W/2,yDim+54,key.join(' '),'bl-tx-xs bl-tx-m');
    }
    return svg+'</svg>';
  }

  /**
   * Free body of the part left or right of a cut, with the internal V and M on the cut face.
   * cut = {x, side:'left'|'right', limit:'left'|'right'} where limit selects x⁻ or x⁺ at a jump.
   */
  function segmentFbd(model, result, cut, opts={}) {
    const W=clampWidth(opts.width), L=model.length, eps=L*1e-10, side=cut.side||'left', limit=cut.limit||'left';
    const a=side==='left'?0:cut.x, b=side==='left'?cut.x:L, span=Math.max(b-a,1e-9);
    // A cut at an end (x = 0⁺ or L⁻) leaves a part of zero length: draw it as a thin slice, its
    // actions (the end support's reaction) at the outer end and the cut face SLICE px further in,
    // with room on the outer side for the reaction labels.
    const thin=b-a<=eps, SLICE=26;
    const face=Math.max(128,Math.min(176,W*0.36)), far=W<520?36:60, outer=Math.max(far+118,W*0.4);
    const pad=side==='left'?(thin?outer:far):face, padR=side==='left'?face:(thin?outer:far);
    const X=thin?(()=>side==='left'?pad:W-padR):(x=>pad+(W-pad-padR)*(x-a)/span);
    const x0=thin&&side==='right'?W-padR-SLICE:X(a), x1=thin&&side==='left'?pad+SLICE:X(b);
    // Actions on this part: x⁻ cut keeps actions at x on the RIGHT part, x⁺ keeps them on the LEFT part.
    const atCut=x=>Math.abs(x-cut.x)<=eps;
    const inside=x=>side==='left'?(x<cut.x-eps||(atCut(x)&&limit==='right')):(x>cut.x+eps||(atCut(x)&&limit==='left'));
    const loads=[];
    for(const v of result.loadsApplied) {
      if(v.kind==='distributed') {
        const s=Math.max(v.start,a),e=Math.min(v.end,b);
        if(e-s>eps) {const q=x=>v.qStart+(v.qEnd-v.qStart)*(x-v.start)/(v.end-v.start);loads.push({...v,start:s,end:e,qStart:q(s),qEnd:q(e)});}
      } else if(isDist(v)) {
        const [lo,hi]=spanOf(v),s=Math.max(lo,a),e=Math.min(hi,b);
        if(e-s>eps) loads.push({...v,_clip:[s,e]});
      } else if(inside(v.position)) loads.push(v);
    }
    const reactions=result.reactions.map((r,i)=>({...r,name:supportName(i)})).filter(r=>inside(r.x));
    const V=cut.V, M=cut.M;
    const yTop=12+loadHeight(loads), yAxis=yTop+6, yBottom=yTop+12, H=yBottom+104;
    let svg=svgOpen(W,H,`Free body of the ${side} part, cut at x = ${fmt(cut.x)} mm (${limit==='left'?'x⁻':'x⁺'})`,'bl-fbd bl-segment');
    svg+=`<rect x="${r1(x0)}" y="${r1(yTop)}" width="${r1(x1-x0)}" height="12" rx="2" class="bl-beam"/>`;
    const faceX=side==='left'?x1:x0;
    svg+=line(faceX,yTop-10,faceX,yBottom+10,'bl-cutface');
    model.hinges.filter(h=>h>a+eps&&h<b-eps).forEach(h=>{svg+=`<circle cx="${r1(X(h))}" cy="${r1(yAxis)}" r="6" class="bl-hinge-c"/>`;});
    svg+=drawLoads(loads,X,yTop,{width:W}).svg;
    const tol=zeroTolerance(result.loadsApplied,L);
    for(const r of reactions) {
      const x=X(r.x), zeroF=Math.abs(r.force)<=tol.force;
      // On a thin end slice the reaction labels go on the outer side, away from the V and M labels.
      const lx=thin?(side==='left'?x-14:x+14):x, la=thin?(side==='left'?'end':'start'):x<90?'start':x>W-90?'end':'middle';
      if(!zeroF) svg+=`<g data-ext="R" data-support="${r.name}" data-dir="${r.force<0?'up':'down'}">${r.force<0?arrow(x,yBottom+46,x,yBottom+2,'bl-react',9):arrow(x,yBottom+2,x,yBottom+46,'bl-react',9)}</g>`;
      // Signed values in the single convention (R ↓ +, C ↻ +); the arrow shows the actual direction.
      svg+=label(lx,yBottom+62,zeroF?`R_${r.name} = 0 N`:`R_${r.name} = ${signed(r.force)} N`,'bl-tx-s bl-tx-react bl-tx-b',la);
      if(r.kind==='fixed'&&Math.abs(r.moment)>tol.moment) {
        svg+=`<g data-ext="C" data-support="${r.name}" data-dir="${r.moment>0?'cw':'ccw'}">${coupleArrow(x,yAxis,20,r.moment>0,'bl-react')}</g>`;
        svg+=label(lx,yBottom+78,`C_${r.name} = ${signed(r.moment)} N·mm`,'bl-tx-s bl-tx-react bl-tx-b',la);
      }
    }
    // Positive V acts DOWN on the left part's cut face and UP on the right part's face.
    // Positive (sagging) M is counter-clockwise on the left part's face, clockwise on the right part's.
    const vDown=side==='left'?V>=0:V<0, dir=side==='left'?1:-1, anchor=dir>0?'start':'end';
    // V arrow next to the face; its label sits at the arrow's tail. M arc further out, its label on
    // the opposite side of the beam from the V label so that the two never overlap.
    const vx=faceX+dir*16;
    if(Math.abs(V)>1e-12) svg+=vDown?arrow(vx,yAxis-38,vx,yAxis-2,'bl-int',9):arrow(vx,yAxis+38,vx,yAxis+2,'bl-int',9);
    const vAbove=Math.abs(V)<=1e-12||vDown;
    svg+=text(vx,vAbove?yAxis-46:yAxis+54,`V = ${fmt(V)} N`,'bl-tx-s bl-tx-int bl-tx-b',anchor);
    const mCw=side==='left'?M<0:M>0;
    if(Math.abs(M)>1e-12) svg+=coupleArrow(faceX+dir*46,yAxis,15,mCw,'bl-int');
    const my=vAbove?yAxis+40:yAxis-44;
    svg+=text(vx,my,`M = ${fmt(M)} N·mm`,'bl-tx-s bl-tx-int bl-tx-b',anchor);
    svg+=text(vx,my+16,M>0?'sagging (+)':M<0?'hogging (−)':'',`bl-tx-s bl-tx-m`,anchor);
    // span labels
    if(thin) svg+=text((x0+x1)/2,yBottom+96,`thin slice at x = ${fmt(a)} mm (${side==='left'?'0 to 0⁺':'L⁻ to L'})`,'bl-tx-s bl-tx-m');
    else {
      svg+=text(X(a),yBottom+96,`${fmt(a)} mm${cut.jump&&side==='right'?(limit==='left'?' (x⁻)':' (x⁺)'):''}`,'bl-tx-s bl-tx-m',side==='left'?'start':'middle');
      svg+=text(X(b),yBottom+96,`${fmt(b)} mm${cut.jump?(limit==='left'?' (x⁻)':' (x⁺)'):''}`,'bl-tx-s bl-tx-m',side==='left'?'middle':'end');
    }
    return svg+'</svg>';
  }

  /**
   * The two faces of one cut, pulled apart. The internal shear V and moment M act on BOTH faces as an
   * equal and opposite pair: positive V acts down on the left part's face and up on the right part's;
   * positive (sagging) M acts counter-clockwise on the left part's face and clockwise on the right part's.
   * Arrows are drawn in the actual directions of the given values. cut = {x, V, M, limit, jump};
   * opts.labels = {V, M} replaces the value labels; opts.title replaces the heading.
   */
  function cutFaces(cut, opts={}) {
    const W=clampWidth(opts.width), g=Math.max(140,Math.min(180,W*0.36)), xL=W/2-g/2, xR=W/2+g/2, y=82, H=184;
    const V=cut.V, M=cut.M, hasV=Math.abs(V)>1e-12, hasM=Math.abs(M)>1e-12;
    const where=Number.isFinite(cut.x)?`x = ${fmt(cut.x)} mm${cut.jump?(cut.limit==='right'?' (x⁺)':' (x⁻)'):''}`:'a cut';
    const vText=opts.labels?opts.labels.V:`V = ${signed(V,6)} N`, mText=opts.labels?opts.labels.M:`M = ${signed(M,6)} N·mm`;
    const dV=left=>(V>0)===left?'down':'up', dM=left=>(M>0)===left?'counter-clockwise':'clockwise';
    const aria=`The two faces of the cut at ${where}: ${hasV?`${vText} acts ${dV(true)} on the left part's face and ${dV(false)} on the right part's face`:'V = 0'}; ${hasM?`${mText} acts ${dM(true)} on the left part's face and ${dM(false)} on the right part's face`:'M = 0'}.`;
    let svg=svgOpen(W,H,aria,'bl-faces');
    svg+=text(W/2,16,opts.title||`Cut at ${where}: the two faces pulled apart`,'bl-tx-s bl-tx-b');
    svg+=`<rect x="10" y="${y-6}" width="${r1(xL-10)}" height="12" rx="2" class="bl-beam"/><rect x="${r1(xR)}" y="${y-6}" width="${r1(W-10-xR)}" height="12" rx="2" class="bl-beam"/>`;
    svg+=line(xL,y-24,xL,y+24,'bl-cutface')+line(xR,y-24,xR,y+24,'bl-cutface');
    if(hasV) {
      const down=V>0;   // on the LEFT part's face
      svg+=`<g data-face="left" data-v="${down?'down':'up'}">${down?arrow(xL+14,y-40,xL+14,y-2,'bl-int',9):arrow(xL+14,y+40,xL+14,y+2,'bl-int',9)}</g>`;
      svg+=`<g data-face="right" data-v="${down?'up':'down'}">${down?arrow(xR-14,y+40,xR-14,y+2,'bl-int',9):arrow(xR-14,y-40,xR-14,y-2,'bl-int',9)}</g>`;
    }
    if(hasM) {
      svg+=`<g data-face="left" data-m="${M>0?'ccw':'cw'}">${coupleArrow(xL+44,y,14,M<0,'bl-int',7)}</g>`;
      svg+=`<g data-face="right" data-m="${M>0?'cw':'ccw'}">${coupleArrow(xR-44,y,14,M>0,'bl-int',7)}</g>`;
    }
    svg+=text(10,y-50,vText,'bl-tx-xs bl-tx-int bl-tx-b','start')+text(W-10,y-50,vText,'bl-tx-xs bl-tx-int bl-tx-b','end');
    svg+=text(10,y+58,mText,'bl-tx-xs bl-tx-int bl-tx-b','start')+text(W-10,y+58,mText,'bl-tx-xs bl-tx-int bl-tx-b','end');
    svg+=text(10,H-10,'face of the left part','bl-tx-xs bl-tx-m','start')+text(W-10,H-10,'face of the right part','bl-tx-xs bl-tx-m','end');
    return svg+'</svg>';
  }

  /**
   * Thin slice around one support (x⁻ to x⁺) as a free body. External actions on it: the reaction R and, at a
   * clamp, the reaction couple C (green), plus any point force P or couple C0 applied at that station (purple).
   * Internal actions on its cut faces (orange): the slice's LEFT face is the face of the part right of the cut at
   * x⁻ (V > 0 acts up, M > 0 clockwise); its RIGHT face is the face of the part left of the cut at x⁺ (V > 0 acts
   * down, M > 0 counter-clockwise). An end support has one face. Equilibrium (app signs ↓ +, ↻ +):
   * R + P − V(x⁻) + V(x⁺) = 0 and C + C0 + M(x⁻) − M(x⁺) = 0.
   * s = {name, kind, x, end:'left'|'right'|null, R, C, P, C0, left:{V,M}|null, right:{V,M}|null}
   */
  function supportSlice(s, opts={}) {
    const W=Math.max(340,Math.min(560,opts.width||400)), H=206, cx=W/2, y=92, half=30, t=1e-12;
    const at=s.end==='left'?'x = 0':s.end==='right'?'x = L':`x = ${fmt(s.x)} mm`;
    const parts=[];
    let svg=svgOpen(W,H,opts.label||`Thin slice at support ${s.name} (${at})`,'bl-fbd bl-slice');
    svg+=text(cx,16,`Thin slice at support ${s.name} (${at})`,'bl-tx-s bl-tx-b');
    svg+=`<rect x="${r1(cx-half)}" y="${y-6}" width="${2*half}" height="12" rx="2" class="bl-beam"/>`;
    if(Math.abs(s.R)>t) {svg+=`<g data-ext="R" data-dir="${s.R<0?'up':'down'}">${s.R<0?arrow(cx,y+58,cx,y+8,'bl-react',9):arrow(cx,y+8,cx,y+58,'bl-react',9)}</g>`;parts.push('R');}
    if(s.kind==='fixed'&&Math.abs(s.C)>t) svg+=`<g data-ext="C" data-dir="${s.C>0?'cw':'ccw'}">${coupleArrow(cx,y,22,s.C>0,'bl-react')}</g>`;
    if(Math.abs(s.P||0)>t) svg+=s.P>0?arrow(cx,y-58,cx,y-8,'bl-load bl-point',9):arrow(cx,y-8,cx,y-58,'bl-load bl-point',9);
    if(Math.abs(s.C0||0)>t) svg+=coupleArrow(cx,y,13,s.C0>0,'bl-load bl-couple',7);
    // Reactions: signed values in the single convention (R ↓ +, C ↻ +); the arrows show the actual directions.
    svg+=label(cx,y+78,Math.abs(s.R)>t?`R_${s.name} = ${signed(s.R,6)} N`:`R_${s.name} = 0 N`,'bl-tx-xs bl-tx-react bl-tx-b');
    if(s.kind==='fixed') svg+=label(cx,y+94,Math.abs(s.C)>t?`C_${s.name} = ${signed(s.C,6)} N·mm`:`C_${s.name} = 0 N·mm`,'bl-tx-xs bl-tx-react bl-tx-b');
    if(Math.abs(s.P||0)>t||Math.abs(s.C0||0)>t) svg+=text(cx,y-66,[Math.abs(s.P||0)>t?`P = ${fmt(Math.abs(s.P))} N ${s.P>0?'↓':'↑'}`:'',Math.abs(s.C0||0)>t?`C = ${fmt(Math.abs(s.C0))} N·mm ${s.C0>0?'↻':'↺'}`:''].filter(Boolean).join(', '),'bl-tx-xs bl-tx-load bl-tx-b');
    const face=(side,f)=>{
      const fx=side==='left'?cx-half:cx+half, d=side==='left'?-1:1, vx=fx+d*14, anchor=side==='left'?'end':'start', lx=fx+d*26;
      const lim=side==='left'?(s.end==='right'?'L⁻':'x⁻'):(s.end==='left'?'0⁺':'x⁺');
      let g=line(fx,y-26,fx,y+26,'bl-cutface');
      // Left face = face of a RIGHT part (V > 0 up); right face = face of a LEFT part (V > 0 down).
      const up=side==='left'?f.V>0:f.V<0, cw=side==='left'?f.M>0:f.M<0;
      if(Math.abs(f.V)>t) g+=`<g data-face="${side}" data-v="${up?'up':'down'}">${up?arrow(vx,y+40,vx,y+2,'bl-int',9):arrow(vx,y-40,vx,y-2,'bl-int',9)}</g>`;
      if(Math.abs(f.M)>t) g+=`<g data-face="${side}" data-m="${cw?'cw':'ccw'}">${coupleArrow(fx+d*44,y,12,cw,'bl-int',7)}</g>`;
      g+=text(lx,y-50,`V(${lim}) = ${signed(f.V,6)} N`,'bl-tx-xs bl-tx-int bl-tx-b',anchor);
      g+=text(lx,y+58,`M(${lim}) = ${signed(f.M,6)} N·mm`,'bl-tx-xs bl-tx-int bl-tx-b',anchor);
      return g;
    };
    if(s.left) svg+=face('left',s.left); else svg+=text(cx-half-8,y+4,'end of beam','bl-tx-xs bl-tx-m','end');
    if(s.right) svg+=face('right',s.right); else svg+=text(cx+half+8,y+4,'end of beam','bl-tx-xs bl-tx-m','start');
    return svg+'</svg>';
  }

  /**
   * One plot as a standalone SVG for download (the page rasterizes it to PNG): white background and its own
   * colours and fonts (no page CSS, so it reads the same in light or dark viewers and on paper), a title, the
   * model and loads, both axes with units, the sign convention and a note on what the curve is.
   * opts: {width, chartHeight, supports:[x], station:{x, values}, title, lines:[...], notes:[...]}.
   * Returns {svg, width, height}.
   */
  function chartImage(result, key, opts={}) {
    const meta=CHARTS[key]||{title:key,unit:''}, W=opts.width||960, pad=24, lh=19, cw=8.2;
    const wrap=s=>{const max=Math.max(40,Math.floor((W-2*pad)/cw)), out=[];let cur='';
      for(const w of String(s).split(' ')){if(cur&&(cur+' '+w).length>max){out.push(cur);cur=w;}else cur=cur?cur+' '+w:w;}
      if(cur)out.push(cur);return out;};
    const head=(opts.lines||[]).flatMap(wrap), foot=(opts.notes||[]).flatMap(wrap), ch=opts.chartHeight||380;
    const top=pad+28+head.length*lh+6, H=Math.round(top+ch+10+foot.length*lh+pad-4);
    const style='text{font-family:Arial,Helvetica,"Liberation Sans","DejaVu Sans",sans-serif;font-size:13px;fill:#111;paint-order:stroke;stroke:#fff;stroke-width:3px;stroke-linejoin:round}'+
      '.bl-tx-s{font-size:12.5px}.bl-tx-xs{font-size:12px}.bl-tx-b{font-weight:700}.bl-tx-m{fill:#444}.bl-tx-cut{fill:#9a3f05}'+
      '.bl-grid{stroke:#dfe5eb;stroke-width:1}.bl-zero{stroke:#555;stroke-width:1.3}.bl-axis{stroke:#555;stroke-width:1}'+
      '.bl-curve{fill:none;stroke:#0b5cc0;stroke-width:2.4;stroke-linejoin:round}.bl-area{fill:#0b5cc0;opacity:.1}.bl-ext{fill:#0b5cc0}'+
      '.bl-cut{stroke:#c2560c;stroke-width:2;stroke-dasharray:6 4}.bl-cut-dot{fill:#c2560c;stroke:#fff;stroke-width:2}'+
      '.img-title{font-size:20px;font-weight:700}.img-line{font-size:14px;fill:#222}.img-note{font-size:13px;fill:#333}';
    const inner=chart(result,key,{width:W-2*pad+8,height:ch,supports:opts.supports,cut:opts.station,noTitle:true,yLabel:true})
      .replace(/^<svg /,`<svg x="${pad-8}" y="${r1(top)}" `);
    let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><style>${style}</style>`;
    svg+=`<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`;
    svg+=`<text x="${pad}" y="${pad+14}" class="img-title">${esc(opts.title||`${meta.title} (${meta.unit})`)}</text>`;
    head.forEach((l,i)=>{svg+=`<text x="${pad}" y="${r1(pad+38+i*lh)}" class="img-line">${esc(l)}</text>`;});
    svg+=inner;
    foot.forEach((l,i)=>{svg+=`<text x="${pad}" y="${r1(top+ch+22+i*lh)}" class="img-note">${esc(l)}</text>`;});
    return {svg:svg+'</svg>',width:W,height:H};
  }

  /* -------------------------------------------------------------- charts */

  const CHARTS = {
    shear:{title:'Shear force V',short:'Shear V',unit:'N',axis:'V (N)'},
    moment:{title:'Bending moment M (sagging +)',short:'Moment M (sagging +)',unit:'N·mm',axis:'M (N·mm)'},
    deflection:{title:'Deflection v (down +, drawn downward)',short:'Deflection v (down +)',unit:'mm',axis:'v (mm)',invert:true},
    rotation:{title:'Rotation θ = dv/dx (clockwise +)',short:'Rotation θ (cw +)',unit:'rad',axis:'θ (rad)'},
    stressTop:{title:'Top-fibre stress σ (tension +)',short:'Top-fibre σ (T +)',unit:'MPa',axis:'σ top (MPa)'},
    stressBottom:{title:'Bottom-fibre stress σ (tension +)',short:'Bottom-fibre σ (T +)',unit:'MPa',axis:'σ bottom (MPa)'},
    shearStressMax:{title:'Neutral-axis shear stress |τ|max',short:'Shear stress |τ|max',unit:'MPa',axis:'|τ| (MPa)'}
  };

  /**
   * Line chart of a sampled result array. opts: width, height, yDomain:[min,max], cut:{x, values:[...]},
   * series:[{result,key,cls,label}] for comparison overlays with identical axes, supports (x list).
   */
  function chart(result, key, opts={}) {
    const meta=CHARTS[key]||{title:key,unit:'',axis:key};
    const W=clampWidth(opts.width), H=opts.height||200, m={l:66,r:16,t:30,b:34};
    const series=opts.series||[{result,key,cls:'bl-curve',label:null}];
    const L=opts.xMax||Math.max(...series.map(q=>q.result.input.length));
    let lo=opts.yDomain?opts.yDomain[0]:Math.min(0,...series.flatMap(s=>s.result[s.key]));
    let hi=opts.yDomain?opts.yDomain[1]:Math.max(0,...series.flatMap(s=>s.result[s.key]));
    if(hi-lo<1e-12*Math.max(1,Math.abs(hi),Math.abs(lo))) {hi+=1;lo-=1;}
    const t=niceTicks(lo,hi,4);lo=t.min;hi=t.max;
    const X=x=>m.l+(W-m.l-m.r)*x/L;
    const Y=v=>meta.invert?m.t+(H-m.t-m.b)*(v-lo)/(hi-lo):H-m.b-(H-m.t-m.b)*(v-lo)/(hi-lo);
    let svg=svgOpen(W,H,`${meta.title} in ${meta.unit} along the beam`,'bl-chart').replace('<svg ',`<svg data-x0="${m.l}" data-x1="${r1(W-m.r)}" data-length="${L}" data-w="${r1(W)}" `);
    if(!opts.noTitle) svg+=text(W<540?8:m.l,18,`${W<540?meta.short||meta.title:meta.title} (${meta.unit})`,'bl-tx-s bl-tx-b','start');
    if(opts.yLabel) svg+=`<text x="${r1(14)}" y="${r1((m.t+H-m.b)/2)}" class="bl-tx-xs bl-tx-b" text-anchor="middle" transform="rotate(-90 14 ${r1((m.t+H-m.b)/2)})">${esc(meta.axis)}</text>`;
    for(const v of t.ticks) svg+=line(m.l,Y(v),W-m.r,Y(v),v===0?'bl-zero':'bl-grid')+text(m.l-8,Y(v)+4,fmt(v,3),'bl-tx-xs bl-tx-m','end');
    for(const x of opts.supports||[]) svg+=line(X(x),H-m.b,X(x),H-m.b+6,'bl-axis');
    const xt=niceTicks(0,L,5);
    for(const x of xt.ticks.filter(x=>x>=0&&x<=L+1e-9)) svg+=text(X(x),H-m.b+18,fmt(x,3),'bl-tx-xs bl-tx-m');
    svg+=text(W-m.r,H-4,'x (mm)','bl-tx-xs bl-tx-m','end');
    series.forEach((s,k)=>{
      const xs=s.result.x, ys=s.result[s.key];
      const pts=xs.map((x,i)=>`${r1(X(x))},${r1(Y(ys[i]))}`).join(' ');
      if(k===0&&!opts.noFill) svg+=`<polygon points="${r1(X(xs[0]))},${r1(Y(0))} ${pts} ${r1(X(xs[xs.length-1]))},${r1(Y(0))}" class="bl-area"/>`;
      svg+=`<polyline points="${pts}" class="${s.cls||'bl-curve'}"/>`;
    });
    // Data labels. The exact station values (cut) are placed first and are always shown; the sampled extremes follow.
    // Each label takes the first candidate position that stays inside the plot area and clears every label already
    // placed (widths over-estimated for bold 13 px type, so placed labels cannot overlap). An extreme whose value the
    // station label already shows at the same point is redundant and left out; an extreme with no free position keeps
    // its dot without text (its value is in the readout and the hover). Deterministic: same input, same layout.
    const boxes=[], est=s=>7.6*String(s).length+4;
    const boxOf=(c,s)=>{const w=est(s), x0=c.anchor==='start'?c.x:c.x-w;return {x0,x1:x0+w,y0:c.y-11,y1:c.y+4};};
    const fits=b=>b.x0>=m.l-2&&b.x1<=W-2&&b.y0>=m.t-8&&b.y1<=H-m.b-1&&boxes.every(o=>b.x1<=o.x0||b.x0>=o.x1||b.y1<=o.y0||b.y0>=o.y1);
    const spots=(px,py,dx,above)=>{
      const sides=px<W-150?['start','end']:['end','start'], near=above?[py-8,py+16]:[py+16,py-8], far=above?[py-24,py+32]:[py+32,py-24], out=[];
      for(const rows of [near,far]) for(const a of sides) for(const y of rows) out.push({x:a==='start'?px+dx:px-dx,y,anchor:a});
      return out;
    };
    const take=(cands,s)=>{const c=cands.find(q=>fits(boxOf(q,s)));if(c)boxes.push(boxOf(c,s));return c;};
    let cutSvg='', extSvg='';
    const cutPts=[];
    if(opts.cut&&Number.isFinite(opts.cut.x)) {
      const cx=X(opts.cut.x);
      cutSvg+=line(cx,m.t-4,cx,H-m.b,'bl-cut');
      (opts.cut.values||[]).forEach((p,i)=>{
        const y=Y(p.value), s=`${p.label} = ${fmt(p.value)}`, cands=spots(cx,y,9,i===0);
        cutPts.push({x:cx,y,v:fmt(p.value)});
        cutSvg+=`<circle cx="${r1(cx)}" cy="${r1(y)}" r="5" class="bl-cut-dot"/>`;
        let c=take(cands,s);
        if(!c) {c=cands[0];boxes.push(boxOf(c,s));}   // a station value is never dropped
        cutSvg+=text(c.x,c.y,s,'bl-tx-xs bl-tx-cut bl-tx-b',c.anchor,' data-label="cut"');
      });
    }
    if(opts.extremes!==false&&series.length===1) {
      const ys=series[0].result[key], xs=series[0].result.x;
      let iMax=0,iMin=0;ys.forEach((v,i)=>{if(v>ys[iMax])iMax=i;if(v<ys[iMin])iMin=i;});
      const mark=(i,above)=>{
        const x=X(xs[i]), y=Y(ys[i]), v=fmt(ys[i]);
        if(cutPts.some(p=>Math.abs(p.y-y)<=6&&(Math.abs(p.x-x)<=4||(Math.abs(p.x-x)<=12&&p.v===v)))) return '';
        const s=`${v} at x = ${fmt(xs[i],3)}`, c=take(spots(x,y,7,above),s);
        return `<circle cx="${r1(x)}" cy="${r1(y)}" r="3.5" class="bl-ext"/>`+(c?text(c.x,c.y,s,'bl-tx-xs bl-tx-b',c.anchor,' data-label="ext"'):'');
      };
      const scale=Math.max(Math.abs(ys[iMax]),Math.abs(ys[iMin]));
      if(ys[iMax]>1e-9*scale&&scale>0) extSvg+=mark(iMax,!meta.invert);
      if(ys[iMin]<-1e-9*scale&&scale>0) extSvg+=mark(iMin,!!meta.invert);
    }
    svg+=extSvg+cutSvg;
    if(opts.legend&&W>=420) {
      let lx=W-m.r;
      [...opts.legend].reverse().forEach(l=>{const w=12+7*l.label.length;lx-=w;svg+=`<line x1="${r1(lx)}" y1="12" x2="${r1(lx+14)}" y2="12" class="${l.cls}"/>`+text(lx+18,16,l.label,'bl-tx-xs','start');lx-=10;});
    }
    return svg+'</svg>';
  }

  /* ----------------------------------------------------- cross-sections */

  /** Outline path(s) of a section centred at (cx, cy) with scale s px/mm; returns {outer, inner}. */
  function sectionPaths(section, cx, cy, s) {
    const R=(x,y,w,h)=>`M${r1(cx+x*s)} ${r1(cy-y*s)}h${r1(w*s)}v${r1(h*s)}h${r1(-w*s)}Z`;
    const C=(r)=>`M${r1(cx-r*s)} ${r1(cy)}a${r1(r*s)} ${r1(r*s)} 0 1 0 ${r1(2*r*s)} 0a${r1(r*s)} ${r1(r*s)} 0 1 0 ${r1(-2*r*s)} 0Z`;
    if(section.shape==='rectangle'||section.shape==='layered') return R(-section.width/2,section.height/2,section.width,section.height);
    if(section.shape==='circle') return C(section.diameter/2);
    if(section.shape==='tube') return C(section.outerDiameter/2)+C(section.outerDiameter/2-section.thickness);
    if(section.shape==='box') {const {width:B,height:H,thickness:t}=section;return R(-B/2,H/2,B,H)+R(-B/2+t,H/2-t,B-2*t,H-2*t);}
    const {flangeWidth:bf,height:h,flangeThickness:tf,webThickness:tw}=section;
    return `M${r1(cx-bf/2*s)} ${r1(cy-h/2*s)}h${r1(bf*s)}v${r1(tf*s)}h${r1(-(bf-tw)/2*s)}v${r1((h-2*tf)*s)}h${r1((bf-tw)/2*s)}v${r1(tf*s)}h${r1(-bf*s)}v${r1(-tf*s)}h${r1((bf-tw)/2*s)}v${r1(-(h-2*tf)*s)}h${r1(-(bf-tw)/2*s)}Z`;
  }

  function dimH(x1,x2,y,s,cls='bl-dim'){return line(x1,y,x2,y,cls)+line(x1,y-5,x1,y+5,cls)+line(x2,y-5,x2,y+5,cls)+label((x1+x2)/2,y-6,s,'bl-tx-xs bl-tx-b');}
  function dimV(x,y1,y2,s,left=false){return line(x,y1,x,y2,'bl-dim')+line(x-5,y1,x+5,y1,'bl-dim')+line(x-5,y2,x+5,y2,'bl-dim')+label(x+(left?-7:7),(y1+y2)/2+4,s,'bl-tx-xs bl-tx-b',left?'end':'start');}

  /** Fully dimensioned cross-section with the neutral axis and extreme-fibre distance c. */
  function sectionDrawing(section, props, opts={}) {
    if(section.shape==='layered')return layeredDrawing(section,props,opts);
    const W=Math.max(260,Math.min(420,opts.width||300)), depth=props.depth, width=props.width;
    const s=Math.min((W-130)/width,150/depth), H=opts.height||Math.max(150,depth*s+86), cx=W/2-10, cy=(H-8)/2+(section.shape==='ibeam'?8:0);
    let svg=svgOpen(W,H,`${props.label}: dimensioned cross-section`,'bl-section');
    svg+=`<path d="${sectionPaths(section,cx,cy,s)}" class="bl-sec" fill-rule="evenodd"/>`;
    svg+=line(cx-width/2*s-18,cy,cx+width/2*s+18,cy,'bl-na')+text(cx-width/2*s-20,cy+4,'NA','bl-tx-xs bl-tx-m','end');
    svg+=`<circle cx="${r1(cx)}" cy="${r1(cy)}" r="2.5" class="bl-ext"/>`;
    const top=cy-depth/2*s, bot=cy+depth/2*s, left=cx-width/2*s, right=cx+width/2*s;
    const f=v=>fmt(v,3);
    if(section.shape==='rectangle') {svg+=dimH(left,right,bot+20,`b = ${f(section.width)}`)+dimV(right+20,top,bot,`h = ${f(section.height)}`);}
    else if(section.shape==='circle') {svg+=dimH(left,right,bot+20,`d = ${f(section.diameter)}`);}
    else if(section.shape==='tube') {svg+=dimH(left,right,bot+20,`D = ${f(section.outerDiameter)}`)+text(right+6,cy-depth/2*s*0.62,`t = ${f(section.thickness)}`,'bl-tx-xs bl-tx-b','start');}
    else if(section.shape==='box') {svg+=dimH(left,right,bot+20,`B = ${f(section.width)}`)+dimV(right+20,top,bot,`H = ${f(section.height)}`)+text(left+section.thickness*s+4,top+section.thickness*s+14,`t = ${f(section.thickness)}`,'bl-tx-xs bl-tx-b','start');}
    else {svg+=dimH(left,right,top-12,`b_f = ${f(section.flangeWidth)}`)+dimV(right+20,top,bot,`h = ${f(section.height)}`)+label(left-4,top+section.flangeThickness*s/2+4,`t_f = ${f(section.flangeThickness)}`,'bl-tx-xs bl-tx-b','end')+label(cx+section.webThickness*s/2+5,cy+depth*s/4,`t_w = ${f(section.webThickness)}`,'bl-tx-xs bl-tx-b','start');}
    svg+=dimV(left-30,top,cy,`c = ${f(props.c)}`,true);
    svg+=text(8,H-8,'mm','bl-tx-xs bl-tx-m','start');
    return svg+'</svg>';
  }

  /** Diverging colour for sigma/scale in [-1, 1]: compression blue, tension red. */
  function stressColor(t) {
    const u=Math.max(-1,Math.min(1,t));
    const mix=(a,b,k)=>a.map((v,i)=>Math.round(v+(b[i]-v)*k));
    const white=[247,247,247], red=[196,48,62], blue=[38,94,184];
    const c=u>=0?mix(white,red,u):mix(white,blue,-u);
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  /**
   * Stress through the depth at one station: section shaded by sigma, the linear sigma(z) and the
   * section-dependent tau(z) = V Q/(I b). opts.scale fixes the colour scale (A/B comparisons).
   */
  function sectionStress(section, props, M, V, opts={}) {
    if(section.shape==='layered')return layeredDrawing(section,props,{...opts,M,V,stress:true});
    const S=typeof BeamSections!=='undefined'?BeamSections:require('./beam_sections.js');
    const W=clampWidth(opts.width), c=props.c, stacked=W<640;
    // Three panels side by side, or stacked on narrow screens so that nothing is squeezed.
    const panelW=stacked?W-24:(W-40)/3, panelH=stacked?212:(opts.height||250), H=stacked?3*panelH:panelH;
    const origin=i=>stacked?[12,i*panelH]:[20+i*panelW,0];
    const sTop=-M*c/props.I, sBot=M*c/props.I, sMax=opts.scale||Math.max(Math.abs(sTop),1e-12);
    const depthPx=panelH-104, s=Math.min(depthPx/props.depth,(Math.min(panelW,300)-70)/props.width);
    let svg=svgOpen(W,H,`Stress through the depth: top ${fmt(sTop)} MPa, bottom ${fmt(sBot)} MPa`,'bl-secstress');
    // 1. Section shaded by sigma (a vertical gradient is exact for a linear field).
    let [x0,y0]=origin(0); let zY=z=>y0+panelH/2+2-z*s;
    const cx=x0+panelW/2, id=nextId('blg');
    svg+=`<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${[0,0.25,0.5,0.75,1].map(k=>`<stop offset="${k}" stop-color="${stressColor((sTop+(sBot-sTop)*k)/sMax)}"/>`).join('')}</linearGradient></defs>`;
    svg+=text(cx,y0+18,'Cross-section shaded by σ','bl-tx-xs bl-tx-b');
    svg+=`<path d="${sectionPaths(section,cx,zY(0),s)}" fill="url(#${id})" class="bl-sec-shaded" fill-rule="evenodd"/>`;
    svg+=line(cx-props.width/2*s-14,zY(0),cx+props.width/2*s+14,zY(0),'bl-na');
    svg+=text(cx,zY(c)-8,sTop>1e-12?'T (tension)':sTop<-1e-12?'C (compression)':'σ = 0','bl-tx-xs bl-tx-b');
    svg+=text(cx,zY(-c)+16,sBot>1e-12?'T (tension)':sBot<-1e-12?'C (compression)':'σ = 0','bl-tx-xs bl-tx-b');
    svg+=text(cx,y0+panelH-10,props.label,'bl-tx-xs bl-tx-m');
    // 2. sigma(z): linear distribution.
    [x0,y0]=origin(1); zY=z=>y0+panelH/2+2-z*s;
    const ox=x0+panelW/2, sw=Math.max(20,Math.min(panelW,320)/2-46)/Math.max(sMax,1e-12);
    svg+=text(ox,y0+18,'Normal stress σ(z) = −Mz/I','bl-tx-xs bl-tx-b');
    svg+=line(ox,zY(c),ox,zY(-c),'bl-axis');
    svg+=`<path d="M${r1(ox)} ${r1(zY(c))}L${r1(ox+sTop*sw)} ${r1(zY(c))}L${r1(ox)} ${r1(zY(0))}Z" class="${sTop>=0?'bl-t':'bl-c'}"/>`;
    svg+=`<path d="M${r1(ox)} ${r1(zY(-c))}L${r1(ox+sBot*sw)} ${r1(zY(-c))}L${r1(ox)} ${r1(zY(0))}Z" class="${sBot>=0?'bl-t':'bl-c'}"/>`;
    svg+=line(ox+sTop*sw,zY(c),ox+sBot*sw,zY(-c),'bl-curve');
    svg+=text(ox+sTop*sw,zY(c)-8,`σ top = ${fmt(sTop)} MPa`,'bl-tx-xs bl-tx-b');
    svg+=text(ox+sBot*sw,zY(-c)+16,`σ bottom = ${fmt(sBot)} MPa`,'bl-tx-xs bl-tx-b');
    svg+=text(ox-8,zY(0)+4,'0','bl-tx-xs bl-tx-m','end');
    svg+=text(ox,y0+panelH-10,`|M| = ${fmt(Math.abs(M))} N·mm; c = ${fmt(c,3)} mm`,'bl-tx-xs bl-tx-m');
    // 3. tau(z) with duplicate samples at width changes.
    [x0,y0]=origin(2); zY=z=>y0+panelH/2+2-z*s;
    const prof=S.shearProfile(S.properties(section),V,61), tmax=Math.max(...prof.map(p=>Math.abs(p.tau)),1e-12);
    const tx=x0+Math.max(24,panelW/2-90), tw=Math.max(20,Math.min(panelW,320)-150)/tmax;
    svg+=text(x0+panelW/2,y0+18,'Shear stress τ(z) = VQ/(Ib)','bl-tx-xs bl-tx-b');
    svg+=line(tx,zY(c),tx,zY(-c),'bl-axis');
    const pts=prof.map(p=>`${r1(tx+Math.abs(p.tau)*tw)},${r1(zY(p.z))}`).join(' ');
    svg+=`<polygon points="${r1(tx)},${r1(zY(-c))} ${pts} ${r1(tx)},${r1(zY(c))}" class="bl-tau"/>`;
    svg+=`<polyline points="${pts}" class="bl-curve"/>`;
    const na=prof.reduce((p,q)=>Math.abs(q.z)<Math.abs(p.z)?q:p);
    svg+=text(tx+Math.abs(na.tau)*tw+6,zY(0)-4,'τ max','bl-tx-xs bl-tx-m','start')+text(tx+Math.abs(na.tau)*tw+6,zY(0)+10,`${fmt(Math.abs(na.tau))} MPa`,'bl-tx-xs bl-tx-b','start');
    svg+=text(x0+panelW/2,y0+panelH-10,`|V| = ${fmt(Math.abs(V))} N; b(z) = total material width`,'bl-tx-xs bl-tx-m');
    return svg+'</svg>';
  }
  function layeredDrawing(section,p,opts={}){
    const SEC=typeof BeamSections!=='undefined'?BeamSections:require('./beam_sections.js');
    p=SEC.properties(section);
    const W=Math.max(300,opts.width||760),H=opts.stress?450:300,left=65,top=65,bw=Math.min(110,W*.25),bh=150,s=bh/p.depth,Y=z=>top+bh/2-z*s;
    let svg=svgOpen(W,H,'Perfectly bonded two-material section: shifted neutral axis, stress jump and interface shear','bl-section');
    svg+=text(12,24,'Two-material rectangle · perfect bond','bl-tx-xs bl-tx-b','start');
    svg+=`<rect x="${left}" y="${top}" width="${bw}" height="${section.topThickness*s}" fill="#c9b4ed" stroke="#654795"/><rect x="${left}" y="${Y(p.interfaceZ)}" width="${bw}" height="${(p.depth-section.topThickness)*s}" fill="#b8ddeb" stroke="#145d85"/>`;
    svg+=text(left+bw+8,top+18,'E₂/E₁='+fmt(section.modulusRatio),'bl-tx-xs','start')+text(left+bw+8,top+bh-6,'Lower: E₁, ρ₁','bl-tx-xs','start');
    svg+=line(left-12,Y(p.zNA),left+bw+12,Y(p.zNA),'bl-na')+text(left-15,Y(p.zNA)+4,'NA','bl-tx-xs bl-tx-b','end');
    svg+=dimH(left,left+bw,top+bh+20,'b = '+fmt(section.width)+' mm')+dimV(left-30,top,top+bh,'h = '+fmt(p.depth),true);
    svg+=text(12,top+bh+52,'zNA='+fmt(p.zNA)+' mm; h₂='+fmt(section.topThickness)+' mm','bl-tx-xs','start');
    svg+=text(12,top+bh+72,'Itrans='+fmt(p.I)+' mm⁴; D=E₁Itrans','bl-tx-xs bl-tx-b','start');
    if(opts.stress){
      const M=opts.M||0,V=opts.V||0,profile=SEC.stressProfile(p,M,21),max=Math.max(1e-12,...profile.map(v=>Math.abs(v.sigma)));
      const rows=profile.filter((v,i)=>i===0||i===profile.length-1||v.z===p.interfaceZ);
      svg+=text(12,top+bh+104,'ε continuous · σ jumps at the bond','bl-tx-xs','start');
      rows.forEach((r,i)=>{svg+=text(12,top+bh+126+18*i,'z = '+fmt(r.z)+' mm: σ = '+fmt(r.sigma)+' MPa','bl-tx-xs','start');});
      // Shade by the actual piecewise stress, not a false single linear gradient.
      for(let i=0;i<60;i++){const z=p.c-(i+.5)*p.depth/60;svg+=`<rect x="${left}" y="${top+i*bh/60}" width="${bw}" height="${bh/60+.2}" fill="${stressColor(SEC.normalStress(p,M,z)/max)}"/>`;}
      svg+=line(left-12,Y(p.zNA),left+bw+12,Y(p.zNA),'bl-na')+line(left,Y(p.interfaceZ),left+bw,Y(p.interfaceZ),'bl-axis');
      const q=V*p.firstMoment(p.interfaceZ)/p.I;
      svg+=text(12,H-32,'Interface q = '+fmt(q)+' N/mm','bl-tx-xs bl-tx-b','start')+text(12,H-16,'Interface τ = q/b = '+fmt(q/section.width)+' MPa','bl-tx-xs bl-tx-b','start');
    }
    return svg+'</svg>';
  }

  /** Elevation of the beam coloured by sigma(x, z) = -M z / I; identical scales for A/B. */
  function stressMap(result, opts={}) {
    const W=clampWidth(opts.width), H=opts.height||132, L=result.input.length, m={l:58,r:58,t:26,b:40};
    const scale=opts.scale||Math.max(result.maxima.bendingStress,1e-12);
    const X=x=>m.l+(W-m.l-m.r)*x/L, top=m.t, bot=H-m.b;
    const id=nextId('bls');
    let svg=svgOpen(W,H,`Bending stress map along the beam; colour scale ±${fmt(scale)} MPa`,'bl-stressmap');
    svg+=text(W<560?8:m.l,16,opts.title||(W<560?`Bending stress σ (±${fmt(scale)} MPa)`:`Bending stress σ through the depth (colour scale ±${fmt(scale)} MPa)`),'bl-tx-s bl-tx-b','start');
    let defs='',body='';
    const n=Math.min(160,Math.max(24,Math.round((W-m.l-m.r)/6)));
    for(let k=0;k<n;k++) {
      const x0=L*k/n,x1=L*(k+1)/n,xm=(x0+x1)/2;
      let i=0;while(i<result.x.length-1&&result.x[i+1]<=xm)i++;
      const sT=result.stressTop[i],sB=result.stressBottom[i];
      if(result.section.shape==='layered'){
        const SEC=typeof BeamSections!=='undefined'?BeamSections:require('./beam_sections.js'),p=SEC.properties(result.section);
        for(let j=0;j<32;j++){const z=p.c-(j+.5)*p.depth/32;body+=`<rect x="${r1(X(x0))}" y="${top+(bot-top)*j/32}" width="${r1(X(x1)-X(x0)+.6)}" height="${(bot-top)/32+.3}" fill="${stressColor(SEC.normalStress(p,result.moment[i],z)/scale)}"/>`;}
        continue;
      }
      defs+=`<linearGradient id="${id}${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${stressColor(sT/scale)}"/><stop offset="0.5" stop-color="${stressColor(0)}"/><stop offset="1" stop-color="${stressColor(sB/scale)}"/></linearGradient>`;
      body+=`<rect x="${r1(X(x0))}" y="${top}" width="${r1(X(x1)-X(x0)+0.6)}" height="${bot-top}" fill="url(#${id}${k})"/>`;
    }
    svg+=`<defs>${defs}</defs>${body}<rect x="${r1(X(0))}" y="${top}" width="${r1(X(L)-X(0))}" height="${bot-top}" class="bl-map-frame"/>`;
    const naY=(top+bot)/2-(result.sectionProperties.zNA||0)/result.sectionProperties.depth*(bot-top);
    svg+=line(X(0),naY,X(L),naY,'bl-na');
    svg+=text(X(0)-6,top+10,'top','bl-tx-xs bl-tx-m','end')+text(X(0)-6,bot-2,'bottom','bl-tx-xs bl-tx-m','end');
    // Legend
    const lx=X(0),lw=Math.min(220,X(L)-X(0)),ly=H-18;
    let leg='';for(let k=0;k<=20;k++){const u=-1+k/10;leg+=`<rect x="${r1(lx+lw*k/21)}" y="${ly-8}" width="${r1(lw/21+0.5)}" height="8" fill="${stressColor(u)}"/>`;}
    svg+=leg+text(lx,ly+12,`−${fmt(scale)} C`,'bl-tx-xs','start')+text(lx+lw,ly+12,`+${fmt(scale)} T`,'bl-tx-xs','end')+text(lx+lw/2,ly+12,'0','bl-tx-xs');
    if(W>=600) svg+=text(X(L),ly+12,'C = compression · T = tension','bl-tx-xs bl-tx-m','end');
    return svg+'</svg>';
  }

  /** Rigid-body mechanism motion (from the engine's kinematic null space). */
  function mechanismSketch(model, mechanism, opts={}) {
    const W=clampWidth(opts.width), L=model.length, pad=58, H=150, X=x=>pad+(W-2*pad)*x/L, y0=70;
    let svg=svgOpen(W,H,'Mechanism: the rigid motion that the supports and hinges allow','bl-mech');
    svg+=line(X(0),y0,X(L),y0,'bl-beam-line');
    model.supports.forEach(s=>{svg+=supportSymbol(s.kind,X(s.x),y0+6,s.x===0?'left':s.x===L?'right':'interior','');});
    model.hinges.forEach(h=>{svg+=`<circle cx="${r1(X(h))}" cy="${y0}" r="5" class="bl-hinge-c"/>`;});
    for(const m of mechanism.motion||[]) svg+=line(X(m.start),y0+28*m.v0,X(m.end),y0+28*m.v1,'bl-mech-line');
    svg+=text(W/2,H-10,W<560?'Dashed: a rigid motion the supports allow.':'Dashed: one possible rigid motion with no deformation — no unique static solution exists.','bl-tx-xs bl-tx-m');
    return svg+'</svg>';
  }

  /** Mode shape with supports; amplitude normalized and arbitrary. */
  function modeShape(model, mode, opts={}) {
    const W=clampWidth(opts.width), L=model.length, pad=58, H=170, X=x=>pad+(W-2*pad)*x/L, y0=78, amp=44*(opts.phase===undefined?1:Math.sin(opts.phase));
    let svg=svgOpen(W,H,`Bending mode ${opts.index+1}: ${fmt(mode.frequencyHz)} Hz, normalized shape`,'bl-mode');
    svg+=line(X(0),y0,X(L),y0,'bl-zero');
    model.supports.forEach(s=>{svg+=supportSymbol(s.kind,X(s.x),y0+8,s.x===0?'left':s.x===L?'right':'interior','');});
    model.hinges.forEach(h=>{svg+=`<circle cx="${r1(X(h))}" cy="${y0}" r="5" class="bl-hinge-c"/>`;});
    svg+=`<polyline points="${mode.x.map((x,i)=>`${r1(X(x))},${r1(y0+amp*mode.shape[i])}`).join(' ')}" class="bl-mode-line"/>`;
    svg+=text(pad,20,`Mode ${opts.index+1} · ${fmt(mode.frequencyHz)} Hz`,'bl-tx-s bl-tx-b','start');
    svg+=text(W<560?W/2:W-pad,H-8,W<560?'Arbitrary amplitude; slowed playback.':'Display amplitude is arbitrary; animation is slowed, not real time.','bl-tx-xs bl-tx-m',W<560?'middle':'end');
    return svg+'</svg>';
  }

  /** Small sign-convention key used in the Learn tab and the printed report. */
  /**
   * Positive-direction sketch for the worked solution: one convention for every external action (forces, line loads
   * and reactions ↓ +; couples, reaction couples and moments of forces ↻ +; v ↓ +, θ ↻ +) and, separately, the
   * internal V and M on the left part's cut face (V ↓ +, sagging M acts ↺ there).
   */
  function positiveAxes(opts={}) {
    const W=Math.max(320,Math.min(620,opts.width||520)), wide=W>=480, H=wide?132:236, pw=wide?W/2:W;
    let svg=svgOpen(W,H,'Positive directions used by the worked solution: x to the right; forces, line loads, support reactions R and the deflection v downward; couples, reaction couples C, moments of forces and the rotation θ clockwise. Internal V and M on the left part\'s cut face: V downward, sagging M counter-clockwise.','bl-axes');
    const panel=(ox,oy,title,body)=>text(ox+12,oy+16,title,'bl-tx-xs bl-tx-b','start')+body(ox,oy);
    svg+=panel(0,0,'External actions: loads and reactions',(ox,oy)=>{
      const yb=oy+66, bx0=ox+14, bx1=ox+pw-16;
      let g=`<rect x="${r1(bx0)}" y="${yb-5}" width="${r1(bx1-bx0)}" height="10" rx="2" class="bl-beam"/>`;
      g+=arrow(bx0,yb+30,bx0+46,yb+30,'bl-xaxis',7)+text(bx0+52,yb+34,'+x','bl-tx-xs','start');
      const fx=ox+pw*0.36;g+=`<g data-axis="force" data-dir="down">${arrow(fx,yb-42,fx,yb-7,'bl-load',8)}</g>`+text(fx+8,yb-30,'+P, +q, +R, +v ↓','bl-tx-xs bl-tx-load bl-tx-b','start');
      const cx=ox+pw*0.78;g+=`<g data-axis="couple" data-dir="cw">${coupleArrow(cx,yb,14,true,'bl-load',7)}</g>`+text(cx,yb+34,'+C, ΣM, +θ ↻','bl-tx-xs bl-tx-load bl-tx-b','middle');
      return g;
    });
    const ox=wide?W/2:0, oy=wide?0:110;
    svg+=panel(ox,oy,'Internal V, M on the left part\'s cut face',(ox,oy)=>{
      const yb=oy+66, x0=ox+16, face=ox+pw*0.46;
      let g=`<rect x="${r1(x0)}" y="${yb-5}" width="${r1(face-x0)}" height="10" rx="2" class="bl-beam"/>`+line(face,yb-16,face,yb+16,'bl-cutface');
      g+=`<g data-axis="V" data-dir="down">${arrow(face+10,yb-30,face+10,yb-4,'bl-int',7)}</g>`+text(face+18,yb-20,'+V ↓','bl-tx-xs bl-tx-int bl-tx-b','start');
      g+=`<g data-axis="M" data-dir="ccw">${coupleArrow(face+54,yb,11,false,'bl-int',7)}</g>`+text(face+72,yb+4,'+M (sagging) ↺','bl-tx-xs bl-tx-int bl-tx-b','start');
      g+=text(ox+12,yb+34,'Internal, not reactions: V = dM/dx, dV/dx = −q','bl-tx-xs bl-tx-m','start');
      return g;
    });
    return svg+'</svg>';
  }

  function signConventions(opts={}) {
    const W=clampWidth(opts.width), cols=W>=620?4:2, rows=4/cols, cellW=W/cols, cellH=118, H=rows*cellH;
    let svg=svgOpen(W,H,'Sign conventions: load and v positive down, couples and rotation clockwise positive, sagging M positive','bl-signs');
    const cell=(k,draw,l1,l2)=>{const cx=cellW*(k%cols+0.5), oy=cellH*Math.floor(k/cols);return draw(cx,oy)+text(cx,oy+90,l1,'bl-tx-xs bl-tx-b')+text(cx,oy+106,l2,'bl-tx-xs bl-tx-m');};
    svg+=cell(0,(x,y)=>arrow(x,y+20,x,y+66,'bl-load',9),'+q, +P, +R, +v','point downward');
    svg+=cell(1,(x,y)=>coupleArrow(x,y+46,18,true,'bl-load'),'+C (applied, reaction), +θ','clockwise');
    svg+=cell(2,(x,y)=>`<path d="M${r1(x-40)} ${y+40} Q${r1(x)} ${y+64} ${r1(x+40)} ${y+40}" class="bl-defl"/>`+coupleArrow(x-50,y+46,12,true,'bl-int',7)+coupleArrow(x+50,y+46,12,false,'bl-int',7),'+M sagging','↻ left face, ↺ right face');
    svg+=cell(3,(x,y)=>`<rect x="${r1(x-22)}" y="${y+34}" width="44" height="22" class="bl-beam"/>`+arrow(x-28,y+70,x-28,y+36,'bl-int',7)+arrow(x+28,y+20,x+28,y+54,'bl-int',7),'+V','↑ left face, ↓ right face');
    return svg+'</svg>';
  }

  return {fmt,signed,niceTicks,esc,label,beamSchematic,freeBody,segmentFbd,cutFaces,supportSlice,chart,chartImage,CHARTS,sectionDrawing,sectionStress,stressMap,stressColor,
    mechanismSketch,modeShape,signConventions,positiveAxes,supportName,tablePreview,zeroTolerance};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=BeamDiagrams;
if(typeof window!=='undefined')window.BeamDiagrams=BeamDiagrams;
