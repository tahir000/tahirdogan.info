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
  const SURUM = '1.2.2';

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
  const TL = '\\.?\\s*-?\\s*(?:TL|₺)';
  function ilk(metinS, kalip) { const m = metinS.match(kalip); return m ? sayi(m[1]) : null; }
  KS.sayi = sayi;

  /* ---------- Mahkeme ve dosya numarası ---------- */
  /* "Y: İSTANBUL 12. TÜKETİCİ\nE: İSTANBUL 15. ASLİYE TİCARET" gibi hücrelerde yeni (Y) değer alınır */
  /* "(İSTANBUL 2. TÜKETİCİ)\nİstanbul 7. Asliye Ticaret" gibi hücrelerde parantezsiz (güncel) satır alınır */
  function yeniDeger(v) {
    const s = String(v === null || v === undefined ? '' : v);
    const m = s.match(/(?:^|\n)\s*Y\s*:\s*([^\n]+)/i);
    if (m) return metin(m[1]);
    const satirlar = s.split(/\n/).map(metin).filter(Boolean);
    const acik = satirlar.filter(function (x) { return !/^\(.*\)$/.test(x); });
    return metin(acik.length ? acik[acik.length - 1] : s.replace(/[()]/g, ''));
  }
  function mahkemeDuz(v) {
    return buyuk(v).replace(/^T\.?\s?C\.?\s+/, '').replace(/^İST\.?\s+/, 'İSTANBUL ').replace(/MAHKEME\S*/g, '').replace(/(\d+)\s*\.\s*/g, '$1. ')
      .replace(/[^A-ZÇĞİÖŞÜ0-9. ]/g, ' ').replace(/([^0-9])\./g, '$1').replace(/\s+/g, ' ').trim();
  }
  function mesafe(a, b) {
    const d = [];
    for (let i = 0; i <= a.length; i++) { d[i] = [i]; }
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  /* Ad birebir tutmazsa (İSTANBUK, Mahkemes gibi) aynı numara ve türdeki en yakın tek ad */
  function enYakin(liste, aranan) {
    const tam = liste.filter(function (b) { return b.duz === aranan; });
    if (tam.length === 1) return tam[0];
    const no = (aranan.match(/(\d+)\./) || [])[1];
    const aday = liste.map(function (b) { return { b: b, m: mesafe(b.duz, aranan) }; })
      .filter(function (x) { return x.m <= 3 && (!no || (x.b.duz.match(/(\d+)\./) || [])[1] === no); })
      .sort(function (x, y) { return x.m - y.m; });
    return aday.length && (aday.length === 1 || aday[0].m < aday[1].m) ? aday[0].b : null;
  }
  KS.enYakin = enYakin;
  /* Excel tarih seri numarası */
  function seriTarih(g, a, y) { return Math.round((Date.UTC(+y, +a - 1, +g) - Date.UTC(1899, 11, 30)) / 86400000); }
  KS.kararTarihi = function (ham) {
    const s = String(ham || '');
    const m = s.match(/KARAR\s+TAR[İI]H[İI]\s*:?\s*(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/i)
      || s.match(/(?:anlat[ıi]ld[ıi]|verildi)\.?\s*(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/i);
    return m ? { metin: ('0' + m[1]).slice(-2) + '.' + ('0' + m[2]).slice(-2) + '.' + m[3], seri: seriTarih(m[1], m[2], m[3]) } : null;
  };
  KS.tarihSeri = function (t) { const m = String(t || '').match(/(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/); return m ? { metin: ('0' + m[1]).slice(-2) + '.' + ('0' + m[2]).slice(-2) + '.' + m[3], seri: seriTarih(m[1], m[2], m[3]) } : null; };
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
      ?? ilk(T, new RegExp('takip talebinde\\s*' + N + TL + '\\s*olarak', 'i'))
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

  /*
   * İcra dosyasındaki takip talebi (UDF). Metin şablondur; tutarlar content.xml'in <data> bölümünde
   * "1.872,50" + "TL Asıl Alacak (Geçiş Ücreti-Para Cezası) ..." / "TL Faiz- (Ticari-Yıllık)" / "TL KDV" /
   * "TL Toplam Alacak" çiftleri olarak durur (24.11.2026'da gerçek dosyada görüldü). İlk alacak grubu alınır.
   */
  KS.takipTalebiCoz = function (xml) {
    const d = String(xml || '');
    const i = d.indexOf('<data');
    const yap = [];
    (i >= 0 ? d.slice(i) : d).replace(/<([A-Za-z_][\w.\-]*)>([^<]*)<\/\1>/g, function (m, a, v) { yap.push(metin(xmlCoz(v))); return m; });
    const r = { asil: 0, ucret: null, ceza: null, faiz: 0, kdv: 0, diger: 0, toplam: null, icraInkar: true, icraInkarOran: 20, notlar: [], kaynak: 'takip talebi' };
    let asilVar = false;
    for (let j = 0; j < yap.length - 1; j++) {
      if (!/^\d{1,3}(\.\d{3})*,\d{2}$/.test(yap[j])) continue;
      const n = sayi(yap[j]), et = buyuk(yap[j + 1]);
      if (!/^TL/.test(et)) continue;
      if (/TOPLAM/.test(et)) { r.toplam = n; break; }
      if (/ASIL\s*ALACAK/.test(et)) { r.asil += n; asilVar = true; }
      else if (/KDV/.test(et)) r.kdv += n;
      else if (/FAİZ/.test(et)) r.faiz += n;
      else if (/CEZA/.test(et)) { r.ceza = (r.ceza || 0) + n; r.asil += n; asilVar = true; }
      else if (/GEÇİŞ|ÜCRET/.test(et)) { r.ucret = (r.ucret || 0) + n; r.asil += n; asilVar = true; }
      else r.diger += n;
    }
    if (!asilVar) return null;
    ['asil', 'faiz', 'kdv', 'diger'].forEach(function (k) { r[k] = yuvarla(r[k]); });
    if (r.ucret !== null && r.ceza === null) r.ucret = null;
    if (r.toplam === null) r.toplam = yuvarla(r.asil + r.faiz + r.kdv + r.diger);
    if (Math.abs(r.asil + r.faiz + r.kdv + r.diger - r.toplam) > 0.05) r.notlar.push('Takip talebindeki kalemler toplamı tutmuyor');
    return r;
  };

  /* Bilirkişi raporunda, kabul edilen toplamı veren asıl alacak + faiz + KDV üçlüsü (son geçen tercih edilir) */
  KS.bilirkisiUclu = function (ham, toplam) {
    /* "Asıl Alacak ₺1.872,50 ₺1.855,00" gibi tablolarda (icra / hesaplanan) etiketten sonra iki tutar gelir */
    const T = metin(ham).replace(/₺\s*(?=\d)/g, '');
    /* Düz yazıda "488,04 TL işlemiş faiz" tutarı sonraki etikete aittir; tabloda (TL'siz) değil */
    const sonra = '(?!\\d)(?!\\s*\\.?\\s*-?\\s*(?:TL|₺|\\.-|-)[.\\-\\s]*\\(?\\s*(?:asıl|faiz|işlemiş|kdv))';
    const topla = function (kalip) {
      const l = []; let x;
      const re1 = new RegExp(N + '(?!\\d)' + TL + '?[.\\-\\s]*\\(?\\s*(?:' + kalip + ')', 'gi');
      const re2 = new RegExp('(?:' + kalip + ')([^0-9]{0,25}?)' + N + sonra + '(?:\\s+' + N + sonra + ')?', 'gi');
      while ((x = re1.exec(T))) l.push({ n: sayi(x[1]), i: x.index });
      while ((x = re2.exec(T))) {
        if (/asıl|faiz|kdv/i.test(x[1])) continue;
        l.push({ n: sayi(x[2]), i: x.index });
        if (x[3]) l.push({ n: sayi(x[3]), i: x.index + 1 });
      }
      return l.filter(function (y) { return y.n !== null; }).sort(function (a, b) { return b.i - a.i; }).slice(0, 40);
    };
    const A = topla('asıl\\s*alacak'), F = topla('(?:işlemiş\\s*)?faiz'), K = topla('KDV');
    F.push({ n: 0, i: -1 }); K.push({ n: 0, i: -1 });
    for (const a of A) for (const f of F) for (const k of K) {
      if (Math.abs(a.n + f.n + k.n - toplam) <= 0.05) return { asil: a.n, faiz: f.n, kdv: k.n };
    }
    return null;
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
    const sonucBul = function (T) {
      if (/KISMEN\s+KABUL|KISMEN\s+İPTAL/.test(T)) return 'KISMEN KABUL';
      /* Görevsizlik ve diğer usulden retler esasa girilmemiş karardır: dosya görevli mahkemeye gider */
      if (/USULDEN\s+REDDİNE|GÖREVSİZLİK/.test(T) || /GÖREVLİ[^.;]{0,120}GÖNDERİLMESİNE/.test(T)) return 'USULDEN RED';
      if (/(KARAR\s+VERİLMESİNE|HÜKÜM\s+KURULMASINA|HÜKÜM\s+OLUŞTURULMASINA)\s+YER\s+OLMADIĞINA/.test(T) && !/AÇILMAMIŞ\s+SAYIL/.test(T)) return 'KARAR VERİLMESİNE YER OLMADIĞINA';
      if (/AÇILMAMIŞ\s+SAYIL(A)?MASINA/.test(T)) return 'AÇILMAMIŞ SAYILMASINA';
      if (/KONUSUZ\s+KAL/.test(T)) return 'KONUSUZ';
      if (/FERAGAT[^.;\n]{0,40}REDDİNE/.test(T)) return 'FERAGAT';
      if (/(DAVANIN|DAVACININ\s+DAVASININ)\s+(ESASTAN\s+|USULDEN\s+|TAMAMEN\s+)?REDDİNE/.test(T)) return 'RED';
      if (/KABULÜ(NE|\s+İLE)|KABULÜNE/.test(T)) return 'KABUL';
      return null;
    };
    /* Sonuç önce hükmün 1. maddesinden okunur: sonraki maddelerde geçen "… hakkında karar verilmesine yer olmadığına"
       gibi ifadeler asıl sonucu (kabul) bastırmasın */
    const birinci = (H.match(/(?:^|[\s;:])1\s*[-)]\s*([\s\S]*?)(?=[\s;,]2\s*[-)]\s*[A-ZÇĞİÖŞÜ]|$)/) || [])[1];
    r.sonuc = (birinci && sonucBul(birinci)) || sonucBul(H);
    /* Kabul edilen tutarlar "devamına" ya da "iptaline" ile biten maddenin tamamında aranır:
       "itirazının 65-TL asıl alacak, … toplam 79,75 TL alacak üzerinden iptali suretiyle takibin devamına" */
    const madde = function (bitis) {
      const j = H.search(bitis);
      if (j < 0) return null;
      let c = H.slice(Math.max(0, j - 600), j);
      const re = /(?:^|[\s;])\d{1,2}\s*-(?!\s*\.?\s*(?:TL|₺))\s*(?:[A-ZÇĞİÖŞÜa-z]\s*-?\)?-?)?/g;
      let x, son = -1;
      while ((x = re.exec(c))) son = x.index;
      if (son >= 0) c = c.slice(son);
      return [null, c];
    };
    const dev = madde(/DEVAMINA/) || madde(/İPTALİNE/);
    if (dev) {
      const c = dev[1];
      /* Tutar ile etiket arasında başka bir tutar geçmeden birkaç sözcük olabilir:
         "2.870,00 TL geçiş ücreti ve 4 katı cezasına ilişkin asıl alacak", "121,02 TL işlemiş faizin KDV'si" */
      const ara = '(?:(?!\\d{1,3}(?:\\.\\d{3})*,\\d{2})[\\s\\S])';
      /* "asıl alacak", "asıl alacağı"; asıl alacak yazmıyorsa "12.582,50 TL geçiş ücreti" asıl alacaktır */
      r.kabul.asil = ilk(c, new RegExp(N + TL + ara + '{0,80}?ASIL\\s*ALACA[KĞ]'))
        ?? ilk(c, new RegExp(N + TL + ara + '{0,20}?GEÇİŞ\\s*ÜCRET'));
      r.kabul.alacak = r.kabul.asil === null ? ilk(c, new RegExp(N + TL + '\\s*ALACAK')) : null;
      r.kabul.faiz = ilk(c, new RegExp(N + TL + ara + '{0,30}?(?:TAKİP\\s*ÖNCESİ\\s*)?(?:İŞLEMİŞ\\s*)?FAİZ'));
      r.kabul.kdv = ilk(c, new RegExp(N + TL + ara + '{0,40}?KDV'));
      r.kabul.toplam = ilk(c, new RegExp('TOPLAM\\s*' + N + TL));
      r.takipTalebindeki = /TAKİP\s+TALEBİNDEKİ|TAKİP\s+TALEBİNDE\s+GÖSTERİLEN|ÖDEME\s+EMRİNDEKİ|AYNEN/.test(c) || (!r.kabul.asil && !r.kabul.toplam && !r.kabul.alacak);
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
  const SONUCSUZ = ['KARAR VERİLMESİNE YER OLMADIĞINA', 'AÇILMAMIŞ SAYILMASINA', 'KONUSUZ', 'FERAGAT', 'USULDEN RED'];
  KS.hesapla = function (t, hk) {
    const s = { S: 0, T: 0, U: 0, V: 0, W: 0, kalemler: [], faizKdv: [], notlar: [], tamam: true };
    if (!hk || !hk.sonuc) { s.tamam = false; s.notlar.push('Hüküm okunamadı'); return s; }
    if (SONUCSUZ.indexOf(hk.sonuc) !== -1) { s.notlar.push('Esas hakkında karar yok (' + hk.sonuc.toLocaleLowerCase('tr') + '); reddedilen kalem yazılmadı'); return s; }
    const k = hk.kabul;
    /* Hükümde yalnız "… TL alacak" yazıyorsa: talepteki asıl alacaktan büyükse toplamdır, değilse asıl alacak */
    if (k.asil === null && k.alacak !== null && k.alacak !== undefined) {
      if (t && t.asil !== null && k.alacak > t.asil + 0.01) { if (k.toplam === null) k.toplam = k.alacak; }
      else { k.asil = k.alacak; s.notlar.push('Hükümde "alacak" yazıyor; asıl alacak sayıldı'); }
    }
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
        const tt = t.toplam !== null && t.toplam !== undefined ? t.toplam : yuvarla(t.asil + tf + tk);
        s.tamam = false; s.notlar.push('Hükümde ve bilirkişi raporunda kalem ayrımı yok: talep ' + tt + ' TL, kabul ' + k.toplam + ' TL, reddedilen ' + yuvarla(tt - k.toplam) + ' TL; kalemler ayrılamadı');
      } else if (hk.sonuc === 'KISMEN KABUL' && !hk.takipTalebindeki) {
        s.tamam = false; s.notlar.push('Kısmen kabul, ama kabul edilen tutar hükümden okunamadı');
      }
      /* Hüküm kalemleri tek tek sayıyorsa, sayılmayan faiz ya da KDV reddedilmiştir */
      const listeli = k.asil !== null && !hk.takipTalebindeki;
      if (k.faiz !== null) rf = Math.max(0, tf - k.faiz);
      else if (hk.red.faiz || (listeli && tf > 0)) rf = tf;
      if (k.kdv !== null) rk = Math.max(0, tk - k.kdv);
      else if (hk.red.kdv || (listeli && tk > 0) || (rf >= tf && tf > 0 && tk > 0 && k.faiz === null)) rk = tk;
      if (listeli && ((k.faiz === null && tf > 0) || (k.kdv === null && tk > 0))) s.notlar.push('Hükümde sayılmayan ' + [k.faiz === null && tf > 0 ? 'işlemiş faiz' : '', k.kdv === null && tk > 0 ? 'KDV' : ''].filter(Boolean).join(' ve ') + ' reddedilmiş sayıldı');
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
    muddeabih: /MÜDDEABİH/, karar: /^KARAR$/, L: /^KARAR TARİHİ$/,
    N: /REDDEDİLEN KALEM/, O: /FAİZ\s*&\s*KDV/, R: /TOPLAM TUTAR/, S: /FAİZ TUTARI/, T: /KDV TUTARI/, U: /GEÇİŞ ÜCRETİ TUTARI/,
    V: /GECİKME CEZASI/, W: /İCRA İNKAR/, X: /KESİNLEŞTİ/, Y: /^AŞAMASI$/
  };
  const YEDEK = { no: 'A', davali: 'D', daire: 'E', icraNo: 'F', mahkeme: 'I', esas: 'J', muddeabih: 'K', karar: 'M', L: 'L', N: 'N', O: 'O', R: 'R', S: 'S', T: 'T', U: 'U', V: 'V', W: 'W', X: 'X', Y: 'Y' };
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
    const satirlar = {}, stiller = {};
    xml.replace(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, function (m, at, ic) {
      const r = (at.match(/\br="([A-Z]+\d+)"/) || [])[1];
      if (r) stiller[r] = (at.match(/\bs="(\d+)"/) || [])[1];
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
        karar: metin(deger('karar')), dolu: CIKTI.some(function (c) { return metin(deger(c)) !== ''; }),
        tamDolu: CIKTI.every(function (c) { return metin(deger(c)) !== ''; }), kararTarihiVar: metin(deger('L')) !== ''
      });
    }
    /* Karar tarihi yazılırken sütundaki ilk tarihli hücrenin biçimi kullanılır (yoksa sayı görünür) */
    let tarihStili = null;
    for (let r = 2; r <= enBuyuk && !tarihStili; r++) if (satirlar[r] && typeof satirlar[r][sut.L] === 'number' && stiller[sut.L + r]) tarihStili = stiller[sut.L + r];
    return { girdiler: g, sayfaYolu: yol, sayfaAdi: sayfaAdi, xml: xml, sutunlar: sut, kayitlar: kayitlar, tarihStili: tarihStili };
  };

  /* Satırlara değer yazar; hücrenin biçimi (s) korunur. degerler: { satirNo: { N: 'YOK', R: 12.5, ... } } */
  KS.sayfayaYaz = function (xml, sut, degerler, tarihStili) {
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
        const stil = k === 'L' && tarihStili ? tarihStili : eski ? (eski[0].match(/\bs="(\d+)"/) || [])[1] : null;
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

  /* Sonuçlardan yazılacak hücreler: N–Y'si tam dolu satıra yalnız karar tarihi, dolu karar tarihinin üzerine hiç yazılmaz */
  KS.yazilacaklar = function (okunan, sonuclar) {
    const deg = {};
    const kayit = {};
    okunan.kayitlar.forEach(function (x) { kayit[x.satir] = x; });
    Object.keys(sonuclar).forEach(function (r) {
      const h = sonuclar[r] && sonuclar[r].hucre;
      if (!h) return;
      let o = Object.assign({}, h);
      const x = kayit[r];
      if (x && x.tamDolu) o = h.L !== undefined ? { L: h.L } : {};
      if (x && x.kararTarihiVar) delete o.L;
      if (Object.keys(o).length) deg[r] = o;
    });
    return deg;
  };

  KS.excelYaz = async function (okunan, degerler) {
    const xml = KS.sayfayaYaz(okunan.xml, okunan.sutunlar, degerler, okunan.tarihStili);
    const yeni = await girdiYap(okunan.sayfaYolu, xml);
    const girdiler = okunan.girdiler.map(function (g) { return g.ad === okunan.sayfaYolu ? yeni : g; });
    return zipYaz(girdiler);
  };

  /* ---------- UYAP bağlantısı (yalnız sayfada) ---------- */
  const CAPTCHA = ['PRTL_GNL_100063', 'PRTL_GNL_100063-1'];
  /* FRM_GNL_10001: "Oturum zamanı aşıldı. Yeniden sisteme giriş yapılmalı." (24.11.2026, yaklaşık iki saatlik oturumdan sonra) */
  const OTURUM = ['PRTL_GNL_100026', 'PRTL_GNL_100026-1', 'PRTL_GNL_100032', 'FRM_GNL_10001'];
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
    async function birimListesi(yargiTuru, kod, kapali, duzelt) {
      const anahtar = yargiTuru + kod + (kapali ? 'k' : 'a');
      if (!birimOnbellek[anahtar]) {
        const l = await istek('avukat_mahkemeleri_sorgula.ajx', { yargiTuru: yargiTuru, yargiBirimi: kod, dosyaKapaliMi: kapali });
        birimOnbellek[anahtar] = (Array.isArray(l) ? l : []).filter(function (b) { return b && b.birimId; }).map(function (b) { return { ad: metin(b.birimAdi), duz: duzelt(b.birimAdi), birimId: String(b.birimId) }; });
      }
      return birimOnbellek[anahtar];
    }
    async function birimBul(kod, ad) {
      const aranan = mahkemeDuz(ad);
      for (const kapali of [false, true]) {
        const b = enYakin(await birimListesi('1', kod, kapali, mahkemeDuz), aranan);
        if (b) return b;
      }
      return null;
    }
    /* "İstanbul 31.", "İSTANBUL 20.", "İstanbul 34.İcra Dairesi", "İstanbul 21. İcra" -> "İSTANBUL 31" */
    function icraDuz(v) {
      return buyuk(v).replace(/^İST\.?\s+/, 'İSTANBUL ').replace(/İCRA\s*(DAİRESİ|MÜDÜRLÜĞÜ)?|DAİRESİ|MÜDÜRLÜĞÜ/g, ' ').replace(/[^A-ZÇĞİÖŞÜ0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    }
    /* İcra dosyasındaki takip talebinden talep kalemleri. Dava dosyasının evrakları okunduktan SONRA çağrılmalı:
       UYAP, yeni bir arama yapılınca önceki dosyanın kimliğini geçersiz kılıyor. */
    async function icraTalep(daire, no) {
      const r = await icraDosyasi(daire, no);
      return r ? takipOku(r) : null;
    }
    async function takipOku(r) {
      const tt = r.ev.filter(function (x) { return /^TAKİP TALEBİ$/.test(buyuk(x.tur)); });
      if (!tt.length) return null;
      const xml = await belgeXml(r.d, tt[tt.length - 1]);
      const t = xml ? KS.takipTalebiCoz(xml) : null;
      if (t) t.daire = r.birim.ad;
      return t;
    }
    /* Dava dosyası bu hesapla görünmüyorsa: mahkemenin icra dosyasına gönderdiği ilam (İlam Bilgisi Evrakı) ve takip talebi */
    async function icraIlam(daire, no) {
      const r = await icraDosyasi(daire, no);
      if (!r) return null;
      const adaylar = r.ev.filter(function (x) { return /İLAM/.test(buyuk(x.tur)) && /MAHKEME/.test(buyuk(x.gonderen)); });
      let ilam = null;
      for (const x of adaylar.slice(0, 2)) {
        let m = '';
        try { m = await belgeMetni(r.d, x); } catch (h) { if (h && h.kod) throw h; }
        for (const y of (x.ekler || []).slice(0, 2)) { try { m += '\n' + await belgeMetni(r.d, y); } catch (h) { if (h && h.kod) throw h; } }
        if (m && KS.hukumCoz(KS.hukumAyikla(m) || m).sonuc) { ilam = { evrak: x, metin: m }; break; }
      }
      return { ilam: ilam, talep: ilam ? await takipOku(r) : null, daire: r.birim.ad, ilamSayisi: adaylar.length };
    }
    async function icraDosyasi(daire, no) {
      const e = esasNo(no);
      if (!e || !metin(daire)) return null;
      const liste = (await birimListesi('2', '1101', false, icraDuz)).filter(function (b) { return !/İFLAS/.test(buyuk(b.ad)); });
      const birim = enYakin(liste, icraDuz(daire));
      if (!birim) return null;
      const b = { dosyaNo: e.no, birimTuru2: '1101', birimId: birim.birimId, birimAdi: birim.ad, dosyaDurum: 'Açık' };
      let d = null;
      for (const durum of [0, 1]) {
        const r = await istek('search_phrase_detayli.ajx', { dosyaDurumKod: durum, pageSize: 500, pageNumber: 1, dosyaYil: e.yil, dosyaSira: e.sira, birimId: birim.birimId, birimTuru2: '1101', birimTuru3: '2' }, b);
        let u = (Array.isArray(r) && Array.isArray(r[0]) ? r[0] : []).filter(function (x) { return x && metin(x.dosyaNo) === e.no; });
        if (u.length > 1) u = u.filter(function (x) { return x.dosyaTurKod === 35; });
        if (u.length === 1) { d = Object.assign({}, b, { dosyaId: u[0].dosyaId, dosyaDurum: metin(u[0].dosyaDurum) || b.dosyaDurum }); break; }
      }
      if (!d) return null;
      return { d: d, ev: await evraklar(d), birim: birim };
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
          (Array.isArray(t[grup]) ? t[grup] : []).forEach(function (x) { hepsi.push({ evrakId: x.evrakId, tur: metin(x.tur), tarih: metin(x.onaylandigiTarih), aciklama: metin(x.aciklama), gonderen: metin(x.gonderenYerKisi), ekler: Array.isArray(x.ekEvrakListesi) ? x.ekEvrakListesi.map(function (y) { return { evrakId: y.evrakId, tur: metin(x.tur) + ' eki' }; }) : [] }); });
        });
        if (!(Number(v.pageTotal) > s)) break;
      }
      const gun = function (t) { const m = t.match(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/); return m ? +m[3] * 10000 + +m[2] * 100 + +m[1] : 0; };
      hepsi.sort(function (a, b) { return gun(b.tarih) - gun(a.tarih); });
      return hepsi;
    }
    /* İmza Pro evrak servisi ara sıra 500 ("evrak servisinde bir hata") döndürür; bir kez yeniden denenir */
    async function belgeBayt(d, evrak) {
      for (let deneme = 0; ; deneme++) {
        const h = basliklar(d);
        h['Content-Type'] = 'application/octet-stream'; delete h['Accept'];
        const y = await cagri(yolOneki() + 'view_document_brd.uyap?evrakId=' + encodeURIComponent(evrak.evrakId) + '&dosyaId=' + encodeURIComponent(d.dosyaId), { method: 'GET', credentials: 'include', headers: h });
        const b = new Uint8Array(await y.arrayBuffer());
        const bas = String.fromCharCode.apply(null, b.subarray(0, 16));
        if (/nosessionobject/i.test(bas)) throw dur('OTURUM', 'Oturum kapanmış');
        if (y.status >= 500 && deneme < 1) { await new Promise(function (r) { setTimeout(r, 6000); }); continue; }
        return b;
      }
    }
    async function belgeMetni(d, evrak) {
      const b = await belgeBayt(d, evrak);
      const bas = String.fromCharCode.apply(null, b.subarray(0, 16));
      if (bas.indexOf('PK') === 0) return KS.udfMetni(b);
      if (bas.indexOf('%PDF') === 0) return pdfMetni(b);
      throw new Error(evrak.tur + ' okunamadı (biçim tanınmadı)');
    }
    async function belgeXml(d, evrak) {
      const b = await belgeBayt(d, evrak);
      if (String.fromCharCode.apply(null, b.subarray(0, 2)) !== 'PK') return null;
      const g = zipOku(b).find(function (x) { return x.ad === 'content.xml'; });
      return g ? girdiMetni(g) : null;
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
    return { dosyaBul: dosyaBul, evraklar: evraklar, belgeMetni: belgeMetni, icraTalep: icraTalep, icraIlam: icraIlam, aralikAyarla: function (ms) { aralik = ms; } };
  };

  /* Karar, icra dosyasına gelen ilamdan: kesinleşme ilamın kendisinden (kesin karar ya da kesinleşme şerhi) değerlendirilir */
  KS.ilamdanSonuc = function (s, r) {
    const m = r.ilam.metin, e = r.ilam.evrak;
    const hk = KS.hukumCoz(KS.hukumAyikla(m) || m);
    const kt = KS.kararTarihi(m) || KS.tarihSeri(e.tarih);
    const kesin = hk.kesin || /KESİNLEŞ(MİŞ|TİĞİ|EN|Tİ)/.test(buyuk(m));
    const a = kesin ? { X: 'KESİNLEŞTİ', Y: 'HİTAM' } : { X: 'KESİNLEŞMEDİ', Y: 'KESİNLEŞME BEKLENİYOR' };
    s.notlar.push('Dava dosyası bu hesapla görünmüyor; karar icra dosyasındaki ilamdan okundu (' + e.tur + ' ' + e.tarih + ', ' + e.gonderen + ')');
    let t = null;
    if (SONUCSUZ.indexOf(hk.sonuc) === -1) {
      t = r.talep;
      s.notlar.push(t ? 'Talep kalemleri takip talebinden alındı (asıl ' + t.asil + ', faiz ' + t.faiz + ', KDV ' + t.kdv + ')' : 'Takip talebi okunamadı');
    }
    const h = KS.hesapla(t, hk);
    s.notlar = s.notlar.concat(h.notlar || []);
    s.hucre = KS.hucreler(h, a);
    if (kt) { s.hucre.L = kt.seri; s.kararTarihi = kt.metin; }
    s.sonuc = hk.sonuc; s.tamam = !!h.tamam;
    s.ozet = hk.sonuc + ' (icra dosyasındaki ilamdan), ' + a.X.toLocaleLowerCase('tr');
    return s;
  };

  /* ---------- Tek dosya ---------- */
  KS.dosyaSorgula = async function (bag, k) {
    const s = { satir: k.satir, dosya: k.mahkeme + ' ' + k.esas, notlar: [], hucre: null, ozet: '' };
    const d = await bag.dosyaBul(k.mahkeme, k.esas);
    if (!d) {
      const yok = 'Dava dosyası UYAP\'ta bu hesapla görünmüyor (oturum açan avukat dava dosyasında vekil değil)';
      if (!k.daire || !k.icraNo) { s.ozet = yok; return s; }
      const r = await bag.icraIlam(k.daire, k.icraNo);
      if (r && r.ilam) return KS.ilamdanSonuc(s, r);
      s.ozet = yok + '; ' + (!r ? 'icra dosyası da görünmüyor' : r.ilamSayisi ? 'icra dosyasındaki ilam okunamadı' : 'icra dosyasında mahkemeden gelen ilam yok');
      return s;
    }
    s.dosyaDurum = d.dosyaDurum;
    const ev = await bag.evraklar(d);
    const tur = function (re) { return ev.filter(function (e) { return re.test(buyuk(e.tur)); }); };
    const oku = async function (e) {
      try { return await bag.belgeMetni(d, e); }
      catch (hata) { if (hata && hata.kod) throw hata; s.notlar.push(e.tur + ' okunamadı'); return ''; }
    };
    let hukum = '', kaynak = '', kt = null;
    const gk = tur(/GEREKÇELİ KARAR/);
    let davaTuru = '';
    if (gk.length) {
      const m = await oku(gk[0]);
      hukum = KS.hukumAyikla(m); kt = KS.kararTarihi(m); kaynak = 'gerekçeli karar ' + gk[0].tarih;
      davaTuru = metin((m.match(/(?:^|\n)\s*DAVA\s*:\s*([^\n]{3,120})/i) || [])[1]);
    }
    if (!hukum) {
      for (const z of tur(/DURUŞMA ZAPTI|KARAR DURUŞMA|KISA KARAR/).slice(0, 2)) {
        const m = await oku(z);
        hukum = KS.hukumAyikla(m);
        if (hukum) { kaynak = 'kısa karar (' + z.tur + ' ' + z.tarih + ')'; kt = kt || KS.kararTarihi(m) || KS.tarihSeri(z.tarih); s.notlar.push('Gerekçeli karar yok; kısa karardan okundu'); break; }
      }
    }
    if (k.yalnizTarih) {
      s.hucre = kt ? { L: kt.seri } : null;
      s.kararTarihi = kt && kt.metin;
      s.ozet = kt ? 'N–Y dolu; yalnız karar tarihi okundu (' + kaynak + ')' : 'Karar tarihi okunamadı';
      return s;
    }
    let hk = hukum ? KS.hukumCoz(hukum) : null;
    let blok = false;
    /* Reddedilen kalem hesabı yalnız itirazın iptali davaları için anlamlı (istirdat, menfi tespit vb. değil) */
    if (davaTuru && !/İTİRAZIN\s+İPTAL/.test(buyuk(davaTuru)) && hk && SONUCSUZ.indexOf(hk.sonuc) === -1) {
      blok = true;
      s.notlar.push('Dava türü "' + davaTuru + '"; itirazın iptali olmadığı için reddedilen kalem hesaplanmadı, elle bakın');
    }
    /* Üst mahkeme kararı: başvuru reddedildiyse ilk derece kararı geçerli; kaldırıp yeniden hüküm kurduysa o hüküm esas alınır */
    const ust = tur(/İSTİNAF|BÖLGE ADLİYE|BAM|YARGITAY|TEMYİZ/).filter(function (e) { return /KARAR/.test(buyuk(e.tur)) && !/DİLEKÇE|TALEP|HARÇ|TEBLİ|MÜZEKKERE/.test(buyuk(e.tur)); });
    if (ust.length && hk && hk.sonuc) {
      const um = await oku(ust[0]), U = buyuk(um);
      if (/KALDIRILMASINA|BOZULMASINA|DÜZELTİLEREK/.test(U)) {
        const uh = KS.hukumCoz(KS.hukumAyikla(um));
        if (uh.sonuc && !/BOZULMASINA/.test(U)) { hk = uh; kaynak = ust[0].tur + ' ' + ust[0].tarih; s.notlar.push('Üst mahkeme ilk derece kararını kaldırıp yeniden hüküm kurmuş; üst mahkeme hükmü esas alındı'); }
        else { blok = true; s.notlar.push('Üst mahkeme kararı (' + ust[0].tur + ') sonucu değiştirmiş; hüküm ayrıştırılamadı, elle bakın'); }
      } else if (/REDDİNE/.test(U)) s.notlar.push('Üst mahkeme başvuruyu reddetmiş; ilk derece kararı geçerli');
    }
    const a = KS.asama(ev, hk);
    let h = { tamam: false, notlar: [] };
    if (hk && hk.sonuc) {
      let talep = null;
      if (SONUCSUZ.indexOf(hk.sonuc) === -1) {
        const dd = tur(/DAVA DİLEKÇESİ/);
        if (dd.length) { talep = KS.talepCoz(await oku(dd[dd.length - 1])); s.notlar = s.notlar.concat(talep.notlar); }
        else s.notlar.push('Dava dilekçesi evrak listesinde yok');
        for (const e of tur(/EK KARAR/).slice(0, 2)) {
          const E = buyuk(await oku(e));
          const karar = E.slice(Math.max(0, E.lastIndexOf('KARAR:')));
          const ekh = KS.hukumCoz(karar);
          if (/TALEBİN(İN)?\s+REDDİNE/.test(karar) && !/KABULÜNE|DÜZELTİLMESİNE/.test(karar)) s.notlar.push('Ek karar (' + e.tarih + ') talebi reddetmiş; sonuç değişmedi');
          else if (ekh.kabul.asil !== null || ekh.kabul.toplam !== null || ekh.kabul.faiz !== null || ekh.kabul.kdv !== null) {
            ['asil', 'faiz', 'kdv', 'toplam'].forEach(function (x) { if (ekh.kabul[x] !== null) hk.kabul[x] = ekh.kabul[x]; });
            hk.takipTalebindeki = false;
            s.notlar.push('Ek kararla (' + e.tarih + ') düzeltilen tutarlar esas alındı');
          } else if (/ALACAK|TAKİB|FAİZ|KDV/.test(karar) && /KABULÜNE|DÜZELTİL|TAMAMLAN/.test(karar)) { blok = true; s.notlar.push('Ek karar (' + e.tarih + ') alacak kalemlerini değiştirmiş, tutar okunamadı; elle bakın'); }
          else s.notlar.push('Ek karar var (' + e.tarih + '); alacak kalemlerine dokunmuyor');
        }
        /* Hükümde kalem ayrımı yoksa bilirkişi raporu (ve ekleri) okunur; icra dosyasından ÖNCE, çünkü sonra dava dosyasının kimliği geçersiz olur */
        let bilirkisi = '';
        const kb = hk.kabul;
        if (hk.sonuc === 'KISMEN KABUL' && kb.asil === null && kb.faiz === null && kb.kdv === null && (kb.toplam !== null || kb.alacak !== null)) {
          for (const e of tur(/BİLİRKİŞİ.*RAPOR|EK RAPOR/).slice(0, 2)) {
            bilirkisi += ' ' + await oku(e);
            for (const x of (e.ekler || []).slice(0, 2)) bilirkisi += ' ' + await oku(x);
          }
        }
        if (!(talep && talep.asil !== null && talep.faiz !== null && talep.kdv !== null) && k.daire && k.icraNo) {
          try {
            const it = await bag.icraTalep(k.daire, k.icraNo);
            if (it) {
              if (talep) { it.icraInkar = talep.icraInkar; it.icraInkarOran = talep.icraInkarOran; }
              talep = it;
              s.notlar.push('Talep kalemleri icra dosyasındaki takip talebinden alındı (' + it.daire + ' ' + k.icraNo + ': asıl ' + it.asil + ', faiz ' + it.faiz + ', KDV ' + it.kdv + ')');
              s.notlar = s.notlar.concat(it.notlar);
            } else s.notlar.push('İcra dosyasında takip talebi bulunamadı (' + k.daire + ' ' + k.icraNo + ')');
          } catch (hata) {
            if (hata && ['OTURUM', 'CAPTCHA', 'KISIT'].indexOf(hata.kod) !== -1) throw hata;
            s.notlar.push('İcra dosyası sorgulanamadı: ' + (hata && hata.message));
          }
        }
        if (bilirkisi) {
          const top = kb.toplam !== null ? kb.toplam : (talep && talep.asil !== null && kb.alacak > talep.asil + 0.01 ? kb.alacak : null);
          const u = top !== null ? KS.bilirkisiUclu(bilirkisi, top) : null;
          if (u) { kb.asil = u.asil; kb.faiz = u.faiz; kb.kdv = u.kdv; kb.toplam = top; kb.alacak = null; s.notlar.push('Kabul edilen kalemler bilirkişi raporundan alındı (asıl ' + u.asil + ', faiz ' + u.faiz + ', KDV ' + u.kdv + ')'); }
        }
        if (talep && talep.toplam !== null && typeof k.muddeabih === 'number' && Math.abs(talep.toplam - k.muddeabih) > 0.05) s.notlar.push('Talep toplamı (' + talep.toplam + ') Excel\'deki müddeabihten (' + k.muddeabih + ') farklı');
      }
      h = KS.hesapla(talep, hk);
      if (blok) h.tamam = false;
      if (tur(/ISLAH/).length) s.notlar.push('Dosyada ıslah var; reddedilen tutar takip talebine göre hesaplandı');
      if ((a.Y === 'İSTİNAF' || a.Y === 'TEMYİZ') && !ust.length) s.notlar.push('Dosya üst mahkemede; sonuç ilk derece kararına göre yazıldı');
    }
    s.notlar = s.notlar.concat(h.notlar || []);
    s.hucre = KS.hucreler(h, a);
    if (kt) { s.hucre.L = kt.seri; s.kararTarihi = kt.metin; }
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
      + '<label><input type="checkbox" class="ks-bos" checked> Yalnız eksik satırlar (N–Y ya da karar tarihi boş)</label>'
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
        const bos = okunan.kayitlar.filter(function (x) { return !x.tamDolu || !x.kararTarihiVar; });
        if (bos.length) $('.ks-bas').value = bos[0].satir;
        $('.ks-adet').value = Math.max(1, bos.length);
        durum(okunan.kayitlar.length + ' dava okundu, ' + bos.length + ' tanesi eksik (N–Y ya da karar tarihi).');
        $('.ks-basla').disabled = false;
      } catch (hata) { durum('Excel okunamadı: ' + hata.message, true); }
    };
    $('.ks-dur').onclick = function () { durdur = true; durum('Durduruluyor; süren istek bitince duracak.'); };
    $('.ks-indir').onclick = async function () {
      const blob = await KS.excelYaz(okunan, KS.yazilacaklar(okunan, sonuclar));
      const a = d.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = ad; d.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    };
    $('.ks-basla').onclick = async function () {
      const bas = +$('.ks-bas').value || 2, adet = +$('.ks-adet').value || 10, yalnizBos = $('.ks-bos').checked;
      const is = okunan.kayitlar.filter(function (x) { return x.satir >= bas && (!yalnizBos || !x.tamDolu || !x.kararTarihiVar); }).slice(0, adet);
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
        try { s = await KS.dosyaSorgula(bag, Object.assign({}, x, { yalnizTarih: x.tamDolu && !x.kararTarihiVar })); }
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
        if (h) { const t = d.createElement('div'); t.textContent = (s.kararTarihi ? 'L: ' + s.kararTarihi + ' · ' : '') + CIKTI.filter(function (c) { return h[c] !== undefined; }).map(function (c) { return c + ': ' + h[c]; }).join(' · '); li.appendChild(t); }
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
