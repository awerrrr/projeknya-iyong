# BAPSA – Berita Acara Pemeriksaan Barang Impor

Aplikasi web sederhana untuk capstone: autentikasi, upload & pengelolaan dokumen BAPB, serta tanda tangan digital berbasis WebCrypto (RSA-PSS). UI responsif untuk Login, Register, dan Dashboard Petugas Gudang.

## Menjalankan secara lokal

1. Pastikan Node.js terpasang.
2. Jalankan `node server.js`.
3. Buka `http://localhost:8080/`.

Anda juga bisa menjalankan server statis cepat untuk preview:

- `python -m http.server 8000` di folder `public/` lalu buka `http://localhost:8000/`.

## Fitur

- Autentikasi (register/login) dengan hashing password SHA-256.
- Keypair RSA per pengguna disiapkan saat register/login (WebCrypto).
- Unggah dokumen BAPB (PDF/PNG/JPG) dan simpan di `localStorage` sebagai Data URL.
- Tanda tangan digital (RSA-PSS/SHA-256) atas hash dokumen yang immutable.
- Verifikasi tanda tangan langsung dari UI.
- Dashboard ringkas sesuai mockup: statistik dan daftar pengiriman.

## Cloud Storage (opsional)

Kode sudah menyiapkan abstraksi storage. Untuk mengaktifkan Firebase:

1. Buat project Firebase dan aktifkan Storage.
2. Isi konfigurasi di `public/js/config.js`:
   ```js
   window.APP_CONFIG = {
     storageProvider: 'firebase',
     firebase: { enabled: true, apiKey: '...', authDomain: '...', projectId: '...', storageBucket: '...' }
   }
   ```
3. Implementasikan fungsi upload di `public/js/storage.js` (blok Firebase) sesuai SDK web Firebase.

Tanpa konfigurasi cloud, aplikasi memakai penyimpanan lokal untuk demonstrasi.

## Catatan Keamanan

- Ini adalah prototype edukasi. Untuk produksi: gunakan backend aman, penyimpanan key privat di perangkat/keystore, dan sistem otentikasi/OAuth.

## Deploy ke Netlify

Situs ini adalah aplikasi statis. Deploy paling sederhana cukup mempublikasikan folder `public/`.

Konfigurasi sudah disertakan di `netlify.toml`:

```
[build]
  publish = "public"
  command = ""

[[redirects]]
  from = "/"
  to = "/index.html"
  status = 200
```

### Opsi A: Deploy via Netlify UI (disarankan)

1. Buat repository Git (GitHub/GitLab/Bitbucket) dari folder ini.
2. Masuk ke Netlify > Add new site > Import from Git.
3. Pilih repository Anda.
4. Build command: kosongkan (tidak perlu).
5. Publish directory: `public`.
6. Deploy.

### Opsi B: Deploy via Netlify CLI

Pastikan Node.js terpasang.

1. Instal CLI: `npm i -g netlify-cli`
2. Login: `netlify login`
3. Inisialisasi (link atau buat site baru): `netlify init`
4. Deploy preview: `netlify deploy --dir=public`
5. Deploy produksi: `netlify deploy --prod --dir=public`

## API Lokal (Server Node)

Server Node (`server.js`) kini menyediakan endpoint REST sederhana dengan penyimpanan JSON di folder `data/`:

- `GET /api/shipments` → daftar dokumen.
- `POST /api/shipments` → buat dokumen baru. Body: `{ id?, meta?, signatures?, files? }`
- `GET /api/shipments/:id` → detail dokumen.
- `PATCH /api/shipments/:id` → ubah `meta`. Body: `{ meta: {...} }`
- `GET /api/shipments/:id/inspection` → data pemeriksaan.
- `POST /api/shipments/:id/inspection` → simpan/ubah pemeriksaan. Body: `{ inspectorName, inspectorEmail, inspectDate, items[], note }`
- `POST /api/shipments/:id/sign` → catat tanda tangan. Body: `{ signer, signature, documentHash }`

Contoh penggunaan (PowerShell di Windows):

```
# Buat dokumen
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8081/api/shipments -ContentType 'application/json' -Body '{"meta":{"contract":"KON-001","vendor":"PT Contoh","arrivalDate":"2025-11-01"}}'

# Simpan pemeriksaan
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8081/api/shipments/S_123/inspection -ContentType 'application/json' -Body '{"inspectorName":"Petugas A","inspectorEmail":"a@contoh.com","inspectDate":"2025-11-02","items":[{"name":"Item 1","condition":"Baik","note":"OK"}],"note":"Semua baik"}'

# Ambil daftar
Invoke-RestMethod -Method Get -Uri http://127.0.0.1:8081/api/shipments
```

Catatan:
- CORS diaktifkan (`Access-Control-Allow-Origin: *`) sehingga frontend di port 8000 dapat memanggil API di 8081.
- Penyimpanan memakai file JSON; untuk produksi, gantikan dengan database (mis. Supabase/Postgres/Firebase).