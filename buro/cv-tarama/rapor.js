/* Aday listesinden Excel: Özet sayfası ve her kategori için puana göre sıralı bir sayfa.
   Formül yazılmaz, hesaplanmış değer yazılır (Excel dışındaki önizleyicilerde de görünsün diye).
   Rapor.excel(adaylar, {sayac, baslik}) -> Promise<Uint8Array> */
(function () {
  'use strict';
  const P = globalThis.Puan;

  const KRITER = [
    ['Eğitim', 20, 'Okul ve bölüm düzeyi, not ortalaması, yüksek lisans, alanla ilgisi'],
    ['İlgili İş Deneyimi', 30, 'Pozisyonla doğrudan ilgili yıl sayısı ve sorumluluk derinliği'],
    ['Pozisyon Uygunluğu', 25, 'Başvurulan role ve büronun icra/tahsilat yapısına uyum'],
    ['Yabancı Dil', 10, 'Seviye ve belgelendirme (IELTS, TOLES, C1 vb.)'],
    ['Teknik / Yazılım', 15, 'UYAP, İcramatik, YTS, Sinerji, İcra Partner, MS Office vb.']
  ];
  const BANTLAR = [['75-100', 'Öncelikli: hemen görüşmeye çağrılabilir'], ['65-74', 'Güçlü aday: kısa listeye alınmalı'], ['50-64', 'Değerlendirilebilir: yedek havuz'], ['1-49', 'Zayıf eşleşme'], ['0', 'CV yok ya da okunamadı: değerlendirilemedi']];

  // Öncelik işaretli adaylar başta (sebebi görünür), sonra puana göre
  const sirala = l => l.slice().sort((a, b) => (!!b.oncelik - !!a.oncelik) || (b.toplam - a.toplam));

  const SUTUN = [
    { key: 'sira', title: 'Sıra', width: 6, type: 'i' }, { key: 'ad', title: 'Ad Soyad', width: 24 }, { key: 'eposta', title: 'E-posta', width: 28 },
    { key: 'telefon', title: 'Telefon', width: 16 }, { key: 'egitim', title: 'Eğitim', width: 34, type: 'w' }, { key: 'ozet', title: 'Deneyim Özeti', width: 58, type: 'w' },
    { key: 's0', title: 'Eğitim (20)', width: 9, type: 'i' }, { key: 's1', title: 'İlgili Deneyim (30)', width: 11, type: 'i' }, { key: 's2', title: 'Pozisyon Uygunluğu (25)', width: 12, type: 'i' },
    { key: 's3', title: 'Yabancı Dil (10)', width: 9, type: 'i' }, { key: 's4', title: 'Teknik/Yazılım (15)', width: 10, type: 'i' }, { key: 'toplam', title: 'TOPLAM (100)', width: 10, type: 'i' },
    { key: 'bant', title: 'Değerlendirme', width: 16 }, { key: 'tur', title: 'Değerlendirme Türü', width: 16 }, { key: 'oncelik', title: 'Öncelik', width: 24, type: 'w' },
    { key: 'dosya', title: 'CV Dosyası', width: 28 }, { key: 'not', title: 'Not', width: 34, type: 'w' }
  ];
  const bantStili = t => t >= 75 ? 5 : t >= 65 ? 6 : t < 50 ? 7 : 9;

  function satir(o, i) {
    return {
      sira: i + 1, ad: o.ad, eposta: o.eposta, telefon: o.telefon, egitim: (o.egitim || '').slice(0, 200), ozet: (o.ozet || '').slice(0, 300),
      s0: o.s[0], s1: o.s[1], s2: o.s[2], s3: o.s[3], s4: o.s[4], toplam: o.toplam, bant: P.bant(o.toplam),
      tur: o.manuel ? 'Manuel inceleme' : 'Otomatik analiz', oncelik: o.oncelik || '', dosya: (o.dosya || '').slice(0, 80), not: o.not || ''
    };
  }

  function ozetSayfasi(adaylar, sayac, baslik) {
    const r = []; const ek = (a, b, c, d, e, f) => r.push({ a, b, c, d, e, f });
    const bugun = new Date(); const tarih = `${String(bugun.getDate()).padStart(2, '0')}.${String(bugun.getMonth() + 1).padStart(2, '0')}.${bugun.getFullYear()}`;
    ek(`${baslik ? baslik + ': ' : ''}CV Değerlendirme Raporu`);
    if (sayac) ek(`Kaynak: ${sayac.mail} mail (${sayac.tekilMail} tekil), ${sayac.dogrudan} doğrudan CV dosyası, ${sayac.ek} ek dosya, ${adaylar.length} tekil aday`);
    ek(`Hazırlanma tarihi: ${tarih}`);
    ek('');
    ek('PUANLAMA YÖNTEMİ (100 puan)'); ek('Kriter', 'Ağırlık', 'Neyi ölçüyor');
    KRITER.forEach(k => ek(k[0], k[1], k[2])); ek('TOPLAM', 100);
    ek('');
    ek('KATEGORİ DAĞILIMI'); ek('Kategori', 'Aday Sayısı', 'En Yüksek', 'Ortalama', 'Öncelikli (75+)', 'Manuel incelenen');
    for (const k of P.KATLAR) {
      const l = adaylar.filter(o => o.kat === k); const ok = l.filter(o => o.toplam > 0).map(o => o.toplam);
      ek(k, l.length, ok.length ? Math.max(...ok) : 0, ok.length ? Math.round(ok.reduce((a, b) => a + b, 0) / ok.length * 10) / 10 : 0, l.filter(o => o.toplam >= 75).length, l.filter(o => o.manuel).length);
    }
    ek('TOPLAM', adaylar.length, '', '', adaylar.filter(o => o.toplam >= 75).length, adaylar.filter(o => o.manuel).length);
    ek('');
    ek('PUAN BANTLARI'); BANTLAR.forEach(b => ek(b[0], b[1]));
    ek('');
    ek('YÖNTEM NOTLARI');
    const man = adaylar.filter(o => o.manuel).length;
    [
      `"Değerlendirme Türü" sütunu: ${man} aday tek tek okunarak manuel değerlendirildi, ${adaylar.length - man} aday otomatik metin analiziyle puanlandı.`,
      'Otomatik puanlanan satırlarda ad ya da kategori hatalı olabilir; kısa listeye alınacak adayların CV\'si açılarak teyit edilmelidir.',
      'Fotoğraf ya da tarama olarak gelen CV\'lerin metni okunamadı; Not sütununda işaretlidir, elle puanlanmalıdır.',
      'Kategori ataması hem başvurulan pozisyona (mail konusu) hem CV\'deki mesleki profile göre yapıldı; ikisi çelişirse mail konusu esas alındı.',
      'Puanlar CV beyanına dayanır; diploma, ruhsat ve referans doğrulaması yapılmamıştır.',
      'Puanı 0 olan adaylarda CV eki bulunamadı ya da okunamadı; bu adaylardan CV yeniden istenmelidir.',
      'Öncelik sütunu dolu olan adaylar listenin başındadır; sebebi o sütunda yazar. Puanları değiştirilmemiştir.'
    ].forEach(n => ek('• ' + n));
    return {
      name: 'Özet', header: false, filter: false, rows: r,
      cols: [{ key: 'a', width: 30, type: 'w' }, { key: 'b', width: 14 }, { key: 'c', width: 52, type: 'w' }, { key: 'd', width: 12 }, { key: 'e', width: 16 }, { key: 'f', width: 18 }],
      styleFn: (row, c) => (c.key === 'a' && /^[A-ZÇĞİÖŞÜ ()0-9]+$/.test(row.a || '') && row.a.length > 6) || row.a === 'Kriter' || row.a === 'Kategori' ? 9 : null
    };
  }

  async function excel(adaylar, secenek) {
    secenek = secenek || {};
    const sayfalar = [ozetSayfasi(adaylar, secenek.sayac, secenek.baslik)];
    for (const k of P.KATLAR) {
      const l = sirala(adaylar.filter(o => o.kat === k));
      sayfalar.push({ name: k, cols: SUTUN, rows: l.map(satir), styleFn: (row, c) => c.key === 'toplam' ? bantStili(row.toplam) : (c.key === 'oncelik' && row.oncelik ? 6 : null) });
    }
    return globalThis.Xlsx.yaz(sayfalar);
  }

  globalThis.Rapor = { excel, sirala, KRITER, BANTLAR };
})();
