// Local rendering regression test, not a claim of a live authenticated Colab test.
// Usage: node scripts/check_effector_card_layout.mjs
// Requires Playwright with Edge and the generated HTML companion.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const root=process.cwd();
let require=createRequire(import.meta.url);
let chromium;
try { ({chromium}=require('playwright')); }
catch {
 require=createRequire(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json'));
 ({chromium}=require('playwright'));
}
const out=path.join(root,'tmp/effector-layout');
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const results=[];
try {
 for(const width of [1280,768,390]) for(const stripped of [false,true]) {
  const page=await browser.newPage({viewport:{width,height:1000}});
  await page.goto(pathToFileURL(path.join(root,'docs/lecture01-control-mechanisms.html')).href);
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});
  if(stripped) await page.evaluate(()=>{
   // Simulate a notebook sanitizer discarding inline layout CSS.
   document.querySelectorAll('[style]').forEach(e=>e.removeAttribute('style'));
  });
  // Reproduce hostile notebook table styling even when inline CSS was stripped.
  await page.addStyleTag({content:'td,th{white-space:nowrap!important}table{max-width:100%;overflow:hidden}'});
  const result=await page.evaluate(()=>{
   const cards=[...document.querySelectorAll('.effector-card')];
   const clipped=[];
   for(const [i,card] of cards.entries()){
    const walker=document.createTreeWalker(card,NodeFilter.SHOW_TEXT);
    let node;
    while((node=walker.nextNode())){
     if(!node.textContent.trim())continue;
     const range=document.createRange();range.selectNodeContents(node);
     if([...range.getClientRects()].some(r=>r.left<0||r.right>innerWidth+1))clipped.push(i);
    }
   }
   return {cards:cards.length,images:document.images.length,broken:[...document.images].filter(i=>!i.naturalWidth).length,
    tables:document.querySelectorAll('.effector-card table,table.effector-card').length,
    overflow:document.documentElement.scrollWidth>innerWidth,clipped:[...new Set(clipped)]};
  });
  if(result.cards!==8||result.images!==8||result.broken||result.tables||result.overflow||result.clipped.length)
   throw Error(JSON.stringify({width,stripped,...result}));
  await page.locator('.effector-card').nth(1).screenshot({path:path.join(out,`ruddervator-${width}-${stripped?'stripped':'styled'}.png`)});
  results.push({width,stripped,...result});
  await page.close();
 }
 await fs.writeFile(path.join(out,'qa.json'),JSON.stringify(results,null,2));
 console.log(JSON.stringify(results));
} finally {await browser.close();}
