// CSS-only regression: device appearance must not select a dark workspace.
import assert from 'node:assert/strict';
import {JSDOM,read} from './beam_test_dom.mjs';
const page=read('../../../docs/wing-lab.html'),truss=read('../../../docs/truss-lab.html');
const css=page.match(/<style>([\s\S]*?)<\/style>/)[1];
const source=new JSDOM(`<style>${css}</style>`);
function applicable(rules,scheme){
  return Array.from(rules,r=>{
    if(r.media){
      const condition=r.media.mediaText;
      if(/\bprint\b/.test(condition))return '';
      if(/prefers-color-scheme:\s*dark/.test(condition)&&scheme!=='dark')return '';
      if(/prefers-color-scheme:\s*light/.test(condition)&&scheme!=='light')return '';
      // Layout-only media do not affect this token/palette regression.
      return applicable(r.cssRules,scheme);
    }
    return r.cssText;
  }).join('\n');
}
let checks=0;
const canonical=value=>value.trim().replace(/#([0-9a-f])([0-9a-f])([0-9a-f])\b/gi,'#$1$1$2$2$3$3');
for(const system of ['light','dark'])for(const explicit of [null,'light','dark']){
  const dom=new JSDOM(`<html${explicit?` data-theme="${explicit}"`:''}><head><style>${applicable(source.window.document.styleSheets[0].cssRules,system)}</style></head><body><div id="foundations"></div></body></html>`);
  const root=dom.window.getComputedStyle(dom.window.document.documentElement),beam=dom.window.getComputedStyle(dom.window.document.querySelector('#foundations'));
  const light=explicit!=='dark',label=`system ${system}, explicit ${explicit}`;
  for(const [prop,expected] of [['color-scheme',light?'light':'dark'],['--panel',light?'#f7f9fb':'#111922'],['--fg',light?'#142130':'#dce5ee'],['--wl-accent-text',light?'#0a5bb5':'#7dbdff']]){
    assert.equal(root.getPropertyValue(prop).trim(),expected,`${label}: ${prop}`);checks++;
  }
  for(const [prop,expected] of [['--bl-card',light?'#ffffff':'var(--panel)'],['--bl-load',light?'#a3268f':'#e27cdc']]){
    assert.equal(canonical(beam.getPropertyValue(prop)),expected,`${label}: ${prop}`);checks++;
  }
  dom.window.close();
}
for(const html of [page,truss]){assert.match(html,/<meta name="color-scheme" content="light">/);checks++;}
const td=new JSDOM(truss);assert.equal(td.window.getComputedStyle(td.window.document.documentElement).getPropertyValue('color-scheme'),'light');checks++;
assert.equal(td.window.getComputedStyle(td.window.document.querySelector('.card')).backgroundColor,'rgb(255, 255, 255)');checks++;
td.window.close();source.window.close();
console.log(`PASS: ${checks} light-default palette checks; light/dark devices, explicit overrides, Beam/Wing tokens and Truss cards.`);
