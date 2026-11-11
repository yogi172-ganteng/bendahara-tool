export type PeriodeId = "okt" | "sep" | "tri4" | "sem1";
export type Prioritas = "Tinggi" | "Sedang" | "Rendah";
export type JenisTransaksi = "masuk" | "keluar";
export type StatusLaporan = "Final" | "Draft" | "Review Kepsek";

export type Transaksi = {
  id: string;
  tanggal: string;
  uraian: string;
  kategori: string;
  jenis: JenisTransaksi;
  jumlah: number;
};

export type Tugas = {
  id: string;
  judul: string;
  tenggat: string;
  prioritas: Prioritas;
};

export type Laporan = {
  id: string;
  nama: string;
  jenis: "PDF" | "Excel";
  tanggal: string;
  status: StatusLaporan;
};

export type KelasTagihan = {
  kelas: string;
  siswa: number;
  lunas: number;
  tunggakan: number;
  persen: number;
  namaTunggak: string[];
};

export const PERIODE: { id: PeriodeId; label: string }[] = [
  { id: "okt", label: "Oktober 2026" },
  { id: "sep", label: "September 2026" },
  { id: "tri4", label: "Triwulan IV" },
  { id: "sem1", label: "Semester Ganjil" },
];

export const ringkasan: Record<
  PeriodeId,
  {
    saldo: number;
    pemasukan: number;
    pengeluaran: number;
    tunggakan: number;
    deltaSaldo: string;
    deltaMasuk: string;
    deltaKeluar: string;
    deltaTunggakan: string;
    saldoNaik: boolean;
    masukNaik: boolean;
    keluarNaik: boolean;
    tunggakanMembaik: boolean;
    realisasi: number;
    sisaPagu: number;
    pos: { label: string; val: number }[];
  }
> = {
  okt: {
    saldo: 342_500_000,
    pemasukan: 268_000_000,
    pengeluaran: 229_000_000,
    tunggakan: 18_400_000,
    deltaSaldo: "+7,6%",
    deltaMasuk: "+15,7%",
    deltaKeluar: "+7,0%",
    deltaTunggakan: "−12,4%",
    saldoNaik: true,
    masukNaik: true,
    keluarNaik: true,
    tunggakanMembaik: true,
    realisasi: 78,
    sisaPagu: 612_000_000,
    pos: [
      { label: "Dana BOS", val: 82 },
      { label: "SPP / Syahriah", val: 76 },
      { label: "Infaq & Donasi", val: 64 },
    ],
  },
  sep: {
    saldo: 318_200_000,
    pemasukan: 231_000_000,
    pengeluaran: 214_000_000,
    tunggakan: 21_000_000,
    deltaSaldo: "+4,1%",
    deltaMasuk: "+10,0%",
    deltaKeluar: "+14,4%",
    deltaTunggakan: "+6,1%",
    saldoNaik: true,
    masukNaik: true,
    keluarNaik: true,
    tunggakanMembaik: false,
    realisasi: 71,
    sisaPagu: 740_000_000,
    pos: [
      { label: "Dana BOS", val: 74 },
      { label: "SPP / Syahriah", val: 69 },
      { label: "Infaq & Donasi", val: 58 },
    ],
  },
  tri4: {
    saldo: 342_500_000,
    pemasukan: 745_000_000,
    pengeluaran: 644_000_000,
    tunggakan: 18_400_000,
    deltaSaldo: "+12,8%",
    deltaMasuk: "+9,2%",
    deltaKeluar: "+6,4%",
    deltaTunggakan: "−8,0%",
    saldoNaik: true,
    masukNaik: true,
    keluarNaik: true,
    tunggakanMembaik: true,
    realisasi: 81,
    sisaPagu: 410_000_000,
    pos: [
      { label: "Dana BOS", val: 88 },
      { label: "SPP / Syahriah", val: 79 },
      { label: "Infaq & Donasi", val: 70 },
    ],
  },
  sem1: {
    saldo: 342_500_000,
    pemasukan: 1_302_000_000,
    pengeluaran: 1_130_000_000,
    tunggakan: 18_400_000,
    deltaSaldo: "+18,4%",
    deltaMasuk: "+11,5%",
    deltaKeluar: "+9,8%",
    deltaTunggakan: "−15,2%",
    saldoNaik: true,
    masukNaik: true,
    keluarNaik: true,
    tunggakanMembaik: true,
    realisasi: 74,
    sisaPagu: 890_000_000,
    pos: [
      { label: "Dana BOS", val: 77 },
      { label: "SPP / Syahriah", val: 73 },
      { label: "Infaq & Donasi", val: 61 },
    ],
  },
};

export const trendBulan = [
  { bulan: "Mei", pemasukan: 182, pengeluaran: 141 },
  { bulan: "Jun", pemasukan: 165, pengeluaran: 158 },
  { bulan: "Jul", pemasukan: 210, pengeluaran: 187 },
  { bulan: "Agu", pemasukan: 246, pengeluaran: 201 },
  { bulan: "Sep", pemasukan: 231, pengeluaran: 214 },
  { bulan: "Okt", pemasukan: 268, pengeluaran: 229 },
];

export const komposisiPemasukan = [
  { name: "SPP / Syahriah", value: 148, color: "var(--color-primary)" },
  { name: "Dana BOS", value: 72, color: "var(--color-in)" },
  { name: "Infaq & Donasi", value: 28, color: "var(--color-warn)" },
  { name: "Kegiatan & Ekstrakurikuler", value: 20, color: "var(--color-navy)" },
];

export const komposisiPengeluaran = [
  { name: "Gaji & Honor", value: 118, color: "var(--color-out)" },
  { name: "Operasional & Utilitas", value: 46, color: "var(--color-warn)" },
  { name: "Sarana & Prasarana", value: 38, color: "var(--color-primary)" },
  { name: "Kegiatan Siswa", value: 27, color: "var(--color-navy)" },
];

export const arusKas = [
  { minggu: "Ming 1", masuk: 68, keluar: 54 },
  { minggu: "Ming 2", masuk: 72, keluar: 61 },
  { minggu: "Ming 3", masuk: 59, keluar: 66 },
  { minggu: "Ming 4", masuk: 69, keluar: 48 },
];

export const tagihanStatus: KelasTagihan[] = [
  { kelas: "VII-A", siswa: 30, lunas: 27, tunggakan: 3, persen: 90, namaTunggak: ["Raka Putra", "Nadia Sari", "Fajar Hidayat"] },
  { kelas: "VII-B", siswa: 29, lunas: 25, tunggakan: 4, persen: 86, namaTunggak: ["Siti Aminah", "Gilang Pratama", "Laras Wulandari", "Dimas Arya"] },
  { kelas: "VIII-A", siswa: 31, lunas: 30, tunggakan: 1, persen: 97, namaTunggak: ["Ahmad Fauzi"] },
  { kelas: "VIII-B", siswa: 30, lunas: 26, tunggakan: 4, persen: 87, namaTunggak: ["Intan Permata", "Yoga Saputra", "Citra Lestari", "Bayu Anggara"] },
  { kelas: "IX-A", siswa: 28, lunas: 28, tunggakan: 0, persen: 100, namaTunggak: [] },
  { kelas: "IX-B", siswa: 30, lunas: 24, tunggakan: 6, persen: 80, namaTunggak: ["Rina Oktavia", "Hendra Kusuma", "Putri Amelia", "Agus Salim", "Maya Indah", "Rizky Ramadhan"] },
];

export const transaksiAwal: Transaksi[] = [
  { id: "TRX-1042", tanggal: "10 Nov 2026", uraian: "SPP Nov — Ahmad Fauzi (VIII-A)", kategori: "SPP", jenis: "masuk", jumlah: 450_000 },
  { id: "TRX-1041", tanggal: "10 Nov 2026", uraian: "Pembelian alat kebersihan", kategori: "Operasional", jenis: "keluar", jumlah: 315_000 },
  { id: "TRX-1040", tanggal: "09 Nov 2026", uraian: "Dana BOS Triwulan IV (cair)", kategori: "Dana BOS", jenis: "masuk", jumlah: 24_000_000 },
  { id: "TRX-1039", tanggal: "09 Nov 2026", uraian: "Honor guru ekstrakurikuler Okt", kategori: "Honor", jenis: "keluar", jumlah: 3_200_000 },
  { id: "TRX-1038", tanggal: "08 Nov 2026", uraian: "SPP Nov — Siti Aminah (VII-B)", kategori: "SPP", jenis: "masuk", jumlah: 450_000 },
  { id: "TRX-1037", tanggal: "08 Nov 2026", uraian: "Token listrik bulan November", kategori: "Utilitas", jenis: "keluar", jumlah: 850_000 },
  { id: "TRX-1036", tanggal: "07 Nov 2026", uraian: "Infaq Jumat pekan pertama", kategori: "Infaq", jenis: "masuk", jumlah: 1_250_000 },
  { id: "TRX-1035", tanggal: "06 Nov 2026", uraian: "Servis AC ruang guru", kategori: "Sarana", jenis: "keluar", jumlah: 1_750_000 },
];

export const tugasAwal: Tugas[] = [
  { id: "t1", judul: "Verifikasi 6 setoran SPP hari ini", tenggat: "Hari ini, 15.00", prioritas: "Tinggi" },
  { id: "t2", judul: "Rekonsiliasi buku kas & rekening sekolah (Okt)", tenggat: "Besok", prioritas: "Tinggi" },
  { id: "t3", judul: "Susun laporan keuangan bulanan ke kepala sekolah", tenggat: "13 Nov", prioritas: "Sedang" },
  { id: "t4", judul: "Kirim surat pemberitahuan tunggakan (10 siswa)", tenggat: "15 Nov", prioritas: "Sedang" },
  { id: "t5", judul: "Penutupan kas kecil triwulan", tenggat: "28 Nov", prioritas: "Rendah" },
];

export const laporanAwal: Laporan[] = [
  { id: "l1", nama: "Laporan Keuangan Bulanan — Oktober 2026", jenis: "PDF", tanggal: "01 Nov 2026", status: "Final" },
  { id: "l2", nama: "Laporan Pertanggungjawaban Dana BOS TW III", jenis: "Excel", tanggal: "28 Okt 2026", status: "Final" },
  { id: "l3", nama: "Rekap Tunggakan SPP per Kelas", jenis: "PDF", tanggal: "05 Nov 2026", status: "Draft" },
  { id: "l4", nama: "Laporan Kas Kecil — Oktober", jenis: "Excel", tanggal: "31 Okt 2026", status: "Final" },
  { id: "l5", nama: "Rencana Anggaran (RKAS) Revisi 2", jenis: "PDF", tanggal: "02 Nov 2026", status: "Review Kepsek" },
];

export const KATEGORI_MASUK = ["SPP", "Dana BOS", "Infaq", "Kegiatan"];
export const KATEGORI_KELUAR = ["Operasional", "Honor", "Utilitas", "Sarana", "Kegiatan Siswa"];
