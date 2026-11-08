const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');const files=[];
for(const d of fs.readdirSync(root,{withFileTypes:true}).filter(x=>x.isDirectory()))for(const n of fs.readdirSync(path.join(root,d.name)))if(/\.test\.(?:js|mjs)$/.test(n))files.push(path.join(root,d.name,n));
const run=cp.spawnSync(process.execPath,['--test',...files.sort()],{stdio:'inherit',cwd:root,shell:false});if(run.error)throw run.error;process.exitCode=run.status===null?1:run.status;