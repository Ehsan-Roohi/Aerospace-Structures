/* Local geometry diagnostics, not AI, a solver bypass, or manufacturing approval.
 * Reuses the engine's vertical ordinates, 120 cavity samples and 0.8 mm gap rule.
 * Runs only after a cavity rejection; never mutates inputs or runs structural FE.
 */
const WingGeometryHelp=(()=>{
 'use strict';
 const GAP=.8,MIN_SKIN=.8;
 function sampleStations(g,E){return [...new Set([0,g.semiSpan,...E.seams(g),...E.ribStations(g),...(g.stations||[]).map(s=>s.eta*g.semiSpan),...Array.from({length:33},(_,i)=>g.semiSpan*i/32)])].sort((a,b)=>a-b);}
 function scan(g,E,ys){let worst=null;for(const y of ys){const chord=E.chordAt(g,y),profile=E.airfoilAt(g,y);for(let i=0;i<120;i++){const x=g.cavityStart+(g.cavityEnd-g.cavityStart)*.5*(1-Math.cos(Math.PI*i/119)),v=E.verticalOrdinates(profile,x,chord,g.te),outer=v.upper-v.lower,gap=outer-2*g.skin;if(!Number.isFinite(gap))throw Error('Non-finite cavity diagnostic');if(!worst||gap<worst.gap)worst={y,eta:y/g.semiSpan,chord,x,outer,gap};}}return worst;}
 function clears(g,E,ys){return scan(g,E,ys).gap>=GAP;}
 function diagnoseCavity(candidate,E){
  const g=E.makeGeometry(candidate),ys=sampleStations(g,E),worst=scan(g,E,ys);
  if(worst.gap>=GAP)return null;
  const maxSkin=(worst.outer-GAP)/2,suggestions=[];
  const thinner=Math.floor((maxSkin-1e-6)*10)/10;
  if(thinner>=MIN_SKIN&&thinner<g.skin&&clears({...g,skin:thinner},E,ys))suggestions.push({kind:'skin',value:thinner,text:`Try skin ${thinner.toFixed(1)} mm instead of ${g.skin.toFixed(2)} mm. This clears the sampled cavity check; re-check strength and print settings.`});
  else suggestions.push({kind:'advice',text:'Do not reduce the skin below the course printing minimum of 0.8 mm. Keep the skin and change the profile or enlarge the chords.'});
  let lo=1,hi=2;
  const scaled=f=>({...g,rootChord:g.rootChord*f,tipChord:g.tipChord*f});
  while(hi<8&&!clears(scaled(hi),E,ys))hi*=2;
  if(clears(scaled(hi),E,ys)){for(let i=0;i<14;i++){const mid=(lo+hi)/2;if(clears(scaled(mid),E,ys))hi=mid;else lo=mid;}const factor=Math.ceil((hi+1e-6)*100)/100,root=Math.ceil(g.rootChord*factor*10-1e-9)/10,tip=Math.ceil(g.tipChord*factor*10-1e-9)/10;
   if(clears({...g,rootChord:root,tipChord:tip},E,ys))suggestions.push({kind:'chords',root,tip,text:`Keep skin ${g.skin.toFixed(2)} mm and try root/tip chords ${root.toFixed(1)} / ${tip.toFixed(1)} mm (same nominal taper). Re-check mass and the printer envelope.`});
  }
  suggestions.push({kind:'profile',text:`Alternatively, choose a profile with more thickness near x/c = ${worst.x.toFixed(3)}, especially around span fraction eta = ${worst.eta.toFixed(3)}. Maximum airfoil thickness alone does not guarantee an open aft cavity. Different airfoil families are allowed.`});
  const exact=(g.stations||[]).findIndex(s=>Math.abs(s.eta-worst.eta)<1e-8),p=E.airfoilAt(g,worst.y),profile=exact>=0?(g.stations[exact].airfoil.name||'NACA '+g.stations[exact].airfoil.code):p.name||(p.code?'NACA '+p.code:'Interpolated section');
  return {kind:'cavity',...worst,profile,section:exact>=0?exact+1:null,skin:g.skin,requiredGap:GAP,maxSkin,minSkin:MIN_SKIN,suggestions,
   summary:`Cavity too narrow at y = ${worst.y.toFixed(1)} mm (eta ${worst.eta.toFixed(3)}, chord ${worst.chord.toFixed(1)} mm), x/c = ${worst.x.toFixed(3)}: clear gap ${worst.gap.toFixed(2)} mm; this model requires at least ${GAP.toFixed(2)} mm. ${suggestions[0].text}`,
   scope:'Sampled geometry check only, not CAD validation, strength approval or a guarantee of printability. Apply geometry re-checks all model constraints. No committed wing inputs have been changed.'};
 }
 return {diagnoseCavity};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WingGeometryHelp;
