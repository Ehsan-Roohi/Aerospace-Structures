/* Whole-wing marquee selection only. The host owns deletion confirmation and study state. */
const WingSelectionUI=(()=>{
 function mount({canvas,viewport,button=null,getBounds,onDelete,setOrbitEnabled=()=>{},isActive=()=>true}){
  const doc=canvas.ownerDocument,win=doc.defaultView;
  if(!doc.getElementById('wing-selection-style')){const style=doc.createElement('style');style.id='wing-selection-style';style.textContent='.wing-marquee,.wing-whole-selection{position:absolute;pointer-events:none;z-index:55;box-sizing:border-box;border:2px solid #176bc4;background:#176bc41a}.wing-whole-selection{border:2px dashed #d97706;background:transparent}.wing-selection-status{position:absolute;left:8px;bottom:8px;max-width:calc(100% - 16px);z-index:56;pointer-events:none;padding:6px 9px;margin:0;border:1px solid var(--line,#b8c9dc);border-radius:7px;background:var(--panel,#fff);color:var(--fg,#172c40);font:13px/1.4 var(--font-ui,system-ui)}.wing-marquee[hidden],.wing-whole-selection[hidden],.wing-selection-status[hidden]{display:none}';doc.head.append(style);}
  if(win.getComputedStyle(viewport).position==='static')viewport.style.position='relative';
  const overlay=kind=>{const n=doc.createElement('div');n.className=kind;n.hidden=true;n.setAttribute('aria-hidden','true');viewport.append(n);return n;},marquee=overlay('wing-marquee'),outline=overlay('wing-whole-selection');
  const status=doc.createElement('p');status.className='wing-selection-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.hidden=true;viewport.append(status);
  let mode=false,selected=false,gesture=null,requestingDelete=false;const touches=new Set();
  const active=()=>!!isActive();
  function rect(value){if(!value)return null;const left=value.left??value.x,top=value.top??value.y,right=value.right??left+value.width,bottom=value.bottom??top+value.height;if(![left,top,right,bottom].every(Number.isFinite)||right<=left||bottom<=top)return null;return{left,top,right,bottom};}
  function bounds(){try{return rect(getBounds());}catch(_){return null;}}
  function paint(node,r){const p=viewport.getBoundingClientRect(),left=Math.max(p.left,r.left),top=Math.max(p.top,r.top),right=Math.min(p.right,r.right),bottom=Math.min(p.bottom,r.bottom);node.hidden=right<=left||bottom<=top;if(node.hidden)return;node.style.left=(left-p.left-(viewport.clientLeft||0)+viewport.scrollLeft)+'px';node.style.top=(top-p.top-(viewport.clientTop||0)+viewport.scrollTop)+'px';node.style.width=(right-left)+'px';node.style.height=(bottom-top)+'px';}
  function sync(){if(button)button.setAttribute('aria-pressed',String(mode));status.hidden=!mode&&!selected;status.textContent=selected?'Whole wing selected · Delete asks for confirmation · Esc cancels':mode?'Drag a rectangle around the whole wing · Esc exits selection':'';outline.hidden=!selected;if(selected){const b=bounds();if(b)paint(outline,b);else{selected=false;outline.hidden=true;status.textContent='Wing selection unavailable. Drag around the visible wing.';}}}
  function cancelGesture(){const old=gesture;gesture=null;marquee.hidden=true;if(old)try{if(canvas.hasPointerCapture?.(old.id))canvas.releasePointerCapture(old.id);}catch(_){}}
  function setMode(value){const next=!!value&&active();cancelGesture();touches.clear();selected=false;if(mode!==next){mode=next;setOrbitEnabled(!mode);}sync();}
  function clear(){setMode(false);}
  function intercept(e){e.preventDefault();e.stopImmediatePropagation();}
  function point(e){const c=canvas.getBoundingClientRect(),p=viewport.getBoundingClientRect();return{x:Math.max(Math.max(c.left,p.left),Math.min(e.clientX,Math.min(c.right,p.right))),y:Math.max(Math.max(c.top,p.top),Math.min(e.clientY,Math.min(c.bottom,p.bottom)))};}
  function rectangle(a,b){return{left:Math.min(a.x,b.x),top:Math.min(a.y,b.y),right:Math.max(a.x,b.x),bottom:Math.max(a.y,b.y)};}
  function down(e){if(!mode||!active())return;if(e.pointerType==='touch'){intercept(e);touches.add(e.pointerId);if(e.isPrimary===false||touches.size>1){cancelGesture();selected=false;sync();return;}}else if(e.button!==0||e.isPrimary===false)return;else intercept(e);if(gesture)return;selected=false;sync();const start=point(e);gesture={id:e.pointerId,start,end:start};try{canvas.setPointerCapture?.(e.pointerId);}catch(_){}}
  function move(e){if(!gesture||e.pointerId!==gesture.id)return;intercept(e);if(!active()){clear();return;}gesture.end=point(e);if(Math.hypot(gesture.end.x-gesture.start.x,gesture.end.y-gesture.start.y)>=8)paint(marquee,rectangle(gesture.start,gesture.end));}
  function up(e){touches.delete(e.pointerId);if(!gesture||e.pointerId!==gesture.id)return;intercept(e);const g=gesture,end=point(e),r=rectangle(g.start,end),b=active()?bounds():null;cancelGesture();selected=!!b&&Math.hypot(end.x-g.start.x,end.y-g.start.y)>=8&&r.left<=b.left&&r.right>=b.right&&r.top<=b.top&&r.bottom>=b.bottom;sync();}
  function cancel(e){touches.delete(e.pointerId);if(!gesture||e.pointerId!==gesture.id)return;intercept(e);cancelGesture();}
  canvas.addEventListener('pointerdown',down,true);canvas.addEventListener('pointermove',move,true);canvas.addEventListener('pointerup',up,true);canvas.addEventListener('pointercancel',cancel,true);
  canvas.addEventListener('lostpointercapture',e=>{if(gesture?.id===e.pointerId)cancelGesture();},true);
  // Pointer capture normally delivers these to canvas; outside-target fallback also works if capture is unavailable.
  for(const[name,handler]of[['pointermove',move],['pointerup',up],['pointercancel',cancel]])doc.addEventListener(name,e=>{if(!canvas.contains(e.target))handler(e);},true);
  function editing(target){return target?.closest?.('input,textarea,select,[role="textbox"],[contenteditable]:not([contenteditable="false"])');}
  doc.addEventListener('keydown',e=>{if(e.defaultPrevented||!active())return;if(e.key==='Escape'&&(mode||selected)){intercept(e);clear();return;}if(editing(e.target))return;if((e.ctrlKey||e.metaKey)&&!e.altKey&&e.key.toLowerCase()==='a'){intercept(e);setMode(true);selected=!!bounds();sync();return;}if(selected&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&['Delete','Backspace'].includes(e.key)){intercept(e);if(e.repeat||requestingDelete)return;requestingDelete=true;try{const answer=onDelete();if(answer&&typeof answer.then==='function')Promise.resolve(answer).then(()=>{requestingDelete=false;},()=>{requestingDelete=false;});else requestingDelete=false;}catch(error){requestingDelete=false;throw error;}}},true);
  button?.addEventListener('click',()=>setMode(!mode));
  for(const name of ['resize','scroll'])win.addEventListener(name,()=>{if((mode||selected)&&!active())clear();else if(selected)sync();},true);
  win.addEventListener('blur',()=>{cancelGesture();touches.clear();});
  sync();return{clear,setMode,isSelected:()=>selected};
 }
 return{mount};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WingSelectionUI;
