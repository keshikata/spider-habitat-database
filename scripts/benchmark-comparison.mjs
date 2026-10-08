import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {comparisonCapacity} from '../site/comparison.js';
import {effectiveSpecies,summarizeSpatial} from '../site/spatial-model.js';
const root=process.argv[2]||fileURLToPath(new URL('../local/spatial-reference/',import.meta.url));
const catalog=JSON.parse(fs.readFileSync(new URL('../site/data/catalog.json',import.meta.url)));
const data=JSON.parse(fs.readFileSync(path.join(root,'summary.json')));
data.geography=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'geography.json.gz'))));
const capacity=comparisonCapacity(catalog.species),settings={region:'all',pref:'',scope:'environment',model:'distance',distance:500};
const eligible=catalog.species.filter(s=>effectiveSpecies(data,s,settings).classes.length);
const groups=new Map();for(const s of eligible)groups.set(s.genus,[...(groups.get(s.genus)||[]),s]);
const largestEligible=[...groups].sort((a,b)=>b[1].length-a[1].length)[0];
const measure=(species,scope)=>{const start=performance.now();let area=0;for(const s of species)area+=summarizeSpatial(catalog,data,s,{...settings,scope}).area||0;return {species:species.length,milliseconds:Number((performance.now()-start).toFixed(1)),areaChecksum:area};};
const mixed=eligible.slice(0,capacity.count);
console.log(JSON.stringify({capacity,eligibleSpecies:eligible.length,largestEligibleGenus:largestEligible[0],largestEligibleCount:largestEligible[1].length,
  mixedCold:measure(mixed,'environment'),mixedWarm:measure(mixed,'environment'),mixedRecorded:measure(mixed,'recorded'),largestGenus:measure(largestEligible[1],'environment')},null,2));
