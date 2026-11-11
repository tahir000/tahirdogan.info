/*
 * Excel Birleştirme: birleştirme mantığı
 *
 * Gelen Excel sayfalarını tanır (banka cevapları, tebligat raporu, genel tablo),
 * her satırı ana tablodaki kurum sayfasına, doğru borçlunun satırına yazar ve
 * neyin nereye yazıldığını raporlar. Tarayıcıda çalışır, veri dışarı gitmez.
 *
 * Ana tablo: her kurum (müvekkil) bir sayfa; her satır bir dosyadaki bir borçlu.
 * Satır kimliği: İcra Dairesi + Dosya No + Borçlu (varsa TCKN / VKN).
 */
(function (kok) {
  'use strict';

  const TABLO_SUTUNLARI = [
    'Borçlu Adı', 'Borçlu TCKN / VKN', 'İcra Dairesi', 'Dosya No',
    'Tebligat Bilgisi', 'Kesinleşme Bilgisi',
    'Araç Sorgusu', 'Araç Haczi', 'Tapu Sorgusu', 'Tapu Haczi',
    'Alacaklı Olduğu Dosya Sorgusu', 'Alacaklı Olduğu Dosya Haczi',
    'Maaş Sorgusu', 'Maaş Haczi', 'Banka Sorgusu', 'Banka Haczi',
    'Bankada Para Var mı?', 'Bankadan Para İstendi mi?',
    'Firma Sorgusu', 'Firma Haczi',
    'Föy No', 'Alacaklı', 'Son Güncelleme', 'Kaynak'
  ];
  const S = {
    BORCLU: 'Borçlu Adı', TCKN: 'Borçlu TCKN / VKN', DAIRE: 'İcra Dairesi', DOSYA: 'Dosya No',
    TEBLIGAT: 'Tebligat Bilgisi', ARAC_SORGU: 'Araç Sorgusu', ARAC_HACIZ: 'Araç Haczi',
    BANKA_HACIZ: 'Banka Haczi', BANKA_PARA: 'Bankada Para Var mı?',
    FOY: 'Föy No', ALACAKLI: 'Alacaklı', GUNCELLEME: 'Son Güncelleme', KAYNAK: 'Kaynak'
  };
  const KIMLIK_SUTUNLARI = [S.BORCLU, S.TCKN, S.DAIRE, S.DOSYA, S.FOY, S.ALACAKLI];
  const KIMLIK_ALANI = { borclu: S.BORCLU, tckn: S.TCKN, daire: S.DAIRE, dosya: S.DOSYA, foy: S.FOY, alacakli: S.ALACAKLI };
  const META_SUTUNLARI = [S.GUNCELLEME, S.KAYNAK];
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
       girilir; tarayıcıda ve indirilen ana Excel'in Ayarlar sayfasında saklanır. */
    kurumlar: [],
    esler: []
  };

  /* Gelen Excel'lerde aynı bilginin bilinen farklı başlıkları */
  const HAZIR_ESLER = {
    'Borçlu Adı': ['Borçlu', 'Borçlu Adı Soyadı', 'Borçlu Ad Soyad', 'Borçlu Unvanı', 'Borçlu Adı Unvanı', 'Karşı Yan', 'Karşı Taraf', 'Ad Soyad', 'Adı Soyadı', 'Adı Soyadı Unvanı'],
    'Borçlu TCKN / VKN': ['TCKN', 'VKN', 'TCKN VKN', 'TC VKN', 'TC Kimlik No', 'TC Kimlik Numarası', 'Kimlik No', 'Vergi No', 'Vergi Kimlik No', 'Borçlu TCKN', 'Borçlu VKN'],
    'İcra Dairesi': ['Birim', 'Birim Adı', 'Daire', 'İcra Müdürlüğü'],
    'Dosya No': ['Esas No', 'Dosya Numarası', 'İcra Dosya No', 'Takip Dosya No', 'Dosya Esas No'],
    'Tebligat Bilgisi': ['Tebligat', 'Tebligat Durumu', 'Tebliğ Durumu', 'Tebligat Sonucu', 'Tebliğ Sonucu', 'Son Tebligat'],
    'Kesinleşme Bilgisi': ['Kesinleşme', 'Kesinleşme Durumu', 'Kesinleşti mi'],
    'Araç Sorgusu': ['Araç Sorgu', 'Araç Sorgu Sonucu', 'Araç', 'EGM Sorgusu'],
    'Araç Haczi': ['Araç Haciz', 'Araç Haciz Durumu'],
    'Tapu Sorgusu': ['Tapu Sorgu', 'Tapu Sorgu Sonucu', 'Tapu', 'TAKBİS Sorgusu'],
    'Tapu Haczi': ['Tapu Haciz'],
    'Alacaklı Olduğu Dosya Sorgusu': ['Alacaklı Olduğu Dosya', 'Alacaklı Olduğu Dosyalar', 'Alacaklı Dosya Sorgusu'],
    'Alacaklı Olduğu Dosya Haczi': ['Alacaklı Dosya Haczi', 'Alacaklı Olduğu Dosya Haciz'],
    'Maaş Sorgusu': ['Maaş Sorgu', 'SGK Sorgusu', 'SGK', 'Maaş'],
    'Maaş Haczi': ['Maaş Haciz', 'SGK Haczi'],
    'Banka Sorgusu': ['Banka Sorgu'],
    'Banka Haczi': ['Banka Haciz'],
    'Bankada Para Var mı?': ['Bankada Para', 'Banka Bakiyesi'],
    'Bankadan Para İstendi mi?': ['Bankadan Para İstendi', 'Para İstendi mi', 'Para Talebi', 'Bankadan Para Talebi'],
    'Firma Sorgusu': ['Firma Sorgu', 'Ticaret Sicil Sorgusu'],
    'Firma Haczi': ['Firma Haciz'],
    'Föy No': ['Föy', 'Föy Numarası', 'Büro No'],
    'Alacaklı': ['Alacaklı Adı', 'Alacaklı Unvanı', 'Müvekkil']
  };

  /* ---------------- Metin ve değer yardımcıları ---------------- */

  const KATLA = { 'Ç': 'C', 'Ğ': 'G', 'İ': 'I', 'Ö': 'O', 'Ş': 'S', 'Ü': 'U', 'Â': 'A', 'Î': 'I', 'Û': 'U' };

  function bos(v) { return v === null || v === undefined || (typeof v === 'string' && v.trim() === ''); }

  /* Karşılaştırma için: büyük harf, Türkçe harfler sadeleşir, noktalama boşluk olur */
  function sade(v) {
    if (bos(v)) return '';
    return String(v).toLocaleUpperCase('tr-TR')
      .replace(/[ÇĞİÖŞÜÂÎÛ]/g, function (c) { return KATLA[c]; })
      .replace(/[^A-Z0-9]+/g, ' ').trim();
  }

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

  function sonTarihBul(v) {
    if (v instanceof Date) return v;
    const re = /(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/g;
    let m, son = null;
    while ((m = re.exec(String(v || ''))) !== null) son = m[0];
    return son ? tarihBul(son) : null;
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

  const SIRKET_KELIMELERI = new Set(['LTD', 'LIMITED', 'STI', 'SIRKETI', 'SIRKET', 'AS', 'A', 'S', 'ANONIM', 'TIC', 'TICARET', 'SAN', 'SANAYI', 'VE', 'VEYA']);
  function adParcalari(ad) {
    return sade(ad).split(' ').filter(function (w) { return w.length > 1 && !SIRKET_KELIMELERI.has(w); });
  }
  /* Aynı kişi ya da şirket mi: kısaltmalara (İNŞ., TİC., LTD. ŞTİ.) dayanıklı */
  function benzerAd(a, b) {
    if (bos(a) || bos(b)) return true;
    if (sade(a) === sade(b)) return true;
    const x = adParcalari(a), y = adParcalari(b);
    if (!x.length || !y.length) return false;
    const kucuk = x.length <= y.length ? x : y, buyuk = kucuk === x ? y : x;
    let ortak = 0;
    kucuk.forEach(function (w) {
      if (buyuk.some(function (z) { return z.indexOf(w) === 0 || w.indexOf(z) === 0; })) ortak++;
    });
    return ortak / kucuk.length >= 0.8;
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

  function sutunAdiBul(ad) {
    const n = sade(ad);
    for (const c of TABLO_SUTUNLARI) if (sade(c) === n) return c;
    return null;
  }

  /* ---------------- Ayarlar ---------------- */

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
    const esHaritasi = new Map();
    TABLO_SUTUNLARI.forEach(function (c) { if (META_SUTUNLARI.indexOf(c) === -1) esHaritasi.set(sade(c), c); });
    Object.keys(HAZIR_ESLER).forEach(function (h) { HAZIR_ESLER[h].forEach(function (a) { esHaritasi.set(sade(a), h); }); });
    const esler = [], ekSutunlar = [];
    (ayar.esler || []).forEach(function (e) {
      if (!e || bos(e.gelen) || bos(e.hedef)) return;
      const hedef = sutunAdiBul(e.hedef) || String(e.hedef).replace(/\s+/g, ' ').trim();
      if (META_SUTUNLARI.indexOf(hedef) !== -1) return;
      esHaritasi.set(sade(e.gelen), hedef);
      esler.push({ gelen: String(e.gelen).replace(/\s+/g, ' ').trim(), hedef: hedef });
      if (TABLO_SUTUNLARI.indexOf(hedef) === -1 && ekSutunlar.indexOf(hedef) === -1) ekSutunlar.push(hedef);
    });
    return { kurumlar: kurumlar, esHaritasi: esHaritasi, esler: esler, ekSutunlar: ekSutunlar };
  }

  function ayarDuz(ayar) {
    const A = ayarlariHazirla(ayar);
    return {
      kurumlar: A.kurumlar.map(function (k) { return { ad: k.ad, kelimeler: k.kelimeler.slice() }; }),
      esler: A.esler.map(function (e) { return { gelen: e.gelen, hedef: e.hedef }; })
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
    satirlar.push(['Açıklama', 'Bu sayfa Excel Birleştirme sayfasının ayarlarıdır. Kurum eklemek için ilk listeye satır ekleyin; "Alacaklı adında geçenler" virgülle ayrılır. Gelen Excel\'de tanınmayan bir sütunu tablodaki bir sütuna bağlamak için ikinci listeye satır ekleyin.']);
    return { satirlar: satirlar, baslikSatirlari: [0, esBasligi] };
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

  /* Daha önce indirilen ana Excel'i okur */
  function anaExceliCoz(sayfalar) {
    const ayarSayfasi = sayfalar.find(function (s) { return sade(s.ad) === sade(SAYFA.AYARLAR); });
    const ayar = ayarSayfasi ? ayarlariOku(ayarSayfasi.satirlar) : null;
    const durum = { tablolar: [], notlar: null, gunluk: null, rapor: null, ekSayfalar: [], ekSutunlar: [] };
    const kurumTablolari = [];
    sayfalar.forEach(function (s) {
      const n = sade(s.ad);
      if (n === sade(SAYFA.AYARLAR)) return;
      if (n === sade(SAYFA.NOTLAR)) { durum.notlar = temizSatirlar(s.satirlar); return; }
      if (n === sade(SAYFA.GUNLUK)) { durum.gunluk = temizSatirlar(s.satirlar); return; }
      if (n === sade(SAYFA.RAPOR)) { durum.rapor = temizSatirlar(s.satirlar); return; }
      const adlar = ((s.satirlar || [])[0] || []).map(function (b) { const m = degerMetni(b); return m ? (sutunAdiBul(m) || m) : ''; });
      if (adlar.indexOf(S.DOSYA) !== -1 && adlar.indexOf(S.BORCLU) !== -1) {
        const t = yeniTablo(sayfaAdiTemizle(s.ad) || DIGER, n !== sade(DIGER));
        adlar.forEach(function (a) {
          if (a && TABLO_SUTUNLARI.indexOf(a) === -1 && durum.ekSutunlar.indexOf(a) === -1) durum.ekSutunlar.push(a);
        });
        for (let i = 1; i < s.satirlar.length; i++) {
          const r = s.satirlar[i] || [];
          const o = {};
          let dolu = false;
          adlar.forEach(function (a, j) { if (!a) return; const v = degerMetni(r[j]); if (v) { o[a] = v; dolu = true; } });
          if (dolu) t.satirlar.push(o);
        }
        durum.tablolar.push(t);
        if (t.kurumMu) kurumTablolari.push(t.ad);
      } else {
        durum.ekSayfalar.push({ ad: s.ad, satirlar: temizSatirlar(s.satirlar) });
      }
    });
    if (!durum.notlar || !durum.notlar.length) durum.notlar = [NOT_BASLIKLARI.slice()];
    if (!durum.gunluk || !durum.gunluk.length) durum.gunluk = [GUNLUK_BASLIKLARI.slice()];
    tablolariTamamla(durum, ayarlariHazirla(ayaraKurumlariEkle(ayar || VARSAYILAN_AYARLAR, kurumTablolari)));
    return { durum: durum, ayar: ayar, kurumTablolari: kurumTablolari };
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

  function kimlikKolonlari(bn, A) {
    const ix = { borclu: -1, tckn: -1, daire: -1, dosya: -1, foy: -1, alacakli: -1 };
    const hangisi = {};
    Object.keys(KIMLIK_ALANI).forEach(function (k) { hangisi[KIMLIK_ALANI[k]] = k; });
    bn.forEach(function (b, j) {
      const h = A.esHaritasi.get(b);
      const k = h && hangisi[h];
      if (k && ix[k] === -1) ix[k] = j;
    });
    return ix;
  }

  function kimlikAl(r, ix) {
    function al(j) { return j >= 0 ? degerMetni(r[j]) : ''; }
    return { borclu: al(ix.borclu), tckn: al(ix.tckn), daire: al(ix.daire), dosyaNo: al(ix.dosya), foy: al(ix.foy), alacakli: al(ix.alacakli) };
  }

  function kimlikEslesmeleri(sonuc, B, ix, haric) {
    const kullanilan = new Set();
    Object.keys(KIMLIK_ALANI).forEach(function (k) {
      if (ix[k] === -1 || (haric && haric[k])) return;
      sonuc.eslesmeler.push({ gelen: B[ix[k]], hedef: KIMLIK_ALANI[k], aciklama: k === 'alacakli' ? 'Kurum sayfası buna göre seçilir' : '' });
      kullanilan.add(ix[k]);
    });
    return kullanilan;
  }

  function kullanilmayanlariYaz(sonuc, B, veri, kullanilan) {
    B.forEach(function (b, j) {
      if (kullanilan.has(j)) return;
      if (veri.some(function (x) { return !bos(x.r[j]); })) sonuc.kullanilmayan.push(b);
    });
  }

  function kayitEkle(sonuc, no, kimlik, alanlar, tarihler) {
    sonuc.kayitlar.push({ kaynak: { dosya: sonuc.dosya, sayfa: sonuc.sayfa, satir: no }, kimlik: kimlik, alanlar: alanlar, tarihler: tarihler || {} });
  }

  function atla(sonuc, no, kimlik, neden) {
    sonuc.atlananlar.push({ satir: no, daire: kimlik.daire, dosyaNo: kimlik.dosyaNo, borclu: kimlik.borclu, neden: neden });
  }

  function hataSayisi(v) { const m = String(v || '').match(/(\d+)\s*adet/i); return m ? +m[1] : 0; }

  /* Banka cevapları: Evrak Sayısı, Hata, Toplam Bakiye */
  function bankaCozucu(sonuc, B, bn, veri, ix) {
    sonuc.tur = 'Banka cevapları';
    const jEvrak = bn.indexOf(sade('Evrak Sayısı')), jHata = bn.indexOf(sade('Hata')), jBakiye = bn.indexOf(sade('Toplam Bakiye'));
    const kullanilan = kimlikEslesmeleri(sonuc, B, ix);
    if (jEvrak !== -1) { sonuc.eslesmeler.push({ gelen: B[jEvrak], hedef: S.BANKA_HACIZ, aciklama: 'Cevap sayısı sıfırdan büyükse "Var, N banka cevabı"' }); kullanilan.add(jEvrak); }
    if (jHata !== -1) { sonuc.eslesmeler.push({ gelen: B[jHata], hedef: S.BANKA_HACIZ, aciklama: 'İncelenemeyen evrak sayısı parantez içinde eklenir' }); kullanilan.add(jHata); }
    sonuc.eslesmeler.push({ gelen: B[jBakiye], hedef: S.BANKA_PARA, aciklama: 'Bakiye varsa "Evet, tutar TL"; cevap var bakiye yoksa "Hayır"' });
    kullanilan.add(jBakiye);
    kullanilmayanlariYaz(sonuc, B, veri, kullanilan);
    if (ix.dosya === -1 && ix.foy === -1) { sonuc.secili = false; sonuc.neden = 'Dosya No ya da Föy No sütunu bulunamadı.'; return; }
    veri.forEach(function (x) {
      const k = kimlikAl(x.r, ix);
      if (bos(k.dosyaNo) && bos(k.foy)) { atla(sonuc, x.no, k, 'Dosya No boş'); return; }
      const evrak = jEvrak !== -1 ? sayiOku(x.r[jEvrak]) : null;
      const hata = jHata !== -1 ? hataSayisi(x.r[jHata]) : 0;
      const bakiye = sayiOku(x.r[jBakiye]);
      const alanlar = {};
      if (evrak > 0) alanlar[S.BANKA_HACIZ] = 'Var, ' + evrak + ' banka cevabı' + (hata ? ' (' + hata + ' evrak incelenemedi)' : '');
      if (bakiye > 0) alanlar[S.BANKA_PARA] = 'Evet, ' + sayiMetni(bakiye) + ' TL';
      else if (evrak > 0) alanlar[S.BANKA_PARA] = 'Hayır';
      kayitEkle(sonuc, x.no, k, alanlar);
    });
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

  function tebligatCozucu(sonuc, B, bn, veri, ix) {
    sonuc.tur = 'Tebligat raporu';
    const jAc = bn.indexOf(sade('Açıklama'));
    const addanBorclu = ix.borclu === -1;
    const kullanilan = kimlikEslesmeleri(sonuc, B, ix);
    kullanilan.add(jAc);
    const haric = new Set(kullanilan);
    let jSonuc = ilkKolon(bn, ['Tebligat Sonucu', 'Tebliğ Sonucu', 'Tebligat Durumu', 'Tebliğ Şekli', 'Sonuç']);
    if (jSonuc === -1) jSonuc = icerikKolonu(veri, B.length, haric, function (v) { return TEBLIG_SONUCU.test(sade(v)); });
    if (jSonuc !== -1) { haric.add(jSonuc); kullanilan.add(jSonuc); }
    let tarihKolonlari = [ilkKolon(bn, ['Tebliğ Tarihi', 'Tebligat Tarihi'])].filter(function (j) { return j !== -1; });
    if (!tarihKolonlari.length) {
      for (let j = 0; j < B.length; j++) if (/^Sütun /.test(B[j]) && !haric.has(j) && tarihKolonuMu(veri, j)) tarihKolonlari.push(j);
    }
    tarihKolonlari.forEach(function (j) { kullanilan.add(j); });
    if (addanBorclu) sonuc.eslesmeler.push({ gelen: B[jAc], hedef: S.BORCLU, aciklama: 'Köşeli parantezdeki taraf adı; borçlu rolünde olmayan taraflar atlanır' });
    sonuc.eslesmeler.push({ gelen: B[jAc], hedef: S.TEBLIGAT, aciklama: 'Sondaki "Tebliğ Edildi / Edilmedi" bilgisi' });
    if (jSonuc !== -1) sonuc.eslesmeler.push({ gelen: B[jSonuc], hedef: S.TEBLIGAT, aciklama: 'Kime ve nasıl tebliğ edildiği' });
    tarihKolonlari.forEach(function (j) {
      sonuc.eslesmeler.push({ gelen: B[j], hedef: S.TEBLIGAT, aciklama: tarihKolonlari.length > 1 ? 'Tarih: bu sütunlardan erken olanı tebliğ tarihi sayılır' : 'Tebliğ tarihi' });
    });
    kullanilmayanlariYaz(sonuc, B, veri, kullanilan);
    if (ix.dosya === -1 && ix.foy === -1) { sonuc.secili = false; sonuc.neden = 'Dosya No sütunu bulunamadı.'; return; }
    veri.forEach(function (x) {
      const k = kimlikAl(x.r, ix);
      const ac = degerMetni(x.r[jAc]);
      if (ac && sade(ac).indexOf('TEBLIG') === -1) { atla(sonuc, x.no, k, 'Tebligat kaydı değil'); return; }
      if (addanBorclu) {
        const taraf = tarafCoz(ac);
        if (taraf && !taraf.borcluMu) { atla(sonuc, x.no, k, 'Tebligat borçluya değil (' + taraf.rol + ')'); return; }
        if (taraf) k.borclu = taraf.ad;
      }
      if (bos(k.dosyaNo) && bos(k.foy)) { atla(sonuc, x.no, k, 'Dosya No boş'); return; }
      const sa = sade(ac);
      const durum = /TEBLIG EDIL(ME|EME)DI$/.test(sa) ? 'Tebliğ edilmedi' : (/TEBLIG EDILDI$/.test(sa) ? 'Tebliğ edildi' : '');
      const sonucMetni = jSonuc !== -1 ? degerMetni(x.r[jSonuc]) : '';
      let tarih = null;
      tarihKolonlari.forEach(function (j) { const d = tarihBul(x.r[j]); if (d && (!tarih || d < tarih)) tarih = d; });
      const parcalar = [durum, sonucMetni, tarih ? tarihMetni(tarih) : ''].filter(Boolean);
      if (!parcalar.length) { atla(sonuc, x.no, k, 'Tebligat sonucu boş'); return; }
      const alanlar = {}, tarihler = {};
      alanlar[S.TEBLIGAT] = parcalar.join(' - ');
      tarihler[S.TEBLIGAT] = tarih ? tarih.getTime() : null;
      kayitEkle(sonuc, x.no, k, alanlar, tarihler);
    });
  }

  /* Genel tablo: başlıklar tablo sütunlarıyla ya da eş adlarıyla eşleşir */
  function genelCozucu(sonuc, B, bn, veri, ix, A) {
    sonuc.tur = 'Genel tablo';
    const kullanilan = kimlikEslesmeleri(sonuc, B, ix);
    const alanKolonlari = new Map();
    bn.forEach(function (b, j) {
      if (kullanilan.has(j)) return;
      const h = A.esHaritasi.get(b);
      if (!h || KIMLIK_SUTUNLARI.indexOf(h) !== -1) return;
      if (!alanKolonlari.has(h)) alanKolonlari.set(h, []);
      alanKolonlari.get(h).push(j);
      kullanilan.add(j);
      sonuc.eslesmeler.push({ gelen: B[j], hedef: h, aciklama: '' });
    });
    kullanilmayanlariYaz(sonuc, B, veri, kullanilan);
    if (ix.dosya === -1 && ix.foy === -1) {
      sonuc.secili = false;
      sonuc.neden = 'Dosya No ya da Föy No sütunu bulunamadı. Başlığı farklıysa Ayarlar > Sütun eşleştirme bölümünden bağlayabilirsiniz.';
      return;
    }
    if (!alanKolonlari.size && ix.borclu === -1 && ix.tckn === -1 && ix.alacakli === -1) {
      sonuc.secili = false;
      sonuc.neden = 'Tablodaki sütunlardan hiçbiriyle eşleşen bilgi yok.';
      return;
    }
    veri.forEach(function (x) {
      const k = kimlikAl(x.r, ix);
      if (bos(k.dosyaNo) && bos(k.foy)) { atla(sonuc, x.no, k, 'Dosya No boş'); return; }
      const alanlar = {};
      alanKolonlari.forEach(function (js, h) {
        const v = js.map(function (j) { return degerMetni(x.r[j]); }).filter(Boolean).join(' - ');
        if (v) alanlar[h] = v;
      });
      kayitEkle(sonuc, x.no, k, alanlar);
    });
  }

  function sayfayiCozumle(dosyaAdi, sayfa, A) {
    const sonuc = { dosya: dosyaAdi, sayfa: sayfa.ad, tur: 'Tanınmadı', okunanSatir: 0, eslesmeler: [], kullanilmayan: [], kayitlar: [], atlananlar: [], secili: true, neden: '' };
    const satirlar = sayfa.satirlar || [];
    const bi = baslikSatiriBul(satirlar);
    if (bi < 0) { sonuc.secili = false; sonuc.neden = 'Sayfa boş.'; return sonuc; }
    let genislik = 0;
    satirlar.forEach(function (r) { if (r && r.length > genislik) genislik = r.length; });
    const B = basliklariHazirla(satirlar[bi] || [], genislik);
    const bn = B.map(sade);
    const veri = [];
    for (let i = bi + 1; i < satirlar.length; i++) if (!satirBosMu(satirlar[i])) veri.push({ no: i + 1, r: satirlar[i] });
    sonuc.okunanSatir = veri.length;
    const ix = kimlikKolonlari(bn, A);
    const j = function (ad) { return bn.indexOf(sade(ad)); };
    if (j('Toplam Bakiye') !== -1 && (j('Evrak Sayısı') !== -1 || j('Hata') !== -1)) bankaCozucu(sonuc, B, bn, veri, ix);
    else if (j('Açıklama') !== -1 && tebligatMi(veri, j('Açıklama'))) tebligatCozucu(sonuc, B, bn, veri, ix);
    else genelCozucu(sonuc, B, bn, veri, ix, A);
    if (!sonuc.kayitlar.length && sonuc.secili) { sonuc.secili = false; sonuc.neden = sonuc.neden || 'Tabloya yazılacak satır bulunamadı.'; }
    return sonuc;
  }

  /* Bir dosyanın tüm sayfalarını inceler. Tüm kayıtları aynı dosyadaki daha
     büyük bir sayfada da bulunan sayfa (ör. elle süzülmüş Sayfa1) varsayılan olarak seçilmez. */
  function dosyayiCozumle(dosyaAdi, sayfalar, ayar) {
    const A = ayarlariHazirla(ayar);
    const sonuclar = (sayfalar || []).map(function (s) { return sayfayiCozumle(dosyaAdi, s, A); });
    function anahtar(k) {
      const m = k.kimlik;
      return daireNorm(m.daire) + '|' + dosyaNorm(m.dosyaNo) + '|' + (bos(m.dosyaNo) ? foyNorm(m.foy) : '') + '|' + sade(m.borclu);
    }
    const kumeler = sonuclar.map(function (s) { return new Set(s.kayitlar.map(anahtar)); });
    sonuclar.forEach(function (s, i) {
      if (!s.secili) return;
      for (let j = 0; j < sonuclar.length; j++) {
        if (j === i || !sonuclar[j].secili || sonuclar[j].kayitlar.length <= s.kayitlar.length) continue;
        let hepsi = true;
        kumeler[i].forEach(function (a) { if (!kumeler[j].has(a)) hepsi = false; });
        if (hepsi) {
          s.secili = false;
          s.neden = 'Bu sayfadaki tüm kayıtlar aynı dosyanın "' + sonuclar[j].sayfa + '" sayfasında da var; varsayılan olarak atlandı.';
          break;
        }
      }
    });
    return { dosya: dosyaAdi, sayfalar: sonuclar };
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

  /* Araç sorgusunda araç çıkmadıysa Araç Haczi "Malvarlığı yok" olur */
  function aracKurali(sat, degisiklikler) {
    const s = sat[S.ARAC_SORGU];
    if (bos(s) || !bos(sat[S.ARAC_HACIZ])) return;
    if (ARAC_YOK.test(sade(s))) {
      sat[S.ARAC_HACIZ] = 'Malvarlığı yok';
      degisiklikler.push({ sutun: S.ARAC_HACIZ, eski: '', yeni: 'Malvarlığı yok' });
    }
  }

  function yerBul(ix, m) {
    const dk = dosyaAnahtari(m.daire, m.dosyaNo);
    let adaylar = dk ? (ix.dosya.get(dk) || []) : [];
    if (!adaylar.length && !bos(m.foy)) adaylar = ix.foy.get(foyNorm(m.foy)) || [];
    if (!adaylar.length && !dk && !bos(m.dosyaNo)) {
      const l = ix.dosyaNo.get(dosyaNorm(m.dosyaNo)) || [];
      const farkli = new Set(l.map(function (y) { return dosyaAnahtari(y.sat[S.DAIRE], y.sat[S.DOSYA]) || '?'; }));
      if (farkli.size > 1) return { hata: 'İcra dairesi yok; bu dosya no birden çok dairede var' };
      adaylar = l;
    }
    if (!adaylar.length) return { yer: null, adaylar: adaylar, dk: dk };
    const tc = sade(m.tckn), ad = sade(m.borclu);
    let yer = null;
    if (tc) yer = adaylar.find(function (y) { return sade(y.sat[S.TCKN]) === tc; }) || null;
    if (!yer && ad) yer = adaylar.find(function (y) { return sade(y.sat[S.BORCLU]) === ad; }) || null;
    if (!yer && !ad && !tc) {
      if (adaylar.length === 1) yer = adaylar[0];
      else return { hata: 'Dosyada birden çok borçlu var, satırda borçlu adı yok' };
    }
    if (!yer && ad) {
      const benzerler = adaylar.filter(function (y) {
        const ytc = sade(y.sat[S.TCKN]);
        if (tc && ytc && tc !== ytc) return false;
        return benzerAd(m.borclu, y.sat[S.BORCLU]);
      });
      if (benzerler.length === 1) yer = benzerler[0];
    }
    return { yer: yer, adaylar: adaylar, dk: dk || dosyaAnahtari(adaylar[0].sat[S.DAIRE], adaylar[0].sat[S.DOSYA]) };
  }

  function kayitIsle(durum, ix, k, A, bugun) {
    const m = k.kimlik;
    const bulunan = yerBul(ix, m);
    if (bulunan.hata) return { islem: 'Atlandı', neden: bulunan.hata };
    const kurumAdi = kurumBul(m.alacakli, A.kurumlar);
    const taninmayan = !bos(m.alacakli) && !kurumAdi ? m.alacakli : '';
    let yer = bulunan.yer, islem = 'Güncellendi', tasinan = 0;
    if (!yer) {
      let hedef = kurumAdi;
      if (!hedef) { const ky = bulunan.adaylar.find(function (y) { return y.t.kurumMu; }); if (ky) hedef = ky.t.ad; }
      const t = tabloBul(durum, hedef || DIGER);
      const sat = {};
      t.satirlar.push(sat);
      yer = { t: t, sat: sat };
      ix.yerler.set(sat, yer);
      islem = 'Yeni satır';
    }
    if (kurumAdi) {
      const ayniDosya = (bulunan.dk && ix.dosya.get(bulunan.dk)) || [];
      [yer].concat(ayniDosya).forEach(function (y) { if (!y.t.kurumMu && tasi(durum, y, kurumAdi)) tasinan++; });
    }
    const sat = yer.sat;
    const degisiklikler = [];
    const kimlikDegeri = {};
    kimlikDegeri[S.BORCLU] = m.borclu; kimlikDegeri[S.TCKN] = m.tckn; kimlikDegeri[S.DAIRE] = m.daire;
    kimlikDegeri[S.DOSYA] = m.dosyaNo; kimlikDegeri[S.FOY] = m.foy; kimlikDegeri[S.ALACAKLI] = m.alacakli;
    KIMLIK_SUTUNLARI.forEach(function (c) {
      const v = kimlikDegeri[c];
      if (!bos(v) && bos(sat[c])) { sat[c] = v; degisiklikler.push({ sutun: c, eski: '', yeni: v }); }
    });
    Object.keys(k.alanlar).forEach(function (c) {
      const v = k.alanlar[c];
      if (bos(v)) return;
      const eski = sat[c] || '';
      if (eski === v) return;
      if (c === S.TEBLIGAT && eski) {
        const yeniTarih = k.tarihler && k.tarihler[c] ? new Date(k.tarihler[c]) : sonTarihBul(v);
        const eskiTarih = sonTarihBul(eski);
        if (eskiTarih && (!yeniTarih || yeniTarih < eskiTarih)) return;
      }
      sat[c] = v;
      degisiklikler.push({ sutun: c, eski: eski, yeni: v });
    });
    aracKurali(sat, degisiklikler);
    if (degisiklikler.length) { sat[S.GUNCELLEME] = bugun; sat[S.KAYNAK] = k.kaynak.dosya; }
    indekseEkle(ix, yer);
    return {
      islem: islem, tablo: yer.t.ad, satir: sat, degisiklikler: degisiklikler, tasinan: tasinan, taninmayan: taninmayan,
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

  const RAPORDA_GOSTERILMEYEN = [S.BORCLU, S.DAIRE, S.DOSYA];
  function degisiklikMetni(liste) {
    return liste.filter(function (d) { return RAPORDA_GOSTERILMEYEN.indexOf(d.sutun) === -1; })
      .map(function (d) { return d.sutun + ': ' + (d.eski ? d.eski + ' → ' : '') + d.yeni; }).join(' | ');
  }

  function gunlukNotu(oz) {
    const p = [];
    Object.keys(oz.tablolar).forEach(function (t) { const x = oz.tablolar[t]; if (x.yeni + x.guncellenen) p.push(t + ': ' + (x.yeni + x.guncellenen) + ' satır'); });
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
    const ix = indeksKur(durum);
    const rapor = [], ozetler = [];
    (dosyaCozumleri || []).forEach(function (dc) {
      dc.sayfalar.forEach(function (s) {
        if (!s.secili) return;
        const oz = {
          dosya: s.dosya, sayfa: s.sayfa, tur: s.tur, okunan: s.okunanSatir,
          yeni: 0, guncellenen: 0, degismeyen: 0, atlanan: 0, digere: 0, tasinan: 0,
          tablolar: {}, sutunlar: {}, atlamaNedenleri: {}, taninmayanAlacaklilar: {},
          eslesmeler: s.eslesmeler, kullanilmayan: s.kullanilmayan
        };
        function atlamaYaz(satir, kimlik, neden) {
          oz.atlanan++;
          oz.atlamaNedenleri[neden] = (oz.atlamaNedenleri[neden] || 0) + 1;
          rapor.push([s.dosya, s.sayfa, String(satir), 'Atlandı', '', kimlik.daire || '', kimlik.dosyaNo || '', kimlik.borclu || '', '', neden]);
        }
        s.atlananlar.forEach(function (a) { atlamaYaz(a.satir, a, a.neden); });
        s.kayitlar.forEach(function (k) {
          const r = kayitIsle(durum, ix, k, A, bugun);
          if (r.islem === 'Atlandı') { atlamaYaz(k.kaynak.satir, k.kimlik, r.neden); return; }
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
            if (RAPORDA_GOSTERILMEYEN.indexOf(d.sutun) !== -1 || (r.islem === 'Yeni satır' && KIMLIK_SUTUNLARI.indexOf(d.sutun) !== -1)) return;
            oz.sutunlar[d.sutun] = (oz.sutunlar[d.sutun] || 0) + 1;
          });
          if (islem) {
            const not = [r.not, r.tablo === DIGER ? (r.taninmayan ? 'Alacaklı tanınmadı: ' + r.taninmayan : 'Kurumu bulunamadı') : ''].filter(Boolean).join('; ');
            rapor.push([s.dosya, s.sayfa, String(k.kaynak.satir), islem, r.tablo, r.satir[S.DAIRE] || '', r.satir[S.DOSYA] || '', r.satir[S.BORCLU] || '', degisiklikMetni(r.degisiklikler), not]);
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
    return { durum: durum, ozetler: ozetler, rapor: rapor, ayarTasima: ayarTasima.length };
  }

  /* ---------------- Çıktı ---------------- */

  function sutunListesi(durum, A) {
    const l = TABLO_SUTUNLARI.slice();
    A.ekSutunlar.concat(durum.ekSutunlar || []).forEach(function (c) { if (c && l.indexOf(c) === -1) l.push(c); });
    return l;
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
      sayfalar.push({ ad: SAYFA.RAPOR, satirlar: d.rapor, baslikSatirlari: [0], genislikler: [32, 26, 10, 12, 20, 26, 13, 32, 80, 44], dondur: true, filtre: true });
    }
    const ay = ayarSatirlari(ayar);
    sayfalar.push({ ad: SAYFA.AYARLAR, satirlar: ay.satirlar, baslikSatirlari: ay.baslikSatirlari, genislikler: [34, 90] });
    d.ekSayfalar.forEach(function (s) { sayfalar.push({ ad: s.ad, satirlar: s.satirlar }); });
    return sayfalar;
  }

  kok.Birlestirme = {
    TABLO_SUTUNLARI: TABLO_SUTUNLARI, META_SUTUNLARI: META_SUTUNLARI, DIGER: DIGER, SAYFA: SAYFA,
    VARSAYILAN_AYARLAR: VARSAYILAN_AYARLAR, NOT_BASLIKLARI: NOT_BASLIKLARI,
    ayarlariHazirla: ayarlariHazirla, ayarDuz: ayarDuz, ayaraKurumlariEkle: ayaraKurumlariEkle,
    bosDurum: bosDurum, anaExceliCoz: anaExceliCoz, dosyayiCozumle: dosyayiCozumle,
    birlestir: birlestir, ciktiSayfalari: ciktiSayfalari,
    yardimci: {
      sade: sade, daireNorm: daireNorm, dosyaNorm: dosyaNorm, tarihBul: tarihBul, kurumBul: kurumBul,
      tarafCoz: tarafCoz, benzerAd: benzerAd, baslikSatiriBul: baslikSatiriBul, degerMetni: degerMetni,
      sayiOku: sayiOku, yerelTarih: yerelTarih
    }
  };
})(typeof window !== 'undefined' ? window : this);
