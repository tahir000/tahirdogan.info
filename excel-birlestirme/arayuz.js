/*
 * Excel Birleştirme: arayüz
 * Dosya seçme, sayfa seçimi, birleştirme raporu, not ve ayarlar.
 * Dosya içeriğindeki metinler sayfaya yalnızca textContent ile yazılır.
 */
(function () {
  'use strict';

  const B = window.Birlestirme, O = window.ExcelOkuyucu, Y = window.ExcelYazici;
  const AYAR_ANAHTARI = 'excelBirlestirme.ayarlar.v1';
  const YAZAN_ANAHTARI = 'excelBirlestirme.yazan';
  const RAPOR_SINIRI = 300;
  const $ = function (id) { return document.getElementById(id); };

  function depoOku(a) { try { return window.localStorage.getItem(a); } catch (e) { return null; } }
  function depoYaz(a, v) { try { window.localStorage.setItem(a, v); } catch (e) { /* tarayıcı izin vermezse ayar yalnız bu oturumda geçerli */ } }

  function ayarYukle() {
    try {
      const m = depoOku(AYAR_ANAHTARI);
      if (m) { const a = B.ayarDuz(JSON.parse(m)); if (a.kurumlar.length) return a; }
    } catch (e) { /* bozuk kayıt: varsayılana dön */ }
    return B.ayarDuz(B.VARSAYILAN_AYARLAR);
  }

  const uyg = { ayar: ayarYukle(), temel: null, ana: null, gelenler: [], sonuc: null, yeniNotlar: [], sayac: 0 };
  uyg.temel = B.bosDurum(uyg.ayar);

  function ayarKaydet() { depoYaz(AYAR_ANAHTARI, JSON.stringify(uyg.ayar)); }

  /* ---------------- Küçük yardımcılar ---------------- */

  function el(etiket, ozellik, cocuklar) {
    const e = document.createElement(etiket);
    if (ozellik) {
      Object.keys(ozellik).forEach(function (k) {
        const v = ozellik[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'sinif') e.className = v;
        else if (k === 'metin') e.textContent = v;
        else if (k.indexOf('on') === 0 && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else if (k in e && k !== 'list') e[k] = v;
        else e.setAttribute(k, v === true ? '' : v);
      });
    }
    (cocuklar || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  }

  function sayi(n) { return Number(n || 0).toLocaleString('tr-TR'); }
  function boyut(b) { return b >= 1048576 ? (b / 1048576).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  function tarihSaat(ms) { return new Date(ms).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  function iki(n) { return n < 10 ? '0' + n : String(n); }
  function dosyaZamani(d) { return d.getFullYear() + '-' + iki(d.getMonth() + 1) + '-' + iki(d.getDate()) + ' ' + iki(d.getHours()) + '.' + iki(d.getMinutes()); }
  function hataMetni(e) { return (e && e.message) ? e.message : String(e); }
  function mesaj(id, metin, tur) { const k = $(id); k.textContent = metin || ''; k.className = 'durum' + (tur ? ' ' + tur : ''); }
  function turSinifi(tur) { return tur === 'Banka cevapları' ? 'banka' : tur === 'Tebligat raporu' ? 'tebligat' : tur === 'Genel tablo' ? 'genel' : 'taninmadi'; }

  /* ---------------- Dosya alanları ---------------- */

  function birakmaAlani(alan, girdi, isle) {
    ['dragenter', 'dragover'].forEach(function (t) {
      alan.addEventListener(t, function (e) { e.preventDefault(); alan.classList.add('ustunde'); });
    });
    ['dragleave', 'drop'].forEach(function (t) {
      alan.addEventListener(t, function (e) { e.preventDefault(); alan.classList.remove('ustunde'); });
    });
    alan.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) isle(Array.from(e.dataTransfer.files));
    });
    girdi.addEventListener('change', function () {
      const l = Array.from(girdi.files || []);
      girdi.value = '';
      if (l.length) isle(l);
    });
  }

  async function anaYukle(dosyalar) {
    const d = dosyalar[0];
    if (!d) return;
    mesaj('ana-durum', '"' + d.name + '" okunuyor...', 'bilgi');
    try {
      const sayfalar = await O.oku(await d.arrayBuffer(), d.name);
      const c = B.anaExceliCoz(sayfalar);
      uyg.ayar = B.ayaraKurumlariEkle(c.ayar || uyg.ayar, c.kurumTablolari);
      ayarKaydet();
      uyg.temel = c.durum;
      uyg.ana = { ad: d.name, ayarVar: !!c.ayar };
      /* Bu oturumda eklenip indirilen Excel'e zaten yazılmış notlar ikinci kez eklenmesin */
      const notAnahtari = function (n) { const l = n.map(function (v) { return String(v || ''); }); while (l.length && !l[l.length - 1]) l.pop(); return l.join('|'); };
      const varOlan = new Set(c.durum.notlar.slice(1).map(notAnahtari));
      uyg.yeniNotlar = uyg.yeniNotlar.filter(function (n) { return !varOlan.has(notAnahtari(n)); });
      uyg.sonuc = null;
      gelenleriYenidenCozumle();
      mesaj('ana-durum', '', '');
      mesaj('indir-durum', '', '');
      ayarFormunuDoldur();
      ciz();
    } catch (e) {
      mesaj('ana-durum', hataMetni(e), 'hata');
    }
  }

  async function gelenEkle(dosyalar) {
    mesaj('gelen-durum', dosyalar.length + ' dosya okunuyor...', 'bilgi');
    let tekrar = 0;
    for (const d of dosyalar) {
      if (uyg.gelenler.some(function (g) { return g.ad === d.name && g.boyut === d.size && g.tarih === d.lastModified; })) { tekrar++; continue; }
      const g = { id: ++uyg.sayac, ad: d.name, tarih: d.lastModified || Date.now(), boyut: d.size, ham: null, cozum: null, hata: null };
      try {
        g.ham = await O.oku(await d.arrayBuffer(), d.name);
        g.cozum = B.dosyayiCozumle(d.name, g.ham, uyg.ayar);
      } catch (e) {
        g.hata = hataMetni(e);
      }
      uyg.gelenler.push(g);
    }
    uyg.gelenler.sort(function (a, b) { return (a.tarih - b.tarih) || (a.id - b.id); });
    uyg.sonuc = null;
    mesaj('gelen-durum', tekrar ? tekrar + ' dosya zaten listedeydi, yeniden eklenmedi.' : '', tekrar ? 'uyari' : '');
    mesaj('indir-durum', '', '');
    ciz();
  }

  function gelenleriYenidenCozumle() {
    uyg.gelenler.forEach(function (g) {
      if (!g.ham) return;
      const onceki = {};
      if (g.cozum) g.cozum.sayfalar.forEach(function (s) { onceki[s.sayfa] = s.secili; });
      g.cozum = B.dosyayiCozumle(g.ad, g.ham, uyg.ayar);
      g.cozum.sayfalar.forEach(function (s) {
        if (Object.prototype.hasOwnProperty.call(onceki, s.sayfa) && s.kayitlar.length) s.secili = onceki[s.sayfa];
      });
    });
  }

  /* ---------------- Çizim ---------------- */

  function ciz() {
    $('kurum-uyari').hidden = uyg.ayar.kurumlar.length > 0;
    anaOzetiCiz();
    gelenListesiniCiz();
    raporuCiz();
    notlariCiz();
    dugmeleriGuncelle();
  }

  function anaOzetiCiz() {
    const kutu = $('ana-ozet');
    kutu.textContent = '';
    if (!uyg.ana) {
      kutu.appendChild(el('p', { sinif: 'soluk', metin: 'Ana Excel seçilmedi. Birleştirince yeni bir ana tablo oluşturulur.' }));
      return;
    }
    const parcalar = uyg.temel.tablolar.map(function (t) { return t.ad + ': ' + sayi(t.satirlar.length) + ' satır'; });
    parcalar.push('Notlar: ' + sayi(Math.max(0, uyg.temel.notlar.length - 1)));
    kutu.appendChild(el('p', null, [el('strong', { metin: uyg.ana.ad }), ' yüklendi.' + (uyg.ana.ayarVar ? ' Ayarlar bu dosyadan alındı.' : '')]));
    kutu.appendChild(el('p', { sinif: 'soluk', metin: parcalar.join(' · ') }));
    kutu.appendChild(el('button', {
      type: 'button', metin: 'Ana Excel\'i kaldır',
      onclick: function () {
        uyg.ana = null; uyg.temel = B.bosDurum(uyg.ayar); uyg.sonuc = null;
        mesaj('indir-durum', '', '');
        ciz();
      }
    }));
  }

  function gelenListesiniCiz() {
    const kutu = $('gelen-liste');
    kutu.textContent = '';
    if (!uyg.gelenler.length) return;
    if (uyg.gelenler.length > 1) kutu.appendChild(el('p', { sinif: 'soluk', metin: 'İşlenme sırası dosyaların değiştirilme tarihine göredir (eskiden yeniye).' }));
    uyg.gelenler.forEach(function (g, sira) {
      const kart = el('div', { sinif: 'dosya-kart' });
      kart.appendChild(el('div', { sinif: 'dosya-ust' }, [
        el('span', { sinif: 'sira', metin: String(sira + 1), title: 'İşlenme sırası' }),
        el('strong', { metin: g.ad }),
        el('span', { sinif: 'soluk', metin: tarihSaat(g.tarih) + ' · ' + boyut(g.boyut) }),
        el('button', {
          type: 'button', sinif: 'kaldir', metin: '×', title: 'Listeden çıkar', 'aria-label': g.ad + ' dosyasını listeden çıkar',
          onclick: function () {
            uyg.gelenler = uyg.gelenler.filter(function (x) { return x !== g; });
            uyg.sonuc = null;
            mesaj('indir-durum', '', '');
            ciz();
          }
        })
      ]));
      if (g.hata) { kart.appendChild(el('p', { sinif: 'hata-metni', metin: g.hata })); kutu.appendChild(kart); return; }
      if (!g.cozum.sayfalar.length) kart.appendChild(el('p', { sinif: 'sayfa-satiri soluk', metin: 'Dosyada okunacak sayfa bulunamadı.' }));
      g.cozum.sayfalar.forEach(function (s) {
        const kutucuk = el('input', {
          type: 'checkbox', checked: s.secili, disabled: !s.kayitlar.length,
          onchange: function (e) { s.secili = e.target.checked; uyg.sonuc = null; mesaj('indir-durum', '', ''); raporuCiz(); dugmeleriGuncelle(); }
        });
        const gorulen = new Set();
        const esler = s.eslesmeler.filter(function (e) { const a = e.gelen + '>' + e.hedef; if (gorulen.has(a)) return false; gorulen.add(a); return true; });
        const satirBilgi = sayi(s.okunanSatir) + ' satır' + (s.kayitlar.length && s.kayitlar.length !== s.okunanSatir ? ', ' + sayi(s.kayitlar.length) + ' kayıt yazılabilir' : '');
        kart.appendChild(el('div', { sinif: 'sayfa-satiri' }, [
          el('div', { sinif: 'sayfa-ust' }, [
            el('label', { sinif: 'sayfa-sec' }, [kutucuk, el('span', { metin: s.sayfa })]),
            el('span', { sinif: 'rozet ' + turSinifi(s.tur), metin: s.tur }),
            el('span', { sinif: 'soluk', metin: satirBilgi })
          ]),
          s.neden ? el('p', { sinif: 'not', metin: s.neden }) : null,
          esler.length ? el('div', { sinif: 'esler', 'aria-label': 'Sütun eşleştirmesi' }, esler.map(function (e) {
            return el('span', { sinif: 'es', metin: e.gelen + ' → ' + e.hedef, title: e.aciklama || '' });
          })) : null
        ]));
      });
      kutu.appendChild(kart);
    });
  }

  function sayiKarti(baslik, n, sinif) {
    return el('div', { sinif: 'sayi-kart ' + (sinif || '') }, [el('b', { metin: sayi(n) }), el('span', { metin: baslik })]);
  }

  function bolum(baslik, icerik) {
    return el('section', { sinif: 'bolum' }, [el('h5', { metin: baslik }), icerik]);
  }

  function eslesmeTablosu(eslesmeler) {
    return el('div', { sinif: 'tablo-kap' }, [el('table', null, [
      el('thead', null, [el('tr', null, [el('th', { metin: 'Gelen sütun' }), el('th', { metin: 'Tablodaki sütun' }), el('th', { metin: 'Açıklama' })])]),
      el('tbody', null, eslesmeler.map(function (e) {
        return el('tr', null, [el('td', { metin: e.gelen }), el('td', { metin: e.hedef }), el('td', { metin: e.aciklama || '' })]);
      }))
    ])]);
  }

  function ozetKarti(o) {
    const kart = el('article', { sinif: 'ozet-kart' });
    kart.appendChild(el('header', null, [
      el('h4', null, [o.dosya, el('span', { sinif: 'ayrac', metin: ' › ' }), o.sayfa]),
      el('span', { sinif: 'rozet ' + turSinifi(o.tur), metin: o.tur })
    ]));
    kart.appendChild(el('p', { sinif: 'soluk', metin: sayi(o.okunan) + ' satır okundu.' }));
    const nereye = Object.keys(o.tablolar).map(function (ad) {
      const x = o.tablolar[ad], p = [];
      if (x.yeni) p.push(sayi(x.yeni) + ' yeni satır');
      if (x.guncellenen) p.push(sayi(x.guncellenen) + ' güncellenen');
      if (x.degismeyen) p.push(sayi(x.degismeyen) + ' değişmeyen');
      return el('li', null, [el('strong', { metin: ad }), ' sayfası: ' + p.join(', ')]);
    });
    if (nereye.length) kart.appendChild(bolum('Satırlar hangi sayfaya gitti', el('ul', null, nereye)));
    const sutunlar = Object.keys(o.sutunlar).sort(function (a, b) { return o.sutunlar[b] - o.sutunlar[a]; }).map(function (c) {
      return el('li', null, [el('strong', { metin: c }), ': ' + sayi(o.sutunlar[c]) + ' satıra yazıldı']);
    });
    if (sutunlar.length) kart.appendChild(bolum('Hangi sütunlara yazıldı', el('ul', null, sutunlar)));
    if (o.eslesmeler.length) kart.appendChild(bolum('Sütun eşleştirmesi', eslesmeTablosu(o.eslesmeler)));
    if (o.kullanilmayan.length) kart.appendChild(bolum('Kullanılmayan sütunlar', el('p', { sinif: 'soluk', metin: o.kullanilmayan.join(', ') + '. Gerekirse Ayarlar > Sütun eşleştirme bölümünden bağlayın.' })));
    const nedenler = Object.keys(o.atlamaNedenleri);
    if (nedenler.length) kart.appendChild(bolum('Atlanan satırlar', el('ul', null, nedenler.map(function (n) { return el('li', { metin: n + ': ' + sayi(o.atlamaNedenleri[n]) }); }))));
    if (o.digere) {
      const tan = Object.keys(o.taninmayanAlacaklilar);
      const cocuklar = [el('p', { metin: sayi(o.digere) + ' satırın kurumu bulunamadı.' + (tan.length ? ' Tanınmayan alacaklı adları:' : ' Bu satırlarda Alacaklı bilgisi yok ve dosyaları ana tabloda henüz bir kurum sayfasında değil.') })];
      if (tan.length) cocuklar.push(el('ul', null, tan.slice(0, 8).map(function (a) { return el('li', { metin: a + ' (' + sayi(o.taninmayanAlacaklilar[a]) + ')' }); })));
      cocuklar.push(el('p', { sinif: 'soluk', metin: tan.length ? 'Bir kuruma bağlamak için Ayarlar > Kurumlar bölümünde ilgili kurumun "Alacaklı adında geçenler" kutusuna bu adın bir kelimesini ekleyin.' : 'Aynı dosya Alacaklı sütunu olan bir Excel ile geldiğinde satırlar kurum sayfasına kendiliğinden taşınır.' }));
      kart.appendChild(bolum('Diğer sayfasına gidenler', el('div', null, cocuklar)));
    }
    if (o.tasinan) kart.appendChild(el('p', { sinif: 'not', metin: sayi(o.tasinan) + ' satır Diğer sayfasından kurum sayfasına taşındı.' }));
    return kart;
  }

  function detayTablosu(rapor) {
    const kap = el('section', { sinif: 'detay' });
    kap.appendChild(el('h3', { metin: 'Satır satır neler yazıldı' }));
    if (!rapor.length) { kap.appendChild(el('p', { sinif: 'soluk', metin: 'Tabloya yazılan yeni bilgi yok.' })); return kap; }
    const ara = el('input', { type: 'search', placeholder: 'Ara: dosya no, borçlu, sayfa adı...', 'aria-label': 'Raporda ara' });
    const bilgi = el('p', { sinif: 'soluk' });
    const govde = el('tbody');
    const basliklar = ['Kaynak', 'İşlem', 'Hedef sayfa', 'İcra Dairesi', 'Dosya No', 'Borçlu', 'Yazılanlar / not'];
    const tablo = el('div', { sinif: 'tablo-kap' }, [el('table', null, [
      el('thead', null, [el('tr', null, basliklar.map(function (b) { return el('th', { metin: b }); }))]),
      govde
    ])]);
    function doldur() {
      const q = ara.value.trim().toLocaleLowerCase('tr-TR');
      const uyan = q ? rapor.filter(function (r) { return r.join(' ').toLocaleLowerCase('tr-TR').indexOf(q) !== -1; }) : rapor;
      govde.textContent = '';
      uyan.slice(0, RAPOR_SINIRI).forEach(function (r) {
        govde.appendChild(el('tr', { sinif: r[3] === 'Atlandı' ? 'atlandi' : '' }, [
          el('td', { metin: [r[0], r[1], r[2] ? 'satır ' + r[2] : ''].filter(Boolean).join(' › ') }),
          el('td', { metin: r[3] }), el('td', { metin: r[4] }), el('td', { metin: r[5] }),
          el('td', { metin: r[6] }), el('td', { metin: r[7] }),
          el('td', { metin: [r[8], r[9]].filter(Boolean).join(' · ') })
        ]));
      });
      bilgi.textContent = sayi(uyan.length) + ' satır' + (uyan.length > RAPOR_SINIRI ? ', ilk ' + RAPOR_SINIRI + ' tanesi gösteriliyor' : '') + '. Tamamı indirilen Excel\'in "Son Yükleme Raporu" sayfasında.';
    }
    ara.addEventListener('input', doldur);
    doldur();
    kap.appendChild(ara);
    kap.appendChild(bilgi);
    kap.appendChild(tablo);
    return kap;
  }

  function raporuCiz() {
    const kutu = $('rapor');
    kutu.textContent = '';
    const s = uyg.sonuc;
    if (!s) return;
    const t = { yeni: 0, guncellenen: 0, degismeyen: 0, atlanan: 0, digere: 0 };
    s.ozetler.forEach(function (o) { t.yeni += o.yeni; t.guncellenen += o.guncellenen; t.degismeyen += o.degismeyen; t.atlanan += o.atlanan; t.digere += o.digere; });
    kutu.appendChild(el('h3', { metin: 'Sonuç' }));
    kutu.appendChild(el('div', { sinif: 'kartlar' }, [
      sayiKarti('yeni satır', t.yeni, t.yeni ? 'iyi-kart' : ''),
      sayiKarti('güncellenen satır', t.guncellenen, t.guncellenen ? 'iyi-kart' : ''),
      sayiKarti('değişmeyen', t.degismeyen, ''),
      sayiKarti('atlanan satır', t.atlanan, t.atlanan ? 'uyari-kart' : ''),
      sayiKarti('Diğer sayfasına giden', t.digere, t.digere ? 'uyari-kart' : '')
    ]));
    if (s.ayarTasima) kutu.appendChild(el('p', { sinif: 'not', metin: sayi(s.ayarTasima) + ' satır, Alacaklı adı artık bir kuruma uyduğu için Diğer sayfasından kurum sayfasına taşındı.' }));
    if (!s.ozetler.length) kutu.appendChild(el('p', { sinif: 'soluk', metin: 'Seçili sayfa yok.' }));
    s.ozetler.forEach(function (o) { kutu.appendChild(ozetKarti(o)); });
    kutu.appendChild(detayTablosu(s.rapor));
  }

  function dugmeleriGuncelle() {
    const seciliVar = uyg.gelenler.some(function (g) { return g.cozum && g.cozum.sayfalar.some(function (s) { return s.secili; }); });
    $('birlestir-dugme').disabled = !seciliVar;
    const bekleyen = seciliVar && !uyg.sonuc;
    $('indir-dugme').disabled = bekleyen || !(uyg.sonuc || uyg.ana || uyg.yeniNotlar.length);
    $('indir-dugme').title = bekleyen ? 'Önce Birleştir\'e basın' : '';
  }

  /* ---------------- Birleştir ve indir ---------------- */

  function birlestirTikla() {
    const cozumler = uyg.gelenler.filter(function (g) { return g.cozum; }).map(function (g) { return g.cozum; });
    try {
      uyg.sonuc = B.birlestir(uyg.temel, cozumler, uyg.ayar, new Date());
      mesaj('birlestir-durum', '', '');
    } catch (e) {
      uyg.sonuc = null;
      mesaj('birlestir-durum', 'Birleştirme yapılamadı: ' + hataMetni(e), 'hata');
    }
    mesaj('indir-durum', '', '');
    raporuCiz();
    dugmeleriGuncelle();
    if (uyg.sonuc) $('rapor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function ciktiOlustur() {
    const durum = uyg.sonuc ? uyg.sonuc.durum : uyg.temel;
    return Y.bayt(B.ciktiSayfalari(durum, uyg.ayar, uyg.yeniNotlar));
  }

  async function indirTikla() {
    const dugme = $('indir-dugme');
    dugme.disabled = true;
    try {
      const b = await ciktiOlustur();
      const ad = 'Ana Excel ' + dosyaZamani(new Date()) + '.xlsx';
      const url = URL.createObjectURL(new Blob([b], { type: Y.MIME }));
      const a = el('a', { href: url, download: ad });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      mesaj('indir-durum', '"' + ad + '" indirildi. Bir sonraki sefer bu dosyayı 1. adımda ana Excel olarak seçin.', 'iyi');
    } catch (e) {
      mesaj('indir-durum', 'Excel oluşturulamadı: ' + hataMetni(e), 'hata');
    }
    dugmeleriGuncelle();
  }

  /* ---------------- Notlar ---------------- */

  function notlariCiz() {
    const sec = $('not-kurum');
    const onceki = sec.value;
    sec.textContent = '';
    uyg.ayar.kurumlar.map(function (k) { return k.ad; }).concat(['Genel']).forEach(function (a) { sec.appendChild(el('option', { value: a, metin: a })); });
    if (onceki && Array.from(sec.options).some(function (o) { return o.value === onceki; })) sec.value = onceki;
    const liste = $('not-liste');
    liste.textContent = '';
    uyg.yeniNotlar.slice().reverse().forEach(function (n) {
      liste.appendChild(el('li', null, [
        el('span', { sinif: 'soluk', metin: [n[0], n[1], n[2]].filter(Boolean).join(' · ') + ': ' }),
        n[3],
        n[4] ? el('span', { sinif: 'soluk', metin: ' (' + n[4] + ')' }) : null
      ]));
    });
    const mevcut = Math.max(0, uyg.temel.notlar.length - 1);
    $('not-sayac').textContent = (mevcut ? 'Ana Excel\'de ' + sayi(mevcut) + ' not var. ' : '') +
      (uyg.yeniNotlar.length ? 'Bu oturumda ' + sayi(uyg.yeniNotlar.length) + ' not eklendi; indirilen Excel\'e yazılacak.' : '');
  }

  function notEkle() {
    const metin = $('not-metin').value.trim();
    if (!metin) { mesaj('not-durum', 'Not boş olamaz.', 'hata'); $('not-metin').focus(); return; }
    const yazan = $('not-yazan').value.trim();
    depoYaz(YAZAN_ANAHTARI, yazan);
    uyg.yeniNotlar.push([B.yardimci.yerelTarih(new Date()), $('not-kurum').value, $('not-kayit').value.trim(), metin, yazan]);
    $('not-metin').value = '';
    $('not-kayit').value = '';
    mesaj('not-durum', 'Not eklendi. İndirilen ana Excel\'e yazılacak.', 'iyi');
    notlariCiz();
    dugmeleriGuncelle();
  }

  /* ---------------- Ayarlar ---------------- */

  function kurumSatiri(ad, kelimeler) {
    return el('tr', null, [
      el('td', null, [el('input', { type: 'text', value: ad || '', sinif: 'k-ad', 'aria-label': 'Kurum adı', placeholder: 'Ör. Örnek Bankası' })]),
      el('td', null, [el('input', { type: 'text', value: kelimeler || '', sinif: 'k-kelime', 'aria-label': 'Alacaklı adında geçenler', placeholder: 'Ör. ÖRNEK BANK' })]),
      el('td', null, [el('button', { type: 'button', sinif: 'kaldir', metin: '×', 'aria-label': 'Kurumu sil', onclick: function (e) { e.currentTarget.closest('tr').remove(); } })])
    ]);
  }

  function esSatiri(gelen, hedef) {
    return el('tr', null, [
      el('td', null, [el('input', { type: 'text', value: gelen || '', sinif: 'e-gelen', 'aria-label': 'Gelen Excel\'deki sütun adı', placeholder: 'Ör. Haciz Tarihi' })]),
      el('td', null, [el('input', { type: 'text', value: hedef || '', sinif: 'e-hedef', list: 'sutun-listesi', 'aria-label': 'Tablodaki sütun', placeholder: 'Listeden seçin ya da yeni ad yazın' })]),
      el('td', null, [el('button', { type: 'button', sinif: 'kaldir', metin: '×', 'aria-label': 'Eşleştirmeyi sil', onclick: function (e) { e.currentTarget.closest('tr').remove(); } })])
    ]);
  }

  function ayarFormunuDoldur() {
    const kt = $('kurum-satirlari');
    kt.textContent = '';
    uyg.ayar.kurumlar.forEach(function (k) { kt.appendChild(kurumSatiri(k.ad, (k.kelimeler || []).join(', '))); });
    const et = $('es-satirlari');
    et.textContent = '';
    (uyg.ayar.esler || []).forEach(function (e) { et.appendChild(esSatiri(e.gelen, e.hedef)); });
    if (!uyg.ayar.esler || !uyg.ayar.esler.length) et.appendChild(esSatiri('', ''));
  }

  function ayarlariTopla() {
    const kurumlar = [], esler = [];
    $('kurum-satirlari').querySelectorAll('tr').forEach(function (tr) {
      const ad = tr.querySelector('.k-ad').value.trim();
      if (!ad) return;
      kurumlar.push({ ad: ad, kelimeler: tr.querySelector('.k-kelime').value.split(/[,;]/).map(function (w) { return w.trim(); }).filter(Boolean) });
    });
    $('es-satirlari').querySelectorAll('tr').forEach(function (tr) {
      const g = tr.querySelector('.e-gelen').value.trim(), h = tr.querySelector('.e-hedef').value.trim();
      if (g && h) esler.push({ gelen: g, hedef: h });
    });
    return { kurumlar: kurumlar, esler: esler };
  }

  function ayarlariUygula(yeni, metin) {
    uyg.ayar = yeni;
    ayarKaydet();
    gelenleriYenidenCozumle();
    uyg.sonuc = null;
    mesaj('indir-durum', '', '');
    ayarFormunuDoldur();
    ciz();
    mesaj('ayar-durum', metin, 'iyi');
  }

  function ayarlariKaydet() {
    const yeni = B.ayarDuz(ayarlariTopla());
    ayarlariUygula(yeni, 'Ayarlar kaydedildi.' + (uyg.gelenler.length ? ' Dosyalar yeni ayarlara göre yeniden incelendi; sonucu görmek için yeniden Birleştir\'e basın.' : ''));
  }

  /* ---------------- Başlangıç ---------------- */

  function baslat() {
    const liste = $('sutun-listesi');
    B.TABLO_SUTUNLARI.filter(function (c) { return B.META_SUTUNLARI.indexOf(c) === -1; }).forEach(function (c) { liste.appendChild(el('option', { value: c })); });
    birakmaAlani($('ana-birak'), $('ana-girdi'), anaYukle);
    birakmaAlani($('gelen-birak'), $('gelen-girdi'), gelenEkle);
    window.addEventListener('dragover', function (e) { e.preventDefault(); });
    window.addEventListener('drop', function (e) { e.preventDefault(); });
    $('birlestir-dugme').addEventListener('click', birlestirTikla);
    $('indir-dugme').addEventListener('click', indirTikla);
    $('yeni-baslat').addEventListener('click', function () {
      if ((uyg.gelenler.length || uyg.ana || uyg.yeniNotlar.length) && !window.confirm('Seçili dosyalar, sonuç ve bu oturumda eklenen notlar temizlensin mi? İndirdiğiniz Excel\'ler etkilenmez.')) return;
      uyg.ana = null; uyg.gelenler = []; uyg.sonuc = null; uyg.yeniNotlar = []; uyg.temel = B.bosDurum(uyg.ayar);
      ['ana-durum', 'gelen-durum', 'birlestir-durum', 'indir-durum', 'not-durum'].forEach(function (id) { mesaj(id, '', ''); });
      ciz();
    });
    $('not-ekle').addEventListener('click', notEkle);
    $('not-metin').addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) notEkle(); });
    $('not-yazan').value = depoOku(YAZAN_ANAHTARI) || '';
    $('kurum-ekle').addEventListener('click', function () { $('kurum-satirlari').appendChild(kurumSatiri('', '')); });
    $('es-ekle').addEventListener('click', function () { $('es-satirlari').appendChild(esSatiri('', '')); });
    $('ayar-kaydet').addEventListener('click', ayarlariKaydet);
    $('ayar-varsayilan').addEventListener('click', function () {
      if (!window.confirm('Kurum listesi ve sütun eşleştirmeleri varsayılana dönsün mü?')) return;
      ayarlariUygula(B.ayarDuz(B.VARSAYILAN_AYARLAR), 'Ayarlar varsayılana döndü.');
    });
    ayarFormunuDoldur();
    if (!uyg.ayar.kurumlar.length) $('ayarlar-bolum').open = true;
    ciz();
  }

  window.ExcelBirlestirmeArayuz = { uyg: uyg, anaYukle: anaYukle, gelenEkle: gelenEkle, birlestirTikla: birlestirTikla, ciktiOlustur: ciktiOlustur };
  baslat();
})();
