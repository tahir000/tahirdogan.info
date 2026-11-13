/*
 * Bilirkişi Raporuna Beyan: arayüz
 * Şablon ve rapor seçme, alan formu, denetim, önizleme, indirme.
 * Dosya içeriğindeki metinler sayfaya yalnızca textContent ile yazılır.
 */
(function () {
  'use strict';

  const O = window.BkOrtak, U = window.Udf, P = window.PdfMetin, R = window.RaporOku, S = window.Sablon;
  const SABLON_ANAHTARI = 'bilirkisiBeyan.sablonlar.v1';
  const HATIRLA_ANAHTARI = 'bilirkisiBeyan.hatirla';
  const TUR_ADI = { lehe: 'Lehe', aleyhe: 'Aleyhe', diger: 'Diğer' };
  const RAPOR_ALANI = {
    mahkeme: 'Mahkeme', esas: 'Esas no', davali: 'Davalı', kimlik: 'Kimlik no', plaka: 'Plaka',
    gecisBas: 'Geçişlerin başlangıcı', gecisSon: 'Geçişlerin bitişi', icraDaire: 'İcra dairesi', icraNo: 'İcra dosya no',
    araKarar: 'Ara karar', raporTarihi: 'Rapor tarihi'
  };
  const $ = function (id) { return document.getElementById(id); };

  const uyg = { sablonlar: [], aktif: null, alanlar: [], digerTarihler: [], degerler: {}, elle: new Set(), oneriler: {}, rapor: null, serbest: [], sayac: 0 };

  function depoOku(a) { try { return window.localStorage.getItem(a); } catch (e) { return null; } }
  function depoYaz(a, v) { try { if (v === null) window.localStorage.removeItem(a); else window.localStorage.setItem(a, v); } catch (e) { /* tarayıcı izin vermezse yalnız bu oturumda */ } }

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
  function mesaj(id, metin, tur) { const k = $(id); k.textContent = metin || ''; k.className = 'durum' + (tur ? ' ' + tur : ''); }
  function hataMetni(e) { return (e && e.message) ? e.message : String(e); }
  function aktifSablon() { return uyg.sablonlar.find(function (s) { return s.id === uyg.aktif; }) || null; }

  function b64(b) { let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); return btoa(s); }
  function b64Coz(s) { const x = atob(s), b = new Uint8Array(x.length); for (let i = 0; i < x.length; i++) b[i] = x.charCodeAt(i); return b; }

  function birakmaAlani(alan, girdi, isle) {
    ['dragenter', 'dragover'].forEach(function (t) { alan.addEventListener(t, function (e) { e.preventDefault(); alan.classList.add('ustunde'); }); });
    ['dragleave', 'drop'].forEach(function (t) { alan.addEventListener(t, function (e) { e.preventDefault(); alan.classList.remove('ustunde'); }); });
    alan.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) isle(Array.from(e.dataTransfer.files)); });
    girdi.addEventListener('change', function () { const l = Array.from(girdi.files || []); girdi.value = ''; if (l.length) isle(l); });
  }

  /* ---------------- Şablonlar ---------------- */

  function turTahmin(ad) {
    const k = O.katla(ad);
    if (/ALEYH/.test(k)) return 'aleyhe';
    if (/LEH/.test(k)) return 'lehe';
    return 'diger';
  }

  async function sablonKur(ad, bayt, tur) {
    const udf = await U.oku(bayt);
    const bulunan = S.alanlariBul(udf.metin);
    return { id: ++uyg.sayac, ad: ad, tur: tur || turTahmin(ad), bayt: bayt, udf: udf, bulunan: bulunan };
  }

  async function sablonEkle(dosyalar) {
    const hatalar = [];
    let eklenen = 0;
    for (const d of dosyalar) {
      try {
        const bayt = new Uint8Array(await d.arrayBuffer());
        if (uyg.sablonlar.some(function (s) { return s.ad === d.name && s.bayt.length === bayt.length; })) continue;
        const s = await sablonKur(d.name, bayt);
        if (!s.bulunan.alanlar.length) hatalar.push('"' + d.name + '": dosyaya özgü bilgi bulunamadı; yine de serbest değişiklikle kullanılabilir.');
        uyg.sablonlar.push(s);
        eklenen++;
        if (!uyg.aktif) sablonSec(s.id, false);
      } catch (e) {
        hatalar.push('"' + d.name + '": ' + hataMetni(e));
      }
    }
    mesaj('sablon-durum', hatalar.join(' '), hatalar.length ? (eklenen ? 'uyari' : 'hata') : '');
    sablonlariKaydet();
    ciz();
  }

  function sablonlariKaydet() {
    if (!$('hatirla').checked) { depoYaz(SABLON_ANAHTARI, null); return; }
    depoYaz(SABLON_ANAHTARI, JSON.stringify(uyg.sablonlar.map(function (s) { return { ad: s.ad, tur: s.tur, veri: b64(s.bayt) }; })));
  }

  /* Şablon değişince alanlar yeniden kurulur; elle girilen değerler aynı türdeki alana taşınır */
  function sablonSec(id, cizilsin) {
    const eskiElle = {};
    uyg.alanlar.forEach(function (a) {
      if (!uyg.elle.has(a.id)) return;
      const ayniTur = uyg.alanlar.filter(function (x) { return x.tur === a.tur; }).length;
      if (ayniTur === 1) eskiElle[a.tur] = uyg.degerler[a.id];
    });
    uyg.aktif = id;
    const s = aktifSablon();
    uyg.alanlar = s ? s.bulunan.alanlar : [];
    uyg.digerTarihler = s ? s.bulunan.digerTarihler : [];
    uyg.degerler = {};
    uyg.elle = new Set();
    uyg.alanlar.forEach(function (a) {
      uyg.degerler[a.id] = a.tur === 'dilekceTarihi' ? O.tarihBicimle(O.bugun(), a.eski) : a.eski;
      if (eskiElle[a.tur] !== undefined && uyg.alanlar.filter(function (x) { return x.tur === a.tur; }).length === 1) {
        uyg.degerler[a.id] = eskiElle[a.tur];
        uyg.elle.add(a.id);
      }
    });
    onerileriUygula();
    if (cizilsin !== false) ciz();
  }

  function onerileriUygula() {
    uyg.oneriler = uyg.rapor && uyg.rapor.sonuc ? S.oneriler(uyg.alanlar, uyg.rapor.sonuc) : {};
    Object.keys(uyg.oneriler).forEach(function (id) { if (!uyg.elle.has(id)) uyg.degerler[id] = uyg.oneriler[id]; });
  }

  function sablonListesiniCiz() {
    const kutu = $('sablon-liste');
    kutu.textContent = '';
    uyg.sablonlar.forEach(function (s) {
      const tur = el('select', { 'aria-label': s.ad + ' şablonunun türü', onchange: function (e) { s.tur = e.target.value; sablonlariKaydet(); raporuCiz(); } });
      Object.keys(TUR_ADI).forEach(function (k) { tur.appendChild(el('option', { value: k, metin: TUR_ADI[k] })); });
      tur.value = s.tur;
      kutu.appendChild(el('div', { sinif: 'sablon' + (s.id === uyg.aktif ? ' aktif' : '') }, [
        el('label', null, [
          el('input', { type: 'radio', name: 'sablon', checked: s.id === uyg.aktif, onchange: function () { sablonSec(s.id); } }),
          el('span', { metin: s.ad })
        ]),
        tur,
        el('span', { sinif: 'soluk kucuk', metin: s.bulunan.alanlar.length + ' alan bulundu' }),
        el('button', {
          type: 'button', sinif: 'kaldir', metin: '×', 'aria-label': s.ad + ' şablonunu listeden çıkar',
          onclick: function () {
            uyg.sablonlar = uyg.sablonlar.filter(function (x) { return x !== s; });
            if (uyg.aktif === s.id) sablonSec(uyg.sablonlar.length ? uyg.sablonlar[0].id : null, false);
            sablonlariKaydet();
            ciz();
          }
        })
      ]));
    });
  }

  /* ---------------- Rapor ---------------- */

  async function raporYukle(dosyalar) {
    const d = dosyalar[0];
    if (!d) return;
    mesaj('rapor-durum', '"' + d.name + '" okunuyor...', 'bilgi');
    try {
      const bayt = new Uint8Array(await d.arrayBuffer());
      let metin = '', sayfa = 0;
      if (bayt[0] === 0x25 && bayt[1] === 0x50) { const r = await P.metin(bayt); metin = r.metin; sayfa = r.sayfaSayisi; }
      else metin = (await U.oku(bayt)).metin;
      uyg.rapor = { ad: d.name, sayfa: sayfa, sonuc: R.coz(metin, d.name) };
      mesaj('rapor-durum', '', '');
    } catch (e) {
      uyg.rapor = null;
      mesaj('rapor-durum', 'Rapor okunamadı: ' + hataMetni(e), 'hata');
    }
    onerileriUygula();
    ciz();
  }

  function raporuCiz() {
    const kutu = $('rapor-sonuc');
    kutu.textContent = '';
    const rp = uyg.rapor;
    if (!rp) return;
    const r = rp.sonuc;
    kutu.appendChild(el('p', null, [el('strong', { metin: rp.ad }), el('span', { sinif: 'soluk', metin: rp.sayfa ? ' · ' + rp.sayfa + ' sayfa' : '' }),
      ' ', el('button', { type: 'button', sinif: 'ufak', metin: 'Raporu kaldır', onclick: function () { uyg.rapor = null; uyg.oneriler = {}; ciz(); } })]));
    if (!r.metinVar) {
      kutu.appendChild(el('p', { sinif: 'not', metin: 'Raporun metni okunamadı (taranmış PDF olabilir). Bilgileri 3. adımda elle girin.' }));
      return;
    }
    if (r.oneri) {
      const uygun = uyg.sablonlar.find(function (s) { return s.tur === r.oneri; });
      const aktif = aktifSablon();
      kutu.appendChild(el('div', { sinif: 'oneri-kutu ' + r.oneri }, [
        el('strong', { metin: 'Öneri: ' + (r.oneri === 'lehe' ? 'lehe' : 'aleyhe') + ' şablon. ' }),
        r.oneriNedeni + ' Karar sizin; raporun sonucunu okuyun.',
        uygun && (!aktif || aktif.tur !== r.oneri)
          ? el('div', { style: 'margin-top:6px' }, [el('button', { type: 'button', sinif: 'ufak', metin: '"' + uygun.ad + '" şablonunu kullan', onclick: function () { sablonSec(uygun.id); } })])
          : (!uygun && uyg.sablonlar.length ? el('div', { sinif: 'kucuk soluk', metin: 'Yüklü şablonlardan hiçbiri "' + TUR_ADI[r.oneri] + '" olarak işaretli değil.' }) : null)
      ]));
    }
    if (r.bulunanlar.length) {
      kutu.appendChild(el('div', { sinif: 'tablo-kap' }, [el('table', null, [
        el('thead', null, [el('tr', null, [el('th', { metin: 'Rapordan' }), el('th', { metin: 'Değer' }), el('th', { metin: 'Geçtiği yer' })])]),
        el('tbody', null, r.bulunanlar.map(function (b) {
          return el('tr', null, [el('td', { metin: RAPOR_ALANI[b.alan] || b.alan }), el('td', { metin: typeof b.deger === 'string' ? b.deger : '' }), el('td', { sinif: 'soluk', metin: b.kaynak === 'dosya adı' ? '(dosya adından)' : b.alinti })]);
        }))
      ])]));
    } else kutu.appendChild(el('p', { sinif: 'soluk', metin: 'Raporda tanınan bilgi bulunamadı.' }));
    if (r.plakalar.length > 1) kutu.appendChild(el('p', { sinif: 'not', metin: 'Raporda birden çok plaka var: ' + r.plakalar.join(', ') + '. Şablondaki plaka alanına en sık geçeni önerildi.' }));
    if (r.isaretler.length) {
      kutu.appendChild(el('h3', { metin: 'Raporda dikkat edilecekler', style: 'font-size:15px;margin:14px 0 0' }));
      kutu.appendChild(el('ul', { sinif: 'isaretler' }, r.isaretler.map(function (i) {
        return el('li', null, [i.aciklama, i.alinti ? el('span', { sinif: 'alinti', metin: '“' + i.alinti + '”' }) : null]);
      })));
    }
    if (r.tutarlar.length) {
      kutu.appendChild(el('p', { sinif: 'kucuk', style: 'margin:12px 0 0' }, [el('strong', { metin: 'Rapordaki tutarlar: ' }), r.tutarlar.map(function (t) { return t.etiket + ' ' + t.deger; }).join(' · ')]));
    }
    if (r.sonuc) {
      kutu.appendChild(el('details', { sinif: 'icerik' }, [el('summary', { metin: 'Raporun sonuç bölümü' }), el('div', { sinif: 'sonuc-metni', metin: r.sonuc })]));
    }
  }

  /* ---------------- Alanlar ---------------- */

  function alanDurumu(a) { return S.degistiMi(a, uyg.degerler[a.id]); }

  function alanKutusu(a) {
    const deger = uyg.degerler[a.id];
    const kimlik = 'alan-' + a.id;
    const rozet = el('span', { sinif: 'rozet' });
    function rozetGuncelle() {
      const d = alanDurumu(a);
      rozet.className = 'rozet ' + (d ? 'degisti' : 'ayni');
      rozet.textContent = d ? 'değişti' : 'şablondaki gibi';
    }
    const girdi = a.uzun
      ? el('textarea', { id: kimlik, rows: a.cokSatir ? 3 : 4, value: deger })
      : el('input', { type: 'text', id: kimlik, value: deger });
    girdi.addEventListener('input', function () {
      uyg.degerler[a.id] = girdi.value;
      uyg.elle.add(a.id);
      rozetGuncelle();
      oneriSatiri();
      kontrolPlanla();
    });
    const oneriKap = el('div');
    function oneriSatiri() {
      oneriKap.textContent = '';
      const o = uyg.oneriler[a.id];
      if (o && O.sade(o) !== O.sade(uyg.degerler[a.id])) {
        oneriKap.appendChild(el('div', { sinif: 'oneri' }, ['Rapordan: ' + o, el('button', {
          type: 'button', sinif: 'ufak', metin: 'Kullan',
          onclick: function () { uyg.degerler[a.id] = o; girdi.value = o; uyg.elle.add(a.id); rozetGuncelle(); oneriSatiri(); kontrolPlanla(); }
        })]));
      }
    }
    oneriSatiri();
    let cipler = null;
    if (a.tur === 'tutar' && uyg.rapor && uyg.rapor.sonuc.tutarlar.length) {
      const tl = uyg.rapor.sonuc.tutarlar, etiketli = tl.filter(function (t) { return t.etiket !== 'Tutar'; });
      cipler = el('div', { sinif: 'cipler' }, (etiketli.length ? etiketli : tl).map(function (t) {
        const v = t.deger.replace(/\s*TL$/, '');
        return el('button', {
          type: 'button', sinif: 'cip', metin: t.etiket + ': ' + t.deger, title: t.alinti,
          onclick: function () { uyg.degerler[a.id] = v; girdi.value = v; uyg.elle.add(a.id); rozetGuncelle(); kontrolPlanla(); }
        });
      }));
    }
    rozetGuncelle();
    return el('div', { sinif: 'alan' + (a.uzun ? ' genis' : '') }, [
      el('div', { sinif: 'alan-ust' }, [el('label', { 'for': kimlik, metin: a.etiket }), rozet]),
      el('p', { sinif: 'eski', metin: 'Şablonda: ' + a.eski.replace(/\n/g, ' / ') }),
      girdi, oneriKap, cipler
    ]);
  }

  function alanlariCiz() {
    const kutu = $('alanlar');
    kutu.textContent = '';
    if (!aktifSablon()) { kutu.appendChild(el('p', { sinif: 'soluk', metin: 'Önce şablon seçin.' })); return; }
    if (!uyg.alanlar.length) { kutu.appendChild(el('p', { sinif: 'not', metin: 'Bu şablonda dosyaya özgü bilgi bulunamadı. Değiştirilecek metinleri aşağıdaki "Başka bir metni değiştir" bölümünden girin.' })); return; }
    kutu.appendChild(el('div', { sinif: 'alanlar' }, uyg.alanlar.map(alanKutusu)));
    if (uyg.digerTarihler.length) {
      kutu.appendChild(el('p', { sinif: 'soluk kucuk', style: 'margin:12px 0 0', metin: 'Değiştirilmeyen tarihler (alıntı ya da içtihat): ' + uyg.digerTarihler.map(function (t) { return t.deger; }).join(', ') + '. Birini değiştirmek gerekirse "Başka bir metni değiştir" bölümünü kullanın.' }));
    }
  }

  function serbestCiz() {
    const g = $('serbest-satirlar');
    g.textContent = '';
    if (!uyg.serbest.length) uyg.serbest.push({ eski: '', yeni: '' });
    uyg.serbest.forEach(function (s, i) {
      g.appendChild(el('tr', null, [
        el('td', null, [el('input', { type: 'text', value: s.eski, 'aria-label': 'Şablondaki metin', oninput: function (e) { s.eski = e.target.value; kontrolPlanla(); } })]),
        el('td', null, [el('input', { type: 'text', value: s.yeni, 'aria-label': 'Yeni metin', oninput: function (e) { s.yeni = e.target.value; kontrolPlanla(); } })]),
        el('td', null, [el('button', { type: 'button', sinif: 'kaldir', metin: '×', 'aria-label': 'Satırı sil', onclick: function () { uyg.serbest.splice(i, 1); serbestCiz(); kontrolPlanla(); } })])
      ]));
    });
  }

  /* ---------------- Denetim, önizleme, indirme ---------------- */

  function hazirla() {
    const s = aktifSablon();
    if (!s) return null;
    const p = S.plan(s.udf.metin, uyg.alanlar, uyg.degerler, uyg.serbest);
    const u = U.uygula(s.udf, p.degisiklikler);
    return { sablon: s, plan: p, sonuc: u, uyarilar: S.denetim(u.metin, uyg.alanlar, uyg.degerler, uyg.rapor ? uyg.rapor.sonuc : null) };
  }

  let zamanlayici = null;
  function kontrolPlanla() {
    clearTimeout(zamanlayici);
    zamanlayici = setTimeout(kontrolCiz, 200);
  }

  let sonOnerilenAd = '';
  function kontrolCiz() {
    const kutu = $('kontrol'), on = $('onizleme');
    kutu.textContent = '';
    on.textContent = '';
    let h = null;
    try { h = hazirla(); } catch (e) { kutu.appendChild(el('p', { sinif: 'hata-metni', metin: 'Dilekçe hazırlanamadı: ' + hataMetni(e) })); }
    $('indir').disabled = !h || h.plan.hatalar.length > 0;
    if (!h) { on.hidden = true; return; }
    if (h.plan.hatalar.length) kutu.appendChild(el('ul', { sinif: 'uyarilar' }, h.plan.hatalar.map(function (x) { return el('li', { sinif: 'iz', metin: x }); })));
    const degisen = h.plan.degisiklikler.length;
    if (h.uyarilar.length) {
      kutu.appendChild(el('ul', { sinif: 'uyarilar' }, h.uyarilar.map(function (u) {
        return el('li', { sinif: u.tur }, [u.metin, u.alinti ? el('span', { sinif: 'alinti', metin: u.alinti }) : null]);
      })));
    } else if (!h.plan.hatalar.length) kutu.appendChild(el('p', { sinif: 'tamam', metin: 'Bütün alanlar değişti; eski dosyadan iz ve raporla uyumsuzluk bulunmadı.' }));
    kutu.appendChild(el('p', { sinif: 'soluk kucuk', style: 'margin:8px 0 0', metin: degisen + ' yerde değişiklik yapılacak.' }));
    /* Dosya adı: kullanıcı değiştirmediyse esas numarasına göre */
    const onerilen = S.dosyaAdi(uyg.alanlar, uyg.degerler);
    const ad = $('dosya-adi');
    if (!ad.value || ad.value === sonOnerilenAd) ad.value = onerilen;
    sonOnerilenAd = onerilen;
    /* Önizleme */
    const Y = h.sonuc.metin, ar = h.sonuc.araliklar;
    let p = 0;
    ar.forEach(function (r) {
      if (r[0] > p) on.appendChild(document.createTextNode(Y.slice(p, r[0])));
      on.appendChild(el('mark', { metin: Y.slice(r[0], r[1]) }));
      p = r[1];
    });
    on.appendChild(document.createTextNode(Y.slice(p)));
    on.hidden = false;
  }

  async function indir() {
    const d = $('indir');
    d.disabled = true;
    try {
      const h = hazirla();
      if (!h || h.plan.hatalar.length) throw new Error('Önce yukarıdaki hataları düzeltin.');
      const sorunlar = U.denetle(h.sonuc.xml);
      if (sorunlar.length) throw new Error('Üretilen dosya denetimden geçmedi: ' + sorunlar.join(' '));
      const bayt = await U.paketle(h.sonuc.xml);
      let ad = $('dosya-adi').value.replace(/[\\\/:*?"<>|\u0000-\u001F]+/g, ' ').replace(/\s+/g, ' ').trim() || 'BK Beyan.udf';
      if (!/\.udf$/i.test(ad)) ad += '.udf';
      const url = URL.createObjectURL(new Blob([bayt], { type: 'application/octet-stream' }));
      const a = el('a', { href: url, download: ad });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      mesaj('indir-durum', '"' + ad + '" indirildi. UYAP Doküman Editörü\'nde açıp okuyun, sonra imzalayın.', 'iyi');
    } catch (e) {
      mesaj('indir-durum', hataMetni(e), 'hata');
    }
    d.disabled = false;
  }

  function ciz() {
    sablonListesiniCiz();
    raporuCiz();
    alanlariCiz();
    kontrolCiz();
  }

  /* ---------------- Başlangıç ---------------- */

  async function baslat() {
    birakmaAlani($('sablon-birak'), $('sablon-girdi'), sablonEkle);
    birakmaAlani($('rapor-birak'), $('rapor-girdi'), raporYukle);
    window.addEventListener('dragover', function (e) { e.preventDefault(); });
    window.addEventListener('drop', function (e) { e.preventDefault(); });
    $('indir').addEventListener('click', indir);
    $('serbest-ekle').addEventListener('click', function () { uyg.serbest.push({ eski: '', yeni: '' }); serbestCiz(); });
    $('hatirla').checked = depoOku(HATIRLA_ANAHTARI) === '1';
    $('hatirla').addEventListener('change', function () {
      depoYaz(HATIRLA_ANAHTARI, $('hatirla').checked ? '1' : null);
      sablonlariKaydet();
      mesaj('sablon-durum', $('hatirla').checked ? 'Şablonlar bu tarayıcıda saklanacak.' : 'Saklanan şablonlar bu tarayıcıdan silindi.', 'iyi');
    });
    serbestCiz();
    if ($('hatirla').checked) {
      try {
        const l = JSON.parse(depoOku(SABLON_ANAHTARI) || '[]');
        for (const x of l) uyg.sablonlar.push(await sablonKur(x.ad, b64Coz(x.veri), x.tur));
        if (uyg.sablonlar.length) sablonSec(uyg.sablonlar[0].id, false);
      } catch (e) { mesaj('sablon-durum', 'Saklanan şablonlar okunamadı: ' + hataMetni(e), 'uyari'); }
    }
    ciz();
  }

  window.BkArayuz = { uyg: uyg, sablonEkle: sablonEkle, raporYukle: raporYukle, sablonSec: sablonSec, hazirla: hazirla };
  baslat();
})();
