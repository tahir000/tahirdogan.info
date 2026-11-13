/*
 * Bilirkişi Raporuna Beyan testleri. test.html açılınca çalışır; sonuç sayfaya ve
 * sekme başlığına yazılır ("TEST 60/60" gibi). Örneklerdeki bilgiler uydurmadır.
 */
(async function () {
  'use strict';
  const O = window.BkOrtak, U = window.Udf, P = window.PdfMetin, R = window.RaporOku, S = window.Sablon, X = window.Ornekler;
  const cikti = [];
  let gecen = 0, kalan = 0;

  function eq(gelen, beklenen, ad) {
    const a = JSON.stringify(gelen), b = JSON.stringify(beklenen);
    if (a === b) { gecen++; cikti.push('ok    ' + ad); }
    else { kalan++; cikti.push('HATA  ' + ad + '\n        beklenen: ' + b + '\n        gelen:    ' + a); }
  }
  function ok(kosul, ad) { eq(!!kosul, true, ad); }
  function alan(alanlar, tur, n) { return alanlar.filter(function (a) { return a.tur === tur; })[n || 0]; }
  function elemanlar(xml) {
    const l = [];
    const re = /<(content|space)\b[^>]*startOffset="(\d+)" length="(\d+)"[^>]*>/g;
    let m;
    while ((m = re.exec(xml)) !== null) l.push({ ham: m[0], bas: +m[2], boy: +m[3] });
    return l;
  }
  function kapsayan(xml, konum) { return elemanlar(xml).find(function (e) { return konum >= e.bas && konum < e.bas + e.boy; }); }
  function paragraflar(xml) { return (xml.match(/<paragraph\b/g) || []).length; }

  try {
    /* 1) Yardımcılar */
    eq(O.katla('İıŞşĞğÜüÖöÇç'), 'IISSGGUUOOCC', 'Türkçe harfler katlanır, uzunluk aynı kalır');
    eq([O.buyukMu('AHMET ÖRNEKOĞLU'), O.buyukMu('Deneme Reklam'), O.buyukMu('2026/1')], [true, false, false], 'büyük harf denetimi');
    eq([O.tarihNorm('4/8/2026'), O.tarihBicimle('04.08.2026', '05/11/2025'), O.tarihBicimle('04.08.2026', '10.01.2026')], ['04.08.2026', '04/08/2026', '04.08.2026'], 'tarih biçimi örneğe uyar');
    eq(O.hepsiniBul('2024/777 ve 2024/7770 ve x2024/777', '2024/777', true), [0], 'sınırlı arama yalnız tam değeri bulur');
    eq(O.temizMetin('a\u0007b\r\nc'), 'ab\nc', 'denetim karakterleri silinir');
    eq(R.dosyaAdiCoz('2026_888 - İstanbul 7. Tüketici Mahkemesi - Bilirkişi Raporu - BLR_BILIRKISI_RAPORU - 02_09_2026.pdf'), { esas: '2026/888', mahkeme: 'İstanbul 7. Tüketici Mahkemesi', tarih: '02.09.2026' }, 'UYAP dosya adı çözülür');

    /* 2) UDF okuma ve şablon alanları */
    const xml = X.sablon();
    const sb = await U.oku(new TextEncoder().encode(xml));
    ok(sb.metin.indexOf('İSTANBUL 9. ASLİYE') === 0 && sb.metin.slice(-1) === '\n', 'zip olmayan (düz XML) UDF okunur');
    eq(U.denetle(xml), [], 'örnek şablon denetimden geçer');
    const sbZip = await U.oku(await U.paketle(xml));
    eq(sbZip.metin, sb.metin, 'zip olarak paketlenen UDF aynı okunur');
    const bul = S.alanlariBul(sb.metin), A = bul.alanlar;
    eq(A.map(function (a) { return a.tur; }), ['mahkeme', 'esas', 'borclu', 'kimlik', 'adres', 'araKarar', 'raporTarihi', 'icraDaire', 'icraNo', 'plaka', 'gecisBas', 'gecisSon', 'tutar', 'alinti', 'dilekceTarihi'], 'şablondaki alanlar bulunur');
    eq([alan(A, 'mahkeme').eski, alan(A, 'esas').eski, alan(A, 'borclu').eski, alan(A, 'kimlik').eski], ['İSTANBUL 9. ASLİYE TİCARET MAHKEMESİNE', '2025/111', 'DENEME LOJİSTİK LİMİTED ŞİRKETİ', 'VKN: 1234567890'], 'mahkeme, esas, borçlu, kimlik');
    eq([alan(A, 'adres').eski, alan(A, 'adres').girinti], ['Örnek Mah. Test Cad. No:5\nKadıköy / İSTANBUL', '\t\t'], 'iki satırlık adres ve girintisi');
    eq(alan(A, 'araKarar').eski, '12.01.2026 tarihli duruşma zaptının 7 numaralı ara kararı', 'ara karar ifadesi');
    eq([alan(A, 'icraDaire').eski, alan(A, 'icraNo').eski, alan(A, 'plaka').eski], ['İstanbul 5. İcra Müdürlüğü', '2025/2222', '34AB123'], '"Davalı-Borçlunun" daire adına katılmaz; icra no ve plaka');
    eq([alan(A, 'gecisBas').eski, alan(A, 'gecisSon').eski, alan(A, 'raporTarihi').eski, alan(A, 'dilekceTarihi').eski], ['01.01.2024', '31.03.2024', '15.02.2026', '20.02.2026'], 'geçiş, rapor ve dilekçe tarihleri');
    eq([alan(A, 'tutar').eski, alan(A, 'alinti').eski], ['3.250,00', 'geçişlerin ihlalli olduğu ve 4.100,25 TL'], 'tutar; alıntının içindeki tutar ayrı alan olmaz');
    eq(bul.digerTarihler.map(function (t) { return t.deger; }), ['01.02.2010', '05.05.2009'], 'içtihat tarihleri alan sayılmaz');
    eq([alan(A, 'borclu').konumlar[0].buyuk, alan(A, 'adres').konumlar[0].buyuk], [true, false], 'büyük harfli yer işaretlenir');
    const kenar = S.alanlariBul('Davalı Borçlununİstanbul 3. İcra Müdürlüğü\'nün 2025/1 E. sayılı dosyası; İSTANBUL 3. İCRA MÜDÜRLÜĞÜ\'NÜN dosyası.\nSaygılarımla arz ve talep ederim. 1?.04.2026\n').alanlar;
    eq([alan(kenar, 'icraDaire').eski, alan(kenar, 'icraDaire').konumlar.length, alan(kenar, 'icraDaire').konumlar[1].buyuk, alan(kenar, 'dilekceTarihi').eski], ['İstanbul 3. İcra Müdürlüğü', 2, true, '1?.04.2026'], 'yapışık kelime ve büyük harfli daire tek alan; taslak tarih tanınır');

    /* 3) Uygulama: biçim korunur, paragraflar bölünür ve birleşir */
    function degerler(ek) {
      const d = {};
      A.forEach(function (a) { d[a.id] = a.eski; });
      Object.keys(ek || {}).forEach(function (t) { d[alan(A, t).id] = ek[t]; });
      return d;
    }
    const d1 = degerler({ borclu: 'Yeni Nakliye Ticaret A.Ş.', esas: '2026/900', adres: 'Yeni Mah. Bir Sk. No:3\nDaire 4\n  Üsküdar / İSTANBUL  ', dilekceTarihi: '13.11.2026' });
    const p1 = S.plan(sb.metin, A, d1, []);
    eq(p1.hatalar, [], 'plan hatasız');
    const u1 = U.uygula(sb, p1.degisiklikler);
    ok(u1.metin.indexOf('DAVALI -BORÇLU\t: YENİ NAKLİYE TİCARET A.Ş. (VKN: 1234567890 )') >= 0, 'büyük harfli yerde yeni ad büyük harfle yazılır');
    ok(u1.metin.indexOf('\t\tYeni Mah. Bir Sk. No:3\n\t\tDaire 4\n\t\tÜsküdar / İSTANBUL\n') >= 0, 'çok satırlı adres girintiyle yazılır');
    eq(U.denetle(u1.xml), [], 'üretilen dosya denetimden geçer');
    eq(paragraflar(u1.xml) - paragraflar(xml), 1, 'adres iki satırdan üçe çıkınca bir paragraf eklenir');
    const esasYeri = u1.metin.indexOf('2026/900');
    ok(/bold="true"/.test(kapsayan(u1.xml, esasYeri).ham), 'kalın yazılmış esas no yine kalın');
    ok(/italic="true"/.test(kapsayan(u1.xml, u1.metin.indexOf('Daire 4')).ham), 'yeni adres satırları italik kalır');
    ok(/underline="true"/.test(kapsayan(u1.xml, u1.metin.indexOf('DOSYA NO')).ham), 'değişmeyen başlığın biçimi aynı');
    ok(/<space resolver="hvl-default" startOffset="\d+" length="1" \/>/.test(u1.xml) && u1.metin[kapsayan(u1.xml, u1.metin.indexOf('DOSYA NO') + 8).bas] === '\t', 'boşluk öğesi konumuyla birlikte taşınır');
    eq([u1.metin.indexOf('20.02.2026'), u1.metin.indexOf('13.11.2026') > 0], [-1, true], 'dilekçe tarihi değişir');
    eq(u1.araliklar.length, p1.degisiklikler.length, 'önizleme için değişen aralıklar');
    const zip1 = await U.paketle(u1.xml);
    eq((await U.oku(zip1)).metin, u1.metin, 'indirilen zip geri okununca aynı');
    const d2 = degerler({ adres: 'Tek Satır Mah. No:1 Beşiktaş' });
    const u2 = U.uygula(sb, S.plan(sb.metin, A, d2, []).degisiklikler);
    eq([paragraflar(xml) - paragraflar(u2.xml), U.denetle(u2.xml)], [1, []], 'adres tek satıra inince paragraflar birleşir');
    ok(u2.metin.indexOf(')\n\t\tTek Satır Mah. No:1 Beşiktaş\n\nKONU') >= 0, 'birleşen adres yerinde');
    const u3 = U.uygula(sb, S.plan(sb.metin, A, degerler(), [{ eski: 'Örnek Otoyol İşletme A.Ş.', yeni: 'A]]>B' }]).degisiklikler);
    eq([(await U.oku(await U.paketle(u3.xml))).metin.indexOf('A]]>B') > 0, U.denetle(u3.xml)], [true, []], '"]]>" içeren metin bozulmadan yazılır');
    const u4 = U.uygula(sb, S.plan(sb.metin, A, degerler({ borclu: 'X\u0007Y' }), []).degisiklikler);
    ok(u4.metin.indexOf('\u0007') < 0 && u4.metin.indexOf(': XY (VKN') > 0, 'girdideki denetim karakteri silinir');
    const bozuk = u1.xml.replace(/startOffset="(\d+)"/, function (m, n) { return 'startOffset="' + (+n + 1) + '"'; });
    ok(U.denetle(bozuk).length > 0, 'bozuk konumlar denetimde yakalanır');
    let hata = '';
    try { U.uygula(sb, [{ bas: 5, son: 10, yeni: 'a' }, { bas: 8, son: 12, yeni: 'b' }]); } catch (e) { hata = e.message; }
    ok(/aynı metne/.test(hata), 'çakışan değişiklik reddedilir');

    /* 4) Plan hataları */
    eq(S.plan(sb.metin, A, degerler({ esas: '  ' }), []).hatalar, ['Esas no boş bırakılamaz. Şablondaki gibi kalması için eski değeri yazın.'], 'boş alan hatası');
    ok(/bulunamadı/.test(S.plan(sb.metin, A, degerler(), [{ eski: 'şablonda olmayan metin', yeni: 'x' }]).hatalar[0]), 'şablonda olmayan serbest metin hatası');
    ok(/aynı metne/.test(S.plan(sb.metin, A, degerler({ esas: '2026/1' }), [{ eski: ': 2025/111 E.', yeni: 'x' }]).hatalar[0] || ''), 'alanla çakışan serbest değişiklik hatası');
    eq(S.plan(sb.metin, A, degerler(), []).degisiklikler.length, 0, 'değişmeyen alan metne dokunmaz');
    eq(S.dosyaAdi(A, d1), '2026-900 BK Beyan.udf', 'dosya adı esas numarasından');

    /* 5) PDF'ten metin */
    const pdf = await X.pdf(X.raporSatirlari());
    const pm = await P.metin(pdf);
    const satir = pm.metin.split('\n');
    eq(pm.sayfaSayisi, 1, 'PDF sayfası bulunur (nesne akışındaki yazı tipleriyle)');
    eq(satir[0], 'T.C. İSTANBUL 4. TÜKETİCİ MAHKEMESİ', 'iki yazı tipi aynı satırda, küçük aralık boşluk sayılmaz');
    eq(satir[2], 'DOSYA NO : 2026/900 Esas', 'büyük TJ aralığı boşluk olur; rakamlar aralık eşlemesiyle');
    eq(satir[3], 'DAVACI : Ornek Otoyol A.S. (deneme) \\ son', 'literal dizedeki kaçışlar çözülür');
    eq(satir[4], 'DAVALI : AYŞE ÖRNEK', 'Türkçe harfler ToUnicode ile');
    eq(satir.length, X.raporSatirlari().length, 'satır sayısı');
    let pdfHata = '';
    try { await P.metin(new TextEncoder().encode('merhaba')); } catch (e) { pdfHata = e.message; }
    ok(/PDF değil/.test(pdfHata), 'PDF olmayan dosya için anlaşılır hata');
    pdfHata = '';
    try { await P.metin(new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<</Encrypt 5 0 R/Root 1 0 R>>\n')); } catch (e) { pdfHata = e.message; }
    ok(/şifreli/.test(pdfHata), 'şifreli PDF için anlaşılır hata');

    /* 6) Rapordan bilgi */
    const r = R.coz(pm.metin, 'rapor.pdf');
    eq([r.mahkeme, r.esas, r.davali, r.kimlik], ['İSTANBUL 4. TÜKETİCİ MAHKEMESİ', '2026/900', 'AYŞE ÖRNEK', 'TCKN: 12345678901'], 'mahkeme, esas, davalı, kimlik');
    eq([r.plaka, r.gecisBas, r.gecisSon, r.icraDaire, r.icraNo], ['06ABC123', '01.06.2024', '30.06.2024', 'Ankara 2. İcra Dairesi', '2025/4444'], 'plaka, geçiş tarihleri, icra dosyası');
    eq([r.araKarar, r.raporTarihi], [{ tarih: '03.03.2026', tur: 'tensip', no: '5' }, '10.04.2026'], 'ara karar ve rapor tarihi');
    eq(r.tutarlar.map(function (t) { return t.etiket + ' ' + t.deger; }), ['Takip tutarı 2.500,00 TL', 'Genel toplam 2.100,50 TL'], 'tutarlar etiketleriyle');
    eq([r.faiz, r.oneri], ['yasal', 'aleyhe'], 'yasal faiz: aleyhe şablon önerilir');
    ok(r.isaretler.some(function (i) { return /yasal faiz/.test(i.aciklama); }) && r.isaretler.some(function (i) { return /genel toplam/.test(i.aciklama); }), 'dikkat edilecek tespitler işaretlenir');
    ok(/^V- SONUÇ VE KANAAT/.test(r.sonuc), 'sonuç bölümü bulunur');
    const dosyaAdli = R.coz('', '2026_123 - Bakırköy 2. Asliye Ticaret Mahkemesi - Bilirkişi Raporu - X - 01_02_2026.pdf');
    eq([dosyaAdli.esas, dosyaAdli.mahkeme, dosyaAdli.raporTarihi, dosyaAdli.metinVar], ['2026/123', 'Bakırköy 2. Asliye Ticaret Mahkemesi', '01.02.2026', false], 'metin okunamazsa dosya adındaki bilgiler kullanılır');

    /* 7) Rapordan şablona öneriler ve son denetim */
    const o = S.oneriler(A, r);
    eq([o[alan(A, 'mahkeme').id], o[alan(A, 'esas').id], o[alan(A, 'borclu').id], o[alan(A, 'kimlik').id]], ['İSTANBUL 4. TÜKETİCİ MAHKEMESİNE', '2026/900', 'AYŞE ÖRNEK', 'TCKN: 12345678901'], 'öneriler: mahkemeye "-NE" eki, kimlik türü');
    eq(o[alan(A, 'araKarar').id], '03.03.2026 tarihli tensip zaptının 5 numaralı ara kararı', 'ara karar ifadesi rapora göre: tarih, tür, numara');
    eq(o[alan(A, 'icraDaire').id], 'Ankara 2. İcra Müdürlüğü', 'icra dairesi şablondaki kelimeyle (ek uyumu için)');
    eq([o[alan(A, 'plaka').id], o[alan(A, 'gecisBas').id], o[alan(A, 'raporTarihi').id]], ['06ABC123', '01.06.2024', '10.04.2026'], 'plaka ve tarihler');
    const d3 = Object.assign(degerler(), o);
    d3[alan(A, 'esas').id] = '2026/901';
    const u5 = U.uygula(sb, S.plan(sb.metin, A, d3, []).degisiklikler);
    const den = S.denetim(u5.metin, A, d3, r);
    ok(den.some(function (x) { return x.tur === 'rapor' && /Esas no/.test(x.metin); }), 'rapordakinden farklı esas no uyarısı');
    ok(den.some(function (x) { return x.tur === 'iz' && /DENEME/.test(x.metin); }), 'eski borçlu adından kalan iz yakalanır');
    ok(den.some(function (x) { return x.tur === 'degismedi' && /adresi/.test(x.metin); }) && den.some(function (x) { return x.tur === 'degismedi' && /Tutar/.test(x.metin); }), 'değişmeyen alanlar uyarılır');
    ok(!den.some(function (x) { return x.tur === 'rapor' && /Plaka/.test(x.metin); }), 'rapora uyan alan uyarı vermez');
    const ornekTarih = S.oneriler([{ id: 'a', tur: 'araKarar', eski: '05/11/2025 tarihli tensip zaptının 9 numaralı ara kararı' }], { araKarar: { tarih: '04.08.2026', tur: 'duruşma', no: '' } });
    eq(ornekTarih.a, '04/08/2026 tarihli duruşma zaptının ara kararı', 'numara raporda yoksa kaldırılır, tarih ayracı korunur');

    /* 8) Hız: 400 paragraf, 400 değişiklik */
    const t0 = performance.now();
    const uzunXml = X.udfXml(Array.from({ length: 400 }, function (_, i) { return { hiza: 3, parcalar: [['Satır ' + i + ' 2025/111 ', { bold: i % 2 === 0 }], ['devam metni\n']] }; }));
    const us = await U.oku(new TextEncoder().encode(uzunXml));
    const uu = U.uygula(us, S.plan(us.metin, [], {}, [{ eski: '2025/111', yeni: '2026/900' }]).degisiklikler);
    const sure = Math.round(performance.now() - t0);
    eq(U.denetle(uu.xml), [], '400 paragraf, 400 değişiklik denetimden geçer');
    ok(sure < 2000, '400 değişiklik 2 saniyeden kısa sürer (' + sure + ' ms)');
  } catch (e) {
    kalan++;
    cikti.push('HATA  beklenmeyen hata: ' + (e && e.stack ? e.stack : e));
  }
  const ozet = 'TOPLAM ' + gecen + ' geçti, ' + kalan + ' kaldı';
  document.getElementById('sonuc').textContent = cikti.join('\n') + '\n\n' + ozet;
  document.title = 'TEST ' + gecen + '/' + (gecen + kalan);
  window.TEST_SONUCU = { gecen: gecen, kalan: kalan, cikti: cikti };
})();
