/*
 * MERSİS Şirket Sorgulama testleri. test.html açılınca çalışır; sonuç sayfaya
 * ve sekme başlığına yazılır ("TEST 80/80").
 */
(async function () {
  'use strict';
  const M = window.Mersis, X = window.XlsxDuzen, O = window.MersisOrnekler;
  const cikti = [];
  let gecen = 0, kalan = 0;
  function eq(gelen, beklenen, ad) {
    const a = JSON.stringify(gelen), b = JSON.stringify(beklenen);
    if (a === b) { gecen++; cikti.push('ok    ' + ad); }
    else { kalan++; cikti.push('HATA  ' + ad + '\n        beklenen: ' + b + '\n        gelen:    ' + a); }
  }
  function ok(kosul, ad) { eq(!!kosul, true, ad); }
  function uyu(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function bekleKosul(fn, ad, ms) {
    const t0 = Date.now();
    while (Date.now() - t0 < (ms || 10000)) { const v = fn(); if (v) return v; await uyu(80); }
    throw new Error('Zaman aşımı: ' + ad);
  }
  function b64Bayt(s) { const b = atob(s); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function cerceve(src) {
    return new Promise(function (r) {
      const f = document.createElement('iframe');
      f.onload = function () { r(f); };
      f.src = src;
      document.body.appendChild(f);
    });
  }
  const yerel = ['localhost', '127.0.0.1'].includes(location.hostname);
  async function kaydet(ad, bayt) {
    if (!yerel) return;
    try { await fetch('/kaydet?ad=' + encodeURIComponent(ad), { method: 'POST', body: bayt }); } catch (e) { cikti.push('(kaydedilemedi: ' + e.message + ')'); }
  }

  try {
    /* 1) Vergi numarası */
    eq(['1234567808', '2233445516', '0123456789'].map(M.vknGecerli), [true, true, true], 'geçerli vergi numaraları tanınır');
    eq(['1234567800', '7788990060', '123', '12345678901', ''].map(M.vknGecerli), [false, false, false, false, false], 'geçersiz vergi numaraları reddedilir');
    eq(M.vknCoz('123456789'), '0123456789', 'Excel\'in attığı baştaki sıfır tamamlanır');
    eq(M.vknCoz(' 1234 567 808 '), '1234567808', 'boşluklar atılır');
    eq(M.vknCoz('7788990060'), '', 'kontrol hanesi tutmayan numara boş döner');

    /* 2) Başlık ve sütunlar */
    const baslik = ['Adı / Ünvanı', 'Müşteri Nosu', 'Borçlu Türü', 'SORUMLU', 'SONUÇ', 'Bakiye'];
    eq(M.sutunlariBul(baslik), { unvan: 0, vkn: 1, sorumlu: 3, sonuc: 4 }, 'büro listesinin başlıkları tanınır');
    eq(M.sutunlariBul(['Firma Ünvanı', 'Müşteri No', 'Vergi No', 'Sorumlu Avukat']), { unvan: 0, vkn: 2, sorumlu: 3, sonuc: -1 }, '"Vergi No", "Müşteri No"dan önce gelir');
    eq(M.baslikSatiriBul([['Rapor'], [], baslik, ['A', '1']]), 2, 'başlık satırı ilk satırda değilse bulunur');

    /* 3) Kurum türü ve benzerlik */
    eq(['GÜNEŞ YARDIMLAŞMA DERNEĞİ', 'ÖRNEK EĞİTİM DESTEKLEME DERNEGİ', 'ÖRNEK VAKFI', 'ÖRNEKKÖY BELEDİYESİ BAŞKANLIĞI', 'İL SAĞLIK MÜDÜRLÜĞÜ',
      'VAKIF KATILIM ANONİM ŞİRKETİ', 'ÖRNEK YAPI KOOPERATİFİ', 'DERNEK TURİZM LİMİTED ŞİRKETİ', 'ÖRNEK PARTİSİ MERKEZ İLÇE BAŞKANLIĞI', 'ÖRNEK BELEDİYE SPOR KULÜBÜ DERNEĞİ'].map(M.kurumTuru),
    ['dernek', 'dernek', 'vakif', 'kamu', 'kamu', '', '', '', 'parti', 'dernek'], 'dernek, vakıf, siyasi parti ve kamu kurumu tanınır; şirketler karışmaz');
    ok(M.benzerlik('ÖZGÜVEN NAKLİYAT İNŞAAT TAAH. GIDA TUR. SAN. TİC. LTD. ŞTİ.', 'ÖZGÜVEN NAKLİYAT İNŞAAT TAAHHÜT GIDA TURİZM SANAYİ TİCARET LİMİTED ŞİRKETİ') >= 0.8, 'kısaltmalı ünvan tam ünvana benzer sayılır');
    ok(M.benzerlik('BEREKET UN MAMÜLLERİSAN.VE TİC.LTD.ŞTİ.', 'BEREKET UN MAMULLERİ SANAYİ VE TİCARET LİMİTED ŞİRKETİ') >= 0.5, 'bitişik yazılmış kısaltma ünvanı farklı saydırmaz');
    ok(M.benzerlik('KARTAL EĞİTİM HİZMETLERİ VE DIŞ TİCARET ANONİM ŞİRKETİ', 'KARTAL LED DIŞ TİCARET ANONİM ŞİRKETİ') < 0.5, 'değişmiş ünvan farklı sayılır');
    ok(M.benzerlik('SULTANLAR TESKTİL GIDA LİMİTED ŞİRKETİ', 'SULTANLAR TEKSTİL GIDA LİMİTED ŞİRKETİ') === 1, 'tek harflik yazım hatası (yer değiştirme) eşleşir');
    ok(M.benzerlik('ÖRNEK İNŞAAT SAN VETİC.LTD.ŞTİ.', 'ÖRNEK İNŞAAT SANAYİ VE TİCARET LİMİTED ŞİRKETİ') === 1, '"VETİC" gibi bitişik kısaltma dolgu sayılır');
    ok(M.benzerlik('ÖRNEK KAĞIT LİMİTED ŞİRKETİ', 'ÖRNEK KAĞIT LİMİTED ŞİRKETİ') === 1 && M.benzerlik('ÖRNEK KAĞIT', 'BAŞKA KUMAŞ') === 0, 'aynı ünvan 1, ilgisiz ünvan 0');

    /* 4) SONUÇ metni */
    eq(M.sonucMetni({ sorgu: 'OK', durum: 'Aktif', konk: { yok: true }, n: 'A GIDA LTD ŞTİ', unvan: 'A GIDA LİMİTED ŞİRKETİ' }), 'Aktif', 'aktif ve kaydı yok: yalnız "Aktif"');
    const konk = { basliklar: O.KONK_BASLIK, satirlar: O.FIRMALAR[1].konk };
    eq(M.sonucMetni({ sorgu: 'OK', durum: 'Aktif', konk: konk }), 'Aktif – KONKORDATO/İFLAS: T.C. Ankara 2. Asliye Ticaret Mahkemesi, 10.01.2026, 2025/900 Esas, Kesin Konkordato Mühleti Verilmesi, 10.01.2027 (+1 kayıt daha)', 'konkordato kaydı özetlenir');
    ok(/^Mahkeme Adı: T\.C\. Ankara.*Konkordato Bitiş Tarihi: 10\.01\.2027 \| Mahkeme Adı/.test(M.konkTamMetin(konk)), 'konkordato ayrıntısı başlıklarla yazılır');
    eq(M.sonucMetni({ sorgu: 'OK', durum: 'Aktif', konk: { okunamadi: true } }), 'Aktif – Konkordato/iflas bilgisi okunamadı – MERSİS\'te elle bakın', 'okunamayan konkordato belirtilir');
    eq(M.sonucMetni({ sorgu: 'YOK', a: 'vkn' }), 'MERSİS\'te bu vergi numarasıyla kayıt bulunamadı', 'bulunamayan');
    eq(M.sonucMetni({ neden: 'dernek' }), 'Dernek – MERSİS\'te kaydı yok, sorgulanmadı', 'dernek notu');
    eq(M.sonucSinifi({ sorgu: 'OK', durum: 'Terkin Edilmiş' }), 'kirmizi', 'terkin kırmızı');
    eq(M.sonucSinifi({ sorgu: 'OK', durum: 'Aktif', konk: konk }), 'turuncu', 'konkordato turuncu');

    /* 5) Excel okuma */
    const ornek = b64Bayt(O.ORNEK_XLSX);
    const kitap = await X.kitapAc(ornek);
    eq(kitap.sayfalar.map(function (s) { return s.ad; }), ['Rapor', 'Liste'], 'sayfa adları okunur');
    const satirlar = X.sayfaOku(kitap, 'Liste');
    eq(satirlar[0], baslik, 'başlık satırı okunur');
    eq([satirlar[8][1], satirlar[1][5], satirlar[4][4]], ['123456789', '1500.5', 'eski not'], 'sayı ve metin hücreleri okunur');
    const sutunlar = M.sutunlariBul(satirlar[0]);
    eq(M.sorumlular(satirlar, 0, sutunlar.sorumlu), [{ ad: 'AYŞE YILMAZ', sayi: 10 }, { ad: 'MEHMET KAYA', sayi: 2 }], 'sorumlular sayılır');
    const liste = M.listeKur(satirlar, { baslikSatiri: 0, sutunlar: sutunlar, kisi: 'ayşe yılmaz' });
    eq(liste.ogeler.map(function (o) { return [o.r, o.a, o.v]; }), [[2, 'vkn', '1234567808'], [3, 'vkn', '2233445516'], [4, 'vkn', '3344556628'], [5, 'vkn', '4455667739'],
      [6, 'unvan', ''], [7, 'unvan', '7788990060'], [8, 'vkn', '8899001171'], [9, 'vkn', '0123456789']], 'liste kurulur; geçersiz ya da boş vergi no ünvanla aranır');
    eq(liste.atlanan.map(function (a) { return [a.r, a.neden]; }), [[10, 'dernek'], [11, 'kamu']], 'dernek ve belediye sorgulanmaz');
    const listeMetni = M.listeMetni(liste, 'AYŞE YILMAZ', 'ornek.xlsx');
    eq(JSON.parse(listeMetni).tur, 'mersis-liste', 'liste metni');

    /* 6) MERSİS Takip, MERSİS taklidi üzerinde */
    const f = await cerceve('mersis-taklit.html');
    const w = f.contentWindow, doc = w.document;
    w.localStorage.removeItem('mersisTakip.v1');
    w.eval('(' + window.MersisTakip.toString() + ')();');
    const pk = doc.getElementById('mersis-takip-panel').shadowRoot;
    const p = function (r) { return pk.querySelector('[data-r="' + r + '"]'); };
    const dugme = function (i) { return pk.querySelector('[data-i="' + i + '"]'); };
    const D = function () { return w.__mersisTakip.durum(); };
    ok(/Sorgu listesini yükleyin/.test(p('yon').textContent), 'liste yokken panel listeyi ister');
    ok(p('uyari').classList.contains('gizli'), 'Firma Sorgulama formu olan sayfada "yalnız MERSİS" uyarısı çıkmaz');
    p('listeMetin').value = listeMetni;
    dugme('yukle').click();
    const hazir = function (o) { return function () { return o.a === 'vkn' ? doc.getElementById('VergiNo').value === o.v : doc.getElementById('TamUnvan').value === o.n; }; };
    const ara = function (dogru) { doc.getElementById('Captcha').value = dogru === false ? '0' : String(w.__taklit.cevap()); doc.getElementById('form0').requestSubmit(); };
    await bekleKosul(hazir(liste.ogeler[0]), 'ilk şirket forma yazılır');
    ok(doc.activeElement === doc.getElementById('Captcha'), 'imleç güvenlik kodu kutusunda');
    ara(false);
    await bekleKosul(function () { return /Güvenlik kodu hatalı/.test(p('uyari').textContent); }, 'hatalı kod uyarısı');
    eq(D().sonuclar.length, 0, 'hatalı kodda sonuç yazılmaz, aynı şirkette kalınır');
    for (let i = 0; i < liste.ogeler.length; i++) {
      const o = liste.ogeler[i];
      await bekleKosul(hazir(o), 'satır ' + o.r + ' forma yazılır');
      if (o.r === 8) {
        w.__taklit.bosDon = true;
        ara();
        await bekleKosul(function () { return /boş sonuç/.test(p('uyari').textContent); }, 'boş sonuç uyarısı');
        eq(D().idx, i, 'boş sonuçta sıradaki şirkete geçilmez');
        w.__taklit.bosDon = false;
        await uyu(300);
      }
      ara();
      await bekleKosul(function () { return D().sonuclar.length === i + 1; }, 'satır ' + o.r + ' sonucu');
    }
    const s = {};
    D().sonuclar.forEach(function (x) { s[x.r] = x; });
    eq([s[2].sorgu, s[2].durum, s[2].konk], ['OK', 'Aktif', { yok: true }], 'aktif şirket ve konkordato yok');
    eq([s[3].mersis, s[3].konk.satirlar.length, s[3].konk.basliklar[0]], [O.FIRMALAR[1].mersis, 2, 'Mahkeme Adı'], 'şube atlanıp merkez alınır; konkordato tablosu okunur');
    ok(/2 kayıt çıktı/.test(s[3].mesaj), 'birden çok kayıt notu');
    eq([s[4].durum, s[4].ek], ['Terkin Edilmiş', 'Terkin Tarihi | 14-02-2024'], 'terkin ve ek alan (terkin tarihi) okunur');
    eq(s[5].durum, 'Tasfiye Halinde', 'tasfiye halinde okunur');
    eq([s[6].sorgu, s[6].adaylar.length], ['COKLU', 2], 'ünvanla aramada birden çok aday: elle kontrol');
    eq([s[7].sorgu, s[7].a, s[7].vergi], ['OK', 'unvan', 'ÖRNEK VERGİ DAİRESİ / 7788990066'], 'geçersiz vergi no ile ünvandan bulunur');
    eq(s[8].sorgu, 'YOK', 'kayıtsız şirket: bulunamadı');
    eq([s[9].sorgu, s[9].v, s[9].unvan], ['OK', '0123456789', 'SIFIRLI MAKİNE LİMİTED ŞİRKETİ'], 'baştaki sıfırı tamamlanan vergi no bulunur');
    eq([s[2].adres, s[2].tsm, s[2].kurulus, s[2].sicilNo], [O.FIRMALAR[0].adres, O.FIRMALAR[0].tsm, O.FIRMALAR[0].kurulus, O.FIRMALAR[0].sicil], 'adres, sicil müdürlüğü, kuruluş tarihi, sicil no');
    ok(/Tüm sorgular bitti/.test(p('yon').textContent), 'liste bitince panel söyler');
    eq(w.__taklit.sorgu, liste.ogeler.length + 1, 'her şirket için bir sorgu (+1 boş dönen)');

    /* Sonuçları kopyala (pano yoksa metin kutusu) */
    dugme('kopyala').click();
    await bekleKosul(function () { return /panoya kopyalandı/.test(p('yon').textContent) || !p('kopyaKutu').classList.contains('gizli'); }, 'kopyalama');
    const sonucMetni = w.__mersisTakip.sonucMetni();
    if (!p('kopyaKutu').classList.contains('gizli')) eq(p('kopyaMetin').value.length > 100, true, 'pano yoksa sonuç metin kutusunda gösterilir');
    const cozulen = M.sonucCoz(sonucMetni);
    eq([cozulen.kisi, cozulen.sonuclar.length], ['AYŞE YILMAZ', 8], 'sonuç metni çözülür');

    /* Kalıcılık: panel kapatılıp yer imi yeniden çalıştırılınca kaldığı yerden sürer */
    const liste2 = M.listeKur(satirlar, { baslikSatiri: 0, sutunlar: sutunlar, kisi: 'MEHMET KAYA' });
    dugme('listeDegistir').click();
    p('listeMetin').value = M.listeMetni(liste2, 'MEHMET KAYA', 'ornek.xlsx');
    dugme('yukle').click();
    await bekleKosul(hazir(liste2.ogeler[0]), 'ikinci liste yüklenir');
    ara();
    await bekleKosul(function () { return D().sonuclar.length === 1; }, 'ikinci listenin ilk sonucu');
    dugme('kapat').click();
    ok(!doc.getElementById('mersis-takip-panel'), 'panel kapanır');
    w.eval('(' + window.MersisTakip.toString() + ')();');
    const pk2 = doc.getElementById('mersis-takip-panel').shadowRoot;
    await bekleKosul(hazir(liste2.ogeler[1]), 'yeniden açılınca kaldığı şirketten sürer');
    ok(/önceden sorgulanmıştı/.test(pk2.querySelector('[data-r="uyari"]').textContent), 'kaldığı yer bildirilir');
    pk2.querySelector('[data-i="atla"]').click();
    await bekleKosul(function () { return w.__mersisTakip.durum().sonuclar.length === 2; }, 'atlama');
    const s2 = w.__mersisTakip.durum().sonuclar;
    eq([s2[0].unvan, s2[1].sorgu], ['BATI ENERJİ ANONİM ŞİRKETİ', 'ATLANDI'], 'ünvanı değişmiş şirket ve atlanan şirket');
    eq(M.sonucMetni(Object.assign({ n: liste2.ogeler[0].n }, s2[0])), 'Aktif – MERSİS\'teki ünvan: BATI ENERJİ ANONİM ŞİRKETİ', 'değişmiş ünvan SONUÇ\'ta belirtilir');
    w.localStorage.removeItem('mersisTakip.v1');
    f.remove();

    /* 7) Excel yazma */
    const es = M.sonuclariEsle(satirlar, sutunlar, cozulen.sonuclar.concat([{ r: 4, a: 'vkn', v: '9999999999', sorgu: 'OK' }]));
    eq([es.uygun.length, es.uyumsuz.length], [8, 1], 'satır ve vergi no tutmayan sonuç ayrılır');
    eq(M.sonuclariEsle(satirlar, sutunlar, [{ r: 2, a: 'vkn', v: '1234567808', n: '', sorgu: 'OK' }]).uygun[0].n, 'ÖRNEK GIDA SANAYİ VE TİCARET LİMİTED ŞİRKETİ', 'eşleşen sonuca listedeki ünvan Excel\'den yazılır');
    const kayit = es.uygun.concat(liste.atlanan).sort(function (a, b) { return a.r - b.r; });
    const RENK = { turuncu: 'FFFFCC99', kirmizi: 'FFFFC7CE', gri: 'FFD9D9D9', sari: 'FFFFF2CC' };
    const yeni = await X.kitapYaz(kitap, {
      sayfa: 'Liste',
      hucreler: kayit.map(function (k) { return { satir: k.r, sutun: 5, deger: M.sonucMetni(k), dolgu: RENK[M.sonucSinifi(k)] || null }; }),
      yeniSayfa: { ad: 'MERSİS AYŞE YILMAZ', satirlar: [M.DETAY_BASLIKLARI].concat(kayit.map(M.detaySatiri)), dolgular: [null].concat(kayit.map(function (k) { return RENK[M.sonucSinifi(k)] || null; })), genislikler: [7, 40] }
    });
    await kaydet('mersis-ornek-cikti.xlsx', yeni);
    const k2 = await X.kitapAc(yeni);
    eq(k2.sayfalar.map(function (x) { return x.ad; }), ['Rapor', 'Liste', 'MERSİS AYŞE YILMAZ'], 'yeni sayfa eklenir, öteki sayfalar yerinde');
    const ls = X.sayfaOku(k2, 'Liste');
    eq([ls[1][4], ls[2][4].slice(0, 30), ls[4][4], ls[9][4], ls[10][4]],
      ['Aktif', 'Aktif – KONKORDATO/İFLAS: T.C.', 'Tasfiye Halinde', 'Dernek – MERSİS\'te kaydı yok, sorgulanmadı', 'Kamu kurumu – MERSİS\'te kaydı yok, sorgulanmadı'], 'SONUÇ hücreleri yazılır, eski not üzerine yazılır');
    eq([ls[1][5], ls[8][1], ls[11][4], ls[12][4]], ['1500.5', '123456789', '', ''], 'öteki hücrelere ve öteki kişinin satırlarına dokunulmaz');
    const ds = X.sayfaOku(k2, 'MERSİS AYŞE YILMAZ');
    eq([ds.length, ds[0][0], ds[0][4], ds[2][14].slice(0, 12)], [11, 'Satır', 'SONUÇ', 'Mahkeme Adı:'], 'ayrıntı sayfası yazılır');
    const coz = new TextDecoder();
    const raporXml = coz.decode(k2.harita.get(k2.sayfalar[0].yol).veri);
    ok(/<f>SUM\(Liste!F2:F13\)<\/f>/.test(raporXml), 'öteki sayfadaki formül korunur');
    const eskiStil = coz.decode(kitap.harita.get(kitap.stilYolu).veri), yeniStil = coz.decode(k2.harita.get(k2.stilYolu).veri);
    const sayi = function (m, ad) { return parseInt((m.match(new RegExp('<' + ad + ' count="(\\d+)"')) || [])[1], 10); };
    ok(sayi(yeniStil, 'fills') > sayi(eskiStil, 'fills') && sayi(yeniStil, 'cellXfs') > sayi(eskiStil, 'cellXfs'), 'renkler için biçim eklenir');
    ok(/numFmt[^>]+formatCode="[^"]*₺/.test(yeniStil), 'para biçimi korunur');
    const ps = kitap.girisler.find(function (g) { return /sharedStrings/.test(g.ad); });
    eq(coz.decode(k2.harita.get(ps.ad).veri) === coz.decode(ps.veri), true, 'paylaşılan metinler dosyası değişmez');

    /* SONUÇ sütunu yoksa sona eklenir */
    const yeni2 = await X.kitapYaz(kitap, { sayfa: 'Liste', hucreler: [{ satir: 1, sutun: 7, deger: 'MERSİS SONUCU', stilKaynagi: { satir: 1, sutun: 6 } }, { satir: 3, sutun: 7, deger: 'Aktif', dolgu: 'FFFFCC99' }] });
    const ls2 = X.sayfaOku(await X.kitapAc(yeni2), 'Liste');
    eq([ls2[0][6], ls2[2][6], ls2[0][5]], ['MERSİS SONUCU', 'Aktif', 'Bakiye'], 'yeni sütun başlığı ve değeri yazılır');
    await kaydet('mersis-ornek-cikti-yeni-sutun.xlsx', yeni2);

    /* 8) Araç sayfası: Excel yükle, kişi seç, sonuç yapıştır, Excel üret */
    const a = await cerceve('../index.html');
    const aw = a.contentWindow, ad = aw.document, A = aw.MersisArayuz;
    const dt = new aw.DataTransfer();
    dt.items.add(new aw.File([ornek], 'ornek.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const girdi = ad.getElementById('girdi');
    girdi.files = dt.files;
    girdi.dispatchEvent(new aw.Event('change'));
    await bekleKosul(function () { return A.durum.kitap && ad.getElementById('sayfa').value === 'Liste'; }, 'araç dosyayı okur ve Liste sayfasını seçer');
    eq([ad.getElementById('s-unvan').value, ad.getElementById('s-vkn').value, ad.getElementById('s-sorumlu').value, ad.getElementById('s-sonuc').value], ['0', '1', '3', '4'], 'araçta sütunlar tanınır');
    const kisiSel = ad.getElementById('kisi');
    kisiSel.value = 'AYŞE YILMAZ'; kisiSel.dispatchEvent(new aw.Event('change'));
    ok(/8<\/b> şirket sorgulanacak/.test(ad.getElementById('liste-ozet').innerHTML), 'araçta liste özeti');
    ok(/^javascript:/.test(ad.getElementById('yerimi').getAttribute('href')), 'yer imi bağlantısı hazırlanır');
    const sk = ad.getElementById('sonuc-metin');
    sk.value = sonucMetni; sk.dispatchEvent(new aw.Event('input'));
    ok(!ad.getElementById('indir').disabled, 'sonuçlar okununca indirme düğmesi açılır');
    ok(/1<\/b> konkordato/.test(ad.getElementById('sonuc-ozet').innerHTML) && /1<\/b> terkin/.test(ad.getElementById('sonuc-ozet').innerHTML), 'sonuç özeti');
    const c = await A.excelOlustur();
    eq([c.dosyaAdi, c.sayi], ['ornek - MERSİS AYŞE YILMAZ.xlsx', 10], 'Excel adı ve yazılan satır sayısı');
    const ls3 = X.sayfaOku(await X.kitapAc(c.bayt), 'Liste');
    eq([ls3[3][4], ls3[5][4], ls3[6][4]], ['Terkin Edilmiş', 'Ünvanla aramada birden çok kayıt çıktı – elle kontrol edin', 'Aktif'], 'araçtan üretilen Excel\'de SONUÇ');
    await kaydet('mersis-arac-cikti.xlsx', c.bayt);
    a.remove();
  } catch (e) {
    kalan++;
    cikti.push('HATA  beklenmeyen hata: ' + (e && e.stack ? e.stack : e));
  }

  document.getElementById('sonuc').textContent = (kalan ? 'BAŞARISIZ' : 'TAMAM') + ' – ' + gecen + ' geçti, ' + kalan + ' kaldı\n\n' + cikti.join('\n');
  document.title = 'TEST ' + gecen + '/' + (gecen + kalan);
})();
