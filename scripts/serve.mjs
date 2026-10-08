import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {createGzip} from 'node:zlib';
import {pipeline} from 'node:stream';
import {fileURLToPath} from 'node:url';
const siteRoot=fileURLToPath(new URL('../site/',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.txt':'text/plain; charset=utf-8','.gz':'application/gzip'};
const previewPath=/^\/preview-data\/(?:summary\.json|manifest\.json|delivery-manifest\.json|geography-manifest\.json|geography\.json\.gz|(?:summary|geography-index|map-pref-[1-9][0-9]?|map-region-[1-9][0-9]?|overview|(?:hokkaido|tohoku|kanto|chubu|kinki|chugoku|shikoku|kyushu|okinawa)-\d{2,3}-\d{2,3})-[a-f0-9]{12}\.json\.gz)$/;

export function createPreviewServer({root=siteRoot,previewRoot=path.resolve(root,'../local/spatial-reference'),slidesRoot=path.resolve(root,'../local/presentation'),strictCSP=false}={}){
  root=fs.realpathSync(root);
  const headers={};
  for(const line of fs.readFileSync(path.join(root,'_headers'),'utf8').split(/\r?\n/)){
    if(line.startsWith('/data/'))break;
    const match=line.match(/^\s+([^:]+):\s*(.*)$/);if(match)headers[match[1]]=match[2];
  }
  // Annotation styles are local-preview only. Public hosting uses _headers unchanged.
  if(!strictCSP)headers['Content-Security-Policy']=headers['Content-Security-Policy'].replace(/(^|;\s*)style-src-elem 'self'(?=;|$)/,"$1style-src-elem 'self' 'unsafe-inline'");
  const server=http.createServer({maxHeaderSize:16384},async(req,res)=>{
    const finish=(status,text='')=>{res.writeHead(status,{...headers,'Cache-Control':'no-store','Content-Type':'text/plain; charset=utf-8'});res.end(text);};
    const port=server.address().port,hosts=[`127.0.0.1:${port}`,`localhost:${port}`];
    if(!hosts.includes(req.headers.host))return finish(403);
    if(req.headers['sec-fetch-site']==='cross-site'||(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`))return finish(403);
    if(!['GET','HEAD'].includes(req.method))return finish(405);
    if(req.url.length>8192)return finish(414);
    try{
      const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      if(pathname.includes('\\')||pathname.includes('\0')||pathname.split('/').some(p=>p.startsWith('.')||p.startsWith('_')))return finish(404);
      const slides=pathname.startsWith('/preview-slides/'),preview=pathname.startsWith('/preview-data/');
      if(slides&&!/^\/preview-slides\/(?:manifest\.json|page-(?:0[1-9]|1[0-9]|20)\.png)$/.test(pathname))return finish(404);
      if(preview&&!previewPath.test(pathname))return finish(404);
      const confinedRoot=slides?await fsp.realpath(slidesRoot):preview?await fsp.realpath(previewRoot):root;
      const filename=await fsp.realpath(preview||slides?path.join(confinedRoot,path.basename(pathname)):path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname)));
      if(!filename.startsWith(confinedRoot+path.sep))return finish(404);
      const stat=await fsp.stat(filename);if(!stat.isFile())return finish(404);
      const ext=path.extname(filename),gzip=(req.headers['accept-encoding']||'').split(',').some(v=>{const [name,...params]=v.trim().split(';');const q=params.find(p=>p.trim().startsWith('q='));return name==='gzip'&&(!q||Number(q.trim().slice(2))>0);})&&['.html','.js','.css','.json','.svg','.txt'].includes(ext);
      const etag=`W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}-${gzip?'gz':'raw'}"`;
      const immutable=/-[a-f0-9]{12}\.json\.gz$/.test(filename);
      const output={...headers,'Content-Type':types[ext]||'application/octet-stream','Cache-Control':immutable?'private, max-age=31536000, immutable':'private, max-age=0, must-revalidate','Vary':'Accept-Encoding','ETag':etag};
      if(gzip)output['Content-Encoding']='gzip';else output['Content-Length']=stat.size;
      if(req.headers['if-none-match']===etag){delete output['Content-Length'];res.writeHead(304,output);res.end();return;}
      res.writeHead(200,output);if(req.method==='HEAD'){res.end();return;}
      const stream=fs.createReadStream(filename);
      pipeline(...(gzip?[stream,createGzip(),res]:[stream,res]),error=>{if(error&&!res.destroyed)res.destroy();});
    }catch(error){if(!res.headersSent)finish(error instanceof URIError?400:404);else res.destroy();}
  });
  server.requestTimeout=20000;server.headersTimeout=10000;server.keepAliveTimeout=5000;
  return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  createPreviewServer({strictCSP:process.argv.includes('--strict-csp')}).listen(5187,'127.0.0.1',()=>console.log('http://127.0.0.1:5187'));
}
