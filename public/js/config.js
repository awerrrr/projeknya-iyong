// Konfigurasi dinamis: lokal gunakan server.js, produksi gunakan Netlify Functions
(function(){
  const host = (typeof location!=='undefined' && location.hostname) ? location.hostname : '';
  const isNetlify = /netlify\.app$/.test(host) || /netlify\.dev$/.test(host);
  const PROD_API = (typeof location!=='undefined' && location.origin) ? `${location.origin}/api` : '/api';
  const LOCAL_API = 'http://127.0.0.1:8081';

  window.APP_CONFIG = {
    storageProvider: 'local', // dokumen tetap lokal; status/inspeksi via API
    apiBaseUrl: isNetlify ? (typeof location!=='undefined' ? location.origin : '') : 'http://localhost:3001',
    localApiBaseUrl: isNetlify ? PROD_API : LOCAL_API,
    firebase: {
      enabled: false,
      apiKey: '',
      authDomain: '',
      projectId: '',
      storageBucket: '',
    }
  };
})();