// Component render test with a tiny, explicitly synthetic fixture. No browser automation or numerical validation.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const app=process.argv[2]?path.resolve(process.argv[2]):path.resolve(__dirname,'..'), labels=[],nodes=[];
const context=new Proxy({measureText:t=>({width:String(t).length*6})},{get:(o,k)=>k in o?o[k]:(...a)=>{if(k==='fillText')labels.push(String(a[0]));},set:(o,k,v)=>(o[k]=v,true)});
class E{
 constructor(tag,attrs={}){this.tagName=tag;this.children=[];this.style={};this.attrs={};this.handlers={};this.classList={toggle(){}};this.clientWidth=900;this.clientHeight=500;Object.assign(this,attrs);nodes.push(this);}
 append(...cs){for(const c of cs.flat()){if(c==null)continue;this.children.push(c);if(typeof c==='object')c.parentElement=this;}}
 insertBefore(c){this.append(c);}replaceChildren(...cs){this.children=[];this.append(...cs);}addEventListener(n,f){(this.handlers[n]??=[]).push(f);}setAttribute(k,v){this.attrs[k]=v;}getAttribute(k){return this.attrs[k];}querySelector(){return null;}querySelectorAll(){return [];}getBoundingClientRect(){return{width:900,height:500,left:0,top:0};}getContext(){return context;}focus(){}get options(){return this.children;}fire(n){for(const f of this.handlers[n]||[])f({target:this,preventDefault(){}});}
}
const el=(tag,attrs,...cs)=>{const n=new E(tag,attrs||{});n.append(...cs);return n;};
const b={flow:{speed:10,density:1.2,alphaDeg:4,dynamicPressure_Pa:60},reference:{span_mm:600},mesh:{chordPanelsPerSurface:3,spanPanels:3,wingPanels:18},strips:[],chordwise:[],stripLoads:[]};
for(let i=0;i<3;i++){const y0=100*i,y1=y0+100,yMid=y0+50;b.strips.push({y0,y1,yMid,chord:120,quarterChordPoint_mm:[30,yMid,0],cl:.6-.1*i,clKuttaJoukowski:.6-.1*i,gamma:360-60*i,momentAboutQuarterChord_Nmm:[0,-1,0],trailingEdgeDeltaCp:.01*(i+1)});b.chordwise.push({y_mm:yMid,chord_mm:120,upper:[[.01,-.5],[.4,-.3],[.99,.1]],lower:[[.01,.9],[.4,.1],[.99,.09]]});b.stripLoads.push([y0,y1,0,0,.2,0,0,0]);}
const result={base:b,sequence:'unit-fixture',levels:[],definition:{baseChord:3,baseSpan:3}},combined={strips:b.stripLoads,rootWrench:[0,0,{value:.6,uncertainty:.01,finest:.6,base:.6}],coefficients:{CL:{value:.5,uncertainty:.01}},structuralLoadAvailable:true};
const ctx=vm.createContext({window:{devicePixelRatio:1},document:{getElementById(){return null;}},console,requestAnimationFrame:()=>1,URL,Blob,setTimeout});
vm.runInContext(fs.readFileSync(path.join(app,'ui/wx-aero-results.js'),'utf8'),ctx);
const V=ctx.window.WingAeroStructResults,widget=V.install({el,ui:{state:()=>({geometry:{}})},strip:new E('section'),view:new E('main'),state:()=>({status:'ok',result,combined}),openAero(){}});
for(const kind of ['cl','gamma','cm','te','section','span']){labels.length=0;widget.show(kind);const c=nodes.find(n=>n.id==='wxArCanvas');assert.ok(c.attrs['aria-label'],kind+' must render an accessible plot');assert.ok(labels.length>5,kind+' must draw axes and values');}
widget.show('cp');const projection=nodes.find(n=>n.id==='wxArProjection');projection.value='planform';projection.fire('change');
assert.ok(nodes.find(n=>n.id==='wxArCanvas').attrs['aria-label'].includes('upper and lower'));
const c=V.spanQuantities(b);assert.ok(Math.abs(c[0].gamma-.36)<1e-15);assert.ok(Math.abs(c[0].cm-(-1/(60e-6*120**2*100)))<1e-12);
widget.refresh();labels.length=0;widget.refresh();assert.equal(labels.length,0,'Unchanged solver status must not redraw the active result');
widget.close();assert.equal(widget.pngButton.disabled,false);assert.equal(widget.csvButton.disabled,true);
console.log(JSON.stringify({plots_rendered:['cl','gamma','cm','te','section','span','Cp_2D'],units_checked:true,export_controls_reset:true,fixture:'synthetic component test, not a flow benchmark'}));
