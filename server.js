const http = require('http');
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'public');
const port = process.env.PORT || 8081;
const host = process.env.HOST || '127.0.0.1';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveFile(filePath, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
    res.end(data);
  });
}

// --- Simple JSON file storage for API ---
const dataDir = path.join(__dirname, 'data');
const files = {
  shipments: path.join(dataDir, 'shipments.json'),
  inspections: path.join(dataDir, 'inspections.json'),
  signatures: path.join(dataDir, 'signatures.json'),
};

function ensureDataFiles(){
  if(!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
  for(const f of Object.values(files)){
    if(!fs.existsSync(f)) fs.writeFileSync(f, '[]', 'utf-8');
  }
}

function readJSON(file){
  try{ return JSON.parse(fs.readFileSync(file,'utf-8')); }catch{ return []; }
}
function writeJSON(file, data){ fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8'); }

function sendJSON(res, code, data){
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS'
  });
  res.end(JSON.stringify(data));
}

function parseBody(req){
  return new Promise((resolve)=>{
    let body='';
    req.on('data', chunk=>{ body+=chunk; });
    req.on('end', ()=>{
      try{ resolve(JSON.parse(body||'{}')); }catch{ resolve({}); }
    });
  });
}

ensureDataFiles();

const server = http.createServer(async (req, res) => {
  const urlPath = decodeURI(req.url.split('?')[0]);
  let filePath = path.join(publicDir, urlPath);

  // Handle CORS preflight for API
  if(req.method === 'OPTIONS' && urlPath.startsWith('/api/')){
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS'
    });
    res.end();
    return;
  }

  // --- API routes ---
  if(urlPath.startsWith('/api/')){
    try{
      // /api/shipments
      if(urlPath === '/api/shipments' && req.method === 'GET'){
        const shipments = readJSON(files.shipments);
        return sendJSON(res, 200, { data: shipments });
      }
      if(urlPath === '/api/shipments' && req.method === 'POST'){
        const incoming = await parseBody(req);
        const shipments = readJSON(files.shipments);
        const id = incoming.id || `S_${Date.now()}`;
        const doc = {
          id,
          meta: incoming.meta || {},
          signatures: incoming.signatures || [],
          files: incoming.files || [],
          createdAt: new Date().toISOString()
        };
        shipments.push(doc);
        writeJSON(files.shipments, shipments);
        return sendJSON(res, 201, { data: doc });
      }

      // /api/shipments/:id
      const shipIdMatch = urlPath.match(/^\/api\/shipments\/([^\/]+)$/);
      if(shipIdMatch){
        const id = decodeURIComponent(shipIdMatch[1]);
        const shipments = readJSON(files.shipments);
        const idx = shipments.findIndex(s=>String(s.id)===String(id));
        if(req.method === 'GET'){
          const doc = shipments[idx];
          if(!doc) return sendJSON(res, 404, { error:'Not Found' });
          return sendJSON(res, 200, { data: doc });
        }
        if(req.method === 'PATCH'){
          if(idx<0) return sendJSON(res, 404, { error:'Not Found' });
          const incoming = await parseBody(req);
          shipments[idx].meta = { ...(shipments[idx].meta||{}), ...(incoming.meta||{}) };
          writeJSON(files.shipments, shipments);
          return sendJSON(res, 200, { data: shipments[idx] });
        }
        if(req.method === 'DELETE'){
          if(idx<0) return sendJSON(res, 404, { error:'Not Found' });
          const toDelete = shipments[idx];
          shipments.splice(idx,1);
          writeJSON(files.shipments, shipments);
          // Hapus inspeksi terkait
          const inspections = readJSON(files.inspections).filter(i=>String(i.shipmentId)!==String(id));
          writeJSON(files.inspections, inspections);
          // Hapus signature terkait
          const signatures = readJSON(files.signatures).filter(s=>String(s.shipmentId)!==String(id));
          writeJSON(files.signatures, signatures);
          return sendJSON(res, 200, { data: { id: id, deleted: true } });
        }
      }

      // /api/shipments/:id/inspection
      const inspectMatch = urlPath.match(/^\/api\/shipments\/([^\/]+)\/inspection$/);
      if(inspectMatch){
        const id = decodeURIComponent(inspectMatch[1]);
        const inspections = readJSON(files.inspections);
        const idx = inspections.findIndex(i=>String(i.shipmentId)===String(id));
        if(req.method === 'GET'){
          const rec = inspections[idx];
          return sendJSON(res, 200, { data: rec||null });
        }
        if(req.method === 'POST' || req.method === 'PATCH'){
          const incoming = await parseBody(req);
          const record = {
            shipmentId: id,
            inspector: incoming.inspector,
            inspectorName: incoming.inspectorName,
            inspectorEmail: incoming.inspectorEmail,
            inspectDate: incoming.inspectDate,
            items: incoming.items || [],
            note: incoming.note || ''
          };
          if(idx>=0){ inspections[idx] = { ...inspections[idx], ...record }; }
          else { inspections.push(record); }
          writeJSON(files.inspections, inspections);
          return sendJSON(res, 200, { data: record });
        }
      }

      // /api/shipments/:id/sign
      const signMatch = urlPath.match(/^\/api\/shipments\/([^\/]+)\/sign$/);
      if(signMatch){
        const id = decodeURIComponent(signMatch[1]);
        const incoming = await parseBody(req);
        const signatures = readJSON(files.signatures);
        const entry = {
          shipmentId: id,
          signer: incoming.signer,
          signature: incoming.signature,
          documentHash: incoming.documentHash,
          signedAt: new Date().toISOString()
        };
        signatures.push(entry);
        writeJSON(files.signatures, signatures);
        return sendJSON(res, 201, { data: entry });
      }

      // Unknown API route
      return sendJSON(res, 404, { error: 'Not Found' });
    }catch(e){
      console.error(e);
      return sendJSON(res, 500, { error: 'Server Error' });
    }
  }

  // default route
  if (urlPath === '/' || urlPath === '') {
    filePath = path.join(publicDir, 'index.html');
  }

  // prevent path traversal
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    if (err) {
      // fallback to index for client-side navigation of dashboard
      const fallback = path.join(publicDir, 'index.html');
      return serveFile(fallback, res);
    }
    serveFile(filePath, res);
  });
});

server.listen(port, host, () => {
  console.log(`Static server running at http://${host}:${port}/`);
});