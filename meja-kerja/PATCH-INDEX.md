# Patch Index.html — Aksi hari ini

File `Index.html` di branch ini **perlu diganti** dengan versi penuh dari `main` yang sudah di-patch (lihat sandbox `Index-new.html` jika masih ada).

Versi Index saat ini di branch memuat struktur dashboard baru, tetapi halaman lain disederhanakan. Jangan deploy ke produksi sebelum Index dipulihkan.

## Penggantian 1 — Tombol topbar

**Cari:**

```html
          <div class="topbar-actions">
            <button class="btn btn-tulis" type="button" id="btnDashCatatPengeluaran">Catat pengeluaran</button>
            <button class="btn btn-primary btn-tulis" type="button" id="btnDashCatatPenerimaan">+ Catat penerimaan</button>
          </div>
```

**Ganti dengan:**

```html
          <div class="topbar-actions">
            <button class="btn btn-tulis" type="button" id="btnDashVerifikasi">Verifikasi transfer</button>
            <button class="btn btn-tulis" type="button" id="btnDashGenerateTagihan">Generate tagihan SPP</button>
            <button class="btn btn-tulis" type="button" id="btnDashCatatPengeluaran">Catat pengeluaran</button>
            <button class="btn btn-primary btn-tulis" type="button" id="btnDashCatatPenerimaan">+ Catat penerimaan</button>
          </div>
```

## Penggantian 2 — Antrean → Aksi hari ini + antrean ganda

**Cari** section `id="antreanVerif"` (satu kartu) hingga sebelum `div.grid-2` berikutnya.

**Ganti dengan** blok berikut (sisipkan sebelum grafik arus kas):

```html
        <section class="card card-aksi-hari" aria-label="Aksi hari ini">
          <h2 class="card-title">Aksi hari ini</h2>
          <div class="aksi-hari-grid">
            <button type="button" class="aksi-hari-item" id="aksiTransfer" aria-label="Buka antrean verifikasi transfer">
              <span class="aksi-hari-angka num" id="aksiTransferJumlah">0</span>
              <span class="aksi-hari-label">Transfer menunggu verifikasi</span>
            </button>
            <button type="button" class="aksi-hari-item" id="aksiPengeluaran" aria-label="Buka pengeluaran menunggu persetujuan">
              <span class="aksi-hari-angka num" id="aksiPengeluaranJumlah">0</span>
              <span class="aksi-hari-label">Pengeluaran menunggu persetujuan</span>
            </button>
            <button type="button" class="aksi-hari-item" id="aksiSppRendah" aria-label="Lihat kelas SPP di bawah 80 persen">
              <span class="aksi-hari-angka num" id="aksiSppRendahJumlah">0</span>
              <span class="aksi-hari-label">Kelas SPP di bawah 80%</span>
            </button>
          </div>
        </section>

        <div class="grid-2">
          <section class="card card-antrean" id="antreanVerif" role="link" tabindex="0" aria-label="Buka daftar penerimaan dengan transfer menunggu verifikasi">
            <div class="card-head-row">
              <div>
                <h2 class="card-title">Antrean verifikasi transfer</h2>
                <p class="card-subtitle" id="antreanVerifTeks">—</p>
              </div>
              <div class="card-value num" id="antreanVerifJumlah">0</div>
            </div>
          </section>
          <section class="card card-antrean" id="antreanPengeluaran" role="link" tabindex="0" aria-label="Buka daftar pengeluaran menunggu persetujuan">
            <div class="card-head-row">
              <div>
                <h2 class="card-title">Pengeluaran menunggu persetujuan</h2>
                <p class="card-subtitle" id="antreanPengeluaranTeks">—</p>
              </div>
              <div class="card-value num" id="antreanPengeluaranJumlah">0</div>
            </div>
            <ul class="antrean-list" id="antreanPengeluaranList" hidden></ul>
          </section>
        </div>
```

## File backend/klien yang sudah siap di branch

| File | Status |
|------|--------|
| `13_Dashboard.js` | Siap — `menungguPersetujuan`, `kelasRendah`, `antreanPengeluaran` |
| `Scripts-3-Keuangan.html` | Siap — render + handler klik |
| `Styles.html` | Ada CSS Aksi hari ini (beberapa style halaman lain mungkin perlu dicek ulang dari main) |
| `Index.html` | Terapkan 2 penggantian di atas pada salinan `main` |
