/*
 * Karar Sorgu botu (tahirdogan.info/buro/karar-sorgu)
 *
 * İmza Pro (UYAP Avukat Portal) sayfasında "Karar Sorgu" yer imiyle açılır. Excel'deki
 * itirazın iptali davalarını mahkeme + esas numarasıyla arar (önce açık, sonra kapalı
 * dosyalar), gerekçeli kararı, ek kararı ve dava dilekçesini okur; reddedilen kalemleri,
 * tutarları ve kesinleşmeyi Excel'in N, O, R-Y sütunlarına yazar.
 *
 * Yalnız sorgular: talep göndermez, ücretli sorgu yapmaz, giriş yapmaz. Veriyi dışarı
 * göndermez; Excel tarayıcıda okunur ve yazılır.
 *
 * UYAP istekleri (24 Kasım 2026'da İmza Pro üzerinden açık oturumda gözlendi):
 *   avukat_mahkemeleri_sorgula.ajx  { yargiTuru: '1', yargiBirimi, dosyaKapaliMi }  mahkeme listesi
 *   search_phrase_detayli.ajx       { dosyaDurumKod: 0 açık | 1 kapalı, dosyaYil, dosyaSira, birimId, birimTuru2, birimTuru3: '1' }
 *   list_dosya_evraklar.ajx         { dosyaId, pageNumber }  evrak listesi
 *   view_document_brd.uyap          ?evrakId&dosyaId  evrak (UDF: içinde content.xml olan zip; ya da PDF)
 * Hukuk yargı birimi kodları: Asliye Ticaret 0902, Tüketici 0912, Asliye Hukuk 0920,
 * Sulh Hukuk 0904, İcra Hukuk 0925, İş 0908.
 */
(function (kok) {
  'use strict';

  const KS = {};
  const SURUM = '1.0.2';

  /* ---------- Metin ve sayı ---------- */
  function metin(v) { return v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim(); }
  function buyuk(v) { return metin(v).toLocaleUpperCase('tr'); }
  function yuvarla(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
  /* "1.234,56" / "392,50" / "1234.56" / "0.02" -> sayı */
  function sayi(s) {
    let t = String(s === null || s === undefined ? '' : s).replace(/\s/g, '').replace(/-+$/, '');
    if (!t) return null;
    if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    const n = parseFloat(t);
    return isFinite(n) ? n : null;
  }
  const N = '(\\d{1,3}(?:\\.\\d{3})+(?:,\\d{1,2})?|\\d+(?:,\\d{1,2})?)';
  const TL = '\\s*-?\\s*(?:TL|₺)';
  function ilk(metinS, kalip) { const m = metinS.match(kalip); return m ? sayi(m[1]) : null; }
  KS.sayi = sayi;

  /* ---------- Mahkeme ve dosya numarası ---------- */
  /* "Y: İSTANBUL 12. TÜKETİCİ\nE: İSTANBUL 15. ASLİYE TİCARET" gibi hücrelerde yeni (Y) değer alınır */
  function yeniDeger(v) {
    const s = String(v === null || v === undefined ? '' : v);
    const m = s.match(/(?:^|\n)\s*Y\s*:\s*([^\n]+)/i);
    return metin(m ? m[1] : s);
  }
  function mahkemeDuz(v) {
    return buyuk(v).replace(/^T\.?\s?C\.?\s+/, '').replace(/MAHKEMESİ/g, '').replace(/(\d+)\s*\.\s*/g, '$1. ')
      .replace(/[^A-ZÇĞİÖŞÜ0-9. ]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function birimTuru(ad) {
    const b = buyuk(ad);
    if (/TÜKETİCİ/.test(b)) return '0912';
    if (/ASLİYE TİCARET/.test(b)) return '0902';
    if (/ASLİYE HUKUK/.test(b)) return '0920';
    if (/SULH HUKUK/.test(b)) return '0904';
    if (/İCRA HUKUK/.test(b)) return '0925';
    if (/(^| )İŞ( |$)/.test(b)) return '0908';
    return null;
  }
  function esasNo(v) {
    const m = yeniDeger(v).match(/(\d{4})\s*\/\s*(\d+)/);
    return m ? { yil: m[1], sira: String(+m[2]), no: m[1] + '/' + (+m[2]) } : null;
  }
  KS.mahkemeDuz = mahkemeDuz; KS.birimTuru = birimTuru; KS.esasNo = esasNo; KS.yeniDeger = yeniDeger;

  /* ---------- Dava dilekçesindeki talep ---------- */
  /*
   * Büronun dilekçe kalıbı: "İcra takibinin geçiş ücreti ve gecikme cezası olmak üzere toplam
   * 432,75 TL Alacak ile bu alacağa takip tarihinden önce işlemiş Faiz (85,27 TL) ve KDV
   * (15,35 TL) yönünden toplam 533,37 TL takip talebinde gösterilen şartlarla devamına".
   * Geçiş ücreti ile ceza ayrı yazılmamışsa ceza ücretin dört katıdır (6001 s.K. m.30/5):
   * asıl alacak 1/5 ücret, 4/5 ceza diye ayrılır.
   */
  KS.talepCoz = function (ham) {
    const T = metin(ham);
    const bolum = (function () {
      const i = T.search(/SONUÇ\s*(?:VE|ve)\s*(?:TALEP|İSTEM|talep|istem)/i);
      return i >= 0 ? T.slice(i) : T;
    })();
    const r = { asil: null, ucret: null, ceza: null, faiz: null, kdv: null, toplam: null, icraInkar: false, icraInkarOran: 20, notlar: [] };
    r.asil = ilk(bolum, new RegExp('olmak üzere toplam\\s*' + N + TL, 'i'))
      ?? ilk(T, new RegExp('olmak üzere toplam\\s*' + N + TL, 'i'))
      ?? ilk(bolum, new RegExp(N + TL + '\\s*(?:asıl\\s*)?alacak', 'i'));
    r.faiz = ilk(bolum, new RegExp('işlemiş\\s*faiz\\s*\\(\\s*' + N + TL + '\\s*\\)', 'i'))
      ?? ilk(bolum, new RegExp(N + TL + '\\s*(?:takip öncesi\\s*)?işlemiş\\s*faiz', 'i'));
    r.kdv = ilk(bolum, new RegExp('KDV\\s*\\(\\s*' + N + TL + '\\s*\\)', 'i'))
      ?? ilk(bolum, new RegExp(N + TL + '\\s*KDV', 'i'));
    r.toplam = ilk(bolum, new RegExp('yönünden toplam\\s*' + N + TL, 'i'))
      ?? ilk(T, new RegExp('HARCA ESAS DEĞER\\s*:?\\s*' + N + TL, 'i'));
    r.ucret = ilk(bolum, new RegExp(N + TL + '\\s*(?:ihlalli\\s*)?geçiş\\s*ücreti', 'i'));
    r.ceza = ilk(bolum, new RegExp(N + TL + '\\s*(?:gecikme\\s*|idari\\s*para\\s*)?ceza', 'i'));
    const ii = bolum.match(/%\s*(\d{1,2})[^.]{0,80}?icra\s*ink[aâ]r|icra\s*ink[aâ]r[^.]{0,120}?%\s*(\d{1,2})/i);
    r.icraInkar = /icra\s*ink[aâ]r/i.test(bolum) || /icra\s*ink[aâ]r/i.test(T);
    if (ii) r.icraInkarOran = +(ii[1] || ii[2]);
    if (r.asil !== null && r.toplam !== null && r.faiz === null && r.kdv === null && Math.abs(r.asil - r.toplam) < 0.01) { r.faiz = 0; r.kdv = 0; }
    if (r.asil !== null && r.toplam !== null && r.faiz !== null && r.kdv === null && Math.abs(r.asil + r.faiz - r.toplam) < 0.01) r.kdv = 0;
    if (r.asil === null && r.toplam !== null && r.faiz !== null && r.kdv !== null) r.asil = yuvarla(r.toplam - r.faiz - r.kdv);
    if (r.asil !== null && r.faiz !== null && r.kdv !== null && r.toplam !== null && Math.abs(r.asil + r.faiz + r.kdv - r.toplam) > 0.05) {
      r.notlar.push('Dilekçedeki kalemler toplamı tutmuyor');
    }
    if (r.ucret !== null && r.ceza !== null && r.asil !== null && Math.abs(r.ucret + r.ceza - r.asil) > 0.05) { r.ucret = null; r.ceza = null; }
    return r;
  };

  /* ---------- Hüküm ---------- */
  KS.hukumAyikla = function (ham) {
    const s = String(ham || '');
    const re = /H\s*Ü\s*K\s*Ü\s*M\s*[\/:\-;]|Yukarıda\s+açıklanan\s+nedenlerle|Gerekçesi\s+yukarıda\s+açıklandığı\s+üzere|Açıklanan\s+nedenlerle/gi;
    let son = -1, x;
    while ((x = re.exec(s))) son = x.index;
    if (son < 0) return '';
    let h = s.slice(son);
    const bit = h.search(/YARGILAMA\s+GİDERLERİ|\n\s*Katip\s|\n\s*Hakim\s|e-imzalıdır/i);
    if (bit > 0) h = h.slice(0, bit);
    return h.slice(0, 6000);
  };

  KS.hukumCoz = function (h) {
    const H = buyuk(h).replace(/İNKÂR/g, 'İNKAR');
    const r = { sonuc: null, kabul: { asil: null, faiz: null, kdv: null, toplam: null }, red: {}, takipTalebindeki: false, kesin: false, takipSonrasiFaizKabul: false };
    if (!H) return r;
    if (/KISMEN\s+KABUL/.test(H)) r.sonuc = 'KISMEN KABUL';
    else if (/(KARAR\s+VERİLMESİNE|HÜKÜM\s+KURULMASINA|HÜKÜM\s+OLUŞTURULMASINA)\s+YER\s+OLMADIĞINA/.test(H) && !/AÇILMAMIŞ\s+SAYIL/.test(H)) r.sonuc = 'KARAR VERİLMESİNE YER OLMADIĞINA';
    else if (/AÇILMAMIŞ\s+SAYIL(A)?MASINA/.test(H)) r.sonuc = 'AÇILMAMIŞ SAYILMASINA';
    else if (/KONUSUZ\s+KAL/.test(H)) r.sonuc = 'KONUSUZ';
    else if (/(DAVANIN|DAVACININ\s+DAVASININ)\s+(ESASTAN\s+|USULDEN\s+|TAMAMEN\s+)?REDDİNE/.test(H)) r.sonuc = 'RED';
    else if (/KABULÜ(NE|\s+İLE)|KABULÜNE/.test(H)) r.sonuc = 'KABUL';
    const dev = H.match(/TAKİBİN([\s\S]{0,500}?)DEVAMINA/) || H.match(/İTİRAZIN([\s\S]{0,400}?)İPTALİNE/);
    if (dev) {
      const c = dev[1];
      r.kabul.asil = ilk(c, new RegExp(N + TL + '\\s*(?:ASIL\\s*ALACAK|ALACAK)'));
      r.kabul.faiz = ilk(c, new RegExp(N + TL + '\\s*(?:TAKİP\\s*ÖNCESİ\\s*)?İŞLEMİŞ\\s*FAİZ'));
      r.kabul.kdv = ilk(c, new RegExp(N + TL + '\\s*(?:FAİZE\\s*İŞLEMİŞ\\s*)?KDV'));
      r.kabul.toplam = ilk(c, new RegExp('TOPLAM\\s*' + N + TL));
      r.takipTalebindeki = /TAKİP\s+TALEBİNDEKİ|TAKİP\s+TALEBİNDE\s+GÖSTERİLEN|ÖDEME\s+EMRİNDEKİ|AYNEN/.test(c) || (!r.kabul.asil && !r.kabul.toplam);
    }
    r.red.icraInkar = /İCRA\s*İNKAR[^.;\n]{0,120}REDDİNE/.test(H);
    r.icraInkarAnilmadi = !/İCRA\s*İNKAR/.test(H);
    r.red.fazla = /FAZLAYA\s+İLİŞKİN[^.;\n]{0,60}REDDİNE/.test(H);
    r.red.faiz = /(İŞLEMİŞ\s+)?FAİZ(?!E\s+İŞLEMİŞ)[^.;\n]{0,60}TALEB[^.;\n]{0,30}REDDİNE/.test(H);
    r.red.kdv = /KDV[^.;\n]{0,60}REDDİNE/.test(H);
    r.red.takipSonrasiFaiz = /TAKİP\s+(TARİHİNDEN\s+)?SONRA[^.;\n]{0,100}FAİZ[^.;\n]{0,80}REDDİNE/.test(H);
    r.takipSonrasiFaizKabul = /TAKİP\s+TARİHİNDEN\s+İTİBAREN[^.;\n]{0,120}FAİZ/.test(H);
    r.kesin = /KESİN\s+OLMAK\s+ÜZERE|KESİN\s+OLARAK|KESİN\s+OLUP/.test(H) && !/İSTİNAF\s+YOLU\s+AÇIK|İSTİNAF\s+KANUN\s+YOLU\s+AÇIK/.test(H);
    return r;
  };

  /* ---------- Hesap ---------- */
  const SONUCSUZ = ['KARAR VERİLMESİNE YER OLMADIĞINA', 'AÇILMAMIŞ SAYILMASINA', 'KONUSUZ'];
  KS.hesapla = function (t, hk) {
    const s = { S: 0, T: 0, U: 0, V: 0, W: 0, kalemler: [], faizKdv: [], notlar: [], tamam: true };
    if (!hk || !hk.sonuc) { s.tamam = false; s.notlar.push('Hüküm okunamadı'); return s; }
    if (SONUCSUZ.indexOf(hk.sonuc) !== -1) { s.notlar.push('Esas hakkında karar yok (' + hk.sonuc.toLocaleLowerCase('tr') + '); reddedilen kalem yazılmadı'); return s; }
    const k = hk.kabul;
    if (!t || t.asil === null) {
      const temiz = !hk.red.faiz && !hk.red.kdv && !hk.red.takipSonrasiFaiz && !hk.red.fazla;
      if (hk.sonuc === 'KABUL' && k.asil !== null) {
        /* Kabul kararında talep, hükümde kabul edilen tutara eşittir */
        t = { asil: k.asil, faiz: k.faiz || 0, kdv: k.kdv || 0, ucret: null, ceza: null, toplam: null, icraInkar: t ? t.icraInkar : true, icraInkarOran: (t && t.icraInkarOran) || 20 };
        s.notlar.push('Dilekçede kalemler ayrı yazılmamış; kabul kararı olduğundan hükümdeki tutarlar talep sayıldı');
      } else if (hk.sonuc === 'KABUL' && hk.takipTalebindeki && temiz) {
        return s;
      } else {
        s.tamam = false;
        const kt = k.toplam !== null ? k.toplam : (k.asil !== null && k.faiz === null && k.kdv === null ? k.asil : null);
        if (t && t.toplam !== null && kt !== null) s.notlar.push('Talep toplamı ' + t.toplam + ' TL, kabul edilen ' + kt + ' TL: reddedilen yaklaşık ' + yuvarla(t.toplam - kt) + ' TL. Dilekçede asıl alacak, faiz ve KDV ayrı yazılmadığı için kalemler ayrılamadı; elle bakın');
        else s.notlar.push('Dava dilekçesindeki talep kalemleri okunamadı; elle bakın');
        return s;
      }
    }
    const tf = t.faiz || 0, tk = t.kdv || 0;
    let ra = 0, rf = 0, rk = 0;
    if (hk.sonuc === 'RED') { ra = t.asil; rf = tf; rk = tk; }
    else {
      if (k.asil !== null) ra = Math.max(0, t.asil - k.asil);
      else if (k.toplam !== null && k.faiz === null && k.kdv === null && !hk.takipTalebindeki) {
        s.tamam = false; s.notlar.push('Hükümde yalnız toplam tutar var (' + k.toplam + ' TL); kalemler ayrılamadı');
      } else if (hk.sonuc === 'KISMEN KABUL' && !hk.takipTalebindeki) {
        s.tamam = false; s.notlar.push('Kısmen kabul, ama kabul edilen tutar hükümden okunamadı');
      }
      const yalnizAsil = k.asil !== null && k.faiz === null && k.kdv === null && !hk.takipTalebindeki;
      if (k.faiz !== null) rf = Math.max(0, tf - k.faiz);
      else if (hk.red.faiz || (yalnizAsil && tf > 0)) rf = tf;
      if (k.kdv !== null) rk = Math.max(0, tk - k.kdv);
      else if (hk.red.kdv || (yalnizAsil && tk > 0) || (rf >= tf && tf > 0 && tk > 0 && k.faiz === null)) rk = tk;
      if (yalnizAsil && (tf > 0 || tk > 0)) s.notlar.push('Hüküm yalnız asıl alacak üzerinden devam diyor; işlemiş faiz ve KDV reddedilmiş sayıldı');
      if (hk.sonuc === 'KABUL' && (ra > 0 || rf > 0 || rk > 0)) s.notlar.push('Hüküm "kabul" diyor ama kabul edilen tutar talepten az');
    }
    ra = yuvarla(ra); rf = yuvarla(rf); rk = yuvarla(rk);
    if (ra > 0) {
      if (t.ucret !== null && t.ceza !== null && t.asil > 0) { s.U = yuvarla(ra * t.ucret / t.asil); s.V = yuvarla(ra - s.U); }
      else { s.U = yuvarla(ra / 5); s.V = yuvarla(ra - s.U); s.notlar.push('Reddedilen asıl alacak geçiş ücreti ve cezaya 1/4 oranıyla ayrıldı'); }
    }
    s.S = rf; s.T = rk;
    /* Büro kuralı (Tahir, 24.11.2026): reddedilen icra inkâr tazminatı reddedilen kalem ve tutara sayılmaz; W her zaman YOK */
    if (hk.red.icraInkar && t.icraInkar) s.notlar.push('İcra inkâr talebi reddedilmiş; büro kuralı gereği sayılmadı');
    if (s.U > 0) s.kalemler.push('GEÇİŞ ÜCRETİ');
    if (s.V > 0) s.kalemler.push('GECİKME CEZASI');
    if (s.S > 0 || hk.red.takipSonrasiFaiz) s.kalemler.push('FAİZ');
    if (s.T > 0) s.kalemler.push('KDV');
    if (s.S > 0) s.faizKdv.push('TAKİP ÖNCESİ FAİZ');
    if (hk.red.takipSonrasiFaiz) s.faizKdv.push('TAKİP SONRASI FAİZ');
    if (s.T > 0) s.faizKdv.push('KDV');
    return s;
  };

  /* ---------- Kesinleşme ve aşama ---------- */
  KS.asama = function (evraklar, hk) {
    const turler = (evraklar || []).map(function (e) { return buyuk(e.tur); });
    const kesinlesme = turler.some(function (t) { return /KESİNLEŞME/.test(t) && !/TALEP|DİLEKÇE/.test(t); });
    const istinaf = turler.some(function (t) { return /İSTİNAF/.test(t); });
    const temyiz = turler.some(function (t) { return /TEMYİZ|YARGITAY/.test(t); });
    if (kesinlesme) return { X: 'KESİNLEŞTİ', Y: 'HİTAM', neden: 'Dosyada kesinleşme evrakı var', ustMahkeme: istinaf || temyiz };
    if (hk && hk.kesin) return { X: 'KESİNLEŞTİ', Y: 'HİTAM', neden: 'Karar kesin olarak verilmiş' };
    if (temyiz) return { X: 'KESİNLEŞMEDİ', Y: 'TEMYİZ', neden: 'Dosyada temyiz evrakı var' };
    if (istinaf) return { X: 'KESİNLEŞMEDİ', Y: 'İSTİNAF', neden: 'Dosyada istinaf evrakı var' };
    if (!hk || !hk.sonuc) return { X: 'KESİNLEŞMEDİ', Y: 'DERDEST', neden: 'Karar evrakı yok' };
    return { X: 'KESİNLEŞMEDİ', Y: 'KESİNLEŞME BEKLENİYOR', neden: 'Karar var, kesinleşme evrakı yok' };
  };

  /* Excel'e yazılacak değerler: tutar yoksa "YOK", hesaplanamadıysa yalnız X ve Y */
  KS.hucreler = function (h, a) {
    const t = function (n) { return n > 0.004 ? yuvarla(n) : 'YOK'; };
    const o = { X: a.X, Y: a.Y };
    if (!h.tamam) return o;
    const top = yuvarla(h.S + h.T + h.U + h.V + h.W);
    o.N = h.kalemler.length ? h.kalemler.join(', ') : 'YOK';
    o.O = h.faizKdv.length ? h.faizKdv.join(', ') : 'YOK';
    o.R = t(top); o.S = t(h.S); o.T = t(h.T); o.U = t(h.U); o.V = t(h.V); o.W = t(h.W);
    return o;
  };

  /* ---------- Zip (xlsx ve UDF) ---------- */
  const CRC = (function () { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  async function akisla(bayt, akim) { return new Uint8Array(await new Response(new Blob([bayt]).stream().pipeThrough(akim)).arrayBuffer()); }
  function zipOku(bayt) {
    const dv = new DataView(bayt.buffer, bayt.byteOffset, bayt.byteLength);
    let e = bayt.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('Dosya zip değil');
    const adet = dv.getUint16(e + 10, true);
    let p = dv.getUint32(e + 16, true);
    const g = [];
    for (let i = 0; i < adet; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Zip dizini bozuk');
      const yontem = dv.getUint16(p + 10, true), crc = dv.getUint32(p + 16, true), sb = dv.getUint32(p + 20, true), hb = dv.getUint32(p + 24, true);
      const al = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
      const ad = new TextDecoder().decode(bayt.subarray(p + 46, p + 46 + al));
      const bas = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
      g.push({ ad: ad, yontem: yontem, crc: crc, sikili: bayt.subarray(bas, bas + sb), hamBoy: hb });
      p += 46 + al + el + cl;
    }
    return g;
  }
  async function girdiMetni(g) {
    const b = g.yontem === 0 ? g.sikili : await akisla(g.sikili, new DecompressionStream('deflate-raw'));
    return new TextDecoder().decode(b);
  }
  async function girdiYap(ad, metinS) {
    const ham = new TextEncoder().encode(metinS);
    return { ad: ad, yontem: 8, crc: crc32(ham), sikili: await akisla(ham, new CompressionStream('deflate-raw')), hamBoy: ham.length };
  }
  function zipYaz(girdiler) {
    const enc = new TextEncoder(), parcalar = [], dizin = [];
    let ofs = 0;
    girdiler.forEach(function (g) {
      const ad = enc.encode(g.ad);
      const h = new Uint8Array(30 + ad.length), v = new DataView(h.buffer);
      v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true); v.setUint16(8, g.yontem, true);
      v.setUint16(12, 0x21, true); v.setUint32(14, g.crc, true); v.setUint32(18, g.sikili.length, true); v.setUint32(22, g.hamBoy, true); v.setUint16(26, ad.length, true);
      h.set(ad, 30);
      const c = new Uint8Array(46 + ad.length), w = new DataView(c.buffer);
      w.setUint32(0, 0x02014b50, true); w.setUint16(4, 20, true); w.setUint16(6, 20, true); w.setUint16(8, 0x0800, true); w.setUint16(10, g.yontem, true);
      w.setUint16(14, 0x21, true); w.setUint32(16, g.crc, true); w.setUint32(20, g.sikili.length, true); w.setUint32(24, g.hamBoy, true); w.setUint16(28, ad.length, true);
      w.setUint32(42, ofs, true); c.set(ad, 46);
      parcalar.push(h, g.sikili); dizin.push(c);
      ofs += h.length + g.sikili.length;
    });
    const dboy = dizin.reduce(function (t, c) { return t + c.length; }, 0);
    const son = new Uint8Array(22), s = new DataView(son.buffer);
    s.setUint32(0, 0x06054b50, true); s.setUint16(8, girdiler.length, true); s.setUint16(10, girdiler.length, true); s.setUint32(12, dboy, true); s.setUint32(16, ofs, true);
    return new Blob(parcalar.concat(dizin, [son]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /* UDF: UYAP'ın belge biçimi; content.xml içinde CDATA metin */
  KS.udfMetni = async function (bayt) {
    const g = zipOku(bayt).find(function (x) { return x.ad === 'content.xml'; });
    if (!g) throw new Error('UDF içinde content.xml yok');
    const x = await girdiMetni(g);
    const m = x.match(/<content>([\s\S]*?)<\/content>/);
    const ic = m ? m[1] : x;
    return ic.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  };

  /* ---------- Excel ---------- */
  const COZ = { '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': '\'', '&amp;': '&' };
  function xmlCoz(s) { return String(s).replace(/&(lt|gt|quot|apos|amp);/g, function (m) { return COZ[m]; }).replace(/&#(x?)([0-9a-fA-F]+);/g, function (m, x, d) { return String.fromCodePoint(parseInt(d, x ? 16 : 10)); }); }
  function xmlKac(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function sutunNo(h) { let n = 0; for (let i = 0; i < h.length; i++) n = n * 26 + h.charCodeAt(i) - 64; return n; }
  function hucreAyir(r) { const m = r.match(/^([A-Z]+)(\d+)$/); return { s: m[1], r: +m[2] }; }

  const BASLIKLAR = {
    no: /^NO$/, davali: /^DAVALI$/, daire: /İCRA MÜDÜRLÜĞÜ/, icraNo: /İCRA DOSYA NO/, mahkeme: /MAHKEME BİLGİ/, esas: /MAHKEME DOSYA NO/,
    muddeabih: /MÜDDEABİH/, karar: /^KARAR$/,
    N: /REDDEDİLEN KALEM/, O: /FAİZ\s*&\s*KDV/, R: /TOPLAM TUTAR/, S: /FAİZ TUTARI/, T: /KDV TUTARI/, U: /GEÇİŞ ÜCRETİ TUTARI/,
    V: /GECİKME CEZASI/, W: /İCRA İNKAR/, X: /KESİNLEŞTİ/, Y: /^AŞAMASI$/
  };
  const YEDEK = { no: 'A', davali: 'D', daire: 'E', icraNo: 'F', mahkeme: 'I', esas: 'J', muddeabih: 'K', karar: 'M', N: 'N', O: 'O', R: 'R', S: 'S', T: 'T', U: 'U', V: 'V', W: 'W', X: 'X', Y: 'Y' };
  const CIKTI = ['N', 'O', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y'];
  KS.CIKTI = CIKTI;

  KS.excelOku = async function (bayt) {
    const g = zipOku(bayt);
    const bul = function (ad) { return g.find(function (x) { return x.ad === ad; }); };
    const wb = await girdiMetni(bul('xl/workbook.xml'));
    const rels = await girdiMetni(bul('xl/_rels/workbook.xml.rels'));
    const sayfa = wb.match(/<sheet\b[^>]*>/);
    const rid = sayfa[0].match(/\br:id="([^"]+)"/)[1];
    const sayfaAdi = xmlCoz((sayfa[0].match(/\bname="([^"]*)"/) || [])[1] || '');
    const rel = rels.match(new RegExp('<Relationship\\b[^>]*\\bId="' + rid + '"[^>]*>'))[0];
    const hedef = rel.match(/Target="([^"]+)"/)[1];
    const yol = hedef.charAt(0) === '/' ? hedef.slice(1) : 'xl/' + hedef.replace(/^\.\//, '');
    const ssG = bul('xl/sharedStrings.xml');
    const ss = [];
    if (ssG) {
      const sx = await girdiMetni(ssG);
      sx.replace(/<si>([\s\S]*?)<\/si>/g, function (m, ic) {
        ic = ic.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
        let t = ''; ic.replace(/<t\b[^>]*>([\s\S]*?)<\/t>/g, function (mm, x) { t += xmlCoz(x); return mm; });
        ss.push(t); return m;
      });
    }
    const xml = await girdiMetni(bul(yol));
    const satirlar = {};
    xml.replace(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, function (m, at, ic) {
      const r = (at.match(/\br="([A-Z]+\d+)"/) || [])[1];
      if (!r || !ic) return m;
      const tur = (at.match(/\bt="([^"]+)"/) || [])[1];
      let v = null;
      if (tur === 'inlineStr') { v = ''; ic.replace(/<t\b[^>]*>([\s\S]*?)<\/t>/g, function (mm, x) { v += xmlCoz(x); return mm; }); }
      else {
        const vv = (ic.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        if (vv === undefined) return m;
        v = tur === 's' ? ss[+vv] : tur === 'str' || tur === 'e' ? xmlCoz(vv) : tur === 'b' ? vv === '1' : Number(vv);
      }
      const a = hucreAyir(r);
      (satirlar[a.r] = satirlar[a.r] || {})[a.s] = v;
      return m;
    });
    const sut = {};
    const bas = satirlar[1] || {};
    Object.keys(BASLIKLAR).forEach(function (k) {
      const s = Object.keys(bas).find(function (h) { return BASLIKLAR[k].test(buyuk(String(bas[h]).replace(/\n/g, ' '))) && (k !== 'O' || !/TUTARI/.test(buyuk(bas[h]))); });
      sut[k] = s || YEDEK[k];
    });
    const enBuyuk = Object.keys(satirlar).reduce(function (a, b) { return Math.max(a, +b); }, 0);
    const kayitlar = [];
    for (let r = 2; r <= enBuyuk; r++) {
      const s = satirlar[r];
      if (!s) continue;
      const deger = function (k) { const v = s[sut[k]]; return v === undefined || v === null ? '' : v; };
      const esas = deger('esas');
      if (!metin(esas)) continue;
      kayitlar.push({
        satir: r, no: deger('no'), davali: metin(deger('davali')), mahkeme: yeniDeger(deger('mahkeme')), esas: yeniDeger(esas),
        daire: metin(deger('daire')), icraNo: metin(deger('icraNo')), muddeabih: typeof deger('muddeabih') === 'number' ? deger('muddeabih') : sayi(deger('muddeabih')),
        karar: metin(deger('karar')), dolu: CIKTI.some(function (c) { return metin(deger(c)) !== ''; })
      });
    }
    return { girdiler: g, sayfaYolu: yol, sayfaAdi: sayfaAdi, xml: xml, sutunlar: sut, kayitlar: kayitlar };
  };

  /* Satırlara değer yazar; hücrenin biçimi (s) korunur. degerler: { satirNo: { N: 'YOK', R: 12.5, ... } } */
  KS.sayfayaYaz = function (xml, sut, degerler) {
    Object.keys(degerler).forEach(function (rs) {
      const r = +rs, d = degerler[rs];
      const satirKalip = new RegExp('<row\\b[^>]*\\br="' + r + '"[^>]*?(?:/>|>([\\s\\S]*?)</row>)');
      let m = xml.match(satirKalip);
      if (!m) {
        const yeni = '<row r="' + r + '"></row>';
        const sonraki = (function () { const re = /<row\b[^>]*\br="(\d+)"/g; let x; while ((x = re.exec(xml))) if (+x[1] > r) return x.index; return -1; })();
        xml = sonraki >= 0 ? xml.slice(0, sonraki) + yeni + xml.slice(sonraki) : xml.replace('</sheetData>', yeni + '</sheetData>');
        m = xml.match(satirKalip);
      }
      let satirXml = m[0];
      if (/\/>$/.test(satirXml) && !/<\/row>$/.test(satirXml)) satirXml = satirXml.replace(/\s*\/>$/, '></row>');
      Object.keys(d).forEach(function (k) {
        const harf = sut[k] || k, ref = harf + r, v = d[k];
        const hk = new RegExp('<c\\b[^>]*\\br="' + ref + '"[^>]*?(?:/>|>[\\s\\S]*?</c>)');
        const eski = satirXml.match(hk);
        const stil = eski ? (eski[0].match(/\bs="(\d+)"/) || [])[1] : null;
        const sa = stil ? ' s="' + stil + '"' : '';
        const yeni = typeof v === 'number'
          ? '<c r="' + ref + '"' + sa + '><v>' + v + '</v></c>'
          : '<c r="' + ref + '"' + sa + ' t="inlineStr"><is><t xml:space="preserve">' + xmlKac(v) + '</t></is></c>';
        if (eski) { satirXml = satirXml.replace(eski[0], yeni); return; }
        const no = sutunNo(harf);
        const re = /<c\b[^>]*\br="([A-Z]+)\d+"/g;
        let x, yer = -1;
        while ((x = re.exec(satirXml))) if (sutunNo(x[1]) > no) { yer = x.index; break; }
        satirXml = yer >= 0 ? satirXml.slice(0, yer) + yeni + satirXml.slice(yer) : satirXml.replace(/<\/row>$/, yeni + '</row>');
      });
      xml = xml.replace(m[0], satirXml);
    });
    return xml;
  };

  KS.excelYaz = async function (okunan, degerler) {
    const xml = KS.sayfayaYaz(okunan.xml, okunan.sutunlar, degerler);
    const yeni = await girdiYap(okunan.sayfaYolu, xml);
    const girdiler = okunan.girdiler.map(function (g) { return g.ad === okunan.sayfaYolu ? yeni : g; });
    return zipYaz(girdiler);
  };

  /* ---------- UYAP bağlantısı (yalnız sayfada) ---------- */
  const CAPTCHA = ['PRTL_GNL_100063', 'PRTL_GNL_100063-1'];
  const OTURUM = ['PRTL_GNL_100026', 'PRTL_GNL_100026-1', 'PRTL_GNL_100032'];
  const MESGUL = 'PRTL_GNL_10001-61';
  function dur(kod, mesaj) { const e = new Error(mesaj || kod); e.kod = kod; return e; }

  KS.baglanti = function (o) {
    o = o || {};
    const getir = o.fetch || kok.fetch.bind(kok);
    const uyapMi = /(^|\.)uyap\.gov\.tr$/.test(kok.location.hostname);
    let onek = null, sonIstek = 0, aralik = o.aralik || 4000;
    const birimOnbellek = {};
    function yolOneki() {
      if (uyapMi) return '/';
      if (onek) return onek;
      try {
        const pencereler = [kok];
        kok.document.querySelectorAll('iframe').forEach(function (f) { try { if (f.contentWindow) pencereler.push(f.contentWindow); } catch (e) { /* başka köken */ } });
        for (let p = 0; p < pencereler.length; p++) {
          const g = pencereler[p].performance.getEntriesByType('resource');
          for (let i = g.length - 1; i >= 0; i--) {
            const m = String(g[i].name).match(/^(https?:\/\/[^\/]+)(\/(?:[^\/?#]+\/)*)[A-Za-z0-9_]+\.(?:ajx|uyap)(?:[?#]|$)/);
            if (m && m[1] === kok.location.origin && !/ptt_barkod/.test(g[i].name)) { onek = m[2]; return onek; }
          }
        }
      } catch (e) { /* yoksay */ }
      return '/' + kok.location.host + '/';
    }
    function basliklar(b) {
      const h = { 'Accept': 'application/json, text/plain, */*', 'Content-Type': 'application/json' };
      if (uyapMi || !b) return h;
      const k = function (v) { return encodeURIComponent(v === undefined || v === null || v === '' ? 'undefined' : v); };
      h['X-Dosya-No'] = k(b.dosyaNo); h['X-Birim-Turu2'] = k(b.birimTuru2); h['X-Birim-Id'] = k(b.birimId);
      h['X-Birim-Adi'] = k(b.birimAdi); h['X-Borclu'] = k(''); h['X-Dosya-Durum'] = k(b.dosyaDurum);
      return h;
    }
    async function cagri(url, secenek) {
      const gecen = Date.now() - sonIstek;
      if (sonIstek && gecen < aralik) await new Promise(function (r) { setTimeout(r, aralik - gecen); });
      sonIstek = Date.now();
      let y;
      try { y = await getir(url, secenek); } catch (e) { throw new Error('Bağlantı kurulamadı'); }
      if (y.status === 401) throw dur('OTURUM', 'Oturum kapanmış');
      if (y.status === 403 || y.status === 429) throw dur('KISIT', 'UYAP erişimi kısıtladı');
      return y;
    }
    async function istek(uc, govde, b) {
      for (let deneme = 0; ; deneme++) {
        const y = await cagri(yolOneki() + uc, { method: 'POST', credentials: 'include', headers: basliklar(b), body: JSON.stringify(govde || {}) });
        const ham = await y.text();
        let v;
        try { v = JSON.parse(ham); } catch (e) {
          if (/nosessionobject/i.test(ham) || /<html|<!doctype/i.test(ham.slice(0, 400))) throw dur('OTURUM', 'Oturum kapanmış');
          throw new Error('UYAP anlaşılır yanıt vermedi (' + y.status + ')');
        }
        const kod = v && !Array.isArray(v) && v.errorCode;
        if (kod) {
          if (CAPTCHA.indexOf(kod) !== -1) throw dur('CAPTCHA', 'UYAP güvenlik doğrulaması istedi');
          if (OTURUM.indexOf(kod) !== -1) throw dur('OTURUM', 'Oturum kapanmış');
          if (kod === MESGUL && deneme < 2) { await new Promise(function (r) { setTimeout(r, 20000); }); continue; }
          throw new Error(metin(v.error || v.message || 'UYAP hata döndürdü') + ' (' + kod + ')');
        }
        return v;
      }
    }
    async function birimBul(kod, ad) {
      const aranan = mahkemeDuz(ad);
      for (const kapali of [false, true]) {
        const anahtar = kod + (kapali ? 'k' : 'a');
        if (!birimOnbellek[anahtar]) {
          const l = await istek('avukat_mahkemeleri_sorgula.ajx', { yargiTuru: '1', yargiBirimi: kod, dosyaKapaliMi: kapali });
          birimOnbellek[anahtar] = (Array.isArray(l) ? l : []).filter(function (b) { return b && b.birimId; }).map(function (b) { return { ad: metin(b.birimAdi), duz: mahkemeDuz(b.birimAdi), birimId: String(b.birimId) }; });
        }
        const tam = birimOnbellek[anahtar].filter(function (b) { return b.duz === aranan; });
        if (tam.length === 1) return tam[0];
      }
      return null;
    }
    async function dosyaBul(mahkeme, esas) {
      const kod = birimTuru(mahkeme);
      if (!kod) throw dur('ATLA', 'Mahkeme türü tanınmadı: ' + mahkeme);
      const e = esasNo(esas);
      if (!e) throw dur('ATLA', 'Esas numarası yıl/sıra biçiminde değil');
      const birim = await birimBul(kod, mahkeme);
      if (!birim) throw dur('ATLA', 'Mahkeme UYAP listesinde bulunamadı: ' + mahkeme);
      const b = { dosyaNo: e.no, birimTuru2: kod, birimId: birim.birimId, birimAdi: birim.ad, dosyaDurum: 'Açık' };
      for (const durum of [0, 1]) {
        const r = await istek('search_phrase_detayli.ajx', { dosyaDurumKod: durum, pageSize: 500, pageNumber: 1, dosyaYil: e.yil, dosyaSira: e.sira, birimId: birim.birimId, birimTuru2: kod, birimTuru3: '1' }, b);
        let u = (Array.isArray(r) && Array.isArray(r[0]) ? r[0] : []).filter(function (d) { return d && metin(d.dosyaNo) === e.no; });
        if (u.length > 1) u = u.filter(function (d) { return d.dosyaTurKod === 15; });
        if (u.length > 1) throw dur('ATLA', 'Aynı numarayla birden çok dosya çıktı');
        if (u.length === 1) {
          const d = u[0];
          return { dosyaId: d.dosyaId, dosyaNo: e.no, birimId: birim.birimId, birimAdi: birim.ad, birimTuru2: kod, dosyaDurum: metin(d.dosyaDurum) || (durum ? 'Kapalı' : 'Açık'), kapali: durum === 1 };
        }
      }
      return null;
    }
    async function evraklar(d) {
      const hepsi = [];
      for (let s = 1; s <= 5; s++) {
        const v = await istek('list_dosya_evraklar.ajx', { dosyaId: d.dosyaId, pageNumber: s }, d);
        const t = v && v.tumEvraklar;
        if (!t || typeof t !== 'object') break;
        Object.keys(t).forEach(function (grup) {
          if (grup.indexOf(d.dosyaNo + '(') !== 0) return;
          (Array.isArray(t[grup]) ? t[grup] : []).forEach(function (x) { hepsi.push({ evrakId: x.evrakId, tur: metin(x.tur), tarih: metin(x.onaylandigiTarih), aciklama: metin(x.aciklama) }); });
        });
        if (!(Number(v.pageTotal) > s)) break;
      }
      const gun = function (t) { const m = t.match(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/); return m ? +m[3] * 10000 + +m[2] * 100 + +m[1] : 0; };
      hepsi.sort(function (a, b) { return gun(b.tarih) - gun(a.tarih); });
      return hepsi;
    }
    async function belgeMetni(d, evrak) {
      const h = basliklar(d);
      h['Content-Type'] = 'application/octet-stream'; delete h['Accept'];
      const y = await cagri(yolOneki() + 'view_document_brd.uyap?evrakId=' + encodeURIComponent(evrak.evrakId) + '&dosyaId=' + encodeURIComponent(d.dosyaId), { method: 'GET', credentials: 'include', headers: h });
      const b = new Uint8Array(await y.arrayBuffer());
      const bas = String.fromCharCode.apply(null, b.subarray(0, 16));
      if (/nosessionobject/i.test(bas)) throw dur('OTURUM', 'Oturum kapanmış');
      if (bas.indexOf('PK') === 0) return KS.udfMetni(b);
      if (bas.indexOf('%PDF') === 0) return pdfMetni(b);
      throw new Error(evrak.tur + ' okunamadı (biçim tanınmadı)');
    }
    async function pdfMetni(b) {
      let lib = kok.pdfjsLib;
      if (!lib) kok.document.querySelectorAll('iframe').forEach(function (f) { try { if (!lib && f.contentWindow.pdfjsLib) lib = f.contentWindow.pdfjsLib; } catch (e) { /* başka köken */ } });
      if (!lib) throw new Error('PDF evrak okunamadı (portalın PDF okuyucusu yok)');
      const doc = await lib.getDocument({ data: b }).promise;
      let s = '';
      for (let i = 1; i <= doc.numPages; i++) {
        const c = await (await doc.getPage(i)).getTextContent();
        let y0 = null;
        c.items.forEach(function (x) { const y = Math.round(x.transform[5]); s += (y0 !== null && Math.abs(y - y0) > 2) ? '\n' : ' '; s += x.str; y0 = y; });
        s += '\n';
      }
      return s;
    }
    return { dosyaBul: dosyaBul, evraklar: evraklar, belgeMetni: belgeMetni, aralikAyarla: function (ms) { aralik = ms; } };
  };

  /* ---------- Tek dosya ---------- */
  KS.dosyaSorgula = async function (bag, k) {
    const s = { satir: k.satir, dosya: k.mahkeme + ' ' + k.esas, notlar: [], hucre: null, ozet: '' };
    const d = await bag.dosyaBul(k.mahkeme, k.esas);
    if (!d) { s.ozet = 'UYAP\'ta bulunamadı (açık ve kapalı dosyalarda)'; return s; }
    s.dosyaDurum = d.dosyaDurum;
    const ev = await bag.evraklar(d);
    const tur = function (re) { return ev.filter(function (e) { return re.test(buyuk(e.tur)); }); };
    let hukum = '', kaynak = '';
    const gk = tur(/GEREKÇELİ KARAR/);
    if (gk.length) { hukum = KS.hukumAyikla(await bag.belgeMetni(d, gk[0])); kaynak = 'gerekçeli karar ' + gk[0].tarih; }
    if (!hukum) {
      for (const z of tur(/DURUŞMA ZAPTI|KARAR DURUŞMA|KISA KARAR/).slice(0, 2)) {
        hukum = KS.hukumAyikla(await bag.belgeMetni(d, z));
        if (hukum) { kaynak = 'kısa karar (' + z.tur + ' ' + z.tarih + ')'; s.notlar.push('Gerekçeli karar yok; kısa karardan okundu'); break; }
      }
    }
    const hk = hukum ? KS.hukumCoz(hukum) : null;
    const a = KS.asama(ev, hk);
    let h = { tamam: false, notlar: [] };
    if (hk && hk.sonuc) {
      let talep = null;
      if (SONUCSUZ.indexOf(hk.sonuc) === -1) {
        const dd = tur(/DAVA DİLEKÇESİ/);
        if (dd.length) { talep = KS.talepCoz(await bag.belgeMetni(d, dd[dd.length - 1])); s.notlar = s.notlar.concat(talep.notlar); }
        else s.notlar.push('Dava dilekçesi evrak listesinde yok');
        if (talep && talep.toplam !== null && typeof k.muddeabih === 'number' && Math.abs(talep.toplam - k.muddeabih) > 0.05) s.notlar.push('Dilekçedeki toplam (' + talep.toplam + ') Excel\'deki müddeabihten (' + k.muddeabih + ') farklı');
      }
      h = KS.hesapla(talep, hk);
      for (const e of tur(/EK KARAR/).slice(0, 2)) {
        const em = buyuk(await bag.belgeMetni(d, e));
        const karar = em.slice(Math.max(0, em.lastIndexOf('KARAR:')));
        if (/TALEBİN(İN)?\s+REDDİNE/.test(karar) && !/KABULÜNE|DÜZELTİLMESİNE/.test(karar)) s.notlar.push('Ek karar (' + e.tarih + ') talebi reddetmiş; sonuç değişmedi');
        else { h.tamam = false; s.notlar.push('Ek karar (' + e.tarih + ') sonucu değiştirmiş olabilir; elle bakın'); }
      }
      if (tur(/ISLAH/).length) {
        if (h.tamam && h.S + h.T + h.U + h.V + h.W > 0) { h.tamam = false; s.notlar.push('Dosyada ıslah var; talep tutarı değişmiş olabilir, elle bakın'); }
        else s.notlar.push('Dosyada ıslah var');
      }
      if (a.ustMahkeme || a.Y === 'İSTİNAF' || a.Y === 'TEMYİZ') s.notlar.push('Dosya üst mahkemeye gitmiş; üst mahkeme kararı sonucu değiştirmiş olabilir');
    }
    s.notlar = s.notlar.concat(h.notlar || []);
    s.hucre = KS.hucreler(h, a);
    s.sonuc = hk && hk.sonuc;
    s.tamam = !!h.tamam;
    s.ozet = (hk && hk.sonuc ? hk.sonuc + ' (' + kaynak + ')' : 'Karar okunamadı') + ', ' + a.X.toLocaleLowerCase('tr') + (a.neden ? ': ' + a.neden.toLocaleLowerCase('tr') : '');
    return s;
  };

  /* ---------- Panel ---------- */
  function panel() {
    const d = kok.document;
    if (d.getElementById('ks-kok')) { d.getElementById('ks-kok').style.display = ''; return; }
    const st = d.createElement('style');
    st.textContent = '#ks-kok{position:fixed;left:16px;bottom:16px;z-index:2147483000;width:440px;max-height:80vh;overflow:auto;background:#fff;color:#1d2733;border:1px solid #c9d3de;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.18);font:13px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;padding:14px}'
      + '#ks-kok h2{font-size:15px;margin:0 0 8px;color:#1f4e79}#ks-kok .ks-x{position:absolute;right:10px;top:8px;border:0;background:none;font-size:18px;cursor:pointer;color:#567}'
      + '#ks-kok label{display:block;margin:6px 0}#ks-kok input[type=number]{width:70px}#ks-kok button.ks-b{margin:8px 6px 0 0;padding:6px 12px;border:1px solid #1f4e79;border-radius:6px;background:#1f4e79;color:#fff;cursor:pointer}'
      + '#ks-kok button.ks-b[disabled]{opacity:.45;cursor:default}#ks-kok button.ks-ikincil{background:#fff;color:#1f4e79}'
      + '#ks-kok .ks-d{margin-top:8px;color:#456}#ks-kok ol{padding-left:20px;margin:8px 0 0}#ks-kok li{margin:4px 0}#ks-kok .ks-not{color:#8a5a00;font-size:12px}#ks-kok .ks-hata{color:#b00020}';
    d.head.appendChild(st);
    const k = d.createElement('div');
    k.id = 'ks-kok';
    k.innerHTML = '<button class="ks-x" title="Kapat">×</button><h2>Karar Sorgu</h2>'
      + '<div>Excel\'deki davaları UYAP\'ta arar, kararı okur ve N, O, R–Y sütunlarını doldurur. Yalnız sorgular.</div>'
      + '<label>Excel: <input type="file" accept=".xlsx" class="ks-dosya"></label>'
      + '<label><input type="checkbox" class="ks-bos" checked> Yalnız bu sütunları boş satırlar</label>'
      + '<label>Başlangıç satırı <input type="number" class="ks-bas" min="2" value="2"> &nbsp; Kaç dosya <input type="number" class="ks-adet" min="1" value="10"></label>'
      + '<label>İstekler arası bekleme (sn) <input type="number" class="ks-ara" min="2" value="4"></label>'
      + '<button class="ks-b ks-basla" disabled>Başlat</button><button class="ks-b ks-ikincil ks-dur" disabled>Durdur</button><button class="ks-b ks-indir" disabled>Excel\'i indir</button>'
      + '<div class="ks-d"></div><ol class="ks-liste"></ol>';
    d.body.appendChild(k);
    const $ = function (c) { return k.querySelector(c); };
    let okunan = null, ad = 'Karar Sorgu.xlsx', durdur = false;
    const sonuclar = {};
    const durum = function (m, hata) { $('.ks-d').innerHTML = ''; const s = d.createElement('span'); if (hata) s.className = 'ks-hata'; s.textContent = m; $('.ks-d').appendChild(s); };
    $('.ks-x').onclick = function () { k.style.display = 'none'; };
    $('.ks-dosya').onchange = async function (e) {
      const f = e.target.files[0];
      if (!f) return;
      try {
        okunan = await KS.excelOku(new Uint8Array(await f.arrayBuffer()));
        ad = f.name.replace(/\.xlsx$/i, '') + ' - Karar Sorgu.xlsx';
        const bos = okunan.kayitlar.filter(function (x) { return !x.dolu; });
        if (bos.length) $('.ks-bas').value = bos[0].satir;
        durum(okunan.kayitlar.length + ' dava okundu, ' + bos.length + ' tanesinin sütunları boş.');
        $('.ks-basla').disabled = false;
      } catch (hata) { durum('Excel okunamadı: ' + hata.message, true); }
    };
    $('.ks-dur').onclick = function () { durdur = true; durum('Durduruluyor; süren istek bitince duracak.'); };
    $('.ks-indir').onclick = async function () {
      const deg = {};
      Object.keys(sonuclar).forEach(function (r) { if (sonuclar[r].hucre) deg[r] = sonuclar[r].hucre; });
      const blob = await KS.excelYaz(okunan, deg);
      const a = d.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = ad; d.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    };
    $('.ks-basla').onclick = async function () {
      const bas = +$('.ks-bas').value || 2, adet = +$('.ks-adet').value || 10, yalnizBos = $('.ks-bos').checked;
      const is = okunan.kayitlar.filter(function (x) { return x.satir >= bas && (!yalnizBos || !x.dolu); }).slice(0, adet);
      if (!is.length) { durum('Sorgulanacak satır yok.', true); return; }
      durdur = false;
      $('.ks-basla').disabled = true; $('.ks-dur').disabled = false; $('.ks-liste').innerHTML = '';
      const bag = KS.baglanti({ aralik: Math.max(2, +$('.ks-ara').value || 4) * 1000 });
      let i = 0;
      for (const x of is) {
        if (durdur) break;
        i++;
        durum(i + '/' + is.length + ': satır ' + x.satir + ' (' + x.mahkeme + ' ' + x.esas + ') sorgulanıyor…');
        const li = d.createElement('li');
        li.value = x.satir;
        let s;
        try { s = await KS.dosyaSorgula(bag, x); }
        catch (hata) {
          if (hata.kod === 'OTURUM' || hata.kod === 'CAPTCHA' || hata.kod === 'KISIT') { durum(hata.message + '. Bot durdu; yeniden giriş yapıp kalan satırlardan devam edin.', true); break; }
          s = { satir: x.satir, ozet: (hata.kod === 'ATLA' ? 'Atlandı: ' : 'Hata: ') + hata.message, notlar: [], hucre: null };
        }
        sonuclar[x.satir] = s;
        KS.sonuclar = sonuclar;
        const h = s.hucre;
        li.innerHTML = '';
        const b = d.createElement('div');
        b.textContent = x.davali + ', ' + x.mahkeme + ' ' + x.esas + ': ' + s.ozet;
        li.appendChild(b);
        if (h) { const t = d.createElement('div'); t.textContent = CIKTI.filter(function (c) { return h[c] !== undefined; }).map(function (c) { return c + ': ' + h[c]; }).join(' · '); li.appendChild(t); }
        if (s.notlar && s.notlar.length) { const n = d.createElement('div'); n.className = 'ks-not'; n.textContent = s.notlar.join('; '); li.appendChild(n); }
        $('.ks-liste').appendChild(li);
        $('.ks-indir').disabled = false;
      }
      $('.ks-basla').disabled = false; $('.ks-dur').disabled = true;
      if (!/durdu/i.test($('.ks-d').textContent)) durum('Bitti: ' + Object.keys(sonuclar).length + ' satır. "Excel\'i indir" ile sonuçları alın.');
    };
  }

  KS.surum = SURUM;
  KS.panel = panel;
  if (typeof module !== 'undefined' && module.exports) module.exports = KS;
  else {
    kok.KararSorgu = KS;
    if (kok.document && !kok.__ksTest) panel();
  }
})(typeof window !== 'undefined' ? window : globalThis);
