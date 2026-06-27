# Blueprint: Localhost Dashboard (Traffic Monitor & Token Stats)

Rencana pembangunan fitur dashboard lokal (`localhost`) terintegrasi untuk mencatat dan menampilkan log lalu lintas (traffic) serta statistik penggunaan token secara real-time yang tersinkronisasi dengan eksekusi OpenCode Desktop.

---

## 🗺️ Peta Jalur Pengembangan (Roadmap)

```
[Step 1: Storage Layer] ──> [Step 2: Logger Middleware] ──> [Step 3: Local HTTP Server] ──> [Step 4: Frontend UI] ──> [Step 5: Integration & Config]
```

- **Step 1: Database & Storage Layer** (Penyimpanan log tanpa dependensi binary native)
- **Step 2: Logger Middleware** (Pencekalan/intersepsi request & response di plugin)
- **Step 3: Background HTTP Server** (Localhost server menggunakan Hono di background)
- **Step 4: Frontend Dashboard UI** (Halaman HTML/JS interaktif untuk visualisasi traffic & stats)
- **Step 5: Lifecycle & Configuration** (Manajemen port, auto-start/stop, dan dokumentasi)

---

## 🛠️ Langkah Konstruksi Detail

### Step 1: Database & Storage Layer (File-based JSON Database)
* **Konteks**: Kita memerlukan media penyimpanan log yang ringan dan portabel. Menggunakan SQLite (native binary) berisiko gagal kompilasi di PC pengguna lain. Maka, kita akan membuat database berbasis file JSON terproteksi file-lock di folder konfigurasi OpenCode.
* **Tugas**:
  - Buat berkas `src/plugin/dashboard/store.ts`.
  - Implementasikan interface `TrafficLog`:
    ```typescript
    export interface TrafficLog {
      id: string;
      timestamp: number;
      accountEmail: string;
      modelName: string;
      requestedModel: string;
      tokens: { input: number; output: number; total: number; thinking?: number };
      latencyMs: number;
      statusCode: number;
      error?: string;
    }
    ```
  - Buat metode `saveLog(log: TrafficLog)` dan `getLogs(limit?: number)`.
  - Buat metode `getStats()` untuk agregasi data token dan rata-rata latensi per model/akun.
  - Batasi jumlah log maksimum (misal maks 1000 log terbaru) untuk menghemat ruang disk.
* **Verifikasi**:
  - Jalankan unit test buatan untuk memastikan penyimpanan JSON berjalan tanpa corruption.
* **Exit Criteria**: Log berhasil ditulis dan dibaca kembali dari file JSON lokal secara aman.

---

### Step 2: Logger Middleware (Request Interception)
* **Konteks**: Menangkap request dan response yang mengalir melalui plugin untuk diumpankan ke Storage Layer.
* **Tugas**:
  - Temukan fungsi `fetch` utama di `src/plugin.ts` yang melayani pengiriman request ke Google.
  - Sisipkan interceptor pasca-response: catat waktu mulai request, panggil API, hitung selisih waktu (`latencyMs`), parsing sisa kuota/token dari header (misal `x-antigravity-token-consumed` jika ada, atau estimasi token count), lalu panggil `saveLog()`.
  - Pastikan interceptor tidak menghalangi aliran response utama (non-blocking) dan aman dari crash (try-catch penuh).
* **Verifikasi**:
  - Jalankan `rtk npm test` untuk memastikan interceptor tidak mengacaukan respons model atau penanganan streaming.
* **Exit Criteria**: Setiap request dari OpenCode Desktop tercatat ke database lokal dengan latensi dan status code yang tepat.

---

### Step 3: Background HTTP Server (Local Hono Server)
* **Konteks**: Menjalankan HTTP server lokal di background saat plugin OpenCode diaktifkan oleh CLI.
* **Tugas**:
  - Di `src/plugin/dashboard/server.ts`, inisialisasi Hono HTTP server.
  - Daftarkan endpoint API berikut:
    - `GET /api/logs` -> Mengembalikan daftar log terakhir.
    - `GET /api/stats` -> Mengembalikan ringkasan statistik penggunaan token.
    - `GET /api/accounts` -> Mengembalikan status kuota real-time dari accounts manager.
  - Jalankan server di port default `8046` (atau port bebas konflik lainnya).
  - Integrasikan inisialisasi server ke dalam fungsi startup utama di `src/plugin.ts`.
* **Verifikasi**:
  - Jalankan server lokal, lalu gunakan `curl http://127.0.0.1:8046/api/stats` untuk memverifikasi respons JSON-nya.
* **Exit Criteria**: Server Hono berhasil running di background dan merespons API dengan data statistik yang akurat.

---

### Step 4: Frontend Dashboard UI (Single-page Dashboard)
* **Konteks**: Membuat antarmuka web (frontend) di localhost agar user bisa memantau secara visual.
* **Tugas**:
  - Buat single-page HTML dashboard yang responsif dan modern di `src/plugin/dashboard/assets/index.html` (menggunakan CSS Tailwind via CDN & Vanilla JS/Vue untuk kemudahan tanpa build step rumit).
  - Buat grafik visual menggunakan library Chart.js (via CDN) untuk menampilkan tren penggunaan token harian/jam.
  - Implementasikan panel:
    - **Monitor**: Live feed log transaksi request (model, akun, ukuran token, latensi, dan status).
    - **Stats**: Total token terpakai, rata-rata latensi, dan persentase sukses.
    - **Accounts**: Tampilan sisa kuota persis seperti visual Antigravity-Manager.
  - Konfigurasikan server Hono untuk meng-serve berkas HTML statis ini di `GET /`.
* **Verifikasi**:
  - Buka browser di `http://localhost:8046` dan pastikan halaman termuat dengan indah serta data API ter-render dengan benar.
* **Exit Criteria**: Dashboard localhost bisa dibuka di web browser dengan visualisasi grafik token stats dan traffic log real-time.

---

### Step 5: Lifecycle & Configuration (Production Polish)
* **Konteks**: Mengamankan daur hidup (lifecycle) server agar tertutup bersih saat OpenCode Desktop keluar, serta memberikan konfigurasi port kustom.
* **Tugas**:
  - Daftarkan opsi konfigurasi baru di `src/plugin/config/schema.ts` dan `antigravity.json`:
    - `dashboard.enabled` (default: `true`)
    - `dashboard.port` (default: `8046`)
  - Tambahkan fungsi cleanup pada penutupan plugin (hook deactivation) untuk mematikan instance HTTP server secara bersih (`server.close()`).
  - Perbarui berkas `README.md` dan dokumentasikan fitur localhost dashboard beserta cara mengaksesnya.
* **Verifikasi**:
  - Jalankan siklus penuh: Buka OpenCode Desktop -> Buka Dashboard -> Tutup OpenCode Desktop -> Pastikan port 8046 terlepas/bebas kembali.
* **Exit Criteria**: Dashboard terintegrasi secara seamless, dapat dikonfigurasi lewat file JSON, dan daur hidup server terkelola dengan bersih tanpa meninggalkan zombie ports.
