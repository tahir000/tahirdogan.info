/*
 * CV Tarama testleri. test.html açılınca çalışır; sonuç sayfaya ve sekme başlığına yazılır ("TEST 40/40").
 * Örnekler uydurmadır (ornekler.js). Node ile de çalışır.
 */
(async function () {
  'use strict';
  const G = globalThis, P = G.Puan, X = G.CvOrnekler;
  const cikti = []; let gecen = 0, kalan = 0;
  function eq(gelen, beklenen, ad) {
    const a = JSON.stringify(gelen), b = JSON.stringify(beklenen);
    if (a === b) { gecen++; cikti.push('ok    ' + ad); }
    else { kalan++; cikti.push('HATA  ' + ad + '\n        beklenen: ' + b + '\n        gelen:    ' + a); }
  }
  const ok = (k, ad) => eq(!!k, true, ad);
  const td = new TextDecoder();

  try {
    /* 1) Metin çıkarma */
    const o = await X.basvurular();
    const avMetin = G.PdfMetin.metin(o.avPdf);
    ok(avMetin.split('\n')[0] === 'Deniz Örnek', 'harf harf yerleştirilmiş PDF satırı sözcük aralığıyla okunur');
    ok(/deniz\.ornek@ornek\.test 0532 111 22 33/.test(avMetin), 'harf harf satırda boşluklar doğru');
    ok(/icra takip, dilekçe, duruşma/.test(avMetin), 'TJ içindeki aralıklar boşluğa döner');
    ok(/Örnek Üniversitesi Hukuk Fakültesi/.test(avMetin), 'form XObject ve nesne akışındaki yazı tipi okunur');
    eq(G.Belge.metin('a.docx', o.stj).durum, 'tamam', 'DOCX okunur');
    ok(/4\. sınıf öğrencisiyim/.test(G.Belge.metin('a.docx', o.stj).metin), 'DOCX paragrafları gelir');
    ok(/Tablo \| Hücre/.test(G.Belge.metin('a.docx', o.stj).metin), 'DOCX tablo hücreleri ayrılır');
    eq(G.Belge.metin('x.jpeg', new Uint8Array(2000)).durum, 'gorsel', 'görsel CV okunamaz olarak işaretlenir');
    eq(G.Belge.metin('x.pdf', new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< >>\nendobj\ntrailer << /Root 1 0 R /Encrypt 5 0 R >>')).durum, 'sifreli', 'şifreli PDF tanınır');

    // Taranmış PDF: sayfadaki büyük görüntü OCR için çıkarılır (sıkıştırmasız, gri, 600x500)
    const gor = (() => { const w = 600, h = 500, n = w * h; const bas = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceGray /BitsPerComponent 8 /Length ${n} >>\nstream\n`;
      const son = '\nendstream\nendobj\n5 0 obj\n<< /Length 30 >>\nstream\nq 600 0 0 500 0 0 cm /Im1 Do Q\nendstream\nendobj\ntrailer << /Root 1 0 R >>\n';
      const a = new TextEncoder().encode(bas), b = new Uint8Array(n).fill(200), c = new TextEncoder().encode(son); return G.Zip.birlestir([a, b, c]); })();
    eq(G.PdfMetin.goruntuler(gor).map(g => [g.tur, g.w, g.h, g.kanal, g.veri.length]), [['ham', 600, 500, 1, 300000]], 'taranmış PDF\'ten sayfa görüntüsü çıkarılır');
    eq(G.PdfMetin.goruntuler(o.avPdf), [], 'metinli PDF\'te OCR görüntüsü yok');

    /* 2) E-posta */
    const m = G.Eml.oku(o.dosyalar[0].veri);
    eq(m.konu, 'Fwd: Avukat ilanı başvurusu', 'RFC 2047 konu çözülür');
    eq(m.icMailler.map(x => x.kimden), ['"Deniz Örnek" <deniz.ornek@ornek.test>'], 'iletilen mailin göndereni bulunur');
    eq(m.ekler.map(e => e.ad), ['Deniz Örnek CV.pdf'], 'iletilen mailin içindeki ek RFC 2231 adıyla çıkarılır');
    eq(m.ekler[0].veri.length, o.avPdf.length, 'ek base64 ile bayt bayt aynı açılır');
    ok(/Bilginize\./.test(m.govde) && /CV'm ektedir/.test(m.govde), 'quoted-printable gövdeler birleşir');
    eq(G.Eml.oku(new TextEncoder().encode('Content-Type: multipart/mixed; boundary="b"\r\n\r\n--b\r\nContent-Type: application/octet-stream; name="x.docx"\r\nContent-Disposition: attachment;\r\n filename*=UTF-8\'\'Ay%C5%9Fe%20%C3%96zge%C3%A7mi%C5%9F.docx\r\nContent-Transfer-Encoding: base64\r\n\r\nQUJD\r\n--b--\r\n')).ekler[0].ad, 'Ayşe Özgeçmiş.docx', 'RFC 2231 dosya adında ş ve Ö birlikte');
    eq(G.Eml.baslikCoz('=?iso-8859-9?Q?=DE=FCkr=FC_=C7elik?= <a@b.test>'), 'Şükrü Çelik <a@b.test>', 'ISO-8859-9 başlık');

    /* 3) Tarama */
    const t = await G.Tarama.calistir(o.dosyalar);
    eq([t.sayac.mail, t.sayac.tekilMail, t.sayac.dogrudan], [6, 5, 1], 'zip içindeki mailler sayılır, aynı mail bir kez işlenir');
    eq(t.sayac.ek, 5, 'ekler: PDF, DOCX, görsel, fatura ve doğrudan PDF');
    eq(t.okunamayan.map(x => x.ad + ':' + x.durum), ['IMG_0001.jpeg:gorsel', 'fatura.pdf:metinsiz'], 'okunamayanlar: görsel ve metni çok kısa fatura');

    // OCR verilince görsel CV okunur (OCR yerine sahte okuyucu)
    const sahteOcr = async g => g.tur === 'dosya' ? 'Görsel Aday\ngorsel.aday@ornek.test\nAçık Öğretim Lisesi\n2016 - 2024 Örnek Hukuk Bürosu sekreter, evrak arşiv ve dosyalama\nGörevler: randevu takibi, yazışmalar, telefon karşılama\nExcel MS Office' : '';
    const t2 = await G.Tarama.calistir(o.dosyalar, null, { ocr: sahteOcr });
    eq([t2.sayac.ocr, t2.okunamayan.map(x => x.durum)], [1, ['metinsiz']], 'OCR ile görsel CV okunur, okunamayan yalnız fatura');
    const g2 = P.adaylar(t2.kayitlar).find(x => x.dosya === 'IMG_0001.jpeg') || {};
    ok(g2.toplam > 0 && /OCR ile okundu/.test(g2.not), 'OCR ile okunan CV puanlanır ve notla işaretlenir');
    eq(P.bestName('KİŞİSEL\nİsim — Aytuğ Deneme\n', '', ''), 'Aytuğ Deneme', 'uzun çizgili "İsim —" alanı (OCR)');
    eq(P.bestName('NA po t AYSUN ÖRNEK\nSekreter', 'aysunornek@x.test', ''), 'Aysun Örnek', 'satır içindeki ad e-postayla eşleşince alınır');

    /* 4) Puanlama */
    const a = P.adaylar(t.kayitlar);
    const bul = ad => a.find(x => x.ad === ad) || {};
    eq(a.length, 5, 'fatura aday sayılmaz: 5 aday');
    const av = bul('Deniz Örnek');
    eq(av.kat, 'Avukat', 'ruhsatlı hukukçu avukat');
    eq(av.eposta, 'deniz.ornek@ornek.test', 'e-posta CV\'den');
    eq(av.telefon, '0532 111 22 33', 'telefon CV\'den');
    eq(av.s, [16, 26, 25, 5, 10], 'avukat alt puanları (eğitim, deneyim, uygunluk, dil, teknik)');
    eq(P.bant(av.toplam), 'Öncelikli', '82 puan öncelikli bant');
    const st = bul('Ayşe Taslak');
    eq(st.kat, 'Stajyer', 'hukuk öğrencisi stajyer');
    ok(st.toplam > 0 && st.toplam < av.toplam, 'stajyer puanı avukattan düşük');
    const cc = bul('Mehmet Deneme');
    eq(cc.kat, 'Callcenter', 'klasör adı ve içerik: callcenter');
    eq(cc.s[1], 15, 'sektör dışı 6 yıl deneyim yüzde 30 düşer (22 -> 15)');
    const gr = a.find(x => x.dosya === 'IMG_0001.jpeg') || {};
    eq([gr.toplam, gr.ad], [0, 'Görsel Aday'], 'görsel CV 0 puan, ad iç maildeki göndericiden');
    ok(/Görsel CV/.test(gr.not), 'görsel CV notu');
    const of = bul('Selin Yazı');
    eq([of.kat, of.dosya], ['Ofis elemanı', '(ek yok, mail metni)'], 'eksiz ama uzun mail metni aday olur (ofis)');
    ok(of.toplam > 0, 'en az 200 karakterlik mail metni puanlanır');
    ok(!a.some(x => /Iletici/i.test(x.ad)), 'başvuruları ileten çalışanın adı aday adı olmaz');

    /* 5) Kurallar */
    eq(P.classify('Hukuk fakültesi mezunu, baro levhasına kayıtlı', '', 'İcra takip elemanı ilanı', 'cv.pdf').kat, 'Avukat', 'ruhsat kanıtı avukata götürür');
    eq(P.classify('Çağrı merkezi deneyimi', '', 'Avukat ilanı', 'cv.pdf').kat !== 'Avukat', true, 'hukuk fakültesi yoksa avukat olamaz');
    eq(P.years(P.fold('2015 - 2018 A şirketi, 2020 - 2022 B şirketi')), 5, 'tarih aralıkları toplanır');
    eq(P.bestName('ÖZGEÇMİŞ\nAHMET YILMAZ\nİletişim', 'ahmet.yilmaz@x.test', ''), 'Ahmet Yilmaz', 'büyük harfli ad satırı, e-posta ile eşleşir');
    eq(P.bestName('Ad Soyad: Elif Kaya\n', '', ''), 'Elif Kaya', '"Ad Soyad:" alanı');
    eq(P.bestName('', 'can.ozturk89@x.test', ''), 'Can Ozturk', 'ad bulunamazsa e-postadan');
    ok(P.SKIP.test('IELTS belgesi.pdf') && P.SKIP.test('fatura.pdf'), 'CV olmayan ekler atlanır');

    /* 6) Excel */
    a.find(x => x === st).oncelik = 'Ofis içi referans';
    const x = await G.Rapor.excel(a, { sayac: t.sayac, baslik: 'Örnek Büro' });
    const z = G.Zip.unzip(x);
    eq([...td.decode(z.al('xl/workbook.xml')).matchAll(/<sheet name="([^"]+)"/g)].map(m => m[1]), ['Özet', 'Avukat', 'Stajyer', 'Callcenter', 'İşlemci', 'Ofis elemanı'], 'Excel sayfaları');
    const s2 = td.decode(z.al('xl/worksheets/sheet2.xml'));
    ok(s2.includes('Deniz Örnek') && s2.includes('Otomatik analiz') && s2.includes('Öncelikli'), 'avukat sayfasında aday, tür ve bant');
    ok(/<c r="L2" s="5"><v>82<\/v>/.test(s2), 'toplam puan hücresi bant rengiyle');
    ok(td.decode(z.al('xl/worksheets/sheet3.xml')).includes('Ofis içi referans'), 'öncelik sebebi Excel\'de görünür');
    ok(td.decode(z.al('xl/worksheets/sheet1.xml')).includes('Örnek Büro: CV Değerlendirme Raporu'), 'özet başlığı');
    const yeniden = [{ ...av, oncelik: '' }, { ...av, ad: 'B', toplam: 10, oncelik: 'Referans' }];
    eq(G.Rapor.sirala(yeniden).map(q => q.ad), ['B', 'Deniz Örnek'], 'öncelikli aday puanı düşük olsa da başta');
    /* 7) Gerçek OCR motoru (yalnız tarayıcıda): tuvale yazılan Türkçe metin okunur */
    if (typeof document !== 'undefined' && G.Ocr) {
      const c = document.createElement('canvas'); c.width = 1400; c.height = 360; const x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#000'; x.font = '56px Arial, sans-serif';
      x.fillText('Deniz Örnek', 60, 110); x.fillText('Hukuk Fakültesi, İstanbul Barosu', 60, 200); x.fillText('Çağrı merkezi, şikayet, ğ ı ş ü', 60, 290);
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      const okunan = await G.Ocr.oku({ tur: 'dosya', ad: 'ornek.png', veri: new Uint8Array(await blob.arrayBuffer()) });
      await G.Ocr.kapat();
      ok(/Deniz Örnek/.test(okunan) && /Hukuk Fakültesi/.test(okunan) && /İstanbul Barosu/.test(okunan) && /Çağrı merkezi/.test(okunan), 'OCR Türkçe harfleri okur: ' + okunan.replace(/\s+/g, ' ').trim());
    }
  } catch (e) {
    kalan++; cikti.push('HATA  beklenmeyen: ' + (e && e.stack || e));
  }

  const ozet = `TEST ${gecen}/${gecen + kalan}`;
  if (typeof document !== 'undefined') {
    document.title = ozet + (kalan ? ' HATA' : '');
    document.getElementById('sonuc').textContent = ozet + '\n\n' + cikti.join('\n');
  } else {
    console.log(cikti.join('\n')); console.log(ozet); if (kalan) process.exitCode = 1;
  }
})();
