// Netlify Function: API router backed by Supabase REST
// Exposes endpoints compatible with local server:
// - GET/POST /shipments
// - GET/PATCH/DELETE /shipments/:id
// - GET/POST /shipments/:id/inspection
// - POST /shipments/:id/sign

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
// Fallback storage via Netlify Blobs when Supabase env is missing
const { getStore } = require('@netlify/blobs');
const docusign = require('docusign-esign');

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  };
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    body: JSON.stringify(body),
  };
}

async function sbFetch(path, opts = {}) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY)
    throw new Error('Supabase env missing: set SUPABASE_URL and SUPABASE_ANON_KEY');
  const url = `${SUPABASE_URL}/rest/v1${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && data.message) || res.statusText || 'Error';
    throw new Error(`Supabase error: ${msg}`);
  }
  return data;
}

// --- Blobs helpers ---
const useBlobs = !SUPABASE_URL || !SUPABASE_ANON_KEY;
const store = getStore('bapsa');
async function blobsGetJSON(key, def = null) {
  const v = await store.get(key);
  if (!v) return def;
  try { return JSON.parse(v); } catch { return def; }
}
async function blobsSetJSON(key, obj) {
  await store.set(key, JSON.stringify(obj));
}

exports.handler = async (event) => {
  try {
    // CORS preflight
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers: corsHeaders() };
    }

    // Normalize route: remove "/.netlify/functions/api" prefix
    const route = (event.path || '').replace(/^\/\.netlify\/functions\/api/, '') || '/';
    const method = event.httpMethod;

    // --- Shipments collection ---
    if (route === '/shipments' && method === 'GET') {
      if (useBlobs) {
        const index = await blobsGetJSON('shipments-index', []);
        return json(200, { data: index });
      } else {
        const list = await sbFetch('/shipments?select=*');
        return json(200, { data: list || [] });
      }
    }
    if (route === '/shipments' && method === 'POST') {
      const incoming = JSON.parse(event.body || '{}');
      const id = incoming.id || `S_${Date.now()}`;
      const record = {
        id,
        meta: incoming.meta || {},
        signatures: incoming.signatures || [],
        files: incoming.files || [],
        createdAt: new Date().toISOString(),
      };
      if (useBlobs) {
        const index = await blobsGetJSON('shipments-index', []);
        const exists = index.find((s) => s.id === id);
        const toSave = exists ? index.map((s) => (s.id === id ? record : s)) : [...index, record];
        await blobsSetJSON('shipments-index', toSave);
        return json(201, { data: record });
      } else {
        const inserted = await sbFetch('/shipments', {
          method: 'POST',
          body: JSON.stringify(record),
          headers: { Prefer: 'return=representation' },
        });
        return json(201, { data: Array.isArray(inserted) ? inserted[0] : inserted });
      }
    }

    // --- Shipments item ---
    const shipIdMatch = route.match(/^\/shipments\/([^\/]+)$/);
    if (shipIdMatch) {
      const id = decodeURIComponent(shipIdMatch[1]);
      if (method === 'GET') {
        if (useBlobs) {
          const index = await blobsGetJSON('shipments-index', []);
          const doc = index.find((s) => s.id === id) || null;
          if (!doc) return json(404, { error: 'Not Found' });
          return json(200, { data: doc });
        } else {
          const rows = await sbFetch(`/shipments?select=*&id=eq.${encodeURIComponent(id)}`);
          const doc = Array.isArray(rows) ? rows[0] : null;
          if (!doc) return json(404, { error: 'Not Found' });
          return json(200, { data: doc });
        }
      }
      if (method === 'PATCH') {
        const incoming = JSON.parse(event.body || '{}');
        const payload = { meta: incoming.meta || {} };
        if (useBlobs) {
          const index = await blobsGetJSON('shipments-index', []);
          const updatedIndex = index.map((s) => (s.id === id ? { ...s, meta: payload.meta } : s));
          await blobsSetJSON('shipments-index', updatedIndex);
          const doc = updatedIndex.find((s) => s.id === id) || null;
          return json(200, { data: doc });
        } else {
          const updated = await sbFetch(`/shipments?id=eq.${encodeURIComponent(id)}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
            headers: { Prefer: 'return=representation' },
          });
          const doc = Array.isArray(updated) ? updated[0] : updated;
          return json(200, { data: doc });
        }
      }
      if (method === 'DELETE') {
        if (useBlobs) {
          const index = await blobsGetJSON('shipments-index', []);
          const filtered = index.filter((s) => s.id !== id);
          await blobsSetJSON('shipments-index', filtered);
          await store.delete(`inspection:${id}`);
          await store.delete(`signatures:${id}`);
          return json(200, { data: { id, deleted: true } });
        } else {
          await sbFetch(`/shipments?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
          // Cascade delete related records
          await sbFetch(`/inspections?shipmentId=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
          await sbFetch(`/signatures?shipmentId=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
          return json(200, { data: { id, deleted: true } });
        }
      }
    }

    // --- Inspection per shipment ---
    const inspectMatch = route.match(/^\/shipments\/([^\/]+)\/inspection$/);
    if (inspectMatch) {
      const id = decodeURIComponent(inspectMatch[1]);
      if (method === 'GET') {
        if (useBlobs) {
          const rec = await blobsGetJSON(`inspection:${id}`, null);
          return json(200, { data: rec || null });
        } else {
          const rows = await sbFetch(`/inspections?select=*&shipmentId=eq.${encodeURIComponent(id)}`);
          const rec = Array.isArray(rows) ? rows[0] : null;
          return json(200, { data: rec || null });
        }
      }
      if (method === 'POST' || method === 'PATCH') {
        const incoming = JSON.parse(event.body || '{}');
        const record = {
          shipmentId: id,
          inspector: incoming.inspector,
          inspectorName: incoming.inspectorName,
          inspectorEmail: incoming.inspectorEmail,
          inspectDate: incoming.inspectDate,
          items: Array.isArray(incoming.items) ? incoming.items : [],
          note: incoming.note || '',
        };
        if (useBlobs) {
          await blobsSetJSON(`inspection:${id}`, record);
          return json(200, { data: record });
        } else {
          const upserted = await sbFetch('/inspections?on_conflict=shipmentId', {
            method: 'POST',
            body: JSON.stringify(record),
            headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
          });
          const rec = Array.isArray(upserted) ? upserted[0] : upserted;
          return json(200, { data: rec });
        }
      }
    }

    // --- Sign per shipment ---
    const signMatch = route.match(/^\/shipments\/([^\/]+)\/sign$/);
    if (signMatch) {
      const id = decodeURIComponent(signMatch[1]);
      if (method === 'POST') {
        const incoming = JSON.parse(event.body || '{}');
        const entry = {
          shipmentId: id,
          signer: incoming.signer,
          signature: incoming.signature,
          documentHash: incoming.documentHash,
          signedAt: new Date().toISOString(),
        };
        if (useBlobs) {
          const arr = await blobsGetJSON(`signatures:${id}`, []);
          const next = [...arr, entry];
          await blobsSetJSON(`signatures:${id}`, next);
          // also mirror in shipment record for convenience
          const index = await blobsGetJSON('shipments-index', []);
          const updatedIndex = index.map((s) => (s.id === id ? { ...s, signatures: next } : s));
          await blobsSetJSON('shipments-index', updatedIndex);
          return json(201, { data: entry });
        } else {
          const inserted = await sbFetch('/signatures', {
            method: 'POST',
            body: JSON.stringify(entry),
            headers: { Prefer: 'return=representation' },
          });
          const rec = Array.isArray(inserted) ? inserted[0] : inserted;
          return json(201, { data: rec });
        }
      }
    }

    // --- DocuSign embedded signing start ---
    if (route === '/docusign/start' && method === 'POST') {
      // Setup DocuSign client via JWT
      const env = process.env.DOCUSIGN_ENV || 'demo';
      const BASE_PATH = env === 'demo' ? 'https://demo.docusign.net/restapi' : 'https://www.docusign.net/restapi';
      const OAUTH_BASE = env === 'demo' ? 'account-d.docusign.com' : 'account.docusign.com';
      const dsClient = new docusign.ApiClient();
      dsClient.setBasePath(BASE_PATH);
      dsClient.setOAuthBasePath(OAUTH_BASE);

      const integrationKey = process.env.DOCUSIGN_INTEGRATION_KEY;
      const userId = process.env.DOCUSIGN_USER_ID;
      const privateKeyB64 = process.env.DOCUSIGN_PRIVATE_KEY || '';
      const privateKey = Buffer.from(privateKeyB64, 'base64');
      const scopes = ['signature', 'impersonation'];
      const results = await dsClient.requestJWTUserToken(integrationKey, userId, OAUTH_BASE, privateKey, 3600, scopes);
      dsClient.addDefaultHeader('Authorization', `Bearer ${results.body.access_token}`);

      const accountId = process.env.DOCUSIGN_ACCOUNT_ID;
      const tplId = process.env.DOCUSIGN_TEMPLATE_ID;
      const siteOrigin = (event.headers && (event.headers['x-forwarded-proto'] && event.headers['host'])) ? `${event.headers['x-forwarded-proto']}://${event.headers['host']}` : process.env.SITE_ORIGIN || '';
      const redirectUri = process.env.DOCUSIGN_REDIRECT_URI || (siteOrigin ? `${siteOrigin}/confirm.html#signed` : '');

      const body = JSON.parse(event.body || '{}');
      const {
        contractNo, inspectorName, vendorName, arrivalDate, inspectDate,
        items = [], resultText = '-', signerName, signerEmail,
        importerName, importerEmail
      } = body;

      const textTabs = [
        { tabLabel: 'CONTRACT_NO', value: contractNo || '-' },
        { tabLabel: 'INSPECTOR_NAME', value: inspectorName || '-' },
        { tabLabel: 'VENDOR_NAME', value: vendorName || '-' },
        { tabLabel: 'ARRIVAL_DATE', value: arrivalDate || '-' },
        { tabLabel: 'INSPECT_DATE', value: inspectDate || '-' },
        { tabLabel: 'RESULT', value: resultText || '-' },
      ];
      if (items.length) {
        const summary = items.map(i => `${i.name} | Dok:${i.docQty} | Fisik:${i.physQty} | Kondisi:${i.condition} | Cat:${i.note || '-'}`).join('\n');
        textTabs.push({ tabLabel: 'ITEMS_SUMMARY', value: summary });
      }

      const envDef = new docusign.EnvelopeDefinition();
      envDef.templateId = tplId;
      envDef.status = 'sent';
      envDef.emailSubject = `BAPB ${contractNo || ''}`;

      const roleSPO = {
        roleName: 'SPO',
        name: signerName,
        email: signerEmail,
        clientUserId: 'SPO-EMBEDDED',
        routingOrder: '1',
        tabs: { textTabs },
      };
      const roleImporter = importerEmail ? {
        roleName: 'Importer',
        name: importerName || 'Importer',
        email: importerEmail,
        routingOrder: '2',
      } : null;
      envDef.templateRoles = roleImporter ? [roleSPO, roleImporter] : [roleSPO];

      const envelopesApi = new docusign.EnvelopesApi(dsClient);
      const envelopeSummary = await envelopesApi.createEnvelope(accountId, { envelopeDefinition: envDef });
      const viewRequest = new docusign.RecipientViewRequest();
      viewRequest.returnUrl = redirectUri || 'https://www.docusign.com';
      viewRequest.authenticationMethod = 'none';
      viewRequest.email = signerEmail;
      viewRequest.userName = signerName;
      viewRequest.clientUserId = 'SPO-EMBEDDED';
      const view = await envelopesApi.createRecipientView(accountId, envelopeSummary.envelopeId, { recipientViewRequest: viewRequest });
      return json(200, { signingUrl: view.url, envelopeId: envelopeSummary.envelopeId });
    }

    // Not found
    return json(404, { error: 'Not Found' });
  } catch (e) {
    console.error('Function error', e);
    return json(500, { error: 'Server Error', details: e.message || String(e) });
  }
};