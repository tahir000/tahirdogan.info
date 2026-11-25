/*
 * Konut Haczi Sorgu botu (tahirdogan.info/buro/konut-haczi-sorgu)
 *
 * İmza Pro (UYAP Avukat Portal) sayfasında "Konut Haczi Sorgu" yer imiyle açılır. Excel'deki icra
 * dosyalarının evrak listesine bakar; konutta haciz (İİK m.79/a) sürecinin hangi adımda olduğunu,
 * icra hukuk mahkemesindeki değişik iş dosyasını (mahkeme, esas no, karar no, karar tarihi, sonuç)
 * ve talimat dairesinde açılan talimat dosyasının numarasını bulur; sonucu yeni bir Excel olarak verir.
 *
 * Yalnız sorgular: talep göndermez, ücretli sorgu yapmaz, giriş yapmaz. Veriyi dışarı göndermez;
 * Excel tarayıcıda okunur ve yazılır.
 *
 * UYAP istekleri (25 Kasım 2026'da İmza Pro üzerinden açık oturumda gözlendi):
 *   avukat_mahkemeleri_sorgula.ajx  { yargiTuru: '2', yargiBirimi: '1101', dosyaKapaliMi }  icra daireleri
 *   search_phrase_detayli.ajx       { dosyaDurumKod: 0 açık | 1 kapalı, dosyaYil, dosyaSira, birimId, birimTuru2: '1101', birimTuru3: '2' }
 *   list_dosya_evraklar.ajx         { dosyaId, pageNumber }  evrak listesi
 *   view_document_brd.uyap          ?evrakId&dosyaId  evrak (UDF: içinde content.xml olan zip)
 *
 * Sürecin evrakları (evrak listesindeki tür adlarıyla):
 *   1  "Avukat Portal Haciz Talebi", açıklaması "Taşınır Haciz Talebi"
 *   2  "İcra Mahkemesine Gönderilen Yazılar"
 *   3  "Hukuk Mahkemesi Tevzi Formu"  (şablon UDF; mahkeme ve esas no <data> bölümünde: ilIlceMahkemeAdi, kayitNo)
 *   4  "Değişik İş Kararı"  (gönderen: icra hukuk mahkemesi; gönderen dosya no: D.İş esas numarası)
 *   5  karardan sonra yeniden "Avukat Portal Haciz Talebi" ("Taşınır Haciz Talimatı Talebi")
 *   6  "İcra Dairesi Talimat Gönderme Yazısı"
 *   7  "… Gelen Talimat Dosyası Evrakı"  (gönderen: talimat dairesi; gönderen dosya no: talimat dosya numarası)
 */
(function (kok) {
  'use strict';

  const KH = {};
  const SURUM = '1.0.0';

  /* ---------- Metin ve tarih ---------- */
  function metin(v) { return v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim(); }
  function buyuk(v) { return metin(v).toLocaleUpperCase('tr'); }
  function iki(n) { return ('0' + n).slice(-2); }
  /* "04/03/2026", "4.3.2026 10:17" -> 20260304 (sıralama için) */
  function gunSayi(t) { const m = String(t || '').match(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/); return m ? +m[3] * 10000 + +m[2] * 100 + +m[1] : 0; }
  function tarihDuz(t) { const m = String(t || '').match(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/); return m ? iki(m[1]) + '.' + iki(m[2]) + '.' + m[3] : ''; }
  function dosyaNo(v) {
    const m = String(v === null || v === undefined ? '' : v).match(/(\d{4})\s*\/\s*(\d+)/);
    return m ? { yil: m[1], sira: String(+m[2]), no: m[1] + '/' + (+m[2]) } : null;
  }
  KH.dosyaNo = dosyaNo; KH.tarihDuz = tarihDuz;

  /* ---------- İcra dairesi adı ---------- */
  /* "İstanbul Anadolu 2. Banka Alacakları İcra Dairesi", "İST. ANADOLU 2.BANKA ALACAKLARI İCRA MÜD." -> "İSTANBUL ANADOLU 2 BANKA ALACAKLARI" */
  function icraDuz(v) {
    return buyuk(v).replace(/^T\.?\s?C\.?\s+/, '').replace(/^İST\.?\s+/, 'İSTANBUL ')
      .replace(/İCRA\s*(DAİRESİ|MÜDÜRLÜĞÜ|MÜD\.?)?|DAİRESİ|MÜDÜRLÜĞÜ/g, ' ').replace(/[^A-ZÇĞİÖŞÜ0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function mesafe(a, b) {
    const d = [];
    for (let i = 0; i <= a.length; i++) d[i] = [i];
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  /* Ad birebir tutmazsa (yazım hatası) sayıları aynı olan en yakın tek ad; "1. Banka" ile "2. Banka" asla karışmaz */
  function enYakin(liste, aranan) {
    const tam = liste.filter(function (b) { return b.duz === aranan; });
    if (tam.length === 1) return tam[0];
    if (tam.length > 1) return null;
    const sayilar = function (s) { return (s.match(/\d+/g) || []).join(','); };
    const aday = liste.filter(function (b) { return sayilar(b.duz) === sayilar(aranan); })
      .map(function (b) { return { b: b, m: mesafe(b.duz, aranan) }; })
      .filter(function (x) { return x.m <= 3; })
      .sort(function (x, y) { return x.m - y.m; });
    return aday.length && (aday.length === 1 || aday[0].m < aday[1].m) ? aday[0].b : null;
  }
  KH.icraDuz = icraDuz; KH.enYakin = enYakin;

  /* ---------- Evrak türleri ---------- */
  KH.ADIMLAR = [
    'Konut haczi talebi görünmüyor',
    'Haciz talebi sunuldu',
    'İcra mahkemesine yazı yazıldı',
    'Tevzi edildi',
    'Değişik iş kararı geldi',
    'Karar sonrası talimat talebi atıldı',
    'Talimat yazıldı',
    'Talimat dosyası açıldı'
  ];
  const SIRADAKI = [
    'Dosyada taşınır haciz talebi yok; talep atılmalı ya da dosya elle kontrol edilmeli',
    'İcra dairesinin tensip edip icra hukuk mahkemesine yazı yazması bekleniyor',
    'Tevzi bürosunun dosyayı icra hukuk mahkemesine tevzi etmesi bekleniyor',
    'İcra hukuk mahkemesinin değişik iş kararı bekleniyor',
    'Karar dosyaya gelmiş; yeniden haciz talebi atılıp talimat yazılması istenmeli',
    'İcra dairesinin tensip edip talimat yazması bekleniyor',
    'Talimat dairesinin dosyayı kaydedip talimat numarası vermesi bekleniyor',
    'Talimat dosyası açılmış'
  ];

  /*
   * Evrak listesindeki bir satırın süreçteki yeri; süreçle ilgisi yoksa null.
   * Talimat dairesinin cevabı farklı tür adlarıyla gelir ("Dosya Açıldıktan Sisteme Katılan Gelen Talimat Dosyası
   * Evrakı", "Genel Talimat Evrakı"); ortak yanları türde "talimat" geçmesi, gönderenin başka bir icra dairesi
   * olması ve gönderen dosya numarasının (talimat numarası) dolu olmasıdır.
   */
  KH.evrakSinifi = function (e, bizimDaire) {
    const t = buyuk(e.tur), a = buyuk(e.aciklama), g = buyuk(e.gonderen);
    if (/DEĞİŞİK\s+İŞ\s+KARAR/.test(t)) return 'karar';
    if (/TEVZİ\s+FORMU/.test(t)) return 'tevzi';
    if (/İCRA\s+MAHKEMESİNE\s+GÖNDERİLEN/.test(t)) return 'mahkemeYazisi';
    if (/TALİMAT\s+GÖNDERME\s+YAZISI/.test(t)) return 'talimatYazisi';
    if (/HACİZ\s+TALEBİ/.test(t) && /TAŞINIR\s+HACİZ/.test(a)) return 'talep';
    if (/TALİMAT/.test(t) && /İCRA\s+(DAİRESİ|MÜDÜRLÜĞÜ)/.test(g) && dosyaNo(e.gonderenDosyaNo) && (!bizimDaire || icraDuz(g) !== icraDuz(bizimDaire))) return 'talimatDosyasi';
    return null;
  };

  /*
   * Evrak listesinden süreç. Birden çok tur olabileceği için (ikinci adres, yenilenen talep) aşama,
   * en son "İcra Mahkemesine Gönderilen Yazılar" evrakıyla başlayan tura göre belirlenir; önceki
   * turların değişik iş kararları ve talimat dosyaları da listelenir.
   */
  KH.surec = function (evraklar, bizimDaire) {
    const s = (evraklar || []).map(function (e) { return Object.assign({}, e, { sinif: KH.evrakSinifi(e, bizimDaire), gun: gunSayi(e.tarih) }); })
      .filter(function (e) { return e.sinif; })
      .sort(function (a, b) { return a.gun - b.gun; });
    const al = function (k) { return s.filter(function (e) { return e.sinif === k; }); };
    const son = function (l) { return l.length ? l[l.length - 1] : null; };
    const ilkSonra = function (l, gun) { return l.find(function (e) { return e.gun >= gun; }) || null; };
    const r = { adim: 0, evrak: {}, kararlar: al('karar'), tevziler: al('tevzi'), talimatDosyalari: al('talimatDosyasi'), talimatYazilari: al('talimatYazisi'), talepler: al('talep'), notlar: [] };
    const M = son(al('mahkemeYazisi'));
    const bas = M ? M.gun : 0;
    /* Turu başlatan talep: mahkeme yazısından önceki son taşınır haciz talebi (mahkeme yazısı yoksa ilk talep) */
    const T1 = M ? son(r.talepler.filter(function (e) { return e.gun <= M.gun; })) : r.talepler[0] || null;
    const V = ilkSonra(r.tevziler, bas);
    const K = M ? ilkSonra(r.kararlar, bas) : son(r.kararlar);
    const kararGun = K ? K.gun : null;
    const T2 = K ? r.talepler.find(function (e) { return e.gun >= kararGun && e !== T1; }) || null : null;
    /* Talimat yazısı ve talimat dosyası yalnız karardan sonra geldiyse bu sürece aittir */
    const G = K ? ilkSonra(r.talimatYazilari, kararGun) : null;
    const C = K ? ilkSonra(r.talimatDosyalari, G ? G.gun : kararGun) : null;
    r.evrak = { talep: T1, mahkemeYazisi: M, tevzi: V, karar: K, kararSonrasiTalep: T2, talimatYazisi: G, talimatDosyasi: C };
    r.adim = C ? 7 : G ? 6 : T2 ? 5 : K ? 4 : V ? 3 : M ? 2 : (T1 || r.talepler.length) ? 1 : 0;
    if (!r.evrak.talep && r.talepler.length) r.evrak.talep = r.talepler[0];
    if (r.adim < 4 && r.kararlar.length) r.notlar.push('Dosyada önceki bir konut haczi sürecine ait değişik iş kararı var; yeni süreç ' + r.adim + '. adımda');
    if (r.kararlar.length > 1) r.notlar.push('Dosyada ' + r.kararlar.length + ' değişik iş kararı var');
    if (!K && (r.talimatYazilari.length || r.talimatDosyalari.length)) r.notlar.push('Dosyada değişik iş kararı olmadan yazılmış talimat var');
    /* Son talimat yazısından da sonra atılmış, karşılığı henüz görünmeyen talep (talimatın yenilenmesi ya da yeni adres) */
    const sonTalep = son(r.talepler), sonYazi = son(r.talimatYazilari);
    if (r.adim >= 6 && sonTalep && sonYazi && sonTalep.gun > sonYazi.gun) r.notlar.push('Son talimat yazısından sonra yeni taşınır haciz talebi var (' + tarihDuz(sonTalep.tarih) + '); yeni bir konut haczi talebiyse o süreç 1. adımdadır');
    return r;
  };

  /* ---------- Değişik iş kararı ---------- */
  /*
   * İki biçim görüldü:
   *   "ESAS NO : 2030/77 D.İş / KARAR NO : 2030/91 / İCRA DOSYA NO : … 2030/1234 Esas / KONU : … / KARAR TARİHİ : 14/01/2030 … KARAR: 1-… ONAYLANMASINA"
   *   "ESAS NO : 2030/77 D.İş / KARAR NO : 2030/91 / … İcra Dairesi : 2030/1234 … GEREĞİ DÜŞÜNÜLDÜ: … İCRA MÜDÜRLÜĞÜ KARARININ ONAYLANMASINA"
   * Kararın gerekçesi kanun maddesini ("…kararın onaylanmasına kesin olarak karar verir…") aktardığı için sonuç
   * yalnız hüküm bölümünde (son "KARAR:" / "HÜKÜM" başlığından, yoksa "GEREĞİ DÜŞÜNÜLDÜ"den sonra) aranır.
   */
  KH.kararCoz = function (ham) {
    const s = String(ham || '');
    const B = s.toLocaleUpperCase('tr');
    const r = { mahkeme: '', esasNo: '', kararNo: '', icraNo: '', konu: '', talepTarihi: '', kararTarihi: '', sonuc: '', kesin: false, konutMu: false };
    const no = function (m) { return m ? m[1] + '/' + (+m[2]) : ''; };
    /* Etiketler satır başında aranır: üst bilgideki "Esas-Karar No: 2030/77 D.İş - 2030/91" satırı "KARAR NO" ile karışmasın */
    r.esasNo = no(B.match(/(?:^|\n)[ \t]*ESAS\s*NO[ \t]*:?[ \t]*(\d{4})\s*\/\s*(\d+)/));
    r.kararNo = no(B.match(/(?:^|\n)[ \t]*KARAR\s*NO[ \t]*:?[ \t]*(\d{4})\s*\/\s*(\d+)/));
    if (!r.esasNo || !r.kararNo) {
      const m = B.match(/ESAS\s*-\s*KARAR\s*NO\s*:?\s*(\d{4})\s*\/\s*(\d+)\s*(?:D\.?\s*İŞ)?\s*-\s*(\d{4})\s*\/\s*(\d+)/);
      if (m) { r.esasNo = r.esasNo || m[1] + '/' + (+m[2]); r.kararNo = r.kararNo || m[3] + '/' + (+m[4]); }
    }
    r.icraNo = no(B.match(/İCRA\s+DOSYA\s+NO\s*:?[^\n]*?(\d{4})\s*\/\s*(\d+)/) || B.match(/İCRA\s+(?:DAİRESİ|MÜDÜRLÜĞÜ)\s*:\s*(\d{4})\s*\/\s*(\d+)/));
    r.talepTarihi = tarihDuz((B.match(/TALEP\s+TARİHİ\s*:?\s*(\d{1,2}[\/.]\d{1,2}[\/.]\d{4})/) || [])[1]);
    r.kararTarihi = tarihDuz((B.match(/KARAR\s+TARİHİ\s*:?\s*(\d{1,2}[\/.]\d{1,2}[\/.]\d{4})/) || [])[1]);
    r.konu = metin((s.match(/(?:^|\n)\s*KONU\s*:\s*([^\n]+)/) || [])[1]);
    const mh = B.match(/T\.\s?C\.\s+([A-ZÇĞİÖŞÜ0-9 .\t\n]{0,80}?İCRA\s+HUKUK\s+MAHKEMESİ)/);
    r.mahkeme = mh ? metin(mh[1]) : '';
    let bas = -1, x;
    const re = /(?:^|\n)[ \t]*(?:KARAR|HÜKÜM|H\s*Ü\s*K\s*Ü\s*M)[ \t]*[:\/;]/g;
    while ((x = re.exec(B))) bas = x.index;
    if (bas < 0) bas = B.lastIndexOf('GEREĞİ DÜŞÜNÜLDÜ');
    const hB = bas >= 0 ? B.slice(bas) : B.slice(-900);
    const hS = bas >= 0 ? s.slice(bas) : s.slice(-900);
    /* Hüküm büyük harfle yazılır; önce asıl metinde büyük harfli sözcük aranır */
    const var_ = function (k) { return k.test(hS) || k.test(hB); };
    if (var_(/KALDIRILMASINA/)) r.sonuc = 'KALDIRILDI';
    else if (var_(/ONAYLANMASINA/)) r.sonuc = 'ONAYLANDI';
    else if (var_(/REDDİNE/)) r.sonuc = 'REDDEDİLDİ';
    else if (var_(/YER\s+OLMADIĞINA/)) r.sonuc = 'KARAR VERİLMESİNE YER OLMADIĞINA';
    r.kesin = /KESİN/.test(hB);
    r.konutMu = /KONUT/.test(B) || /79\s*\/\s*A/.test(B);
    return r;
  };

  /* ---------- Şablon UDF verisi ---------- */
  const COZ = { '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': '\'', '&amp;': '&' };
  function xmlCoz(s) { return String(s).replace(/&(lt|gt|quot|apos|amp);/g, function (m) { return COZ[m]; }).replace(/&#(x?)([0-9a-fA-F]+);/g, function (m, x, d) { return String.fromCodePoint(parseInt(d, x ? 16 : 10)); }); }
  function xmlKac(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ''); }
  /* content.xml'in <data> bölümündeki alanlar: { alanAdi: 'değer' } (aynı ad yinelenirse ilk dolu değer) */
  KH.udfVeri = function (xml) {
    const d = String(xml || ''), i = d.indexOf('<data'), o = {};
    if (i < 0) return o;
    d.slice(i).replace(/<([A-Za-z_][\w.\-]*)>([^<]*)<\/\1>/g, function (m, a, v) { const t = metin(xmlCoz(v)); if (t && o[a] === undefined) o[a] = t; return m; });
    return o;
  };
  KH.udfIcerik = function (xml) {
    const m = String(xml || '').match(/<content>([\s\S]*?)<\/content>/);
    return (m ? m[1] : String(xml || '')).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  };

  /* Tevzi formu: mahkeme ve esas no. Şablon alanlarından, yoksa düz yazıdaki etiketlerden okunur */
  KH.tevziCoz = function (xml) {
    const v = KH.udfVeri(xml), T = KH.udfIcerik(xml);
    const etiket = function (k) { const m = T.match(new RegExp('(?:^|\\n)[ \\t]*' + k + '[ \\t]*:[ \\t]*([^\\n\\t]+)')); return m ? metin(m[1]) : ''; };
    const r = {
      mahkeme: v.ilIlceMahkemeAdi || etiket('TEVZİ EDİLEN MAHKEME'),
      esasNo: (dosyaNo(v.kayitNo || etiket('ESAS NO')) || {}).no || '',
      tevziNo: (dosyaNo(v.tevziNo || etiket('TEVZİ NO')) || {}).no || '',
      davaTuru: v.davaTuru || etiket('DAVA TÜRÜ'),
      acilisTarihi: tarihDuz(v.acilisTarihi || etiket('AÇILIŞ TARİHİ'))
    };
    if (/^(ilIlceMahkemeAdi|kayitNo)$/.test(r.mahkeme)) r.mahkeme = '';
    r.konutMu = /KONUT|79\s*\/\s*A/.test(buyuk(r.davaTuru));
    return r;
  };

  /* Talimat gönderme yazısının muhatabı: dosya numarası satırından sonraki "İCRA TEVZİ BÜROSU'NE" + "MERKEZ / İL" -> "MERKEZ / İL (İCRA TEVZİ BÜROSU)" */
  KH.talimatYeri = function (ham) {
    const sat = String(ham || '').split(/\n/).map(metin);
    const i = sat.findIndex(function (x) { return /\d{4}\s*\/\s*\d+\s*ESAS/i.test(x); });
    if (i < 0) return '';
    const blok = [];
    for (let j = i + 1; j < sat.length && blok.length < 3; j++) {
      const x = sat[j];
      if (!x) continue;
      if (/^(İLGİ|ALACAKLI|VEKİLİ|BORÇLU|KONU)(?![A-ZÇĞİÖŞÜ])/.test(buyuk(x))) break;
      if (/^\d{1,2}[\/.]\d{1,2}[\/.]\d{4}$/.test(x)) continue;
      blok.push(x.replace(/['’]\s*(N[EA]|[EA])$/i, ''));
    }
    return blok.length === 2 ? blok[1] + ' (' + blok[0] + ')' : blok.join(', ');
  };

  /* ---------- Sonuç satırı ---------- */
  /* Excel'e ve panele yazılacak özet; okunan: { kararlar: [{evrak, coz}], tevzi: coz, talimatYeri } */
  KH.ozetle = function (surec, okunan) {
    okunan = okunan || {};
    const ev = surec.evrak, t = function (e) { return e ? tarihDuz(e.tarih) : ''; };
    const o = { adim: surec.adim, adimAdi: KH.ADIMLAR[surec.adim], siradaki: SIRADAKI[surec.adim], notlar: surec.notlar.slice() };
    const disler = (okunan.kararlar || []).map(function (k) {
      const c = k.coz || {}, e = k.evrak || {};
      const d = { mahkeme: metin(e.gonderen) || c.mahkeme || '', esasNo: c.esasNo || (dosyaNo(e.gonderenDosyaNo) || {}).no || '', kararNo: c.kararNo || '', kararTarihi: c.kararTarihi || '', sonuc: c.sonuc || '', evrakTarihi: tarihDuz(e.tarih) };
      if (k.okunamadi) o.notlar.push('Değişik iş kararı okunamadı (' + d.evrakTarihi + '); mahkeme ve esas no evrak listesinden alındı');
      else if (!c.sonuc) o.notlar.push('Değişik iş kararının sonucu okunamadı (' + d.esasNo + '); elle bakın');
      if (c.esasNo && e.gonderenDosyaNo && (dosyaNo(e.gonderenDosyaNo) || {}).no !== c.esasNo) o.notlar.push('Karardaki esas no (' + c.esasNo + ') evrak listesindekinden (' + e.gonderenDosyaNo + ') farklı');
      if (!k.okunamadi && c.esasNo && !c.konutMu) o.notlar.push('Değişik iş kararı (' + c.esasNo + ') konut haczi kararı gibi görünmüyor; elle bakın');
      if (c.icraNo && okunan.anaNo && c.icraNo !== okunan.anaNo) o.notlar.push('Değişik iş kararında (' + c.esasNo + ') yazan icra dosya no ' + c.icraNo + ', ana dosyadan farklı; elle bakın');
      if (c.sonuc === 'KALDIRILDI') o.notlar.push('Mahkeme konutta haciz kararını kaldırmış (' + d.esasNo + '): adres konut sayılmamış');
      if (c.sonuc === 'REDDEDİLDİ') o.notlar.push('Mahkeme talebi reddetmiş (' + d.esasNo + ')');
      return d;
    });
    /* Karar henüz yoksa (3. adım) değişik iş dosyası tevzi formundan bilinir; önceki turların kararlarının önüne yazılır */
    if (okunan.tevzi && (okunan.tevzi.mahkeme || okunan.tevzi.esasNo)) {
      disler.unshift({ mahkeme: okunan.tevzi.mahkeme, esasNo: okunan.tevzi.esasNo, kararNo: '', kararTarihi: '', sonuc: 'KARAR BEKLENİYOR', evrakTarihi: '' });
      if (okunan.tevzi.davaTuru && !okunan.tevzi.konutMu) o.notlar.push('Tevzi formundaki dava türü konut haczi değil: ' + okunan.tevzi.davaTuru);
    }
    o.disler = disler;
    /* Aynı talimat dosyasından birden çok evrak gelebilir: daire + numara başına tek satır (ilk gelen evrakın tarihiyle); sürecin talimatı en üstte */
    o.talimatlar = [];
    (ev.talimatDosyasi ? [ev.talimatDosyasi] : []).concat(surec.talimatDosyalari).forEach(function (e) {
      const t1 = { daire: metin(e.gonderen), dosyaNo: (dosyaNo(e.gonderenDosyaNo) || {}).no || metin(e.gonderenDosyaNo), tarih: tarihDuz(e.tarih) };
      if (!o.talimatlar.some(function (x) { return icraDuz(x.daire) === icraDuz(t1.daire) && x.dosyaNo === t1.dosyaNo; })) o.talimatlar.push(t1);
    });
    o.talimatYeri = okunan.talimatYeri || '';
    o.tarihler = [t(ev.talep), t(ev.mahkemeYazisi), t(ev.tevzi), t(ev.karar), t(ev.kararSonrasiTalep), t(ev.talimatYazisi), t(ev.talimatDosyasi)];
    return o;
  };

  KH.BASLIKLAR = ['İcra Dairesi', 'Ana Dosya No', 'Aşama', 'Durum', 'D.İş Mahkemesi', 'D.İş Esas No', 'D.İş Karar No', 'Karar Tarihi', 'Karar Sonucu',
    'Talimat Dairesi', 'Talimat Dosya No', 'Talimat Yazılan Yer', '1 Talep', '2 Mahkemeye Yazı', '3 Tevzi', '4 Değişik İş Kararı', '5 Karar Sonrası Talep', '6 Talimat Yazısı', '7 Talimat Dosyası', 'Not'];
  const GENISLIK = [44, 14, 30, 52, 38, 14, 14, 13, 16, 38, 16, 34, 12, 12, 12, 12, 12, 12, 12, 60];

  /* Bir kaydın Excel satırı. s: dosyaSorgula sonucu (ya da hata/atlama) */
  KH.satir = function (k, s) {
    const bos = function (n) { const a = []; for (let i = 0; i < n; i++) a.push(''); return a; };
    if (!s) return [k.daire, k.no].concat(bos(17), ['Sorgulanmadı']);
    if (!s.ozet) return [k.daire, k.no, s.durum || '', s.mesaj || ''].concat(bos(15), [(s.notlar || []).join('; ')]);
    const o = s.ozet, cok = function (l, f) { return l.map(f).filter(function (x, i) { return x || l.length > 1; }).join('\n'); };
    return [k.daire, k.no, o.adim + ' - ' + o.adimAdi, o.siradaki,
      cok(o.disler, function (d) { return d.mahkeme; }), cok(o.disler, function (d) { return d.esasNo ? d.esasNo + ' D.İş' : ''; }),
      cok(o.disler, function (d) { return d.kararNo; }), cok(o.disler, function (d) { return d.kararTarihi; }), cok(o.disler, function (d) { return d.sonuc; }),
      cok(o.talimatlar, function (t) { return t.daire; }), cok(o.talimatlar, function (t) { return t.dosyaNo; }), o.talimatYeri]
      .concat(o.tarihler, [o.notlar.concat(s.dosyaDurum && !/^AÇIK$/.test(buyuk(s.dosyaDurum)) ? ['Dosya durumu: ' + s.dosyaDurum] : []).join('; ')]);
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
  KH.zipOku = zipOku; KH.girdiMetni = girdiMetni; KH.girdiYap = girdiYap; KH.zipYaz = zipYaz;

  /* ---------- Excel okuma ---------- */
  function sutunNo(h) { let n = 0; for (let i = 0; i < h.length; i++) n = n * 26 + h.charCodeAt(i) - 64; return n; }
  function sutunHarf(n) { let s = ''; while (n > 0) { const k = (n - 1) % 26; s = String.fromCharCode(65 + k) + s; n = (n - 1 - k) / 26; } return s; }

  /* İlk sayfanın hücreleri: { satirNo: { A: değer, B: değer } } */
  KH.excelHucreler = async function (bayt) {
    const g = zipOku(bayt);
    const bul = function (ad) { return g.find(function (x) { return x.ad === ad; }); };
    if (!bul('xl/workbook.xml')) throw new Error('Dosya .xlsx biçiminde değil');
    const wb = await girdiMetni(bul('xl/workbook.xml'));
    const rels = await girdiMetni(bul('xl/_rels/workbook.xml.rels'));
    const sayfa = wb.match(/<sheet\b[^>]*>/);
    const rid = sayfa[0].match(/\br:id="([^"]+)"/)[1];
    const rel = rels.match(new RegExp('<Relationship\\b[^>]*\\bId="' + rid + '"[^>]*>'))[0];
    const hedef = rel.match(/Target="([^"]+)"/)[1];
    const yol = hedef.charAt(0) === '/' ? hedef.slice(1) : 'xl/' + hedef.replace(/^\.\//, '');
    const ss = [];
    if (bul('xl/sharedStrings.xml')) {
      (await girdiMetni(bul('xl/sharedStrings.xml'))).replace(/<si>([\s\S]*?)<\/si>/g, function (m, ic) {
        ic = ic.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
        let t = ''; ic.replace(/<t\b[^>]*>([\s\S]*?)<\/t>/g, function (mm, x) { t += xmlCoz(x); return mm; });
        ss.push(t); return m;
      });
    }
    const xml = await girdiMetni(bul(yol));
    const satirlar = {};
    xml.replace(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, function (m, at, ic) {
      const r = (at.match(/\br="([A-Z]+)(\d+)"/) || []);
      if (!r[1] || !ic) return m;
      const tur = (at.match(/\bt="([^"]+)"/) || [])[1];
      let v = null;
      if (tur === 'inlineStr') { v = ''; ic.replace(/<t\b[^>]*>([\s\S]*?)<\/t>/g, function (mm, x) { v += xmlCoz(x); return mm; }); }
      else {
        const vv = (ic.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        if (vv === undefined) return m;
        v = tur === 's' ? ss[+vv] : tur === 'str' || tur === 'e' ? xmlCoz(vv) : tur === 'b' ? vv === '1' : Number(vv);
      }
      (satirlar[+r[2]] = satirlar[+r[2]] || {})[r[1]] = v;
      return m;
    });
    return satirlar;
  };

  /*
   * Hücrelerden kayıt listesi. Başlık satırı aranmaz: dosya numarası sütunu, "2026/12345" biçimli hücrelerin
   * en çok olduğu sütundur; icra dairesi sütunu "İcra" geçen hücrelerin en çok olduğu sütun.
   * Daire sütunu yoksa (ya da hücre boşsa) varsayilanDaire kullanılır.
   */
  KH.kayitlar = function (satirlar, varsayilanDaire) {
    const say = { no: {}, daire: {} };
    const noMu = function (v) { return /^\s*\d{4}\s*\/\s*\d+\s*(E\.?|ESAS)?\s*$/i.test(String(v)); };
    const daireMi = function (v) { return /İCRA/.test(buyuk(v)) && !noMu(v); };
    Object.keys(satirlar).forEach(function (r) {
      Object.keys(satirlar[r]).forEach(function (h) {
        const v = satirlar[r][h];
        if (noMu(v)) say.no[h] = (say.no[h] || 0) + 1;
        else if (daireMi(v)) say.daire[h] = (say.daire[h] || 0) + 1;
      });
    });
    const enCok = function (o) { return Object.keys(o).sort(function (a, b) { return o[b] - o[a] || sutunNo(a) - sutunNo(b); })[0] || null; };
    const sNo = enCok(say.no), sDaire = enCok(say.daire);
    const l = [];
    if (!sNo) return { kayitlar: l, sutunlar: { no: null, daire: sDaire } };
    Object.keys(satirlar).map(Number).sort(function (a, b) { return a - b; }).forEach(function (r) {
      const s = satirlar[r], n = dosyaNo(noMu(s[sNo]) ? s[sNo] : '');
      if (!n) return;
      const daire = metin(sDaire && daireMi(s[sDaire]) ? s[sDaire] : varsayilanDaire);
      l.push({ satir: r, daire: daire, no: n.no, anahtar: icraDuz(daire) + '|' + n.no });
    });
    return { kayitlar: l, sutunlar: { no: sNo, daire: sDaire } };
  };

  /* ---------- Excel yazma (yeni çalışma kitabı) ---------- */
  KH.excelXml = function (satirlar) {
    const hucre = function (v, r, c, stil) {
      const ref = sutunHarf(c) + r, s = stil ? ' s="' + stil + '"' : '';
      if (v === '' || v === null || v === undefined) return stil ? '<c r="' + ref + '"' + s + '/>' : '';
      if (typeof v === 'number') return '<c r="' + ref + '"' + s + '><v>' + v + '</v></c>';
      return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' + xmlKac(v) + '</t></is></c>';
    };
    const n = KH.BASLIKLAR.length;
    let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<sheetViews><sheetView workbookViewId="0"><pane xSplit="2" ySplit="1" topLeftCell="C2" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><cols>';
    GENISLIK.forEach(function (g, i) { x += '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + g + '" customWidth="1"/>'; });
    x += '</cols><sheetData><row r="1">' + KH.BASLIKLAR.map(function (b, i) { return hucre(b, 1, i + 1, 1); }).join('') + '</row>';
    satirlar.forEach(function (s, i) {
      x += '<row r="' + (i + 2) + '">' + s.map(function (v, c) { return hucre(v, i + 2, c + 1, 2); }).join('') + '</row>';
    });
    x += '</sheetData><autoFilter ref="A1:' + sutunHarf(n) + Math.max(1, satirlar.length + 1) + '"/></worksheet>';
    return x;
  };
  KH.excelYaz = async function (satirlar) {
    const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
    const dosyalar = {
      '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
      '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook ' + ns + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Konut Haczi" sheetId="1" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      'xl/styles.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet ' + ns + '><fonts count="2"><font><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>'
        + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF3B3F73"/><bgColor indexed="64"/></patternFill></fill></fills>'
        + '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFDCDEEA"/></left><right style="thin"><color rgb="FFDCDEEA"/></right><top style="thin"><color rgb="FFDCDEEA"/></top><bottom style="thin"><color rgb="FFDCDEEA"/></bottom><diagonal/></border></borders>'
        + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        + '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
        + '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>'
        + '<xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs></styleSheet>',
      'xl/worksheets/sheet1.xml': KH.excelXml(satirlar)
    };
    const g = [];
    for (const ad of Object.keys(dosyalar)) g.push(await girdiYap(ad, dosyalar[ad]));
    return zipYaz(g);
  };

  /* ---------- UYAP bağlantısı (yalnız sayfada) ---------- */
  const CAPTCHA = ['PRTL_GNL_100063', 'PRTL_GNL_100063-1'];
  /* FRM_GNL_10001: "Oturum zamanı aşıldı. Yeniden sisteme giriş yapılmalı." */
  const OTURUM = ['PRTL_GNL_100026', 'PRTL_GNL_100026-1', 'PRTL_GNL_100032', 'FRM_GNL_10001'];
  const MESGUL = 'PRTL_GNL_10001-61';
  const DURDURAN = ['OTURUM', 'CAPTCHA', 'KISIT', 'BAGLANTI'];
  function dur(kod, mesaj) { const e = new Error(mesaj || kod); e.kod = kod; return e; }
  KH.DURDURAN = DURDURAN;

  KH.baglanti = function (o) {
    o = o || {};
    const getir = o.fetch || kok.fetch.bind(kok);
    const uyu = o.uyu || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    const uyapMi = /(^|\.)uyap\.gov\.tr$/.test(kok.location.hostname);
    let onek = o.onek || null, sonIstek = 0, aralik = o.aralik === undefined ? 4000 : o.aralik;
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
    /*
     * İstekler arasında en az "aralik" kadar beklenir. Köprü ya da UYAP yanıt vermezse (ağ hatası, 5xx:
     * İmza Pro "504 [Fiddler] ReadResponse() failed" döndürür) artan aralarla yeniden denenir; düzelmezse
     * BAGLANTI hatasıyla durulur. Yanıtsız kalan istek asla "dosya yok" sayılmaz.
     */
    const BEKLEME = o.yenidenDeneme || [15000, 45000, 90000];
    async function cagri(url, secenek) {
      for (let deneme = 0; ; deneme++) {
        const gecen = Date.now() - sonIstek;
        if (sonIstek && gecen < aralik) await uyu(aralik - gecen);
        sonIstek = Date.now();
        let y = null;
        try { y = await getir(url, secenek); } catch (e) { y = null; }
        if (y && y.status === 401) throw dur('OTURUM', 'Oturum kapanmış');
        if (y && (y.status === 403 || y.status === 429)) throw dur('KISIT', 'UYAP erişimi kısıtladı');
        if (y && y.status < 500) return y;
        if (deneme >= BEKLEME.length) throw dur('BAGLANTI', 'UYAP yanıt vermiyor' + (y ? ' (' + y.status + ')' : ''));
        if (o.bildir) o.bildir('UYAP yanıt vermedi' + (y ? ' (' + y.status + ')' : '') + '; ' + Math.round(BEKLEME[deneme] / 1000) + ' sn sonra yeniden denenecek');
        await uyu(BEKLEME[deneme]);
      }
    }
    async function istek(uc, govde, b) {
      for (let deneme = 0; ; deneme++) {
        const y = await cagri(yolOneki() + uc, { method: 'POST', credentials: 'include', headers: basliklar(b), body: JSON.stringify(govde || {}) });
        const ham = await y.text();
        let v;
        try { v = JSON.parse(ham); } catch (e) {
          if (/nosessionobject/i.test(ham) || /<html|<!doctype/i.test(ham.slice(0, 400))) throw dur('OTURUM', 'Oturum kapanmış');
          throw dur('BAGLANTI', 'UYAP anlaşılır yanıt vermedi (' + y.status + ')');
        }
        const kod = v && !Array.isArray(v) && v.errorCode;
        if (kod) {
          if (CAPTCHA.indexOf(kod) !== -1) throw dur('CAPTCHA', 'UYAP güvenlik doğrulaması istedi');
          if (OTURUM.indexOf(kod) !== -1) throw dur('OTURUM', 'Oturum kapanmış');
          if (kod === MESGUL && deneme < 2) { await uyu(20000); continue; }
          throw new Error(metin(v.error || v.message || 'UYAP hata döndürdü') + ' (' + kod + ')');
        }
        return v;
      }
    }
    async function birimListesi(kapali) {
      const anahtar = kapali ? 'k' : 'a';
      if (!birimOnbellek[anahtar]) {
        const l = await istek('avukat_mahkemeleri_sorgula.ajx', { yargiTuru: '2', yargiBirimi: '1101', dosyaKapaliMi: kapali });
        if (!Array.isArray(l)) throw dur('BAGLANTI', 'İcra dairesi listesi alınamadı');
        birimOnbellek[anahtar] = l.filter(function (b) { return b && b.birimId; }).map(function (b) { return { ad: metin(b.birimAdi), duz: icraDuz(b.birimAdi), birimId: String(b.birimId) }; });
      }
      return birimOnbellek[anahtar];
    }
    async function birimBul(daire) {
      const aranan = icraDuz(daire);
      if (!aranan) return null;
      for (const kapali of [false, true]) {
        const b = enYakin((await birimListesi(kapali)).filter(function (x) { return !/İFLAS/.test(x.duz) || /İFLAS/.test(aranan); }), aranan);
        if (b) return b;
      }
      return null;
    }
    /* Dosya: önce açık, bulunamazsa kapalı dosyalarda. Yanıt dizi değilse "yok" sayılmaz, hata verilir */
    async function dosyaBul(daire, no) {
      const e = dosyaNo(no);
      if (!e) throw dur('ATLA', 'Dosya numarası yıl/sıra biçiminde değil');
      const birim = await birimBul(daire);
      if (!birim) throw dur('ATLA', 'İcra dairesi UYAP listesinde bulunamadı: ' + daire);
      const b = { dosyaNo: e.no, birimTuru2: '1101', birimId: birim.birimId, birimAdi: birim.ad, dosyaDurum: 'Açık' };
      for (const durum of [0, 1]) {
        const r = await istek('search_phrase_detayli.ajx', { dosyaDurumKod: durum, pageSize: 500, pageNumber: 1, dosyaYil: e.yil, dosyaSira: e.sira, birimId: birim.birimId, birimTuru2: '1101', birimTuru3: '2' }, b);
        if (!Array.isArray(r)) throw dur('BAGLANTI', 'Dosya araması beklenmeyen yanıt verdi');
        let u = (Array.isArray(r[0]) ? r[0] : []).filter(function (x) { return x && (dosyaNo(x.dosyaNo) || {}).no === e.no; });
        if (u.length > 1) u = u.filter(function (x) { return x.dosyaTurKod === 35; });
        if (u.length > 1) throw dur('ATLA', 'Aynı numarayla birden çok dosya çıktı');
        if (u.length === 1) return Object.assign({}, b, { dosyaId: u[0].dosyaId, dosyaDurum: metin(u[0].dosyaDurum) || (durum ? 'Kapalı' : 'Açık'), kapali: durum === 1 });
      }
      return null;
    }
    async function evraklar(d) {
      const hepsi = [];
      for (let s = 1; s <= 8; s++) {
        const v = await istek('list_dosya_evraklar.ajx', { dosyaId: d.dosyaId, pageNumber: s }, d);
        const t = v && v.tumEvraklar;
        if (!t || typeof t !== 'object') { if (s === 1) throw dur('BAGLANTI', 'Evrak listesi alınamadı'); break; }
        Object.keys(t).forEach(function (grup) {
          if (grup.indexOf(d.dosyaNo + '(') !== 0) return;
          (Array.isArray(t[grup]) ? t[grup] : []).forEach(function (x) {
            hepsi.push({ evrakId: x.evrakId, tur: metin(x.tur), aciklama: metin(x.aciklama), tarih: metin(x.sistemeGonderildigiTarih) || metin(x.onaylandigiTarih),
              gonderen: metin(x.gonderenYerKisi), gonderenDosyaNo: metin(x.gonderenDosyaNo) });
          });
        });
        if (!(Number(v.pageTotal) > s)) break;
      }
      return hepsi;
    }
    /* İmza Pro evrak servisi ara sıra 5xx döndürür; cagri() yeniden dener */
    async function belgeBayt(d, evrak) {
      const h = basliklar(d);
      h['Content-Type'] = 'application/octet-stream'; delete h['Accept'];
      const y = await cagri(yolOneki() + 'view_document_brd.uyap?evrakId=' + encodeURIComponent(evrak.evrakId) + '&dosyaId=' + encodeURIComponent(d.dosyaId), { method: 'GET', credentials: 'include', headers: h });
      const b = new Uint8Array(await y.arrayBuffer());
      if (/nosessionobject/i.test(String.fromCharCode.apply(null, b.subarray(0, 200)))) throw dur('OTURUM', 'Oturum kapanmış');
      return b;
    }
    /* UDF'nin content.xml'i; UDF değilse (PDF, görüntü) null */
    async function belgeXml(d, evrak) {
      const b = await belgeBayt(d, evrak);
      if (String.fromCharCode.apply(null, b.subarray(0, 2)) !== 'PK') return null;
      const g = zipOku(b).find(function (x) { return x.ad === 'content.xml'; });
      return g ? girdiMetni(g) : null;
    }
    return { dosyaBul: dosyaBul, evraklar: evraklar, belgeXml: belgeXml, aralikAyarla: function (ms) { aralik = ms; } };
  };

  /* ---------- Tek dosya ---------- */
  KH.dosyaSorgula = async function (bag, k) {
    const s = { daire: k.daire, no: k.no, notlar: [], ozet: null, durum: '', mesaj: '' };
    const d = await bag.dosyaBul(k.daire, k.no);
    if (!d) { s.durum = 'Dosya bulunamadı'; s.mesaj = 'Dosya UYAP\'ta bu hesapla görünmüyor (açık ve kapalı dosyalarda arandı)'; return s; }
    s.dosyaDurum = d.dosyaDurum; s.daire = d.birimAdi;
    const sr = KH.surec(await bag.evraklar(d), d.birimAdi);
    const oku = async function (e) {
      try { return await bag.belgeXml(d, e); }
      catch (hata) { if (hata && DURDURAN.indexOf(hata.kod) !== -1) throw hata; return null; }
    };
    const okunan = { kararlar: [], tevzi: null, talimatYeri: '', anaNo: d.dosyaNo };
    /* Kararlar yeniden eskiye; üçten fazlası yalnız evrak listesindeki bilgiyle yazılır */
    const kararlar = sr.kararlar.slice().reverse();
    for (let i = 0; i < kararlar.length; i++) {
      const xml = i < 3 ? await oku(kararlar[i]) : null;
      okunan.kararlar.push({ evrak: kararlar[i], coz: xml ? KH.kararCoz(KH.udfIcerik(xml)) : null, okunamadi: !xml });
    }
    /* Karar yoksa değişik iş dosyasının mahkemesi ve esas numarası tevzi formundadır */
    if (sr.adim === 3 && sr.evrak.tevzi) {
      const xml = await oku(sr.evrak.tevzi);
      if (xml) okunan.tevzi = KH.tevziCoz(xml); else s.notlar.push('Tevzi formu okunamadı');
    }
    /* Talimat yazılmış ama talimat dosyası henüz gelmemişse yazının muhatabı okunur */
    if (sr.adim === 6 && sr.evrak.talimatYazisi) {
      const xml = await oku(sr.evrak.talimatYazisi);
      if (xml) okunan.talimatYeri = KH.talimatYeri(KH.udfIcerik(xml));
    }
    s.ozet = KH.ozetle(sr, okunan);
    s.ozet.notlar = s.ozet.notlar.concat(s.notlar);
    return s;
  };

  /* Panelde tek satırlık özet */
  KH.kisaOzet = function (s) {
    if (!s.ozet) return (s.durum || 'Hata') + (s.mesaj ? ': ' + s.mesaj : '');
    const o = s.ozet, p = [o.adim + '. adım: ' + o.adimAdi];
    o.disler.forEach(function (d) { p.push([d.mahkeme, d.esasNo ? d.esasNo + ' D.İş' : '', d.kararNo ? 'K. ' + d.kararNo : '', d.kararTarihi, d.sonuc].filter(Boolean).join(' ')); });
    o.talimatlar.forEach(function (t) { p.push('Talimat: ' + t.daire + ' ' + t.dosyaNo); });
    if (o.talimatYeri && !o.talimatlar.length) p.push('Talimat yazılan yer: ' + o.talimatYeri);
    return p.join(' · ');
  };

  /* ---------- Kayıtlı sonuçlar (tarayıcıda; oturum düşerse kaldığı yerden devam) ---------- */
  const DEPO = 'konutHacziSorgu.sonuclar';
  function depoOku() { try { return JSON.parse(kok.localStorage.getItem(DEPO) || '{}') || {}; } catch (e) { return {}; } }
  function depoYaz(v) { try { kok.localStorage.setItem(DEPO, JSON.stringify(v)); } catch (e) { /* dolu ya da kapalı */ } }

  /* ---------- Panel ---------- */
  function panel() {
    const d = kok.document;
    if (d.getElementById('kh-kok')) { d.getElementById('kh-kok').style.display = ''; return; }
    const st = d.createElement('style');
    st.textContent = '#kh-kok{position:fixed;left:16px;bottom:16px;z-index:2147483000;width:460px;max-height:82vh;overflow:auto;background:#fff;color:#1d2733;border:1px solid #c9d3de;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.18);font:13px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;padding:14px}'
      + '#kh-kok h2{font-size:15px;margin:0 0 8px;color:#3b3f73}#kh-kok .kh-x{position:absolute;right:10px;top:8px;border:0;background:none;font-size:18px;cursor:pointer;color:#567}'
      + '#kh-kok label{display:block;margin:6px 0}#kh-kok input[type=number]{width:70px}#kh-kok input[type=text]{width:100%;box-sizing:border-box}'
      + '#kh-kok button.kh-b{margin:8px 6px 0 0;padding:6px 12px;border:1px solid #3b3f73;border-radius:6px;background:#3b3f73;color:#fff;cursor:pointer}'
      + '#kh-kok button.kh-b[disabled]{opacity:.45;cursor:default}#kh-kok button.kh-ikincil{background:#fff;color:#3b3f73}'
      + '#kh-kok .kh-d{margin-top:8px;color:#456}#kh-kok ol{padding-left:26px;margin:8px 0 0}#kh-kok li{margin:4px 0}#kh-kok .kh-not{color:#8a5a00;font-size:12px}#kh-kok .kh-hata{color:#b00020}#kh-kok .kh-kucuk{font-size:12px;color:#567}';
    d.head.appendChild(st);
    const k = d.createElement('div');
    k.id = 'kh-kok';
    k.innerHTML = '<button class="kh-x" title="Kapat">×</button><h2>Konut Haczi Sorgu</h2>'
      + '<div>Excel\'deki icra dosyalarının evrak listesine bakar; konut haczi sürecinin adımını, değişik iş dosyasını ve talimat dosya numarasını bulur. Yalnız sorgular.</div>'
      + '<label>Excel: <input type="file" accept=".xlsx" class="kh-dosya"></label>'
      + '<label class="kh-daire-s" style="display:none">İcra dairesi (Excel\'de yoksa): <input type="text" class="kh-daire" placeholder="İstanbul Anadolu 2. Banka Alacakları İcra Dairesi"></label>'
      + '<label>Başlangıç sırası <input type="number" class="kh-bas" min="1" value="1"> &nbsp; Kaç dosya <input type="number" class="kh-adet" min="1" value="10"></label>'
      + '<label><input type="checkbox" class="kh-atla" checked> Kayıtlı sonucu olanları yeniden sorgulama</label>'
      + '<label>İstekler arası bekleme (sn) <input type="number" class="kh-ara" min="2" value="4"></label>'
      + '<button class="kh-b kh-basla" disabled>Başlat</button><button class="kh-b kh-ikincil kh-dur" disabled>Durdur</button><button class="kh-b kh-indir" disabled>Excel\'i indir</button>'
      + '<button class="kh-b kh-ikincil kh-sil" title="Tarayıcıda saklanan sonuçları siler">Kayıtları sil</button>'
      + '<div class="kh-d"></div><ol class="kh-liste"></ol>';
    d.body.appendChild(k);
    const $ = function (c) { return k.querySelector(c); };
    let hucreler = null, kayitlar = [], ad = 'Konut Haczi Sorgu.xlsx', durdur = false, calisiyor = false;
    let sonuclar = depoOku();
    KH.sonuclar = sonuclar;
    const durum = function (m, hata) { $('.kh-d').innerHTML = ''; const s = d.createElement('span'); if (hata) s.className = 'kh-hata'; s.textContent = m; $('.kh-d').appendChild(s); };
    const kayitliSay = function () { return kayitlar.filter(function (x) { return sonuclar[x.anahtar]; }).length; };
    const listele = function () {
      const r = KH.kayitlar(hucreler, $('.kh-daire').value);
      kayitlar = r.kayitlar;
      $('.kh-daire-s').style.display = r.sutunlar.daire ? 'none' : '';
      const eksik = kayitlar.filter(function (x) { return !x.daire; }).length;
      const ks = kayitliSay();
      const ilkBos = kayitlar.findIndex(function (x) { return !sonuclar[x.anahtar]; });
      $('.kh-bas').value = ilkBos >= 0 ? ilkBos + 1 : 1;
      $('.kh-adet').value = Math.max(1, kayitlar.length - (ilkBos >= 0 ? ilkBos : 0));
      $('.kh-basla').disabled = !kayitlar.length || eksik > 0 || calisiyor;
      $('.kh-indir').disabled = !kayitlar.length;
      if (!kayitlar.length) durum('Excel\'de "2026/12345" biçiminde dosya numarası bulunamadı.', true);
      else if (eksik) durum(kayitlar.length + ' dosya okundu; icra dairesi sütunu yok. Daire adını yukarıya yazın.', true);
      else durum(kayitlar.length + ' dosya okundu' + (ks ? ', ' + ks + ' tanesinin sonucu bu tarayıcıda kayıtlı' : '') + '.');
    };
    $('.kh-x').onclick = function () { k.style.display = 'none'; };
    $('.kh-daire').oninput = function () { if (hucreler) listele(); };
    $('.kh-dosya').onchange = async function (e) {
      const f = e.target.files[0];
      if (!f) return;
      try {
        hucreler = await KH.excelHucreler(new Uint8Array(await f.arrayBuffer()));
        ad = f.name.replace(/\.xlsx$/i, '') + ' - Konut Haczi Sorgu.xlsx';
        listele();
      } catch (hata) { durum('Excel okunamadı: ' + hata.message, true); }
    };
    $('.kh-dur').onclick = function () { durdur = true; durum('Durduruluyor; süren istek bitince duracak.'); };
    $('.kh-sil').onclick = function () {
      if (calisiyor) return;
      Object.keys(sonuclar).forEach(function (a) { delete sonuclar[a]; });
      depoYaz(sonuclar);
      $('.kh-liste').innerHTML = '';
      if (hucreler) listele(); else durum('Kayıtlı sonuçlar silindi.');
    };
    $('.kh-indir').onclick = async function () {
      const blob = await KH.excelYaz(kayitlar.map(function (x) { return KH.satir(x, sonuclar[x.anahtar]); }));
      const a = d.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = ad; d.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    };
    const yaz = function (sira, x, s) {
      const li = d.createElement('li');
      li.value = sira;
      const b = d.createElement('div');
      b.textContent = x.no + ': ' + KH.kisaOzet(s);
      if (!s.ozet) b.className = 'kh-hata';
      li.appendChild(b);
      const n = (s.ozet ? s.ozet.notlar : s.notlar) || [];
      if (n.length) { const e = d.createElement('div'); e.className = 'kh-not'; e.textContent = n.join('; '); li.appendChild(e); }
      $('.kh-liste').appendChild(li);
      li.scrollIntoView({ block: 'nearest' });
    };
    $('.kh-basla').onclick = async function () {
      const bas = Math.max(1, +$('.kh-bas').value || 1), adet = Math.max(1, +$('.kh-adet').value || 10), atla = $('.kh-atla').checked;
      const is = kayitlar.map(function (x, i) { return { x: x, sira: i + 1 }; }).slice(bas - 1, bas - 1 + adet).filter(function (y) { return !atla || !sonuclar[y.x.anahtar]; });
      if (!is.length) { durum('Sorgulanacak dosya yok (seçilen aralıktaki dosyaların sonucu kayıtlı).', true); return; }
      durdur = false; calisiyor = true;
      $('.kh-basla').disabled = true; $('.kh-dur').disabled = false; $('.kh-liste').innerHTML = '';
      let ileti = '';
      const bag = KH.baglanti({ aralik: Math.max(2, +$('.kh-ara').value || 4) * 1000, bildir: function (m) { durum(ileti + ' ' + m, true); } });
      let i = 0, yapilan = 0, durdu = '';
      for (const y of is) {
        if (durdur) break;
        i++;
        ileti = i + '/' + is.length + ': ' + y.x.no + ' sorgulanıyor…';
        durum(ileti);
        let s;
        try { s = await KH.dosyaSorgula(bag, y.x); }
        catch (hata) {
          if (DURDURAN.indexOf(hata.kod) !== -1) { durdu = hata.message + '. Bot durdu; ' + (hata.kod === 'BAGLANTI' ? 'biraz sonra' : 'yeniden giriş yapıp') + ' kaldığı yerden devam edin (sonuçlar kayıtlı).'; break; }
          s = { daire: y.x.daire, no: y.x.no, notlar: [], ozet: null, durum: hata.kod === 'ATLA' ? 'Atlandı' : 'Hata', mesaj: hata.message, gecici: hata.kod !== 'ATLA' };
        }
        s.zaman = new Date().toISOString();
        /* Geçici hatalar kaydedilmez: sonraki çalıştırmada yeniden sorgulanır */
        if (!s.gecici) { sonuclar[y.x.anahtar] = s; depoYaz(sonuclar); }
        yapilan++;
        yaz(y.sira, y.x, s);
      }
      calisiyor = false;
      $('.kh-basla').disabled = false; $('.kh-dur').disabled = true;
      if (durdu) durum(durdu, true);
      else durum((durdur ? 'Durduruldu: ' : 'Bitti: ') + yapilan + ' dosya sorgulandı; toplam ' + kayitliSay() + '/' + kayitlar.length + ' dosyanın sonucu hazır. "Excel\'i indir" ile alın.');
    };
  }

  KH.surum = SURUM;
  KH.panel = panel;
  if (typeof module !== 'undefined' && module.exports) module.exports = KH;
  else {
    kok.KonutHacziSorgu = KH;
    if (kok.document && !kok.__khTest) panel();
  }
})(typeof window !== 'undefined' ? window : globalThis);
