import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {APPLICATION_ASSETS} from './public-assets.mjs';

export const ELEVATION_READINESS_INPUTS=[
  ...APPLICATION_ASSETS.map(name=>'site/'+name),
  'site/data/search.json','site/data/search.json.gz','site/data/taxonomy-crosswalk.json',
  'scripts/promote-elevation.mjs','scripts/release-elevation.mjs','scripts/elevation-readiness.mjs',
  'scripts/build-public-site.mjs','scripts/check-public-site.mjs','scripts/check-public-spatial.mjs',
  'scripts/check-deployment.mjs','scripts/check-sharing.mjs',
  'scripts/pack-spatial-delivery.mjs','scripts/public-assets.mjs','scripts/serve-elevation-preview.mjs','scripts/serve.mjs',
  'scripts/pack-query-delivery.mjs','scripts/check-query-delivery.mjs',
  'local/elevation-delivery-ready-2026-10-13/manifest.json',
  'local/elevation-delivery-ready-2026-10-13/delivery-manifest.json',
  'local/elevation-delivery-ready-2026-10-13/summary.json',
  'local/elevation-delivery-ready-2026-10-13/geography-manifest.json',
  'local/elevation-ready-presentation-2026-10-13/manifest.json',
  'local/elevation-ready-2026-10-13/native-reconciliation.json',
  'local/elevation-ready-2026-10-13/area-reconciliation.json',
  'local/elevation-ready-2026-10-13/deployment-config.json',
  'local/elevation-ready-2026-10-13/ui-verification-20261018.json',
  'local/elevation-ready-2026-10-13/preapplication-verification-20261018.json',
  'local/elevation-ready-2026-10-13/final-verification-20261018.json',
  'local/elevation-ready-2026-10-13/lazy-verification-20261018.json',
  'local/elevation-ready-2026-10-13/copy-design-verification-20261019.json',
  'local/elevation-ready-2026-10-13/measurement-verification-20261019.json',
];

// This verifies our tested local edition. It is never a GSI approval record.
export function verifyElevationReadiness({root=process.cwd(),recordPath='local/elevation-ready-2026-10-13/release-readiness.json'}={}){
  root=fs.realpathSync(root);
  const bytes=fs.readFileSync(path.resolve(root,recordPath)),record=JSON.parse(bytes);
  if(record.schema!==1||record.status!=='ready_for_approval'||record.site!=='https://spider-habitat-atlas.pages.dev/'||!/^[a-f0-9]{64}$/.test(record.preparedManifestSHA256||'')||!Array.isArray(record.files)||!record.files.length||record.checks?.browser!=='passed'||record.checks?.regression!=='passed'||record.checks?.nativeReconciliation!=='passed'||record.checks?.publicArtifact!=='passed')throw new Error('The tested elevation edition is not ready');
  const seen=new Set();
  for(const item of record.files){
    if(typeof item.path!=='string'||path.isAbsolute(item.path)||item.path.includes('\\')||item.path.split('/').some(p=>!p||p==='.'||p==='..')||seen.has(item.path)||!Number.isSafeInteger(item.bytes)||item.bytes<1||!/^[a-f0-9]{64}$/.test(item.sha256||''))throw new Error('Invalid readiness file record');
    seen.add(item.path);
    const filename=path.resolve(root,item.path),real=fs.realpathSync(filename);
    if(!real.toLowerCase().startsWith((root+path.sep).toLowerCase())||fs.lstatSync(filename).isSymbolicLink())throw new Error('Readiness input escaped the workspace');
    const file=fs.readFileSync(real);
    if(file.length!==item.bytes||createHash('sha256').update(file).digest('hex')!==item.sha256)throw new Error('Tested elevation input changed: '+item.path);
  }
  if(ELEVATION_READINESS_INPUTS.some(filename=>!seen.has(filename))||record.files.find(x=>x.path==='local/elevation-delivery-ready-2026-10-13/manifest.json')?.sha256!==record.preparedManifestSHA256)throw new Error('Readiness omitted a required input');
  return {sha256:createHash('sha256').update(bytes).digest('hex'),preparedManifestSHA256:record.preparedManifestSHA256,files:record.files.length,checks:record.checks};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(verifyElevationReadiness()));
