# 🏁 DEV CIRCUIT — Interactive Racing Portfolio

Portofolio web bergaya **arcade racing** retro: kamu mengemudikan mobil di sirkuit
top-down, menepi di *pit stop* untuk membaca About / Projects / Skills / Contact,
berburu lap tercepat, dan menantang *ghost car* milikmu sendiri.

Seluruh tampilan dibangun dengan **HTML5 Canvas + JavaScript vanilla** — tanpa
framework, tanpa proses build, tanpa backend. Karena semuanya berkas statis,
situs ini langsung siap dipublikasikan ke **GitHub Pages**.

> **Live demo:** `https://ariefansori.github.io/portofolio/`

---

## ✨ Fitur

### Game (`index.html`)
- **Pipeline raster (bitmap)** — seluruh dunia di-*bake* sekali saat boot
  menjadi dua bitmap: **Baked World** (render visual final: rumput, concrete,
  parking lot, sand + noise, danau, tarmac) dan **Baked Surface** (peta fisika
  berwarna klasifikasi). Hasilnya: `drawImage` 1x per frame alih-alih ratusan
  operasi vektor.
- **Engine fisika arcade berbasis surface** — grip dinamis, drifting &
  handbrake. Fisika mobil membaca piksel Baked Surface, sehingga top speed,
  akselerasi, perlambatan, warna skid, dan partikel drift ikut berubah per
  jenis permukaan (lihat tabel di bawah).
- **Collision raster (pink)** — area bertanda `isStatic` (bangunan, tribun,
  ban, barrier statis) dibake jadi warna pink: tidak bisa dilintasi, mobil
  memantul + memunculkan **percikan spark** dengan kuantitas sesuai kecepatan
  benturan.
- **Objek statis di-bake** — bangunan, ban, dan road barrier yang `isStatic`
  (`true`/default) digambar sekali ke baked world (lihat `js/objects.js`,
  dipakai bersama oleh baker & renderer agar hasilnya identik). Prop dinamis
  (cone, barrier yang bisa digeser) dan tribun tetap vector di atas baked
  world.
- **Checkpoint saat balapan** — rectangle area, dash, dan label HANYA tampil
  di track editor; saat balapan hanya **tiang + bendera** yang terlihat.
  Checkpoint start/finish tanpa visual sama sekali: penentu finish berupa
  **garis putih lurus** di atas lintasan yang ikut di-bake.
- **Lintasan dari data** — geometri sirkuit dibaca dari `track.json` lewat
  `trackRenderer.js` (aspal dua lapis + garis start catur).
- **Mode ghost** — rekam *best lap* kamu dan balapan melawan bayangan
  transparan dari lap terbaik.
- **Sistem lap & checkpoint** — timer lap, best time, notifikasi **NEW RECORD**,
  dan invalidasi otomatis bila satu lap melebihi batas 2 menit.
- **Elemen sirkuit hidup** — pit crew yang berlarian mengelilingi mobilmu,
  tribun penonton yang melompat + kilatan kamera, asap knalpot, debu pasir,
  daun berterbangan, percikan api, percikan air, jejak ban di pasir, dan skid
  mark saat drifting.
- **Penonton pinggir jalan ala WRC** — penonton crowd menyingkir ke samping
  dengan kecepatan berjalan manusiawi, relatif terhadap jarak mobil (makin
  dekat mobil makin cepat; begitu mobil menjauh mereka berjalan pulang ke
  posisi asli). Mobil terlalu cepat sehingga penonton telat menyingkir →
  efek tabrakan seperti pit crew, lengkap dengan **berkas darah di tanah**
  yang fade out sendiri.
- **Audio synthesizer prosedural** — suara mesin, crash, beep checkpoint, dan
  impact pneumatik pit crew digenerate langsung via Web Audio API (tanpa file
  audio).
- **HUD retro** — speedometer jarum klasik, timer, radar sirkuit (minimap),
  banner zona, dan efek **CRT scanline** yang bisa dinyalakan/dimatikan.

### Track Editor (`editor.html`)
- **Palette quick-add** untuk 8 jenis objek lahan + **Prop** (objek tunggal,
  type dipilih di properties: `tires` / `cone` / `road_barrier` / `bush`) +
  **4 prefab** (barrier line, cone line, tires, bush — kumpulan 2+ objek).
- **Panel properties** — baris gabungan *Position* (X/Y) dan *Size* (W/H),
  slider rotasi, dan field warna dengan **color picker**.
- **Transform gizmo** — move, rotate (untuk objek yang punya `rot`), dan
  resize W/H. Induk prefab hanya bisa **digeser** (seluruh isi ikut bergeser
  relatif), sementara anak prefab (tiap barrier/titik) bisa digeser &
  diputar satu per satu.
- **Daftar objek** yang bisa dipilih, ditambah, dihapus, dan diimpor/ekspor
  sebagai JSON (COPY JSON / IMPORT JSON).

---

## 🎮 Kontrol

| Aksi | Input |
| --- | --- |
| Gas / Mundur | `↑` `↓` atau `W` `S` |
| Belok | `←` `→` atau `A` `D` |
| Rem tangan / drift | `↓` saat kecepatan tinggi + belok |
| Buka modal portofolio | Berhenti ±1.5 detik di area pit stop |
| Tutup modal | `ESC` |
| Teleport ke zona | Tombol ABOUT / PROJECTS / SKILLS / CONTACT di topbar |
| Suara & CRT | Ikon speaker & tombol CRT di kanan atas |

**Editor:**

| Aksi | Input |
| --- | --- |
| Pan kamera | `Shift` + drag, atau drag kanvas kosong / mouse tengah |
| Zoom | Scroll wheel / tombol `+` `−` |
| Pilih objek | Klik di kanvas atau di daftar objek |
| Transform | Tarik handle gizmo (tengah = geser, atas = putar, kanan/bawah = ukur) |
| Hapus objek | `Del` / `Backspace` atau tombol Delete |

---

## 🧱 Struktur Proyek

```
.
├── index.html          # Halaman game utama (portofolio)
├── game.js             # Entry point: bootstrap data, bake raster, main loop
├── js/
│   ├── config.js       # Konstanta + tabel efek per surface (warna & fisika)
│   ├── state.js        # Seluruh state mutable + referensi DOM (shared)
│   ├── math.js         # Utilitas math & deteksi bentuk terotasi
│   ├── audio.js        # Sintesis Web Audio (mesin, beep, crash, pneumatik)
│   ├── input.js        # Binding keyboard & touch
│   ├── mapData.js      # objects.json → objek runtime (prefab, pit crew)
│   ├── objects.js      # Gambar vektor objek bersama (bake & render)
│   ├── bake.js         # ★ Baked world (visual) + baked surface (fisika) + sampling
│   ├── physics.js      # ★ Fisika surface-driven, collision pink, spark
│   ├── particles.js    # Asap/daun/debu/darah/spark + skid mark & jejak ban
│   ├── systems.js      # Checkpoint, lap, pit stop, pit crew, grandstand
│   ├── hud.js          # Speedometer, minimap (di-bake), modal, tombol CRT
│   ├── ghost.js        # Rekam & render ghost car
│   └── renderer.js     # Render frame: baked world + objek vektor + partikel
├── editor.html         # Track/object editor
├── editor.js           # Editor: palette, gizmo, properties, impor/ekspor JSON
├── trackRenderer.js    # Renderer lintasan berbasis data (dipakai game & editor)
├── track.json          # Geometri sirkuit: world, aspal, garis start, path
├── data.json           # Konten portofolio + tuning mobil & pit crew
├── objects.json        # Objek peta (checkpoints, bangunan, props, prefab)
├── objects.templates.json # Template bentuk objek baru untuk editor
└── README.md
```

### Pipeline raster: baked world & baked surface

Saat boot, `js/bake.js` mengonversi seluruh dunia vektor menjadi dua bitmap:

1. **Baked World** — render akhir yang dilihat user (rumput, zona beton +
   grid, parking lot + slot, sand trap + noise, badan danau, tarmac + garis
   catur, **objek statis tanpa animasi/efek**: bangunan, ban, road barrier,
   serta **garis putih penentu start/finish** bila checkpoint menyentuh
   lintasan). Tiap frame cukup satu `drawImage`.
2. **Baked Surface** — peta fisika resolusi 50% berisi warna klasifikasi,
   dikonversi ke `Uint8Array` 1 byte/pixel untuk sampling O(1):

   | Warna     | Surface    | Pengaruh pada mobil |
   | --------- | ---------- | ------------------- |
   | Hitam     | Tarmac     | Normal; skid gelap + asap drift |
   | Abu-abu   | Concrete (termasuk parking lot) | Sama seperti tarmac |
   | Hijau     | Grass      | Akselerasi & top speed berkurang; skid coklat; asap drift jadi daun |
   | Coklat    | Sand       | Top speed turun drastis + perlambatan; skid hilang; jejak ban + debu |
   | Biru      | Lake       | Limit kecepatan, redaman, riak air, distorsi gambar mobil |
   | Pink      | Collision  | Tidak bisa dilintasi; pantul + spark (kuantitas sesuai kecepatan benturan) |

   Cek interaktif: `window.__debug.toggleSurfaceDebug()` (tampilkan peta
   surface di layar), `window.__debug.labelAt(x, y)`, dan
   `getCarTelemetry().surface`.

> Karena baked surface dibuat dari data, mengubah `track.json` / `objects.json`
> otomatis memperbaruinya — tidak ada koordinat hard-coded di fisika.

### Konfigurasi ditarik dari data (bukan hard-coded)

| Berkas | Berisi |
| --- | --- |
| `track.json` | `world` (ukuran dunia & warna rumput), `road` (warna/lebar aspal), `startLine`, dan `path` (deret perintah `moveTo` / `lineTo` / `arcTo` / `bezierCurveTo` / `closePath`) |
| `data.json` | `car` (fisika & warna mobil), `ghostCar`, `pitCrew`, `sections` (posisi & warna pit stop), `sectionContents` (HTML konten About/Projects/Skills/Contact) |
| `objects.json` | Daftar objek: `checkpoints`, `concreteZones`, `parkingLots`, `sandTraps`, `lakes`, `buildings`, `grandstands`, `crowds`, `props`, `prefabs` |
| `objects.templates.json` | `templates` — bentuk dasar objek baru di editor (dipisah dari daftar objek agar modular) |

> Karena `world` dimiliki oleh `track.json`, cukup ubah satu berkas bila ingin
> memperbesar/memperkecil dunia — game dan minimap otomatis mengikuti.

---

## 🚀 Menjalankan Secara Lokal

Clone atau download repositori terlebih dahulu:

```bash
git clone https://github.com/ariefansori/portofolio.git
cd portofolio
```
(Atau gunakan `git pull` jika foldernya sudah ada untuk memperbarui kode).

Game memuat JSON dengan `fetch()` dan kode-nya berupa *ES module*, jadi
**harus lewat server HTTP** (bukan dibuka langsung `file://`).

```bash
# Python 3
python -m http.server 8080

# atau Node
npx serve .

# atau PHP
php -S localhost:8080
```

Lalu buka:

- Game → <http://localhost:8080/>
- Editor → <http://localhost:8080/editor.html>

Tidak ada dependensi yang perlu di-install: Tailwind, Font Awesome, dan font
Google (Press Start 2P, Share Tech Mono) dimuat dari CDN.

---

## ✏️ Kustomisasi

### 1. Ganti isi portofolio
Edit `data.json` → `sectionContents`. Setiap zona punya `title`, `icon`
(kelas Font Awesome), dan `html` (markup Tailwind yang dirender di dalam modal).

```json
"about": {
  "title": "PIT STOP 1 - DRIVER PROFILE & ABOUT ME",
  "icon": "fa-user-astronaut",
  "html": "<p>Tulis biodatamu di sini…</p>"
}
```

Posisi pit stop di sirkuit diatur di `data.json` → `sections` (`x`, `y`, `color`).

### 2. Mengubah bentuk sirkuit
Edit `path` di `track.json`. Setiap langkah memakai koordinat dunia:

```json
{ "cmd": "moveTo",      "args": [600, 2050] },
{ "cmd": "lineTo",      "args": [2400, 2050] },
{ "cmd": "arcTo",       "args": [2900, 2050, 2900, 1700, 250] },
{ "cmd": "bezierCurveTo", "args": [1700, 1200, 1800, 950, 2100, 950] },
{ "cmd": "closePath",   "args": [] }
```

`arcTo` dan `bezierCurveTo` mengikuti definisi Canvas API; `arcTo` memakai
radius tunggal yang otomatis diskalakan di minimap.

### 3. Menambah / mengedit objek sirkuit
1. Buka `editor.html`, atur kamera ke lokasi yang diinginkan.
2. Klik tombol di **Palette** untuk menambah objek (bentuk properti mengikuti
   blok `templates` di `objects.templates.json`, jadi selalu konsisten dengan
   data).
3. Pilih objek untuk mengedit posisi, ukuran, rotasi, dan warna.
4. Klik **COPY JSON**, lalu tempel hasilnya kembali ke `objects.json`.

> Editor belum menulis langsung ke berkas (sengaja, agar aman dipakai di
> GitHub Pages yang read-only) — ekspor manual lewat tombol COPY JSON.

### 4. Menyesuaikan mobil & pit crew
`data.json` → `car` (`maxSpeed`, `accel`, `turnSpeed`, `color`, …) dan
`pitCrew` (`speed`, `stopDuration`, `offsets`).


---

## 🛠 Teknologi

- [HTML5 Canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API) — render game & editor
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) — synthesizer suara prosedural
- [Tailwind CSS (CDN)](https://tailwindcss.com/) — utilitas styling
- [Font Awesome 6 Free](https://fontawesome.com/) — ikon
- Google Fonts: [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) & [Share Tech Mono](https://fonts.google.com/specimen/Share+Tech+Mono)

---

## 📄 Lisensi

Bebas dimodifikasi untuk keperluan pribadi maupun belajar. Bila ingin
mempublikasikan ulang, tambahkan berkas `LICENSE` sesuai pilihanmu.

