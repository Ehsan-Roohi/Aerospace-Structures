const fs=require('fs'),path=require('path'),F=require('../../forward-hydrofoil.js');
const requests=[
  {
    "id": "native-016-cold",
    "input": {
      "mode": "sigma",
      "sigma": 1.3157940493756035,
      "chord": 0.16,
      "naca": "0020",
      "alpha": 4,
      "settings": {
        "resolution": 48,
        "maxSeconds": 240,
        "extendedResearchDomain": false
      }
    }
  },
  {
    "id": "native-016-original0012",
    "input": {
      "mode": "physical",
      "U": 20,
      "pInf": 101325,
      "temperatureC": 20,
      "chord": 0.16,
      "naca": "0012",
      "alpha": 4,
      "settings": {
        "resolution": 48,
        "maxSeconds": 240,
        "extendedResearchDomain": false
      }
    }
  },
  {
    "id": "native-016-n64-bounded120",
    "input": {
      "mode": "sigma",
      "sigma": 1.3157940493756035,
      "chord": 0.16,
      "naca": "0020",
      "alpha": 4,
      "settings": {
        "resolution": 64,
        "maxSeconds": 120,
        "extendedResearchDomain": false
      }
    }
  }
];
const at=process.argv.indexOf('--out'),out=at>=0?process.argv[at+1]:null;if(at>=0&&!out)throw Error('--out needs an explicit directory');if(out)fs.mkdirSync(path.resolve(out),{recursive:true});(async()=>{for(const {id,input}of requests){const r=await F.solve(input);if(out)fs.writeFileSync(path.join(path.resolve(out),id+'.json'),JSON.stringify(r));console.log(JSON.stringify({id,status:r.status,code:r.code,root:r.root,elapsedSeconds:r.elapsedSeconds}));}})().catch(e=>{console.error(e);process.exitCode=1});
