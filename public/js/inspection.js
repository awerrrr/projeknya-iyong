// Inspection form logic
(async function(){
  const user = window.Auth.requireAuth();
  const params = new URLSearchParams(location.search);
  const docId = params.get('id');
  const API_BASE = (window.APP_CONFIG && window.APP_CONFIG.localApiBaseUrl) || 'http://127.0.0.1:8081';
  // Admin tidak perlu mengisi pemeriksaan — langsung ke dokumen akhir
  if(user.role === 'admin'){
    if(docId){
      location.href = `/confirm.html?id=${encodeURIComponent(docId)}&review=1`;
    } else {
      location.href = '/dashboard.html';
    }
    return;
  }
  // PEMESAN tidak boleh membuka halaman pemeriksaan barang
  // Arahkan ke halaman konfirmasi dalam mode review
  if(user.role === 'pemesan'){
    if(docId){
      location.href = `/confirm.html?id=${encodeURIComponent(docId)}&review=1`;
    } else {
      location.href = '/dashboard.html';
    }
    return;
  }
  if(!docId){ alert('ID pengiriman tidak ditemukan.'); location.href='/dashboard.html'; return; }

  let docs = window.Storage.list();
  let doc = docs.find(d=>d.id===docId);
  // Fallback: jika tidak ditemukan lokal, coba ambil dari API dan buat entri minimal
  if(!doc){
    try{
      const resp = await fetch(`${API_BASE}/api/shipments`);
      const json = await resp.json();
      const remote = (json && json.data) || [];
      const rdoc = remote.find(r=> String(r.id) === String(docId));
      if(rdoc){
        doc = {
          id: String(rdoc.id),
          name: null,
          type: 'meta',
          size: 0,
          url: null,
          hash: null,
          meta: rdoc.meta || {},
          signatures: Array.isArray(rdoc.signatures)? rdoc.signatures : []
        };
        const ndocs = docs.concat([doc]);
        window.Storage.saveAll(ndocs);
        docs = ndocs;
      }
    }catch(_){ /* fallback gagal, lanjut alert */ }
  }
  if(!doc){ alert('Pengiriman tidak ditemukan.'); location.href='/dashboard.html'; return; }

  const inspectionKey = 'bapsa_inspections';
  function getInspections(){ try{ return JSON.parse(localStorage.getItem(inspectionKey))||{}; }catch{ return {}; } }
  function setInspections(data){ localStorage.setItem(inspectionKey, JSON.stringify(data)); }
  async function fetchInspection(){
    try{
      const resp = await fetch(`${API_BASE}/api/shipments/${encodeURIComponent(docId)}/inspection`);
      const json = await resp.json();
      return json && json.data || null;
    }catch(_){ return null; }
  }
  async function saveInspection(record){
    try{
      const resp = await fetch(`${API_BASE}/api/shipments/${encodeURIComponent(docId)}/inspection`,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(record)
      });
      await resp.json();
    }catch(e){ console.warn('Gagal simpan inspeksi ke API', e); }
  }

  // Ambil identitas petugas jika ada
  let petugasIdent = null;
  try{ petugasIdent = JSON.parse(localStorage.getItem('bapsa_identity_petugas')); }catch{ petugasIdent = null; }
  const inspectorName = petugasIdent?.name || (user.role === 'petugas' ? 'Petugas Gudang (SPO)' : user.role);
  const inspectorEmail = petugasIdent?.email || user.email;
  document.getElementById('contractNo').textContent = doc.meta.contract || '-';
  // Tampilkan hanya nama petugas pada field "Petugas Pemeriksa"
  document.getElementById('inspector').value = inspectorName;
  const inspectorEmailInput = document.getElementById('inspectorEmail');
  if(inspectorEmailInput) inspectorEmailInput.value = inspectorEmail;
  document.getElementById('inspectDate').value = new Date().toISOString().slice(0,10);


  const tbody = document.querySelector('#itemsTable tbody');
  function render(items){
    tbody.innerHTML = '';
    items.forEach((it,idx)=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input class="input" value="${it.name||''}" data-field="name" data-idx="${idx}" placeholder="Nama barang"/></td>
        <td><input class="input" type="number" min="0" value="${it.physQty||''}" data-field="physQty" data-idx="${idx}"/></td>
        <td>
          <select class="input" data-field="condition" data-idx="${idx}">
            <option ${it.condition==='Opsional'?'selected':''}>Opsional</option>
            <option ${it.condition==='Baik'?'selected':''}>Baik</option>
            <option ${it.condition==='Kurang'?'selected':''}>Kurang</option>
            <option ${it.condition==='Rusak'?'selected':''}>Rusak</option>
          </select>
        </td>
        <td><input class="input" value="${it.note||''}" data-field="note" data-idx="${idx}" placeholder="Catatan"/></td>
        <td><button class="btn" data-del="${idx}">Hapus</button></td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('[data-del]').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        const idx = parseInt(e.currentTarget.getAttribute('data-del'),10);
        items.splice(idx,1); render(items);
      });
    });
    tbody.querySelectorAll('[data-field]').forEach(inp=>{
      inp.addEventListener('input', (e)=>{
        const idx = parseInt(e.target.getAttribute('data-idx'),10);
        const field = e.target.getAttribute('data-field');
        items[idx][field] = e.target.value;
      });
    });
  }

  const inspections = getInspections();
  const initial = Object.assign({ items: [], notes: '' }, inspections[docId] || {});
  // Prefill dari API bila tersedia
  fetchInspection().then((data)=>{
    if(data){
      initial.inspectorName = data.inspectorName || initial.inspectorName;
      initial.inspectorEmail = data.inspectorEmail || initial.inspectorEmail;
      initial.items = Array.isArray(data.items) ? data.items : initial.items;
      initial.notes = data.note || initial.notes;
      render(initial.items);
      const notesEl = document.getElementById('notes');
      if(notesEl) notesEl.value = initial.notes || '';
    }
  });
  // Pastikan identitas pembuat tersimpan terpisah
  if(!initial.inspectorName) initial.inspectorName = inspectorName;
  if(!initial.inspectorEmail) initial.inspectorEmail = inspectorEmail;
  // Simpan nilai gabungan inspector sebagai nama saja, karena email punya kolom terpisah
  initial.inspector = initial.inspectorName;
  render(initial.items);
  document.getElementById('notes').value = initial.notes || '';

  document.getElementById('addItemBtn').addEventListener('click', ()=>{
    initial.items.push({ name:'', physQty:0, condition:'Opsional', note:'' });
    render(initial.items);
  });

  document.getElementById('saveDraft').addEventListener('click', ()=>{
    initial.notes = document.getElementById('notes').value;
    inspections[docId] = initial;
    setInspections(inspections);
    // Simpan ke API juga
    saveInspection({
      inspectorName: initial.inspectorName,
      inspectorEmail: initial.inspectorEmail,
      inspectDate: new Date().toISOString().slice(0,10),
      items: initial.items,
      note: initial.notes
    });
    alert('Draft pemeriksaan disimpan.');
  });

  document.getElementById('continueBtn').addEventListener('click', ()=>{
    initial.notes = document.getElementById('notes').value;
    inspections[docId] = initial;
    setInspections(inspections);
    // set status and go back
    doc.meta.status = 'BAPB Dibuka';
    window.Storage.saveAll(docs);
    // Simpan ke API dan update status
    saveInspection({
      inspectorName: initial.inspectorName,
      inspectorEmail: initial.inspectorEmail,
      inspectDate: new Date().toISOString().slice(0,10),
      items: initial.items,
      note: initial.notes
    });
    try{
      fetch(`${API_BASE}/api/shipments/${encodeURIComponent(docId)}`,{
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ meta: { status: 'BAPB Dibuka' } })
      });
    }catch{}
    alert('Pemeriksaan dicatat. Lanjut ke Konfirmasi BAPB.');
    location.href = `/confirm.html?id=${docId}`;
  });

  // Header user badge & logout agar konsisten
  try{
    const badgeEl = document.getElementById('userBadge');
    if(badgeEl){ badgeEl.textContent = `${user.name||user.email||user.role} • ${user.role}`; }
    const logoutBtn = document.getElementById('logoutBtn');
    if(logoutBtn){ logoutBtn.addEventListener('click', ()=>{ window.Auth.logout(); location.href='/index.html'; }); }
  }catch(e){ /* ignore minor header issues */ }
})();