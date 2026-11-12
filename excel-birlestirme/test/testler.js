/*
 * Excel Birleştirme testleri. test.html açılınca çalışır; sonuç sayfaya ve
 * sekme başlığına yazılır ("TEST 108/108" gibi).
 */
(async function () {
  'use strict';
  const B = window.Birlestirme, O = window.ExcelOkuyucu, Y = window.ExcelYazici, X = window.Ornekler, H = B.yardimci;
  /* Testler kendi hayali kurum listesini kullanır; sitede varsayılan liste boştur */
  const V = { kurumlar: [{ ad: 'Deneme Bankası', kelimeler: ['DENEME BANK'] }, { ad: 'Örnek Altyapı', kelimeler: ['ÖRNEK ALTYAPI'] }, { ad: 'Kuzey Elektrik', kelimeler: ['KUZEY'] }], esler: [] };
  const cikti = [];
  let gecen = 0, kalan = 0;

  function eq(gelen, beklenen, ad) {
    const a = JSON.stringify(gelen), b = JSON.stringify(beklenen);
    if (a === b) { gecen++; cikti.push('ok    ' + ad); }
    else { kalan++; cikti.push('HATA  ' + ad + '\n        beklenen: ' + b + '\n        gelen:    ' + a); }
  }
  function ok(kosul, ad) { eq(!!kosul, true, ad); }
  async function xlsx(sayfalar) { return Y.bayt(sayfalar, { paylasimliMetin: true }); }
  async function dosya(ad, sayfalar, ayar) { return B.dosyayiCozumle(ad, await O.oku(await xlsx(sayfalar), ad), ayar || V); }
  function tablo(d, ad) { return d.tablolar.find(function (t) { return t.ad === ad; }) || { satirlar: [] }; }
  function satir(d, ad, dosyaNo) { return tablo(d, ad).satirlar.find(function (s) { return s['Dosya No'] === dosyaNo; }) || {}; }

  try {
    /* 1) Yardımcılar */
    eq(H.daireNorm('İstanbul 8. İcra Dairesi'), 'ISTANBUL 8', 'daire adı sadeleşir');
    eq(H.daireNorm('Çerkezköy İcra Müdürlüğü'), 'CERKEZKOY', 'müdürlük de sadeleşir');
    eq(H.dosyaNorm(' 2026 / 010101 E.'), '2026/10101', 'dosya no sadeleşir');
    eq(H.tarafCoz('x [BORÇLU VE MÜFLİS AHMET YILMAZ] - 1 - Tebliğ Edildi'), { ad: 'AHMET YILMAZ', rol: 'BORÇLU VE MÜFLİS', borcluMu: true }, 'açıklamadan borçlu adı');
    eq(H.tarafCoz('x [ALACAKLI VEKİLİ AV. ALİ] - 1').borcluMu, false, 'alacaklı vekili borçlu sayılmaz');
    ok(H.ayniAd('DENİZ İNŞ. TİC. LTD. ŞTİ.', 'DENİZ İNŞAAT TİCARET LİMİTED ŞİRKETİ') && H.ayniAd('Ahmet Yılmaz', 'AHMET YILMAZ') && H.ayniAd('X YAPI A.Ş.', 'X YAPI ANONİM ŞİRKETİ'), 'kısaltmalı şirket adı ve yazım farkı aynı sayılır');
    ok(!H.ayniAd('MEHMET YILMAZ', 'MEHMET DEMİR') && !H.ayniAd('ALİ YILMAZ', 'ALİYE YILMAZ') && !H.ayniAd('AHMET YILMAZ', 'AHMET YILMAZ İNŞAAT LTD. ŞTİ.'), 'farklı kişi ya da şirket aynı sayılmaz');
    eq(H.hucreBirlestir('', [], ['ALİ KAYA'], [{ ad: 'ALİ KAYA', v: 'x' }], false), 'x', 'tek borçluda bilgi yalın yazılır');
    eq(H.hucreBirlestir('x', ['ALİ KAYA'], ['ALİ KAYA', 'VELİ KAYA'], [{ ad: 'VELİ KAYA', v: 'y' }], false), 'ALİ KAYA: x; VELİ KAYA: y', 'ikinci borçlu gelince bilgiler borçlu borçlu ayrılır');
    eq(H.hucreBirlestir('ALİ KAYA: x; VELİ KAYA: y', ['ALİ KAYA', 'VELİ KAYA'], ['ALİ KAYA', 'VELİ KAYA'], [{ ad: 'Veli Kaya', v: 'z' }], false), 'ALİ KAYA: x; VELİ KAYA: z', 'yeni bilgi yalnız ilgili borçlunun kısmını günceller');
    eq(H.hucreBirlestir('ALİ KAYA: x; VELİ KAYA: y', ['ALİ KAYA', 'VELİ KAYA'], ['ALİ KAYA', 'VELİ KAYA'], [{ ad: '', v: 'k' }], false), 'k', 'borçlusu belli olmayan bilgi hücrenin yerine geçer');
    eq(H.hucreBirlestir('', [], [], [{ ad: '', v: 'x' }, { ad: '', v: 'y' }, { ad: '', v: 'x' }], false), 'x / y', 'aynı kaynağın farklı değerleri yan yana yazılır');
    eq(H.hucreBirlestir('Tebliğ edildi - 04.11.2026', ['ALİ KAYA'], ['ALİ KAYA'], [{ ad: 'ALİ KAYA', v: 'Tebliğ edilmedi - 01.10.2026' }], true), 'Tebliğ edildi - 04.11.2026', 'eski tarihli bilgi yenisini ezmez');
    eq(H.kurumBul(X.BANKA, B.ayarlariHazirla(V).kurumlar), 'Deneme Bankası', 'kelime başından kurum eşleşmesi');
    eq(H.tarihBul('04/11/2026 16:05:17').toISOString().slice(0, 10), '2026-11-04', 'metin tarih okunur');
    eq(H.sayiOku('246.903,87'), 246903.87, 'Türkçe tutar okunur');
    eq(H.baslikSatiriBul([['RAPOR'], [], ['A', 'B', 'C'], [1, 2, 3]]), 2, 'başlık satırı bulunur');

    /* 2) Yazıcı ve okuyucu gidiş dönüş */
    const tarih = new Date(Date.UTC(2026, 10, 4));
    const deneme = await xlsx([{ ad: 'Deneme: [1]', satirlar: [['Metin', 'Sayı', 'Tarih', 'Boş', 'Özel'], ['Çağrı Öğün', 4250.4, tarih, null, 'a "b" & <c>'], ['0555', 12, true, '', '=1+1']] }]);
    const geri = await O.oku(deneme, 'deneme.xlsx');
    eq(geri[0].ad, 'Deneme 1', 'geçersiz sayfa adı temizlenir');
    eq(geri[0].satirlar[1][0], 'Çağrı Öğün', 'Türkçe metin');
    eq(geri[0].satirlar[1][1], 4250.4, 'sayı');
    eq(geri[0].satirlar[1][2] instanceof Date && geri[0].satirlar[1][2].toISOString().slice(0, 10), '2026-11-04', 'tarih hücresi');
    eq(geri[0].satirlar[1][4], 'a "b" & <c>', 'XML kaçışı');
    eq([geri[0].satirlar[2][0], geri[0].satirlar[2][2], geri[0].satirlar[2][4]], ['0555', true, '=1+1'], 'baştaki sıfır, mantıksal değer, formül gibi metin korunur');
    const sikisik = await Y.bayt([{ ad: 'A', satirlar: [['x'.repeat(5000)]] }]);
    eq((await O.oku(sikisik, 'a.xlsx'))[0].satirlar[0][0].length, 5000, 'sıkıştırılmış dosya okunur');

    /* 3) Banka cevapları */
    const bc = await dosya('banka cevapları.xlsx', X.bankaDosyasi());
    eq(bc.sayfalar.map(function (s) { return [s.sayfa, s.tur, s.secili]; }), [['TfrIslemBankaCevaplariIncele_20', 'Banka cevapları', true], ['Sayfa1', 'Banka cevapları', false]], 'banka dosyası tanınır, Sayfa1 varsayılan olarak atlanır');
    ok(/aynı dosyanın/.test(bc.sayfalar[1].neden), 'Sayfa1 neden atlandığı yazar');
    eq(bc.sayfalar[0].kullanilmayan, ['İ.B.C.S.', 'İş Emri'], 'kullanılmayan sütunlar listelenir');
    eq(bc.sayfalar[0].eslesmeler.map(function (e) { return e.gelen + ' > ' + e.hedef; }), ['Föy No > Föy No', 'Karşı yan > Borçlu Adı', 'Alacaklı > Alacaklı', 'İcra Dairesi > İcra Dairesi', 'Dosya No > Dosya No', 'Banka cevabı (özet) > Banka Haczi', 'Bankada para (özet) > Bankada Para Var mı?'], 'banka dosyasında önerilen eşleştirme');
    const r1 = B.birlestir(B.bosDurum(V), [bc], V, new Date(2026, 10, 11, 10, 0));
    const D1 = r1.durum;
    eq(tablo(D1, 'Örnek Altyapı').satirlar.length, 3, 'Örnek Altyapı sayfasında 3 dosya');
    eq(satir(D1, 'Örnek Altyapı', '2026/10101')['Banka Haczi'], 'Var, 25 banka cevabı', 'Banka Haczi yazılır');
    eq(satir(D1, 'Örnek Altyapı', '2026/10101')['Bankada Para Var mı?'], 'Evet, 4.250,40 TL', 'bakiye varsa Evet ve tutar');
    eq(satir(D1, 'Örnek Altyapı', '2026/20202')['Banka Haczi'], 'Var, 12 banka cevabı (2 evrak incelenemedi)', 'incelenemeyen evrak eklenir');
    eq(satir(D1, 'Örnek Altyapı', '2026/20202')['Bankada Para Var mı?'], 'Hayır', 'cevap var bakiye yoksa Hayır');
    eq(satir(D1, 'Örnek Altyapı', '2026/30303')['Banka Haczi'], undefined, 'cevap yoksa boş kalır');
    eq(satir(D1, 'Deneme Bankası', '2026/40404')['Bankada Para Var mı?'], 'Hayır', 'Deneme Bankası satırı kendi sayfasına');
    eq(satir(D1, 'Diğer', '2026/1001')['Bankada Para Var mı?'], 'Evet, 120,50 TL', 'tanınmayan alacaklı Diğer sayfasına');
    eq([satir(D1, 'Örnek Altyapı', '2026/10101')['Föy No'], satir(D1, 'Örnek Altyapı', '2026/10101')['Son Güncelleme'], satir(D1, 'Örnek Altyapı', '2026/10101')['Kaynak']], ['9101', '11.11.2026', 'banka cevapları.xlsx'], 'Föy No, Son Güncelleme, Kaynak');
    eq(r1.ozetler.length, 1, 'yalnız seçili sayfa işlenir');
    eq(r1.ozetler[0].taninmayanAlacaklilar, { 'XYZ ENERJİ A.Ş.': 1 }, 'tanınmayan alacaklı raporlanır');
    eq(r1.ozetler[0].sutunlar['Banka Haczi'], 4, 'raporda sütun sayımı');

    /* 4) Tebligat raporu */
    const tc = await dosya('Tebligat Raporu (10.11).xlsx', X.tebligatDosyasi());
    eq(tc.sayfalar[0].tur, 'Tebligat raporu', 'tebligat raporu tanınır');
    eq(tc.sayfalar[0].kullanilmayan, ['Dosya Türü', 'İşlem Türü', 'Son İşlem Tarihi', 'Sütun G'], 'barkod ve işlem sütunları kullanılmaz');
    const r2 = B.birlestir(D1, [tc], V, new Date(2026, 10, 12, 9, 0));
    const D2 = r2.durum;
    eq(satir(D2, 'Örnek Altyapı', '2026/10101')['Tebligat Bilgisi'], 'Tebliğ edildi - 21.MAD. GORE MUHTARA TESLiM / Mu**** - 04.11.2026', 'son tebligat yazılır, eski tarihli tebligat ezmez');
    eq(satir(D2, 'Örnek Altyapı', '2026/20202')['Tebligat Bilgisi'], 'Tebliğ edilmedi - İADE Adres Hatalı - 03.11.2026', 'kısaltmalı şirket adıyla eşleşir');
    eq(satir(D2, 'Deneme Bankası', '2026/40404')['Tebligat Bilgisi'], 'Tebliğ edildi - 35.MAD. GORE MUHATAP ADRESi KAPISINA YAPISTIRMA / Ke**** - 05.11.2026', 'adsız tebligat tek borçlulu dosyaya yazılır');
    eq(satir(D2, 'Diğer', '2026/555')['Borçlu Adı'], 'HASAN ÇELİK', 'kurumu bilinmeyen dosya Diğer sayfasına');
    eq(tablo(D2, 'Örnek Altyapı').satirlar.length, 3, 'tebligat kurum sayfasında yeni satır açmaz');
    eq([r2.ozetler[0].yeni, r2.ozetler[0].guncellenen, r2.ozetler[0].degismeyen, r2.ozetler[0].atlanan, r2.ozetler[0].birlesen], [1, 3, 0, 1, 1], 'tebligat özeti: aynı dosyanın iki tebligatı tek kayıt');
    ok(r2.rapor.some(function (r) { return r[2] === '2, 3' && /2 satır tek satırda toplandı/.test(r[9]); }), 'raporda birleşen satır numaraları yazar');
    eq(r2.ozetler[0].atlamaNedenleri, { 'Tebligat borçluya değil (ALACAKLI VEKİLİ)': 1 }, 'alacaklı vekiline tebligat atlanır');
    eq(satir(D1, 'Örnek Altyapı', '2026/10101')['Tebligat Bilgisi'], undefined, 'önceki durum değişmez');

    /* 5) Genel tablo: başlık satırı aşağıda, eş adlar, araç kuralı */
    const ac = await dosya('Araç Sorgu.xlsx', X.aracDosyasi());
    eq([ac.sayfalar[0].tur, ac.sayfalar[0].kullanilmayan], ['Genel tablo', ['Not']], 'genel tablo ve kullanılmayan sütun');
    const r3 = B.birlestir(D2, [ac], V, new Date(2026, 10, 12, 10, 0));
    const D3 = r3.durum;
    eq(satir(D3, 'Örnek Altyapı', '2026/10101')['Araç Sorgusu'], 'Kayıt bulunamadı', 'Araç Sorgusu yazılır');
    eq(satir(D3, 'Örnek Altyapı', '2026/10101')['Araç Haczi'], 'Malvarlığı yok', 'araç yoksa Araç Haczi: Malvarlığı yok');
    eq(satir(D3, 'Örnek Altyapı', '2026/10101')['Borçlu TCKN / VKN'], '12345678901', 'boş TCKN doldurulur');
    eq(satir(D3, 'Örnek Altyapı', '2026/20202')['Araç Haczi'], 'Var, 05.11.2026', 'araç haczi tarihiyle');
    eq([satir(D3, 'Diğer', '2026/77777')['Borçlu Adı'], satir(D3, 'Diğer', '2026/77777')['Araç Haczi']], ['Yeni Kişi', 'Malvarlığı yok'], 'dairesiz yeni dosya Diğer sayfasına');

    /* 6) CSV (windows-1254), HTML tablolu .xls, Excel 2003 XML, eski .xls */
    const csv = await O.oku(X.cp1254('Dosya No;İcra Dairesi;Borçlu Adı;Kesinleşme Durumu\r\n2026/10101;İstanbul 8. İcra Dairesi;AHMET YILMAZ;Kesinleşti\r\n'), 'kesinlesme.csv');
    eq(csv[0].satirlar[1][3], 'Kesinleşti', 'windows-1254 CSV çözülür');
    const r4 = B.birlestir(D3, [B.dosyayiCozumle('kesinlesme.csv', csv, V)], V, new Date(2026, 10, 12, 11, 0));
    eq(satir(r4.durum, 'Örnek Altyapı', '2026/10101')['Kesinleşme Bilgisi'], 'Kesinleşti', 'Kesinleşme Bilgisi yazılır');
    const html = await O.oku(new TextEncoder().encode('<html><body><table><tr><th>Dosya No</th><th>İcra Dairesi</th><th>Borçlu Adı</th><th>Maaş Sorgusu</th></tr><tr><td>2026/30303</td><td>İstanbul 4. İcra Dairesi</td><td>MEHMET KAYA</td><td>SGK kaydı var</td></tr></table></body></html>'), 'liste.xls');
    eq(html[0].satirlar[1], ['2026/30303', 'İstanbul 4. İcra Dairesi', 'MEHMET KAYA', 'SGK kaydı var'], 'HTML tablolu .xls okunur');
    const x2003 = await O.oku(new TextEncoder().encode('<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Liste"><Table><Row><Cell><Data ss:Type="String">Dosya No</Data></Cell><Cell ss:Index="3"><Data ss:Type="Number">5</Data></Cell></Row></Table></Worksheet></Workbook>'), 'liste2003.xls');
    eq(x2003, [{ ad: 'Liste', satirlar: [['Dosya No', null, 5]] }], 'Excel 2003 XML okunur');
    let eskiHata = '';
    try { await O.oku(new Uint8Array([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]), 'eski.xls'); } catch (e) { eskiHata = e.message; }
    ok(/xlsx/.test(eskiHata), 'eski .xls için anlaşılır uyarı');

    /* 7) Ana Excel'de aynı icra dairesi ve dosya no: tek satırda toplanır */
    const iki = B.anaExceliCoz([{ ad: 'Örnek Altyapı', satirlar: [['Borçlu Adı', 'İcra Dairesi', 'Dosya No', 'Banka Haczi', 'Son Güncelleme', 'Kaynak'], ['ALİ KAYA', 'İstanbul 1. İcra Dairesi', '2026/9', 'Var', '01.11.2026', 'eski.xlsx'], ['VELİ KAYA', 'İstanbul 1. İcra Müdürlüğü', '2026/0009', 'Yok', '05.11.2026', 'yeni.xlsx'], ['CEM ARI', 'İstanbul 1. İcra Dairesi', '2026/10', 'Var', '', '']] }], new Date(2026, 10, 12, 8, 0));
    const ikiSatir = satir(iki.durum, 'Örnek Altyapı', '2026/9');
    eq([iki.birlesenSatir, tablo(iki.durum, 'Örnek Altyapı').satirlar.length], [1, 2], 'ana Excel\'de aynı dosyanın iki satırı tek satır olur');
    eq([ikiSatir['Borçlu Adı'], ikiSatir['Banka Haczi'], ikiSatir['Son Güncelleme'], ikiSatir['Kaynak']], ['ALİ KAYA; VELİ KAYA', 'ALİ KAYA: Var; VELİ KAYA: Yok', '05.11.2026', 'yeni.xlsx'], 'borçlular ve bilgileri tek satırda, borçlu borçlu');
    eq(iki.sutunlar, ['Borçlu Adı', 'İcra Dairesi', 'Dosya No', 'Banka Haczi'], 'sütunlar ana Excel\'in başlık satırından okunur');
    ok(/1 satır/.test(iki.durum.gunluk[iki.durum.gunluk.length - 1][10]), 'toplama Günlük sayfasına yazılır');
    const adsiz = B.dosyayiCozumle('k.xlsx', [{ ad: 'S', satirlar: [['Dosya No', 'İcra Dairesi', 'Kesinleşme'], ['2026/9', 'İstanbul 1. İcra Dairesi', 'Kesinleşti']] }], V);
    const r5 = B.birlestir(iki.durum, [adsiz], V, new Date());
    eq([r5.ozetler[0].guncellenen, r5.ozetler[0].atlanan, satir(r5.durum, 'Örnek Altyapı', '2026/9')['Kesinleşme Bilgisi']], [1, 0, 'Kesinleşti'], 'borçlu adı olmayan satır dosyanın satırına yazılır');

    /* 8) Ana Excel gidiş dönüş: ayarlar, notlar, ek sütun, Diğer'den taşıma */
    const ayar2 = { kurumlar: V.kurumlar.concat([{ ad: 'XYZ Enerji', kelimeler: ['XYZ'] }]), esler: [{ gelen: 'Hacizli Mal', hedef: 'Haczedilen Mal' }] };
    const not = [['11.11.2026', 'Örnek Altyapı', '2026/10101', 'Müvekkil aradı', 'Tahir']];
    const anaBayt = await Y.bayt(B.ciktiSayfalari(r4.durum, ayar2, not));
    const anaSayfalar = await O.oku(anaBayt, 'Ana Excel.xlsx');
    eq(anaSayfalar.map(function (s) { return s.ad; }), ['Deneme Bankası', 'Örnek Altyapı', 'Kuzey Elektrik', 'XYZ Enerji', 'Diğer', 'Notlar', 'Günlük', 'Son Yükleme Raporu', 'Ayarlar'], 'ana Excel sayfaları');
    eq(anaSayfalar[1].satirlar[0].slice(0, 5), ['Borçlu Adı', 'Borçlu TCKN / VKN', 'İcra Dairesi', 'Dosya No', 'Tebligat Bilgisi'], 'sütun sırası istenen gibi');
    const coz = B.anaExceliCoz(anaSayfalar);
    eq(coz.ayar.kurumlar.map(function (k) { return k.ad; }), ['Deneme Bankası', 'Örnek Altyapı', 'Kuzey Elektrik', 'XYZ Enerji'], 'ayarlar ana Excel\'den okunur');
    eq(coz.ayar.esler, [{ gelen: 'Hacizli Mal', hedef: 'Haczedilen Mal' }], 'sütun eşleştirmesi okunur');
    eq(satir(coz.durum, 'Örnek Altyapı', '2026/10101')['Bankada Para Var mı?'], 'Evet, 4.250,40 TL', 'değerler korunur');
    eq(coz.durum.notlar.length, 2, 'Notlar korunur');
    eq(coz.durum.gunluk.length, 5, 'Günlük korunur');
    const banka2 = await dosya('banka 2.xlsx', [{ ad: 'Banka', satirlar: [X.bankaBasliklari, [9101, 'AHMET YILMAZ', X.ALTYAPI, 'İstanbul 8. İcra Dairesi', '2026/10101', null, 26, 11, 0, null]] }], coz.ayar);
    const haciz = await dosya('haciz.xlsx', [{ ad: 'S', satirlar: [['Dosya No', 'İcra Dairesi', 'Borçlu Adı', 'Hacizli Mal'], ['2026/10101', 'İstanbul 8. İcra Dairesi', 'AHMET YILMAZ', 'Bir adet araç']] }], coz.ayar);
    const r6 = B.birlestir(coz.durum, [banka2, haciz], coz.ayar, new Date(2026, 10, 13, 9, 0));
    const ahmet = satir(r6.durum, 'Örnek Altyapı', '2026/10101');
    eq([ahmet['Bankada Para Var mı?'], ahmet['Banka Haczi'], ahmet['Kaynak'], ahmet['Son Güncelleme']], ['Hayır', 'Var, 26 banka cevabı', 'haciz.xlsx', '13.11.2026'], 'yeni dosya eskisini günceller');
    eq(ahmet['Haczedilen Mal'], 'Bir adet araç', 'eşleştirmeyle yeni sütun');
    eq(r6.ayarTasima, 1, 'ayar değişince Diğer\'den kuruma taşınır');
    ok(satir(r6.durum, 'XYZ Enerji', '2026/1001')['Borçlu Adı'] === 'ZEYNEP ARSLAN', 'taşınan satır yeni kurum sayfasında');
    const son = B.ciktiSayfalari(r6.durum, coz.ayar, []);
    eq(son[1].satirlar[0].slice(-3), ['Haczedilen Mal', 'Son Güncelleme', 'Kaynak'], 'yeni sütun sonda, Son Güncelleme ve Kaynak her zaman en sonda');
    const elle = B.anaExceliCoz([{ ad: 'Örnek Altyapı', satirlar: [['Borçlu Adı', 'Dosya No', 'İcra Dairesi', 'Avukat Notu'], ['X', '2026/1', 'İstanbul 1. İcra Dairesi', 'önemli']] }]);
    const elleCikti = B.ciktiSayfalari(elle.durum, V, []);
    const ica = elleCikti.find(function (s) { return s.ad === 'Örnek Altyapı'; });
    const jNot = ica.satirlar[0].indexOf('Avukat Notu');
    eq([jNot > 0, ica.satirlar[1][jNot], elle.sutunlar], [true, 'önemli', ['Borçlu Adı', 'Dosya No', 'İcra Dairesi', 'Avukat Notu']], 'elle eklenen sütun korunur');

    /* 9) Üretilen dosyanın XML parçaları sağlam mı */
    const son2 = await Y.bayt(son);
    const zip = O._ic.zipAc(son2);
    let saglam = 0;
    for (const [ad, giris] of zip) {
      const metin = new TextDecoder().decode(await O._ic.ac(son2, giris));
      O._ic.xmlCoz(metin);
      saglam++;
    }
    eq(saglam, zip.size, 'tüm XML parçaları düzgün (' + zip.size + ' parça)');

    /* 10) Sütunları elle eşleştirme: öneri, elle seçim, yeni sütun, hatırlama */
    const hacizBasliklari = ['Numara', 'Birim', 'Borçlu', 'Alacaklı', 'Araç Haczi Durumu', 'Tapu Durumu', 'Memur Notu'];
    const g1 = B.dosyayiCozumle('haciz listesi.xlsx', [{ ad: 'Liste', satirlar: [hacizBasliklari, ['2026/501', 'İzmir 2. İcra Dairesi', 'CAN DENİZ', X.BANKA, 'Var', 'Yok', 'a'], ['2026/502', 'İzmir 2. İcra Dairesi', 'ELİF NUR', X.BANKA, 'Yok', '', '']] }], V);
    const s1 = g1.sayfalar[0];
    eq(s1.hedefler, ['', 'İcra Dairesi', 'Borçlu Adı', 'Alacaklı', 'Araç Haczi', '', ''], 'öneri: tanınan başlıklar eşleşir, tanınmayanlar boş kalır');
    eq([s1.secili, /Dosya No sütunu seçili değil/.test(s1.neden)], [false, true], 'Dosya No seçilmeden sayfa yazılamaz');
    let ay = B.hedefSec([g1], s1, 0, 'Dosya No', V).ayar;
    eq([s1.secili, s1.neden, s1.dosyaSayisi], [true, '', 2], 'Dosya No elle seçilince sayfa yazılabilir olur');
    eq(B.sutunEkle(ay, 'araç haczi').hata, '"Araç Haczi" adında bir sütun zaten var.', 'aynı adda ikinci sütun açılmaz');
    ay = B.sutunEkle(ay, ' Haciz  Bilgisi ').ayar;
    eq(ay.sutunlar[ay.sutunlar.length - 1], 'Haciz Bilgisi', 'yeni sütun listenin sonuna eklenir');
    ay = B.hedefSec([g1], s1, 4, 'Haciz Bilgisi', ay).ayar;
    ay = B.hedefSec([g1], s1, 5, 'Haciz Bilgisi', ay).ayar;
    eq(ay.esler, [{ gelen: 'Numara', hedef: 'Dosya No' }, { gelen: 'Araç Haczi Durumu', hedef: 'Haciz Bilgisi' }, { gelen: 'Tapu Durumu', hedef: 'Haciz Bilgisi' }], 'elle yapılan seçimler hatırlanır');
    eq(s1.kullanilmayan, ['Memur Notu'], 'eşleşmeyen sütun kullanılmayanlarda');
    const r7 = B.birlestir(B.bosDurum(ay), [g1], ay, new Date(2026, 10, 14, 9, 0));
    eq([satir(r7.durum, 'Deneme Bankası', '2026/501')['Haciz Bilgisi'], satir(r7.durum, 'Deneme Bankası', '2026/502')['Haciz Bilgisi'], satir(r7.durum, 'Deneme Bankası', '2026/501')['Araç Haczi']], ['Araç Haczi Durumu: Var - Tapu Durumu: Yok', 'Araç Haczi Durumu: Yok', undefined], 'aynı sütuna bağlanan iki kolon kendi başlığıyla yazılır');
    const g2 = B.dosyayiCozumle('haciz listesi 2.xlsx', [{ ad: 'Liste', satirlar: [hacizBasliklari, ['2026/503', 'İzmir 2. İcra Dairesi', 'ALİ KAYA', X.BANKA, 'Var', 'Var', 'b']] }], ay);
    const s2 = g2.sayfalar[0];
    eq([s2.hedefler[0], s2.hedefler[4], s2.hedefler[5], s2.secili], ['Dosya No', 'Haciz Bilgisi', 'Haciz Bilgisi', true], 'aynı başlıklı yeni dosyada seçim kendiliğinden gelir');
    let hs = B.hedefSec([g1, g2], s1, 6, 'Kesinleşme Bilgisi', ay);
    ay = hs.ayar;
    eq([hs.yayilan, s2.hedefler[6]], [1, 'Kesinleşme Bilgisi'], 'seçim yüklü öteki sayfadaki aynı adlı sütuna da uygulanır');
    ay = B.hedefSec([g1, g2], s2, 6, '', ay).ayar;
    hs = B.hedefSec([g1, g2], s1, 6, 'Tapu Haczi', ay);
    ay = hs.ayar;
    eq([hs.yayilan, s1.hedefler[6], s2.hedefler[6]], [0, 'Tapu Haczi', ''], 'öteki sayfada elle yapılmış seçim korunur');
    const kapali = B.hedefSec([], B.dosyayiCozumle('x.xlsx', [{ ad: 'S', satirlar: [['Dosya No', 'Araç Haczi Durumu'], ['2026/1', 'Var']] }], V).sayfalar[0], 1, '', V).ayar;
    eq(kapali.esler, [{ gelen: 'Araç Haczi Durumu', hedef: B.KULLANMA }], 'önerilen eşleşme kapatılınca "kullanma" olarak hatırlanır');
    eq(B.dosyayiCozumle('y.xlsx', [{ ad: 'S', satirlar: [['Dosya No', 'Araç Haczi Durumu', 'Borçlu'], ['2026/1', 'Var', 'ALİ KAYA']] }], kapali).sayfalar[0].hedefler, ['Dosya No', '', 'Borçlu Adı'], 'kapatılan sütun sonraki dosyada da kullanılmaz');
    const bankaElle = await dosya('banka 3.xlsx', X.bankaDosyasi());
    ay = B.hedefSec([bankaElle], bankaElle.sayfalar[0], 8, 'Haciz Bilgisi', ay).ayar;
    eq(bankaElle.sayfalar[0].eslesmeler.filter(function (e) { return e.hedef === 'Haciz Bilgisi'; }).map(function (e) { return e.gelen; }), ['Toplam Bakiye'], 'özet sütununda kullanılan ham sütun ayrıca da yazdırılabilir');

    /* 11) Ana Excel sütunları: ad değiştirme, silme, sıra, özel liste */
    const d8 = JSON.parse(JSON.stringify(r7.durum));
    const adDegisti = B.sutunAdiDegistir(ay, 'Haciz Bilgisi', 'Haciz Durumu', d8, [g1, g2]);
    eq([satir(d8, 'Deneme Bankası', '2026/501')['Haciz Durumu'], satir(d8, 'Deneme Bankası', '2026/501')['Haciz Bilgisi'], s1.hedefler[4]], ['Araç Haczi Durumu: Var - Tapu Durumu: Yok', undefined, 'Haciz Durumu'], 'ad değişince ana tablodaki bilgi ve eşleştirmeler yeni ada taşınır');
    ok(adDegisti.ayar.esler.some(function (e) { return e.gelen === 'Araç Haczi Durumu' && e.hedef === 'Haciz Durumu'; }) && adDegisti.ayar.esler.some(function (e) { return e.gelen === 'Haciz Bilgisi' && e.hedef === 'Haciz Durumu'; }), 'hatırlanan eşleştirmeler yeni adı gösterir');
    const eskiAd = B.sutunAdiDegistir(V, 'Araç Haczi', 'Haciz Bilgisi');
    const yeniDosya = B.dosyayiCozumle('z.xlsx', [{ ad: 'S', satirlar: [['Dosya No', 'Araç Haczi', 'Araç Haciz Durumu'], ['2026/1', 'Var', 'Var']] }], eskiAd.ayar);
    eq(yeniDosya.sayfalar[0].hedefler, ['Dosya No', 'Haciz Bilgisi', 'Haciz Bilgisi'], 'adı değişen sütunun eski adı ve eş adları yeni sütuna gider');
    ok(B.sutunAdiDegistir(V, 'Dosya No', 'Esas No').hata && B.sutunAdiDegistir(V, 'Tapu Haczi', 'araç haczi').hata && B.sutunAdiDegistir(V, 'Tapu Haczi', 'Kaynak').hata && B.sutunAdiDegistir(V, 'Tapu Haczi', '  ').hata, 'sabit ad, var olan ad, ayrılmış ad ve boş ad kabul edilmez');
    eq(B.doluHucreSayisi(d8, 'Haciz Durumu'), 2, 'silmeden önce dolu hücre sayılır');
    const silindi = B.sutunSil(adDegisti.ayar, 'Haciz Durumu', d8);
    eq([satir(d8, 'Deneme Bankası', '2026/501')['Haciz Durumu'], silindi.ayar.sutunlar.indexOf('Haciz Durumu'), silindi.ayar.esler.filter(function (e) { return e.hedef === 'Haciz Durumu'; }).length], [undefined, -1, 0], 'silinen sütun tablodan, listeden ve hatırlananlardan çıkar');
    B.hedefleriYenile(g1, silindi.ayar);
    eq([s1.hedefler[4], s1.hedefler[5]], ['Araç Haczi', ''], 'silinen sütuna bağlı kolonlar öneriye döner');
    ok(B.sutunSil(V, 'İcra Dairesi').hata && B.sutunSil(V, 'Dosya No').hata && !B.sutunSil(V, 'Alacaklı').hata, 'satır anahtarı silinemez, öteki sütunlar silinebilir');
    eq(B.sutunTasi(V, 'Dosya No', -1).ayar.sutunlar.slice(0, 4), ['Borçlu Adı', 'Borçlu TCKN / VKN', 'Dosya No', 'İcra Dairesi'], 'sütun sırası değişir');
    const ozel = { kurumlar: V.kurumlar, esler: [], sutunlar: ['Dosya No', 'İcra Dairesi', 'Borçlu Adı', 'Alacaklı', 'Haciz Bilgisi'] };
    const gOzel = B.dosyayiCozumle('ö.xlsx', [{ ad: 'S', satirlar: [['Dosya No', 'Birim', 'Borçlu', 'Alacaklı', 'Haciz Bilgisi', 'Araç Sorgusu'], ['2026/601', 'Bursa 1. İcra Dairesi', 'ALİ KAYA', X.BANKA, 'Maaş haczi var', 'Yok']] }], ozel);
    eq(gOzel.sayfalar[0].hedefler, ['Dosya No', 'İcra Dairesi', 'Borçlu Adı', 'Alacaklı', 'Haciz Bilgisi', ''], 'listede olmayan sütuna öneri yapılmaz, özel sütun adıyla eşleşir');
    const rOzel = B.birlestir(B.bosDurum(ozel), [gOzel], ozel, new Date(2026, 10, 14, 10, 0));
    const ozelSayfalar = await O.oku(await Y.bayt(B.ciktiSayfalari(rOzel.durum, ozel, [])), 'özel.xlsx');
    eq(ozelSayfalar[0].satirlar.slice(0, 2), [['Dosya No', 'İcra Dairesi', 'Borçlu Adı', 'Alacaklı', 'Haciz Bilgisi', 'Son Güncelleme', 'Kaynak'], ['2026/601', 'Bursa 1. İcra Dairesi', 'ALİ KAYA', X.BANKA, 'Maaş haczi var', '14.11.2026', 'ö.xlsx']], 'ana Excel yalnız seçilen sütunlarla ve o sırayla yazılır');
    const ozelCoz = B.anaExceliCoz(ozelSayfalar);
    eq([ozelCoz.sutunlar, satir(ozelCoz.durum, 'Deneme Bankası', '2026/601')['Haciz Bilgisi']], [ozel.sutunlar, 'Maaş haczi var'], 'özel sütunlar ana Excel yeniden yüklenince aynı kalır');
    eq(B.sutunlariSifirla(ozel, ozelCoz.durum).ayar.sutunlar, B.VARSAYILAN_SUTUNLAR.concat(['Haciz Bilgisi']), 'varsayılana dönünce içi dolu ek sütun korunur');

    /* 12) Aynı icra dairesi ve dosya no: aynı Excel'de ve ayrı Excel'lerde tek satır */
    const cok = B.dosyayiCozumle('çok borçlu.xlsx', [{ ad: 'S', satirlar: [
      ['Dosya No', 'İcra Dairesi', 'Borçlu', 'TCKN', 'Alacaklı', 'Maaş Sorgusu'],
      ['2026/700', 'Bursa 3. İcra Dairesi', 'ALİ KAYA', '11111111110', X.BANKA, 'SGK kaydı var'],
      ['2026/700', 'Bursa 3. İcra Müdürlüğü', 'VELİ KAYA', '22222222220', X.BANKA, 'Kayıt yok'],
      ['2026/0700', 'Bursa 3. İcra Dairesi', 'ALİ KAYA', '11111111110', X.BANKA, 'SGK kaydı var'],
      ['2026/701', 'Bursa 3. İcra Dairesi', 'CEM ARI', '', X.BANKA, 'Kayıt yok'],
      ['2026/700', 'Bursa 5. İcra Dairesi', 'ELİF NUR', '', X.BANKA, 'Kayıt yok']
    ] }], V);
    eq([cok.sayfalar[0].okunanSatir, cok.sayfalar[0].dosyaSayisi], [5, 3], 'beş satır üç ayrı dosya (aynı numara başka dairede ayrı dosyadır)');
    const r9 = B.birlestir(B.bosDurum(V), [cok], V, new Date(2026, 10, 15, 9, 0));
    const b3 = tablo(r9.durum, 'Deneme Bankası').satirlar.filter(function (x) { return H.daireNorm(x['İcra Dairesi']) === 'BURSA 3'; });
    eq([tablo(r9.durum, 'Deneme Bankası').satirlar.length, b3.length], [3, 2], 'aynı Excel\'deki aynı dosya satırları tek satırda');
    eq([b3[0]['Borçlu Adı'], b3[0]['Borçlu TCKN / VKN'], b3[0]['Maaş Sorgusu']], ['ALİ KAYA; VELİ KAYA', '11111111110; 22222222220', 'ALİ KAYA: SGK kaydı var; VELİ KAYA: Kayıt yok'], 'borçlular, kimlik numaraları ve bilgiler tek satırda');
    eq([r9.ozetler[0].yeni, r9.ozetler[0].birlesen, r9.ozetler[0].dosyaSayisi, r9.rapor[0][2]], [3, 2, 3, '2, 3, 4'], 'özet ve rapor birleşen satırları gösterir');
    const cok2 = B.dosyayiCozumle('çok borçlu 2.xlsx', [{ ad: 'S', satirlar: [['Dosya No', 'Birim', 'Borçlu', 'Maaş Sorgusu', 'Tapu Sorgusu'], ['2026/700', 'Bursa 3. İcra Dairesi', 'Veli Kaya', 'SGK kaydı var', 'Taşınmaz yok']] }], V);
    const r10 = B.birlestir(r9.durum, [cok2], V, new Date(2026, 10, 16, 9, 0));
    const t700 = tablo(r10.durum, 'Deneme Bankası').satirlar.filter(function (x) { return H.daireNorm(x['İcra Dairesi']) === 'BURSA 3' && x['Dosya No'] === '2026/700'; });
    eq([tablo(r10.durum, 'Deneme Bankası').satirlar.length, t700.length, r10.ozetler[0].yeni, r10.ozetler[0].guncellenen], [3, 1, 0, 1], 'ayrı Excel\'den gelen aynı dosya yeni satır açmaz');
    eq([t700[0]['Borçlu Adı'], t700[0]['Maaş Sorgusu'], t700[0]['Tapu Sorgusu'], t700[0]['Kaynak']], ['ALİ KAYA; VELİ KAYA', 'ALİ KAYA: SGK kaydı var; VELİ KAYA: SGK kaydı var', 'VELİ KAYA: Taşınmaz yok', 'çok borçlu 2.xlsx'], 'ayrı Excel aynı satırda yalnız ilgili borçlunun bilgisini günceller');
    const tekrar = B.birlestir(r10.durum, [cok, cok2], V, new Date(2026, 10, 17, 9, 0));
    const t700b = tablo(tekrar.durum, 'Deneme Bankası').satirlar.filter(function (x) { return H.daireNorm(x['İcra Dairesi']) === 'BURSA 3' && x['Dosya No'] === '2026/700'; });
    eq([tablo(tekrar.durum, 'Deneme Bankası').satirlar.length, tekrar.ozetler[0].yeni + tekrar.ozetler[1].yeni, t700b[0]['Borçlu Adı'], t700b[0]['Maaş Sorgusu']], [3, 0, 'ALİ KAYA; VELİ KAYA', 'ALİ KAYA: SGK kaydı var; VELİ KAYA: SGK kaydı var'], 'aynı dosyalar yeniden yüklenince satır da borçlu da çoğalmaz, son bilgi geçerli kalır');

    /* 13) Hız: 3.000 satırlık banka dosyası */
    const t0 = performance.now();
    const buyuk = await dosya('büyük.xlsx', X.buyukBankaDosyasi(3000));
    const rb = B.birlestir(B.bosDurum(V), [buyuk], V, new Date());
    const by = await Y.bayt(B.ciktiSayfalari(rb.durum, V, []));
    const sure = Math.round(performance.now() - t0);
    eq(rb.ozetler[0].yeni, 3000, '3.000 satır işlendi');
    ok(sure < 5000, '3.000 satır 5 saniyeden kısa sürer (' + sure + ' ms, çıktı ' + Math.round(by.length / 1024) + ' KB)');

    /* Denetim için çıktıyı yerel test sunucusuna kaydet (yalnız yerel adreste; canlı sitede gönderilmez) */
    if (['localhost', '127.0.0.1'].includes(location.hostname)) try {
      await fetch('/kaydet?ad=ornek-ana-excel.xlsx', { method: 'POST', body: son2 });
      await fetch('/kaydet?ad=ornek-banka-cevaplari.xlsx', { method: 'POST', body: await xlsx(X.bankaDosyasi()) });
      await fetch('/kaydet?ad=ornek-tebligat-raporu.xlsx', { method: 'POST', body: await xlsx(X.tebligatDosyasi()) });
      await fetch('/kaydet?ad=ornek-arac-sorgu.xlsx', { method: 'POST', body: await xlsx(X.aracDosyasi()) });
    } catch (e) { cikti.push('(örnek dosyalar kaydedilemedi: ' + e.message + ')'); }
  } catch (e) {
    kalan++;
    cikti.push('HATA  beklenmeyen hata: ' + (e && e.stack ? e.stack : e));
  }
  const ozet = 'TOPLAM ' + gecen + ' geçti, ' + kalan + ' kaldı';
  document.getElementById('sonuc').textContent = cikti.join('\n') + '\n\n' + ozet;
  document.title = 'TEST ' + gecen + '/' + (gecen + kalan);
  window.TEST_SONUCU = { gecen: gecen, kalan: kalan, cikti: cikti };
})();
