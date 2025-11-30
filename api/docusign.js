const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const docusign = require('docusign-esign');
require('dotenv').config();

// Simple DocuSign API server for embedded signing
const app = express();
app.use(cors());
app.use(bodyParser.json());

const dsClient = new docusign.ApiClient();
const BASE_PATH = (process.env.DOCUSIGN_ENV === 'demo' ? 'https://demo.docusign.net/restapi' : 'https://www.docusign.net/restapi');
dsClient.setBasePath(BASE_PATH);
dsClient.setOAuthBasePath('account-d.docusign.com'); // sandbox

async function getJWT() {
  const results = await dsClient.requestJWTUserToken(
    process.env.DOCUSIGN_INTEGRATION_KEY,
    process.env.DOCUSIGN_USER_ID,
    'account-d.docusign.com',
    Buffer.from(process.env.DOCUSIGN_PRIVATE_KEY || '', 'base64'),
    3600,
    ['signature','impersonation']
  );
  const accessToken = results.body.access_token;
  dsClient.addDefaultHeader('Authorization', 'Bearer ' + accessToken);
  return accessToken;
}

// Start embedded signing for SPO and route to Importer by email afterwards
app.post('/api/docusign/start', async (req, res) => {
  try {
    await getJWT();
    const accountId = process.env.DOCUSIGN_ACCOUNT_ID;

    const {
      contractNo, inspectorName, vendorName, arrivalDate, inspectDate,
      items = [], resultText = '-', signerName, signerEmail,
      importerName, importerEmail
    } = req.body;

    const textTabs = [
      { tabLabel: 'CONTRACT_NO', value: contractNo || '-' },
      { tabLabel: 'INSPECTOR_NAME', value: inspectorName || '-' },
      { tabLabel: 'VENDOR_NAME', value: vendorName || '-' },
      { tabLabel: 'ARRIVAL_DATE', value: arrivalDate || '-' },
      { tabLabel: 'INSPECT_DATE', value: inspectDate || '-' },
      { tabLabel: 'RESULT', value: resultText || '-' }
    ];

    if (items.length) {
      const summary = items.map(i => `${i.name} | Dok:${i.docQty} | Fisik:${i.physQty} | Kondisi:${i.condition} | Cat:${i.note || '-'}`).join('\n');
      textTabs.push({ tabLabel: 'ITEMS_SUMMARY', value: summary });
    }

    const envDef = new docusign.EnvelopeDefinition();
    envDef.templateId = process.env.DOCUSIGN_TEMPLATE_ID;
    envDef.status = 'sent';
    envDef.emailSubject = `BAPB ${contractNo || ''}`;

    // Recipient 1: SPO (embedded)
    const roleSPO = {
      roleName: 'SPO',
      name: signerName,
      email: signerEmail,
      clientUserId: 'SPO-EMBEDDED',
      routingOrder: '1',
      tabs: { textTabs }
    };
    // Recipient 2: Importer (email)
    const roleImporter = importerEmail ? {
      roleName: 'Importer',
      name: importerName || 'Importer',
      email: importerEmail,
      routingOrder: '2'
    } : null;

    envDef.templateRoles = roleImporter ? [roleSPO, roleImporter] : [roleSPO];

    const envelopesApi = new docusign.EnvelopesApi(dsClient);
    const envelopeSummary = await envelopesApi.createEnvelope(accountId, { envelopeDefinition: envDef });

    const viewRequest = new docusign.RecipientViewRequest();
    viewRequest.returnUrl = process.env.DOCUSIGN_REDIRECT_URI || 'http://127.0.0.1:8081/confirm.html#signed';
    viewRequest.authenticationMethod = 'none';
    viewRequest.email = signerEmail;
    viewRequest.userName = signerName;
    viewRequest.clientUserId = 'SPO-EMBEDDED';

    const view = await envelopesApi.createRecipientView(accountId, envelopeSummary.envelopeId, { recipientViewRequest: viewRequest });
    res.json({ signingUrl: view.url, envelopeId: envelopeSummary.envelopeId });
  } catch (e) {
    console.error('DocuSign error', e);
    res.status(500).json({ error: 'DocuSign error', details: e?.message || 'Unknown error' });
  }
});

const PORT = process.env.DOCUSIGN_PORT || 3001;
app.listen(PORT, () => console.log(`DocuSign API server listening on http://localhost:${PORT}`));