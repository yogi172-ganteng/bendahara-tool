# Meja Kerja Bendahara

Pratinjau UI/UX meja kerja. **Bukan** pengganti Apps Script di cabang `main`.

Target sekolah: **SMK Maritim Nusantara Kupang**.

## Menjalankan

```bash
cd meja-kerja
npm install
npm run dev
```

Buka http://localhost:5173

## Isi

| Path | Peran |
|------|--------|
| `src/components/meja-kerja.tsx` | Halaman meja kerja |
| `src/components/ui/primitives.tsx` | Kartu, tombol, modal, tab |
| `src/lib/keuangan.ts` | Data contoh periode, tugas, transaksi, laporan |
| `src/lib/utils.ts` | Format rupiah + `cn` |
| `src/styles.css` | Warna dan tipografi (Tailwind v4) |
| `src/router.tsx` | Router TanStack |
| `src/main.tsx` | Entry |

Angka masih contoh. Belum tersambung ke spreadsheet.

## Fitur pratinjau

- Ganti periode → angka saldo, realisasi, sisa pagu berubah
- **Catat transaksi** menambah baris di tabel
- Klik tugas untuk menandai selesai
- Klik baris kelas → lihat nama yang menunggak
- **Unduh laporan** / ikon unduh → unduh ringkasan teks
- **Buat laporan baru** → draf masuk daftar
