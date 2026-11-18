/*
 * Ekstre 89/1 Taraması: arayüz
 * Dosya içeriğindeki metinler sayfaya yalnızca textContent ile yazılır. Hiçbir dosya sunucuya gönderilmez.
 */
(function () {
  'use strict';

  const T = window.Tarama, X = window.Xlsx;
  const $ = id => document.getElementById(id);
  const uyg = { rapor: null, gecmis: null, pdfler: [], liste: null, sonuc: null, calisiyor: false };

  function el(etiket, ozellik, cocuklar) {
    const e = document.createElement(etiket);
    if (ozellik) Object.keys(ozellik).forEach(k => {
      const v = ozellik[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'sinif') e.className = v;
      else if (k === 'metin') e.textContent = v;
      else if (k.indexOf('on') === 0 && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k in e) e[k] = v;
      else e.setAttribute(k, v === true ? '' : v);
    });
    (cocuklar || []).forEach(c => { if (c === null || c === undefined || c === false) return; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  const iki = n => String(n).padStart(2, '0');
  const bugun = () => { const d = new Date(); return `${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}`; };
  const trTarih = s => s ? s.split('-').reverse().join('.') : '';
  const tl = x => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(x || 0) + ' TL';
  function mesaj(id, metin, tur) { const k = $(id); k.textContent = metin || ''; k.className = 'durum' + (tur ? ' ' + tur : ''); }
  const hataMetni = e => (e && e.message) ? e.message : String(e);
  const bekle = () => new Promise(r => setTimeout(r, 0));

  function indir(ad, bayt, tur) {
    const url = URL.createObjectURL(new Blob([bayt], { type: tur }));
    const a = el('a', { href: url, download: ad });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  const XLSX_TUR = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  function metinOku(bayt) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bayt); }
    catch (e) { try { return new TextDecoder('windows-1254').decode(bayt); } catch (e2) { return new TextDecoder().decode(bayt); } }
  }
  function tablo(basliklar, satirlar, sinif) {
    return el('div', { sinif: 'tablo-kap' }, [el('table', { sinif: sinif || null }, [
      el('thead', null, [el('tr', null, basliklar.map(b => el('th', { metin: b })))]),
      el('tbody', null, satirlar)
    ])]);
  }

  // ---------------- 1) Rapor ve geçmiş ----------------
  async function raporGecmisEkle(liste) {
    for (const d of liste) {
      try {
        const bayt = new Uint8Array(await d.arrayBuffer());
        if (/\.xlsx$/i.test(d.name)) {
          const rows = X.oku(bayt);
          uyg.rapor = { ad: d.name, rows, musteriler: T.musterileriKur(rows) };
        } else if (/\.csv$/i.test(d.name)) {
          const metin = metinOku(bayt); const bas = metin.replace(/^﻿/, '').split(/\r?\n/)[0] || '';
          if (/taramaTarihi/.test(bas)) uyg.gecmis = { ad: d.name, rows: T.gecmisOku(metin) };
          else if (/Müşteri No/.test(bas)) { const rows = T.csvOku(metin); uyg.rapor = { ad: d.name, rows, musteriler: T.musterileriKur(rows) }; }
          else throw new Error('CSV ne Genel Dosya Raporu ne de tarama geçmişi gibi görünüyor.');
        } else throw new Error('Yalnızca .xlsx (Genel Dosya Raporu) ve .csv (tarama geçmişi) dosyaları alınır.');
        mesaj('rapor-durum', '', '');
      } catch (e) { mesaj('rapor-durum', d.name + ': ' + hataMetni(e), 'hata'); }
    }
    listeyiKur();
  }

  function listeyiKur() {
    uyg.liste = null; uyg.sonuc = null;
    if (uyg.rapor) {
      const gun = Math.max(0, parseInt($('gun').value, 10) || 0);
      uyg.liste = T.kuyrukKur({ musteriler: uyg.rapor.musteriler, gecmis: uyg.gecmis ? uyg.gecmis.rows : [], tarih: bugun(), yenidenTaramaGun: gun, sadeceAcik: $('acik').checked });
    }
    ciz();
  }

  function raporuCiz() {
    const k = $('rapor-bilgi'); k.textContent = '';
    const r = uyg.rapor, g = uyg.gecmis;
    const satir = (etiket, deger, kaldir) => el('div', { sinif: 'secili' }, [el('strong', { metin: etiket + ': ' }), deger, kaldir ? el('button', { type: 'button', sinif: 'kaldir', metin: '×', 'aria-label': etiket + ' dosyasını kaldır', onclick: kaldir }) : null]);
    if (r) k.appendChild(satir('Genel Dosya Raporu', `${r.ad} — ${r.rows.length} satır, ${r.musteriler.length} borçlu`, () => { uyg.rapor = null; listeyiKur(); }));
    if (g) { const son = g.rows.map(x => x.taramaTarihi).sort().pop(); k.appendChild(satir('Tarama geçmişi', `${g.ad} — ${g.rows.length} kayıt, ${new Set(g.rows.map(x => x.musteriNo)).size} borçlu${son ? ', son tarama ' + trTarih(son) : ''}`, () => { uyg.gecmis = null; listeyiKur(); })); }
    const L = uyg.liste, kutu = $('liste'); kutu.textContent = '';
    if (!L) { if (g && !r) kutu.appendChild(el('p', { sinif: 'soluk', metin: 'Bu haftanın listesini çıkarmak için Genel Dosya Raporu\'nu da seçin.' })); return; }
    const nedenler = {}; for (const h of L.haric) { const n = h.neden.replace(/Son \d+ günde/, 'Son ' + $('gun').value + ' gün içinde'); nedenler[n] = (nedenler[n] || 0) + 1; }
    kutu.appendChild(el('p', null, [el('strong', { metin: `Bu haftanın listesi: ${L.kuyruk.length} borçlu` }), ` (toplam bakiye ${tl(L.kuyruk.reduce((s, x) => s + x.bakiye, 0))}).`,
      L.haric.length ? ` Listeye alınmayan ${L.haric.length} borçlu: ` + Object.entries(nedenler).map(([n, s]) => `${n.toLowerCase()} ${s}`).join(', ') + '.' : '']));
    if (!g) kutu.appendChild(el('p', { sinif: 'not', metin: 'Tarama geçmişi seçilmedi; rapordaki tüm borçlular listeye alındı. Önceki taramalarda üretilen tarama_gecmisi.csv dosyasını seçerseniz yakın zamanda taranan borçlular çıkarılır.' }));
    if (L.kuyruk.length) {
      const goster = L.kuyruk.slice(0, 40);
      kutu.appendChild(tablo(['Sıra', 'Borçlu', 'Müşteri No', 'Takip No', 'Takip bakiyesi'], goster.map(x => el('tr', null, [
        el('td', { metin: String(x.sira) }), el('td', { metin: x.unvan }), el('td', { metin: x.no }), el('td', { metin: x.takip }), el('td', { sinif: 'sayi', metin: tl(x.bakiye) })
      ]))));
      if (L.kuyruk.length > goster.length) kutu.appendChild(el('p', { sinif: 'soluk', metin: `İlk ${goster.length} borçlu gösteriliyor; tamamı Excel listesinde.` }));
    }
    kutu.appendChild(el('div', { sinif: 'dugmeler ust-bosluk' }, [
      el('button', { type: 'button', metin: 'Listeyi Excel olarak indir', onclick: async () => indir(`Bu Hafta Taranacaklar ${bugun()}.xlsx`, await X.yaz(T.listeSayfalari(L)), XLSX_TUR) })
    ]));
  }

  // ---------------- 2) PDF'ler ----------------
  function pdfEkle(liste) {
    let tekrar = 0, yanlis = 0;
    for (const d of liste) {
      if (!/\.pdf$/i.test(d.name)) { yanlis++; continue; }
      if (uyg.pdfler.some(x => x.ad === d.name && x.boyut === d.size)) { tekrar++; continue; }
      uyg.pdfler.push({ ad: d.name, boyut: d.size, dosya: d, no: T.pdfMusteriNo(d.name) });
    }
    uyg.pdfler.sort((a, b) => (a.ad < b.ad ? -1 : a.ad > b.ad ? 1 : 0));
    uyg.sonuc = null;
    const notlar = [];
    if (tekrar) notlar.push(tekrar + ' dosya zaten listedeydi');
    if (yanlis) notlar.push(yanlis + ' PDF olmayan dosya atlandı');
    mesaj('pdf-durum', notlar.join('; '), notlar.length ? 'bilgi' : '');
    ciz();
  }
  function pdfleriCiz() {
    const kutu = $('pdf-liste'); kutu.textContent = '';
    if (!uyg.pdfler.length) return;
    const gruplar = {}; let adsiz = 0;
    for (const p of uyg.pdfler) { if (!p.no) { adsiz++; continue; } (gruplar[p.no] ||= { no: p.no, ad: T.pdfUnvan(p.ad), adet: 0 }).adet++; }
    const kuyrukta = uyg.liste ? new Set(uyg.liste.kuyruk.map(k => k.no)) : null;
    const raporda = uyg.rapor ? new Set(uyg.rapor.musteriler.map(m => m.MusteriNo)) : null;
    const g = Object.values(gruplar);
    const disari = kuyrukta ? g.filter(x => !kuyrukta.has(x.no)).length : 0;
    kutu.appendChild(el('p', null, [el('strong', { metin: `${uyg.pdfler.length} PDF, ${g.length} borçlu` }),
      adsiz ? `; ${adsiz} dosyanın adında müşteri numarası yok (atlanacak)` : '',
      raporda ? `; raporda olmayan ${g.filter(x => !raporda.has(x.no)).length} borçlunun ekstresi atlanacak` : '',
      kuyrukta && disari ? `; ${disari} borçlu bu haftanın listesinde değil (yine de analiz edilir)` : '', '.']));
    const goster = g.slice(0, 40);
    kutu.appendChild(tablo(['Borçlu (dosya adından)', 'Müşteri No', 'PDF', 'Bu haftanın listesinde'], goster.map(x => el('tr', null, [
      el('td', { metin: x.ad }), el('td', { metin: x.no }), el('td', { sinif: 'sayi', metin: String(x.adet) }),
      el('td', { metin: kuyrukta ? (kuyrukta.has(x.no) ? 'Evet' : 'Hayır') : '—' })
    ]))));
    if (g.length > goster.length) kutu.appendChild(el('p', { sinif: 'soluk', metin: `İlk ${goster.length} borçlu gösteriliyor.` }));
  }

  // ---------------- 3) Analiz ----------------
  async function analizEt() {
    if (uyg.calisiyor) return;
    uyg.calisiyor = true; ciz();
    const ilerleme = $('ilerleme'); ilerleme.hidden = false; ilerleme.value = 0;
    try {
      const tarih = bugun();
      const musteriler = uyg.rapor ? uyg.rapor.musteriler.map(m => ({ ...m })) : [];
      const musMap = Object.fromEntries(musteriler.map(m => [m.MusteriNo, m]));
      let son = 0;
      const oku = await T.ekstreleriOku(uyg.pdfler.map(p => ({ ad: p.ad, veri: async () => new Uint8Array(await p.dosya.arrayBuffer()) })), musMap, !!uyg.rapor, async (i, n, ad) => {
        ilerleme.max = n; ilerleme.value = i;
        if (Date.now() - son > 120) { son = Date.now(); mesaj('analiz-durum', `PDF okunuyor: ${i + 1} / ${n} — ${ad}`, 'bilgi'); await bekle(); }
      });
      ilerleme.value = ilerleme.max;
      mesaj('analiz-durum', 'Hareketler analiz ediliyor…', 'bilgi'); await bekle();
      const tumMus = uyg.rapor ? musteriler : Object.values(musMap);
      const r = T.analiz89({ hareketler: oku.hareketler, ekstreler: oku.ekstreler, musteriler: tumMus, raporSatirlari: uyg.rapor ? uyg.rapor.rows : [], bugun: tarih });
      mesaj('analiz-durum', 'Excel hazırlanıyor…', 'bilgi'); await bekle();
      const xlsx = await X.yaz(r.sheets);
      // geçmiş ve liste durumu
      const raporAdi = `89-1 Analizi ${tarih}.xlsx`;
      const yeni = r.ozet.filter(o => o.ekstreSay > 0).map(o => ({ musteriNo: o.musteriNo, unvan: o.borclu, takipNolar: o.takip, taramaTarihi: tarih, durum: 'tarandı', ekstreSayisi: o.ekstreSay, oneri: o.oneri, puan: String(o.puan).replace('.', ','), rapor: raporAdi }));
      const gecmis = T.gecmisBirlestir(uyg.gecmis ? uyg.gecmis.rows : [], yeni);
      let listeXlsx = null;
      if (uyg.liste) {
        const durum = {}; const oz = Object.fromEntries(r.ozet.map(o => [o.musteriNo, o]));
        for (const k of uyg.liste.kuyruk) durum[k.no] = { ekstre: oz[k.no] ? oz[k.no].ekstreSay : 0, oneri: oz[k.no] ? oz[k.no].oneri : '' };
        listeXlsx = await X.yaz(T.listeSayfalari(uyg.liste, durum));
      }
      uyg.sonuc = { tarih, r, xlsx, raporAdi, gecmisCsv: new TextEncoder().encode(T.gecmisCsv(gecmis)), gecmisSay: gecmis.length, yeniSay: yeni.length, listeXlsx };
      mesaj('analiz-durum', '', '');
    } catch (e) {
      uyg.sonuc = null; mesaj('analiz-durum', 'Analiz yapılamadı: ' + hataMetni(e), 'hata');
    }
    ilerleme.hidden = true; uyg.calisiyor = false; ciz();
  }

  function sonucuCiz() {
    const kutu = $('sonuc'); kutu.textContent = '';
    const s = uyg.sonuc; if (!s) return;
    const st = s.r.stats;
    const turler = Object.entries(st.turler).slice(0, 8).map(([k, v]) => `${k}: ${v}`).join(' · ');
    const kart = el('div', { sinif: 'sonuc' }, [
      el('h3', { metin: `${st.borclu} borçlu analiz edildi` }),
      el('div', { sinif: 'rozetler' }, [
        el('span', { sinif: 'rozet a', metin: `A – Güçlü aday: ${st.A}` }), el('span', { sinif: 'rozet b', metin: `B – Olası: ${st.B}` }),
        el('span', { sinif: 'rozet c', metin: `C – Zayıf: ${st.C}` }), el('span', { sinif: 'rozet d', metin: `D – Tespit yok: ${st.D}` })
      ]),
      el('ul', null, [
        el('li', { metin: `${st.ekstre} PDF: ${st.okunan} okundu, ${st.mukerrer} mükerrer, ${st.okunamayan} okunamadı${st.atlanan ? ', ' + st.atlanan + ' atlandı' : ''}; ${st.hareket} hareket (10.000 TL ve üzeri).` }),
        turler ? el('li', { metin: 'Tespit türleri (borçlu sayısı): ' + turler }) : null
      ]),
      el('div', { sinif: 'dugmeler' }, [
        el('button', { type: 'button', sinif: 'ana-dugme', metin: 'Analiz Excel\'ini indir', onclick: () => indir(s.raporAdi, s.xlsx, XLSX_TUR) }),
        el('button', { type: 'button', metin: 'Güncel tarama geçmişini indir (.csv)', title: `${s.yeniSay} borçlu bugünün tarihiyle eklendi; toplam ${s.gecmisSay} kayıt`, onclick: () => indir('tarama_gecmisi.csv', s.gecmisCsv, 'text/csv') }),
        s.listeXlsx ? el('button', { type: 'button', metin: 'Haftalık listeyi durumuyla indir', onclick: () => indir(`Bu Hafta Taranacaklar ${s.tarih}.xlsx`, s.listeXlsx, XLSX_TUR) }) : null
      ]),
      el('p', { sinif: 'not', metin: 'Sonraki hafta indirdiğiniz tarama_gecmisi.csv dosyasını 1. adımda seçin; bugün taranan borçlular listeye alınmaz. Ekstrelerde yalnızca 10.000 TL ve üzeri hareketler bulunur. 89/1 göndermeden önce takibin kesinleştiğini UYAP\'tan ve ilgili hareketi Excel\'deki "Dikkat Çeken Hareketler" sayfasından kontrol edin; emekli aylığı (5510 s.K. m.93) haczedilemez.' })
    ]);
    const adaylar = s.r.ozet.filter(o => /^[AB]/.test(o.oneri));
    if (adaylar.length) {
      const goster = adaylar.slice(0, 60);
      kart.appendChild(el('h4', { metin: 'A ve B adayları' }));
      kart.appendChild(tablo(['Sıra', 'Öneri', 'Puan', 'Borçlu', 'Takip No', 'Bakiye', 'Ana muhatap'], goster.map(o => el('tr', { sinif: o.oneri[0] === 'A' ? 'sinif-a' : 'sinif-b' }, [
        el('td', { metin: String(o.sira) }), el('td', { metin: o.oneri[0] }), el('td', { sinif: 'sayi', metin: String(o.puan).replace('.', ',') }),
        el('td', { metin: o.borclu }), el('td', { metin: o.takip || '' }), el('td', { sinif: 'sayi', metin: o.borc ? tl(o.borc) : '' }), el('td', { metin: o.anaMuhatap })
      ])), 'kucuk'));
      if (adaylar.length > goster.length) kart.appendChild(el('p', { sinif: 'soluk', metin: `İlk ${goster.length} aday gösteriliyor; tamamı Excel'de.` }));
    }
    kutu.appendChild(kart);
  }

  function ciz() {
    raporuCiz(); pdfleriCiz(); sonucuCiz();
    $('analiz').disabled = uyg.calisiyor || !uyg.pdfler.length;
    $('temizle').disabled = uyg.calisiyor;
  }

  function birakmaAlani(alanId, girdiId, isle) {
    const alan = $(alanId), girdi = $(girdiId);
    ['dragenter', 'dragover'].forEach(t => alan.addEventListener(t, e => { e.preventDefault(); alan.classList.add('ustunde'); }));
    ['dragleave', 'drop'].forEach(t => alan.addEventListener(t, e => { e.preventDefault(); alan.classList.remove('ustunde'); }));
    alan.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files.length) isle(Array.from(e.dataTransfer.files)); });
    girdi.addEventListener('change', () => { const l = Array.from(girdi.files || []); girdi.value = ''; if (l.length) isle(l); });
  }

  function baslat() {
    birakmaAlani('rapor-birak', 'rapor-girdi', raporGecmisEkle);
    birakmaAlani('pdf-birak', 'pdf-girdi', pdfEkle);
    $('klasor-girdi').addEventListener('change', () => { const g = $('klasor-girdi'); const l = Array.from(g.files || []); g.value = ''; if (l.length) pdfEkle(l); });
    $('klasor-sec').addEventListener('click', () => $('klasor-girdi').click());
    window.addEventListener('dragover', e => e.preventDefault());
    window.addEventListener('drop', e => e.preventDefault());
    $('gun').addEventListener('change', listeyiKur);
    $('acik').addEventListener('change', listeyiKur);
    $('analiz').addEventListener('click', analizEt);
    $('temizle').addEventListener('click', () => {
      uyg.rapor = null; uyg.gecmis = null; uyg.pdfler = []; uyg.liste = null; uyg.sonuc = null;
      ['rapor-durum', 'pdf-durum', 'analiz-durum'].forEach(id => mesaj(id, '', ''));
      ciz();
    });
    ciz();
  }

  window.EkstreArayuz = { uyg, raporGecmisEkle, pdfEkle, analizEt };
  baslat();
})();
