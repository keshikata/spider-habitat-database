import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {publicationRule,projectFlat,projectEntries,PUBLICATION_POLICY,PUBLIC_SOURCES,PUBLIC_LICENSES,ELEVATION_PREVIEW_POLICY,ELEVATION_PUBLICATION_POLICY,ELEVATION_METHOD,elevationApproval} from '../site/publication-policy.js';
import {packSpatialDelivery} from './pack-spatial-delivery.mjs';

export function preparePublicSpatial(source,destination,options={}){
  source=fs.realpathSync(source);destination=path.resolve(destination);
  if(destination===source||destination.startsWith(source+path.sep))throw new Error('Use a separate output directory');
  if(fs.existsSync(destination)&&fs.readdirSync(destination).length)throw new Error('Output must be empty; previous files must not enter the release');
  fs.mkdirSync(destination,{recursive:true});
  const hash=b=>createHash('sha256').update(b).digest('hex');
  const read=name=>JSON.parse(fs.readFileSync(path.join(source,name)));
  const write=(name,value)=>fs.writeFileSync(path.join(destination,name),JSON.stringify(value)+'\n');
  function unpack(info){
    if(path.basename(info.file)!==info.file)throw new Error('Invalid source path');
    const b=fs.readFileSync(path.join(source,info.file));if(hash(b)!==info.sha256)throw new Error('Input hash mismatch');
    return JSON.parse(gunzipSync(b));
  }
  function pack(prefix,value){
    const raw=Buffer.from(JSON.stringify(value)),b=gzipSync(raw,{level:6}),sha256=hash(b),file=prefix+'-'+sha256.slice(0,12)+'.json.gz';
    fs.writeFileSync(path.join(destination,file),b);return {file,sha256,bytes:b.length,decodedBytes:raw.length};
  }
  const approval=options.approval?elevationApproval(options.approval):null;
  const profile={elevation:Boolean(options.elevationPreview||approval)};
  const policy=profile.elevation?(approval?ELEVATION_PUBLICATION_POLICY:ELEVATION_PREVIEW_POLICY):PUBLICATION_POLICY;
  const projectAreas=areas=>Object.fromEntries(projectEntries(Object.entries(areas),profile));
  const projectRows=rows=>rows.map(([x,y,p,flat,...region])=>[x,y,p,projectFlat(flat,profile),...region]);
  const originalManifest=fs.readFileSync(path.join(source,'manifest.json')),m=JSON.parse(originalManifest);
  if(profile.elevation&&(m.schema!==6||read('summary.json').elevationStepM!==100))throw new Error('Adjustable elevation requires the native 100m-bin build');
  const manifest={schema:m.schema,model:m.model,tiles:[],overview:null};
  for(const t of m.tiles){
    const original=unpack(t),cells=projectRows(original.cells);
    manifest.tiles.push({id:t.id,bounds:t.bounds,prefs:t.prefs,cells:cells.length,...pack(t.id,{schema:m.schema,step:1,cells})});
    if(manifest.tiles.length%250===0)console.log(`Projected ${manifest.tiles.length}/${m.tiles.length} tiles`);
  }
  const overview=unpack(m.overview),cells=projectRows(overview.cells);
  manifest.overview={cells:cells.length,...pack('overview',{schema:m.schema,step:64,cells})};
  write('manifest.json',manifest);
  const sourceManifestSHA256=hash(fs.readFileSync(path.join(destination,'manifest.json')));
  const original=read('summary.json'),rules=Object.fromEntries(Object.entries(original.rules).map(([id,rs])=>[id,rs.map(rule=>publicationRule(rule,profile))]));
  const summary=Object.fromEntries(Object.entries(original.summary).map(([p,r])=>[p,{meshes:r.meshes,areas:projectAreas(r.areas)}]));
  const demSource=approval?approval.attribution+'（国土地理院 基盤地図情報 数値標高モデル10mを加工）':profile.elevation?'国土地理院 基盤地図情報 数値標高モデル10m（承認待ち・ローカル確認専用）':'';
  write('summary.json',{schema:m.schema,model:m.model,date:original.date,localOnly:profile.elevation&&!approval,publicationPolicy:policy,publicationDate:policy.slice(-10),dem:profile.elevation,distances:[100,250,500],elevationBands:profile.elevation?ELEVATION_METHOD.bands:[],...(profile.elevation?{elevationMethod:ELEVATION_METHOD,elevationStepM:100,elevationFilter:'required',elevationApproval:approval,strata:1572864*32}:{}),rules,summary,bounds:original.bounds,cells:original.cells,source:PUBLIC_SOURCES+(demSource?'; '+demSource:''),license:PUBLIC_LICENSES+(approval?'; 標高：国土地理院使用承認 '+approval.number:''),excludedLayers:[...(!profile.elevation?['elevation']:[]),'coast_distance','river_distance']});
  const gi=read('geography-manifest.json'),g=unpack({...gi,file:'geography.json.gz'});
  if(g.sourceManifestSHA256!==hash(originalManifest))throw new Error('Source geography differs from map');
  const regions=Object.fromEntries(Object.entries(g.regions).map(([id,r])=>[id,{pref:r.pref,names:r.names,bounds:r.bounds,meshes:r.meshes,areas:projectAreas(r.areas)}]));
  // Only the identifiers and assignment index needed for record scope are kept.
  const geography={schema:1,sourceManifestSHA256,regions,tiles:g.tiles,mainland:g.mainland,islands:g.islands,overview:projectRows(g.overview)};
  const packed=pack('geography',geography);
  fs.renameSync(path.join(destination,packed.file),path.join(destination,'geography.json.gz'));
  write('geography-manifest.json',{schema:1,sha256:packed.sha256,bytes:packed.bytes,decodedBytes:packed.decodedBytes,sourceManifestSHA256});
  const delivery=packSpatialDelivery(destination);
  return {tiles:manifest.tiles.length,summaryBytes:delivery.summary.bytes,policy};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const flags=process.argv.slice(4),approvalAt=flags.indexOf('--approval');
  const options={elevationPreview:flags.includes('--elevation-preview'),approval:approvalAt>=0?JSON.parse(fs.readFileSync(flags[approvalAt+1])):null};
  console.log(preparePublicSpatial(path.resolve(process.argv[2]||'local/spatial-reference'),path.resolve(process.argv[3]||'local/public-spatial'),options));
}
