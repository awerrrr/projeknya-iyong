// Arsip Berita Acara untuk Petugas
(function(){
  const user = window.Auth.requireAuth();
  const API_BASE = (window.APP_CONFIG && window.APP_CONFIG.localApiBaseUrl) || 'http://127.0.0.1:8081';
  let remoteDocs = null;
  const userBadge = document.getElementById('userBadge');
  const identKey = `bapsa_identity_${user.role}`;
  let identity = null;
  try{ identity = JSON.parse(localStorage.getItem(identKey)); }catch{}
  userBadge.textContent = identity ? `${identity.name} • ${user.role}` : `${user.email} • ${user.role}`;

  document.getElementById('logoutBtn').addEventListener('click', () => {
    window.Auth.logout();
    location.href = '/index.html';
  });

  const searchInput = document.getElementById('searchInput');
  const statusFilter = document.getElementById('statusFilter');
  const tableBody = document.querySelector('#archiveTable tbody');
  const totalDocsEl = document.getElementById('totalDocs');

  // Tambahkan link Dokumen ACC di breadcrumb Arsip (khusus Admin)
  try{
    if(user.role === 'admin'){
      const arsipLink = document.querySelector('a[href="/arsip.html"]');
      if(arsipLink && arsipLink.parentNode){
        const accLink = document.createElement('a');
        accLink.className = 'crumb-link';
        accLink.href = '/acc.html';
        accLink.textContent = 'Dokumen ACC';
        arsipLink.parentNode.insertBefore(accLink, arsipLink.nextSibling);
      }
    }
  }catch(e){ console.warn('Gagal menyisipkan link Dokumen ACC di Arsip', e); }

  const inspectionKey = 'bapsa_inspections';
  function getInspections(){ try{ return JSON.parse(localStorage.getItem(inspectionKey))||{}; }catch{ return {}; } }

  function statusClass(status){
    switch(status){
      case 'Menunggu Persetujuan': return 'status inspected';
      case 'BAPB Dibuka': return 'status open';
      case 'Sudah Ditandatangani': return 'status signed';
      default: return 'status new';
    }
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
        local.meta = Object.assign({}, local.meta||{}, r.meta||{});
        if(Array.isArray(r.signatures)) local.signatures = r.signatures;
      } else {
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
    const inspections = getInspections();
    const term = (searchInput.value||'').trim().toLowerCase();
    const st = statusFilter.value;
    const start = (window.__startDateFilter && window.__startDateFilter.value) ? new Date(window.__startDateFilter.value) : null;
    const end = (window.__endDateFilter && window.__endDateFilter.value) ? new Date(window.__endDateFilter.value) : null;

    const filtered = docs.filter(d=>{
      const bapbNo = (d.meta && d.meta.bapbNo) || `BAPB-${String(d.id).split('_').pop()}`;
      const kontrak = (d.meta && d.meta.contract) || '';
      const status = (d.meta && d.meta.status) || 'Barang Tiba';
      const arrStr = (d.meta && d.meta.arrivalDate) || null;
      const arr = arrStr ? new Date(arrStr) : null;
      const matchTerm = !term || bapbNo.toLowerCase().includes(term) || kontrak.toLowerCase().includes(term);
      const matchStatus = st === 'ALL' || status === st;
      const matchStart = !start || (arr && arr >= start);
      const matchEnd = !end || (arr && arr <= end);
      return matchTerm && matchStatus && matchStart && matchEnd;
    });

    totalDocsEl.textContent = filtered.length;
    tableBody.innerHTML = '';
    filtered.forEach(doc=>{
      const bapbNo = (doc.meta && doc.meta.bapbNo) || `BAPB-${String(doc.id).split('_').pop()}`;
      const kontrak = (doc.meta && doc.meta.contract) || '-';
      const vendor = (doc.meta && doc.meta.vendor) || '-';
      const petugas = (inspections[doc.id]?.inspector || 'Petugas Gudang (SPO)');
      const status = (doc.meta && doc.meta.status) || 'Barang Tiba';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${bapbNo}</td>
        <td>${kontrak}</td>
        <td>${vendor}</td>
        <td>${petugas}</td>
        <td><span class="${statusClass(status)}">${status}</span></td>
        <td><a class="link" href="/confirm.html?id=${doc.id}&review=1">Detail / Cetak</a></td>
      `;
      // Badge Urgent/SLA dinonaktifkan sesuai permintaan
      (function(){ /* disabled */ })();
      tableBody.appendChild(tr);
    });
  }

  searchInput.addEventListener('input', render);
  statusFilter.addEventListener('change', render);
  render();
  fetchShipments().then(()=>{ render(); });

  // Tambah tombol Sinkron sekarang di sekitar kontrol filter/pencarian (JS injection)
  (function(){
    const container = statusFilter && statusFilter.parentNode;
    if(!container) return;
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.id = 'syncNowBtnArchive';
    btn.textContent = 'Sinkron sekarang';
    btn.style.marginLeft = '8px';
    btn.addEventListener('click', ()=>{ fetchShipments().then(()=>{ render(); }); });
    container.appendChild(btn);
    // Tambah tombol Ekspor CSV (khusus Admin)
    const csvBtn = document.createElement('button');
    csvBtn.className = 'btn';
    csvBtn.id = 'exportCsvBtnArchive';
    csvBtn.textContent = 'Ekspor CSV';
    csvBtn.style.marginLeft = '8px';
    csvBtn.addEventListener('click', ()=>{
      const headers = ['NO BAPB','KONTRAK','VENDOR','PETUGAS','STATUS','AKSI'];
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
      a.download = 'arsip.csv';
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      a.remove();
    });
    if(user.role==='admin'){ container.appendChild(csvBtn); }
    // Tambah filter tanggal (range)
    const startInput = document.createElement('input');
    startInput.type = 'date';
    startInput.id = 'startDateFilter';
    startInput.style.marginLeft = '8px';
    const endInput = document.createElement('input');
    endInput.type = 'date';
    endInput.id = 'endDateFilter';
    endInput.style.marginLeft = '8px';
    container.appendChild(startInput);
    container.appendChild(endInput);
    window.__startDateFilter = startInput;
    window.__endDateFilter = endInput;
    startInput.addEventListener('change', render);
    endInput.addEventListener('change', render);
  })();
})();
  // Sisipkan header kolom Vendor di tabel arsip (tanpa ubah HTML statis)
  (function(){
    const headRow = document.querySelector('#archiveTable thead tr');
    if(!headRow) return;
    const ths = headRow.querySelectorAll('th');
    const exists = Array.from(ths).some(th=> th.textContent.trim().toUpperCase() === 'VENDOR');
    if(exists) return;
    const vendorTh = document.createElement('th');
    vendorTh.textContent = 'VENDOR';
    if(ths.length >= 3){
      // sisipkan setelah KONTRAK (sebelum PETUGAS)
      headRow.insertBefore(vendorTh, ths[2]);
    }else{
      headRow.appendChild(vendorTh);
    }
  })();