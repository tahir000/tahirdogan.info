/*
 * Test için örnek dosyalar. Yapı gerçek dosyalara benzer (banka cevapları,
 * tebligat raporu); kişi ve şirket adları uydurmadır.
 */
(function (kok) {
  'use strict';

  const ALTYAPI = 'ÖRNEK ALTYAPI YATIRIM A.Ş.';
  const BANKA = 'DENEME BANKASI T.A.O.';

  const bankaBasliklari = ['Föy No', 'Karşı yan', 'Alacaklı', 'İcra Dairesi', 'Dosya No', 'Hata', 'Evrak Sayısı', 'İ.B.C.S.', 'Toplam Bakiye', 'İş Emri'];
  const bankaSatirlari = [
    [9101, 'AHMET YILMAZ', ALTYAPI, 'İstanbul 8. İcra Dairesi', '2026/10101', null, 25, 11, 4250.4, null],
    [9102, 'DENİZ İNŞAAT TİCARET LİMİTED ŞİRKETİ', ALTYAPI, 'İstanbul 19. İcra Dairesi', '2026/20202', '2 adet banka evrakı incelenemedi.', 12, 5, null, null],
    [9103, 'MEHMET KAYA', ALTYAPI, 'İstanbul 4. İcra Dairesi', '2026/30303', null, 0, null, null, null],
    [9104, 'AYŞE DEMİR', BANKA, 'İstanbul 12. İcra Dairesi', '2026/40404', null, 8, 3, 0, 1],
    [9105, 'ZEYNEP ARSLAN', 'XYZ ENERJİ A.Ş.', 'Ankara 3. İcra Dairesi', '2026/1001', null, 5, 2, 120.5, null]
  ];
  /* Elle süzülmüş alt küme: başlıksız iki sütun, Alacaklı yok */
  const sayfa1Basliklari = ['Föy No', 'Karşı yan', 'İcra Dairesi', 'Dosya No', null, null, 'Hata', 'Evrak Sayısı', 'İ.B.C.S.', 'Toplam Bakiye', 'İş Emri'];
  const sayfa1Satirlari = [
    [9101, 'AHMET YILMAZ', 'İstanbul 8. İcra Dairesi', '2026/10101', 'İstanbul 8.2026/10101', 515, null, 25, 11, 4250.4, 1],
    [9104, 'AYŞE DEMİR', 'İstanbul 12. İcra Dairesi', '2026/40404', 'İstanbul 12.2026/40404', 610.5, null, 8, 3, 0, 1]
  ];

  function bankaDosyasi() {
    return [
      { ad: 'TfrIslemBankaCevaplariIncele_20', satirlar: [bankaBasliklari].concat(bankaSatirlari) },
      { ad: 'Sayfa1', satirlar: [sayfa1Basliklari].concat(sayfa1Satirlari) }
    ];
  }

  /* Tebligat raporu: son dört sütunun başlığı yok (barkod, kayıt zamanı, sonuç, tebliğ zamanı) */
  const tebBasliklari = ['Birim', 'Dosya No', 'Dosya Türü', 'İşlem Türü', 'Son İşlem Tarihi', 'Açıklama', null, null, null, null];
  const KAYIT = 'Tebligat Sonuç Bilgileri Kaydedildi';
  function teb(birim, dosya, tur, taraf, barkod, durum, h, sonuc, j) {
    return [birim, dosya, tur, KAYIT, '09/11/2026', KAYIT + (taraf ? ' [' + taraf + ']' : '') + ' - ' + barkod + ' - ' + durum, barkod, h, sonuc, j];
  }
  const tebSatirlari = [
    teb('İstanbul 8. İcra Dairesi', '2026/10101', 'İcra Dosyası', 'BORÇLU VE MÜFLİS AHMET YILMAZ', '4000000000101', 'Tebliğ Edildi', '06/11/2026 15:55:57', '21.MAD. GORE MUHTARA TESLiM / Mu****', '04/11/2026 16:05:17'),
    teb('İstanbul 8. İcra Dairesi', '2026/10101', 'İcra Dosyası', 'BORÇLU VE MÜFLİS AHMET YILMAZ', '4000000000202', 'Tebliğ Edilmedi', '02/10/2026 10:00:00', 'İADE Tanınmıyor', '01/10/2026 09:00:00'),
    teb('İstanbul 19. İcra Dairesi', '2026/20202', 'İcra Dosyası', 'BORÇLU VE MÜFLİS DENİZ İNŞ. TİC. LTD. ŞTİ.', '4000000000303', 'Tebliğ Edilmedi', '05/11/2026 16:22:36', 'İADE Adres Hatalı', '03/11/2026 14:30:37'),
    teb('Çerkezköy İcra Dairesi', '2026/555', 'Talimat Dosyası', 'BORÇLU VE MÜFLİS HASAN ÇELİK', '4000000000404', 'Tebliğ Edildi', '05/11/2026 15:14:30', 'MUHATABA BiZZAT TESLiM / Ha****', '02/11/2026 11:00:00'),
    teb('İstanbul 12. İcra Dairesi', '2026/40404', 'İcra Dosyası', '', '4000000000505', 'Tebliğ Edildi', '06/11/2026 15:15:18', '35.MAD. GORE MUHATAP ADRESi KAPISINA YAPISTIRMA / Ke****', '05/11/2026 14:59:33'),
    teb('İstanbul 8. İcra Dairesi', '2026/10101', 'İcra Dosyası', 'ALACAKLI VEKİLİ AV. ALİ VELİ', '4000000000606', 'Tebliğ Edildi', '06/11/2026 10:00:00', 'MUHATABA BiZZAT TESLiM / Al****', '04/11/2026 10:00:00')
  ];

  function tebligatDosyasi() {
    return [{ ad: 'ANA RAPOR', satirlar: [tebBasliklari].concat(tebSatirlari) }];
  }

  function aracDosyasi() {
    return [{
      ad: 'Sayfa1', satirlar: [
        ['ARAÇ SORGU SONUÇLARI'],
        [],
        ['Dosya No', 'Birim', 'Borçlu', 'TC Kimlik No', 'Araç Sorgu Sonucu', 'Araç Haciz', 'Not'],
        ['2026/10101', 'İstanbul 8. İcra Dairesi', 'Ahmet Yılmaz', '12345678901', 'Kayıt bulunamadı', '', 'x'],
        ['2026/20202', 'İstanbul 19. İcra Dairesi', 'DENİZ İNŞAAT TİCARET LİMİTED ŞİRKETİ', '', '1 adet araç var', 'Var, 05.11.2026', ''],
        ['2026/77777', '', 'Yeni Kişi', '', 'Yok', '', '']
      ]
    }];
  }

  /* Büyük dosya: hız denemesi için */
  function buyukBankaDosyasi(n) {
    const satirlar = [bankaBasliklari];
    for (let i = 0; i < n; i++) {
      satirlar.push([20000 + i, 'BORÇLU ' + i + ' DENEME', i % 3 ? ALTYAPI : BANKA, 'İstanbul ' + (1 + (i % 33)) + '. İcra Dairesi', '2026/' + (40000 + i), i % 7 ? null : '1 adet banka evrakı incelenemedi.', i % 30, 5, i % 4 ? null : 1000 + i / 100, null]);
    }
    return [{ ad: 'TfrIslemBankaCevaplariIncele_20', satirlar: satirlar }];
  }

  const CP1254 = { 'Ç': 0xC7, 'ç': 0xE7, 'Ğ': 0xD0, 'ğ': 0xF0, 'İ': 0xDD, 'ı': 0xFD, 'Ö': 0xD6, 'ö': 0xF6, 'Ş': 0xDE, 'ş': 0xFE, 'Ü': 0xDC, 'ü': 0xFC };
  function cp1254(s) {
    const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) { const c = s[i]; b[i] = CP1254[c] !== undefined ? CP1254[c] : c.charCodeAt(0); }
    return b;
  }

  kok.Ornekler = {
    ALTYAPI: ALTYAPI, BANKA: BANKA, bankaBasliklari: bankaBasliklari,
    bankaDosyasi: bankaDosyasi, tebligatDosyasi: tebligatDosyasi, aracDosyasi: aracDosyasi,
    buyukBankaDosyasi: buyukBankaDosyasi, cp1254: cp1254
  };
})(typeof window !== 'undefined' ? window : this);
