/*
 * MERSİS Şirket Sorgulama: ortak işlemler
 *
 * Excel satırlarından sorumlu kişiye göre sorgu listesi kurar, MERSİS Takip
 * yer iminden gelen sonuçları çözer ve Excel'e yazılacak SONUÇ metnini üretir.
 * Sayfaya (DOM'a) dokunmaz; testlerde doğrudan çağrılır.
 */
(function (kok) {
  'use strict';

  const SURUM = 1;
  const LISTE_TURU = 'mersis-liste';
  const SONUC_TURU = 'mersis-sonuc';

  /* ---------------- Metin yardımcıları ---------------- */

  function metin(x) { return x == null ? '' : String(x); }
  function bosluk(x) { return metin(x).replace(/\s+/g, ' ').trim(); }
  function buyuk(x) { return metin(x).toLocaleUpperCase('tr-TR'); }

  /* Türkçe harfleri sadeleştirir, harf ve rakam dışını boşluğa çevirir: başlık ve ünvan karşılaştırması için */
  function sade(x) {
    return buyuk(x)
      .replace(/İ/g, 'I').replace(/Ş/g, 'S').replace(/Ğ/g, 'G').replace(/Ü/g, 'U')
      .replace(/Ö/g, 'O').replace(/Ç/g, 'C').replace(/Â/g, 'A').replace(/Î/g, 'I').replace(/Û/g, 'U')
      .replace(/[^A-Z0-9]+/g, ' ').trim();
  }

  /* ---------------- Vergi numarası ---------------- */

  /* Vergi kimlik numarasının kontrol hanesini doğrular (10 hane) */
  function vknGecerli(s) {
    if (!/^\d{10}$/.test(s)) return false;
    let top = 0;
    for (let i = 0; i < 9; i++) {
      const t = (Number(s[i]) + 9 - i) % 10;
      let v = (t * Math.pow(2, 9 - i)) % 9;
      if (t !== 0 && v === 0) v = 9;
      top += v;
    }
    return (10 - (top % 10)) % 10 === Number(s[9]);
  }

  /* Hücredeki değeri vergi numarasına çevirir; Excel'in sayı yapıp baştaki sıfırı attığı 9 haneli değerleri tamamlar */
  function vknCoz(deger) {
    const r = metin(deger).replace(/\D/g, '');
    if (r.length === 9) { const d = '0' + r; if (vknGecerli(d)) return d; }
    return vknGecerli(r) ? r : '';
  }

  /* ---------------- Başlık ve sütun tanıma ---------------- */

  const SUTUN_KURALLARI = {
    unvan: [/UNVAN/, /^ADI$/, /^BORCLU( ADI)?$/, /^FIRMA( ADI)?$/, /^SIRKET( ADI)?$/],
    vkn: [/VERGI/, /\bVKN\b/, /MUSTERI NO/],
    sorumlu: [/SORUMLU/],
    /* Yalnız aracın daha önce açtığı "MERSİS ADRESİ" sütunu tanınır; listedeki başka adres sütunlarına yazılmaz */
    adres: [/MERSIS ADRES/],
    sonuc: [/SONUC/, /MERSIS/]
  };

  function sutunTuru(baslik) {
    const s = sade(baslik);
    if (!s) return '';
    for (const tur of Object.keys(SUTUN_KURALLARI)) {
      if (SUTUN_KURALLARI[tur].some(function (k) { return k.test(s); })) return tur;
    }
    return '';
  }

  /* İlk on satır içinde en çok tanınan başlığı olan satırı başlık sayar */
  function baslikSatiriBul(satirlar) {
    let en = 0, enSayi = 0;
    for (let i = 0; i < Math.min(10, satirlar.length); i++) {
      const turler = new Set((satirlar[i] || []).map(sutunTuru).filter(Boolean));
      if (turler.size > enSayi) { en = i; enSayi = turler.size; }
    }
    return en;
  }

  /* Başlık satırından sütun eşleşmesini çıkarır. Sütunlar 0'dan sayılır; bulunamayan -1. */
  function sutunlariBul(baslik) {
    const s = { unvan: -1, vkn: -1, sorumlu: -1, sonuc: -1, adres: -1 };
    (baslik || []).forEach(function (h, i) {
      const tur = sutunTuru(h);
      if (!tur) return;
      if (tur === 'vkn') {
        /* "Vergi No" sütunu "Müşteri No" sütunundan önce gelir */
        const vergi = /VERGI|\bVKN\b/.test(sade(h));
        if (s.vkn === -1 || (vergi && !/VERGI|\bVKN\b/.test(sade(baslik[s.vkn])))) s.vkn = i;
        return;
      }
      if (s[tur] === -1) s[tur] = i;
    });
    return s;
  }

  /* ---------------- Kurum türü ---------------- */

  /* MERSİS'te kaydı olmayan kurumları ünvandan tanır: dernek, vakıf, siyasi parti, kamu kurumu */
  function kurumTuru(unvan) {
    const u = ' ' + sade(unvan) + ' ';
    if (/ (SIRKETI|SIRKET|LTD|STI|ANONIM|LIMITED|KOOPERATIFI|KOOPERATIF|A S|AS) /.test(u)) return '';
    if (/ DERNE(G|K)/.test(u)) return 'dernek';
    if (/ VAKFI | VAKIF /.test(u)) return 'vakif';
    if (/ PARTISI /.test(u)) return 'parti';
    if (/ (BELEDIYESI|BELEDIYE|BASKANLIGI|BAKANLIGI|VALILIGI|KAYMAKAMLIGI|MUDURLUGU|MUFTULUGU|REKTORLUGU) /.test(u)) return 'kamu';
    return '';
  }

  const KURUM_ADI = { dernek: 'Dernek', vakif: 'Vakıf', parti: 'Siyasi parti', kamu: 'Kamu kurumu' };

  /* ---------------- Sorumlu ve liste ---------------- */

  function kisiAnahtari(x) { return buyuk(bosluk(x)); }

  /* Sorumlu sütunundaki kişileri ve kaç satırları olduğunu döndürür */
  function sorumlular(satirlar, baslikSatiri, sutun) {
    const say = new Map();
    for (let i = baslikSatiri + 1; i < satirlar.length; i++) {
      const ad = bosluk((satirlar[i] || [])[sutun]);
      if (!ad) continue;
      const k = kisiAnahtari(ad);
      if (!say.has(k)) say.set(k, { ad: ad, sayi: 0 });
      say.get(k).sayi++;
    }
    return Array.from(say.values()).sort(function (a, b) { return b.sayi - a.sayi || a.ad.localeCompare(b.ad, 'tr'); });
  }

  /*
   * Seçilen kişinin satırlarından sorgu listesi kurar.
   * ayar: { baslikSatiri, sutunlar: {unvan, vkn, sorumlu}, kisi }
   * Satır numaraları Excel'deki gibi 1'den başlar.
   */
  function listeKur(satirlar, ayar) {
    const s = ayar.sutunlar, hedef = kisiAnahtari(ayar.kisi);
    const ogeler = [], atlanan = [];
    for (let i = ayar.baslikSatiri + 1; i < satirlar.length; i++) {
      const satir = satirlar[i] || [];
      if (kisiAnahtari(satir[s.sorumlu]) !== hedef) continue;
      const unvan = bosluk(satir[s.unvan]);
      const hamVkn = s.vkn >= 0 ? bosluk(satir[s.vkn]) : '';
      const vkn = vknCoz(hamVkn);
      const r = i + 1;
      const kurum = kurumTuru(unvan);
      if (kurum) { atlanan.push({ r: r, n: unvan, v: vkn || hamVkn, neden: kurum }); continue; }
      if (vkn) ogeler.push({ r: r, n: unvan, v: vkn, a: 'vkn' });
      else if (unvan) ogeler.push({ r: r, n: unvan, v: hamVkn, a: 'unvan' });
      else atlanan.push({ r: r, n: '', v: hamVkn, neden: 'bos' });
    }
    return { ogeler: ogeler, atlanan: atlanan };
  }

  function rastgeleKimlik() {
    const b = new Uint8Array(6);
    (kok.crypto || {}).getRandomValues ? kok.crypto.getRandomValues(b) : b.forEach(function (_, i) { b[i] = Math.floor(Math.random() * 256); });
    return Array.from(b, function (x) { return x.toString(16).padStart(2, '0'); }).join('');
  }

  /* MERSİS Takip yer imine yapıştırılacak metin */
  function listeMetni(liste, kisi, dosyaAdi) {
    return JSON.stringify({
      tur: LISTE_TURU, surum: SURUM, id: rastgeleKimlik(), kisi: kisi, dosya: dosyaAdi || '',
      olusturma: new Date().toISOString(), ogeler: liste.ogeler
    });
  }

  /* ---------------- Sonuçları okuma ---------------- */

  function jsonAyikla(yazi) {
    const m = metin(yazi).trim();
    const bas = m.indexOf('{'), son = m.lastIndexOf('}');
    if (bas < 0 || son < bas) throw new Error('Yapıştırılan metinde sonuç bulunamadı. MERSİS Takip panelindeki "Sonuçları kopyala" düğmesini kullanın.');
    try { return JSON.parse(m.slice(bas, son + 1)); }
    catch (e) { throw new Error('Yapıştırılan sonuç metni eksik ya da bozuk. Panelden yeniden kopyalayıp yapıştırın.'); }
  }

  function sonucCoz(yazi) {
    const o = jsonAyikla(yazi);
    if (o.tur === LISTE_TURU) throw new Error('Bu, sorgu listesi; sonuç değil. MERSİS Takip panelinde "Sonuçları kopyala" düğmesine basıp onu yapıştırın.');
    if (o.tur !== SONUC_TURU || !Array.isArray(o.sonuclar)) throw new Error('Bu metin MERSİS Takip sonucu değil.');
    return o;
  }

  /*
   * Sonuçları yüklü Excel'in satırlarıyla eşleştirir. Satır numarası ve vergi
   * numarası (ya da ünvan) tutmayan sonuç başka bir dosyaya aittir; yazılmaz.
   * Eşleşen sonuçlarda listedeki ünvan Excel'den alınır (ünvan karşılaştırması için).
   */
  function sonuclariEsle(satirlar, sutunlar, sonuclar) {
    const uygun = [], uyumsuz = [];
    sonuclar.forEach(function (s) {
      const satir = satirlar[s.r - 1] || [];
      const vkn = sutunlar.vkn >= 0 ? vknCoz(satir[sutunlar.vkn]) : '';
      const unvan = bosluk(satir[sutunlar.unvan]);
      const tutar = s.a === 'vkn' ? vkn === s.v : sade(unvan) === sade(s.n);
      if (tutar) uygun.push(Object.assign({}, s, { n: unvan || s.n }));
      else uyumsuz.push(s);
    });
    return { uygun: uygun, uyumsuz: uyumsuz };
  }

  /* ---------------- Ünvan benzerliği ---------------- */

  const DOLGU_SOZCUKLER = new Set(('VE LIMITED LTD SIRKETI SIRKET STI ANONIM AS A S SANAYI SAN TICARET TIC IC DIS ' +
    'ITHALAT IHRACAT ITH IHR PAZARLAMA PAZ TURIZM INSAAT VB').split(' '));

  /* "VETIC" gibi "VE"ye bitişik yazılmış kısaltmalar da dolgu sayılır */
  function anlamliSozcukler(x) {
    return sade(x).split(' ').filter(function (w) {
      return w.length >= 2 && !DOLGU_SOZCUKLER.has(w) && !(w.indexOf('VE') === 0 && DOLGU_SOZCUKLER.has(w.slice(2)));
    });
  }

  /* Tek harf eksik, fazla, farklı ya da yer değiştirmiş mi (TESKTIL ~ TEKSTIL) */
  function tekHarfFarki(x, y) {
    if (Math.min(x.length, y.length) < 5 || Math.abs(x.length - y.length) > 1) return false;
    let i = 0;
    while (i < x.length && i < y.length && x[i] === y[i]) i++;
    if (x.length === y.length) {
      if (x.slice(i + 1) === y.slice(i + 1)) return true;
      return x[i] === y[i + 1] && x[i + 1] === y[i] && x.slice(i + 2) === y.slice(i + 2);
    }
    return x.length > y.length ? x.slice(i + 1) === y.slice(i) : x.slice(i) === y.slice(i + 1);
  }

  function sozcukEs(x, y) {
    return x === y || (Math.min(x.length, y.length) >= 3 && (x.indexOf(y) === 0 || y.indexOf(x) === 0)) || tekHarfFarki(x, y);
  }

  /* İki ünvanın benzerliği (0-1). Kısaltmalar, bitişik yazımlar ve tek harflik yazım hataları eşleşme sayılır. */
  function benzerlik(a, b) {
    const A = anlamliSozcukler(a), B = anlamliSozcukler(b);
    if (!A.length || !B.length) return 1;
    const kullanildi = new Array(B.length).fill(false);
    let es = 0;
    A.forEach(function (x) {
      for (let j = 0; j < B.length; j++) {
        if (!kullanildi[j] && sozcukEs(x, B[j])) { kullanildi[j] = true; es++; return; }
      }
    });
    return es / (A.length + B.length - es);
  }

  /* ---------------- SONUÇ metni ---------------- */

  function konkOzet(k) {
    if (!k || k.yok) return '';
    if (k.okunamadi) return 'Konkordato/iflas bilgisi okunamadı – MERSİS\'te elle bakın';
    const satirlar = Array.isArray(k.satirlar) ? k.satirlar.filter(function (s) { return s && s.some(Boolean); }) : [];
    if (!satirlar.length) return k.metin ? 'KONKORDATO/İFLAS: ' + bosluk(k.metin).slice(0, 300) : '';
    let t = 'KONKORDATO/İFLAS: ' + satirlar[0].map(bosluk).filter(Boolean).join(', ');
    if (satirlar.length > 1) t += ' (+' + (satirlar.length - 1) + ' kayıt daha)';
    return t;
  }

  function konkTamMetin(k) {
    if (!k) return '';
    if (k.yok) return 'Kayıt yok';
    if (k.okunamadi) return 'Okunamadı';
    const satirlar = Array.isArray(k.satirlar) ? k.satirlar : [];
    if (!satirlar.length) return bosluk(k.metin);
    const b = Array.isArray(k.basliklar) ? k.basliklar : [];
    return satirlar.map(function (s) {
      return s.map(function (h, i) { return (b[i] ? bosluk(b[i]) + ': ' : '') + bosluk(h); }).filter(function (x) { return !/:\s*$/.test(x); }).join('; ');
    }).join(' | ');
  }

  function unvanFarkli(s) {
    return s.sorgu === 'OK' && !!s.unvan && !!s.n && benzerlik(s.n, s.unvan) < 0.5;
  }

  /* Sonucun SONUÇ sütununa yazılacak kısa metni */
  function sonucMetni(s) {
    if (s.neden) return (KURUM_ADI[s.neden] || 'Kayıt') + (s.neden === 'bos' ? ' – ünvan ve vergi no boş, sorgulanmadı' : ' – MERSİS\'te kaydı yok, sorgulanmadı');
    switch (s.sorgu) {
      case 'OK': {
        let t = bosluk(s.durum) || 'Durum okunamadı';
        const k = konkOzet(s.konk);
        if (k) t += ' – ' + k;
        if (unvanFarkli(s)) t += ' – MERSİS\'teki ünvan: ' + s.unvan;
        return t;
      }
      case 'YOK': return s.a === 'unvan' ? 'Ünvanla aramada MERSİS\'te kayıt bulunamadı' : 'MERSİS\'te bu vergi numarasıyla kayıt bulunamadı';
      case 'COKLU': return 'Ünvanla aramada birden çok kayıt çıktı – elle kontrol edin';
      case 'BELIRSIZ': return 'MERSİS sonuç vermedi – yeniden sorgulayın';
      case 'ATLANDI': return 'Sorgulanmadı (MERSİS Takip\'te atlandı)';
      default: return 'Bilinmeyen sonuç';
    }
  }

  /* Satırın boyanacağı renk sınıfı */
  function sonucSinifi(s) {
    if (s.neden) return 'gri';
    if (s.sorgu !== 'OK') return s.sorgu === 'YOK' ? 'gri' : 'sari';
    const d = sade(s.durum);
    if (s.konk && s.konk.okunamadi) return 'sari';
    if (konkOzet(s.konk)) return 'turuncu';
    if (/TERKIN|TASFIYE|KAPAN|IFLAS/.test(d)) return 'kirmizi';
    if (unvanFarkli(s)) return 'sari';
    return '';
  }

  /* Özet sayıları */
  function ozet(kayitlar) {
    const o = { aktif: 0, tasfiye: 0, terkin: 0, digerDurum: 0, konk: 0, yok: 0, kontrol: 0, sorgusuz: 0 };
    kayitlar.forEach(function (s) {
      if (s.neden) { o.sorgusuz++; return; }
      if (s.sorgu === 'YOK') { o.yok++; return; }
      if (s.sorgu !== 'OK') { o.kontrol++; return; }
      const d = sade(s.durum);
      if (d === 'AKTIF') o.aktif++;
      else if (/TASFIYE/.test(d)) o.tasfiye++;
      else if (/TERKIN/.test(d)) o.terkin++;
      else o.digerDurum++;
      if (s.konk && s.konk.okunamadi) o.kontrol++;
      else if (konkOzet(s.konk)) o.konk++;
    });
    return o;
  }

  const DETAY_BASLIKLARI = ['Satır', 'Ünvan (listede)', 'Vergi No', 'Sorgu', 'SONUÇ', 'MERSİS Durumu', 'MERSİS\'teki Ünvan',
    'Kuruluş Tarihi', 'MERSİS No', 'Ticaret Sicil No', 'Ticaret Sicili Müdürlüğü', 'Firma Türü', 'Şehir', 'Adres',
    'Konkordato / İflas', 'Not', 'Sorgu Zamanı'];

  const SORGU_ADI = { OK: 'Bulundu', YOK: 'Bulunamadı', COKLU: 'Birden çok sonuç', BELIRSIZ: 'Sonuç alınamadı', ATLANDI: 'Atlandı' };

  function zamanMetni(z) {
    if (!z) return '';
    const d = new Date(z);
    if (isNaN(d)) return metin(z);
    const iki = function (n) { return String(n).padStart(2, '0'); };
    return iki(d.getDate()) + '.' + iki(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + iki(d.getHours()) + ':' + iki(d.getMinutes());
  }

  /* "MERSİS Detay" sayfasının bir satırı */
  function detaySatiri(s) {
    if (s.neden) return [String(s.r), s.n, s.v || '', 'Sorgulanmadı', sonucMetni(s), '', '', '', '', '', '', '', '', '', '', '', ''];
    const notlar = [];
    if (s.mesaj) notlar.push(s.mesaj);
    if (Array.isArray(s.adaylar) && s.adaylar.length) notlar.push('Adaylar: ' + s.adaylar.join(' | '));
    if (s.ek) notlar.push(s.ek);
    return [String(s.r), s.n, s.v || '', (SORGU_ADI[s.sorgu] || s.sorgu) + (s.a === 'unvan' ? ' (ünvanla)' : ''), sonucMetni(s),
      s.durum || '', s.unvan || '', s.kurulus || '', s.mersis || '', s.sicilNo || '', s.tsm || '', s.tur || '', s.sehir || '',
      s.adres || '', s.sorgu === 'OK' ? konkTamMetin(s.konk) : '', notlar.join(' – '), zamanMetni(s.zaman)];
  }

  kok.Mersis = {
    SURUM: SURUM, LISTE_TURU: LISTE_TURU, SONUC_TURU: SONUC_TURU,
    sade: sade, vknGecerli: vknGecerli, vknCoz: vknCoz,
    sutunTuru: sutunTuru, baslikSatiriBul: baslikSatiriBul, sutunlariBul: sutunlariBul,
    kurumTuru: kurumTuru, sorumlular: sorumlular, listeKur: listeKur, listeMetni: listeMetni,
    sonucCoz: sonucCoz, sonuclariEsle: sonuclariEsle, benzerlik: benzerlik,
    konkOzet: konkOzet, konkTamMetin: konkTamMetin, sonucMetni: sonucMetni, sonucSinifi: sonucSinifi, ozet: ozet,
    DETAY_BASLIKLARI: DETAY_BASLIKLARI, detaySatiri: detaySatiri
  };
})(typeof window !== 'undefined' ? window : this);
