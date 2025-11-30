// Simple client-side auth demo using localStorage + WebCrypto hashing
window.Auth = (function(){
  const USERS_KEY = 'bapsa_users';
  const SESSION_KEY = 'bapsa_session';
  const ROLE_USERS = ['petugas','pemesan','admin'];

  async function sha256(str){
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(str));
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }

  function getUsers(){
    try{ return JSON.parse(localStorage.getItem(USERS_KEY)) || []; }catch{ return []; }
  }
  function setUsers(users){ localStorage.setItem(USERS_KEY, JSON.stringify(users)); }

  async function ensureKeysFor(email){
    const keyStoreKey = `bapsa_keys_${email}`;
    if(localStorage.getItem(keyStoreKey)) return;
    const keyPair = await crypto.subtle.generateKey(
      { name: 'RSA-PSS', modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: 'SHA-256' },
      true, ['sign','verify']
    );
    const pub = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    const pri = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
    localStorage.setItem(keyStoreKey, JSON.stringify({ publicKey: pub, privateKey: pri }));
  }

  async function register(email,password,role){
    const users = getUsers();
    if(users.find(u=>u.email===email)) throw new Error('Email sudah terdaftar.');
    const passwordHash = await sha256(password);
    users.push({ email, passwordHash, role: role || 'petugas', createdAt: Date.now() });
    setUsers(users);
    await ensureKeysFor(email);
  }

  async function login(email,password){
    const users = getUsers();
    const user = users.find(u=>u.email===email);
    if(!user) throw new Error('Akun tidak ditemukan.');
    const hash = await sha256(password);
    if(hash !== user.passwordHash) throw new Error('Password salah.');
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ email: user.email, role: user.role }));
    await ensureKeysFor(email);
  }

  async function loginRole(role, password){
    const r = (role||'').toLowerCase().trim();
    if(!ROLE_USERS.includes(r)) throw new Error("Role tidak valid. Gunakan 'petugas', 'pemesan', atau 'admin'.");
    if((password||'').trim() !== r) throw new Error('Password harus sama dengan username role.');
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ email: r, role: r }));
    await ensureKeysFor(r);
  }

  function logout(){ sessionStorage.removeItem(SESSION_KEY); }
  function currentUser(){ try{ return JSON.parse(sessionStorage.getItem(SESSION_KEY)); }catch{ return null; } }
  function requireAuth(){ const u=currentUser(); if(!u){ window.location.href='/index.html'; } return u; }

  return { register, login, loginRole, logout, currentUser, requireAuth, ensureKeysFor };
})();