// Navigation/source regression, not browser layout or aerodynamic validation.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const app=path.resolve(__dirname,'..'),repo=path.resolve(app,'../..'),{JSDOM}=require(path.join(repo,'.review-js/node_modules/jsdom'));
const read=p=>fs.readFileSync(path.join(app,p),'utf8').replace(/\r\n/g,'\n'),hash=t=>crypto.createHash('sha256').update(t).digest('hex');
const page=read('index.html'),shell=read('ui/wx-shell.js'),css=read('ui/wx-shell.css'),build=JSON.parse(read('BUILD.json'));
assert.equal(read('wing-lab.html'),page);assert.equal(hash(page),build.pageSha256);
assert.equal(page.split(shell.trim()).length-1,1);assert.equal(page.split(css.trim()).length-1,1);
assert.ok(shell.includes("topButton('wxAeroBtn', 'Aerodynamics', 'wingSide')"));
assert.ok(shell.includes("aeroBtn.addEventListener('click', () => toggleMenu('aero'))"));
assert.ok(shell.includes("aeroBtn.setAttribute('aria-label', 'Aerodynamics · open aerodynamic solver')"));
assert.ok(css.includes('#app.wx #wxAeroBtn.wx-aero-command'));
const scripts=s=>[...s.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map(m=>m[2]);
assert.deepEqual(scripts(page).map((s,i)=>hash(s)===build.member_aero_access_port.baselineInlineScriptSha256[i]?null:i).filter(i=>i!==null),[8]);
for(const rel of ['truss-lab.html','wing-panel-stress-analyzer/truss-lab.html']){
 const html=fs.readFileSync(path.join(repo,'docs',rel),'utf8'),dom=new JSDOM(html,{url:'https://ehsan-roohi.github.io/Aerospace-Structures/'+rel});
 const wing=[...dom.window.document.querySelectorAll('nav a')].find(a=>a.textContent.trim()==='Wing');
 assert.equal(wing.href,'https://ehsan-roohi.github.io/Aerospace-Structures/wing-panel-stress-analyzer/#wing');dom.window.close();
}
console.log(JSON.stringify({passed:true,wingReturnRoutes:'both root and nested Truss return to AeroStruct',aeroMenuRetained:true,prominentAccessibleCommand:true,unchangedNumericalScripts:true,browserLayoutClaimed:false},null,2));
