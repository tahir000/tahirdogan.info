/* CV Tarama arayüzü. Dosyalardan gelen her metin textContent ile yazılır (CV'ler güvenilmeyen içeriktir). */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const P = globalThis.Puan, R = globalThis.Rapor;
  const MAKS = [20, 30, 25, 10, 15];
  const KRITER_AD = ['Eğitim', 'İlgili deneyim', 'Pozisyon uygunluğu', 'Yabancı dil', 'Teknik / yazılım'];

  function el(tag, ozellik, ...cocuk) {
    const e = document.createElement(tag);
    for (const k in ozellik || {}) {
      const v = ozellik[k]; if (v == null || v === false) continue;
      if (k === 'sinif') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'metin') e.textContent = v; else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of cocuk.flat(Infinity)) if (c != null) e.append(c instanceof Node ? c : String(c));
    return e;
  }
  const durum = (id, metin, tur) => { const d = $(id); d.textContent = metin || ''; d.className = 'durum' + (tur ? ' ' + tur : ''); };
  const boyut = n => n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

  let secilen = [];       // File nesneleri
  let sonuc = null;       // {adaylar, ekler, sayac, okunamayan}
  let aktif = P.KATLAR[0];
  let seciliAday = null;
  const nesneUrl = [];

  // ---------- dosya seçimi ----------
  function ekle(dosyalar) {
    const var_ = new Set(secilen.map(f => (f.webkitRelativePath || f.name) + f.size));
    for (const f of dosyalar) { if (f.name.startsWith('.')) continue; const k = (f.webkitRelativePath || f.name) + f.size; if (!var_.has(k)) { var_.add(k); secilen.push(f); } }
    const top = secilen.reduce((s, f) => s + f.size, 0);
    $('secim').textContent = secilen.length ? `${secilen.length} dosya seçildi (${boyut(top)})` : '';
    $('basla').disabled = !secilen.length;
  }
  $('girdi').addEventListener('change', e => { ekle(e.target.files); e.target.value = ''; });
  $('klasor-sec').addEventListener('click', () => $('klasor-girdi').click());
  $('klasor-girdi').addEventListener('change', e => { ekle(e.target.files); e.target.value = ''; });
  const birak = $('birak');
  ['dragenter', 'dragover'].forEach(t => birak.addEventListener(t, e => { e.preventDefault(); birak.classList.add('ustunde'); }));
  ['dragleave', 'drop'].forEach(t => birak.addEventListener(t, () => birak.classList.remove('ustunde')));
  birak.addEventListener('drop', e => { e.preventDefault(); ekle(e.dataTransfer.files); });

  $('temizle').addEventListener('click', () => {
    secilen = []; sonuc = null; seciliAday = null; nesneUrl.splice(0).forEach(u => URL.revokeObjectURL(u));
    $('secim').textContent = ''; $('basla').disabled = true; durum('durum', ''); durum('indir-durum', '');
    $('sonuc-bolum').hidden = true; $('indir-bolum').hidden = true; $('ilerleme').hidden = true;
  });

  // ---------- tarama ----------
  $('basla').addEventListener('click', async () => {
    const dugme = $('basla'); dugme.disabled = true; $('temizle').disabled = true;
    const ilerleme = $('ilerleme'); ilerleme.hidden = false; ilerleme.removeAttribute('value');
    try {
      durum('durum', 'Dosyalar okunuyor…', 'bilgi');
      const girdiler = [];
      for (const f of secilen) girdiler.push({ ad: f.name, yol: f.webkitRelativePath || f.name, veri: new Uint8Array(await f.arrayBuffer()) });
      // OCR motoru ilk görselde hazırlanır; hazırlanamazsa bir kez denenir, sonra kapalı kalır
      let ocr = null, ocrHatasi = '';
      if ($('ocr-ac').checked && globalThis.Ocr) {
        let hazir = false, bozuk = false;
        ocr = async g => {
          if (bozuk) throw new Error('OCR kapalı');
          if (!hazir) {
            durum('durum', 'OCR motoru hazırlanıyor (ilk seferde 13 MB iner)…', 'bilgi');
            try { await globalThis.Ocr.hazirla(); hazir = true; } catch (e) { bozuk = true; ocrHatasi = String(e && e.message || e); throw e; }
          }
          return globalThis.Ocr.oku(g);
        };
      }
      const t = await globalThis.Tarama.calistir(girdiler, (i, n, ad) => { ilerleme.max = n; ilerleme.value = i; durum('durum', `${i} / ${n} işlendi: ${ad}`, 'bilgi'); }, { ocr });
      if (globalThis.Ocr) globalThis.Ocr.kapat();
      durum('durum', 'Adaylar puanlanıyor…', 'bilgi');
      await new Promise(r => setTimeout(r, 0));
      const adaylar = P.adaylar(t.kayitlar);
      adaylar.forEach((o, i) => { o.id = i; o.ilk = { s: o.s.slice(), kat: o.kat, ad: o.ad, not: o.not }; });
      sonuc = { adaylar, ekler: t.ekler, sayac: t.sayac, okunamayan: t.okunamayan };
      aktif = P.KATLAR.find(k => adaylar.some(o => o.kat === k)) || P.KATLAR[0]; seciliAday = null;
      ilerleme.hidden = true;
      durum('durum', `Tamam: ${adaylar.length} tekil aday bulundu${t.sayac.ocr ? `, ${t.sayac.ocr} görsel ya da taranmış CV OCR ile okundu` : ''}.${ocrHatasi ? ' OCR çalışmadı: ' + ocrHatasi : ''}`, ocrHatasi ? 'hata' : 'iyi');
      goster();
      $('sonuc-bolum').hidden = false; $('indir-bolum').hidden = false;
      $('sonuc-bolum').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      console.error(e); ilerleme.hidden = true;
      durum('durum', 'Tarama yarıda kaldı: ' + (e && e.message ? e.message : e), 'hata');
    } finally { dugme.disabled = !secilen.length; $('temizle').disabled = false; }
  });

  // ---------- sonuç ----------
  function goster() { rozetler(); okunamayanlar(); sekmeler(); tablo(); ayrinti(); }

  function rozetler() {
    const s = sonuc.sayac, a = sonuc.adaylar;
    const r = (b, m) => el('span', { sinif: 'rozet' }, el('b', { metin: b }), ' ' + m);
    const kutu = $('rozetler'); kutu.replaceChildren(
      r(s.mail, `mail${s.mail !== s.tekilMail ? ` (${s.tekilMail} tekil)` : ''}`),
      ...(s.dogrudan ? [r(s.dogrudan, 'doğrudan dosya')] : []),
      r(s.ek, 'ek dosya'), r(a.length, 'tekil aday'),
      r(a.filter(o => o.toplam >= 75).length, 'öncelikli (75+)'),
      ...(s.ocr ? [r(s.ocr, 'OCR ile okunan')] : []),
      r(a.filter(o => o.toplam === 0).length, 'değerlendirilemedi'),
      r(a.filter(o => o.manuel).length, 'manuel incelendi'));
  }
  function okunamayanlar() {
    const l = sonuc.okunamayan; const kutu = $('okunamayan'); kutu.replaceChildren();
    if (!l.length) return;
    const ad = { gorsel: 'fotoğraf/görsel', sifreli: 'şifreli PDF', metinsiz: 'metin yok (taranmış olabilir)', hata: 'okunamadı', desteksiz: 'desteklenmeyen tür' };
    kutu.append(el('details', {}, el('summary', { metin: `Metni okunamayan ${l.length} dosya` }),
      el('p', { sinif: 'soluk', metin: 'Bu dosyalar adaylar arasında 0 puanla (CV değilse hiç) yer alır. Satıra tıklayıp dosyayı açın, elle puanlayın.' }),
      el('ul', { sinif: 'okunamayan' }, l.map(x => el('li', { metin: `${x.ad}: ${ad[x.durum] || x.durum}` })))));
  }
  function sekmeler() {
    const kutu = $('sekmeler'); kutu.replaceChildren();
    for (const k of P.KATLAR) {
      const n = sonuc.adaylar.filter(o => o.kat === k).length;
      kutu.append(el('button', { type: 'button', role: 'tab', 'aria-selected': String(k === aktif), onclick: () => { aktif = k; seciliAday = null; sekmeler(); tablo(); ayrinti(); } }, `${k} (${n})`));
    }
  }
  function tablo() {
    const l = R.sirala(sonuc.adaylar.filter(o => o.kat === aktif));
    const th = (m, s) => el('th', { sinif: s, metin: m });
    const bas = el('tr', {}, th('Sıra'), th('Ad Soyad'), th('Toplam', 's'), th('Eğt', 's'), th('Den', 's'), th('Poz', 's'), th('Dil', 's'), th('Tek', 's'), th('Değerlendirme'), th('Tür'), th('Not'), th('CV'));
    const govde = el('tbody');
    l.forEach((o, i) => {
      const bant = o.toplam >= 75 ? 'b75' : o.toplam >= 65 ? 'b65' : o.toplam === 0 ? 'b0' : '';
      const tr = el('tr', { sinif: 'satir' + (seciliAday === o.id ? ' secili' : ''), tabindex: '0', onclick: () => sec(o.id), onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sec(o.id); } } },
        el('td', { sinif: 's', metin: i + 1 }),
        el('td', {}, o.ad, o.oncelik ? el('div', {}, el('span', { sinif: 'etiket onc', metin: 'Öncelik: ' + o.oncelik })) : null),
        el('td', { sinif: 'top ' + bant, metin: o.toplam }),
        ...o.s.map(v => el('td', { sinif: 's', metin: v })),
        el('td', { metin: P.bant(o.toplam) }),
        el('td', {}, el('span', { sinif: 'etiket ' + (o.manuel ? 'man' : 'oto'), metin: o.manuel ? 'Manuel' : 'Otomatik' })),
        el('td', { sinif: 'not-hucre', metin: o.not }),
        el('td', { sinif: 'not-hucre', metin: o.dosya }));
      govde.append(tr);
    });
    $('tablo').replaceChildren(l.length ? el('table', {}, el('thead', {}, bas), govde) : el('p', { sinif: 'soluk', style: 'padding:12px', metin: 'Bu kategoride aday yok.' }));
  }
  function sec(id) { seciliAday = id; tablo(); ayrinti(); $('ayrinti').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }

  function cvAc(o) {
    const ek = o.ekKimligi && sonuc.ekler.get(o.ekKimligi); if (!ek) return;
    const uz = (ek.ad.match(/\.[^.]+$/) || [''])[0].toLowerCase();
    const tur = { '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.txt': 'text/plain' }[uz] || 'application/octet-stream';
    const url = URL.createObjectURL(new Blob([ek.veri], { type: tur })); nesneUrl.push(url);
    const a = el('a', { href: url, target: '_blank', rel: 'noopener' }); if (tur === 'application/octet-stream') a.setAttribute('download', ek.ad);
    document.body.append(a); a.click(); a.remove();
  }

  function ayrinti() {
    const kutu = $('ayrinti'); kutu.replaceChildren();
    const o = sonuc && seciliAday != null ? sonuc.adaylar[seciliAday] : null; if (!o) return;
    const ad = el('input', { type: 'text', value: o.ad });
    const kat = el('select', {}, P.KATLAR.map(k => { const op = el('option', { value: k, metin: k }); if (k === o.kat) op.selected = true; return op; }));
    const puan = o.s.map((v, i) => el('input', { type: 'number', min: '0', max: String(MAKS[i]), step: '1', value: String(v), 'aria-label': KRITER_AD[i] }));
    const toplamYazi = el('strong', { metin: o.toplam });
    const guncelle = () => { toplamYazi.textContent = puan.reduce((s, x) => s + (+x.value || 0), 0); };
    puan.forEach(x => x.addEventListener('input', guncelle));
    const not = el('textarea', {}); not.value = o.not || '';
    const oncelik = el('input', { type: 'text', value: o.oncelik || '', placeholder: 'ör. Ofis içi referans, öncelikli görüşme' });
    const uyari = el('div');

    const kaydet = () => {
      const yeni = puan.map((x, i) => Math.max(0, Math.min(MAKS[i], Math.round(+x.value || 0))));
      const puanDegisti = yeni.some((v, i) => v !== o.s[i]);
      if (puanDegisti && (!not.value.trim() || not.value.trim() === o.ilk.not)) {
        uyari.replaceChildren(el('p', { sinif: 'uyari hata', metin: 'Puanı değiştirdiyseniz neyi neden değiştirdiğinizi Not alanına yazın; tabloyu okuyan diğer kişiler bunu görür.' }));
        not.focus(); return;
      }
      o.s = yeni; o.toplam = yeni.reduce((a, b) => a + b, 0);
      o.ad = ad.value.trim() || o.ad; o.kat = kat.value; o.not = not.value.trim(); o.oncelik = oncelik.value.trim();
      o.manuel = true;
      if (o.kat !== aktif) aktif = o.kat;
      goster(); durum('indir-durum', `${o.ad} kaydedildi.`, 'iyi');
    };
    const geriAl = () => {
      o.s = o.ilk.s.slice(); o.toplam = o.s.reduce((a, b) => a + b, 0); o.kat = o.ilk.kat; o.ad = o.ilk.ad; o.not = o.ilk.not; o.manuel = false; o.oncelik = '';
      aktif = o.kat; goster();
    };

    const ek = o.ekKimligi && sonuc.ekler.get(o.ekKimligi);
    let onizleme;
    if (ek && globalThis.Belge.GORSEL.test(ek.ad) && /\.(jpe?g|png|gif|webp)$/i.test(ek.ad)) {
      const url = URL.createObjectURL(new Blob([ek.veri], { type: /\.png$/i.test(ek.ad) ? 'image/png' : 'image/jpeg' })); nesneUrl.push(url);
      onizleme = el('div', {}, el('img', { src: url, alt: 'CV görseli: ' + ek.ad, sinif: 'cv-gorsel' }),
        o.metin ? el('pre', { sinif: 'cv-metin', style: 'margin-top:8px', metin: 'OCR ile okunan metin:\n\n' + o.metin.slice(0, 12000) }) : null);
    } else {
      onizleme = el('pre', { sinif: 'cv-metin', metin: (o.metin || '').slice(0, 12000) || '(metin yok)' });
    }

    kutu.append(el('div', { sinif: 'ayrinti' },
      el('h3', { metin: `${o.ad} (${o.kat}, ${o.toplam} puan)` }),
      el('div', { sinif: 'izgara' },
        el('div', {},
          el('label', { sinif: 'alan' }, 'Ad soyad', ad),
          el('label', { sinif: 'alan' }, 'Kategori', kat),
          el('div', { sinif: 'puanlar' }, KRITER_AD.map((k, i) => [el('label', { metin: `${k} (en çok ${MAKS[i]})` }), puan[i]]), el('span', { metin: 'Toplam' }), toplamYazi),
          el('label', { sinif: 'alan' }, 'Not (puanı değiştirirseniz gerekçe)', not),
          el('label', { sinif: 'alan' }, 'Öncelik (dolu olursa listenin başına alınır, sebebi görünür)', oncelik),
          el('p', { sinif: 'soluk', style: 'font-size:13px;margin:0 0 8px' }, [o.eposta, o.telefon].filter(Boolean).join(' · ') || 'İletişim bilgisi bulunamadı', el('br'), 'Konu: ' + (o.konu || '-'), el('br'), 'Dosya: ' + o.dosya),
          el('div', { sinif: 'dugmeler' },
            el('button', { type: 'button', sinif: 'ana-dugme', onclick: kaydet, metin: 'Kaydet (manuel inceleme)' }),
            ek ? el('button', { type: 'button', onclick: () => cvAc(o), metin: 'CV dosyasını aç' }) : null,
            o.manuel ? el('button', { type: 'button', onclick: geriAl, metin: 'Otomatik puana dön' }) : null,
            el('button', { type: 'button', onclick: () => { seciliAday = null; tablo(); ayrinti(); }, metin: 'Kapat' })),
          uyari),
        el('div', {}, el('p', { sinif: 'soluk', style: 'margin:0 0 6px;font-size:13px', metin: 'CV metni (dosyadan okunan)' }), onizleme))));
  }

  // ---------- Excel ----------
  // Rapor başlığı bu tarayıcıda hatırlanır (kişisel veri değil)
  try { $('baslik').value = localStorage.getItem('cv-tarama-baslik') || ''; } catch (e) { /* depolama kapalı */ }
  $('baslik').addEventListener('change', () => { try { localStorage.setItem('cv-tarama-baslik', $('baslik').value.trim()); } catch (e) { /* depolama kapalı */ } });
  $('indir').addEventListener('click', async () => {
    if (!sonuc) return;
    try {
      durum('indir-durum', 'Excel hazırlanıyor…', 'bilgi');
      const veri = await R.excel(sonuc.adaylar, { sayac: sonuc.sayac, baslik: $('baslik').value.trim() });
      const g = new Date(); const ad = `CV_Degerlendirme_${g.getFullYear()}-${String(g.getMonth() + 1).padStart(2, '0')}-${String(g.getDate()).padStart(2, '0')}.xlsx`;
      const url = URL.createObjectURL(new Blob([veri], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = el('a', { href: url, download: ad }); document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      durum('indir-durum', `${ad} indirildi.`, 'iyi');
    } catch (e) { console.error(e); durum('indir-durum', 'Excel yazılamadı: ' + (e && e.message ? e.message : e), 'hata'); }
  });
})();
