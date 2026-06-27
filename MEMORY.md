# Antigravity Auth Plugin — Konteks & Memory

## Overview
Plugin OpenCode `@mrhisyammm/opencode-antigravity-auth` — OAuth plugin untuk akses model Antigravity (Google) via OpenCode Desktop. Single-file bundle (`dist/bundle.js`, ~1.5MB, zero runtime deps).

**Versi terbaru**: `1.2.0` (live di npm & GitHub)

---

## Struktur Penting

```
D:\OneDrive\Project\antigravity-auth\
├── dist/bundle.js          ← entry point (bundle tunggal)
├── src/
│   ├── plugin.ts           ← main plugin logic (auth, request routing, quota display)
│   ├── plugin/
│   │   ├── quota.ts        ← fetch quota (retrieveUserQuotaSummary, fetchAvailableModels, Gemini CLI)
│   │   ├── project.ts      ← resolve project ID dari Google (PLATFORM_UNSPECIFIED fix)
│   │   ├── request.ts      ← prepare & transform request/response, token count headers
│   │   ├── accounts.ts     ← AccountManager, multi-account rotation
│   │   ├── dashboard/
│   │   │   ├── store.ts    ← JSON file-based traffic log storage
│   │   │   └── server.ts   ← Localhost HTTP server (port 27140) + embedded HTML dashboard
│   │   ├── config/
│   │   │   ├── schema.ts   ← Zod config schema (dashboard config di sini)
│   │   │   └── models.ts   ← Model definitions & dynamic discovery
│   │   ├── core/streaming/
│   │   │   ├── types.ts    ← StreamingCallbacks (onTokenUsage)
│   │   │   └── transformer.ts ← SSE transform + usageMetadata extraction
│   │   └── transform/
│   │       └── model-resolver.ts ← Model name → Google API model ID resolver
│   ├── constants.ts        ← API endpoints, OAuth client ID/secret, headers
│   └── hooks/              ← Auto-update checker
├── package.json            ← npm package config
├── plans/antigravity-dashboard.md ← Blueprint rencana dashboard
└── MEMORY.md               ← File ini
```

---

## Konfigurasi Lokal (PC Hisyam)

| File | Path |
|------|------|
| OpenCode config | `C:\Users\Hisyam\.config\opencode\opencode.json` |
| Accounts | `C:\Users\Hisyam\.config\opencode\antigravity-accounts.json` |
| Plugin config | `C:\Users\Hisyam\.config\opencode\antigravity.json` |
| Dashboard cache | `C:\Users\Hisyam\.config\opencode\antigravity-dashboard-logs.json` |
| Plugin npm cache | `C:\Users\Hisyam\.cache\opencode\packages\@mrhisyammm\opencode-antigravity-auth@latest\` |
| Sesi chat DB | `C:\Users\Hisyam\AppData\Roaming\ai.opencode.desktop\opencode.workspace.*.dat` |

---

## Akun Google Terdaftar

| # | Email | Status |
|---|-------|--------|
| 1 | `im.anonymous27@gmail.com` | Active |
| 2 | `hisyamasphalt27@gmail.com` | Active |
| 3 | `mrhisyammm@gmail.com` | Active |
| 4 | `shor7cut1@gmail.com` | Disabled (verification needed) |
| 5 | `shor7cut2@gmail.com` | Active |
| 6 | `hisyam.lawliet@gmail.com` | Active |

---

## Bug Fixes Kunci (v1.0.5 → v1.2.0)

### 1. Windows Platform Resolution (`project.ts`)
- **Masalah**: `platform: "WINDOWS"` direject Google API (400 Bad Request)
- **Fix**: Ubah ke `"PLATFORM_UNSPECIFIED"` agar `loadCodeAssist` berhasil
- **Dampak**: Tanpa fix ini, project ID selalu fallback ke `rising-fact-p41fc` (sandbox), bukan project asli user

### 2. Endpoint Fallback untuk Quota (`quota.ts`)
- **Masalah**: Hardcode `ANTIGRAVITY_ENDPOINT_PROD` (production) selalu return 100% untuk Gemini
- **Fix**: Gunakan `ANTIGRAVITY_ENDPOINT_FALLBACKS` loop (sandbox → daily → prod)
- **Endpoint**: `daily-cloudcode-pa.sandbox.googleapis.com` → `daily-cloudcode-pa.googleapis.com` → `cloudcode-pa.googleapis.com`

### 3. `retrieveUserQuotaSummary` Endpoint
- **Endpoint baru**: `/v1internal:retrieveUserQuotaSummary`
- **Return**: Aggregate quota groups (gemini-weekly, gemini-5h, 3p-weekly, 3p-5h) dengan `remainingFraction` & `resetTime`
- **Fallback**: Jika gagal, gunakan `fetchAvailableModels` + aggregate per-model

### 4. Display Quota Groups (`plugin.ts`)
- **Label**: "5-Hour Limit" & "Weekly Limit" (bukan "Non-Weekly" & "Weekly")
- **Empty groups**: Tampilkan "N/A (does not apply)" bukan 100%
- **Disabled buckets**: Skip dari display (sesuai flag `disabled: true` dari API)

---

## Fitur Dashboard (v1.2.0)

### Akses
Buka `http://localhost:27140` di browser saat OpenCode Desktop running.

### Fitur
- **Live Traffic Monitor**: Tabel real-time request log (model, akun, token, latency, status)
- **Token Stats**: Aggregate statistik total token, success rate, avg latency
- **Accounts Quota**: Progress bar per-akun (Claude/Gemini Weekly & 5-Hour)
- **Chart.js**: Doughnut chart konsumsi token per model
- **Search & Filter**: Pencarian model/akun, filter sukses/gagal
- **Detail Modal**: Klik baris log untuk melihat detail token accounting & error

### Konfigurasi (`antigravity.json`)
```json
{
  "dashboard": {
    "enabled": true,
    "port": 27140
  }
}
```

### Teknis
- **Server**: Native Node.js `http` (zero dependency)
- **Storage**: JSON file dengan file-lock (`proper-lockfile`), max 1000 log
- **Logger**: Non-blocking `saveLog()` dipanggil via `onTokenUsage` callback di streaming + non-streaming responses
- **Cleanup**: Auto-close pada `exit`, `SIGINT`, `SIGTERM`

---

## Workflow Development

### Build
```bash
cd D:\OneDrive\Project\antigravity-auth
npm run build                    # tsc -p tsconfig.build.json
npx esbuild index.ts --bundle --platform=node --format=esm --outfile=dist/bundle.js --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"
```

### Test
```bash
npm test                         # vitest run (1083 tests)
```

### Publish ke npm
```bash
npm version 1.x.x --no-git-tag-version
npx esbuild index.ts --bundle --platform=node --format=esm --outfile=dist/bundle.js --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"
git add package.json package-lock.json dist/bundle.js
git commit -m "chore: bump version to 1.x.x"
git push origin main
git tag v1.x.x && git push origin v1.x.x
npm publish --access public
```

### Copy ke local cache (untuk testing lokal)
```bash
# Copy ke semua folder cache & node_modules
node copy-all-targets.js
# Restart OpenCode Desktop
```

### Pengecekan Quota Live
```bash
opencode auth login
# Pilih "Check all quota"
```

### Debugging API
```bash
# Test fetchAvailableModels
node -e "..."  # (script ad-hoc)
```

---

## Referensi Eksternal

- **Upstream repos**: `github.com/NoeFabris/opencode-antigravity-auth`
- **Fork repos**: `github.com/mrhisyammm/opencode-antigravity-auth`
- **Antigravity Manager**: `github.com/lbjlaq/Antigravity-Manager` (referensi endpoint `retrieveUserQuotaSummary`)
- **Antigravity Panel**: `github.com/n2ns/antigravity-panel` (referensi local language server)
- **Antigravity Quota (AGQ)**: `github.com/Henrik-3/AntigravityQuota` (referensi GetUserStatus)

---

## Known Issues / Catatan

- Gemini 3.5 Flash kadang 404 di production endpoint — issue Google, bukan plugin. Coba lagi nanti atau pakai `--variant=high`
- Claude Opus 4.6 Thinking return HTTP 500 saat tools di-invoke — server-side Antigravity limitation
- Sesi OpenCode **tidak bisa di-export** antar workspace — tersimpan di LevelDB binary
- Plugin cache di banyak folder (`~/.cache/opencode/packages/`, `node_modules/`) — harus copy bundle ke semuanya saat testing lokal
