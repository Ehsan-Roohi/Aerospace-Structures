'use strict';
const C=require('./c1-domain-frozen-core.cjs'),fs=require('node:fs'),path=require('node:path');
const cases=[24,32,48,64].map(resolution=>{const inputs=C.options({resolution}),g=C.buildFoil(inputs);return {id:`base-${resolution}`,inputs,original:g.points,nodes:g.nodes,ids:g.ids,foilS:g.foilS};});
fs.writeFileSync(path.join(__dirname,'independent-cavity-input.json'),JSON.stringify(cases,null,2)+'\n');
