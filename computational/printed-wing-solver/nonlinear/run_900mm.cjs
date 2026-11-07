const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'../../..'),app=path.join(root,'docs/wing-panel-stress-analyzer'),web=path.join(root,'computational/printed-wing-solver/web');
const ctx=vm.createContext({module:{exports:{}},require:createRequire(path.join(web,'engine.js')),console,performance,TextEncoder,TextDecoder,setTimeout,clearTimeout,Buffer,URL});
vm.runInContext(fs.readFileSync(path.join(app,'nonlinear/flexible_bundle.js'),'utf8'),ctx);const S=ctx.module.exports;
vm.runInContext(fs.readFileSync(path.join(app,'wing-aero/wing_study_io.js'),'utf8'),ctx);const IO=ctx.module.exports;ctx.WingStudyIO=IO;
vm.runInContext('WingStudyIO.setAeroGeometryKey(g=>WingStudyIO.sha256(WingAeroPanel.geometryKey(g)))',ctx);
const fixture=fs.readFileSync(path.join(app,'validation/fixtures/900mm-panel-load-2026-10-30.json'),'utf8');
ctx.rawFixture=fixture;const input=vm.runInContext('(()=>{const imported=WingStudyIO.importPrintedStudy(rawFixture,WingEngine);if(!imported.ok)throw Error(JSON.stringify(imported.errors));return WingStudyIO.printedEngineInput(imported.state,WingEngine);})()',ctx);
const out=path.join(root,'output/flexible-wing-current');fs.mkdirSync(out,{recursive:true});
const flow={speed:50,density:1.225,alphaDeg:2,viscosity:1.81e-5,speedOfSound:340.29};
(async()=>{const result=await S.solve({input,flow,settings:process.env.FULL_SEQUENCE?{sequence:'standard'}:{diagnosticMesh:{chordPanels:16,spanPanels:8}}},text=>console.log(new Date().toISOString(),text));fs.writeFileSync(path.join(out,process.env.FULL_SEQUENCE?'checked-result.json':'diagnostic-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({converged:result.converged,admitted:result.admitted,tip:result.profile.at(-1),admission:result.admission},null,2));})().catch(e=>{console.error(e);process.exitCode=1;});

