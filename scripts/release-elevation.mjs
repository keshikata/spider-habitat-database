import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {elevationApproval} from '../site/publication-policy.js';
import {promoteElevation} from './promote-elevation.mjs';

const args=process.argv.slice(2),approvalPath=args[0];
if(!approvalPath)throw new Error('Usage: release-elevation.mjs verified-approval.json [--deploy --wrangler-cli /path/to/wrangler.js]');
const record=JSON.parse(fs.readFileSync(approvalPath)),approval=elevationApproval(record);
const suffix=approval.issuedOn+'-'+approval.receiptSHA256.slice(0,8);
const source=path.resolve('local/elevation-delivery-ready-2026-10-13'),destination=path.resolve('local/elevation-approved-'+suffix);
const slidesSource=path.resolve('local/elevation-ready-presentation-2026-10-13'),slidesDestination=path.resolve('local/elevation-approved-slides-'+suffix);
const output=path.resolve('output/release-elevation-'+suffix);
function run(script,argumentsList){
  const result=spawnSync(process.execPath,[script,...argumentsList],{stdio:'inherit',windowsHide:true,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
  if(result.error||result.status!==0)throw new Error(script+' failed; do not deploy unverified output');
}
promoteElevation({source,destination,slidesSource,slidesDestination,approvalPath});
run('scripts/check-public-spatial.mjs',[path.resolve('local/elevation-ready-2026-10-13'),destination]);
run('scripts/build-public-site.mjs',[output,destination,slidesDestination]);
run('scripts/check-public-site.mjs',[output]);
if(args.includes('--deploy')){
  const index=args.indexOf('--wrangler-cli'),wrangler=index>=0?args[index+1]:process.env.WRANGLER_CLI;
  if(!wrangler||!fs.existsSync(wrangler))throw new Error('Supply the installed official Wrangler CLI path; verified output is retained');
  run(wrangler,['pages','deploy',output,'--project-name','spider-habitat-atlas','--branch','main']);
  run('scripts/check-deployment.mjs',['https://spider-habitat-atlas.pages.dev/',output]);
}
console.log(JSON.stringify({ready:true,output,approvalNumber:approval.number,deployed:args.includes('--deploy')}));
