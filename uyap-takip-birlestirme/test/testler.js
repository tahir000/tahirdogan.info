/*
 * VakıfBank Takip XML Birleştirme testleri. test.html açılınca çalışır; sonuç sayfaya
 * ve sekme başlığına yazılır ("TEST 30/30").
 */
(async function () {
  'use strict';
  const U = window.UyapBirlestirme, Z = window.ZipYazici, X = window.UyapOrnekler;
  const cikti = [];
  let gecen = 0, kalan = 0;
  function eq(gelen, beklenen, ad) {
    const a = JSON.stringify(gelen), b = JSON.stringify(beklenen);
    if (a === b) { gecen++; cikti.push('ok    ' + ad); }
    else { kalan++; cikti.push('HATA  ' + ad + '\n        beklenen: ' + b + '\n        gelen:    ' + a); }
  }
  function ok(kosul, ad) { eq(!!kosul, true, ad); }
  async function hata(fn) { try { await fn(); return ''; } catch (e) { return e.message; } }
  function kimliksiz(m) { return m.replace(/(\sid=")[^"]+(")/g, '$1$2'); }
  const kodla = new TextEncoder();

  try {
    /* 1) Okuma */
    const ornek = X.dosyalar();
    const k1 = U.oku(ornek[0][1]);
    eq([k1.borclular, k1.alacaklilar, k1.takipSayisi, k1.tutar, k1.bloklar.length], [['ZEYNEP ARSLAN'], [X.ALACAKLI], 1, 12500.5, 1], 'borçlu, alacaklı, takip sayısı ve tutar okunur');
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF].concat(Array.from(kodla.encode(ornek[0][1]))));
    eq(U.metneCevir(bom).metin.slice(0, 5), '<?xml', 'BOM atlanır');
    eq(U.metneCevir(kodla.encode(ornek[1][1])).utf8, true, 'UTF-8 tanınır');
    ok(/UYAP takip XML'i değil/.test(await hata(function () { U.oku('<?xml version="1.0"?><kok><a/></kok>'); })), 'başka XML reddedilir');
    ok(/XML okunamadı/.test(await hata(function () { U.oku('<exchangeData><dosyalar>'); })), 'bozuk XML reddedilir');
    ok(/UYAP takip XML'i değil/.test(await hata(function () { U.oku('<exchangeData><dosyalar></dosyalar></exchangeData>'); })), 'takipsiz dosya reddedilir');
    eq(U.oku(X.takipXml(['A KİŞİ', 'B KİŞİ'], '1.00', ['1.00'])).borclular, ['A KİŞİ', 'B KİŞİ'], 'birden çok borçlu okunur');

    /* 2) Sıralama ve adlar */
    const kayitlar = ornek.map(function (d) { const k = U.oku(d[1]); k.dosyaAdi = d[0]; return k; });
    const sirali = U.sirala(kayitlar);
    eq(sirali.map(function (k) { return k.borclular[0]; }), ['AHMET YILMAZ', 'ZEYNEP ARSLAN', 'ÇAĞLA KAYA'], 'borçlu adına göre sıralanır (scriptle aynı harf kodu sırası)');
    const kisa = sirali.map(U.kisaAd);
    eq(U.birlesikAd(kisa), 'Toplu Takip - AHMET YILMAZ, ZEYNEP ARSLAN, ÇAĞLA KAYA.xml', 'üç dosyada adlar birleşik dosya adına yazılır');
    eq(U.birlesikAd(['A', 'B', 'C', 'D']), 'Toplu Takip - 4 dosya.xml', 'dörtten fazlasında sayı yazılır');
    eq(U.birlesikAd(['X'.repeat(120), 'Y'.repeat(120)]), 'Toplu Takip - 2 dosya.xml', 'çok uzun ad kısaltılır');
    eq(U.kisaAd({ borclular: ['A KİŞİ', 'B KİŞİ'] }), 'A KİŞİ - B KİŞİ', 'iki borçlu tire ile');
    eq(U.kisaAd({ borclular: ['AYŞE/FATMA: "X"'] }), 'AYŞE FATMA X', 'dosya adında yasak karakterler temizlenir');
    eq(U.kisaAd({ borclular: [] }), 'BORÇLU ADI YOK', 'borçlusuz dosya');
    eq(U.benzersiz(['A.xml', 'A.xml', 'a.xml']), ['A.xml', 'A (2).xml', 'a (3).xml'], 'aynı ad ikinci kez çıkarsa numara alır');
    eq(U.klasorAdi(new Date(2026, 10, 11, 9, 5), 3), '2026-11-11 09.05 - 3 dosya', 'klasör adı');

    /* 3) Birleştirme */
    const r = U.birlestir(sirali);
    const d = U.dogrula(r.metin);
    eq([d.takip, d.id, d.ref], [3, 48, 15], 'üç takip, tüm kimlikler benzersiz, tüm atıflar çözülüyor');
    eq(r.degisen, [0, 16, 15], 'ilk dosyada değişiklik yok, sonrakilerde çakışan kimlikler yenilenir');
    ok(r.metin.indexOf('id="taraf_1000011"') !== -1 && r.metin.indexOf('id="taraf_2000011"') !== -1, 'yeni kimlikler scriptteki kurala uyar (taraf_11 → taraf_1000011)');
    const beklenen = '<?xml version="1.0" encoding="UTF-8"?><exchangeData><exchangeHeader versiyon="1.1" /><dosyalar>' +
      sirali.map(function (k) { return k.bloklar[0]; }).join('') + '</dosyalar></exchangeData>';
    eq(kimliksiz(r.metin), kimliksiz(beklenen), 'kimlikler dışında içerik birebir korunur');
    const ikiBloklu = U.oku(X.takipXml(['DENİZ ÇELİK'], '20.00', ['10.00', '10.00'], ['EMRE ŞAHİN']));
    eq(ikiBloklu.takipSayisi, 2, 'iki takipli dosya okunur');
    const r2 = U.birlestir([ikiBloklu, sirali[0]]);
    eq(U.dogrula(r2.metin).takip, 3, 'iki takipli dosya da birleşir ve denetimden geçer');
    ok(/Çözülmeyen ref/.test(await hata(function () { U.dogrula(sirali[0].metin.replace('<ref id="taraf_11" to="taraf"/>', '<ref id="taraf_77" to="taraf"/>')); })), 'çözülmeyen atıf yakalanır');
    ok(/tekrar eden id/.test(await hata(function () { U.dogrula(beklenen); })), 'birleştirilmemiş tekrar eden kimlik yakalanır');
    eq(U.birlestir([sirali[0]]).metin, sirali[0].metin, 'tek dosyada çıktı aynıdır');

    /* 4) ZIP */
    const zip = await Z.olustur([['2026-11-11 09.05 - 3 dosya/Toplu Takip - ÇAĞLA.xml', kodla.encode(r.metin)], ['2026-11-11 09.05 - 3 dosya/ÇAĞLA KAYA.xml', kodla.encode(ornek[1][1])]]);
    const dv = new DataView(zip.buffer);
    eq([dv.getUint32(0, true), dv.getUint32(zip.length - 22, true), dv.getUint16(zip.length - 12, true)], [0x04034b50, 0x06054b50, 2], 'ZIP başlığı ve iki giriş');
    const adUz = dv.getUint16(26, true);
    eq(new TextDecoder().decode(zip.subarray(30, 30 + adUz)), '2026-11-11 09.05 - 3 dosya/Toplu Takip - ÇAĞLA.xml', 'ZIP içinde Türkçe ad korunur');

    /* Python scriptiyle karşılaştırma için örnekleri ve çıktıyı yerel test sunucusuna kaydet (yalnız yerel adreste; canlı sitede gönderilmez) */
    if (['localhost', '127.0.0.1'].includes(location.hostname)) try {
      for (const o of ornek) await fetch('/kaydet?ad=' + encodeURIComponent('uyap-ornek-' + o[0]), { method: 'POST', body: kodla.encode(o[1]) });
      await fetch('/kaydet?ad=uyap-js-cikti.xml', { method: 'POST', body: kodla.encode(r.metin) });
      await fetch('/kaydet?ad=uyap-ornek.zip', { method: 'POST', body: zip });
    } catch (e) { cikti.push('(örnekler kaydedilemedi: ' + e.message + ')'); }
  } catch (e) {
    kalan++;
    cikti.push('HATA  beklenmeyen hata: ' + (e && e.stack ? e.stack : e));
  }
  document.getElementById('sonuc').textContent = cikti.join('\n') + '\n\nTOPLAM ' + gecen + ' geçti, ' + kalan + ' kaldı';
  document.title = 'TEST ' + gecen + '/' + (gecen + kalan);
  window.TEST_SONUCU = { gecen: gecen, kalan: kalan, cikti: cikti };
})();
