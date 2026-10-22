import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM,loadBeamLab,BEAM_SCRIPTS} from './beam_test_dom.mjs';

const css=readFileSync(new URL('./beam_lab.css',import.meta.url),'utf8');
const dom=new JSDOM('<div id="foundations"></div>',{runScripts:'outside-only',url:'https://example.org/wing-lab.html'});
loadBeamLab(dom,{scripts:[...BEAM_SCRIPTS,'beam_strength.js','beam_strength_ui.js']});
const d=dom.window.document,style=d.createElement('style');style.textContent=css;d.head.append(style);
const rules=[...style.sheet.cssRules];
const loadRule=rules.find(r=>r.selectorText==='.bl-load-tools .bl-tool');
assert.equal(loadRule.style.color,'var(--bl-load)','load toolbar text must follow the light/dark load token');
const dark=rules.find(r=>r.selectorText==='#foundations').style.getPropertyValue('--bl-load').trim();
const light=rules.find(r=>r.selectorText===':root[data-theme="light"] #foundations').style.getPropertyValue('--bl-load').trim();
const luminance=hex=>{const rgb=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];};
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
const blend=(a,b,t)=>'#'+a.slice(1).match(/../g).map((x,i)=>Math.round(parseInt(x,16)*t+parseInt(b.slice(1+i*2,3+i*2),16)*(1-t)).toString(16).padStart(2,'0')).join('');
// Normal, raised, and pressed (the page's accent-soft alpha over its card) surfaces.
for(const bg of ['#16212c','#1c2935',blend('#4ea6ff','#111922',.14)])assert.ok(contrast(dark,bg)>=4.5,`dark load text ${dark} on ${bg} must reach 4.5:1`);
for(const bg of ['#ffffff','#f3f6f9',blend('#0b6fd8','#ffffff',.1)])assert.ok(contrast(light,bg)>=4.5,`light load text ${light} on ${bg} must reach 4.5:1`);
const touchMedia=rules.find(r=>r.conditionText==='screen and (max-width: 1100px)');
assert.ok(touchMedia,'the final screen-only touch rule includes phone and 768/1024 px tablets');
const touch=[...touchMedia.cssRules].find(r=>r.style?.getPropertyValue('min-height')==='44px');
const type=[...touchMedia.cssRules].find(r=>r.style?.getPropertyValue('font-size')==='16px');
assert.ok(touch&&type);
const ids=['beamPowerA','beamPowerB','beamPowerF','beamPowerN','beamPowerShape','beamPowerPreview','strengthStationX'];
for(const id of ids){const el=d.getElementById(id);assert.ok(el,`${id} exists in the actual Beam editor`);assert.ok(el.matches(touch.selectorText),`${id} receives the 44 px minimum`);if(el.matches('input,select'))assert.ok(el.matches(type.selectorText),`${id} receives the non-zooming 16 px input font`);}
const summaries=[...d.querySelectorAll('#foundations summary')];
assert.ok(d.querySelector('.power-profile-generator > summary')&&d.querySelector('#beamStrengthInputs > summary'),'exercise real nonlinear-table and strength disclosures');
for(const el of summaries)assert.ok(el.matches(touch.selectorText),`disclosure “${el.textContent.trim()}” receives the touch minimum`);
assert.ok([...d.querySelectorAll('#foundations .bl-load-tools .bl-tool')].length>=4);
console.log(`Beam touch/contrast CSS: passed — theme load tokens ≥4.5:1, ${ids.length} previously undersized controls and ${summaries.length} real disclosures receive 44 px tablet/phone targets through 1100 px.`);
dom.window.close();
