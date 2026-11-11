/*
 * Test için örnek UYAP takip XML'leri. Yapı icra programı çıktısına benzer
 * (vekil, alacaklı ve borçlu tarafları, alacak kalemleri, ref atıfları);
 * kişi, kurum ve sayılar uydurmadır. Her dosya aynı iç kimlikleri kullanır,
 * birleştirmede çakışma bu yüzden olur.
 */
(function (kok) {
  'use strict';

  const ALACAKLI = 'ÖRNEK BANKASI A.Ş.';

  function blok(borclular, tutar, kalemler) {
    let s = '<dosya dosyaTipi="Genel İcra Dairesi" dosyaTuru="0" takipTuru="1" takipYolu="0" takipSekli="0" mahiyetKodu="1">';
    s += '<VekilKisi id="VekilKisi_1"><vekil id="vekil_2" adi="DENEME VEKİL" baroNo="1"/><kisiTumBilgileri id="kisiTumBilgileri_3" adi="DENEME" soyadi="VEKİL"/><adres id="adres_4" il="İSTANBUL" adres="Örnek Mahallesi 1"/></VekilKisi>';
    s += '<taraf id="taraf_11"><kisiKurumBilgileri ad="' + ALACAKLI + '" id="kisiKurumBilgileri_12"><kurum id="kurum_13" kurumAdi="' + ALACAKLI + '"/><adres id="adres_14" il="İSTANBUL"/></kisiKurumBilgileri><rolTur Rol="ALACAKLI" rolID="21"/><iban no="0"/><ref id="VekilKisi_1" to="VekilKisi"/></taraf>';
    borclular.forEach(function (ad, i) {
      const n = 21 + i * 10;
      s += '<taraf id="taraf_' + n + '"><kisiKurumBilgileri ad="' + ad + '" id="kisiKurumBilgileri_' + (n + 1) + '"><kisiTumBilgileri id="kisiTumBilgileri_' + (n + 2) + '" adi="X" soyadi="Y"/><adres id="adres_' + (n + 3) + '" il="ANKARA"/></kisiKurumBilgileri><rolTur Rol="BORÇLU/MÜFLİS" rolID="22"/></taraf>';
    });
    s += '<digerAlacak id="digerAlacak_91" tutar="' + tutar + '" tutarTur="PRBRMTL">';
    kalemler.forEach(function (t, i) {
      s += '<alacakKalemi id="alacakKalemi_' + (92 + i) + '" alacakKalemTutar="' + t + '" tutarTur="PRBRMTL"><ref id="taraf_11" to="taraf"/><ref id="taraf_21" to="taraf"/>' + (i === 0 ? '<faiz id="faiz_99" faizOran="24"/>' : '') + '</alacakKalemi>';
    });
    return s + '</digerAlacak></dosya>';
  }

  function takipXml(borclular, tutar, kalemler, ikinciBlok) {
    return '<?xml version="1.0" encoding="UTF-8"?><exchangeData><exchangeHeader versiyon="1.1" /><dosyalar>' +
      blok(borclular, tutar, kalemler) + (ikinciBlok ? blok(ikinciBlok, '10.00', ['10.00']) : '') +
      '</dosyalar></exchangeData>';
  }

  kok.UyapOrnekler = {
    ALACAKLI: ALACAKLI,
    takipXml: takipXml,
    dosyalar: function () {
      return [
        ['Galle_1001.xml', takipXml(['ZEYNEP ARSLAN'], '12500.50', ['10000.00', '2000.00', '500.50'])],
        ['Galle_1002.xml', takipXml(['ÇAĞLA KAYA'], '8000.00', ['8000.00'])],
        ['Galle_1003.xml', takipXml(['AHMET YILMAZ'], '49817.29', ['40000.00', '9817.29'])]
      ];
    }
  };
})(typeof window !== 'undefined' ? window : this);
