import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const destination=path.resolve(process.argv[2]||'local/elevation-ready-presentation-2026-10-13');
if(!destination.startsWith(path.resolve('local')+path.sep))throw new Error('Pending figures must remain local');
if(fs.existsSync(destination)&&fs.readdirSync(destination).length)throw new Error('Use a new empty destination');
fs.mkdirSync(destination,{recursive:true});
const reviewed=JSON.parse(fs.readFileSync('local/public-presentation/manifest.json'));
const files={};
for(let n=1;n<=20;n++){
  const name=`page-${String(n).padStart(2,'0')}.png`,restore=[6,9,10,11,12].includes(n);
  const bytes=fs.readFileSync(path.join(restore?'local/presentation':'local/public-presentation',name));
  const digest=createHash('sha256').update(bytes).digest('hex');
  if(!restore&&(reviewed.files?.[name]?.sha256!==digest||reviewed.files?.[name]?.bytes!==bytes.length))throw new Error('Reviewed slide differs');
  fs.writeFileSync(path.join(destination,name),bytes);files[name]={bytes:bytes.length,sha256:digest};
}
fs.writeFileSync(path.join(destination,'manifest.json'),JSON.stringify({...reviewed,edition:'web-elevation-ready-2026-10-13',demFigures:true,elevationApproval:null,restoredDEMPages:[6,9,10,11,12],files})+'\n');
console.log(JSON.stringify({pages:20,restoredDEMPages:[6,9,10,11,12],localOnly:true}));
