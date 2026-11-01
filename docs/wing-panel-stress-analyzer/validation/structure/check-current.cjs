// Re-run global responses using the exact engine embedded in the shipped page.
// Usage: node check-current.cjs REPOSITORY EXTRACTED_BENCHMARK OUTPUT_JSON
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto'),{createRequire}=require('node:module'),{pathToFileURL}=require('node:url');
const [repository,data,output]=process.argv.slice(2);
if(!repository||!data||!output)throw Error('Usage: node check-current.cjs REPOSITORY EXTRACTED_BENCHMARK OUTPUT_JSON');
const root=path.resolve(repository),folder=path.resolve(data),dest=path.resolve(output),app=path.join(root,'docs/wing-panel-stress-analyzer'),web=path.join(root,'computational/printed-wing-solver/web');
const read=p=>fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n'),json=p=>JSON.parse(read(p));
const page=read(path.join(app,'index.html')),start=page.indexOf('const WingEngine ='),end=page.indexOf('module.exports = WingEngine;',start)+'module.exports = WingEngine;'.length;
if(start<0||end<start)throw Error('Exact published engine block not found');
const code=page.slice(start,end),source=read(path.join(app,'ui/zero-tip-source/engine.js'));
if(!source.includes(code))throw Error('Editable source does not contain exact published engine');
const sharedRequire=createRequire(path.join(web,'engine.js')),ctx=vm.createContext({module:{exports:{}},require:sharedRequire,console,performance,TextEncoder,TextDecoder,URL,Buffer});
vm.runInContext(code,ctx);const E=ctx.module.exports,sharedPath=require.resolve(path.join(web,'engine.js'));require(sharedPath);require.cache[sharedPath].exports=E;
(async()=>{
 const {buildBeamReference}=await import(pathToFileURL(path.join(root,'scripts/validation/wing_solid_beam_reference.mjs')).href);
 const beam=buildBeamReference(json(path.join(folder,'slender-study.json')),json(path.join(folder,'ccx-h5-uniform-report.json')),json(path.join(folder,'ccx-h5-torque-report.json')),{elements:[40,80],sections:15,cuts:[110,130,190]});
 const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
 const result={embeddedEngineSha256:sha(code),editableSourceSha256:sha(source),sourceIdentityConfirmed:true,scope:'Matched global response only. This command does not rerun CalculiX or certify local stress/twist.',beam};
 if([path.join(app,'index.html'),path.join(folder,'slender-study.json')].some(p=>path.resolve(p)===dest))throw Error('Output cannot overwrite an input');
 fs.writeFileSync(dest,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(beam.runs.map(r=>({requested:r.requestedElements,actual:r.vertical.actualElements,verticalMm:r.vertical.generalizedDisplacementMm,torqueWorkRad:r.torque.thetaWorkRad})),null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
