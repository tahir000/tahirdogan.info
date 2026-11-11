/*
 * Excel Birleştirme testleri. test.html açılınca çalışır; sonuç sayfaya ve
 * sekme başlığına yazılır ("TEST 50/50").
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
    ok(H.benzerAd('DENİZ İNŞ. TİC. LTD. ŞTİ.', 'DENİZ İNŞAAT TİCARET LİMİTED ŞİRKETİ'), 'kısaltmalı şirket adı aynı sayılır');
    ok(!H.benzerAd('MEHMET YILMAZ', 'MEHMET DEMİR'), 'farklı kişi aynı sayılmaz');
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
    const r1 = B.birlestir(B.bosDurum(V), [bc], V, new Date(2026, 10, 11, 10, 0));
    const D1 = r1.durum;
    eq(tablo(D1, 'Örnek Altyapı').satirlar.length, 3, 'Örnek Altyapı sayfasında 3 borçlu');
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
    eq([r2.ozetler[0].yeni, r2.ozetler[0].guncellenen, r2.ozetler[0].degismeyen, r2.ozetler[0].atlanan], [1, 3, 1, 1], 'tebligat özeti');
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

    /* 7) Birden çok borçlu ve adsız satır */
    const iki = B.anaExceliCoz([{ ad: 'Örnek Altyapı', satirlar: [['Borçlu Adı', 'İcra Dairesi', 'Dosya No'], ['A KİŞİ', 'İstanbul 1. İcra Dairesi', '2026/9'], ['B KİŞİ', 'İstanbul 1. İcra Dairesi', '2026/9']] }]);
    const adsiz = B.dosyayiCozumle('k.xlsx', [{ ad: 'S', satirlar: [['Dosya No', 'İcra Dairesi', 'Kesinleşme'], ['2026/9', 'İstanbul 1. İcra Dairesi', 'Kesinleşti']] }], V);
    const r5 = B.birlestir(iki.durum, [adsiz], V, new Date());
    eq(r5.ozetler[0].atlamaNedenleri, { 'Dosyada birden çok borçlu var, satırda borçlu adı yok': 1 }, 'çok borçlulu dosyada adsız satır atlanır');

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
    eq(son[1].satirlar[0][son[1].satirlar[0].length - 1], 'Haczedilen Mal', 'yeni sütun en sonda');
    const elle = B.anaExceliCoz([{ ad: 'Örnek Altyapı', satirlar: [['Borçlu Adı', 'Dosya No', 'İcra Dairesi', 'Avukat Notu'], ['X', '2026/1', 'İstanbul 1. İcra Dairesi', 'önemli']] }]);
    const elleCikti = B.ciktiSayfalari(elle.durum, V, []);
    const ica = elleCikti.find(function (s) { return s.ad === 'Örnek Altyapı'; });
    eq([ica.satirlar[0][ica.satirlar[0].length - 1], ica.satirlar[1][ica.satirlar[0].length - 1]], ['Avukat Notu', 'önemli'], 'elle eklenen sütun korunur');

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

    /* 10) Hız: 3.000 satırlık banka dosyası */
    const t0 = performance.now();
    const buyuk = await dosya('büyük.xlsx', X.buyukBankaDosyasi(3000));
    const rb = B.birlestir(B.bosDurum(V), [buyuk], V, new Date());
    const by = await Y.bayt(B.ciktiSayfalari(rb.durum, V, []));
    const sure = Math.round(performance.now() - t0);
    eq(rb.ozetler[0].yeni, 3000, '3.000 satır işlendi');
    ok(sure < 5000, '3.000 satır 5 saniyeden kısa sürer (' + sure + ' ms, çıktı ' + Math.round(by.length / 1024) + ' KB)');

    /* Denetim için çıktıyı yerel sunucuya kaydet (varsa) */
    try {
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
