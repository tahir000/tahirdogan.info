/*
 * MERSİS Şirket Sorgulama: sayfa davranışı
 * Excel'i okur, sütunları ve sorumluyu seçtirir, MERSİS Takip için sorgu
 * listesini hazırlar, gelen sonuçları gösterir ve Excel'e yazar.
 */
(function () {
  'use strict';
  const M = window.Mersis, X = window.XlsxDuzen;
  const $ = function (id) { return document.getElementById(id); };

  const RENK = { turuncu: 'FFFFCC99', kirmizi: 'FFFFC7CE', gri: 'FFD9D9D9', sari: 'FFFFF2CC' };
  const DETAY_GENISLIK = [7, 42, 13, 16, 46, 15, 42, 12, 18, 14, 30, 30, 12, 46, 50, 34, 16];

  const d = {
    dosyaAdi: '', kitap: null, sayfaAdi: '', satirlar: [], baslikSatiri: 0,
    /* adres: -2 = sona yeni "MERSİS ADRESİ" sütunu, -1 = yazılmaz, 0+ = seçilen sütun */
    sutunlar: { unvan: -1, vkn: -1, sorumlu: -1, sonuc: -1, adres: -2 }, kisi: '', liste: null, sonuc: null
  };

  function durum(id, metin, tur) { const e = $(id); e.textContent = metin || ''; e.className = 'durum' + (tur ? ' ' + tur : ''); }
  function adimAc(id, acik) { $(id).classList.toggle('kapali', !acik); }
  function secenekler(sel, liste, secili) {
    sel.innerHTML = '';
    liste.forEach(function (o) {
      const op = document.createElement('option');
      op.value = o.deger; op.textContent = o.ad;
      if (String(o.deger) === String(secili)) op.selected = true;
      sel.appendChild(op);
    });
  }
  function hucre(tr, metin, sinif, etiket) {
    const td = document.createElement(etiket || 'td');
    td.textContent = metin == null ? '' : metin;
    if (sinif) td.className = sinif;
    tr.appendChild(td);
    return td;
  }

  /* ---------------- 1) Dosya ---------------- */

  async function dosyaAl(dosya) {
    if (!dosya) return;
    durum('dosya-durum', '"' + dosya.name + '" okunuyor…', 'bilgi');
    try {
      const kitap = await X.kitapAc(new Uint8Array(await dosya.arrayBuffer()));
      if (!kitap.sayfalar.length) throw new Error('Dosyada okunabilen sayfa yok.');
      d.dosyaAdi = dosya.name; d.kitap = kitap; d.sonuc = null;
      /* Sorumlu sütunu olan ilk görünür sayfayı seç */
      let secili = kitap.sayfalar.find(function (s) { return !s.gizli; }) || kitap.sayfalar[0];
      for (const s of kitap.sayfalar) {
        const satirlar = X.sayfaOku(kitap, s.ad);
        const b = M.baslikSatiriBul(satirlar);
        if (M.sutunlariBul(satirlar[b] || []).sorumlu >= 0) { secili = s; break; }
      }
      secenekler($('sayfa'), kitap.sayfalar.map(function (s) { return { deger: s.ad, ad: s.ad + (s.gizli ? ' (gizli)' : '') }; }), secili.ad);
      durum('dosya-durum', '"' + dosya.name + '" okundu: ' + kitap.sayfalar.length + ' sayfa.', 'iyi');
      sayfaSec(secili.ad, true);
    } catch (e) {
      d.kitap = null;
      durum('dosya-durum', e.message || String(e), 'hata');
      ['adim-sutun', 'adim-kisi', 'adim-sorgu', 'adim-sonuc'].forEach(function (a) { adimAc(a, false); });
    }
  }

  const girdi = $('girdi'), birak = $('birak');
  girdi.addEventListener('change', function () { dosyaAl(girdi.files[0]); girdi.value = ''; });
  ['dragenter', 'dragover'].forEach(function (t) { birak.addEventListener(t, function (e) { e.preventDefault(); birak.classList.add('ustunde'); }); });
  ['dragleave', 'drop'].forEach(function (t) { birak.addEventListener(t, function () { birak.classList.remove('ustunde'); }); });
  birak.addEventListener('drop', function (e) { e.preventDefault(); if (e.dataTransfer.files.length) dosyaAl(e.dataTransfer.files[0]); });

  /* ---------------- 2) Sayfa ve sütunlar ---------------- */

  function sayfaSec(ad, otomatik) {
    d.sayfaAdi = ad;
    d.satirlar = X.sayfaOku(d.kitap, ad);
    if (otomatik !== false) {
      d.baslikSatiri = M.baslikSatiriBul(d.satirlar);
      $('baslik-satiri').value = d.baslikSatiri + 1;
    }
    sutunlariKur(true);
  }

  function sutunlariKur(otomatik) {
    const baslik = d.satirlar[d.baslikSatiri] || [];
    const enGenis = d.satirlar.slice(0, 200).reduce(function (m, s) { return Math.max(m, s.length); }, baslik.length);
    if (otomatik) {
      d.sutunlar = M.sutunlariBul(baslik);
      if (d.sutunlar.adres < 0) d.sutunlar.adres = -2;
    }
    const liste = [];
    for (let i = 0; i < Math.max(enGenis, 1); i++) {
      liste.push({ deger: i, ad: X.sutunAdi(i + 1) + (baslik[i] ? ' – ' + String(baslik[i]).slice(0, 40) : '') });
    }
    const yok = [{ deger: -1, ad: '(seçilmedi)' }];
    secenekler($('s-unvan'), yok.concat(liste), d.sutunlar.unvan);
    secenekler($('s-vkn'), [{ deger: -1, ad: '(yok – ünvanla ara)' }].concat(liste), d.sutunlar.vkn);
    secenekler($('s-sorumlu'), yok.concat(liste), d.sutunlar.sorumlu);
    secenekler($('s-sonuc'), [{ deger: -1, ad: '(sona yeni sütun ekle: MERSİS SONUCU)' }].concat(liste), d.sutunlar.sonuc);
    secenekler($('s-adres'), [{ deger: -2, ad: '(sona yeni sütun ekle: MERSİS ADRESİ)' }, { deger: -1, ad: '(adres yazılmasın)' }].concat(liste), d.sutunlar.adres);
    adimAc('adim-sutun', true);
    sutunKontrol();
  }

  function sutunKontrol() {
    const s = d.sutunlar;
    const eksik = [];
    if (s.unvan < 0) eksik.push('şirket ünvanı');
    if (s.sorumlu < 0) eksik.push('sorumlu');
    const veriSatiri = d.satirlar.length - d.baslikSatiri - 1;
    if (eksik.length) {
      durum('sutun-durum', 'Seçilmesi gereken sütun: ' + eksik.join(', ') + '.', 'hata');
      ['adim-kisi', 'adim-sorgu'].forEach(function (a) { adimAc(a, false); });
      adimAc('adim-sonuc', false);
      return;
    }
    const cakisan = (s.sonuc >= 0 && [s.unvan, s.vkn, s.sorumlu].indexOf(s.sonuc) >= 0) ||
      (s.adres >= 0 && [s.unvan, s.vkn, s.sorumlu, s.sonuc].indexOf(s.adres) >= 0);
    durum('sutun-durum', cakisan ? 'Sonuç ya da adres sütunu öteki sütunlardan biriyle aynı; başka bir sütun seçin.' :
      veriSatiri + ' veri satırı. ' + (s.vkn < 0 ? 'Vergi numarası sütunu seçilmedi; tüm şirketler ünvanla aranacak.' : ''), cakisan ? 'hata' : 'bilgi');
    if (cakisan) { adimAc('adim-kisi', false); return; }
    kisileriKur();
  }

  $('sayfa').addEventListener('change', function () { sayfaSec(this.value, true); });
  $('baslik-satiri').addEventListener('change', function () {
    const n = Math.max(1, Math.min(parseInt(this.value, 10) || 1, d.satirlar.length || 1));
    this.value = n; d.baslikSatiri = n - 1; sutunlariKur(true);
  });
  [['s-unvan', 'unvan'], ['s-vkn', 'vkn'], ['s-sorumlu', 'sorumlu'], ['s-sonuc', 'sonuc'], ['s-adres', 'adres']].forEach(function (p) {
    $(p[0]).addEventListener('change', function () { d.sutunlar[p[1]] = parseInt(this.value, 10); sutunKontrol(); });
  });

  /* ---------------- 3) Sorumlu ---------------- */

  function kisileriKur() {
    const kisiler = M.sorumlular(d.satirlar, d.baslikSatiri, d.sutunlar.sorumlu);
    const onceki = d.kisi;
    secenekler($('kisi'), [{ deger: '', ad: kisiler.length ? '(kişi seçin)' : '(sorumlu sütunu boş)' }].concat(kisiler.map(function (k) { return { deger: k.ad, ad: k.ad + ' – ' + k.sayi + ' şirket' }; })),
      kisiler.some(function (k) { return k.ad === onceki; }) ? onceki : '');
    adimAc('adim-kisi', true);
    kisiSec($('kisi').value);
  }

  function kisiSec(ad) {
    d.kisi = ad;
    const ozet = $('liste-ozet'), tablo = $('liste-tablo');
    ozet.innerHTML = ''; tablo.innerHTML = '';
    if (!ad) { d.liste = null; adimAc('adim-sorgu', false); $('liste-kopyala').disabled = true; sonucuGoster(); return; }
    d.liste = M.listeKur(d.satirlar, { baslikSatiri: d.baslikSatiri, sutunlar: d.sutunlar, kisi: ad });
    const vkn = d.liste.ogeler.filter(function (o) { return o.a === 'vkn'; }).length;
    const unvan = d.liste.ogeler.length - vkn;
    const say = {};
    d.liste.atlanan.forEach(function (a) { say[a.neden] = (say[a.neden] || 0) + 1; });
    const ad2 = { dernek: 'dernek', vakif: 'vakıf', parti: 'siyasi parti', kamu: 'kamu kurumu', bos: 'boş satır' };
    const parcalar = [['', '<b>' + d.liste.ogeler.length + '</b> şirket sorgulanacak']];
    if (vkn) parcalar.push(['', vkn + ' vergi numarasıyla']);
    if (unvan) parcalar.push(['sari', unvan + ' ünvanla (vergi no yok ya da geçersiz)']);
    Object.keys(say).forEach(function (k) { parcalar.push(['gri', say[k] + ' ' + ad2[k] + ' – sorgulanmayacak']); });
    parcalar.forEach(function (p) { const li = document.createElement('li'); li.className = p[0]; li.innerHTML = p[1]; ozet.appendChild(li); });

    const bas = document.createElement('tr');
    ['Satır', 'Ünvan', 'Vergi no', 'Nasıl aranacak'].forEach(function (h) { hucre(bas, h, '', 'th'); });
    tablo.appendChild(bas);
    d.liste.ogeler.forEach(function (o) {
      const tr = document.createElement('tr');
      if (o.a !== 'vkn') tr.className = 'sari';
      hucre(tr, o.r, 'no-h'); hucre(tr, o.n); hucre(tr, o.v); hucre(tr, o.a === 'vkn' ? 'Vergi no' : 'Ünvan');
      tablo.appendChild(tr);
    });
    d.liste.atlanan.forEach(function (o) {
      const tr = document.createElement('tr'); tr.className = 'gri';
      hucre(tr, o.r, 'no-h'); hucre(tr, o.n); hucre(tr, o.v); hucre(tr, 'Sorgulanmayacak (' + ad2[o.neden] + ')');
      tablo.appendChild(tr);
    });
    adimAc('adim-sorgu', d.liste.ogeler.length > 0 || d.liste.atlanan.length > 0);
    $('liste-kopyala').disabled = !d.liste.ogeler.length;
    $('liste-kopyala-not').textContent = d.liste.ogeler.length ? d.liste.ogeler.length + ' şirket' : 'sorgulanacak şirket yok';
    $('liste-yedek').classList.add('gizli');
    adimAc('adim-sonuc', true);
    sonucuGoster();
  }
  $('kisi').addEventListener('change', function () { kisiSec(this.value); });

  /* ---------------- 4) Yer imi ve liste ---------------- */

  const yerimi = $('yerimi');
  const yerimiAdresi = 'javascript:' + encodeURIComponent('(' + window.MersisTakip.toString() + ')();') + 'void%200';
  yerimi.href = yerimiAdresi;
  yerimi.addEventListener('click', function (e) {
    e.preventDefault();
    durum('yerimi-durum', 'Bu düğmeye burada tıklamayın: fareyle tutup yer imleri çubuğuna sürükleyin. Sonra MERSİS\'in Firma Sorgulama sayfasında yer imine tıklayın.', 'bilgi');
  });

  async function panoyaYaz(metin) {
    if (!navigator.clipboard || !navigator.clipboard.writeText) return false;
    try { await navigator.clipboard.writeText(metin); return true; } catch (e) { return false; }
  }

  $('yerimi-kopyala').addEventListener('click', async function () {
    if (await panoyaYaz(yerimiAdresi)) {
      durum('yerimi-durum', 'Yer imi adresi kopyalandı. Tarayıcıda yeni bir yer imi ekleyin (Ctrl+D, sonra "Düzenle"), adını "MERSİS Takip" yapın ve URL kutusuna yapıştırın.', 'iyi');
    } else durum('yerimi-durum', 'Pano kullanılamadı. Düğmeyi yer imleri çubuğuna sürükleyin.', 'hata');
  });

  $('liste-kopyala').addEventListener('click', async function () {
    if (!d.liste || !d.liste.ogeler.length) return;
    const metin = M.listeMetni(d.liste, d.kisi, d.dosyaAdi);
    if (await panoyaYaz(metin)) {
      $('liste-yedek').classList.add('gizli');
      durum('sorgu-durum', d.liste.ogeler.length + ' şirketlik sorgu listesi panoya kopyalandı. MERSİS Takip paneline yapıştırın.', 'iyi');
    } else {
      $('liste-yedek').classList.remove('gizli');
      const t = $('liste-metin'); t.value = metin; t.focus(); t.select();
      durum('sorgu-durum', '', '');
    }
  });

  /* ---------------- 5) Sonuçlar ---------------- */

  const sonucKutu = $('sonuc-metin');
  sonucKutu.addEventListener('input', function () { sonucOku(sonucKutu.value); });
  $('panodan').addEventListener('click', async function () {
    try { const m = await navigator.clipboard.readText(); sonucKutu.value = m; sonucOku(m); }
    catch (e) { durum('sonuc-durum', 'Panoya erişilemedi. Sonuçları kutuya Ctrl+V ile yapıştırın.', 'hata'); }
  });

  function sonucOku(metin) {
    d.sonuc = null;
    if (!metin.trim()) { durum('sonuc-durum', ''); sonucuGoster(); return; }
    if (!d.kitap) { durum('sonuc-durum', 'Önce sorgu listesini hazırladığınız Excel dosyasını 1. adımda yükleyin.', 'hata'); return; }
    try {
      const o = M.sonucCoz(metin);
      /* Sonuçlar başka bir sorumluya aitse o kişiyi seç */
      if (o.kisi && o.kisi !== d.kisi && d.sutunlar.sorumlu >= 0) {
        const var_ = M.sorumlular(d.satirlar, d.baslikSatiri, d.sutunlar.sorumlu).find(function (k) { return k.ad.toLocaleUpperCase('tr-TR') === String(o.kisi).toLocaleUpperCase('tr-TR'); });
        if (var_) { $('kisi').value = var_.ad; kisiSec(var_.ad); }
      }
      const es = M.sonuclariEsle(d.satirlar, d.sutunlar, o.sonuclar);
      d.sonuc = { ham: o, uygun: es.uygun, uyumsuz: es.uyumsuz };
      durum('sonuc-durum', o.sonuclar.length + ' sonuç okundu' + (o.kisi ? ' (' + o.kisi + ')' : '') + '.', es.uygun.length ? 'iyi' : 'hata');
    } catch (e) {
      durum('sonuc-durum', e.message || String(e), 'hata');
    }
    sonucuGoster();
  }

  /* Excel'e yazılacak kayıtlar: gelen sonuçlar ve sorgulanmayan kurumlar, satır sırasıyla */
  function kayitlar() {
    const harita = new Map();
    if (d.liste) d.liste.atlanan.forEach(function (a) { harita.set(a.r, a); });
    if (d.sonuc) d.sonuc.uygun.forEach(function (s) { harita.set(s.r, s); });
    return Array.from(harita.values()).sort(function (a, b) { return a.r - b.r; });
  }

  function sonucuGoster() {
    const ozet = $('sonuc-ozet'), not = $('sonuc-not'), tablo = $('sonuc-tablo');
    ozet.innerHTML = ''; not.innerHTML = ''; tablo.innerHTML = '';
    $('sonuc-kap').classList.add('gizli');
    $('indir').disabled = true;
    if (!d.sonuc) return;
    const k = kayitlar();
    const o = M.ozet(k);
    [['', o.aktif, 'Aktif'], ['turuncu', o.konk, 'konkordato/iflas kaydı'], ['kirmizi', o.tasfiye, 'tasfiye halinde'],
      ['kirmizi', o.terkin, 'terkin edilmiş'], ['sari', o.digerDurum, 'başka durumda'], ['gri', o.yok, 'bulunamadı'],
      ['sari', o.kontrol, 'elle kontrol edilmeli'], ['gri', o.sorgusuz, 'sorgulanmadı (dernek/kamu)']].forEach(function (p) {
      if (!p[1]) return;
      const li = document.createElement('li'); li.className = p[0];
      const b = document.createElement('b'); b.textContent = p[1];
      li.appendChild(b); li.appendChild(document.createTextNode(' ' + p[2]));
      ozet.appendChild(li);
    });
    const notlar = [];
    if (d.sonuc.uyumsuz.length) notlar.push(['hata', d.sonuc.uyumsuz.length + ' sonuç bu Excel\'deki satırlarla eşleşmedi (satır numarası ya da vergi numarası farklı) ve yazılmayacak. Sorgu listesini hangi dosyadan hazırladıysanız onu yükleyin.']);
    if (d.liste) {
      const gelen = new Set(d.sonuc.uygun.map(function (s) { return s.r; }));
      const kalan = d.liste.ogeler.filter(function (x) { return !gelen.has(x.r); }).length;
      if (kalan) notlar.push(['', d.kisi + ' listesindeki ' + kalan + ' şirket henüz sorgulanmadı; bunların SONUÇ hücresi boş kalır.']);
    }
    notlar.forEach(function (n) { const p = document.createElement('p'); p.className = 'not' + (n[0] ? ' ' + n[0] : ''); p.textContent = n[1]; not.appendChild(p); });

    const bas = document.createElement('tr');
    ['Satır', 'Ünvan', 'Vergi no', 'SONUÇ', 'MERSİS adresi'].forEach(function (h) { hucre(bas, h, '', 'th'); });
    tablo.appendChild(bas);
    k.forEach(function (s) {
      const tr = document.createElement('tr');
      const sinif = M.sonucSinifi(s);
      if (sinif) tr.className = sinif;
      hucre(tr, s.r, 'no-h'); hucre(tr, s.n); hucre(tr, s.v); hucre(tr, M.sonucMetni(s)); hucre(tr, adresi(s));
      tablo.appendChild(tr);
    });
    $('sonuc-kap').classList.toggle('gizli', !k.length);
    $('indir').disabled = !k.length;
  }

  /* Firma bulunduysa MERSİS'teki adresi */
  function adresi(s) { return s.sorgu === 'OK' ? (s.adres || '') : ''; }

  /* Sonuçları yazılmış Excel'i üretir (indirmeden) */
  async function excelOlustur() {
    const k = kayitlar();
    if (!k.length || !d.kitap) throw new Error('Yazılacak sonuç yok.');
    const bas = d.baslikSatiri + 1;
    let sonSutun = d.satirlar.reduce(function (m, s) { return Math.max(m, s.length); }, 0);
    const hucreler = [];
    const yeniSutun = function (baslik) {
      const n = ++sonSutun;
      hucreler.push({ satir: bas, sutun: n, deger: baslik, stilKaynagi: n > 1 ? { satir: bas, sutun: n - 1 } : null });
      return n;
    };
    const sutun = d.sutunlar.sonuc >= 0 ? d.sutunlar.sonuc + 1 : yeniSutun('MERSİS SONUCU');
    const adresSutun = d.sutunlar.adres >= 0 ? d.sutunlar.adres + 1 : d.sutunlar.adres === -2 ? yeniSutun('MERSİS ADRESİ') : 0;
    k.forEach(function (s) {
      hucreler.push({ satir: s.r, sutun: sutun, deger: M.sonucMetni(s), dolgu: RENK[M.sonucSinifi(s)] || null });
      /* Adres yalnız firma bulunduysa yazılır; seçilen sütundaki öteki değerler silinmez */
      if (adresSutun && adresi(s)) hucreler.push({ satir: s.r, sutun: adresSutun, deger: adresi(s) });
    });
    const satirlar = [M.DETAY_BASLIKLARI].concat(k.map(M.detaySatiri));
    const dolgular = [null].concat(k.map(function (s) { return RENK[M.sonucSinifi(s)] || null; }));
    const sayfaAdi = ('MERSİS ' + (d.kisi || 'Sonuçlar')).slice(0, 31);
    const bayt = await X.kitapYaz(d.kitap, {
      sayfa: d.sayfaAdi, hucreler: hucreler,
      yeniSayfa: { ad: sayfaAdi, satirlar: satirlar, dolgular: dolgular, genislikler: DETAY_GENISLIK }
    });
    const dosyaAdi = (d.dosyaAdi.replace(/\.(xlsx|xlsm)$/i, '') + ' - MERSİS ' + (d.kisi || 'sonuçlar') + '.xlsx').replace(/[\\\/:*?"<>|]/g, ' ');
    return { bayt: bayt, dosyaAdi: dosyaAdi, sayfaAdi: sayfaAdi, sayi: k.length };
  }

  $('indir').addEventListener('click', async function () {
    const dugme = this;
    dugme.disabled = true;
    durum('sonuc-durum', 'Excel hazırlanıyor…', 'bilgi');
    try {
      const c = await excelOlustur();
      const url = URL.createObjectURL(new Blob([c.bayt], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a');
      a.href = url; a.download = c.dosyaAdi;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      durum('sonuc-durum', '"' + c.dosyaAdi + '" indirildi: ' + c.sayi + ' satırın SONUÇ hücresi yazıldı, "' + c.sayfaAdi + '" sayfası eklendi.', 'iyi');
    } catch (e) {
      durum('sonuc-durum', 'Excel yazılamadı: ' + (e.message || e), 'hata');
    }
    dugme.disabled = false;
  });

  /* Testler için */
  window.MersisArayuz = { durum: d, dosyaAl: dosyaAl, sonucOku: sonucOku, kayitlar: kayitlar, excelOlustur: excelOlustur, kisiSec: kisiSec };
})();
