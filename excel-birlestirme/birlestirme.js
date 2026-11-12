/*
 * Excel Birleştirme: birleştirme mantığı
 *
 * Gelen Excel sayfalarını tanır (banka cevapları, tebligat raporu, genel tablo),
 * gelen her sütunu ana tablodaki bir sütuna eşler (öneri kendiliğinden gelir,
 * kullanıcı değiştirir), satırları ana tablodaki kurum sayfasına yazar ve neyin
 * nereye yazıldığını raporlar. Tarayıcıda çalışır, veri dışarı gitmez.
 *
 * Ana tablo: her kurum (müvekkil) bir sayfa; her satır bir icra dosyası.
 * Satır kimliği: İcra Dairesi + Dosya No. Aynı kimlikteki satırlar, ayrı
 * dosyalardan da gelse aynı dosyanın içinde de olsa, tek satırda toplanır.
 * Sütun listesi sabit değildir: ayarlardaki "sutunlar" listesinden gelir.
 */
(function (kok) {
  'use strict';

  const VARSAYILAN_SUTUNLAR = [
    'Borçlu Adı', 'Borçlu TCKN / VKN', 'İcra Dairesi', 'Dosya No',
    'Tebligat Bilgisi', 'Kesinleşme Bilgisi',
    'Araç Sorgusu', 'Araç Haczi', 'Tapu Sorgusu', 'Tapu Haczi',
    'Alacaklı Olduğu Dosya Sorgusu', 'Alacaklı Olduğu Dosya Haczi',
    'Maaş Sorgusu', 'Maaş Haczi', 'Banka Sorgusu', 'Banka Haczi',
    'Bankada Para Var mı?', 'Bankadan Para İstendi mi?',
    'Firma Sorgusu', 'Firma Haczi',
    'Föy No', 'Alacaklı'
  ];
  const S = {
    BORCLU: 'Borçlu Adı', TCKN: 'Borçlu TCKN / VKN', DAIRE: 'İcra Dairesi', DOSYA: 'Dosya No',
    TEBLIGAT: 'Tebligat Bilgisi', ARAC_SORGU: 'Araç Sorgusu', ARAC_HACIZ: 'Araç Haczi',
    BANKA_HACIZ: 'Banka Haczi', BANKA_PARA: 'Bankada Para Var mı?',
    FOY: 'Föy No', ALACAKLI: 'Alacaklı', GUNCELLEME: 'Son Güncelleme', KAYNAK: 'Kaynak'
  };
  /* Her zaman tablonun sonunda duran, aracın kendi yazdığı sütunlar */
  const META_SUTUNLARI = [S.GUNCELLEME, S.KAYNAK];
  const TABLO_SUTUNLARI = VARSAYILAN_SUTUNLAR.concat(META_SUTUNLARI);
  /* Satır anahtarı: silinemez. Adı sabit sütunlar: araç bunları adından tanır */
  const ANAHTAR_SUTUNLARI = [S.DAIRE, S.DOSYA];
  const SABIT_ADLI_SUTUNLAR = [S.BORCLU, S.TCKN, S.DAIRE, S.DOSYA, S.FOY, S.ALACAKLI];
  const KIMLIK_SUTUNLARI = SABIT_ADLI_SUTUNLAR;
  const ROL = {};
  ROL[S.BORCLU] = 'borclu'; ROL[S.TCKN] = 'tckn'; ROL[S.DAIRE] = 'daire'; ROL[S.DOSYA] = 'dosyaNo'; ROL[S.FOY] = 'foy'; ROL[S.ALACAKLI] = 'alacakli';
  const KULLANMA = '(kullanma)';
  /* Bir hücrede borçlu borçlu bilgiler AYRAC ile, aynı borçlunun birden çok değeri COKLU ile ayrılır */
  const AYRAC = '; ', COKLU = ' / ';
  const SUTUN_ADI_SINIRI = 80;
  const DIGER = 'Diğer';
  const SAYFA = { NOTLAR: 'Notlar', GUNLUK: 'Günlük', RAPOR: 'Son Yükleme Raporu', AYARLAR: 'Ayarlar' };
  const NOT_BASLIKLARI = ['Tarih', 'Kurum', 'İlgili Kayıt', 'Not', 'Yazan'];
  const GUNLUK_BASLIKLARI = ['Zaman', 'Dosya', 'Sayfa', 'Tür', 'Okunan Satır', 'Yeni Satır', 'Güncellenen', 'Değişmeyen', 'Atlanan', 'Diğer Sayfasına', 'Not'];
  const RAPOR_BASLIKLARI = ['Kaynak Dosya', 'Kaynak Sayfa', 'Kaynak Satır', 'İşlem', 'Hedef Sayfa', 'İcra Dairesi', 'Dosya No', 'Borçlu Adı', 'Yazılan Bilgiler', 'Not'];
  const GENISLIK = {
    'Borçlu Adı': 34, 'Borçlu TCKN / VKN': 16, 'İcra Dairesi': 26, 'Dosya No': 13, 'Tebligat Bilgisi': 52,
    'Kesinleşme Bilgisi': 18, 'Banka Haczi': 32, 'Bankada Para Var mı?': 24, 'Bankadan Para İstendi mi?': 20,
    'Föy No': 9, 'Alacaklı': 36, 'Son Güncelleme': 14, 'Kaynak': 32
  };

  const VARSAYILAN_AYARLAR = {
    /* Kurum (müvekkil) listesi bilerek boş: site herkese açık. Liste Ayarlar'dan
       girilir; tarayıcıda ve indirilen ana Excel'in Ayarlar sayfasında saklanır.
       sutunlar boşsa VARSAYILAN_SUTUNLAR kullanılır. */
    kurumlar: [],
    esler: [],
    sutunlar: []
  };

  /* Gelen Excel'lerde aynı bilginin bilinen farklı başlıkları */
  const HAZIR_ESLER = {
    'Borçlu Adı': ['Borçlu', 'Borçlu Adı Soyadı', 'Borçlu Ad Soyad', 'Borçlu Unvanı', 'Borçlu Adı Unvanı', 'Karşı Yan', 'Karşı Taraf', 'Ad Soyad', 'Adı Soyadı', 'Adı Soyadı Unvanı'],
    'Borçlu TCKN / VKN': ['TCKN', 'VKN', 'TCKN VKN', 'TC VKN', 'TC Kimlik No', 'TC Kimlik Numarası', 'Kimlik No', 'Vergi No', 'Vergi Kimlik No', 'Borçlu TCKN', 'Borçlu VKN'],
    'İcra Dairesi': ['Birim', 'Birim Adı', 'Daire', 'İcra Müdürlüğü'],
    'Dosya No': ['Esas No', 'Esas', 'Esas Numarası', 'Dosya Numarası', 'İcra Dosya No', 'Takip Dosya No', 'Dosya Esas No'],
    'Tebligat Bilgisi': ['Tebligat', 'Tebligat Durumu', 'Tebliğ Durumu', 'Tebligat Sonucu', 'Tebliğ Sonucu', 'Son Tebligat'],
    'Kesinleşme Bilgisi': ['Kesinleşme', 'Kesinleşme Durumu', 'Kesinleşti mi'],
    'Araç Sorgusu': ['Araç Sorgu', 'Araç Sorgu Sonucu', 'Araç', 'EGM Sorgusu'],
    'Araç Haczi': ['Araç Haciz', 'Araç Haciz Durumu', 'Araç Haczi Durumu'],
    'Tapu Sorgusu': ['Tapu Sorgu', 'Tapu Sorgu Sonucu', 'Tapu', 'TAKBİS Sorgusu'],
    'Tapu Haczi': ['Tapu Haciz', 'Tapu Haciz Durumu', 'Tapu Haczi Durumu'],
    'Alacaklı Olduğu Dosya Sorgusu': ['Alacaklı Olduğu Dosya', 'Alacaklı Olduğu Dosyalar', 'Alacaklı Dosya Sorgusu'],
    'Alacaklı Olduğu Dosya Haczi': ['Alacaklı Dosya Haczi', 'Alacaklı Olduğu Dosya Haciz'],
    'Maaş Sorgusu': ['Maaş Sorgu', 'SGK Sorgusu', 'SGK', 'Maaş'],
    'Maaş Haczi': ['Maaş Haciz', 'SGK Haczi', 'Maaş Haczi Durumu'],
    'Banka Sorgusu': ['Banka Sorgu'],
    'Banka Haczi': ['Banka Haciz', 'Banka Haczi Durumu'],
    'Bankada Para Var mı?': ['Bankada Para', 'Banka Bakiyesi'],
    'Bankadan Para İstendi mi?': ['Bankadan Para İstendi', 'Para İstendi mi', 'Para Talebi', 'Bankadan Para Talebi'],
    'Firma Sorgusu': ['Firma Sorgu', 'Ticaret Sicil Sorgusu'],
    'Firma Haczi': ['Firma Haciz', 'Firma Haczi Durumu'],
    'Föy No': ['Föy', 'Föy Numarası', 'Büro No'],
    'Alacaklı': ['Alacaklı Adı', 'Alacaklı Unvanı', 'Müvekkil']
  };

  /* ---------------- Metin ve değer yardımcıları ---------------- */

  const KATLA = { 'Ç': 'C', 'Ğ': 'G', 'İ': 'I', 'Ö': 'O', 'Ş': 'S', 'Ü': 'U', 'Â': 'A', 'Î': 'I', 'Û': 'U' };

  function bos(v) { return v === null || v === undefined || (typeof v === 'string' && v.trim() === ''); }

  /* Karşılaştırma için: büyük harf, Türkçe harfler sadeleşir, noktalama boşluk olur.
     Aynı adlar binlerce kez sorulduğu için kısa metinlerin sonucu saklanır. */
  const SADE_BELLEK = new Map();
  function sade(v) {
    if (bos(v)) return '';
    const k = String(v);
    let s = k.length <= 80 ? SADE_BELLEK.get(k) : undefined;
    if (s !== undefined) return s;
    s = k.toLocaleUpperCase('tr-TR')
      .replace(/[ÇĞİÖŞÜÂÎÛ]/g, function (c) { return KATLA[c]; })
      .replace(/[^A-Z0-9]+/g, ' ').trim();
    if (k.length <= 80) {
      if (SADE_BELLEK.size >= 20000) SADE_BELLEK.clear();
      SADE_BELLEK.set(k, s);
    }
    return s;
  }

  function adTemizle(ad) { return String(ad === null || ad === undefined ? '' : ad).replace(/\s+/g, ' ').trim(); }
  function iki(n) { return n < 10 ? '0' + n : String(n); }
  function tarihMetni(d) { return iki(d.getUTCDate()) + '.' + iki(d.getUTCMonth() + 1) + '.' + d.getUTCFullYear(); }
  function yerelTarih(d) { return iki(d.getDate()) + '.' + iki(d.getMonth() + 1) + '.' + d.getFullYear(); }
  function yerelZaman(d) { return yerelTarih(d) + ' ' + iki(d.getHours()) + ':' + iki(d.getMinutes()); }
  function sayiMetni(x) { return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x); }

  function degerMetni(v) {
    if (bos(v)) return '';
    if (v instanceof Date) return isNaN(v.getTime()) ? '' : tarihMetni(v);
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : sayiMetni(v);
    if (typeof v === 'boolean') return v ? 'Evet' : 'Hayır';
    return String(v).replace(/\s+/g, ' ').trim();
  }

  function sayiOku(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (bos(v)) return null;
    let s = String(v).replace(/[^0-9,.\-]/g, '');
    if (s.indexOf(',') !== -1) s = s.replace(/\./g, '').replace(',', '.');
    const x = parseFloat(s);
    return isNaN(x) ? null : x;
  }

  function tarihBul(v) {
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    if (bos(v)) return null;
    const m = String(v).match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/);
    if (!m) return null;
    const g = +m[1], a = +m[2];
    if (a < 1 || a > 12 || g < 1 || g > 31) return null;
    return new Date(Date.UTC(+m[3], a - 1, g));
  }

  /* Metinde geçen tarihlerin en yenisi (ms); tarih yoksa null */
  function enSonTarih(v) {
    const re = /(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/g;
    let m, en = null;
    while ((m = re.exec(String(v || ''))) !== null) {
      const d = tarihBul(m[0]);
      if (d && (en === null || d.getTime() > en)) en = d.getTime();
    }
    return en;
  }

  function daireNorm(v) {
    return sade(v).replace(/\b(ICRA|DAIRESI|DAIRE|MUDURLUGU|MUDURLUK|MD|MUD)\b/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function dosyaNorm(v) {
    const m = String(v === null || v === undefined ? '' : v).match(/(\d{4})\s*[\/-]\s*0*(\d+)/);
    return m ? m[1] + '/' + m[2] : sade(v).replace(/\s+/g, '');
  }
  function foyNorm(v) { return degerMetni(v).replace(/\s+/g, '').replace(/^0+(?=\d)/, ''); }
  function dosyaAnahtari(daire, dosya) { return bos(daire) || bos(dosya) ? '' : daireNorm(daire) + '|' + dosyaNorm(dosya); }

  const SIRKET_KELIMELERI = new Set(['LTD', 'LIMITED', 'STI', 'SIRKETI', 'SIRKET', 'AS', 'ANONIM', 'TIC', 'TICARET', 'SAN', 'SANAYI', 'VE', 'VEYA']);
  /* Addaki sözcükler; sonunda nokta olan sözcük kısaltma sayılır (İNŞ., TİC.) */
  function adSozcukleri(ad) {
    const out = [];
    const re = /([^\s.,;:()\/\\\-]+)(\.?)/g;
    let m;
    while ((m = re.exec(String(ad || ''))) !== null) {
      const w = sade(m[1]).replace(/ /g, '');
      if (w) out.push({ w: w, kisa: m[2] === '.' });
    }
    for (let i = 0; i < out.length - 1; i++) if (out[i].w === 'A' && out[i + 1].w === 'S') { out.splice(i, 2); i--; }
    return out.filter(function (x) { return !(x.w.length > 1 && SIRKET_KELIMELERI.has(x.w)); });
  }
  /* Aynı kişi ya da şirket mi: yazım farkına ve kısaltmalara (İNŞ., TİC., LTD. ŞTİ.) dayanıklı */
  function ayniAd(a, b) {
    const x = sade(a), y = sade(b);
    if (!x || !y) return false;
    if (x === y) return true;
    const p = adSozcukleri(a), q = adSozcukleri(b);
    if (!p.length || p.length !== q.length) return false;
    return p.every(function (s, i) {
      const t = q[i];
      return s.w === t.w || (s.kisa && t.w.indexOf(s.w) === 0) || (t.kisa && s.w.indexOf(t.w) === 0);
    });
  }
  function ayniTc(a, b) {
    const x = String(a).replace(/\D/g, ''), y = String(b).replace(/\D/g, '');
    return x || y ? x === y : sade(a) === sade(b);
  }
  /* Hücredeki "A; B" listesini ayırır */
  function listeAyir(v) { return bos(v) ? [] : String(v).split(/\s*;\s*/).map(adTemizle).filter(Boolean); }
  function listeyeEkle(liste, v, esit) {
    if (bos(v)) return false;
    if (liste.length <= 50 ? liste.some(function (x) { return esit(x, v); }) : liste.indexOf(v) !== -1) return false;
    liste.push(v);
    return true;
  }

  function sayfaAdiTemizle(ad) {
    const s = String(ad === null || ad === undefined ? '' : ad).replace(/[\[\]:*?\/\\]/g, ' ').replace(/\s+/g, ' ').trim()
      .replace(/^'+/, '').replace(/'+$/, '');
    return s.slice(0, 31).trim();
  }

  function sutunHarfi(j) {
    let s = '', n = j + 1;
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }

  function listedeBul(liste, ad) {
    const n = sade(ad);
    if (!n) return null;
    for (const c of liste) if (sade(c) === n) return c;
    return null;
  }
  /* Varsayılan sütunlardan biriyse onun yazımını verir */
  function sutunAdiBul(ad) { return listedeBul(TABLO_SUTUNLARI, ad); }
  function metaMi(ad) { return !!listedeBul(META_SUTUNLARI, ad); }

  /* ---------------- Ayarlar ---------------- */

  function sutunlariHazirla(liste) {
    const out = [], gorulen = new Set();
    (Array.isArray(liste) && liste.length ? liste : VARSAYILAN_SUTUNLAR).forEach(function (ad) {
      ad = adTemizle(ad).slice(0, SUTUN_ADI_SINIRI).trim();
      ad = sutunAdiBul(ad) || ad;
      const n = sade(ad);
      if (!n || gorulen.has(n) || metaMi(ad) || n === sade(KULLANMA)) return;
      gorulen.add(n);
      out.push(ad);
    });
    ANAHTAR_SUTUNLARI.slice().reverse().forEach(function (c) { if (!gorulen.has(sade(c))) out.unshift(c); });
    return out;
  }

  function ayarlariHazirla(ayar) {
    ayar = ayar || VARSAYILAN_AYARLAR;
    const ayrilmis = new Set([DIGER, SAYFA.NOTLAR, SAYFA.GUNLUK, SAYFA.RAPOR, SAYFA.AYARLAR].map(sade));
    const kurumlar = [];
    (ayar.kurumlar || []).forEach(function (k) {
      const ad = sayfaAdiTemizle(k && k.ad);
      if (!ad || ayrilmis.has(sade(ad))) return;
      ayrilmis.add(sade(ad));
      const kelimeler = (k.kelimeler || []).map(function (w) { return String(w).trim(); }).filter(Boolean);
      kurumlar.push({ ad: ad, kelimeler: kelimeler, aranan: (kelimeler.length ? kelimeler : [ad]).map(sade).filter(Boolean) });
    });
    const sutunlar = sutunlariHazirla(ayar.sutunlar);
    /* Hatırlanan eşleştirmeler: gelen başlık > ana tablodaki sütun ya da KULLANMA.
       Listede olmayan bir hedef yazılmışsa tabloya yeni sütun olarak eklenir. */
    const hatirlanan = new Map(), esler = [];
    (ayar.esler || []).forEach(function (e) {
      if (!e || bos(e.gelen) || bos(e.hedef)) return;
      const gelen = adTemizle(e.gelen), n = sade(gelen);
      if (!n) return;
      let hedef = adTemizle(e.hedef);
      if (sade(hedef) === sade(KULLANMA)) hedef = KULLANMA;
      else {
        hedef = listedeBul(sutunlar, hedef) || sutunAdiBul(hedef) || hedef.slice(0, SUTUN_ADI_SINIRI).trim();
        if (!sade(hedef) || metaMi(hedef)) return;
        if (sutunlar.indexOf(hedef) === -1) sutunlar.push(hedef);
      }
      if (hatirlanan.has(n)) esler.splice(esler.findIndex(function (x) { return sade(x.gelen) === n; }), 1);
      hatirlanan.set(n, hedef);
      esler.push({ gelen: gelen, hedef: hedef });
    });
    const sutunKumesi = new Set(sutunlar);
    /* Adı değiştirilmiş bir varsayılan sütunun bugünkü adı (eski ad > yeni ad eşleştirmesinden) */
    function guncelAd(h) {
      if (sutunKumesi.has(h)) return h;
      const e = hatirlanan.get(sade(h));
      return e && e !== KULLANMA && sutunKumesi.has(e) ? e : '';
    }
    /* Hazır eşleştirmeler: sütunun kendi adı ve bilinen eş adları */
    const hazir = new Map();
    sutunlar.forEach(function (c) { hazir.set(sade(c), c); });
    Object.keys(HAZIR_ESLER).forEach(function (h) {
      const hedef = guncelAd(h);
      if (!hedef) return;
      HAZIR_ESLER[h].forEach(function (a) { const n = sade(a); if (!hazir.has(n)) hazir.set(n, hedef); });
    });
    return { kurumlar: kurumlar, sutunlar: sutunlar, sutunKumesi: sutunKumesi, hatirlanan: hatirlanan, hazir: hazir, guncelAd: guncelAd, esler: esler };
  }

  function ayarDuz(ayar) {
    const A = ayarlariHazirla(ayar);
    return {
      kurumlar: A.kurumlar.map(function (k) { return { ad: k.ad, kelimeler: k.kelimeler.slice() }; }),
      esler: A.esler.map(function (e) { return { gelen: e.gelen, hedef: e.hedef }; }),
      sutunlar: A.sutunlar.slice()
    };
  }

  function ayaraKurumlariEkle(ayar, adlar) {
    const d = ayarDuz(ayar);
    (adlar || []).forEach(function (ad) {
      if (!d.kurumlar.some(function (k) { return sade(k.ad) === sade(ad); })) d.kurumlar.push({ ad: ad, kelimeler: [] });
    });
    return ayarDuz(d);
  }

  function kurumBul(alacakli, kurumlar) {
    if (bos(alacakli)) return null;
    const metin = ' ' + sade(alacakli);
    for (const k of kurumlar) for (const w of k.aranan) if (metin.indexOf(' ' + w) !== -1) return k.ad;
    return null;
  }

  function ayarlariOku(satirlar) {
    const ayar = { kurumlar: [], esler: [] };
    let bolum = null;
    (satirlar || []).forEach(function (r) {
      r = r || [];
      const a = degerMetni(r[0]), b = degerMetni(r[1]), na = sade(a);
      if (!a) { bolum = null; return; }
      if (na === 'KURUM') { bolum = 'kurum'; return; }
      if (na === sade('Gelen sütun adı')) { bolum = 'es'; return; }
      if (bolum === 'kurum') ayar.kurumlar.push({ ad: a, kelimeler: b ? b.split(/[,;]/).map(function (w) { return w.trim(); }).filter(Boolean) : [] });
      else if (bolum === 'es' && b) ayar.esler.push({ gelen: a, hedef: b });
    });
    return ayar.kurumlar.length || ayar.esler.length ? ayar : null;
  }

  function ayarSatirlari(ayar) {
    const A = ayarlariHazirla(ayar);
    const satirlar = [['Kurum', 'Alacaklı adında geçenler']];
    A.kurumlar.forEach(function (k) { satirlar.push([k.ad, k.kelimeler.join(', ')]); });
    satirlar.push([]);
    const esBasligi = satirlar.length;
    satirlar.push(['Gelen sütun adı', 'Tablodaki sütun']);
    A.esler.forEach(function (e) { satirlar.push([e.gelen, e.hedef]); });
    satirlar.push([]);
    satirlar.push(['Açıklama', 'Bu sayfa Excel Birleştirme sayfasının ayarlarıdır. Kurum eklemek için ilk listeye satır ekleyin; "Alacaklı adında geçenler" virgülle ayrılır. İkinci liste hatırlanan sütun eşleştirmeleridir: gelen Excel\'deki bir başlığın ana tabloda hangi sütuna yazılacağını gösterir; "' + KULLANMA + '" o başlığın yazılmayacağı anlamına gelir. Ana tablonun sütunları kurum sayfalarının başlık satırından okunur.']);
    return { satirlar: satirlar, baslikSatirlari: [0, esBasligi] };
  }

  /* ---------------- Ana tablonun sütunları ---------------- */

  function sutunBul(ayar, ad) { return listedeBul(ayarlariHazirla(ayar).sutunlar, ad); }

  function sutunAdiDenetle(sutunlar, ad) {
    if (!sade(ad)) return 'Sütun adı boş olamaz.';
    if (ad.length > SUTUN_ADI_SINIRI) return 'Sütun adı en çok ' + SUTUN_ADI_SINIRI + ' karakter olabilir.';
    if (metaMi(ad)) return '"' + listedeBul(META_SUTUNLARI, ad) + '" sütunu zaten her zaman tablonun sonunda yer alır.';
    if (sade(ad) === sade(KULLANMA)) return 'Bu ad kullanılamaz.';
    const var_ = listedeBul(sutunlar, ad);
    if (var_) return '"' + var_ + '" adında bir sütun zaten var.';
    return '';
  }

  function satirlardaGez(durum, fn) {
    ((durum && durum.tablolar) || []).forEach(function (t) { t.satirlar.forEach(fn); });
  }

  function doluHucreSayisi(durum, ad) {
    let n = 0;
    satirlardaGez(durum, function (sat) { if (!bos(sat[ad])) n++; });
    return n;
  }

  function sutunEkle(ayar, ad) {
    const d = ayarDuz(ayar);
    ad = adTemizle(ad);
    const hata = sutunAdiDenetle(d.sutunlar, ad);
    if (hata) return { hata: hata };
    ad = sutunAdiBul(ad) || ad;
    d.sutunlar.push(ad);
    d.esler = d.esler.filter(function (e) { return sade(e.gelen) !== sade(ad); });
    return { ayar: ayarDuz(d), ad: ad };
  }

  /* Adı değiştirir; ana tablodaki bilgiler ve yüklü dosyaların eşleştirmeleri yeni ada taşınır */
  function sutunAdiDegistir(ayar, eski, yeni, durum, cozumler) {
    const d = ayarDuz(ayar);
    const mevcut = listedeBul(d.sutunlar, eski);
    if (!mevcut) return { hata: 'Sütun bulunamadı.' };
    if (SABIT_ADLI_SUTUNLAR.indexOf(mevcut) !== -1) return { hata: '"' + mevcut + '" sütununun adı değiştirilemez; araç bu sütunu adından tanır.' };
    yeni = adTemizle(yeni);
    if (yeni === mevcut) return { ayar: d, ad: mevcut };
    const hata = sutunAdiDenetle(d.sutunlar.filter(function (c) { return c !== mevcut; }), yeni);
    if (hata) return { hata: hata };
    yeni = sutunAdiBul(yeni) || yeni;
    d.sutunlar[d.sutunlar.indexOf(mevcut)] = yeni;
    d.esler = d.esler.filter(function (e) { return sade(e.gelen) !== sade(yeni) && sade(e.gelen) !== sade(mevcut); })
      .map(function (e) { return e.hedef === mevcut ? { gelen: e.gelen, hedef: yeni } : e; });
    /* Eski adla gelen başlıklar ve eski adın bilinen eş adları yeni sütuna gitsin */
    if (sade(mevcut) !== sade(yeni)) d.esler.push({ gelen: mevcut, hedef: yeni });
    satirlardaGez(durum, function (sat) {
      if (!Object.prototype.hasOwnProperty.call(sat, mevcut)) return;
      sat[yeni] = sat[mevcut];
      delete sat[mevcut];
    });
    if (durum && durum.ekSutunlar) durum.ekSutunlar = durum.ekSutunlar.map(function (c) { return c === mevcut ? yeni : c; });
    (cozumler || []).forEach(function (c) {
      c.sayfalar.forEach(function (s) { s.hedefler = s.hedefler.map(function (h) { return h === mevcut ? yeni : h; }); });
    });
    return { ayar: ayarDuz(d), ad: yeni };
  }

  /* Sütunu siler; ana tablodaki o sütunun bilgileri de silinir */
  function sutunSil(ayar, ad, durum) {
    const d = ayarDuz(ayar);
    const mevcut = listedeBul(d.sutunlar, ad);
    if (!mevcut) return { hata: 'Sütun bulunamadı.' };
    if (ANAHTAR_SUTUNLARI.indexOf(mevcut) !== -1) return { hata: 'İcra Dairesi ve Dosya No satırın anahtarıdır, silinemez.' };
    d.sutunlar = d.sutunlar.filter(function (c) { return c !== mevcut; });
    d.esler = d.esler.filter(function (e) { return e.hedef !== mevcut; });
    satirlardaGez(durum, function (sat) { delete sat[mevcut]; });
    if (durum && durum.ekSutunlar) durum.ekSutunlar = durum.ekSutunlar.filter(function (c) { return c !== mevcut; });
    return { ayar: ayarDuz(d), ad: mevcut };
  }

  function sutunTasi(ayar, ad, yon) {
    const d = ayarDuz(ayar);
    const i = d.sutunlar.indexOf(listedeBul(d.sutunlar, ad)), j = i + (yon < 0 ? -1 : 1);
    if (i === -1 || j < 0 || j >= d.sutunlar.length) return { ayar: d };
    const t = d.sutunlar[i]; d.sutunlar[i] = d.sutunlar[j]; d.sutunlar[j] = t;
    return { ayar: d };
  }

  /* Varsayılan sütunlar ve sıra; ana tabloda içi dolu olan ek sütunlar korunur */
  function sutunlariSifirla(ayar, durum) {
    const d = ayarDuz(ayar);
    const ek = d.sutunlar.filter(function (c) { return VARSAYILAN_SUTUNLAR.indexOf(c) === -1 && doluHucreSayisi(durum, c) > 0; });
    d.sutunlar = VARSAYILAN_SUTUNLAR.concat(ek);
    d.esler = d.esler.filter(function (e) { return !listedeBul(d.sutunlar, e.gelen) && (e.hedef === KULLANMA || d.sutunlar.indexOf(e.hedef) !== -1); });
    return { ayar: ayarDuz(d) };
  }

  /* ---------------- Hücre birleştirme ---------------- */

  /* Aynı borçlunun girdilerini teke indirir: tarihli olanlardan en yenisi, tarihsizlerde farklı değerlerin hepsi */
  function girdileriIndir(girdiler, tarihli) {
    const sira = [], harita = new Map();
    (girdiler || []).forEach(function (g) {
      const v = degerMetni(g.v);
      if (!v) return;
      const ad = adTemizle(g.ad), n = sade(ad);
      let t = g.t === undefined || g.t === null ? null : g.t;
      if (t === null && tarihli) t = enSonTarih(v);
      let e = harita.get(n);
      if (!e && n && sira.length <= 50) e = sira.find(function (x) { return x.ad && ayniAd(x.ad, ad); });
      if (!e) { e = { ad: n ? ad : '', l: [] }; sira.push(e); }
      harita.set(n, e);
      e.l.push({ v: v, t: t });
    });
    return sira.map(function (e) {
      const tarihliler = e.l.filter(function (x) { return x.t !== null; });
      if (tarihliler.length) {
        let en = tarihliler[0];
        tarihliler.forEach(function (x) { if (x.t > en.t) en = x; });
        return { ad: e.ad, v: en.v, t: en.t };
      }
      const farkli = [];
      e.l.forEach(function (x) { if (farkli.indexOf(x.v) === -1) farkli.push(x.v); });
      return { ad: e.ad, v: farkli.join(COKLU), t: null };
    });
  }

  /* Hücredeki "A: x; B: y" metnini borçlu borçlu ayırır. Ayrılamıyorsa tek parça
     döner; satırda tek borçlu varsa o parça o borçluya aittir. */
  function hucreyiAyir(metin, adlar) {
    if (bos(metin)) return [];
    const tek = [{ ad: adlar.length === 1 ? adlar[0] : '', v: metin }];
    const parcalar = [];
    for (const p of String(metin).split(AYRAC)) {
      const i = p.indexOf(': ');
      const ad = i > 0 ? adlar.find(function (a) { return ayniAd(a, p.slice(0, i)); }) : null;
      if (!ad) return tek;
      parcalar.push({ ad: ad, v: p.slice(i + 2) });
    }
    return parcalar;
  }

  /*
   * Bir hücreye yeni girdileri işler ve hücrenin yeni metnini döndürür.
   * mevcut: hücredeki metin; oncekiAdlar: satırın bu yüklemeden önceki borçluları;
   * tumAdlar: yüklemeden sonraki borçluları; girdiler: [{ ad, v, t }].
   * Borçlusu belli bilgi yalnız o borçlunun parçasını günceller; borçlusu belli
   * olmayan bilgi hücrenin tamamının yerine geçer. Tarihli bilgide eskisi yenisini ezmez.
   */
  function hucreBirlestir(mevcut, oncekiAdlar, tumAdlar, girdiler, tarihli) {
    const yeni = girdileriIndir(girdiler, tarihli);
    mevcut = mevcut || '';
    if (!yeni.length) return mevcut;
    yeni.forEach(function (e) { if (e.ad) e.ad = tumAdlar.find(function (a) { return ayniAd(a, e.ad); }) || e.ad; });
    const eskiler = hucreyiAyir(mevcut, oncekiAdlar);
    let parcalar;
    if (!eskiler.length) parcalar = yeni;
    else if (yeni.some(function (e) { return !e.ad; }) || eskiler.some(function (e) { return !e.ad; })) {
      let yeniT = null;
      yeni.forEach(function (e) { if (e.t !== null && (yeniT === null || e.t > yeniT)) yeniT = e.t; });
      if (tarihli || yeniT !== null) {
        const eskiT = enSonTarih(mevcut);
        if (eskiT !== null && (yeniT === null || yeniT < eskiT)) return mevcut;
      }
      parcalar = yeni;
    } else {
      parcalar = eskiler.map(function (e) { return { ad: e.ad, v: e.v }; });
      yeni.forEach(function (e) {
        const p = parcalar.find(function (x) { return ayniAd(x.ad, e.ad); });
        if (!p) { parcalar.push({ ad: e.ad, v: e.v }); return; }
        if (p.v === e.v) return;
        if (tarihli || e.t !== null) {
          const eskiT = enSonTarih(p.v);
          if (eskiT !== null && (e.t === null || e.t < eskiT)) return;
        }
        p.v = e.v;
      });
    }
    const adli = parcalar.filter(function (p) { return p.ad; }), adsiz = parcalar.filter(function (p) { return !p.ad; });
    if (!adli.length) return adsiz.map(function (p) { return p.v; }).join(COKLU);
    if (adli.length === 1 && !adsiz.length && tumAdlar.length <= 1) return adli[0].v;
    return adli.map(function (p) { return p.ad + ': ' + p.v; }).concat(adsiz.map(function (p) { return p.v; })).join(AYRAC);
  }

  /* Bir kaydı (bir icra dosyasının bilgilerini) ana tablodaki satıra yazar */
  function satiraYaz(sat, m, girdiler, degisiklikler) {
    [[S.DAIRE, m.daire], [S.DOSYA, m.dosyaNo], [S.FOY, m.foy], [S.ALACAKLI, m.alacakli]].forEach(function (p) {
      if (!bos(p[1]) && bos(sat[p[0]])) { sat[p[0]] = p[1]; degisiklikler.push({ sutun: p[0], eski: '', yeni: p[1] }); }
    });
    const oncekiAdlar = listeAyir(sat[S.BORCLU]);
    [[S.BORCLU, m.borclular, ayniAd], [S.TCKN, m.tcknler, ayniTc]].forEach(function (p) {
      if (!p[1] || !p[1].length) return;
      const eski = sat[p[0]] || '', liste = listeAyir(eski);
      let eklendi = false;
      p[1].forEach(function (v) { if (listeyeEkle(liste, v, p[2])) eklendi = true; });
      if (eklendi) { sat[p[0]] = liste.join(AYRAC); degisiklikler.push({ sutun: p[0], eski: eski, yeni: sat[p[0]] }); }
    });
    const tumAdlar = listeAyir(sat[S.BORCLU]);
    Object.keys(girdiler).forEach(function (c) {
      const eski = sat[c] || '';
      const yeni = hucreBirlestir(eski, oncekiAdlar, tumAdlar, girdiler[c], c === S.TEBLIGAT);
      if (yeni !== eski) { sat[c] = yeni; degisiklikler.push({ sutun: c, eski: eski, yeni: yeni }); }
    });
  }

  /* ---------------- Ana tablo durumu ---------------- */

  function yeniTablo(ad, kurumMu) { return { ad: ad, kurumMu: kurumMu, satirlar: [] }; }

  function tablolariTamamla(durum, A) {
    const eski = durum.tablolar || [];
    const bul = function (ad) { const n = sade(ad); return eski.find(function (t) { return sade(t.ad) === n; }); };
    const yeni = [];
    A.kurumlar.forEach(function (k) {
      const t = bul(k.ad) || yeniTablo(k.ad, true);
      t.ad = k.ad; t.kurumMu = true;
      yeni.push(t);
    });
    eski.forEach(function (t) {
      if (yeni.indexOf(t) === -1 && sade(t.ad) !== sade(DIGER)) { t.kurumMu = true; yeni.push(t); }
    });
    const d = bul(DIGER) || yeniTablo(DIGER, false);
    d.ad = DIGER; d.kurumMu = false;
    yeni.push(d);
    durum.tablolar = yeni;
  }

  function bosDurum(ayar) {
    const durum = { tablolar: [], notlar: [NOT_BASLIKLARI.slice()], gunluk: [GUNLUK_BASLIKLARI.slice()], rapor: null, ekSayfalar: [], ekSutunlar: [] };
    tablolariTamamla(durum, ayarlariHazirla(ayar));
    return durum;
  }

  function kopya(x) { return JSON.parse(JSON.stringify(x)); }

  function temizSatirlar(satirlar) {
    const out = (satirlar || []).map(function (r) { return (r || []).map(degerMetni); });
    while (out.length && !out[out.length - 1].some(Boolean)) out.pop();
    return out;
  }

  /* Aynı icra dairesi ve dosya numarasına sahip satırları tek satırda toplar */
  function satirlariBirlestir(l) {
    const m = { daire: '', dosyaNo: '', foy: '', alacakli: '', borclular: [], tcknler: [] };
    const girdiler = {};
    let son = l[0], sonT = null;
    l.forEach(function (sat) {
      if (!m.daire) m.daire = sat[S.DAIRE] || '';
      if (!m.dosyaNo) m.dosyaNo = sat[S.DOSYA] || '';
      if (!m.foy) m.foy = sat[S.FOY] || '';
      if (!m.alacakli) m.alacakli = sat[S.ALACAKLI] || '';
      const adlar = listeAyir(sat[S.BORCLU]);
      adlar.forEach(function (b) { listeyeEkle(m.borclular, b, ayniAd); });
      listeAyir(sat[S.TCKN]).forEach(function (t) { listeyeEkle(m.tcknler, t, ayniTc); });
      const ad = adlar.length === 1 ? adlar[0] : '';
      Object.keys(sat).forEach(function (c) {
        if (ROL[c] || META_SUTUNLARI.indexOf(c) !== -1 || bos(sat[c])) return;
        (girdiler[c] || (girdiler[c] = [])).push({ ad: ad, v: sat[c], t: null });
      });
      const d = tarihBul(sat[S.GUNCELLEME]);
      if (d && (sonT === null || d.getTime() > sonT)) { sonT = d.getTime(); son = sat; }
    });
    const out = {};
    satiraYaz(out, m, girdiler, []);
    META_SUTUNLARI.forEach(function (c) { if (!bos(son[c])) out[c] = son[c]; });
    return out;
  }

  function tabloyuTekille(t) {
    const gruplar = new Map(), sira = [];
    t.satirlar.forEach(function (sat) {
      const a = dosyaAnahtari(sat[S.DAIRE], sat[S.DOSYA]);
      const g = a ? gruplar.get(a) : null;
      if (g) { g.push(sat); return; }
      const l = [sat];
      if (a) gruplar.set(a, l);
      sira.push(l);
    });
    let azalan = 0;
    t.satirlar = sira.map(function (l) {
      if (l.length === 1) return l[0];
      azalan += l.length - 1;
      return satirlariBirlestir(l);
    });
    return azalan;
  }

  function tekillemeNotu(n) { return n + ' satır, aynı icra dairesi ve dosya numarasına sahip başka bir satırla tek satırda toplandı'; }

  /* Daha önce indirilen ana Excel'i okur. Sütunlar kurum sayfalarının başlık satırından alınır. */
  function anaExceliCoz(sayfalar, simdi) {
    const ayarSayfasi = sayfalar.find(function (s) { return sade(s.ad) === sade(SAYFA.AYARLAR); });
    const ayar = ayarSayfasi ? ayarlariOku(ayarSayfasi.satirlar) : null;
    const durum = { tablolar: [], notlar: null, gunluk: null, rapor: null, ekSayfalar: [], ekSutunlar: [] };
    const kurumTablolari = [], sutunlar = [];
    let birlesen = 0;
    sayfalar.forEach(function (s) {
      const n = sade(s.ad);
      if (n === sade(SAYFA.AYARLAR)) return;
      if (n === sade(SAYFA.NOTLAR)) { durum.notlar = temizSatirlar(s.satirlar); return; }
      if (n === sade(SAYFA.GUNLUK)) { durum.gunluk = temizSatirlar(s.satirlar); return; }
      if (n === sade(SAYFA.RAPOR)) { durum.rapor = temizSatirlar(s.satirlar); return; }
      const adlar = ((s.satirlar || [])[0] || []).map(function (b) {
        const m = adTemizle(degerMetni(b));
        return m ? (sutunAdiBul(m) || listedeBul(sutunlar, m) || m) : '';
      });
      if (adlar.indexOf(S.DOSYA) !== -1 && adlar.indexOf(S.DAIRE) !== -1) {
        const t = yeniTablo(sayfaAdiTemizle(s.ad) || DIGER, n !== sade(DIGER));
        adlar.forEach(function (a) {
          if (!a || metaMi(a)) return;
          if (sutunlar.indexOf(a) === -1) sutunlar.push(a);
          if (TABLO_SUTUNLARI.indexOf(a) === -1 && durum.ekSutunlar.indexOf(a) === -1) durum.ekSutunlar.push(a);
        });
        for (let i = 1; i < s.satirlar.length; i++) {
          const r = s.satirlar[i] || [];
          const o = {};
          let dolu = false;
          adlar.forEach(function (a, j) { if (!a) return; const v = degerMetni(r[j]); if (v) { o[a] = v; dolu = true; } });
          if (dolu) t.satirlar.push(o);
        }
        birlesen += tabloyuTekille(t);
        durum.tablolar.push(t);
        if (t.kurumMu) kurumTablolari.push(t.ad);
      } else {
        durum.ekSayfalar.push({ ad: s.ad, satirlar: temizSatirlar(s.satirlar) });
      }
    });
    if (!durum.notlar || !durum.notlar.length) durum.notlar = [NOT_BASLIKLARI.slice()];
    if (!durum.gunluk || !durum.gunluk.length) durum.gunluk = [GUNLUK_BASLIKLARI.slice()];
    if (birlesen) durum.gunluk.push([yerelZaman(simdi || new Date()), 'Ana Excel', '', 'Tek satırda toplama', '', '', '', '', '', '', tekillemeNotu(birlesen)]);
    tablolariTamamla(durum, ayarlariHazirla(ayaraKurumlariEkle(ayar || VARSAYILAN_AYARLAR, kurumTablolari)));
    return { durum: durum, ayar: ayar, kurumTablolari: kurumTablolari, sutunlar: sutunlar.length ? sutunlariHazirla(sutunlar) : [], birlesenSatir: birlesen };
  }

  /* ---------------- Gelen dosyayı tanıma ---------------- */

  function doluSay(r) { let n = 0; (r || []).forEach(function (v) { if (!bos(v)) n++; }); return n; }
  function satirBosMu(r) { return !r || !r.some(function (v) { return !bos(v); }); }

  /* Başlık satırı: en dolu satırın en az %60'ı kadar dolu ve hepsi metin olan ilk satır */
  function baslikSatiriBul(satirlar) {
    const sinir = Math.min(satirlar.length, 30);
    let enCok = 0;
    for (let i = 0; i < sinir; i++) enCok = Math.max(enCok, doluSay(satirlar[i]));
    if (!enCok) return -1;
    const esik = Math.max(2, Math.ceil(enCok * 0.6));
    for (let i = 0; i < sinir; i++) {
      const r = satirlar[i] || [];
      if (doluSay(r) >= esik && r.every(function (v) { return bos(v) || typeof v === 'string'; })) return i;
    }
    for (let i = 0; i < sinir; i++) if (!satirBosMu(satirlar[i])) return i;
    return -1;
  }

  function basliklariHazirla(r, genislik) {
    const sayac = {};
    const out = [];
    for (let j = 0; j < genislik; j++) {
      let ad = bos(r[j]) ? 'Sütun ' + sutunHarfi(j) : String(r[j]).replace(/\s+/g, ' ').trim();
      if (sayac[ad]) { sayac[ad]++; ad = ad + ' (' + sayac[ad] + ')'; } else sayac[ad] = 1;
      out.push(ad);
    }
    return out;
  }

  function ilkKolon(bn, adlar) {
    for (const a of adlar) { const j = bn.indexOf(sade(a)); if (j !== -1) return j; }
    return -1;
  }

  /* Başlığı bilinen bir kimlik sütunu (borçlu, daire, dosya no...) olan kolonlar */
  const TEMEL_HARITA = new Map();
  VARSAYILAN_SUTUNLAR.forEach(function (c) { TEMEL_HARITA.set(sade(c), c); });
  Object.keys(HAZIR_ESLER).forEach(function (h) { HAZIR_ESLER[h].forEach(function (a) { if (!TEMEL_HARITA.has(sade(a))) TEMEL_HARITA.set(sade(a), h); }); });
  function kimlikKolonlari(bn) {
    const k = new Set();
    bn.forEach(function (b, j) { const h = TEMEL_HARITA.get(b); if (h && ROL[h]) k.add(j); });
    return k;
  }

  /* Dosyadaki sütunlardan hesaplanan özet sütunu ekler */
  function turetilmisEkle(s, ad, oneri, aciklama, degerler, tarihler) {
    const j = s.kolonlar.length;
    s.kolonlar.push({ ad: ad, otomatikAd: false, turetilmis: true, tuketildi: false, oneri: oneri, aciklama: aciklama, ornek: '', dolu: false });
    s.satirlar.forEach(function (sat, i) {
      sat.d.push(degerler[i] || '');
      if (tarihler && tarihler[i] !== null && tarihler[i] !== undefined) { if (!sat.t) sat.t = {}; sat.t[j] = tarihler[i]; }
    });
  }

  function hataSayisi(v) { const m = String(v || '').match(/(\d+)\s*adet/i); return m ? +m[1] : 0; }

  /* Banka cevapları: Evrak Sayısı, Hata, Toplam Bakiye sütunlarından iki özet çıkarılır */
  function bankaCozucu(s, bn, veri) {
    s.tur = 'Banka cevapları';
    const jEvrak = bn.indexOf(sade('Evrak Sayısı')), jHata = bn.indexOf(sade('Hata')), jBakiye = bn.indexOf(sade('Toplam Bakiye'));
    [jEvrak, jHata, jBakiye].forEach(function (j) { if (j !== -1) s.kolonlar[j].tuketildi = true; });
    const haciz = [], para = [];
    veri.forEach(function (x) {
      const evrak = jEvrak !== -1 ? sayiOku(x.r[jEvrak]) : null;
      const hata = jHata !== -1 ? hataSayisi(x.r[jHata]) : 0;
      const bakiye = sayiOku(x.r[jBakiye]);
      haciz.push(evrak > 0 ? 'Var, ' + evrak + ' banka cevabı' + (hata ? ' (' + hata + ' evrak incelenemedi)' : '') : '');
      para.push(bakiye > 0 ? 'Evet, ' + sayiMetni(bakiye) + ' TL' : (evrak > 0 ? 'Hayır' : ''));
    });
    turetilmisEkle(s, 'Banka cevabı (özet)', S.BANKA_HACIZ, 'Evrak Sayısı sıfırdan büyükse "Var, N banka cevabı"; Hata sütunundaki incelenemeyen evrak sayısı parantez içinde eklenir', haciz);
    turetilmisEkle(s, 'Bankada para (özet)', S.BANKA_PARA, 'Toplam Bakiye varsa "Evet, tutar TL"; cevap var bakiye yoksa "Hayır"', para);
  }

  /* Tebligat raporu: açıklamada "[BORÇLU VE MÜFLİS AD SOYAD] ... Tebliğ Edildi" */
  const ROL_KELIMELERI = new Set(['BORCLU', 'VE', 'MUFLIS', 'MUSTEREK', 'MUTESELSIL', 'KEFIL', 'ASIL', 'MIRASCI', 'MIRASCISI', 'MIRASCILARI']);
  const BORCLU_ROLU = /BORCLU|KEFIL|MUFLIS|MIRASCI/;
  const DIGER_ROLLER = new Set(['ALACAKLI', 'VEKILI', 'VEKIL', 'AVUKAT', 'AV', 'UCUNCU', 'SAHIS', 'TANIK', 'BILIRKISI', 'KURUM', 'IHBAR']);
  const TEBLIG_SONUCU = /TESLIM|IADE|MAD |MADDE|YAPISTIR|BIZZAT|MUHTAR|TEBLIG EDIL|BILA/;

  function tarafCoz(aciklama) {
    const m = /\[([^\]]+)\]/.exec(aciklama || '');
    if (!m) return null;
    const kelimeler = m[1].trim().split(/\s+/);
    const rol = [];
    let i = 0;
    while (i < kelimeler.length - 1 && ROL_KELIMELERI.has(sade(kelimeler[i]))) { rol.push(kelimeler[i]); i++; }
    if (rol.length) return { ad: kelimeler.slice(i).join(' '), rol: rol.join(' '), borcluMu: BORCLU_ROLU.test(sade(rol.join(' '))) };
    const ilk = sade(kelimeler[0]);
    if (DIGER_ROLLER.has(ilk) || /^\d/.test(ilk)) return { ad: '', rol: kelimeler.slice(0, 2).join(' '), borcluMu: false };
    return { ad: kelimeler.join(' '), rol: '', borcluMu: true };
  }

  function tebligatMi(veri, jAc) {
    let n = 0, t = 0;
    for (let i = 0; i < veri.length && n < 200; i++) {
      const v = veri[i].r[jAc];
      if (bos(v)) continue;
      n++;
      if (sade(v).indexOf('TEBLIG') !== -1) t++;
    }
    return n > 0 && t / n >= 0.5;
  }

  function icerikKolonu(veri, genislik, haric, kosul) {
    let enIyi = -1, enIyiOran = 0;
    for (let j = 0; j < genislik; j++) {
      if (haric.has(j)) continue;
      let n = 0, t = 0;
      for (let i = 0; i < veri.length && n < 200; i++) { const v = veri[i].r[j]; if (bos(v)) continue; n++; if (kosul(v)) t++; }
      if (n && t / n >= 0.5 && t / n > enIyiOran) { enIyi = j; enIyiOran = t / n; }
    }
    return enIyi;
  }

  function tarihKolonuMu(veri, j) {
    let n = 0, t = 0;
    for (let i = 0; i < veri.length && n < 200; i++) { const v = veri[i].r[j]; if (bos(v)) continue; n++; if (tarihBul(v)) t++; }
    return n > 0 && t / n >= 0.8;
  }

  function tebligatCozucu(s, bn, veri) {
    s.tur = 'Tebligat raporu';
    const jAc = bn.indexOf(sade('Açıklama'));
    const haric = kimlikKolonlari(bn);
    haric.add(jAc);
    let jSonuc = ilkKolon(bn, ['Tebligat Sonucu', 'Tebliğ Sonucu', 'Tebligat Durumu', 'Tebliğ Şekli', 'Sonuç']);
    if (jSonuc === -1) jSonuc = icerikKolonu(veri, bn.length, haric, function (v) { return TEBLIG_SONUCU.test(sade(v)); });
    if (jSonuc !== -1) haric.add(jSonuc);
    const tarihKolonlari = [ilkKolon(bn, ['Tebliğ Tarihi', 'Tebligat Tarihi'])].filter(function (j) { return j !== -1; });
    if (!tarihKolonlari.length) {
      for (let j = 0; j < bn.length; j++) if (s.kolonlar[j].otomatikAd && !haric.has(j) && tarihKolonuMu(veri, j)) tarihKolonlari.push(j);
    }
    [jAc, jSonuc].concat(tarihKolonlari).forEach(function (j) { if (j !== -1) s.kolonlar[j].tuketildi = true; });
    const ozet = [], adlar = [], tarihler = [];
    veri.forEach(function (x, i) {
      const sat = s.satirlar[i];
      const ac = degerMetni(x.r[jAc]);
      ozet.push(''); adlar.push(''); tarihler.push(null);
      if (ac && sade(ac).indexOf('TEBLIG') === -1) { sat.atla = 'Tebligat kaydı değil'; return; }
      const taraf = tarafCoz(ac);
      if (taraf && !taraf.borcluMu) { sat.atla = 'Tebligat borçluya değil (' + taraf.rol + ')'; return; }
      const sa = sade(ac);
      const durum = /TEBLIG EDIL(ME|EME)DI$/.test(sa) ? 'Tebliğ edilmedi' : (/TEBLIG EDILDI$/.test(sa) ? 'Tebliğ edildi' : '');
      const sonucMetni = jSonuc !== -1 ? degerMetni(x.r[jSonuc]) : '';
      let tarih = null;
      tarihKolonlari.forEach(function (j) { const d = tarihBul(x.r[j]); if (d && (!tarih || d < tarih)) tarih = d; });
      const parcalar = [durum, sonucMetni, tarih ? tarihMetni(tarih) : ''].filter(Boolean);
      if (!parcalar.length) { sat.atla = 'Tebligat sonucu boş'; return; }
      ozet[i] = parcalar.join(' - ');
      adlar[i] = taraf ? taraf.ad : '';
      tarihler[i] = tarih ? tarih.getTime() : null;
    });
    const kaynaklar = ['Açıklamanın sonundaki "Tebliğ Edildi / Edilmedi" bilgisi'];
    if (jSonuc !== -1) kaynaklar.push('"' + s.kolonlar[jSonuc].ad + '" sütunundaki sonuç');
    if (tarihKolonlari.length) kaynaklar.push(tarihKolonlari.length > 1 ? 'tebliğ tarihi (tarih sütunlarından erken olanı)' : 'tebliğ tarihi');
    turetilmisEkle(s, 'Tebligat (özet)', S.TEBLIGAT, kaynaklar.join(', '), ozet, tarihler);
    if (adlar.some(Boolean)) turetilmisEkle(s, 'Borçlu (açıklamadan)', S.BORCLU, 'Açıklamada köşeli parantez içindeki taraf adı; borçlu rolünde olmayan taraflara çıkan tebligatlar atlanır', adlar);
  }

  /* Bir sayfayı okur: kolonlar (dosyadaki sütunlar ve hesaplanan özetler) ve satır değerleri.
     Hangi kolonun ana tabloda nereye yazılacağı sonradan hedefler[] ile belirlenir. */
  function sayfayiCozumle(dosyaAdi, sayfa) {
    const s = {
      dosya: dosyaAdi, sayfa: sayfa.ad, tur: 'Tanınmadı', okunanSatir: 0, bos: false,
      kolonlar: [], satirlar: [], hedefler: [], elle: [],
      secili: true, engel: '', uyari: '', neden: '',
      eslesmeler: [], kullanilmayan: [], kayitSayisi: 0, dosyaSayisi: 0
    };
    const satirlar = sayfa.satirlar || [];
    const bi = baslikSatiriBul(satirlar);
    if (bi < 0) { s.bos = true; s.secili = false; s.engel = s.neden = 'Sayfa boş.'; return s; }
    let genislik = 0;
    satirlar.forEach(function (r) { if (r && r.length > genislik) genislik = r.length; });
    const baslik = satirlar[bi] || [];
    const adlar = basliklariHazirla(baslik, genislik);
    const bn = adlar.map(sade);
    const veri = [];
    for (let i = bi + 1; i < satirlar.length; i++) if (!satirBosMu(satirlar[i])) veri.push({ no: i + 1, r: satirlar[i] });
    s.okunanSatir = veri.length;
    s.kolonlar = adlar.map(function (ad, j) { return { ad: ad, otomatikAd: bos(baslik[j]), turetilmis: false, tuketildi: false, oneri: '', aciklama: '', ornek: '', dolu: false }; });
    s.satirlar = veri.map(function (x) { return { no: x.no, d: adlar.map(function (_, j) { return degerMetni(x.r[j]); }), t: null, atla: '' }; });
    const j = function (ad) { return bn.indexOf(sade(ad)); };
    if (j('Toplam Bakiye') !== -1 && (j('Evrak Sayısı') !== -1 || j('Hata') !== -1)) bankaCozucu(s, bn, veri);
    else if (j('Açıklama') !== -1 && tebligatMi(veri, j('Açıklama'))) tebligatCozucu(s, bn, veri);
    else s.tur = 'Genel tablo';
    s.kolonlar.forEach(function (k, jj) {
      for (let i = 0; i < s.satirlar.length; i++) {
        const v = s.satirlar[i].d[jj];
        if (!v) continue;
        k.dolu = true;
        if (!k.ornek || !s.satirlar[i].atla) k.ornek = v.length > 60 ? v.slice(0, 57) + '...' : v;
        if (!s.satirlar[i].atla) break;
      }
    });
    return s;
  }

  /* ---------------- Sütun eşleştirme ---------------- */

  /* Hatırlanan eşleştirme yokken kolonun gideceği sütun */
  function dogalHedef(k, A) {
    if (k.turetilmis) return A.guncelAd(k.oneri);
    if (k.tuketildi || k.otomatikAd) return '';
    return A.hazir.get(sade(k.ad)) || '';
  }

  function onerilenHedef(k, A) {
    if (!k.otomatikAd) {
      const e = A.hatirlanan.get(sade(k.ad));
      if (e !== undefined) return e === KULLANMA || !A.sutunKumesi.has(e) ? '' : e;
    }
    return dogalHedef(k, A);
  }

  /* Elle seçilenler korunur, ötekiler öneriden gelir. Kimlik sütunları öneride tek kolona verilir. */
  function hedefleriKur(s, A) {
    const verilen = new Set();
    s.kolonlar.forEach(function (k, j) {
      if (!s.elle[j]) return;
      const h = s.hedefler[j] || '';
      if (h && !A.sutunKumesi.has(h)) { s.elle[j] = false; return; }
      s.hedefler[j] = h;
      if (ROL[h]) verilen.add(h);
    });
    s.kolonlar.forEach(function (k, j) {
      if (s.elle[j]) return;
      let h = onerilenHedef(k, A);
      if (ROL[h]) { if (verilen.has(h)) h = ''; else verilen.add(h); }
      s.hedefler[j] = h;
    });
  }

  /* Eşleştirmeye göre satırları kayda çevirir */
  function satirKayitlari(s) {
    const kj = { borclu: [], tckn: [], daire: [], dosyaNo: [], foy: [], alacakli: [] };
    const alanJ = [], alanIx = new Map();
    s.hedefler.forEach(function (h, j) {
      if (!h) return;
      if (ROL[h]) { kj[ROL[h]].push(j); return; }
      let l = alanIx.get(h);
      if (!l) { l = []; alanIx.set(h, l); alanJ.push([h, l]); }
      l.push(j);
    });
    const kayitlar = [], atlananlar = [];
    s.satirlar.forEach(function (x) {
      function ilk(js) { for (const j of js) if (x.d[j]) return x.d[j]; return ''; }
      const kimlik = { borclu: ilk(kj.borclu), tckn: ilk(kj.tckn), daire: ilk(kj.daire), dosyaNo: ilk(kj.dosyaNo), foy: ilk(kj.foy), alacakli: ilk(kj.alacakli) };
      if (x.atla) { atlananlar.push({ satir: x.no, kimlik: kimlik, neden: x.atla }); return; }
      if (!kimlik.dosyaNo && !kimlik.foy) { atlananlar.push({ satir: x.no, kimlik: kimlik, neden: 'Dosya No boş' }); return; }
      const alanlar = {}, tarihler = {};
      alanJ.forEach(function (p) {
        const h = p[0], js = p[1];
        if (js.length === 1) {
          const v = x.d[js[0]];
          if (!v) return;
          alanlar[h] = v;
          if (x.t && x.t[js[0]] !== undefined) tarihler[h] = x.t[js[0]];
          return;
        }
        /* Aynı sütuna birden çok kolon bağlıysa her değer kendi başlığıyla yazılır */
        const parcalar = [];
        let t = null;
        js.forEach(function (j) {
          const v = x.d[j];
          if (!v) return;
          parcalar.push(s.kolonlar[j].ad + ': ' + v);
          if (x.t && x.t[j] !== undefined && (t === null || x.t[j] > t)) t = x.t[j];
        });
        if (!parcalar.length) return;
        alanlar[h] = parcalar.join(' - ');
        if (t !== null) tarihler[h] = t;
      });
      kayitlar.push({ satir: x.no, kimlik: kimlik, alanlar: alanlar, tarihler: tarihler });
    });
    return { kayitlar: kayitlar, atlananlar: atlananlar };
  }

  function grupAnahtari(m) {
    const dk = dosyaAnahtari(m.daire, m.dosyaNo);
    if (dk) return 'K|' + dk;
    if (m.dosyaNo) return 'D|' + dosyaNorm(m.dosyaNo);
    return 'F|' + foyNorm(m.foy);
  }

  /* Aynı icra dairesi ve dosya numarasına sahip kayıtları tek kayıtta toplar */
  function grupla(kayitlar) {
    const harita = new Map(), liste = [];
    kayitlar.forEach(function (k) {
      const a = grupAnahtari(k.kimlik);
      let g = harita.get(a);
      if (!g) { g = []; harita.set(a, g); liste.push(g); }
      g.push(k);
    });
    return liste.map(function (g) {
      function ilk(alan) { for (const k of g) if (k.kimlik[alan]) return k.kimlik[alan]; return ''; }
      const m = { daire: ilk('daire'), dosyaNo: ilk('dosyaNo'), foy: ilk('foy'), alacakli: ilk('alacakli'), borclular: [], tcknler: [] };
      const girdiler = {};
      g.forEach(function (k) {
        listeyeEkle(m.borclular, k.kimlik.borclu, ayniAd);
        listeyeEkle(m.tcknler, k.kimlik.tckn, ayniTc);
        Object.keys(k.alanlar).forEach(function (c) {
          (girdiler[c] || (girdiler[c] = [])).push({ ad: k.kimlik.borclu, v: k.alanlar[c], t: k.tarihler[c] === undefined ? null : k.tarihler[c] });
        });
      });
      return { satirlar: g.map(function (k) { return k.satir; }), kimlik: m, girdiler: girdiler };
    });
  }

  /* Eşleştirme değişince sayfanın özetini yeniler: neler yazılacak, neler kullanılmıyor, yazılabilir mi */
  function sayfaGuncelle(s) {
    s.eslesmeler = []; s.kullanilmayan = [];
    if (s.bos) return s;
    let anahtarVar = false, yazilacakVar = false;
    s.kolonlar.forEach(function (k, j) {
      const h = s.hedefler[j];
      if (h) {
        if (h === S.DOSYA || h === S.FOY) anahtarVar = true;
        if (h !== S.DAIRE && h !== S.DOSYA && h !== S.FOY) yazilacakVar = true;
        s.eslesmeler.push({ gelen: k.ad, hedef: h, aciklama: k.aciklama || (h === S.ALACAKLI ? 'Kurum sayfası buna göre seçilir' : '') });
      } else if (k.dolu && !k.tuketildi) s.kullanilmayan.push(k.ad);
    });
    const onceki = s.engel;
    s.engel = ''; s.kayitSayisi = 0; s.dosyaSayisi = 0;
    if (!s.okunanSatir) s.engel = 'Sayfada başlık dışında satır yok.';
    else if (!anahtarVar) s.engel = 'Dosya No sütunu seçili değil. Aşağıdaki "Sütun eşleştirme" tablosundan hangi sütunun Dosya No (ya da Föy No) olduğunu seçin.';
    else if (!yazilacakVar) s.engel = 'Ana Excel\'e yazılacak sütun seçili değil. Aşağıdaki "Sütun eşleştirme" tablosundan en az bir sütun seçin.';
    else {
      const sk = satirKayitlari(s);
      const dosyalar = new Set();
      sk.kayitlar.forEach(function (k) { dosyalar.add(grupAnahtari(k.kimlik)); });
      s.kayitSayisi = sk.kayitlar.length; s.dosyaSayisi = dosyalar.size;
      if (!sk.kayitlar.length) s.engel = 'Tabloya yazılacak satır bulunamadı.';
    }
    if (s.engel) s.secili = false; else if (onceki) s.secili = true;
    s.neden = s.engel || s.uyari || '';
    return s;
  }

  /* Bir dosyanın tüm sayfalarını inceler. Tüm kayıtları aynı dosyadaki daha
     büyük bir sayfada da bulunan sayfa (ör. elle süzülmüş Sayfa1) varsayılan olarak seçilmez. */
  function dosyayiCozumle(dosyaAdi, sayfalar, ayar) {
    const A = ayarlariHazirla(ayar);
    const sonuclar = (sayfalar || []).map(function (sf) {
      const s = sayfayiCozumle(dosyaAdi, sf);
      hedefleriKur(s, A);
      return sayfaGuncelle(s);
    });
    function anahtar(k) {
      const m = k.kimlik;
      return daireNorm(m.daire) + '|' + dosyaNorm(m.dosyaNo) + '|' + (bos(m.dosyaNo) ? foyNorm(m.foy) : '') + '|' + sade(m.borclu);
    }
    const kumeler = sonuclar.map(function (s) { return new Set(s.secili ? satirKayitlari(s).kayitlar.map(anahtar) : []); });
    sonuclar.forEach(function (s, i) {
      if (!s.secili) return;
      for (let j = 0; j < sonuclar.length; j++) {
        if (j === i || !sonuclar[j].secili || sonuclar[j].kayitSayisi <= s.kayitSayisi) continue;
        let hepsi = true;
        kumeler[i].forEach(function (a) { if (!kumeler[j].has(a)) hepsi = false; });
        if (hepsi) {
          s.secili = false;
          s.uyari = s.neden = 'Bu sayfadaki tüm kayıtlar aynı dosyanın "' + sonuclar[j].sayfa + '" sayfasında da var; varsayılan olarak atlandı.';
          break;
        }
      }
    });
    return { dosya: dosyaAdi, sayfalar: sonuclar };
  }

  /* Ayarlar ya da sütun listesi değişince yüklü bir dosyanın eşleştirmelerini yeniler */
  function hedefleriYenile(cozum, ayar) {
    const A = ayarlariHazirla(ayar);
    cozum.sayfalar.forEach(function (s) { if (s.bos) return; hedefleriKur(s, A); sayfaGuncelle(s); });
    return cozum;
  }

  /* Seçimi hatırla: aynı başlık bir daha geldiğinde aynı sütun önerilsin */
  function esHatirla(d, k, hedef) {
    const A = ayarlariHazirla(d), n = sade(k.ad);
    d.esler = d.esler.filter(function (e) { return sade(e.gelen) !== n; });
    A.hatirlanan.delete(n);
    if (hedef !== dogalHedef(k, A)) d.esler.push({ gelen: k.ad, hedef: hedef || KULLANMA });
    return ayarDuz(d);
  }

  /*
   * Kullanıcı bir kolonun ana tabloda hangi sütuna yazılacağını seçti ('' = kullanma).
   * Seçim hatırlanır; yüklü öteki sayfalarda aynı adlı ve elle seçilmemiş kolonlar da buna uyar.
   * Döner: { ayar, yayilan (değişen öteki sayfa sayısı) }
   */
  function hedefSec(cozumler, s, j, hedef, ayar) {
    let d = ayarDuz(ayar);
    const k = s.kolonlar[j];
    hedef = hedef ? (listedeBul(d.sutunlar, hedef) || '') : '';
    const otekiler = [];
    (cozumler || []).forEach(function (c) { c.sayfalar.forEach(function (x) { if (x !== s && !x.bos) otekiler.push([x, x.hedefler.slice()]); }); });
    s.hedefler[j] = hedef;
    s.elle[j] = true;
    if (!k.otomatikAd) d = esHatirla(d, k, hedef);
    const A = ayarlariHazirla(d);
    hedefleriKur(s, A);
    sayfaGuncelle(s);
    let yayilan = 0;
    otekiler.forEach(function (p) {
      hedefleriKur(p[0], A);
      sayfaGuncelle(p[0]);
      if (p[0].hedefler.some(function (h, i) { return h !== p[1][i]; })) yayilan++;
    });
    return { ayar: d, yayilan: yayilan };
  }

  /* ---------------- Birleştirme ---------------- */

  function haritayaEkle(harita, anahtar, yer) {
    if (!anahtar) return;
    let l = harita.get(anahtar);
    if (!l) { l = []; harita.set(anahtar, l); }
    if (l.indexOf(yer) === -1) l.push(yer);
  }

  function indekseEkle(ix, yer) {
    const s = yer.sat;
    haritayaEkle(ix.dosya, dosyaAnahtari(s[S.DAIRE], s[S.DOSYA]), yer);
    haritayaEkle(ix.foy, bos(s[S.FOY]) ? '' : foyNorm(s[S.FOY]), yer);
    haritayaEkle(ix.dosyaNo, bos(s[S.DOSYA]) ? '' : dosyaNorm(s[S.DOSYA]), yer);
  }

  function indeksKur(durum) {
    const ix = { dosya: new Map(), foy: new Map(), dosyaNo: new Map(), yerler: new Map() };
    durum.tablolar.forEach(function (t) {
      t.satirlar.forEach(function (sat) { const yer = { t: t, sat: sat }; ix.yerler.set(sat, yer); indekseEkle(ix, yer); });
    });
    return ix;
  }

  function tabloBul(durum, ad) {
    const n = sade(ad);
    let t = durum.tablolar.find(function (x) { return sade(x.ad) === n; });
    if (!t) {
      t = yeniTablo(sayfaAdiTemizle(ad) || DIGER, n !== sade(DIGER));
      durum.tablolar.splice(Math.max(0, durum.tablolar.length - 1), 0, t);
    }
    return t;
  }

  function tasi(durum, yer, kurumAdi) {
    const hedef = tabloBul(durum, kurumAdi);
    if (hedef === yer.t) return false;
    const i = yer.t.satirlar.indexOf(yer.sat);
    if (i !== -1) yer.t.satirlar.splice(i, 1);
    hedef.satirlar.push(yer.sat);
    yer.t = hedef;
    return true;
  }

  const ARAC_YOK = /(KAYIT|ARAC|ARACI|TESCILLI ARAC) (BULUNAMADI|BULUNMAMAKTADIR|YOKTUR|YOK)|BULUNMAMAKTADIR|BULUNAMAMISTIR|^YOK$|^HAYIR$|SONUC BULUNAMADI|MALVARLIGI YOK/;

  /* Araç sorgusunda araç çıkmadıysa Araç Haczi "Malvarlığı yok" olur (iki sütun da tablodaysa, hücrede tek bilgi varsa) */
  function aracKurali(sat, degisiklikler, A) {
    if (!A.sutunKumesi.has(S.ARAC_SORGU) || !A.sutunKumesi.has(S.ARAC_HACIZ)) return;
    const s = sat[S.ARAC_SORGU];
    if (bos(s) || !bos(sat[S.ARAC_HACIZ]) || String(s).indexOf(AYRAC) !== -1) return;
    if (ARAC_YOK.test(sade(s))) {
      sat[S.ARAC_HACIZ] = 'Malvarlığı yok';
      degisiklikler.push({ sutun: S.ARAC_HACIZ, eski: '', yeni: 'Malvarlığı yok' });
    }
  }

  /* Kaydın ana tablodaki satırı: icra dairesi + dosya no; yoksa Föy No; dairesi yoksa dosya no tekse o */
  function yerBul(ix, m) {
    const dk = dosyaAnahtari(m.daire, m.dosyaNo);
    let adaylar = dk ? (ix.dosya.get(dk) || []) : [];
    if (!adaylar.length && !bos(m.foy)) {
      adaylar = (ix.foy.get(foyNorm(m.foy)) || []).filter(function (y) {
        const yk = dosyaAnahtari(y.sat[S.DAIRE], y.sat[S.DOSYA]);
        return !dk || !yk || yk === dk;
      });
    }
    if (!adaylar.length && !dk && !bos(m.dosyaNo)) {
      const l = ix.dosyaNo.get(dosyaNorm(m.dosyaNo)) || [];
      const farkli = new Set(l.map(function (y) { return dosyaAnahtari(y.sat[S.DAIRE], y.sat[S.DOSYA]) || '?'; }));
      if (farkli.size > 1) return { hata: 'İcra dairesi yok; bu dosya no birden çok dairede var' };
      adaylar = l;
    }
    return { yer: adaylar.find(function (y) { return y.t.kurumMu; }) || adaylar[0] || null };
  }

  function kayitIsle(durum, ix, k, A, bugun, kaynakDosya) {
    const m = k.kimlik;
    const bulunan = yerBul(ix, m);
    if (bulunan.hata) return { islem: 'Atlandı', neden: bulunan.hata };
    const kurumAdi = kurumBul(m.alacakli, A.kurumlar);
    const taninmayan = !bos(m.alacakli) && !kurumAdi ? m.alacakli : '';
    let yer = bulunan.yer, islem = 'Güncellendi', tasinan = 0;
    if (!yer) {
      const t = tabloBul(durum, kurumAdi || DIGER);
      const sat = {};
      t.satirlar.push(sat);
      yer = { t: t, sat: sat };
      ix.yerler.set(sat, yer);
      islem = 'Yeni satır';
    }
    if (kurumAdi && !yer.t.kurumMu && tasi(durum, yer, kurumAdi)) tasinan++;
    const degisiklikler = [];
    satiraYaz(yer.sat, m, k.girdiler, degisiklikler);
    aracKurali(yer.sat, degisiklikler, A);
    if (degisiklikler.length) { yer.sat[S.GUNCELLEME] = bugun; yer.sat[S.KAYNAK] = kaynakDosya; }
    indekseEkle(ix, yer);
    return {
      islem: islem, tablo: yer.t.ad, satir: yer.sat, degisiklikler: degisiklikler, tasinan: tasinan, taninmayan: taninmayan,
      not: tasinan ? 'Diğer sayfasından ' + yer.t.ad + ' sayfasına taşındı' : ''
    };
  }

  function digeriYenidenDagit(durum, ix, A) {
    const tasinanlar = [];
    durum.tablolar.filter(function (t) { return !t.kurumMu; }).forEach(function (diger) {
      diger.satirlar.slice().forEach(function (sat) {
        const kurum = kurumBul(sat[S.ALACAKLI], A.kurumlar);
        if (!kurum) return;
        const yer = ix.yerler.get(sat);
        if (yer && tasi(durum, yer, kurum)) tasinanlar.push({ tablo: kurum, satir: sat });
      });
    });
    return tasinanlar;
  }

  /* Raporda ayrı sütunu olan kimlik bilgileri ilk kez yazılırken "Yazılan Bilgiler"de yinelenmez */
  const RAPORDA_AYRI_SUTUN = [S.BORCLU, S.DAIRE, S.DOSYA];
  function raporaGirer(d) { return !(RAPORDA_AYRI_SUTUN.indexOf(d.sutun) !== -1 && !d.eski); }
  function degisiklikMetni(liste) {
    return liste.filter(raporaGirer).map(function (d) { return d.sutun + ': ' + (d.eski ? d.eski + ' → ' : '') + d.yeni; }).join(' | ');
  }
  function satirMetni(nolar) {
    return nolar.length <= 8 ? nolar.join(', ') : nolar.slice(0, 8).join(', ') + ' ... (toplam ' + nolar.length + ' satır)';
  }

  function gunlukNotu(oz) {
    const p = [];
    Object.keys(oz.tablolar).forEach(function (t) { const x = oz.tablolar[t]; if (x.yeni + x.guncellenen) p.push(t + ': ' + (x.yeni + x.guncellenen) + ' satır'); });
    if (oz.birlesen) p.push(tekillemeNotu(oz.birlesen));
    const tan = Object.keys(oz.taninmayanAlacaklilar);
    if (tan.length) p.push('Tanınmayan alacaklı: ' + tan.slice(0, 3).join(', ') + (tan.length > 3 ? ' ve ' + (tan.length - 3) + ' ad daha' : ''));
    if (oz.tasinan) p.push(oz.tasinan + ' satır Diğer sayfasından taşındı');
    return p.join('; ');
  }

  function birlestir(temelDurum, dosyaCozumleri, ayar, simdi) {
    const A = ayarlariHazirla(ayar);
    const durum = kopya(temelDurum);
    tablolariTamamla(durum, A);
    simdi = simdi || new Date();
    const bugun = yerelTarih(simdi), zaman = yerelZaman(simdi);
    let anaBirlesen = 0;
    durum.tablolar.forEach(function (t) { anaBirlesen += tabloyuTekille(t); });
    if (anaBirlesen) durum.gunluk.push([zaman, 'Ana Excel', '', 'Tek satırda toplama', '', '', '', '', '', '', tekillemeNotu(anaBirlesen)]);
    const ix = indeksKur(durum);
    const rapor = [], ozetler = [];
    (dosyaCozumleri || []).forEach(function (dc) {
      dc.sayfalar.forEach(function (s) {
        if (!s.secili) return;
        const oz = {
          dosya: s.dosya, sayfa: s.sayfa, tur: s.tur, okunan: s.okunanSatir, dosyaSayisi: 0, birlesen: 0,
          yeni: 0, guncellenen: 0, degismeyen: 0, atlanan: 0, digere: 0, tasinan: 0,
          tablolar: {}, sutunlar: {}, atlamaNedenleri: {}, taninmayanAlacaklilar: {},
          eslesmeler: s.eslesmeler, kullanilmayan: s.kullanilmayan
        };
        function atlamaYaz(satirlar, kimlik, borclu, neden) {
          oz.atlanan += satirlar.length;
          oz.atlamaNedenleri[neden] = (oz.atlamaNedenleri[neden] || 0) + satirlar.length;
          rapor.push([s.dosya, s.sayfa, satirMetni(satirlar), 'Atlandı', '', kimlik.daire || '', kimlik.dosyaNo || '', borclu || '', '', neden]);
        }
        const sk = satirKayitlari(s);
        sk.atlananlar.forEach(function (a) { atlamaYaz([a.satir], a.kimlik, a.kimlik.borclu, a.neden); });
        grupla(sk.kayitlar).forEach(function (k) {
          const r = kayitIsle(durum, ix, k, A, bugun, s.dosya);
          if (r.islem === 'Atlandı') { atlamaYaz(k.satirlar, k.kimlik, k.kimlik.borclular.join(AYRAC), r.neden); return; }
          oz.dosyaSayisi++;
          oz.birlesen += k.satirlar.length - 1;
          const t = oz.tablolar[r.tablo] || (oz.tablolar[r.tablo] = { yeni: 0, guncellenen: 0, degismeyen: 0 });
          let islem;
          if (r.islem === 'Yeni satır') { oz.yeni++; t.yeni++; islem = 'Yeni satır'; }
          else if (r.degisiklikler.length) { oz.guncellenen++; t.guncellenen++; islem = 'Güncellendi'; }
          else { oz.degismeyen++; t.degismeyen++; islem = r.tasinan ? 'Taşındı' : ''; }
          if (r.tablo === DIGER) {
            oz.digere++;
            if (r.taninmayan) oz.taninmayanAlacaklilar[r.taninmayan] = (oz.taninmayanAlacaklilar[r.taninmayan] || 0) + 1;
          }
          oz.tasinan += r.tasinan;
          r.degisiklikler.forEach(function (d) {
            if (!raporaGirer(d) || (r.islem === 'Yeni satır' && KIMLIK_SUTUNLARI.indexOf(d.sutun) !== -1)) return;
            oz.sutunlar[d.sutun] = (oz.sutunlar[d.sutun] || 0) + 1;
          });
          if (islem) {
            const not = [
              r.not,
              k.satirlar.length > 1 ? k.satirlar.length + ' satır tek satırda toplandı' : '',
              r.tablo === DIGER ? (r.taninmayan ? 'Alacaklı tanınmadı: ' + r.taninmayan : 'Kurumu bulunamadı') : ''
            ].filter(Boolean).join('; ');
            rapor.push([s.dosya, s.sayfa, satirMetni(k.satirlar), islem, r.tablo, r.satir[S.DAIRE] || '', r.satir[S.DOSYA] || '', r.satir[S.BORCLU] || '', degisiklikMetni(r.degisiklikler), not]);
          }
        });
        ozetler.push(oz);
        durum.gunluk.push([zaman, s.dosya, s.sayfa, s.tur, String(s.okunanSatir), String(oz.yeni), String(oz.guncellenen), String(oz.degismeyen), String(oz.atlanan), String(oz.digere), gunlukNotu(oz)]);
      });
    });
    const ayarTasima = digeriYenidenDagit(durum, ix, A);
    ayarTasima.forEach(function (y) {
      rapor.push(['Ayarlar', '', '', 'Taşındı', y.tablo, y.satir[S.DAIRE] || '', y.satir[S.DOSYA] || '', y.satir[S.BORCLU] || '', '', 'Alacaklı adı artık bu kuruma uyuyor; Diğer sayfasından taşındı']);
    });
    if (ayarTasima.length) durum.gunluk.push([zaman, 'Ayarlar', '', 'Taşıma', '', '', '', '', '', '', ayarTasima.length + ' satır Diğer sayfasından kurum sayfasına taşındı']);
    if (ozetler.length || ayarTasima.length) durum.rapor = [RAPOR_BASLIKLARI.slice()].concat(rapor);
    return { durum: durum, ozetler: ozetler, rapor: rapor, ayarTasima: ayarTasima.length, anaBirlesen: anaBirlesen };
  }

  /* ---------------- Çıktı ---------------- */

  function sutunListesi(durum, A) {
    const l = A.sutunlar.slice();
    (durum.ekSutunlar || []).forEach(function (c) { if (c && !listedeBul(l, c) && !metaMi(c)) l.push(c); });
    return l.concat(META_SUTUNLARI);
  }

  function ciktiSayfalari(durum, ayar, ekNotlar) {
    const A = ayarlariHazirla(ayar);
    const d = kopya(durum);
    tablolariTamamla(d, A);
    const sutunlar = sutunListesi(d, A);
    const genislikler = sutunlar.map(function (c) { return GENISLIK[c] || 20; });
    const sayfalar = [];
    d.tablolar.forEach(function (t) {
      sayfalar.push({
        ad: t.ad,
        satirlar: [sutunlar].concat(t.satirlar.map(function (o) { return sutunlar.map(function (c) { return o[c] || ''; }); })),
        baslikSatirlari: [0], genislikler: genislikler, dondur: true, filtre: true
      });
    });
    const notlar = (d.notlar && d.notlar.length ? d.notlar : [NOT_BASLIKLARI.slice()]).concat(ekNotlar || []);
    sayfalar.push({ ad: SAYFA.NOTLAR, satirlar: notlar, baslikSatirlari: [0], genislikler: [12, 22, 28, 70, 18], dondur: true, filtre: true });
    sayfalar.push({ ad: SAYFA.GUNLUK, satirlar: d.gunluk, baslikSatirlari: [0], genislikler: [17, 34, 26, 18, 12, 11, 12, 12, 10, 14, 70], dondur: true, filtre: true });
    if (d.rapor && d.rapor.length) {
      sayfalar.push({ ad: SAYFA.RAPOR, satirlar: d.rapor, baslikSatirlari: [0], genislikler: [32, 26, 14, 12, 20, 26, 13, 32, 80, 44], dondur: true, filtre: true });
    }
    const ay = ayarSatirlari(ayar);
    sayfalar.push({ ad: SAYFA.AYARLAR, satirlar: ay.satirlar, baslikSatirlari: ay.baslikSatirlari, genislikler: [34, 90] });
    d.ekSayfalar.forEach(function (s) { sayfalar.push({ ad: s.ad, satirlar: s.satirlar }); });
    return sayfalar;
  }

  kok.Birlestirme = {
    TABLO_SUTUNLARI: TABLO_SUTUNLARI, VARSAYILAN_SUTUNLAR: VARSAYILAN_SUTUNLAR, META_SUTUNLARI: META_SUTUNLARI,
    ANAHTAR_SUTUNLARI: ANAHTAR_SUTUNLARI, SABIT_ADLI_SUTUNLAR: SABIT_ADLI_SUTUNLAR, KULLANMA: KULLANMA,
    SUTUN: S, DIGER: DIGER, SAYFA: SAYFA, VARSAYILAN_AYARLAR: VARSAYILAN_AYARLAR, NOT_BASLIKLARI: NOT_BASLIKLARI,
    ayarlariHazirla: ayarlariHazirla, ayarDuz: ayarDuz, ayaraKurumlariEkle: ayaraKurumlariEkle,
    sutunBul: sutunBul, sutunEkle: sutunEkle, sutunAdiDegistir: sutunAdiDegistir, sutunSil: sutunSil,
    sutunTasi: sutunTasi, sutunlariSifirla: sutunlariSifirla, doluHucreSayisi: doluHucreSayisi,
    bosDurum: bosDurum, anaExceliCoz: anaExceliCoz, dosyayiCozumle: dosyayiCozumle,
    hedefSec: hedefSec, hedefleriYenile: hedefleriYenile,
    birlestir: birlestir, ciktiSayfalari: ciktiSayfalari,
    yardimci: {
      sade: sade, daireNorm: daireNorm, dosyaNorm: dosyaNorm, tarihBul: tarihBul, kurumBul: kurumBul,
      tarafCoz: tarafCoz, ayniAd: ayniAd, hucreBirlestir: hucreBirlestir, baslikSatiriBul: baslikSatiriBul,
      degerMetni: degerMetni, sayiOku: sayiOku, yerelTarih: yerelTarih
    }
  };
})(typeof window !== 'undefined' ? window : this);
