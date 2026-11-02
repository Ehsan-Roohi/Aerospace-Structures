/* Injected control-flow tests only; not physical validation. */
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'../..');
const H={...require(path.join(root,'cavitation.js'))};
const BV=require(path.join(root,'smooth-detachment-adapter.js'));
const vm=require('vm');
const driverSourcePath=path.join(root,'forward-hydrofoil.js');
const driverContext={module:{exports:{}},Date,require:specifier=>specifier==='./cavitation.js'?H:specifier==='./smooth-detachment-adapter.js'?BV:require(path.join(root,specifier))};
vm.runInNewContext(fs.readFileSync(driverSourcePath,'utf8'),driverContext,{filename:driverSourcePath});
const F=driverContext.module.exports;
const saved=JSON.parse(fs.readFileSync(path.join(__dirname,'control-flow-fixture.json'),'utf8'));
const raw=saved.cavity,clone=v=>structuredClone(v),checks=[];
const record=(name,passed,details={})=>checks.push({name,passed:!!passed,...details});
function runCase(behavior,{warm=null,maxSeconds=240,maxLengthEvaluations=8,maxInnerIterations=150,wetAdvance=0,screenAdvance=0}={}){
 let virtualNow=0,cancelled=false;const calls=[],progress=[];
 const originalNow=Date.now,originalIterate=BV.iterate,originalWet=H.wettedVelocity,originalScreen=H.physicalAdmissibility;
 const input={mode:'sigma',sigma:raw.sigma,naca:saved.geometry.naca,alpha:saved.geometry.alpha,settings:{resolution:48,maxLengthEvaluations,maxDetachmentEvaluations:4,maxSeconds,maxInnerIterations}};
 if(warm){const cfg=F.configuration(input);input.warmStart={driverVersion:warm.version||F.VERSION,configurationKey:cfg.key,length:warm.length??.12,detachment:raw.detachment.selected,attenuation:warm.attenuation??.2};}
 const context={advance:ms=>{virtualNow+=ms;},cancel:()=>{cancelled=true;},progress,calls,budgets:F.configuration(input).settings,get now(){return virtualNow;},raw:()=>clone(raw)};
 Date.now=()=>virtualNow;
 H.wettedVelocity=(...args)=>{const out=originalWet(...args);virtualNow+=wetAdvance;return out;};
 H.physicalAdmissibility=(...args)=>{const out=originalScreen(...args);virtualNow+=screenAdvance;return out;};
 BV.iterate=function*(options,settings){const call={options:clone(options),settings:clone(settings),at:virtualNow};calls.push(call);return yield* behavior(context,call,calls.length);};
 try{const it=F.iterate(input,{isCancelled:()=>cancelled});let s;do{s=it.next();if(!s.done)progress.push(clone(s.value));if(progress.length>4000)throw new Error('review harness iteration guard');}while(!s.done);return{result:s.value,calls,progress,virtualSeconds:virtualNow/1000};}
 finally{Date.now=originalNow;BV.iterate=originalIterate;H.wettedVelocity=originalWet;H.physicalAdmissibility=originalScreen;}
}
const fast=function*(ctx){return ctx.raw();};
let c=runCase(fast);
record('source version is 0.1.6',F.VERSION==='0.1.6-forward-research',{version:F.VERSION});
record('cold search starts at declared central length .24',c.calls[0]?.options.length===.24&&c.result.acceptedForDisplay===true,{firstLength:c.calls[0]?.options.length,initialGuess:c.result.initialGuess,settings:c.result.settings});
c=runCase(fast,{warm:{length:.12}});
record('matching warm initial length retained',c.result.warmStartUsed===true&&c.calls[0]?.options.length===.12,{firstLength:c.calls[0]?.options.length});
c=runCase(fast,{warm:{length:.12,version:'0.1.5-forward-research'}});
record('previous driver warm state invalidated',c.result.warmStartUsed===false&&c.calls[0]?.options.length===.24,{firstLength:c.calls[0]?.options.length});
const lateLocal=function*(ctx,call,index){if(index===1){ctx.advance(1000*((ctx.budgets.initialLengthEvaluationBudgetSeconds??ctx.budgets.lengthEvaluationBudgetSeconds)+1));return ctx.raw();}return ctx.raw();};
c=runCase(lateLocal);
record('completed BV result crossing local deadline is not admitted or cached',c.calls.length>=2&&c.calls[0].options.length!==c.calls[1].options.length&&c.result.trace[0].status==='local-budget-exhausted'&&!c.result.trials.some(t=>t.length===c.calls[0].options.length&&t.raw)&&c.result.root?.length!==c.calls[0].options.length,{calls:c.calls.map(t=>({length:t.options.length,at:t.at})),trace:c.result.trace,trials:c.result.trials.map(t=>({length:t.length,attempt:t.attempt,code:t.code,error:t.error,incomplete:t.incomplete})),finalStatus:c.result.status});
record('local incomplete attempt retains seed error and progress identity',c.result.trials.some(t=>t.attempt===1&&t.incomplete&&Number.isFinite(t.initialAttenuation)&&typeof t.error==='string'),{trials:c.result.trials.map(t=>({length:t.length,attempt:t.attempt,incomplete:t.incomplete,error:t.error}))});
c=runCase(function*(ctx){ctx.advance(241000);return ctx.raw();});
record('global deadline has priority over local and forbids late complete admission',c.result.status==='budget-exhausted'&&c.result.code==='TIME_BUDGET'&&c.result.acceptedForDisplay===false&&c.calls.length===1,{status:c.result.status,code:c.result.code,calls:c.calls.length,trace:c.result.trace});
c=runCase(function*(ctx){ctx.advance(241000);ctx.cancel();return ctx.raw();});
record('cancellation has priority over simultaneous global and local deadlines',c.result.status==='cancelled'&&c.result.code==='CANCELLED'&&c.result.acceptedForDisplay===false&&c.calls.length===1,{status:c.result.status,code:c.result.code,calls:c.calls.length});
c=runCase(function*(ctx){while(true){ctx.advance(1000);yield{phase:'independent slow branch',iteration:ctx.now/1000};}});
const unique=[...new Set(c.calls.map(v=>v.options.length))];
record('all slow branches allow multiple distinct lengths before total exhaustion',unique.length>=3&&c.result.acceptedForDisplay===false&&c.result.trace.every(t=>t.status==='local-budget-exhausted'||t.status==='budget-exhausted'),{uniqueLengths:unique,virtualSeconds:c.virtualSeconds,status:c.result.status,code:c.result.code,trace:c.result.trace.map(t=>({length:t.length,status:t.status,lengthEvaluationBudgetSeconds:t.lengthEvaluationBudgetSeconds,attempts:t.attempts}))});
record('local timeouts retain incomplete records and never raw candidate solutions',c.result.trials.some(t=>t.incomplete)&&!c.result.trials.some(t=>t.raw),{trials:c.result.trials.map(t=>({length:t.length,attempt:t.attempt,incomplete:t.incomplete,error:t.error}))});
record('shared per-length cap bounds both initializations',c.result.settings.lengthEvaluationBudgetSeconds===40&&unique.every(length=>{const starts=c.calls.filter(v=>v.options.length===length);return starts.length<=2;}),{declaredLengthBudget:c.result.settings.lengthEvaluationBudgetSeconds,calls:c.calls.map(v=>({length:v.options.length,attenuation:v.options.attenuation,at:v.at}))});
const fail=clone(raw);fail.smoothDetachment.numericalConverged=false;fail.physicalAdmissibility.screenPassed=false;fail.status='rejected';
c=runCase(function*(ctx,call,index){if(index===1){ctx.advance(625*((ctx.budgets.initialLengthEvaluationBudgetSeconds??ctx.budgets.lengthEvaluationBudgetSeconds)));return clone(fail);}if(index===2){ctx.advance(400*((ctx.budgets.initialLengthEvaluationBudgetSeconds??ctx.budgets.lengthEvaluationBudgetSeconds)));return ctx.raw();}return ctx.raw();},{warm:{length:.12}});
record('retry shares original length deadline rather than resetting it',c.calls[0].options.length===c.calls[1].options.length&&c.result.trace[0].status==='local-budget-exhausted'&&c.result.trace[0].attempts.length===2&&c.result.trials.some(t=>t.length===.12&&t.attempt===1&&t.raw)&&c.result.trials.some(t=>t.length===.12&&t.attempt===2&&t.incomplete)&&c.result.root?.length!==.12,{calls:c.calls.map(v=>({length:v.options.length,attenuation:v.options.attenuation,at:v.at})),trace:c.result.trace[0],finalRoot:c.result.root});
const physicalFail=clone(raw);physicalFail.physicalAdmissibility.screenPassed=false;
c=runCase(function*(ctx){return clone(physicalFail);},{warm:{length:.12}});
record('budget repair does not retry converged physical failure or relax physical screen',c.calls.length===1&&c.result.acceptedForDisplay===false&&c.result.code==='FORWARD_ROOT_PHYSICAL_SCREEN_FAILED',{calls:c.calls.length,status:c.result.status,code:c.result.code});
c=runCase(fast,{maxSeconds:1,maxLengthEvaluations:12});
record('derived local budget never exceeds global budget',c.result.settings.lengthEvaluationBudgetSeconds===1,{settings:c.result.settings});
c=runCase(fast,{maxSeconds:1,wetAdvance:2000});
record('global deadline checked immediately after wetted preflight computation',c.result.status==='budget-exhausted'&&c.result.code==='TIME_BUDGET'&&c.calls.length===0&&c.result.acceptedForDisplay===false,{status:c.result.status,code:c.result.code,calls:c.calls.length});
c=runCase(fast,{maxSeconds:1,screenAdvance:1000});
record('global deadline checked again after final physical gates before admission',c.result.status==='budget-exhausted'&&c.result.code==='TIME_BUDGET'&&c.result.acceptedForDisplay===false,{status:c.result.status,code:c.result.code,virtualSeconds:c.virtualSeconds});
const atOffset=(ctx,offset)=>{const r=ctx.raw();r.sigma+=offset;r.cavitySpeedRatio=Math.sqrt(1+r.sigma);return r;};
c=runCase(function*(ctx,call,index){if(index===1)return atOffset(ctx,.1);if(index===2)return atOffset(ctx,-.1);if(index===3){ctx.advance(41000);return ctx.raw();}return ctx.raw();});
record('local timeout at bracketed secant retains bracket and tries uncached interior fallback',c.calls.length===4&&c.result.acceptedForDisplay===true&&c.result.trace[2].status==='local-budget-exhausted'&&c.calls[3].options.length>.24&&c.calls[3].options.length<.65&&c.calls[3].options.length!==c.calls[2].options.length,{calls:c.calls.map(v=>({length:v.options.length,at:v.at})),root:c.result.root,trace:c.result.trace.map(v=>({length:v.length,status:v.status,code:v.code}))});
c=runCase(function*(ctx,call,index){if(index===1)return atOffset(ctx,.1);if(index===2)return atOffset(ctx,-.1);if(index===3||index===4){ctx.advance(41000);return ctx.raw();}return ctx.raw();});
record('consecutive local bracket timeouts can proceed to another uncached interior sample',c.calls.length===5&&c.result.acceptedForDisplay===true&&new Set(c.calls.map(v=>v.options.length)).size===5&&c.result.trace.filter(v=>v.status==='local-budget-exhausted').length===2,{calls:c.calls.map(v=>({length:v.options.length,at:v.at})),root:c.result.root});
c=runCase(fast);
record('search strategy describes central seed as an initial guess and discloses local budget',c.result.searchStrategy?.defaultInitialLength===.24&&c.result.searchStrategy?.initialGuessIsNotAPhysicalConstraint===true&&c.result.searchStrategy?.lengthEvaluationBudgetSeconds===40,{searchStrategy:c.result.searchStrategy});
c=runCase(fast);
record('first length has declared bounded extended allowance and later lengths keep base allowance',c.result.settings.initialLengthEvaluationBudgetSeconds===120&&c.result.settings.lengthEvaluationBudgetSeconds===40&&c.result.trace[0].localBudgetSeconds===120,{settings:c.result.settings,searchStrategy:c.result.searchStrategy});
c=runCase(function*(ctx,call,index){if(index===1)return atOffset(ctx,.01);return ctx.raw();});
record('near-target resolved initial sample probes actual neighboring length before remote endpoint',c.calls.length===2&&Math.abs(c.calls[1].options.length-c.calls[0].options.length)<=.020000000001&&c.calls[1].options.length!==c.calls[0].options.length&&c.result.acceptedForDisplay===true&&c.result.root.residual===0,{calls:c.calls.map(v=>({length:v.options.length,at:v.at})),root:c.result.root});
const sourcePath=path.join(root,'forward-hydrofoil.js');
const report={reviewedAt:new Date().toISOString(),driverVersion:F.VERSION,sourceSHA256:crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex'),method:'Independent virtual-clock and injected adapter flow-control checks; real wetted preflight and retained admitted candidate; no expensive root reruns.',checks,passed:checks.every(v=>v.passed)};
const oi=process.argv.indexOf('--out');if(oi>=0){if(!process.argv[oi+1])throw Error('--out needs an explicit file');fs.writeFileSync(path.resolve(process.argv[oi+1]),JSON.stringify(report,null,2));}
console.log(JSON.stringify({passed:report.passed,version:F.VERSION,checks:checks.map(v=>({name:v.name,passed:v.passed}))},null,2));





