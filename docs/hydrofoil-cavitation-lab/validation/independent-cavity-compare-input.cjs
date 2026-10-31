'use strict';
const fs=require('node:fs'),path=require('node:path');
const input=JSON.parse(fs.readFileSync(path.join(__dirname,'independent-cavity-input.json'),'utf8')),r=JSON.parse(fs.readFileSync(path.join(__dirname,'closure-regularity-probe.json'),'utf8'));
for(const c of input){const b=r.meshes.find(b=>b.resolution===c.inputs.resolution);c.initialGap=b.height.map(h=>h.h);c.initialSpeed=Math.sqrt(1+b.sigma);c.initialA=b.attenuation;c.initialGuess='Production-potential C1 shape used ONLY as initial guess; velocity/shape equations solved independently.';}
fs.writeFileSync(path.join(__dirname,'independent-cavity-warm-input.json'),JSON.stringify(input,null,2)+'\n');
