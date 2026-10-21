import path from 'node:path';
import {createPreviewServer} from './serve.mjs';

const port=Number(process.argv[2]||5187);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Choose a local port from 1024 to 65535');
createPreviewServer({root:path.resolve('local/elevation-preview-site-2026-10-19-measurement'),strictCSP:true}).listen(port,'127.0.0.1',()=>console.log(`http://127.0.0.1:${port}/`));
