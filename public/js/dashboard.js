// Dashboard logic: list, upload, sign, verify
 (function(){
 const user = window.Auth.requireAuth();
  const API_BASE = (window.APP_CONFIG && window.APP_CONFIG.localApiBaseUrl) || 'http://127.0.0.1:8081';
  let remoteDocs = null; // daftar shipments dari API
  const userBadge = document.getElementById('userBadge');
  const identKey = `bapsa_identity_${user.role}`;
  let identity = null;
  try{ identity = JSON.parse(localStorage.getItem(identKey)); }catch{ identity = null; }
  // Wajib identitas untuk petugas/pemesan
  if((user.role==='petugas' || user.role==='pemesan') && !identity){
    location.href = '/identity.html';
    return;
  }
  const badgeText = identity ? `${identity.name} • ${user.role}` : `${user.email} • ${user.role}`;
  userBadge.textContent = badgeText;

  document.getElementById('logoutBtn').addEventListener('click', () => {
    window.Auth.logout();
    location.href = '/index.html';
  });

  const widgets = document.querySelector('.widgets');
  const table = document.getElementById('shipmentsTable');
  const tableHead = table.querySelector('thead tr');
  const tableBody = table.querySelector('tbody');
  const adminSearchWrap = document.getElementById('adminSearchWrap');
  const adminSearchInput = document.getElementById('adminSearch');
  const uploadDialog = document.getElementById('uploadDialog');
  const addShipmentBtn = document.getElementById('addShipmentBtn');

  // Petugas: dapat menambah pengiriman
  if(user.role === 'petugas'){
    addShipmentBtn.addEventListener('click', () => uploadDialog.showModal());
    document.getElementById('cancelUpload').addEventListener('click', () => uploadDialog.close());
    document.getElementById('uploadForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const meta = {
        contract: document.getElementById('upContract').value.trim(),
        vendor: document.getElementById('upVendor').value.trim(),
        arrivalDate: document.getElementById('upDate').value,
        status: 'Barang Tiba',
        geo: null
      };
      const created = await window.Storage.createMeta({ meta });
      // Sinkron ke API (best-effort, fallback tetap lokal)
      try{
        await fetch(`${API_BASE}/api/shipments`,{
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ id: created.id, meta })
        });
      }catch(_){ /* abaikan kegagalan, tetap lanjut render dari lokal */ }
      render();
      uploadDialog.close();
    });
  } else {
    // Pemesan/Admin: sembunyikan dialog tambah
    if(widgets) widgets.style.display = 'none';
    if(uploadDialog) uploadDialog.remove();
  }

  async function fetchShipments(){
    try{
      const resp = await fetch(`${API_BASE}/api/shipments`);
      const json = await resp.json();
      remoteDocs = (json && json.data) || [];
    }catch(_){ remoteDocs = null; }
  }

  function mergeDocs(){
    const locals = (window.Storage.list() || []).slice();
    if(!remoteDocs || !Array.isArray(remoteDocs)) return locals;
    const byId = new Map(locals.map(d=>[String(d.id), d]));
    remoteDocs.forEach(r=>{
      const id = String(r.id);
      const local = byId.get(id);
      if(local){
        // Overlay meta & signatures dari API ke lokal
        local.meta = Object.assign({}, local.meta||{}, r.meta||{});
        if(Array.isArray(r.signatures)) local.signatures = r.signatures;
      } else {
        // Tambahkan entri baru dari API dengan bentuk lokal minimal
        locals.push({
          id,
          name: null,
          type: 'meta',
          size: 0,
          url: null,
          hash: null,
          meta: r.meta || {},
          signatures: Array.isArray(r.signatures) ? r.signatures : []
        });
      }
    });
    return locals;
  }

  function render(){
    const docs = mergeDocs();

    if(user.role === 'pemesan'){
      // Header khusus pemesan
      tableHead.innerHTML = `
        <th>NO BAPB</th>
        <th>KONTRAK</th>
        <th>VENDOR</th>
        <th>PETUGAS</th>
        <th>STATUS</th>
        <th>AKSI</th>
      `;
      tableBody.innerHTML = '';
      const inspectionKey = 'bapsa_inspections';
      let inspections = {};
      try{ inspections = JSON.parse(localStorage.getItem(inspectionKey))||{}; }catch{ inspections = {}; }
      const waiting = docs.filter(d=> {
        const st = (d.meta||{}).status;
        return st === 'Menunggu Persetujuan' || d.signatures?.length > 0; // tampilkan juga yang sudah ditandatangani
      });
      waiting.forEach(doc=>{
        const bapbNo = (doc.meta && doc.meta.bapbNo) || `BAPB-${doc.id.split('_').pop()}`;
        const petugas = (inspections[doc.id]?.inspector || 'Petugas Gudang (SPO)');
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
        // Badge Urgent/SLA dinonaktifkan sesuai permintaan
        (function(){ /* disabled */ })();
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

  if(user.role === 'admin'){
      // Tampilkan input pencarian untuk admin
      if(adminSearchWrap) adminSearchWrap.style.display = 'flex';
      // Admin hanya melihat dan review dokumen akhir
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
    const filtered = docs.filter(d => (d.meta && d.meta.contract || '').toLowerCase().includes(term));
      filtered.forEach(doc=>{
        const bapbNo = (doc.meta && doc.meta.bapbNo) || `BAPB-${doc.id.split('_').pop()}`;
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
        // Badge Urgent/SLA dinonaktifkan sesuai permintaan
        (function(){ /* disabled */ })();
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
          // API delete (best-effort)
          try{
            await fetch(`${API_BASE}/api/shipments/${encodeURIComponent(id)}`, { method:'DELETE' });
          }catch(_){ /* abaikan kegagalan */ }
          // Hapus dari daftar dokumen lokal
          const remaining = (window.Storage.list()||[]).filter(d=> d.id !== id);
          window.Storage.saveAll(remaining);
          // Hapus pemeriksaan terkait lokal
          try{
            const inspectionKey = 'bapsa_inspections';
            const map = JSON.parse(localStorage.getItem(inspectionKey)) || {};
            if(map[id]){ delete map[id]; localStorage.setItem(inspectionKey, JSON.stringify(map)); }
          }catch{}
          alert('Data berhasil dihapus.');
          // Refresh dari API agar tampilan konsisten
          fetchShipments().then(()=>{ render(); });
        });
      });
      return;
    }

    // Default: tampilan petugas
    // stats
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
      const tr = document.createElement('tr');
      const statusText = (doc.meta && doc.meta.status) || (doc.signatures.length>0 ? 'Sudah Ditandatangani' : 'Barang Tiba');
      const statusClass = statusText === 'Barang Tiba' ? 'arrived' : 'inspected';
      tr.innerHTML = `
        <td>${doc.meta.contract}</td>
        <td>${doc.meta.vendor}</td>
        <td>${doc.meta.arrivalDate || '-'}</td>
        <td>
          <span class="status ${statusClass}">${statusText}</span>
        </td>
        <td>
          <button class="btn" data-inspect="${doc.id}">Periksa Barang</button>
        </td>`;
      // Badge Urgent/SLA dinonaktifkan sesuai permintaan
      (function(){ /* disabled */ })();
      tableBody.appendChild(tr);
    });

    // bind actions
    tableBody.querySelectorAll('[data-inspect]').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        const id = e.currentTarget.getAttribute('data-inspect');
        location.href = `/inspection.html?id=${encodeURIComponent(id)}`;
      });
    });
    tableBody.querySelectorAll('[data-sign]').forEach(btn=>{
      btn.addEventListener('click', async (e)=>{
        const id = e.currentTarget.getAttribute('data-sign');
        const docs = window.Storage.list();
        const doc = docs.find(d=>d.id===id);
        if(!doc) return;
        try{
          const sig = await window.DigitalSignature.signDocument(user.email, doc);
          doc.signatures.push(sig);
          doc.meta = doc.meta || {};
          doc.meta.status = 'Menunggu Persetujuan';
          doc.meta.bapbNo = doc.meta.bapbNo || `BAPB-${Math.floor(Math.random()*9000+1000)}`;
          window.Storage.saveAll(docs);
          alert('Dokumen berhasil ditandatangani dan diajukan untuk persetujuan.');
          render();
        }catch(err){ alert(err.message); }
      });
    });
    tableBody.querySelectorAll('[data-verify]').forEach(btn=>{
      btn.addEventListener('click', async (e)=>{
        const id = e.currentTarget.getAttribute('data-verify');
        const doc = window.Storage.list().find(d=>d.id===id);
        if(!doc) return;
        if(doc.signatures.length===0){ alert('Belum ada tanda tangan.'); return; }
        const latest = doc.signatures[doc.signatures.length-1];
        const valid = await window.DigitalSignature.verifySignature(doc, latest);
        alert(valid ? 'Tanda tangan VALID.' : 'Tanda tangan TIDAK valid.');
      });
    });
  }

  // Hubungkan input pencarian admin agar memicu filter saat mengetik
  if(adminSearchInput){
    adminSearchInput.addEventListener('input', render);
  }

  render();
  // Prefill dari API, lalu render ulang bila data tersedia
  fetchShipments().then(()=>{ render(); });

  // Tambah tombol Sinkron sekarang tanpa mengubah layout statis (JS injection)
  function addSyncBtn(container){
    if(!container) return;
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.id = 'syncNowBtn';
    btn.textContent = 'Sinkron sekarang';
    btn.style.marginLeft = '8px';
    btn.addEventListener('click', ()=>{ fetchShipments().then(()=>{ render(); }); });
    container.appendChild(btn);
  }
  if(user.role==='petugas' && widgets){ addSyncBtn(widgets); }
  if(user.role==='admin' && adminSearchWrap){ addSyncBtn(adminSearchWrap); }

  // Tambah tombol Ekspor CSV (JS injection)
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
  // Ekspor CSV hanya untuk Admin
  if(user.role==='admin' && adminSearchWrap){ addExportBtn(adminSearchWrap); }

  // Tambahkan link "Dokumen ACC" di samping Arsip (hanya Admin)
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
    }catch(e){ console.warn('Gagal menyisipkan link Dokumen ACC', e); }
  }

  // Helper: hitung SLA (due/terlambat)
  function computeSLA(meta){
    try{
      const now = new Date();
      let due = null;
      if(meta && meta.dueDate){ due = new Date(meta.dueDate); }
      else if(meta && meta.arrivalDate){
        due = new Date(meta.arrivalDate);
        if(!isNaN(due)) due.setDate(due.getDate()+3); // default SLA 3 hari
      }
      if(!due || isNaN(due)) return null;
      const diff = Math.ceil((due - now)/(1000*60*60*24));
      if(diff <= 0) return { text: 'Terlambat', cls: 'danger' };
      return { text: `Due: ${diff} hari`, cls: 'muted' };
    }catch(_){ return null; }
  }

  // Admin analytics widgets (JS injection tanpa ubah HTML statis)
  function ensureAdminAnalytics(){
    if(user.role!=='admin') return;
    const container = document.querySelector('.container');
    if(!container) return;
    let ana = document.getElementById('adminAnalytics');
    if(!ana){
      ana = document.createElement('div');
      ana.className = 'widgets';
      ana.id = 'adminAnalytics';
      // sisipkan sebelum panel utama
      const panel = document.querySelector('.panel');
      (panel && panel.parentNode) ? panel.parentNode.insertBefore(ana, panel) : container.appendChild(ana);
    }
    const docs = mergeDocs();
    const total = docs.length;
    const waiting = docs.filter(d=> (d.meta||{}).status==='Menunggu Persetujuan').length;
    // Hitung selesai mencakup dokumen yang sudah Disetujui oleh Pemesan
    // maupun dinyatakan Selesai (ACC Admin)
    const finished = docs.filter(d=> {
      const st = (d.meta||{}).status;
      return st === 'Disetujui' || st === 'Selesai';
    }).length;
    const rejected = docs.filter(d=> (d.meta||{}).status==='Ditolak').length;
    ana.innerHTML = `
      <div class="widget">
        <div class="widget-title">Total Dokumen BAPB</div>
        <div class="widget-value">${total}</div>
        <div class="widget-sub">Dokumen</div>
      </div>
      <div class="widget">
        <div class="widget-title">Menunggu Persetujuan</div>
        <div class="widget-value">${waiting}</div>
        <div class="widget-sub">Bottleneck</div>
      </div>
      <div class="widget">
        <div class="widget-title">Selesai (Disetujui/ACC)</div>
        <div class="widget-value">${finished}</div>
        <div class="widget-sub">Siap proses keuangan</div>
      </div>
      <div class="widget">
        <div class="widget-title">Ditolak / Bermasalah</div>
        <div class="widget-value">${rejected}</div>
        <div class="widget-sub">Perlu tindak lanjut</div>
      </div>
    `;
  }
  ensureAdminAnalytics();
  fetchShipments().then(()=>{ ensureAdminAnalytics(); });

  // Notifikasi urgensi: badge ringkas di atas tabel
  function ensureUrgentBanner(){
    if(user.role!=='admin') return;
    const panelBody = document.querySelector('.panel-body');
    if(!panelBody) return;
    let banner = document.getElementById('urgentBanner');
    if(!banner){
      banner = document.createElement('div');
      banner.id = 'urgentBanner';
      banner.className = 'row gap';
      banner.style.marginBottom = '8px';
      panelBody.insertBefore(banner, panelBody.firstChild);
    }
    const docs = mergeDocs();
    const waiting = docs.filter(d=> (d.meta||{}).status==='Menunggu Persetujuan');
    const rejected = docs.filter(d=> (d.meta||{}).status==='Ditolak');
    banner.innerHTML = `
      <span class="badge warning">Menunggu: ${waiting.length}</span>
      <span class="badge danger">Ditolak: ${rejected.length}</span>
      <span class="muted small">Klik "Sinkron sekarang" untuk refresh data.</span>
    `;
  }
  ensureUrgentBanner();
  fetchShipments().then(()=>{ ensureUrgentBanner(); });
})();