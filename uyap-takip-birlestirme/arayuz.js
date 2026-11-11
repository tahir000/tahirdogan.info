/*
 * VakıfBank Takip XML Birleştirme: arayüz
 * Dosya içeriğindeki metinler sayfaya yalnızca textContent ile yazılır.
 */
(function () {
  'use strict';

  const U = window.UyapBirlestirme, Z = window.ZipYazici;
  const $ = function (id) { return document.getElementById(id); };
  const uyg = { dosyalar: [], sayac: 0, sonuc: null };

  function el(etiket, ozellik, cocuklar) {
    const e = document.createElement(etiket);
    if (ozellik) {
      Object.keys(ozellik).forEach(function (k) {
        const v = ozellik[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'sinif') e.className = v;
        else if (k === 'metin') e.textContent = v;
        else if (k.indexOf('on') === 0 && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else if (k in e) e[k] = v;
        else e.setAttribute(k, v === true ? '' : v);
      });
    }
    (cocuklar || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  }

  function tutar(x) { return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x) + ' TL'; }
  function mesaj(id, metin, tur) { const k = $(id); k.textContent = metin || ''; k.className = 'durum' + (tur ? ' ' + tur : ''); }
  function hataMetni(e) { return (e && e.message) ? e.message : String(e); }

  function gecerliler() { return uyg.dosyalar.filter(function (d) { return d.kayit; }); }

  /* Birleştirme sırası ve yeni adlar (Masaüstündeki scriptle aynı kural) */
  function plan() {
    const sirali = U.sirala(gecerliler().map(function (d) { return d.kayit; }));
    const kisa = sirali.map(U.kisaAd);
    return { sirali: sirali, kisa: kisa, tekiller: U.benzersiz(kisa.map(function (k) { return k + '.xml'; })), birlesik: U.birlesikAd(kisa) };
  }

  async function ekle(liste) {
    mesaj('sec-durum', liste.length + ' dosya okunuyor...', 'bilgi');
    let tekrar = 0;
    for (const d of liste) {
      if (uyg.dosyalar.some(function (x) { return x.ad === d.name && x.boyut === d.size && x.tarih === d.lastModified; })) { tekrar++; continue; }
      const k = { id: ++uyg.sayac, ad: d.name, boyut: d.size, tarih: d.lastModified, kayit: null, hata: null };
      try {
        if (!/\.xml$/i.test(d.name)) throw new Error('XML dosyası değil.');
        const bayt = new Uint8Array(await d.arrayBuffer());
        const c = U.metneCevir(bayt);
        k.kayit = U.oku(c.metin, c.utf8);
        k.kayit.dosyaAdi = d.name;
        k.kayit.bayt = bayt;
      } catch (e) {
        k.hata = hataMetni(e);
      }
      uyg.dosyalar.push(k);
    }
    /* Python scriptindeki gibi önce dosya adına göre sırala; birleştirme sırası sonra borçluya göre */
    uyg.dosyalar.sort(function (a, b) { return a.ad < b.ad ? -1 : (a.ad > b.ad ? 1 : 0); });
    uyg.sonuc = null;
    mesaj('sec-durum', tekrar ? tekrar + ' dosya zaten listedeydi, yeniden eklenmedi.' : '', '');
    mesaj('birlestir-durum', '', '');
    ciz();
  }

  function kaldir(d) {
    uyg.dosyalar = uyg.dosyalar.filter(function (x) { return x !== d; });
    uyg.sonuc = null;
    mesaj('birlestir-durum', '', '');
    ciz();
  }

  function ciz() {
    listeyiCiz();
    sonucuCiz();
    $('birlestir').disabled = !gecerliler().length;
  }

  function listeyiCiz() {
    const kutu = $('liste');
    kutu.textContent = '';
    if (!uyg.dosyalar.length) return;
    const p = plan();
    const satirlar = [];
    p.sirali.forEach(function (k, i) {
      const d = uyg.dosyalar.find(function (x) { return x.kayit === k; });
      satirlar.push(el('tr', null, [
        el('td', { metin: String(i + 1) }),
        el('td', { metin: k.dosyaAdi }),
        el('td', { metin: k.borclular.join(', ') || '(bulunamadı)' }),
        el('td', { metin: k.alacaklilar.join(', ') }),
        el('td', { sinif: 'sayi', metin: String(k.takipSayisi) }),
        el('td', { sinif: 'sayi', metin: k.tutar ? tutar(k.tutar) : '' }),
        el('td', { sinif: 'yeni-ad', metin: p.tekiller[i] }),
        el('td', null, [el('button', { type: 'button', sinif: 'kaldir', metin: '×', 'aria-label': k.dosyaAdi + ' dosyasını listeden çıkar', onclick: function () { kaldir(d); } })])
      ]));
    });
    uyg.dosyalar.filter(function (d) { return d.hata; }).forEach(function (d) {
      satirlar.push(el('tr', { sinif: 'hatali' }, [
        el('td', { metin: '!' }),
        el('td', { metin: d.ad }),
        el('td', { colSpan: 5, metin: 'Birleştirmeye alınmadı: ' + d.hata }),
        el('td', null, [el('button', { type: 'button', sinif: 'kaldir', metin: '×', 'aria-label': d.ad + ' dosyasını listeden çıkar', onclick: function () { kaldir(d); } })])
      ]));
    });
    const basliklar = ['Sıra', 'Gelen dosya', 'Borçlu', 'Alacaklı', 'Takip', 'Alacak', 'Yeni adı', ''];
    kutu.appendChild(el('div', { sinif: 'tablo-kap' }, [el('table', null, [
      el('thead', null, [el('tr', null, basliklar.map(function (b) { return el('th', { metin: b }); }))]),
      el('tbody', null, satirlar)
    ])]));
    if (p.sirali.length) {
      const toplam = p.sirali.reduce(function (t, k) { return t + k.tutar; }, 0);
      kutu.appendChild(el('p', { sinif: 'soluk', metin: p.sirali.length + ' dosya, ' + p.sirali.reduce(function (t, k) { return t + k.takipSayisi; }, 0) + ' takip' + (toplam ? ', toplam ' + tutar(toplam) : '') + '. Birleşik dosyanın adı: ' + p.birlesik }));
    }
  }

  function birlestirTikla() {
    try {
      const p = plan();
      const r = U.birlestir(p.sirali);
      const d = U.dogrula(r.metin);
      uyg.sonuc = { metin: r.metin, degisen: r.degisen, dogrulama: d, plan: p, zaman: new Date() };
      mesaj('birlestir-durum', '', '');
    } catch (e) {
      uyg.sonuc = null;
      mesaj('birlestir-durum', 'Birleştirilemedi: ' + hataMetni(e), 'hata');
    }
    sonucuCiz();
  }

  function indir(ad, bayt, tur) {
    const url = URL.createObjectURL(new Blob([bayt], { type: tur }));
    const a = el('a', { href: url, download: ad });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  async function zipOlustur() {
    const s = uyg.sonuc, klasor = U.klasorAdi(s.zaman, s.plan.sirali.length);
    const kodla = new TextEncoder();
    const girisler = [[klasor + '/' + s.plan.birlesik, kodla.encode(s.metin)]];
    s.plan.sirali.forEach(function (k, i) { girisler.push([klasor + '/' + s.plan.tekiller[i], k.bayt]); });
    return { ad: klasor + '.zip', bayt: await Z.olustur(girisler) };
  }

  function sonucuCiz() {
    const kutu = $('sonuc');
    kutu.textContent = '';
    const s = uyg.sonuc;
    if (!s) return;
    const n = s.plan.sirali.length;
    const toplamTutar = s.plan.sirali.reduce(function (t, k) { return t + k.tutar; }, 0);
    const yenilenen = s.degisen.reduce(function (t, x) { return t + x; }, 0);
    const maddeler = [
      el('li', { metin: s.dogrulama.takip + ' takip tek dosyada' + (toplamTutar ? ', toplam alacak ' + tutar(toplamTutar) : '') + '.' }),
      el('li', { metin: 'Denetim: ' + s.dogrulama.id + ' iç kimliğin hepsi benzersiz, ' + s.dogrulama.ref + ' atfın hepsi kendi takibinde karşılık buluyor.' }),
      el('li', { metin: yenilenen ? 'Dosyalar arasında çakışan ' + yenilenen + ' iç kimlik yeniden numaralandı (' + s.plan.kisa.map(function (k, i) { return k + ': ' + s.degisen[i]; }).join(', ') + ').' : 'Çakışan iç kimlik yoktu.' })
    ];
    const kart = el('div', { sinif: 'sonuc' }, [
      el('h3', { metin: s.plan.birlesik }),
      el('ul', null, maddeler),
      el('div', { sinif: 'dugmeler' }, [
        el('button', { type: 'button', sinif: 'ana-dugme', metin: 'Toplu Takip XML\'ini indir', onclick: function () { indir(s.plan.birlesik, new TextEncoder().encode(s.metin), 'application/xml'); } }),
        el('button', {
          type: 'button', metin: 'Hepsini ZIP olarak indir',
          title: 'Birleşik dosya ve borçlu adıyla adlandırılmış dosyalar tek klasörde',
          onclick: async function (e) {
            const b = e.currentTarget;
            b.disabled = true;
            try { const z = await zipOlustur(); indir(z.ad, z.bayt, 'application/zip'); } catch (err) { mesaj('birlestir-durum', 'ZIP oluşturulamadı: ' + hataMetni(err), 'hata'); }
            b.disabled = false;
          }
        })
      ])
    ]);
    if (n > 1) {
      kart.appendChild(el('p', { sinif: 'soluk', metin: 'Borçlu adıyla adlandırılmış tek tek dosyalar:' }));
      kart.appendChild(el('ul', null, s.plan.sirali.map(function (k, i) {
        return el('li', null, [el('button', { type: 'button', sinif: 'baglanti', metin: s.plan.tekiller[i], onclick: function () { indir(s.plan.tekiller[i], k.bayt, 'application/xml'); } }), ' (gelen ad: ' + k.dosyaAdi + ')']);
      })));
    } else {
      kart.appendChild(el('p', { sinif: 'not', metin: 'Tek dosya seçildi; birleşik dosya o dosyanın aynısıdır. Birleştirmek için en az iki dosya seçin.' }));
    }
    kutu.appendChild(kart);
  }

  function baslat() {
    const alan = $('birak'), girdi = $('girdi');
    ['dragenter', 'dragover'].forEach(function (t) { alan.addEventListener(t, function (e) { e.preventDefault(); alan.classList.add('ustunde'); }); });
    ['dragleave', 'drop'].forEach(function (t) { alan.addEventListener(t, function (e) { e.preventDefault(); alan.classList.remove('ustunde'); }); });
    alan.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files.length) ekle(Array.from(e.dataTransfer.files)); });
    girdi.addEventListener('change', function () { const l = Array.from(girdi.files || []); girdi.value = ''; if (l.length) ekle(l); });
    window.addEventListener('dragover', function (e) { e.preventDefault(); });
    window.addEventListener('drop', function (e) { e.preventDefault(); });
    $('birlestir').addEventListener('click', birlestirTikla);
    $('temizle').addEventListener('click', function () {
      uyg.dosyalar = []; uyg.sonuc = null;
      ['sec-durum', 'birlestir-durum'].forEach(function (id) { mesaj(id, '', ''); });
      ciz();
    });
    ciz();
  }

  window.UyapArayuz = { uyg: uyg, ekle: ekle, birlestirTikla: birlestirTikla, zipOlustur: zipOlustur };
  baslat();
})();
