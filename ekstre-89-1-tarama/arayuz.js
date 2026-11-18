/*
 * Ekstre 89/1 Taraması: arayüz
 * Dosya içeriğindeki metinler sayfaya yalnızca textContent ile yazılır. Hiçbir dosya sunucuya gönderilmez;
 * tarama geçmişi, son rapor ve indirme klasörü izni yalnızca bu tarayıcıda saklanır.
 */
(function () {
  'use strict';

  const T = window.Tarama, X = window.Xlsx;
  const $ = id => document.getElementById(id);
  const uyg = { rapor: null, odemePlani: null, gecmis: [], pdfler: [], liste: null, sonuc: null, calisiyor: false, eklentiIs: null, klasorAdi: '' };

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
  const XLSX_TUR = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  function indir(ad, bayt, tur) {
    const url = URL.createObjectURL(new Blob([bayt], { type: tur }));
    const a = el('a', { href: url, download: ad });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
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

  // ---------------- tarayıcı deposu ----------------
  const GECMIS_ANAHTAR = 'ekstre891.gecmis';
  function gecmisYukle() { try { const v = JSON.parse(localStorage.getItem(GECMIS_ANAHTAR) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function gecmisKaydet(rows) { uyg.gecmis = rows; try { localStorage.setItem(GECMIS_ANAHTAR, JSON.stringify(rows)); return true; } catch (e) { mesaj('rapor-durum', 'Tarama geçmişi tarayıcıya kaydedilemedi: ' + hataMetni(e) + '. Geçmişi yedekleyin.', 'hata'); return false; } }
  function db() {
    return new Promise((coz, red) => {
      if (!window.indexedDB) return red(new Error('IndexedDB yok'));
      const r = indexedDB.open('ekstre891', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => coz(r.result); r.onerror = () => red(r.error);
    });
  }
  async function kvAl(k) { try { const d = await db(); return await new Promise((coz, red) => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => coz(q.result); q.onerror = () => red(q.error); }); } catch (e) { return undefined; } }
  async function kvKoy(k, v) { try { const d = await db(); await new Promise((coz, red) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = coz; t.onerror = () => red(t.error); }); } catch (e) { /* yoksay */ } }
  const RAPOR_SUTUN = ['Takip Dosya No', 'Müşteri No', 'Müşteri Ünvan', 'Takip Dosya Tipi', 'Dosya Durum', 'İcra Durum', 'İcra Dairesi', 'İcra Dosya No', 'Bakiye', 'Uyap Borca İtiraz Tarihi', 'Uyap Dosya Açılış Tarihi', 'Uyap Dosya Durumu', 'Takip Türü'];
  const raporKisalt = rows => rows.map(r => { const o = {}; for (const k of RAPOR_SUTUN) if (k in r) o[k] = r[k]; return o; });
  const OP_SUTUN = ['Müşteri No', 'Takip Dosya İd', 'Ödeme Planı/İndirim Id', 'Ödeme Planı Durumu', 'Ödeme Planı Adı', 'Ödeme Planı Giriş Tarihi', 'Ödeme Planı İptal Tarihi', 'Ödeme Planı Taksit Sayısı', 'Ödeme Planı Tahsil Taksit Sayısı', 'Ödeme Planı Geciken Taksit Sayısı', 'Sorumluluk Tipi'];
  const opKisalt = rows => rows.map(r => { const o = {}; for (const k of OP_SUTUN) if (k in r) o[k] = r[k]; return o; });
  const OP_EN_FAZLA_GUN = 7;
  const gunOnce = t => t ? Math.round((Date.parse(bugun()) - Date.parse(t)) / 86400000) : 0;
  // ödeme planı haritası (yalnızca ayıklama açıkken)
  function opHaritasi() {
    if (!uyg.odemePlani || !$('odeme').checked) return null;
    const takip = uyg.rapor ? Object.fromEntries(uyg.rapor.musteriler.map(m => [m.MusteriNo, m.TakipNolar])) : {};
    return T.odemePlaniKur(uyg.odemePlani.rows, takip);
  }

  // ---------------- eklenti köprüsü ----------------
  const EK = { var: false, surum: '', bekleyen: {}, sayac: 0 };
  function eklentiIstek(tip, veri) {
    return new Promise((coz, red) => {
      const id = ++EK.sayac; EK.bekleyen[id] = { coz, red };
      window.postMessage({ kaynak: 'ekstre-89-1-sayfa', tip, veri, istekId: id }, location.origin);
      setTimeout(() => { if (EK.bekleyen[id]) { delete EK.bekleyen[id]; red(new Error('Eklenti yanıt vermedi')); } }, 20000);
    });
  }
  window.addEventListener('message', e => {
    if (e.source !== window || !e.data || e.data.kaynak !== 'ekstre-89-1-eklenti') return;
    const { tip, veri, istekId } = e.data;
    if (tip === 'hazir') { if (!EK.var) { EK.var = true; EK.surum = (veri && veri.surum) || ''; eklentiIstek('durum').then(c => { uyg.eklentiIs = c.is || null; eklentiCiz(); }, () => {}); eklentiCiz(); } }
    else if (tip === 'cevap') { const b = EK.bekleyen[istekId]; if (b) { delete EK.bekleyen[istekId]; (veri && veri.hata) ? b.red(new Error(veri.hata)) : b.coz(veri || {}); } }
    else if (tip === 'durum') { uyg.eklentiIs = (veri && veri.is) || null; eklentiCiz(); }
  });

  // ---------------- 1) Rapor ve geçmiş ----------------
  async function raporGecmisEkle(liste) {
    const notlar = [], hatalar = [];
    for (const d of liste) {
      try {
        const bayt = new Uint8Array(await d.arrayBuffer());
        if (/\.xlsx$/i.test(d.name)) {
          const rows = X.oku(bayt);
          if (T.odemePlaniRaporuMu(rows)) { await odemePlaniAyarla(d.name, rows); notlar.push(`${d.name}: Ödeme Planı Raporu alındı (${rows.length} kayıt).`); }
          else await raporAyarla(d.name, rows, true);
        }
        else if (/\.csv$/i.test(d.name)) {
          const metin = metinOku(bayt); const bas = metin.replace(/^﻿/, '').split(/\r?\n/)[0] || '';
          if (/taramaTarihi/.test(bas)) {
            const gelen = T.gecmisOku(metin); const once = uyg.gecmis.length;
            gecmisKaydet(T.gecmisBirlestir(uyg.gecmis, gelen));
            notlar.push(`${d.name}: ${gelen.length} kayıt tarama geçmişine eklendi (önce ${once}, şimdi ${uyg.gecmis.length}); bu dosyayı bir daha seçmeniz gerekmez.`);
          } else if (/Müşteri No/.test(bas)) await raporAyarla(d.name, T.csvOku(metin), true);
          else throw new Error('CSV ne Genel Dosya Raporu ne de tarama geçmişi gibi görünüyor.');
        } else throw new Error('Yalnızca .xlsx (Genel Dosya Raporu, Ödeme Planı Raporu) ve .csv (tarama geçmişi) dosyaları alınır.');
      } catch (e) { hatalar.push(d.name + ': ' + hataMetni(e)); }
    }
    mesaj('rapor-durum', [...hatalar, ...notlar].join(' '), hatalar.length ? 'hata' : notlar.length ? 'iyi' : '');
    listeyiKur();
  }
  async function raporAyarla(ad, rows, kaydet) {
    const kisa = raporKisalt(rows);
    uyg.rapor = { ad, rows: kisa, musteriler: T.musterileriKur(kisa), tarih: kaydet ? bugun() : (uyg.rapor && uyg.rapor.tarih) };
    if (kaydet) await kvKoy('rapor', { ad, rows: kisa, tarih: bugun() });
  }
  async function odemePlaniAyarla(ad, rows) {
    const kisa = opKisalt(rows);
    T.odemePlaniKur(kisa, {});   // biçim denetimi
    uyg.odemePlani = { ad, rows: kisa, tarih: bugun() };
    await kvKoy('odemePlani', uyg.odemePlani);
  }

  function listeyiKur() {
    uyg.liste = null; uyg.sonuc = null;
    if (uyg.rapor) {
      const gun = Math.max(0, parseInt($('gun').value, 10) || 0);
      let op = null;
      try { op = opHaritasi(); } catch (e) { mesaj('rapor-durum', 'Ödeme Planı Raporu okunamadı: ' + hataMetni(e), 'hata'); }
      uyg.liste = T.kuyrukKur({ musteriler: uyg.rapor.musteriler, gecmis: uyg.gecmis, tarih: bugun(), yenidenTaramaGun: gun, sadeceAcik: $('acik').checked, odemePlani: op });
    }
    ciz();
  }

  function raporuCiz() {
    const k = $('rapor-bilgi'); k.textContent = '';
    const r = uyg.rapor, g = uyg.gecmis;
    if (r) k.appendChild(el('div', { sinif: 'secili' }, [el('strong', { metin: 'Genel Dosya Raporu: ' }), `${r.ad} — ${r.rows.length} satır, ${r.musteriler.length} borçlu${r.tarih && r.tarih !== bugun() ? ' (' + trTarih(r.tarih) + ' tarihinde seçildi)' : ''}`,
      el('button', { type: 'button', sinif: 'kaldir', metin: '×', 'aria-label': 'Raporu kaldır', onclick: async () => { uyg.rapor = null; await kvKoy('rapor', null); listeyiKur(); } })]));
    const op = uyg.odemePlani;
    if (op) {
      let yururluk = '';
      try {
        const h = T.odemePlaniKur(op.rows, {}); const yur = Object.keys(h).filter(m => h[m].haric);
        yururluk = `, ${yur.length} borçluda yürürlükte plan` + (r ? ` (Genel Dosya Raporu'ndaki borçlulardan ${r.musteriler.filter(m => h[m.MusteriNo] && h[m.MusteriNo].haric).length})` : '');
      } catch (e) { /* listeyiKur hatayı gösterir */ }
      const yas = gunOnce(op.tarih);
      k.appendChild(el('div', { sinif: 'secili' }, [el('strong', { metin: 'Ödeme Planı Raporu: ' }), `${op.ad} — ${op.rows.length} kayıt${yururluk}${op.tarih && op.tarih !== bugun() ? ' (' + trTarih(op.tarih) + ' tarihinde seçildi)' : ''}`,
        el('button', { type: 'button', sinif: 'kaldir', metin: '×', 'aria-label': 'Ödeme Planı Raporunu kaldır', onclick: async () => { uyg.odemePlani = null; await kvKoy('odemePlani', null); listeyiKur(); } })]));
      if (yas > OP_EN_FAZLA_GUN) k.appendChild(el('p', { sinif: 'not', metin: `Ödeme Planı Raporu ${yas} gün önce seçildi; yeni planlar için Galle'den güncel raporu alıp buraya bırakın.` }));
    } else if (r) {
      k.appendChild(el('p', { sinif: 'not', metin: 'Ödeme Planı Raporu seçilmedi; yürürlükte ödeme planı olan borçlular listeden çıkarılmıyor. Galle › Kredi Takip Raporları › Ödeme Planı Raporu ekranında Dosya Durum "Açık", Kampanya Giriş Tarihi geniş bir aralık (ör. 01.01.2010 – bugün) seçip "Dosya İsteği Oluştur"a basın; Web Talep Listesi\'nden indirdiğiniz Odeme_Plani_…xlsx dosyasını buraya bırakın.' }));
    }
    const son = g.map(x => x.taramaTarihi).sort().pop();
    k.appendChild(el('div', { sinif: 'secili' }, [el('strong', { metin: 'Tarama geçmişi: ' }),
      g.length ? `bu tarayıcıda ${g.length} kayıt, ${new Set(g.map(x => x.musteriNo)).size} borçlu, son tarama ${trTarih(son)}` : 'bu tarayıcıda henüz kayıt yok',
      g.length ? el('button', { type: 'button', sinif: 'baglanti', metin: 'yedekle (.csv)', onclick: () => indir(`tarama_gecmisi ${bugun()}.csv`, new TextEncoder().encode(T.gecmisCsv(uyg.gecmis)), 'text/csv') }) : null]));
    const L = uyg.liste, kutu = $('liste'); kutu.textContent = '';
    if (!L) return;
    const nedenler = {}; for (const h of L.haric) { const n = h.neden.replace(/Son \d+ günde/, 'Son ' + $('gun').value + ' gün içinde'); nedenler[n] = (nedenler[n] || 0) + 1; }
    kutu.appendChild(el('p', null, [el('strong', { metin: `Bu haftanın listesi: ${L.kuyruk.length} borçlu` }), ` (toplam bakiye ${tl(L.kuyruk.reduce((s, x) => s + x.bakiye, 0))}).`,
      L.haric.length ? ` Listeye alınmayan ${L.haric.length} borçlu: ` + Object.entries(nedenler).map(([n, s]) => `${n.toLowerCase()} ${s}`).join(', ') + '.' : '']));
    if (!g.length) kutu.appendChild(el('p', { sinif: 'not', metin: 'Tarama geçmişi boş; rapordaki tüm borçlular listeye alındı. Önceki taramadan kalan tarama_gecmisi.csv dosyanız varsa bir kez yukarıya bırakın.' }));
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

  // ---------------- 2) Eklentiyle indirme ----------------
  function eklentiCiz() {
    const kutu = $('eklenti-kutu'); if (!kutu) return; kutu.textContent = '';
    if (!EK.var) {
      kutu.appendChild(el('p', { sinif: 'ipucu', metin: 'Ekstre İndirici eklentisi bu tarayıcıda bulunamadı. Eklenti kuruluysa listedeki borçluların ekstreleri buradan tek düğmeyle indirilir; kurulu değilse PDF\'leri aşağıdan elle seçebilirsiniz.' }));
      return;
    }
    const is = uyg.eklentiIs, L = uyg.liste;
    const kart = el('div', { sinif: 'eklenti' });
    kart.appendChild(el('p', { sinif: 'ipucu', metin: `Ekstre İndirici eklentisi hazır (sürüm ${EK.surum}). Listedeki borçlular banka ekranında sırayla açılır ve ekstreleri İndirilenler › Galle Ekstreler › ${bugun()} klasörüne iner. İndirme sırasında bankanın sekmesini kapatmayın; o sekmenin köşesindeki panelden de durdurabilirsiniz.` }));
    if (is) {
      const n = is.kuyruk.length, biten = Object.keys(is.sonuc).length;
      const say = d => Object.values(is.sonuc).filter(s => s.durum === d).length;
      const siradaki = is.kuyruk.find(x => !is.sonuc[x.no]);
      kart.appendChild(el('progress', { max: n, value: biten }));
      kart.appendChild(el('p', { sinif: 'durum-satiri', metin: `${trTarih(new Date(is.baslangic).toISOString().slice(0, 10))} başlatılan indirme: ${biten} / ${n} borçlu — indirilen ${say('indirildi')}, ekstresi yok ${say('ekstre_yok')}, eksik ${say('eksik')}, hata ${say('hata')}.` }));
      kart.appendChild(el('p', {
        sinif: 'durum-satiri ' + (is.durum === 'durdu' ? 'h' : is.durum === 'bitti' ? 'ok' : ''),
        metin: is.durum === 'calisiyor' ? (siradaki ? `Şimdi: #${siradaki.sira} ${siradaki.unvan} (takip ${siradaki.takip})` : 'Bitiriliyor…') : is.durum === 'durdu' ? 'Durdu: ' + (is.neden || '') : 'Bitti. Aşağıdan "Analiz et"e basın.'
      }));
      const sorunlu = is.kuyruk.filter(x => is.sonuc[x.no] && /hata|eksik/.test(is.sonuc[x.no].durum));
      if (sorunlu.length) kart.appendChild(el('details', null, [el('summary', { metin: `Sorunlu ${sorunlu.length} borçlu` }), el('ul', null, sorunlu.map(x => el('li', { metin: `#${x.sira} ${x.unvan} (${x.no}): ${is.sonuc[x.no].durum} — ${is.sonuc[x.no].not || ''}` })))]));
    }
    const calisiyor = is && is.durum === 'calisiyor';
    const limit = el('input', { type: 'number', id: 'limit', min: '1', placeholder: 'hepsi' }); limit.style.width = '80px';
    limit.value = uyg.limit || ''; limit.addEventListener('input', () => { uyg.limit = limit.value; });
    kart.appendChild(el('div', { sinif: 'dugmeler ust-bosluk' }, [
      el('button', { type: 'button', sinif: 'ana-dugme', metin: 'Galle\'den indir', disabled: calisiyor || !L || !L.kuyruk.length, onclick: indirmeyiBaslat }),
      el('label', { sinif: 'soluk' }, ['En fazla ', limit, ' borçlu']),
      calisiyor ? el('button', { type: 'button', metin: 'Durdur', onclick: () => eklentiIstek('durdur', { neden: 'Kullanıcı durdurdu' }).catch(e => mesaj('pdf-durum', hataMetni(e), 'hata')) }) : null,
      is && is.durum === 'durdu' ? el('button', { type: 'button', metin: 'Devam et', onclick: () => eklentiIstek('devam').catch(e => mesaj('pdf-durum', hataMetni(e), 'hata')) }) : null
    ]));
    if (!L) kart.appendChild(el('p', { sinif: 'soluk', metin: 'Önce 1. adımda Genel Dosya Raporu\'nu seçin.' }));
    kutu.appendChild(kart);
  }
  async function indirmeyiBaslat() {
    const L = uyg.liste; if (!L || !L.kuyruk.length) return;
    const n = parseInt(($('limit') || {}).value, 10);
    const kuyruk = (n > 0 ? L.kuyruk.slice(0, n) : L.kuyruk).map(k => ({ sira: k.sira, no: k.no, takip: k.takip, unvan: k.unvan }));
    try { await eklentiIstek('baslat', { kuyruk, klasor: 'Galle Ekstreler/' + bugun() }); mesaj('pdf-durum', `${kuyruk.length} borçlu için indirme başladı.`, 'bilgi'); }
    catch (e) { mesaj('pdf-durum', 'İndirme başlatılamadı: ' + hataMetni(e), 'hata'); }
  }

  // ---------------- 2b) PDF'ler (elle) ----------------
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

  // ---------------- 3) İndirme klasöründen okuma ----------------
  const klasorDestegi = () => typeof window.showDirectoryPicker === 'function';
  async function klasorSec() {
    const h = await window.showDirectoryPicker({ id: 'ekstre891', mode: 'read', startIn: 'downloads' });
    await kvKoy('klasor', h); uyg.klasorAdi = h.name; ciz(); return h;
  }
  async function klasordenPdfler() {
    let h = await kvAl('klasor');
    if (!h) h = await klasorSec();
    if ((await h.queryPermission({ mode: 'read' })) !== 'granted' && (await h.requestPermission({ mode: 'read' })) !== 'granted') throw new Error('İndirme klasörünü okuma izni verilmedi.');
    const hedef = ((uyg.eklentiIs && uyg.eklentiIs.klasor) || ('Galle Ekstreler/' + bugun())).split('/').pop();
    const alt = async (d, ad) => { try { return await d.getDirectoryHandle(ad); } catch (e) { return null; } };
    let dir = h.name === hedef ? h : await alt(h, hedef);
    if (!dir) { const g = await alt(h, 'Galle Ekstreler'); if (g) dir = await alt(g, hedef); }
    if (!dir) throw new Error(`Seçili klasörde (${h.name}) "${hedef}" klasörü yok. "İndirme klasörünü değiştir" ile İndirilenler › Galle Ekstreler klasörünü seçin ya da PDF'leri elle ekleyin.`);
    const dosyalar = [];
    for await (const [ad, e] of dir.entries()) if (e.kind === 'file' && /\.pdf$/i.test(ad)) dosyalar.push(await e.getFile());
    if (!dosyalar.length) throw new Error(`"${hedef}" klasöründe PDF yok.`);
    return dosyalar;
  }

  // ---------------- 3) Analiz ----------------
  async function analizEt() {
    if (uyg.calisiyor) return;
    try {
      if (!uyg.pdfler.length) {
        if (!klasorDestegi()) throw new Error('Bu tarayıcı klasör okumayı desteklemiyor; PDF\'leri 2. adımda elle seçin.');
        mesaj('analiz-durum', 'İndirme klasörü okunuyor…', 'bilgi');
        pdfEkle(await klasordenPdfler());
      }
    } catch (e) { if (e && e.name === 'AbortError') { mesaj('analiz-durum', '', ''); return; } mesaj('analiz-durum', hataMetni(e), 'hata'); return; }
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
      const op = opHaritasi();
      const r = T.analiz89({ hareketler: oku.hareketler, ekstreler: oku.ekstreler, musteriler: tumMus, raporSatirlari: uyg.rapor ? uyg.rapor.rows : [], bugun: tarih, odemePlani: op, odemePlaniAdi: op ? uyg.odemePlani.ad : '' });
      mesaj('analiz-durum', 'Excel hazırlanıyor…', 'bilgi'); await bekle();
      const xlsx = await X.yaz(r.sheets);
      const raporAdi = `89-1 Analizi ${tarih}.xlsx`;
      // geçmiş: ekstresi okunanlar "tarandı" (ödeme planı nedeniyle ayrılanlar dahil), eklentinin "ekstresi yok" dedikleri "ekstre yok"
      const tumOzet = [...r.ozet, ...(r.ozetPlanli || [])];
      const yeni = tumOzet.filter(o => o.ekstreSay > 0).map(o => ({ musteriNo: o.musteriNo, unvan: o.borclu, takipNolar: o.takip, taramaTarihi: tarih, durum: 'tarandı', ekstreSayisi: o.ekstreSay, oneri: o.oneri, puan: String(o.puan).replace('.', ','), rapor: raporAdi }));
      const is = uyg.eklentiIs;
      if (is) for (const k of is.kuyruk) { const s = is.sonuc[k.no]; if (s && s.durum === 'ekstre_yok' && !yeni.some(y => y.musteriNo === k.no)) yeni.push({ musteriNo: k.no, unvan: k.unvan, takipNolar: k.takip, taramaTarihi: tarih, durum: 'ekstre yok', ekstreSayisi: 0, oneri: '', puan: '', rapor: '' }); }
      const kaydedildi = gecmisKaydet(T.gecmisBirlestir(uyg.gecmis, yeni));
      let listeXlsx = null;
      if (uyg.liste) {
        const durum = {}; const oz = Object.fromEntries(tumOzet.map(o => [o.musteriNo, o]));
        for (const k of uyg.liste.kuyruk) durum[k.no] = { ekstre: oz[k.no] ? oz[k.no].ekstreSay : 0, oneri: oz[k.no] ? oz[k.no].oneri : '' };
        listeXlsx = await X.yaz(T.listeSayfalari(uyg.liste, durum));
      }
      uyg.sonuc = { tarih, r, xlsx, raporAdi, yeniSay: yeni.length, gecmisSay: uyg.gecmis.length, kaydedildi, listeXlsx };
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
      el('h3', { metin: `${st.borclu + (st.odemePlanli || 0)} borçlu analiz edildi` + (st.odemePlanli ? ` (${st.odemePlanli}'i ödeme planlı, ayrı sayfada)` : '') }),
      el('div', { sinif: 'rozetler' }, [
        el('span', { sinif: 'rozet a', metin: `A – Güçlü aday: ${st.A}` }), el('span', { sinif: 'rozet b', metin: `B – Olası: ${st.B}` }),
        el('span', { sinif: 'rozet c', metin: `C – Zayıf: ${st.C}` }), el('span', { sinif: 'rozet d', metin: `D – Tespit yok: ${st.D}` })
      ]),
      el('ul', null, [
        el('li', { metin: `${st.ekstre} PDF: ${st.okunan} okundu, ${st.mukerrer} mükerrer, ${st.okunamayan} okunamadı${st.atlanan ? ', ' + st.atlanan + ' atlandı' : ''}; ${st.hareket} hareket (10.000 TL ve üzeri).` }),
        turler ? el('li', { metin: 'Tespit türleri (borçlu sayısı): ' + turler }) : null,
        st.odemePlanli ? el('li', { metin: `Yürürlükte ödeme planı olan ${st.odemePlanli} borçlu adaylardan ayrıldı; Excel'de "Ödeme Planı Olanlar" sayfasında.` }) : null,
        el('li', { metin: s.kaydedildi ? `${s.yeniSay} borçlu bugünün tarihiyle tarama geçmişine kaydedildi (toplam ${s.gecmisSay} kayıt). Bu borçlular sonraki haftaların listesine alınmayacak.` : 'Tarama geçmişi tarayıcıya kaydedilemedi; aşağıdan yedeği indirin.' })
      ]),
      el('div', { sinif: 'dugmeler' }, [
        el('button', { type: 'button', sinif: 'ana-dugme', metin: 'Analiz Excel\'ini indir', onclick: () => indir(s.raporAdi, s.xlsx, XLSX_TUR) }),
        s.listeXlsx ? el('button', { type: 'button', metin: 'Haftalık listeyi durumuyla indir', onclick: () => indir(`Bu Hafta Taranacaklar ${s.tarih}.xlsx`, s.listeXlsx, XLSX_TUR) }) : null,
        el('button', { type: 'button', metin: 'Tarama geçmişini yedekle (.csv)', onclick: () => indir(`tarama_gecmisi ${s.tarih}.csv`, new TextEncoder().encode(T.gecmisCsv(uyg.gecmis)), 'text/csv') })
      ]),
      el('p', { sinif: 'not', metin: 'Ekstrelerde yalnızca 10.000 TL ve üzeri hareketler bulunur. 89/1 göndermeden önce takibin kesinleştiğini UYAP\'tan ve ilgili hareketi Excel\'deki "Dikkat Çeken Hareketler" sayfasından kontrol edin; emekli aylığı (5510 s.K. m.93) haczedilemez.' })
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
    raporuCiz(); eklentiCiz(); pdfleriCiz(); sonucuCiz();
    $('analiz').disabled = uyg.calisiyor || (!uyg.pdfler.length && !klasorDestegi());
    $('temizle').disabled = uyg.calisiyor;
    const kb = $('klasor-bilgi');
    kb.textContent = uyg.pdfler.length ? '' : (klasorDestegi() ? (uyg.klasorAdi ? `İndirme klasörü: ${uyg.klasorAdi}` : 'İndirme klasörü henüz seçilmedi.') : 'Bu tarayıcı klasör okumayı desteklemiyor; PDF\'leri elle seçin.');
    $('klasor-degistir').hidden = !klasorDestegi() || !uyg.klasorAdi;
  }

  function birakmaAlani(alanId, girdiId, isle) {
    const alan = $(alanId), girdi = $(girdiId);
    ['dragenter', 'dragover'].forEach(t => alan.addEventListener(t, e => { e.preventDefault(); alan.classList.add('ustunde'); }));
    ['dragleave', 'drop'].forEach(t => alan.addEventListener(t, e => { e.preventDefault(); alan.classList.remove('ustunde'); }));
    alan.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files.length) isle(Array.from(e.dataTransfer.files)); });
    girdi.addEventListener('change', () => { const l = Array.from(girdi.files || []); girdi.value = ''; if (l.length) isle(l); });
  }

  async function baslat() {
    birakmaAlani('rapor-birak', 'rapor-girdi', raporGecmisEkle);
    birakmaAlani('pdf-birak', 'pdf-girdi', pdfEkle);
    $('klasor-girdi').addEventListener('change', () => { const g = $('klasor-girdi'); const l = Array.from(g.files || []); g.value = ''; if (l.length) pdfEkle(l); });
    $('klasor-sec').addEventListener('click', () => $('klasor-girdi').click());
    window.addEventListener('dragover', e => e.preventDefault());
    window.addEventListener('drop', e => e.preventDefault());
    $('gun').addEventListener('change', listeyiKur);
    $('acik').addEventListener('change', listeyiKur);
    $('odeme').addEventListener('change', listeyiKur);
    $('analiz').addEventListener('click', analizEt);
    $('klasor-degistir').addEventListener('click', () => klasorSec().catch(e => { if (!e || e.name !== 'AbortError') mesaj('analiz-durum', hataMetni(e), 'hata'); }));
    $('temizle').addEventListener('click', () => {
      uyg.pdfler = []; uyg.sonuc = null;
      ['rapor-durum', 'pdf-durum', 'analiz-durum'].forEach(id => mesaj(id, '', ''));
      listeyiKur();
    });
    uyg.gecmis = gecmisYukle();
    const kayitli = await kvAl('rapor');
    if (kayitli && kayitli.rows && kayitli.rows.length) { try { uyg.rapor = { ad: kayitli.ad, rows: kayitli.rows, musteriler: T.musterileriKur(kayitli.rows), tarih: kayitli.tarih }; } catch (e) { uyg.rapor = null; } }
    const kop = await kvAl('odemePlani');
    if (kop && kop.rows && kop.rows.length) uyg.odemePlani = kop;
    const h = await kvAl('klasor'); if (h) uyg.klasorAdi = h.name;
    listeyiKur();
    window.postMessage({ kaynak: 'ekstre-89-1-sayfa', tip: 'merhaba' }, location.origin);
  }

  window.EkstreArayuz = { uyg, raporGecmisEkle, pdfEkle, analizEt, eklentiIstek };
  baslat();
})();
