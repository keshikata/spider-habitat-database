import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
const root=fs.realpathSync(fileURLToPath(new URL('../site/',import.meta.url)));
const prefix=root+path.sep;
const previewRoot=path.resolve(root,'../local/spatial');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.txt':'text/plain; charset=utf-8','.gz':'application/gzip'};
const headers={};
for(const line of fs.readFileSync(path.join(root,'_headers'),'utf8').split(/\r?\n/)){
  if(line.startsWith('/data/'))break;
  const match=line.match(/^\s+([^:]+):\s*(.*)$/);if(match)headers[match[1]]=match[2];
}
http.createServer((req,res)=>{
  const finish=(status,text='')=>{res.writeHead(status,{...headers,'Content-Type':'text/plain; charset=utf-8'});res.end(text);};
  if(!['127.0.0.1:5187','localhost:5187'].includes(req.headers.host))return finish(403);
  if(!['GET','HEAD'].includes(req.method))return finish(405);
  if(req.url.length>8192)return finish(414);
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname.includes('\\')||pathname.includes('\0')||pathname.split('/').some(p=>p.startsWith('.')||p.startsWith('_')))return finish(404);
    const preview=pathname.startsWith('/preview-data/');
    if(preview&&!/^\/preview-data\/(?:summary\.json|manifest\.json|(?:overview|(?:hokkaido|tohoku|kanto|chubu|kinki|chugoku|shikoku|kyushu|okinawa)-\d{2,3}-\d{2,3})-[a-f0-9]{12}\.json\.gz)$/.test(pathname))return finish(404);
    const confinedRoot=preview?fs.realpathSync(previewRoot):root;
    const filename=fs.realpathSync(preview?path.join(confinedRoot,path.basename(pathname)):path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname)));
    if(!filename.startsWith(confinedRoot+path.sep)||!fs.statSync(filename).isFile())return finish(404);
    let body=fs.readFileSync(filename);const ext=path.extname(filename),output={...headers,'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'no-cache','Vary':'Accept-Encoding'};
    if(/\bgzip\b/.test(req.headers['accept-encoding']||'')&&['.html','.js','.css','.json','.svg','.txt'].includes(ext)){body=gzipSync(body);output['Content-Encoding']='gzip';}
    output['Content-Length']=body.length;res.writeHead(200,output);res.end(req.method==='HEAD'?undefined:body);
  }catch(error){finish(error instanceof URIError?400:404);}
}).listen(5187,'127.0.0.1',()=>console.log('http://127.0.0.1:5187'));
