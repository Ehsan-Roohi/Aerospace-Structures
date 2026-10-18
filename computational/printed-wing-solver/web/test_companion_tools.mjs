// VINCO RC companion card: exact external URL, safe new-tab link, attribution, scope statements,
// no embedding, and presence in the wing Design lab tab and the Beam Lab wing navigation.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {JSDOM,loadBeamLab} from './beam_test_dom.mjs';
const require=createRequire(import.meta.url), C=require('./companion_tools.js');
const read=f=>readFileSync(new URL(f,import.meta.url),'utf8');
let checks=0;const ok=(v,m)=>{assert.ok(v,m);checks++;};
const URL_EXACT='https://vinco-rc.com/?generator=wing';

ok(C.TOOLS.vinco.url===URL_EXACT,'exact generator URL');
ok(Object.isFrozen(C.TOOLS)&&Object.isFrozen(C.TOOLS.vinco),'tool registry is read-only');
function checkCard(card,where) {
  const a=card.querySelector('a.companion-link');
  ok(a,`${where}: link present`);
  ok(a.getAttribute('href')===URL_EXACT,`${where}: href is exactly the generator URL`);
  ok(a.getAttribute('target')==='_blank',`${where}: opens in a new tab`);
  const rel=(a.getAttribute('rel')||'').split(/\s+/);ok(rel.includes('noopener')&&rel.includes('noreferrer'),`${where}: rel noopener noreferrer`);
  ok(/new tab/.test(a.textContent),`${where}: link text tells screen-reader users it opens a new tab`);
  const text=card.textContent.replace(/\s+/g,' ');
  ok(/VINCO RC · Wing Geometry Designer/.test(text),`${where}: titled`);
  ok(/External companion tool by VINCO RC · not made by MIE 446/.test(text),`${where}: attributed as external software`);
  ok(/planform/.test(text)&&/airfoil/.test(text)&&/ribs/.test(text)&&/spar/.test(text)&&/3-D preview/.test(text),`${where}: what VINCO configures`);
  ok(/loads, bending, torsion and stress/.test(text)&&/limits of its model/.test(text),`${where}: what our Wing Lab checks`);
  ok(/not a strength check/.test(text)&&/strong, stable or ready to print/.test(text),`${where}: no certification claim`);
  const steps=[...card.querySelectorAll('.companion-steps li')].map(li=>li.textContent);
  ok(steps.length===4,`${where}: four workflow steps`);
  ok(/VINCO RC/.test(steps[0])&&/span/.test(steps[1])&&/chord/.test(steps[1])&&/airfoil/.test(steps[1])&&/spar/.test(steps[1])&&/structural model/.test(steps[2])&&/assumptions/.test(steps[3])&&/manufacturing/.test(steps[3]),`${where}: workflow order`);
  ok(/no file, CAD or results import/.test(text)&&/need not describe identical geometry/.test(text),`${where}: no import or identical-geometry claim`);
  ok(!/\bAPI\b|iframe|embed|free|export/i.test(text),`${where}: no API, embedding, pricing or export claims`);
  ok(card.querySelectorAll('iframe,script,object,embed').length===0,`${where}: nothing embedded`);
}
// 1. Wing Lab Design lab tab (static slot in the template, filled by the module).
const template=read('./wing_lab_template.html');
const tab=template.slice(template.indexOf('<div class="tabpanel" id="tab-design"'),template.indexOf('<div class="tabpanel" id="tab-members"'));
ok(tab.includes('data-companion="vinco"'),'slot inside the Design lab tab');
let dom=new JSDOM(`<div id="app">${tab}</div>`,{runScripts:'outside-only'});
vm.runInContext(read('./companion_tools.js'),dom.getInternalVMContext());
checkCard(dom.window.document.querySelector('#tab-design [data-companion="vinco"] .companion-card'),'Design lab');
dom.window.close();
// 2. Beam Lab header: the wing navigation group, not a beam physics option.
dom=new JSDOM('<div id="foundations"></div>',{url:'https://example.org/wing-lab.html',runScripts:'outside-only'});
const {$}=loadBeamLab(dom);
const pop=$('.bl-nav details.bl-companion');ok(pop,'companion popover sits in the workspace navigation');
ok(!pop.open,'collapsed by default; no wall of cards before the model');
checkCard(pop.querySelector('.companion-card'),'Beam Lab header');
ok(!$('.bl-side').textContent.includes('VINCO'),'not offered inside the beam inputs');
const ids=[...dom.window.document.querySelectorAll('.companion-card h3')].map(h=>h.id);ok(new Set(ids).size===ids.length,'unique heading ids');
dom.window.close();
// 3. Published page carries the module and both slots.
const page=read('../../../docs/wing-lab.html');
ok(page.includes("url: 'https://vinco-rc.com/?generator=wing'"),'module inlined in docs/wing-lab.html');
ok((page.match(/data-companion="vinco"/g)||[]).length>=2,'both slots present in the generated page');
ok(!/<iframe[^>]+vinco/i.test(page),'no iframe to the external site');
// 4. Static cascade guard (no browser). test_beam_browser.mjs measures the real computed colours and contrast;
// this check runs anywhere: every rule of the page's stylesheet that can reach the VINCO button, in both places
// (Beam Lab header, wing Design lab tab), both colour schemes and every link state, is ranked by importance,
// specificity and source order. The winner must be the button's own colours (var(--accent-ink) on
// var(--accent)), and no rule may give the text inside the button another colour. An ID-weighted generic
// rule such as `#foundations a {color: var(--accent)}` once won here and made the button blue on blue.
const pageCss=page.slice(page.indexOf('<style>')+7,page.indexOf('</style>'));
function splitTop(text) {const out=[];let depth=0,start=0;for(let i=0;i<text.length;i++){const c=text[i];if(c==='(')depth++;else if(c===')')depth--;else if(c===','&&!depth){out.push(text.slice(start,i).trim());start=i+1;}}out.push(text.slice(start).trim());return out.filter(Boolean);}
function parseRules(text,media=[],out=[]) {
  text=text.replace(/\/\*[\s\S]*?\*\//g,'');
  let i=0;
  while(i<text.length) {
    const open=text.indexOf('{',i);if(open<0)break;
    const head=text.slice(i,open).trim();let depth=1,j=open+1;
    while(j<text.length&&depth){if(text[j]==='{')depth++;else if(text[j]==='}')depth--;j++;}
    const body=text.slice(open+1,j-1);
    if(/^@(media|supports)/.test(head)) parseRules(body,[...media,head],out);
    else if(!head.startsWith('@')) {
      const decls=[];for(const d of body.split(';')){const k=d.indexOf(':');if(k<0)continue;let v=d.slice(k+1).trim();const important=/!important$/.test(v);v=v.replace(/\s*!important$/,'');decls.push({prop:d.slice(0,k).trim().toLowerCase(),value:v,important});}
      out.push({selectors:splitTop(head),decls,media,order:out.length});
    }
    i=j;
  }
  return out;
}
function specificity(sel) {
  let a=0,b=0,c=0,i=0;const n=sel.length;
  const ident=()=>{const s=i;while(i<n&&/[\w\-\\]/.test(sel[i]))i++;return sel.slice(s,i);};
  const paren=()=>{let depth=1;const s=++i;while(i<n&&depth){if(sel[i]==='(')depth++;else if(sel[i]===')')depth--;i++;}return sel.slice(s,i-1);};
  const max=list=>list.map(specificity).reduce((x,y)=>x[0]!==y[0]?(x[0]>y[0]?x:y):x[1]!==y[1]?(x[1]>y[1]?x:y):(x[2]>=y[2]?x:y),[0,0,0]);
  while(i<n) {
    const ch=sel[i];
    if(ch==='#'){i++;ident();a++;}
    else if(ch==='.'){i++;ident();b++;}
    else if(ch==='['){while(i<n&&sel[i]!==']')i++;i++;b++;}
    else if(ch===':'){
      if(sel[i+1]===':'){i+=2;ident();c++;if(sel[i]==='(')paren();}
      else {i++;const name=ident();
        if(sel[i]==='('){const arg=paren();if(name==='where'){}else if(['is','not','has','matches'].includes(name)){const m=max(splitTop(arg));a+=m[0];b+=m[1];c+=m[2];}else b++;}
        else b++;}
    }
    else if(/[a-zA-Z]/.test(ch)){ident();c++;}
    else i++;
  }
  return [a,b,c];
}
ok(String(specificity('#foundations a'))==='1,0,1'&&String(specificity(':where(#foundations) a'))==='0,0,1'&&String(specificity('.companion-card a.companion-link:visited'))==='0,3,1'
  &&String(specificity('.bl-btn:hover:not(:disabled)'))==='0,3,0'&&String(specificity('.bl-nav > span'))==='0,1,1','specificity calculator');
const RULES=parseRules(pageCss);
ok(RULES.length>300,'page stylesheet parsed');
const STATE=/:(hover|active|focus-visible|focus-within|focus|link|visited|any-link)(?![\w-])/g;
const STATES={normal:['link','any-link'],hover:['link','any-link','hover'],focus:['link','any-link','focus','focus-visible','focus-within'],
  active:['link','any-link','hover','active','focus','focus-visible','focus-within'],visited:['visited','any-link']};
const mediaApplies=(media,theme)=>media.every(m=>!/\bprint\b/.test(m)&&!(/prefers-color-scheme:\s*light/.test(m)&&theme!=='light')&&!(/prefers-color-scheme:\s*dark/.test(m)&&theme!=='dark'));
// Cascade order for normal author rules: !important, then specificity, then source order (later wins).
const later=(x,y)=>{for(let k=0;k<x.length;k++) if(x[k]!==y[k]) return x[k]>y[k]; return false;};
function winner(el,props,state,theme) {
  let best=null;
  for(const rule of RULES) {
    if(!mediaApplies(rule.media,theme)) continue;
    const decls=rule.decls.filter(d=>props.includes(d.prop));if(!decls.length) continue;
    for(const sel of rule.selectors) {
      if(/::|:-webkit-|:-moz-/.test(sel)) continue;                       // pseudo-elements style generated content
      const used=[...sel.matchAll(STATE)].map(m=>m[1]);
      if(!used.every(p=>STATES[state].includes(p))) continue;
      let hit;try {hit=el.matches(sel.replace(STATE,'')||'*');} catch(e) {throw new Error(`cannot evaluate selector ${sel}: ${e.message}`);}
      if(!hit) continue;
      const sp=specificity(sel);
      decls.forEach((d,k)=>{const key=[d.important?1:0,...sp,rule.order,k];if(!best||later(key,best.key)) best={key,sel,decl:d};});
    }
  }
  return best;
}
// Each placement: [label, document, the button]. The Design lab copy lives in the real page (no scripts run).
const header=new JSDOM('<div id="foundations"></div>',{url:'https://example.org/wing-lab.html',runScripts:'outside-only'});
loadBeamLab(header);
const full=new JSDOM(page,{runScripts:'outside-only'});
vm.runInContext(read('./companion_tools.js'),full.getInternalVMContext());
const places=[['Beam Lab header',header.window.document.querySelector('.bl-companion a.companion-link')],['Design lab tab',full.window.document.querySelector('#tab-design a.companion-link')]];
for(const [where,a] of places) {
  ok(a,`${where}: button found in the page`);
  for(const theme of ['light','dark']) for(const state of Object.keys(STATES)) {
    const fg=winner(a,['color'],state,theme), bg=winner(a,['background-color','background'],state,theme);
    ok(fg&&fg.decl.value==='var(--accent-ink)',`${where} ${theme} ${state}: button text colour comes from ${fg&&fg.sel} = ${fg&&fg.decl.value}`);
    ok(bg&&/^var\(--accent\)$/.test(bg.decl.value),`${where} ${theme} ${state}: button background comes from ${bg&&bg.sel} = ${bg&&bg.decl.value}`);
    for(const span of a.querySelectorAll('span')) {
      const w=winner(span,['color'],state,theme);
      ok(!w||w.decl.value==='inherit',`${where} ${theme} ${state}: text inside the button keeps its colour (${w&&w.sel} = ${w&&w.decl.value})`);
    }
  }
}
header.window.close();full.window.close();
console.log(`Companion tools: ${checks} link, attribution, scope, placement and static cascade checks passed (VINCO RC card; computed colours are measured in test_beam_browser.mjs).`);
