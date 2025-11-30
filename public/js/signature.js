// Digital signature using WebCrypto RSA-PSS
window.DigitalSignature = (function(){
  function getKeys(email){
    const keyStr = localStorage.getItem(`bapsa_keys_${email}`);
    if(!keyStr) return null;
    const jwk = JSON.parse(keyStr);
    return jwk;
  }

  async function importKey(jwk, usage){
    return crypto.subtle.importKey(
      'jwk', jwk, { name: 'RSA-PSS', hash: { name: 'SHA-256' } }, true, [usage]
    );
  }

  async function signDocument(userEmail, doc){
    const keys = getKeys(userEmail);
    if(!keys) throw new Error('Kunci tidak ditemukan untuk pengguna.');
    const privateKey = await importKey(keys.privateKey, 'sign');
    // Sign the SHA-256 hash of document (immutable reference)
    const hashBytes = Uint8Array.from(doc.hash.match(/.{1,2}/g).map(h=>parseInt(h,16))).buffer;
    const signature = await crypto.subtle.sign({ name: 'RSA-PSS', saltLength: 32 }, privateKey, hashBytes);
    const sigBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
    return { by: userEmail, alg: 'RSA-PSS/SHA-256', sigBase64, createdAt: Date.now() };
  }

  async function verifySignature(doc, signature){
    const keys = getKeys(signature.by);
    if(!keys) return false;
    const publicKey = await importKey(keys.publicKey, 'verify');
    const sigBytes = Uint8Array.from(atob(signature.sigBase64), c=>c.charCodeAt(0));
    const data = Uint8Array.from(doc.hash.match(/.{1,2}/g).map(h=>parseInt(h,16))).buffer;
    return crypto.subtle.verify({ name: 'RSA-PSS', saltLength: 32 }, publicKey, sigBytes, data);
  }

  return { signDocument, verifySignature };
})();