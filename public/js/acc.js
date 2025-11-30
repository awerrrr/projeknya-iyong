// Halaman Dokumen ACC: hanya untuk Admin
(function(){
  const user = window.Auth.requireAuth();
  const badgeEl = document.getElementById('userBadge');
  if(badgeEl){ badgeEl.textContent = `${user.email||user.role} • ${user.role}`; }
  const logoutBtn = document.getElementById('logoutBtn');
  if(logoutBtn){ logoutBtn.addEventListener('click', ()=>{ Auth.logout(); location.href='/index.html'; }); }

  if(user.role !== 'admin'){
    document.querySelector('main').innerHTML = '<h3>Akses ditolak</h3><p class="muted">Halaman ini hanya untuk Admin.</p>';
    return;
  }

  const tableBody = document.querySelector('#accTable tbody');
  const searchInput = document.getElementById('searchInput');
  const emptyState = document.getElementById('emptyState');

  function fmtDate(d){
    try{ const dt = new Date(d); return dt.toLocaleDateString('id-ID'); }catch{ return '-'; }
  }

  function render(rows){
    tableBody.innerHTML = '';
    if(!rows.length){ emptyState.style.display='block'; return; }
    emptyState.style.display='none';
    for(const r of rows){
      const tr = document.createElement('tr');
      const tdKontrak = document.createElement('td'); tdKontrak.textContent = r.contractNo||'-';
      const tdVendor = document.createElement('td'); tdVendor.textContent = r.vendor||'-';
      const tdArrive = document.createElement('td'); tdArrive.textContent = fmtDate(r.arrivalDate||'-');
      const tdDoc = document.createElement('td');
      const viewLink = document.createElement('a');
      viewLink.href = r.doc?.url || '#';
      viewLink.target = '_blank';
      viewLink.textContent = r.doc?.name || 'Lihat Dokumen';
      tdDoc.appendChild(viewLink);
      const tdDetail = document.createElement('td');
      const detailBtn = document.createElement('button');
      detailBtn.className = 'btn small';
      detailBtn.textContent = 'Lihat Detail Dokumen';
      detailBtn.addEventListener('click', ()=>{
        location.href = `/confirm.html?id=${encodeURIComponent(r.id)}&review=1`;
      });
      tdDetail.appendChild(detailBtn);

      tr.appendChild(tdKontrak);
      tr.appendChild(tdVendor);
      tr.appendChild(tdArrive);
      tr.appendChild(tdDoc);
      tr.appendChild(tdDetail);
      tableBody.appendChild(tr);
    }
  }

  async function load(){
    const docs = window.Storage.list() || [];
    const mapById = new Map(docs.map(d=>[String(d.id), d]));
    const API_BASE = (window.APP_CONFIG && window.APP_CONFIG.localApiBaseUrl) || 'http://127.0.0.1:8081';
    let shipments = [];
    try{
      const resp = await fetch(`${API_BASE}/api/shipments`);
      const json = await resp.json();
      shipments = (json && json.data) || [];
    }catch(e){ console.warn('Gagal mengambil shipments dari API', e); }

    const accRows = shipments
      .filter(s=> s && s.meta && s.meta.manualSignedId)
      .map(s=> ({
        id: s.id,
        contractNo: s?.meta?.contractNo || s?.meta?.contract || '-',
        vendor: s?.meta?.vendor || '-',
        arrivalDate: s?.meta?.arrivalDate || '-',
        doc: mapById.get(String(s.meta.manualSignedId))
      }));
    render(accRows);

    searchInput.addEventListener('input', ()=>{
      const q = (searchInput.value||'').toLowerCase();
      const filtered = accRows.filter(r=>
        (r.contractNo||'').toLowerCase().includes(q) ||
        (r.vendor||'').toLowerCase().includes(q)
      );
      render(filtered);
    });
  }

  load();
})();