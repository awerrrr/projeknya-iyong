// dashboard.js (Supabase-native version)
// Menggantikan penggunaan window.Storage lama — semua operasi pakai Supabase
(async function(){
  // Pastikan supabase tersedia
  if(typeof supabase === 'undefined'){
    console.error('Supabase client tidak ditemukan. Pastikan supabase.js dimuat sebelum dashboard.js');
    return;
  }

  const user = window.Auth.requireAuth();
  const userBadge = document.getElementById('userBadge');
  const identKey = `bapsa_identity_${user.role}`;
  let identity = null;
  try{ identity = JSON.parse(localStorage.getItem(identKey)); }catch{ identity = null; }
  if((user.role==='petugas' || user.role==='pemesan') && !identity){
    location.href = '/identity.html';
    return;
  }
  userBadge.textContent = identity ? `${identity.name} • ${user.role}` : `${user.email} • ${user.role}`;

  // DOM references
  const widgets = document.querySelector('.widgets');
  const table = document.getElementById('shipmentsTable');
  const tableHead = table.querySelector('thead tr');
  const tableBody = table.querySelector('tbody');
  const adminSearchWrap = document.getElementById('adminSearchWrap');
  const adminSearchInput = document.getElementById('adminSearch');
  const uploadDialog = document.getElementById('uploadDialog');
  const addShipmentBtn = document.getElementById('addShipmentBtn');

  // Helper: fetch shipments from Supabase
  async function fetchShipmentsFromDb(){
    const { data, error } = await supabase
      .from('shipments')
      .select('*')
      .order('created_at', { ascending: false });
    if(error){ console.error('fetchShipments error', error); return []; }
    return data || [];
  }

  // Helper: fetch latest inspection per shipment (map by shipment_id)
  async function fetchInspectionsMap(){
    const { data, error } = await supabase
      .from('inspections')
      .select('*')
      .order('inspect_date', { ascending: false });
    if(error){ console.warn('fetchInspectionsMap error', error); return new Map(); }
    const map = new Map();
    (data || []).forEach(i=>{
      const sid = String(i.shipment_id);
      if(!map.has(sid)) map.set(sid, i);
    });
    return map;
  }

  // Helper: append signature to shipment.signatures
  async function appendSignatureToShipment(id, sigObj){
    const { data, error: fetchErr } = await supabase
      .from('shipments')
      .select('signatures')
      .eq('id', id)
      .single();
    if(fetchErr){ console.error('read signatures failed', fetchErr); throw fetchErr; }
    const cur = (data && data.signatures) || [];
    const next = Array.isArray(cur) ? cur.concat([sigObj]) : [sigObj];
    const { error: upErr } = await supabase
      .from('shipments')
      .update({ signatures: next })
      .eq('id', id);
    if(upErr){ console.error('append signature failed', upErr); throw upErr; }
    return true;
  }

  // Helper: create shipment in DB
  async function createShipmentInDb(obj){
    const id = obj.id || `doc_${Date.now()}`;
    const payload = Object.assign({ id, created_at: new Date().toISOString() }, obj);
    const { data, error } = await supabase
      .from('shipments')
      .insert([payload]);
    if(error){ console.error('createShipmentInDb error', error); throw error; }
    return data && data[0];
  }

  // Helper: delete shipment in DB
  async function deleteShipmentInDb(id){
    const { error } = await supabase
      .from('shipments')
      .delete()
      .eq('id', id);
    if(error){ console.error('deleteShipmentInDb error', error); throw error; }
    return true;
  }

  // Render main view depending on role
  async function render(){
    const shipments = await fetchShipmentsFromDb();
    const insMap = await fetchInspectionsMap();
    // use shipments array as docs
    const docs = shipments.map(s=> {
      return {
        id: String(s.id),
        meta: s,
        signatures: s.signatures || [],
        files: s.files || []
      };
    });

    // Pemesan view
    if(user.role === 'pemesan'){
      tableHead.innerHTML = `
        <th>NO BAPB</th>
        <th>KONTRAK</th>
        <th>VENDOR</th>
        <th>PETUGAS</th>
        <th>STATUS</th>
        <th>AKSI</th>
      `;
      tableBody.innerHTML = '';
      const waiting = docs.filter(d=> {
        const st = (d.meta||{}).status;
        return st === 'Menunggu Persetujuan' || (d.signatures && d.signatures.length>0);
      });
      waiting.forEach(doc=>{
        const bapbNo = (doc.meta && (doc.meta.bapbNo || doc.meta.bapb_no)) || `BAPB-${doc.id.split('_').pop()}`;
        const petugas = (insMap.get(String(doc.id))?.inspector_name) || 'Petugas Gudang (SPO)';
        const tr = document.createElement('tr');
        const statusText = (doc.meta && doc.meta.status) || 'Menunggu Persetujuan';
        tr.innerHTML = `
          <td>${bapbNo}</td>
          <td>${doc.meta.contract || '-'}</td>
          <td>${doc.meta.vendor || '-'}</td>
          <td>${petugas}</td>
          <td><span class="status inspected">${statusText}</span></td>
          <td><button class="link" data-review="${doc.id}">Review</button></td>
        `;
        tableBody.appendChild(tr);
      });
      tableBody.querySelectorAll('[data-review]').forEach(btn=>{
        btn.addEventListener('click',(e)=>{
          const id = e.currentTarget.getAttribute('data-review');
          location.href = `/confirm.html?id=${encodeURIComponent(id)}&review=1`;
        });
      });
      return;
    }

    // Admin view
    if(user.role === 'admin'){
      if(adminSearchWrap) adminSearchWrap.style.display = 'flex';
      tableHead.innerHTML = `
        <th>NO BAPB</th>
        <th>KONTRAK</th>
        <th>VENDOR</th>
        <th>STATUS</th>
        <th>AKSI</th>
        <th>HAPUS</th>
      `;
      tableBody.innerHTML = '';
      const term = (adminSearchInput && adminSearchInput.value || '').trim().toLowerCase();
      const filtered = docs.filter(d => (d.meta && (d.meta.contract||'')).toLowerCase().includes(term));
      filtered.forEach(doc=>{
        const bapbNo = (doc.meta && (doc.meta.bapbNo || doc.meta.bapb_no)) || `BAPB-${doc.id.split('_').pop()}`;
        const statusText = (doc.meta && doc.meta.status) || (doc.signatures?.length>0 ? 'Sudah Ditandatangani' : 'Barang Tiba');
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${bapbNo}</td>
          <td>${doc.meta.contract || '-'}</td>
          <td>${doc.meta.vendor || '-'}</td>
          <td><span class="status inspected">${statusText}</span></td>
          <td><button class="link" data-review="${doc.id}">Review</button></td>
          <td><button class="btn danger" data-delete="${doc.id}">Hapus</button></td>
        `;
        tableBody.appendChild(tr);
      });
      tableBody.querySelectorAll('[data-review]').forEach(btn=>{
        btn.addEventListener('click',(e)=>{
          const id = e.currentTarget.getAttribute('data-review');
          location.href = `/confirm.html?id=${encodeURIComponent(id)}&review=1`;
        });
      });
      tableBody.querySelectorAll('[data-delete]').forEach(btn=>{
        btn.addEventListener('click', async (e)=>{
          const id = e.currentTarget.getAttribute('data-delete');
          const ok = confirm('Yakin ingin menghapus data ini beserta data terkait untuk pemesan dan petugas?');
          if(!ok) return;
          try{
            await deleteShipmentInDb(id);
          }catch(err){ console.warn('delete error, continuing', err); }
          alert('Data berhasil dihapus.');
          await render();
        });
      });
      return;
    }

    // Petugas view (default)
    document.getElementById('statMasuk').textContent = docs.length.toString();
    document.getElementById('statPersetujuan').textContent = docs.filter(d=> (d.meta||{}).status==='Menunggu Persetujuan').length.toString();
    document.getElementById('statBuka').textContent = docs.filter(d=> (d.meta||{}).status==='BAPB Dibuka').length.toString();

    tableHead.innerHTML = `
      <th>No.Kontrak</th>
      <th>Vendor</th>
      <th>Tanggal Tiba</th>
      <th>Status</th>
      <th>Aksi</th>
    `;
    tableBody.innerHTML = '';
    docs.forEach((doc)=>{
      const statusText = (doc.meta && doc.meta.status) || (doc.signatures && doc.signatures.length>0 ? 'Sudah Ditandatangani' : 'Barang Tiba');
      const statusClass = statusText === 'Barang Tiba' ? 'arrived' : 'inspected';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${doc.meta.contract || '-'}</td>
        <td>${doc.meta.vendor || '-'}</td>
        <td>${doc.meta.arrivalDate || doc.meta.arrival_date || '-'}</td>
        <td><span class="status ${statusClass}">${statusText}</span></td>
        <td><button class="btn" data-inspect="${doc.id}">Periksa Barang</button></td>
      `;
      tableBody.appendChild(tr);
    });

    // bind actions
    tableBody.querySelectorAll('[data-inspect]').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        const id = e.currentTarget.getAttribute('data-inspect');
        location.href = `/inspection.html?id=${encodeURIComponent(id)}`;
      });
    });
  } // end render

  // Wire admin search input
  if(adminSearchInput){
    adminSearchInput.addEventListener('input', render);
  }

  // Hook up add shipment if petugas
  if(user.role === 'petugas' && addShipmentBtn && uploadDialog){
    addShipmentBtn.addEventListener('click', () => uploadDialog.showModal());
    document.getElementById('cancelUpload').addEventListener('click', () => uploadDialog.close());
    document.getElementById('uploadForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const meta = {
        id: `doc_${Date.now()}`,
        contract: document.getElementById('upContract').value.trim(),
        vendor: document.getElementById('upVendor').value.trim(),
        arrival_date: document.getElementById('upDate').value,
        status: 'Barang Tiba',
        geo: null,
        signatures: [],
        files: []
      };
      try{
        await createShipmentInDb(meta);
        uploadDialog.close();
        await render();
        alert('Shipment berhasil dibuat.');
      }catch(err){
        console.error(err);
        alert('Gagal membuat shipment. Cek console.');
      }
    });
  } else {
    if(widgets) widgets.style.display = 'none';
    if(uploadDialog) uploadDialog.remove();
  }

  // initial render
  await render();

  // add sync and export buttons
  function addSyncBtn(container){
    if(!container) return;
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.id = 'syncNowBtn';
    btn.textContent = 'Sinkron sekarang';
    btn.style.marginLeft = '8px';
    btn.addEventListener('click', async ()=>{ await render(); });
    container.appendChild(btn);
  }
  if(user.role==='petugas' && widgets){ addSyncBtn(widgets); }
  if(user.role==='admin' && adminSearchWrap){ addSyncBtn(adminSearchWrap); }

  function addExportBtn(container){
    if(!container) return;
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.id = 'exportCsvBtn';
    btn.textContent = 'Ekspor CSV';
    btn.style.marginLeft = '8px';
    btn.addEventListener('click', ()=>{
      const headers = Array.from(tableHead.querySelectorAll('th')).map(th=> th.textContent.trim());
      const rows = Array.from(tableBody.querySelectorAll('tr'));
      const lines = [headers.join(',')];
      rows.forEach(tr=>{
        const cells = Array.from(tr.querySelectorAll('td')).map(td=>{
          const text = td.textContent.trim().replace(/\s+/g,' ');
          return /[",]/.test(text) ? `"${text.replace(/\"/g,'""')}"` : text;
        });
        lines.push(cells.join(','));
      });
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'dashboard.csv';
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      a.remove();
    });
    container.appendChild(btn);
  }
  if(user.role==='admin' && adminSearchWrap){ addExportBtn(adminSearchWrap); }

  // add admin ACC link
  if(user.role==='admin'){
    try{
      const arsipLink = document.querySelector('a[href="/arsip.html"]');
      if(arsipLink && arsipLink.parentNode){
        const accLink = document.createElement('a');
        accLink.className = 'crumb-link';
        accLink.href = '/acc.html';
        accLink.textContent = 'Dokumen ACC';
        arsipLink.parentNode.insertBefore(accLink, arsipLink.nextSibling);
      }
    }catch(e){ console.warn('sisip acc link failed', e); }
  }

})();
