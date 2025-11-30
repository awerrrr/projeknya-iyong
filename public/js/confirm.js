/* confirm.js — FULL Supabase integration
   Assumptions:
   - supabase.js (client) is loaded and provides `supabase`
   - signature.js (DigitalSignature) exists for local signing
   - APP_CONFIG remains available for DocuSign serverless start if used
   - Supabase storage bucket: 'documents' (public)
*/

(async function(){
  const params = new URLSearchParams(location.search);
  const docId = params.get('id');
  const mock = params.get('mock');
  const contractNoEl = document.getElementById('contractNo');
  const inspectorNameEl = document.getElementById('inspectorName');
  const inspectorEmailEl = document.getElementById('inspectorEmail');
  const importerEmailEl = document.getElementById('importerEmail');
  const arrivalDateEl = document.getElementById('arrivalDate');
  const vendorNameEl = document.getElementById('vendorName');
  const inspectDateEl = document.getElementById('inspectDate');
  const resultTableBody = document.querySelector('#resultTable tbody');
  const resultBadgeEl = document.getElementById('resultBadge');
  const sigOfficerEl = document.getElementById('sigOfficer');
  const sigImporterEl = document.getElementById('sigImporter');
  const applySignatureBtn = document.getElementById('applySignature');
  const submitApprovalBtn = document.getElementById('submitApproval');
  const backBtn = document.getElementById('backBtn');
  const printBtn = document.getElementById('printBtn');
  const statusPillEl = document.getElementById('statusPill');
  const reviewDateEl = document.getElementById('reviewDate');
  const pageTitleBapbEl = document.getElementById('pageTitleBapb');
  const rejectPanel = document.getElementById('rejectPanel');
  const rejectBtnMain = document.getElementById('rejectBtnMain');
  const approveFinishBtnMain = document.getElementById('approveFinishBtnMain');
  const approvalSection = document.getElementById('approvalSection');
  const actionButtonsRow = document.getElementById('actionButtonsRow');

  if(!docId){
    alert('Parameter id tidak ditemukan.');
    window.location.href = '/index.html';
    return;
  }

  // helper to fetch shipment from Supabase
  async function loadShipment(id){
    const { data, error } = await supabase
      .from('shipments')
      .select('*')
      .eq('id', id)
      .single();

    if(error){
      console.error('Gagal mengambil shipment:', error);
      return null;
    }
    return data;
  }

  // helper to fetch inspection(s) for shipment
  async function loadInspectionForShipment(id){
    const { data, error } = await supabase
      .from('inspections')
      .select('*')
      .eq('shipment_id', id)
      .order('inspect_date', { ascending: false })
      .limit(1);

    if(error){
      console.warn('Gagal mengambil inspection:', error);
      return null;
    }
    return (data && data[0]) || null;
  }

  // upload manual signed file to Supabase Storage and record meta object
  async function uploadManualSignedFile(file){
    const timestamp = Date.now();
    // create a safe path
    const safeName = file.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-\.]/g,'');
    const path = `manual_signed/${docId}_${timestamp}_${safeName}`;
    // upload
    const { error: upErr } = await supabase.storage
      .from('documents')
      .upload(path, file, { upsert: true });

    if(upErr){
      console.error('Gagal upload file ke Storage:', upErr);
      throw upErr;
    }

    // get public url
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(path);

    return {
      id: path,
      name: file.name,
      url: urlData.publicUrl,
      uploadedAt: new Date().toISOString()
    };
  }

  // update shipment meta (partial)
  async function updateShipmentFields(id, fields){
    const { data, error } = await supabase
      .from('shipments')
      .update(fields)
      .eq('id', id)
      .select()
      .single();

    if(error){
      console.error('Gagal update shipment:', error);
      throw error;
    }
    return data;
  }

  // append signature object to shipment.signatures (jsonb array)
  async function appendSignatureToShipment(id, sigObj){
    // read current signatures
    const { data: curData, error: fetchErr } = await supabase
      .from('shipments')
      .select('signatures')
      .eq('id', id)
      .single();

    if(fetchErr){
      console.error('Gagal membaca signatures:', fetchErr);
      throw fetchErr;
    }

    const cur = (curData && curData.signatures) || [];
    const next = Array.isArray(cur) ? cur.concat([sigObj]) : [sigObj];

    const { error: upErr } = await supabase
      .from('shipments')
      .update({ signatures: next })
      .eq('id', id);

    if(upErr){
      console.error('Gagal menyimpan signature ke shipment:', upErr);
      throw upErr;
    }
    return true;
  }

  // compute canonical bapb hash (same logic as earlier)
  async function computeBapbHash(payload){
    const text = JSON.stringify(payload);
    const enc = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', enc);
    const arr = Array.from(new Uint8Array(digest));
    return arr.map(b => b.toString(16).padStart(2,'0')).join('');
  }

  // UI render
  let shipment = await loadShipment(docId);
  // If missing and mock requested, create a minimal display
  if(!shipment && mock){
    shipment = { id: docId, meta: { contract: 'KTR-001', vendor: 'Importer Ayo', arrivalDate: new Date().toISOString().slice(0,10), status: 'Barang Tiba' }, signatures: [], files: [] };
  }
  if(!shipment){
    alert('Data shipment tidak ditemukan di server.');
    window.location.href = '/index.html';
    return;
  }

  let inspection = await loadInspectionForShipment(docId);
  if(!inspection){
    // fallback empty inspection structure
    inspection = { inspector_name: '-', inspector_email: '-', inspect_date: null, items: [], note: '' };
  }

  function fmtDateIso(d){
    if(!d) return '-';
    try{ return new Date(d).toISOString().slice(0,10); }catch{ return d; }
  }
  function fmtDateId(d){
    if(!d) return '-';
    try{ return new Date(d).toLocaleDateString('id-ID'); }catch{ return d; }
  }

  function render(){
    const meta = shipment.meta || {};
    contractNoEl.textContent = meta.contract || '-';
    inspectorNameEl.textContent = inspection.inspector_name || '-';
    if(inspectorEmailEl) inspectorEmailEl.textContent = inspection.inspector_email || '-';
    importerEmailEl && (importerEmailEl.textContent = meta.importerEmail || '-');
    arrivalDateEl.textContent = fmtDateIso(meta.arrivalDate || meta.arrival_date || meta.arrivalDate);
    vendorNameEl.textContent = meta.vendor || '-';
    inspectDateEl.textContent = fmtDateIso(inspection.inspect_date || inspection.inspectDate) || fmtDateId(Date.now());

    const bapbNo = (meta.bapbNo || meta.bapb_no || meta.bapb_no) || `BAPB-${String(docId).split('_').pop()}`;
    if(pageTitleBapbEl) pageTitleBapbEl.textContent = bapbNo;
    const st = (meta.status || 'Menunggu Persetujuan');
    if(statusPillEl) statusPillEl.textContent = st, statusPillEl.className = `badge ${st==='Menunggu Persetujuan'?'warning':st==='Sudah Ditandatangani'?'success':'muted'}`;

    // table items
    resultTableBody.innerHTML = '';
    let allOk = true;
    const items = inspection.items || [];
    items.forEach(it=>{
      const tr = document.createElement('tr');
      const cond = it.condition || 'Baik';
      if(cond !== 'Baik') allOk = false;
      tr.innerHTML = `<td>${it.name||'-'}</td><td style="text-align:right">${it.physQty ?? '-'}</td><td>${cond}</td><td>${it.note||'-'}</td>`;
      resultTableBody.appendChild(tr);
    });
    resultBadgeEl.textContent = allOk ? 'Sesuai' : 'Tidak Sesuai';
    resultBadgeEl.className = `badge ${allOk ? 'success' : 'warning'}`;

    // signature summary
    try{
      const officerSigned = Array.isArray(shipment.signatures) && shipment.signatures.length>0;
      if(sigOfficerEl){
        sigOfficerEl.innerHTML = officerSigned ? '<span style="font-weight:600;text-decoration:underline">Petugas Gudang (SPO)</span><br/><span class="muted">Ditandatangani secara digital</span>' : '<span style="font-weight:600;text-decoration:underline">Petugas Gudang (SPO)</span><br/><span class="muted"><em>(Belum Ditandatangani)</em></span>';
      }
      const importerSigned = (shipment.meta && (shipment.meta.status==='Disetujui' || shipment.meta.status==='Selesai')) || false;
      if(sigImporterEl){
        sigImporterEl.innerHTML = importerSigned ? '<span style="font-weight:600">Pihak Pemesan</span><br/><span class="muted">Ditandatangani secara digital</span>' : '<em>(Belum Ditandatangani)</em>';
      }
    }catch(e){ console.warn(e); }
  }

  render();

  // Upload handler for manualSigned file injection (for pemesan)
  (function injectManualUpload(){
    // Only inject if approvalSection exists (like original) — but we will wire event to storage directly
    if(!approvalSection) return;
    // Create upload input if not present
    let uploadInput = document.getElementById('manualSignedUpload');
    let uploadStatus = document.getElementById('manualSignedStatus');
    if(!uploadInput){
      const uploadLabel = document.createElement('div');
      uploadLabel.className = 'label small';
      uploadLabel.textContent = 'Upload BAPB bertanda tangan (PDF/Foto)';
      uploadInput = document.createElement('input');
      uploadInput.type = 'file';
      uploadInput.id = 'manualSignedUpload';
      uploadInput.accept = 'application/pdf,image/*';
      uploadInput.className = 'input';
      uploadInput.style.marginTop = '8px';
      uploadStatus = document.createElement('div');
      uploadStatus.id = 'manualSignedStatus';
      uploadStatus.className = 'muted small';
      uploadStatus.textContent = shipment?.meta?.manual_signed_name || shipment?.meta?.manual_signedName || 'Belum diunggah';

      approvalSection.appendChild(uploadLabel);
      approvalSection.appendChild(uploadInput);
      approvalSection.appendChild(uploadStatus);
    }

    uploadInput.addEventListener('change', async (e)=>{
      const file = e.target.files && e.target.files[0];
      if(!file) return;
      try{
        uploadStatus.textContent = 'Mengunggah...';
        const docMeta = await uploadManualSignedFile(file); // {id, name, url}
        // Save meta to shipment fields: manual_signed_id, manual_signed_name, files (append)
        const newFiles = Array.isArray(shipment.files) ? shipment.files.slice() : (shipment.files || []);
        newFiles.push({ id: docMeta.id, name: docMeta.name, url: docMeta.url, uploadedAt: docMeta.uploadedAt });

        shipment = await updateShipmentFields(docId, {
          manual_signed_id: docMeta.id,
          manual_signed_name: docMeta.name,
          files: newFiles
        });

        uploadStatus.textContent = `Diunggah: ${docMeta.name}`;
        if(statusPillEl){ statusPillEl.textContent = shipment.meta?.status || statusPillEl.textContent; }
        alert('File berhasil diunggah dan tersimpan di server.');
      }catch(err){
        console.error(err);
        uploadStatus.textContent = 'Gagal mengunggah';
        alert('Gagal mengunggah dokumen. Cek console.');
      }
    });
  })();

  // Apply local digital signature (uses DigitalSignature.signDocument)
  async function applyLocalSignature(){
    try{
      // Build canonical payload for hash
      const payload = {
        docId,
        contractNo: shipment.meta?.contract || '',
        vendor: shipment.meta?.vendor || '',
        arrivalDate: fmtDateIso(shipment.meta?.arrivalDate || shipment.meta?.arrival_date),
        inspector: inspection.inspector_name || '',
        inspectorEmail: inspection.inspector_email || '',
        inspectDate: fmtDateIso(inspection.inspect_date),
        items: (inspection.items || []).map(it=>({
          name: it.name || '',
          physQty: Number(it.physQty || 0),
          condition: it.condition || 'Baik',
          note: it.note || ''
        })),
        result: resultBadgeEl ? resultBadgeEl.textContent : ''
      };
      const hash = await computeBapbHash(payload);
      // Use DigitalSignature to sign
      if(!window.DigitalSignature) throw new Error('DigitalSignature module tidak ditemukan.');
      const signatureObj = await window.DigitalSignature.signDocument((window.Auth && window.Auth.currentUser && window.Auth.currentUser()?.email) || (sessionStorage.getItem('bapsa_session') ? JSON.parse(sessionStorage.getItem('bapsa_session')).email : 'unknown'), { hash });
      signatureObj.hash = hash;
      signatureObj.createdAt = signatureObj.createdAt || Date.now();
      // append to shipment.signatures in Supabase
      await appendSignatureToShipment(docId, signatureObj);
      // reload shipment
      shipment = await loadShipment(docId);
      render();
      alert('Dokumen berhasil ditandatangani secara digital (lokal).');
    }catch(err){
      console.error('Gagal sign lokal:', err);
      alert('Gagal melakukan tanda tangan digital lokal. Cek console.');
    }
  }

  // Start DocuSign embedded flow (keep existing server approach if present)
  async function startDocuSignEmbedded(){
    try{
      const items = (inspection.items || []).map(it=>({ name: it.name||'', physQty: Number(it.physQty||0), condition: it.condition||'Baik', note: it.note||'' }));
      const payload = {
        contractNo: shipment.meta?.contract || '-',
        inspectorName: inspection.inspector_name || '-',
        vendorName: shipment.meta?.vendor || '-',
        arrivalDate: fmtDateIso(shipment.meta?.arrivalDate || shipment.meta?.arrival_date || ''),
        inspectDate: fmtDateIso(inspection.inspect_date || ''),
        resultText: resultBadgeEl ? resultBadgeEl.textContent : '',
        items,
        signerName: (window.Auth && window.Auth.currentUser && window.Auth.currentUser()?.email) || 'spo@example.com',
        signerEmail: (window.Auth && window.Auth.currentUser && window.Auth.currentUser()?.email) || 'spo@example.com',
        importerName: 'Pihak Pemesan',
        importerEmail: shipment.meta?.importerEmail || ''
      };
      const resp = await fetch(`${APP_CONFIG.apiBaseUrl}/api/docusign/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await resp.json();
      if(json?.signingUrl){
        window.location.href = json.signingUrl;
      } else {
        throw new Error(json?.error || 'No signingUrl returned');
      }
    }catch(err){
      console.error('Gagal memulai DocuSign:', err);
      alert('Gagal memulai DocuSign. Cek server.');
    }
  }

  // Submit approval: set status -> Menunggu Persetujuan (and set bapb_no)
  async function submitApproval(){
    try{
      const bapbNo = shipment.meta?.bapbNo || shipment.meta?.bapb_no || `BAPB-${Math.floor(Math.random()*9000+1000)}`;
      shipment = await updateShipmentFields(docId, { status: 'Menunggu Persetujuan', bapb_no: bapbNo, bapbNo });
      render();
      alert('BAPB disimpan dan diajukan untuk persetujuan.');
      window.location.href = '/index.html';
    }catch(err){
      console.error('Gagal submit approval:', err);
      alert('Gagal mengajukan persetujuan. Cek console.');
    }
  }

  // Reject handler for pemesan (store rejectReason)
  async function rejectDocument(reason){
    try{
      shipment = await updateShipmentFields(docId, { status: 'Ditolak', rejectReason: reason });
      render();
      alert('Dokumen ditolak dan alasan disimpan.');
    }catch(err){
      console.error('Gagal tolak dokumen:', err);
      alert('Gagal menolak dokumen. Cek console.');
    }
  }

  // Wire up UI actions
  if(applySignatureBtn){
    // Prefer DocuSign if server exists; keep local signature button accessible via SHIFT-click
    applySignatureBtn.addEventListener('click', (e)=>{
      if(e.shiftKey){
        applyLocalSignature();
      } else {
        startDocuSignEmbedded();
      }
    });
  }
  if(submitApprovalBtn) submitApprovalBtn.addEventListener('click', submitApproval);
  if(backBtn) backBtn.addEventListener('click', (ev)=>{ ev.preventDefault(); window.location.href = `/inspection.html?id=${docId}`; });
  if(printBtn) printBtn.addEventListener('click', ()=>window.print());

  // Reject & approveFinish interactions for pemesan/admin roles (use DOM elements if present)
  if(rejectBtnMain){
    rejectBtnMain.addEventListener('click', ()=>{
      const reasonEl = document.getElementById('rejectReason');
      const reason = (reasonEl?.value||'').trim();
      if(!reason){ alert('Harap isi alasan penolakan dokumen.'); if(reasonEl) reasonEl.focus(); return; }
      rejectDocument(reason);
    });
  }
  if(approveFinishBtnMain){
    approveFinishBtnMain.addEventListener('click', async ()=>{
      // require manualSignedId present
      if(!(shipment?.manual_signed_id || shipment?.meta?.manual_signed_id || shipment?.meta?.manualSignedId)){
        alert('Harap upload dokumen BAPB yang telah ditandatangani secara manual sebelum menyetujui.');
        const upEl = document.getElementById('manualSignedUpload');
        if(upEl) upEl.focus();
        return;
      }
      await updateShipmentFields(docId, { status: 'Disetujui' });
      alert('Dokumen disetujui.');
      render();
    });
  }

  // If redirected back from DocuSign with #signed, mark status
  if(location.hash === '#signed'){
    try{
      await updateShipmentFields(docId, { status: 'Menunggu Persetujuan', bapb_no: shipment.meta?.bapbNo || `BAPB-${Math.floor(Math.random()*9000+1000)}` });
      shipment = await loadShipment(docId);
      render();
      applySignatureBtn.disabled = true;
      applySignatureBtn.textContent = 'Diajukan untuk Persetujuan';
    }catch(e){ console.warn(e); }
  }

})();
