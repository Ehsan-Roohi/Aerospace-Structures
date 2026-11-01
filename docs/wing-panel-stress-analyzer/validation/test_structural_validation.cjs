// Publication integrity and coverage of the independent structural benchmark.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const app=path.resolve(__dirname,'..'),dir=path.join(__dirname,'structure');
const read=p=>fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n'),sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const page=read(path.join(app,'index.html')),alias=read(path.join(app,'wing-lab.html')),shell=read(path.join(app,'ui/wx-shell.js'));
assert.equal(page,alias,'Both public page aliases must be identical');assert.ok(page.includes(shell.trim()),'Editable shell is embedded verbatim');
assert.match(shell,/id:'wxStructuralValidation'/);assert.match(shell,/href:'validation\/structure\/index.html'/);
const html=read(path.join(dir,'index.html'));let localLinks=0;
for(const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {const u=m[1];if(/^(https?:|#|mailto:)/.test(u))continue;assert.ok(fs.existsSync(path.resolve(dir,u.split('#')[0])),'Missing local evidence link: '+u);localLinks++;}
assert.match(html,/not experimental validation/);assert.match(html,/24\.063%/);assert.match(html,/91\.011%/);assert.match(html,/unweighted rigid-motion fit/);
const evidence=JSON.parse(read(path.join(dir,'comparison.json'))),build=JSON.parse(read(path.join(app,'BUILD.json')));
assert.equal(evidence.solidSolver,'CalculiX 2.23');assert.match(evidence.status,/not general validation/);
const start=page.indexOf('const WingEngine ='),end=page.indexOf('module.exports = WingEngine;',start)+'module.exports = WingEngine;'.length;
const engineBlock=page.slice(start,end),source=read(path.join(app,'ui/zero-tip-source/engine.js'));
assert.ok(source.includes(engineBlock),'Exact deployed engine block has the recorded editable source');
assert.equal(evidence.publishedEngineIdentity.publishedEngineSha256,crypto.createHash('sha256').update(engineBlock).digest('hex'));
assert.equal(evidence.publishedEngineIdentity.editableSourceContainsExactPublishedEngine,true);
assert.equal(evidence.benchmarkArchiveSha256,sha(path.join(dir,'benchmark.zip')));
assert.equal(build.pageSha256,sha(path.join(app,'index.html')));
assert.equal(JSON.parse(read(path.join(app,'RELEASE.json'))).ui_release.page_sha256,sha(path.join(app,'index.html')));
assert.equal(build.sources['wx-shell.js'].sha256,sha(path.join(app,'ui/wx-shell.js')));
for(const channel of ['uniform','torque']) {
 const c=evidence.channels[channel];assert.equal(c.current_matched_sample_count,7188);assert.equal(c.unresolved_count,207);assert.equal(c.current_matched_field_max_change_from_archive_MPa,0);
 const lines=read(path.join(dir,channel+'-stress.csv')).trim().split('\n');assert.equal(lines.length-1,7395);assert.equal(lines.slice(1).filter(s=>s.split(',')[1]==='True').length,7188);
 assert.equal(c.motion_samples.resolved_nodes,5805);assert.equal(c.motion_samples.selected_nodes,6023);
}
assert.equal(evidence.channels.uniform.current_beam_generalized_response,3.213818510211743);
assert.equal(evidence.channels.torque.current_beam_generalized_response,.0037825437335942368);
const report={status:'passed',localEvidenceLinks:localLinks,checks:['Separate Help entry and crosslinked evidence page','Both page aliases and editable shell agree','Every local evidence link exists','Full matched-point counts including unresolved samples retained','Raw torque stress discrepancy remains visible','Work-conjugate rotation is distinguished from nodal-band fit','Current exact embedded engine rerun matches archived finite-tip benchmark','Benchmark ZIP and BUILD/source hashes verified'],limits:['No browser interaction or experimental validation is inferred by this static integrity test','No exact-zero-tip or general local stress validation pass']};
fs.writeFileSync(path.join(__dirname,'STRUCTURAL_VALIDATION_REVIEW.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
