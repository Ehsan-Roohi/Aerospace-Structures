const fs=require('fs'),path=require('path'),{pathToFileURL}=require('url');
const {chromium}=require('C:/Users/roohie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const page=await browser.newPage({viewport:{width:1280,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(path.resolve(__dirname,'../forward-problems.html')).href);
 await page.waitForFunction(()=>[...document.images].every(i=>i.complete));
 const desktop=await page.evaluate(()=>({images:[...document.images].map(i=>({src:i.getAttribute('src'),loaded:i.naturalWidth>0})),overflow:document.documentElement.scrollWidth>innerWidth+2}));
 const privateDir=path.resolve(__dirname,'../../../../output/opus-bem/forward-problems-help-20261101');
 fs.mkdirSync(privateDir,{recursive:true});
 await page.locator('figure').nth(1).screenshot({path:path.join(privateDir,'disk-reference-browser.png')});
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>scrollTo(0,0));
 await page.screenshot({path:path.join(privateDir,'mobile-top.png')});
 const mobile=await page.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+2}));
 const receipt={desktop,mobile,errors,passed:desktop.images.every(i=>i.loaded)&&!desktop.overflow&&!mobile.overflow&&!errors.length};
 fs.writeFileSync(path.join(__dirname,'browser-qa.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));
 await Promise.race([browser.close(),new Promise(resolve=>setTimeout(resolve,2500))]);process.exit(receipt.passed?0:1);
})().catch(e=>{console.error(e);process.exit(1)});
