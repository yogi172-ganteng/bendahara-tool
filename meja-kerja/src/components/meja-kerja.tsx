import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Calendar,
  Check,
  Clock,
  Download,
  FileCheck,
  Landmark,
  PieChart as PieIcon,
  Plus,
  Receipt,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Modal,
  Progress,
  Select,
  Tabs,
  TabsList,
  TabsTrigger,
  fieldClass,
} from "@/components/ui/primitives";
import {
  KATEGORI_KELUAR,
  KATEGORI_MASUK,
  PERIODE,
  arusKas,
  komposisiPemasukan,
  komposisiPengeluaran,
  laporanAwal,
  ringkasan,
  tagihanStatus,
  transaksiAwal,
  trendBulan,
  tugasAwal,
  type JenisTransaksi,
  type Laporan,
  type PeriodeId,
  type Transaksi,
} from "@/lib/keuangan";
import { rupiah } from "@/lib/utils";

const jt = (value: number | string) => `Rp ${value} jt`;

function StatCard({
  icon: Icon,
  label,
  value,
  delta,
  baik,
  tone,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  delta: string;
  baik: boolean;
  tone: "primary" | "in" | "warn" | "out";
}) {
  const toneClass = {
    primary: "bg-primary-soft text-primary",
    in: "bg-in-soft text-in",
    warn: "bg-warn-soft text-warn",
    out: "bg-out-soft text-out",
  }[tone];

  return (
    <Card>
      <CardHeader className="pb-0">
        <p className="text-sm font-medium text-muted">{label}</p>
        <span className={`flex size-9 items-center justify-center rounded-md ${toneClass}`}>
          <Icon className="size-5" />
        </span>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
        <p className="mt-1 flex items-center gap-1 text-xs">
          {baik ? (
            <ArrowUpRight className="size-3.5 text-in" />
          ) : (
            <ArrowDownRight className="size-3.5 text-out" />
          )}
          <span className={baik ? "text-in" : "text-out"}>{delta}</span>
          <span className="text-faint">vs periode sebelumnya</span>
        </p>
      </CardContent>
    </Card>
  );
}

export function MejaKerja() {
  const [periode, setPeriode] = useState<PeriodeId>("okt");
  const [tab, setTab] = useState("pemasukan");
  const [selesai, setSelesai] = useState<string[]>([]);
  const [transaksi, setTransaksi] = useState<Transaksi[]>(transaksiAwal);
  const [laporan, setLaporan] = useState<Laporan[]>(laporanAwal);
  const [lihatSemua, setLihatSemua] = useState(false);
  const [kelasAktif, setKelasAktif] = useState<string | null>(null);
  const [bukaCatat, setBukaCatat] = useState(false);
  const [bukaLaporan, setBukaLaporan] = useState(false);
  const [form, setForm] = useState({
    jenis: "masuk" as JenisTransaksi,
    uraian: "",
    kategori: "SPP",
    jumlah: "",
  });
  const [laporanBaru, setLaporanBaru] = useState({ nama: "", jenis: "PDF" as "PDF" | "Excel" });

  const angka = ringkasan[periode];
  const komposisi = tab === "pemasukan" ? komposisiPemasukan : komposisiPengeluaran;
  const tugasTerbuka = tugasAwal.filter((t) => !selesai.includes(t.id));
  const baris = lihatSemua ? transaksi : transaksi.slice(0, 6);
  const kelas = tagihanStatus.find((k) => k.kelas === kelasAktif);
  const kategori = form.jenis === "masuk" ? KATEGORI_MASUK : KATEGORI_KELUAR;

  const ringkasTugas = useMemo(
    () => `${tugasTerbuka.length} aktif`,
    [tugasTerbuka.length],
  );

  function unduh(nama: string, isi: string) {
    const blob = new Blob([isi], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nama;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Berkas diunduh");
  }

  function unduhRingkasan() {
    const label = PERIODE.find((p) => p.id === periode)?.label ?? periode;
    const isi = [
      "Meja Kerja Bendahara — SMK Maritim Nusantara Kupang",
      `Periode: ${label}`,
      `Saldo kas & bank: ${rupiah(angka.saldo)}`,
      `Pemasukan: ${rupiah(angka.pemasukan)}`,
      `Pengeluaran: ${rupiah(angka.pengeluaran)}`,
      `Tunggakan SPP: ${rupiah(angka.tunggakan)}`,
      `Realisasi RKAS: ${angka.realisasi}%`,
      "",
      "Transaksi terbaru",
      ...transaksi.slice(0, 8).map(
        (t) => `${t.tanggal}\t${t.id}\t${t.uraian}\t${t.jenis === "masuk" ? "+" : "-"}${rupiah(t.jumlah)}`,
      ),
    ].join("\n");
    unduh(`ringkasan-${periode}.txt`, isi);
  }

  function simpanTransaksi() {
    const jumlah = Number(form.jumlah.replace(/\D/g, ""));
    if (!form.uraian.trim() || !jumlah) {
      toast.error("Isi uraian dan jumlah yang valid");
      return;
    }
    const berikutnya = transaksi.length ? Number(transaksi[0].id.split("-")[1]) + 1 : 1043;
    const baru: Transaksi = {
      id: `TRX-${berikutnya}`,
      tanggal: "11 Nov 2026",
      uraian: form.uraian.trim(),
      kategori: form.kategori,
      jenis: form.jenis,
      jumlah,
    };
    setTransaksi((list) => [baru, ...list]);
    setBukaCatat(false);
    setForm({ jenis: "masuk", uraian: "", kategori: "SPP", jumlah: "" });
    toast.success(`${baru.id} tercatat`);
  }

  function simpanLaporan() {
    if (!laporanBaru.nama.trim()) {
      toast.error("Nama laporan wajib diisi");
      return;
    }
    setLaporan((list) => [
      {
        id: `l${Date.now()}`,
        nama: laporanBaru.nama.trim(),
        jenis: laporanBaru.jenis,
        tanggal: "11 Nov 2026",
        status: "Draft",
      },
      ...list,
    ]);
    setLaporanBaru({ nama: "", jenis: "PDF" });
    setBukaLaporan(false);
    toast.success("Draf laporan ditambahkan");
  }

  return (
    <div className="min-h-screen bg-canvas px-4 py-5 text-ink md:px-6 md:py-7">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge>
                <Calendar className="size-3.5" /> Tahun Ajaran 2026/2027
              </Badge>
              <Badge tone="in">Semester Ganjil · November 2026</Badge>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Meja Kerja Bendahara</h1>
            <p className="text-sm text-muted">SMK Maritim Nusantara Kupang · Yayasan SMK Maritim Nusantara Kupang</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              label="Periode"
              value={periode}
              onValueChange={(v) => setPeriode(v as PeriodeId)}
              options={PERIODE.map((p) => ({ value: p.id, label: p.label }))}
            />
            <Button onClick={() => setBukaCatat(true)}>
              <Plus className="size-4" /> Catat transaksi
            </Button>
            <Button tone="solid" onClick={unduhRingkasan}>
              <Download className="size-4" /> Unduh laporan
            </Button>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Landmark} label="Saldo Kas & Bank" value={rupiah(angka.saldo)} delta={angka.deltaSaldo} baik={angka.saldoNaik} tone="primary" />
          <StatCard icon={Wallet} label="Pemasukan periode" value={rupiah(angka.pemasukan)} delta={angka.deltaMasuk} baik={angka.masukNaik} tone="in" />
          <StatCard icon={Receipt} label="Pengeluaran periode" value={rupiah(angka.pengeluaran)} delta={angka.deltaKeluar} baik={!angka.keluarNaik} tone="warn" />
          <StatCard icon={Clock} label="Total Tunggakan SPP" value={rupiah(angka.tunggakan)} delta={angka.deltaTunggakan} baik={angka.tunggakanMembaik} tone="out" />
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Tren Pemasukan vs Pengeluaran</CardTitle>
              <Badge>6 bulan terakhir (juta Rp)</Badge>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendBulan}>
                  <defs>
                    <linearGradient id="gMasuk" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.32} />
                      <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="gKeluar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-out)" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="var(--color-out)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="bulan" fontSize={12} stroke="var(--color-faint)" />
                  <YAxis fontSize={12} stroke="var(--color-faint)" />
                  <Tooltip formatter={(v) => jt(Number(v))} />
                  <Legend />
                  <Area name="Pemasukan" dataKey="pemasukan" stroke="var(--color-primary)" fill="url(#gMasuk)" strokeWidth={2} />
                  <Area name="Pengeluaran" dataKey="pengeluaran" stroke="var(--color-out)" fill="url(#gKeluar)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Realisasi Anggaran (RKAS)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="mb-1 flex items-end justify-between">
                  <span className="text-3xl font-semibold tabular-nums">{angka.realisasi}%</span>
                  <span className="text-xs text-faint">target 78,5%</span>
                </div>
                <Progress value={angka.realisasi} />
                <p className="mt-2 text-xs text-muted">
                  Sisa pagu: <span className="font-semibold text-ink">{rupiah(angka.sisaPagu)}</span>
                </p>
              </div>
              <div className="space-y-3 border-t border-line pt-4">
                {angka.pos.map((r) => (
                  <div key={r.label}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-muted">{r.label}</span>
                      <span className="font-semibold tabular-nums">{r.val}%</span>
                    </div>
                    <Progress value={r.val} className="h-1.5" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="pemasukan">Komposisi Pemasukan</TabsTrigger>
            <TabsTrigger value="pengeluaran">Komposisi Pengeluaran</TabsTrigger>
          </TabsList>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={komposisi} dataKey="value" nameKey="name" innerRadius={62} outerRadius={96} paddingAngle={3}>
                      {komposisi.map((d) => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => jt(Number(v))} />
                    <Legend iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Arus Kas Mingguan — November</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={arusKas}>
                    <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="minggu" fontSize={12} stroke="var(--color-faint)" />
                    <YAxis fontSize={12} stroke="var(--color-faint)" />
                    <Tooltip formatter={(v) => jt(Number(v))} />
                    <Legend />
                    <Bar name="Kas masuk" dataKey="masuk" fill="var(--color-in)" radius={[6, 6, 0, 0]} />
                    <Bar name="Kas keluar" dataKey="keluar" fill="var(--color-warn)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </Tabs>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="size-5 text-primary" /> Tugas & Pengingat
              </CardTitle>
              <Badge tone="primary">{ringkasTugas}</Badge>
            </CardHeader>
            <CardContent className="space-y-2">
              {tugasAwal.map((t) => {
                const done = selesai.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() =>
                      setSelesai((list) => (done ? list.filter((id) => id !== t.id) : [...list, t.id]))
                    }
                    className="flex w-full items-start justify-between gap-3 rounded-md border border-line p-3 text-left hover:bg-canvas"
                  >
                    <span className="flex gap-3">
                      <span
                        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border ${
                          done ? "border-in bg-in text-white" : "border-line"
                        }`}
                      >
                        {done ? <Check className="size-3" /> : null}
                      </span>
                      <span>
                        <span className={`block text-sm font-medium ${done ? "text-faint line-through" : ""}`}>
                          {t.judul}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                          <Clock className="size-3" /> {t.tenggat}
                        </span>
                      </span>
                    </span>
                    <Badge tone={t.prioritas === "Tinggi" ? "out" : t.prioritas === "Sedang" ? "warn" : "outline"}>
                      {t.prioritas}
                    </Badge>
                  </button>
                );
              })}
              {tugasTerbuka.length === 0 ? (
                <p className="pt-1 text-sm text-in">Semua tugas periode ini selesai.</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Status Tagihan per Kelas</CardTitle>
              <Badge>Lunas / total siswa</Badge>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
                    <th className="pb-2 font-medium">Kelas</th>
                    <th className="pb-2 font-medium">Lunas</th>
                    <th className="pb-2 font-medium">Tunggakan</th>
                    <th className="pb-2 text-right font-medium">Progres</th>
                  </tr>
                </thead>
                <tbody>
                  {tagihanStatus.map((k) => (
                    <tr
                      key={k.kelas}
                      className="cursor-pointer border-b border-line last:border-0 hover:bg-canvas"
                      onClick={() => setKelasAktif(kelasAktif === k.kelas ? null : k.kelas)}
                    >
                      <td className="py-2.5 font-medium">{k.kelas}</td>
                      <td className="py-2.5 tabular-nums text-muted">
                        {k.lunas}/{k.siswa}
                      </td>
                      <td className="py-2.5">
                        {k.tunggakan === 0 ? (
                          <span className="text-in">Lunas</span>
                        ) : (
                          <span className="font-medium text-out">{k.tunggakan} siswa</span>
                        )}
                      </td>
                      <td className="w-36 py-2.5">
                        <div className="flex items-center gap-2">
                          <Progress value={k.persen} className="h-1.5" />
                          <span className="w-9 text-right text-xs tabular-nums text-muted">{k.persen}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {kelas ? (
                <div className="mt-3 rounded-md bg-canvas p-3 text-sm">
                  <p className="font-semibold">{kelas.kelas}</p>
                  {kelas.namaTunggak.length === 0 ? (
                    <p className="text-muted">Tidak ada siswa menunggak.</p>
                  ) : (
                    <p className="text-muted">{kelas.namaTunggak.join(", ")}</p>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-xs text-faint">Klik baris kelas untuk melihat nama yang menunggak.</p>
              )}
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="size-5 text-in" /> Transaksi Terbaru
            </CardTitle>
            <Button className="h-9" onClick={() => setLihatSemua((v) => !v)}>
              {lihatSemua ? "Ringkas" : "Lihat semua"}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
                    <th className="pb-2 font-medium">Tanggal</th>
                    <th className="pb-2 font-medium">No</th>
                    <th className="pb-2 font-medium">Uraian</th>
                    <th className="pb-2 font-medium">Kategori</th>
                    <th className="pb-2 text-right font-medium">Jumlah</th>
                  </tr>
                </thead>
                <tbody>
                  {baris.map((t) => (
                    <tr key={t.id} className="border-b border-line last:border-0">
                      <td className="py-2.5 text-muted">{t.tanggal}</td>
                      <td className="py-2.5 font-medium tabular-nums">{t.id}</td>
                      <td className="py-2.5">{t.uraian}</td>
                      <td className="py-2.5 text-muted">{t.kategori}</td>
                      <td className={`py-2.5 text-right font-semibold tabular-nums ${t.jenis === "masuk" ? "text-in" : "text-out"}`}>
                        {t.jenis === "masuk" ? "+" : "−"}{rupiah(t.jumlah)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCheck className="size-5 text-primary" /> Pusat Laporan
            </CardTitle>
            <Button onClick={() => setBukaLaporan(true)}>
              <Plus className="size-4" /> Buat laporan baru
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {laporan.map((l) => (
              <div
                key={l.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line p-3"
              >
                <div>
                  <p className="text-sm font-medium">{l.nama}</p>
                  <p className="text-xs text-muted">{l.jenis} · {l.tanggal}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    tone={
                      l.status === "Final"
                        ? "in"
                        : l.status === "Draft"
                          ? "outline"
                          : "warn"
                    }
                  >
                    {l.status}
                  </Badge>
                  <Button
                    className="h-8 px-2"
                    aria-label={`Unduh ${l.nama}`}
                    onClick={() =>
                      unduh(
                        `${l.nama.replace(/\s+/g, "-").toLowerCase()}.txt`,
                        `${l.nama}\n${l.jenis} · ${l.tanggal}\nStatus: ${l.status}\n`,
                      )
                    }
                  >
                    <Download className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Modal open={bukaCatat} onOpenChange={setBukaCatat} title="Catat transaksi">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            simpanTransaksi();
          }}
        >
          <Field label="Jenis">
            <select
              className={fieldClass}
              value={form.jenis}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  jenis: e.target.value as JenisTransaksi,
                  kategori: e.target.value === "masuk" ? "SPP" : "Operasional",
                }))
              }
            >
              <option value="masuk">Pemasukan</option>
              <option value="keluar">Pengeluaran</option>
            </select>
          </Field>
          <Field label="Uraian">
            <input
              className={fieldClass}
              value={form.uraian}
              onChange={(e) => setForm((f) => ({ ...f, uraian: e.target.value }))}
              placeholder="Contoh: SPP Nov — Nama siswa"
            />
          </Field>
          <Field label="Kategori">
            <select
              className={fieldClass}
              value={form.kategori}
              onChange={(e) => setForm((f) => ({ ...f, kategori: e.target.value }))}
            >
              {kategori.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Jumlah (Rp)">
            <input
              className={fieldClass}
              inputMode="numeric"
              value={form.jumlah}
              onChange={(e) => setForm((f) => ({ ...f, jumlah: e.target.value }))}
              placeholder="450000"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={() => setBukaCatat(false)}>Batal</Button>
            <Button tone="solid" type="submit">
              Simpan
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={bukaLaporan} onOpenChange={setBukaLaporan} title="Buat laporan baru">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            simpanLaporan();
          }}
        >
          <Field label="Nama laporan">
            <input
              className={fieldClass}
              value={laporanBaru.nama}
              onChange={(e) => setLaporanBaru((l) => ({ ...l, nama: e.target.value }))}
              placeholder="Laporan Keuangan Bulanan — November 2026"
            />
          </Field>
          <Field label="Jenis berkas">
            <select
              className={fieldClass}
              value={laporanBaru.jenis}
              onChange={(e) =>
                setLaporanBaru((l) => ({ ...l, jenis: e.target.value as "PDF" | "Excel" }))
              }
            >
              <option value="PDF">PDF</option>
              <option value="Excel">Excel</option>
            </select>
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={() => setBukaLaporan(false)}>Batal</Button>
            <Button tone="solid" type="submit">
              Simpan draf
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
