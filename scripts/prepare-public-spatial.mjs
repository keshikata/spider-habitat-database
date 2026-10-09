import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {publicationRule,projectFlat,projectEntries,PUBLICATION_POLICY,PUBLIC_SOURCES,PUBLIC_LICENSES} from '../site/publication-policy.js';
import {packSpatialDelivery} from './pack-spatial-delivery.mjs';

export function preparePublicSpatial(source,destination){
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
  const projectAreas=areas=>Object.fromEntries(projectEntries(Object.entries(areas)));
  const projectRows=rows=>rows.map(([x,y,p,flat,...region])=>[x,y,p,projectFlat(flat),...region]);
  const originalManifest=fs.readFileSync(path.join(source,'manifest.json')),m=JSON.parse(originalManifest);
  const manifest={schema:m.schema,model:m.model,tiles:[],overview:null};
  for(const t of m.tiles){
    const original=unpack(t),cells=projectRows(original.cells);
    manifest.tiles.push({id:t.id,bounds:t.bounds,prefs:t.prefs,cells:cells.length,...pack(t.id,{schema:5,step:1,cells})});
    if(manifest.tiles.length%250===0)console.log(`Projected ${manifest.tiles.length}/${m.tiles.length} tiles`);
  }
  const overview=unpack(m.overview),cells=projectRows(overview.cells);
  manifest.overview={cells:cells.length,...pack('overview',{schema:5,step:64,cells})};
  write('manifest.json',manifest);
  const sourceManifestSHA256=hash(fs.readFileSync(path.join(destination,'manifest.json')));
  const original=read('summary.json'),rules=Object.fromEntries(Object.entries(original.rules).map(([id,rs])=>[id,rs.map(publicationRule)]));
  const summary=Object.fromEntries(Object.entries(original.summary).map(([p,r])=>[p,{meshes:r.meshes,areas:projectAreas(r.areas)}]));
  write('summary.json',{schema:5,model:m.model,date:original.date,localOnly:false,publicationPolicy:PUBLICATION_POLICY,publicationDate:PUBLICATION_POLICY.slice(-10),dem:false,distances:[100,250,500],elevationBands:[],rules,summary,bounds:original.bounds,cells:original.cells,source:PUBLIC_SOURCES,license:PUBLIC_LICENSES,excludedLayers:['elevation','coast_distance','river_distance']});
  const gi=read('geography-manifest.json'),g=unpack({...gi,file:'geography.json.gz'});
  if(g.sourceManifestSHA256!==hash(originalManifest))throw new Error('Source geography differs from map');
  const regions=Object.fromEntries(Object.entries(g.regions).map(([id,r])=>[id,{pref:r.pref,names:r.names,bounds:r.bounds,meshes:r.meshes,areas:projectAreas(r.areas)}]));
  // Only the identifiers and assignment index needed for record scope are kept.
  const geography={schema:1,sourceManifestSHA256,regions,tiles:g.tiles,mainland:g.mainland,islands:g.islands,overview:projectRows(g.overview)};
  const packed=pack('geography',geography);
  fs.renameSync(path.join(destination,packed.file),path.join(destination,'geography.json.gz'));
  write('geography-manifest.json',{schema:1,sha256:packed.sha256,bytes:packed.bytes,decodedBytes:packed.decodedBytes,sourceManifestSHA256});
  const delivery=packSpatialDelivery(destination);
  return {tiles:manifest.tiles.length,summaryBytes:delivery.summary.bytes,policy:PUBLICATION_POLICY};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(preparePublicSpatial(path.resolve(process.argv[2]||'local/spatial-reference'),path.resolve(process.argv[3]||'local/public-spatial')));
