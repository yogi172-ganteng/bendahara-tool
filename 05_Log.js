// ============================================================
// LOG AUDIT
// ============================================================
// Pelaku diambil dari sesi yang telah diverifikasi server (bukan dari
// Session.getActiveUser yang tidak reliable di mode "Execute as: Me").
// Pelaku opsional: untuk login yang dicatat sebelum sesi terbentuk,
// pemanggil meneruskan email yang sudah divalidasi.
function catatLog_(aksi, objek, detail, pelaku) {
  try {
    let akun = '';
    if (pelaku) {
      akun = keyEmail_(pelaku);
    } else {
      try {
        const sesi = getSesi().data || {};
        akun = keyEmail_(sesi.email || '');
      } catch (e) { /* abaikan */ }
    }
    if (!akun) akun = keyEmail_(emailAktif());
    tulisBaris_('LOG', {
      Waktu: waktuIso_(),
      Akun: akun,
      Aksi: String(aksi || ''),
      Objek: String(objek === null || objek === undefined ? '' : objek),
      Detail: detail === null || detail === undefined ? '' : JSON.stringify(detail)
    });
  } catch (e) {
    Logger.log('catatLog_ gagal: ' + e.message);
  }
}
