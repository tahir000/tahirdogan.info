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
