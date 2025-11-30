// Form identitas wajib untuk Petugas/Pemesan sebelum ke Dashboard
(function(){
  const user = Auth.requireAuth();
  const form = document.getElementById('identityForm');
  const roleSel = document.getElementById('identRole');
  const nameInput = document.getElementById('identName');
  const emailInput = document.getElementById('identEmail');

  // Prefill role sesuai sesi
  roleSel.value = user.role;
  // Jika admin, loncati form
  if(user.role === 'admin'){
    window.location.href = '/dashboard.html';
    return;
  }

  // Jika identitas sudah ada, prefill
  const storeKey = `bapsa_identity_${user.role}`;
  try{
    const existing = JSON.parse(localStorage.getItem(storeKey));
    if(existing){
      nameInput.value = existing.name || '';
      emailInput.value = existing.email || '';
    }
  }catch{}

  function isValidEmail(e){ return /.+@.+\..+/.test(String(e||'').toLowerCase()); }

  form.addEventListener('submit', (ev)=>{
    ev.preventDefault();
    const role = roleSel.value;
    const name = nameInput.value.trim();
    const email = emailInput.value.trim();

    if(!role || !name || !email){ alert('Semua field wajib diisi.'); return; }
    if(!isValidEmail(email)){ alert('Format email tidak valid.'); return; }

    // Simpan identitas
    localStorage.setItem(storeKey, JSON.stringify({ role, name, email, updatedAt: Date.now() }));
    // Siapkan keypair jika perlu (menggunakan email untuk key store)
    Auth.ensureKeysFor(email).catch(()=>{});

    window.location.href = '/dashboard.html';
  });
})();