/* Konut Haczi Sorgu testleri: uydurma evrak listeleri ve metinlerle (kişisel veri yok) */
(async function () {
  'use strict';
  const KH = window.KonutHacziSorgu;
  const sonuc = [];
  function esit(ad, a, b) { sonuc.push({ ad: ad, ok: JSON.stringify(a) === JSON.stringify(b), a: a, b: b }); }

  /* ---------- Evrak listesi ve aşama ---------- */
  const E = {
    talep: { tur: 'Avukat Portal Haciz Talebi', aciklama: 'Taşınır Haciz Talebi, ', tarih: '10/01/2030', gonderen: 'Av. ÖRNEK AVUKAT' },
    maas: { tur: 'Avukat Portal Haciz Talebi', aciklama: 'Maaş Haczi Talebi, ', tarih: '11/01/2030', gonderen: 'Av. ÖRNEK AVUKAT' },
    yazi: { tur: 'İcra Mahkemesine Gönderilen Yazılar', tarih: '12/01/2030', gonderen: 'Örnek 1. İcra Dairesi' },
    tevzi: { tur: 'Hukuk Mahkemesi Tevzi Formu', aciklama: 'Tevzi Formu', tarih: '14/01/2030', gonderen: 'Örnek Hukuk Mahkemeleri Tevzi Bürosu', gonderenDosyaNo: '2030/5000' },
    karar: { tur: 'Değişik İş Kararı', tarih: '14/01/2030', gonderen: 'Örnek 3. İcra Hukuk Mahkemesi', gonderenDosyaNo: '2030/77' },
    talep2: { tur: 'Avukat Portal Haciz Talebi', aciklama: 'Taşınır Haciz Talimatı Talebi, ', tarih: '20/01/2030', gonderen: 'Av. ÖRNEK AVUKAT' },
    talimat: { tur: 'İcra Dairesi Talimat Gönderme Yazısı', tarih: '25/01/2030', gonderen: 'Örnek 1. İcra Dairesi' },
    gelen: { tur: 'Dosya Açıldıktan Sisteme Katılan Gelen Talimat Dosyası Evrakı', aciklama: 'talimat ', tarih: '28/01/2030', gonderen: 'Başka İl İcra Dairesi', gonderenDosyaNo: '2030/321' },
    tensip: { tur: 'Tensip zaptı', aciklama: 'Karar/Kabul', tarih: '12/01/2030' }
  };
  esit('Evrak türleri', [E.talep, E.maas, E.yazi, E.tevzi, E.karar, E.talep2, E.talimat, E.gelen, E.tensip].map(KH.evrakSinifi),
    ['talep', null, 'mahkemeYazisi', 'tevzi', 'karar', 'talep', 'talimatYazisi', 'talimatDosyasi', null]);

  /* Talimat dairesinin cevabı başka tür adıyla da gelir; bizim dairenin kendi talimat evrakı talimat dosyası sayılmaz */
  const genel = { tur: 'Genel Talimat Evrakı', aciklama: '[Vekil ÖRNEK AVUKAT]', tarih: '29/01/2030', gonderen: 'Başka İl İcra Dairesi', gonderenDosyaNo: '2030/321' };
  const bizimki = { tur: 'Genel Talimat Evrakı', tarih: '29/01/2030', gonderen: 'Örnek 1. İcra Dairesi', gonderenDosyaNo: '2030/1234' };
  esit('Talimat cevabı: "Genel Talimat Evrakı" da talimat dosyasıdır, kendi dairemizin evrakı değildir',
    [KH.evrakSinifi(genel, 'Örnek 1. İcra Dairesi'), KH.evrakSinifi(bizimki, 'Örnek 1. İcra Dairesi'), KH.evrakSinifi({ tur: 'Mal Beyanı Bildirim', gonderen: 'Başka İl İcra Dairesi', gonderenDosyaNo: '2030/5' })], ['talimatDosyasi', null, null]);

  const zincir = [E.talep, E.maas, E.tensip, E.yazi, E.tevzi, E.karar, E.talep2, E.talimat, E.gelen];
  esit('Aynı talimat dosyasından gelen iki evrak tek satırdır', KH.ozetle(KH.surec(zincir.concat([genel]), 'Örnek 1. İcra Dairesi'), {}).talimatlar, [{ daire: 'Başka İl İcra Dairesi', dosyaNo: '2030/321', tarih: '28.01.2030' }]);
  const adim = function (n) { return KH.surec(zincir.slice(0, n)).adim; };
  esit('Aşama: evrak eklendikçe 0 → 7', [adim(0), adim(1), adim(4), adim(5), adim(6), adim(7), adim(8), adim(9)], [0, 1, 2, 3, 4, 5, 6, 7]);
  esit('Yalnız maaş haczi talebi olan dosya 0. adımdadır', KH.surec([E.maas, E.tensip]).adim, 0);
  esit('Evrak sırası karışık gelse de aşama aynıdır', KH.surec(zincir.slice().reverse()).adim, 7);

  const tam = KH.surec(zincir);
  esit('Sürecin evrak tarihleri', KH.ozetle(tam, {}).tarihler, ['10.01.2030', '12.01.2030', '14.01.2030', '14.01.2030', '20.01.2030', '25.01.2030', '28.01.2030']);
  esit('Talimat dosyası evrak listesinden: daire ve numara', KH.ozetle(tam, {}).talimatlar, [{ daire: 'Başka İl İcra Dairesi', dosyaNo: '2030/321', tarih: '28.01.2030' }]);

  /* İkinci tur: önceki süreç bitmiş, yeni adres için mahkemeye yeniden yazılmış */
  const yeniTalep = { tur: 'Avukat Portal Haciz Talebi', aciklama: 'Taşınır Haciz Talebi, ', tarih: '01/03/2030' };
  const yeniYazi = { tur: 'İcra Mahkemesine Gönderilen Yazılar', tarih: '02/03/2030' };
  const ikinci = KH.surec(zincir.concat([yeniTalep, yeniYazi]));
  esit('İkinci tur: aşama son mahkeme yazısına göre (2), eski karar ve talimat listede kalır', [ikinci.adim, ikinci.kararlar.length, ikinci.talimatDosyalari.length, /önceki/.test(ikinci.notlar.join(' '))], [2, 1, 1, true]);
  esit('Talimattan sonra gelen yeni talep notta görünür', /yeni taşınır haciz talebi var \(01\.03\.2030\)/.test(KH.surec(zincir.concat([yeniTalep])).notlar.join(' ')), true);
  const yenilenen = KH.surec(zincir.concat([yeniTalep, { tur: 'İcra Dairesi Talimat Gönderme Yazısı', tarih: '05/03/2030' }]));
  esit('Talep üzerine talimat yeniden yazılmışsa not düşülmez', [yenilenen.adim, yenilenen.notlar], [7, []]);
  /* Doğrudan talimat: mahkeme aşaması olmadan talimat yazan daireler */
  const tEk = 'Kararla İlişkili Tensip - Genel Haciz Talebi-Taşınır Haciz Talimatı Talebi, ', hEk = 'Kararla İlişkili Tensip - Genel Haciz Talebi-Taşınır Haciz Talebi, ';
  const tensip = function (tarih, sonuc, ek) { return { tur: 'Tensip zaptı', aciklama: sonuc, tarih: tarih, ekTurleri: ek }; };
  const talimatTalebi = { tur: 'Avukat Portal Haciz Talebi', aciklama: 'Taşınır Haciz Talimatı Talebi, ', tarih: '07/10/2030' };
  const dogrudan = KH.surec([talimatTalebi, tensip('08/10/2030', 'Karar/Kabul', tEk), { tur: 'İcra Dairesi Talimat Gönderme Yazısı', tarih: '08/10/2030' },
    { tur: 'Genel Talimat Cevabı Evrakı', tarih: '12/10/2030', gonderen: 'Başka İl İcra Dairesi', gonderenDosyaNo: '2030/1141' }], 'Örnek 1. İcra Dairesi');
  esit('Karar alınmadan doğrudan yazılan talimat: 7. adım, notta belirtilir', [dogrudan.adim, dogrudan.evrak.karar, /doğrudan yazılmış/.test(dogrudan.notlar.join(' ')), KH.ozetle(dogrudan, {}).tarihler],
    [7, null, true, ['07.10.2030', '', '', '', '', '08.10.2030', '12.10.2030']]);
  esit('Tevzi formu mahkeme yazısı yoksa sürece sayılmaz (başka davanın formu olabilir)', KH.surec([E.talep, E.tevzi]).adim, 1);
  esit('Karardan önceki eski talimat yeni süreci ilerletmez', KH.surec([{ tur: 'İcra Dairesi Talimat Gönderme Yazısı', tarih: '01/01/2030' }, E.talep, E.yazi, E.tevzi, E.karar]).adim, 4);

  /* Tensip: talebin kabulü ya da reddi */
  const bekle = KH.surec([E.talep]);
  const kabul = KH.surec([E.talep, tensip('11/01/2030', 'Karar/Kabul', hEk)]);
  const red = KH.surec([E.talep, tensip('11/01/2030', 'Karar/ Red', hEk)]);
  esit('1. adım: tensip yok / kabul / red', [bekle.siradaki, /mahkemesine yazı yazması/.test(kabul.siradaki), red.adim, red.adimAdi, /reddetmiş \(11\.01\.2030/.test(red.siradaki)],
    ['İcra dairesinin talebi tensip etmesi bekleniyor', true, 1, 'Haciz talebi reddedildi', true]);
  esit('Başka talebin (maaş haczi) tensibi taşınır haciz talebine sayılmaz', KH.surec([E.talep, tensip('11/01/2030', 'Karar/Red', 'Kararla İlişkili Tensip - Genel Haciz Talebi-Maaş Haczi Talebi, ')]).siradaki, 'İcra dairesinin talebi tensip etmesi bekleniyor');
  const red5 = KH.surec(zincir.slice(0, 7).concat([tensip('21/01/2030', 'Karar/Red', tEk)]));
  esit('5. adım: karar sonrası talep reddedilmişse', [red5.adim, red5.adimAdi, KH.ozetle(red5, {}).adimAdi], [5, 'Karar sonrası talep reddedildi', 'Karar sonrası talep reddedildi']);
  /* Önce talimat talebi reddedilmiş, sonra haciz talebi atılıp mahkemeye yazılmış */
  const yeniden = KH.surec([talimatTalebi, tensip('07/10/2030', 'Karar/Red', tEk), { tur: 'Avukat Portal Haciz Talebi', aciklama: 'Taşınır Haciz Talebi, ', tarih: '23/11/2030' }, tensip('24/11/2030', 'Karar/Kabul', hEk), { tur: 'İcra Mahkemesine Gönderilen Yazılar', tarih: '24/11/2030' }]);
  esit('Reddedilen talepten sonra yeni taleple mahkemeye yazılmışsa 2. adım', [yeniden.adim, yeniden.adimAdi, KH.ozetle(yeniden, {}).tarihler[0]], [2, undefined, '23.11.2030']);

  /* ---------- Değişik iş kararı ---------- */
  const kararA = 'T.C. Örnek 3. İCRA HUKUK MAHKEMESİ Esas-Karar No: 2030/77 D.İş - 2030/91\n\n\tT.C.\n\tÖrnek\n\t3. İCRA HUKUK MAHKEMESİ\n\nDEĞİŞİK İŞ KARAR\n\n'
    + 'ESAS NO\t: 2030/77 D.İş\nKARAR NO\t: 2030/91\nHAKİM\t: Ad SOYAD  000001\nKATİP\t: Ad SOYAD  000002\nALACAKLI\t: ÖRNEK BANKA A.Ş.\nBORÇLU\t: ÖRNEK BORÇLU\n'
    + 'İCRA DOSYA NO\t: Örnek 1. İcra Müdürlüğü  2030/1234 Esas\nKONU\t: İcra Müdürünün Konutta Haciz Kararının Onaylanması (İİK.m.79/a)\nTALEP TARİHİ\t: 13/01/2030\nKARAR TARİHİ\t: 14/01/2030\n'
    + 'GEREĞİ DÜŞÜNÜLDÜ:\nİİK\'nın 79/a maddesine göre "Mahkeme … haciz yapılması talep edilen yerin konut olduğunun anlaşılması halinde kararın onaylanmasına kesin olarak karar verir. '
    + 'Konut olmadığının anlaşılması halinde ise mahkeme, konutta haciz yapılmasına dair kararı kesin olarak kaldırır." hükmü eklenmiştir.\n'
    + 'KARAR:\n1-Haciz yapılması talep edilen adresin konut olduğu anlaşıldığından icra müdürlüğünün konut haczi kararının ONAYLANMASINA,\n2-Kararın bir örneğinin icra müdürlüğüne gönderilmesine,\nDair KESİN olarak karar verildi. 14/01/2030\nKatip 000002\n';
  const ka = KH.kararCoz(kararA);
  esit('Karar (KARAR: başlıklı biçim)', [ka.esasNo, ka.kararNo, ka.icraNo, ka.talepTarihi, ka.kararTarihi, ka.sonuc, ka.kesin, ka.konutMu],
    ['2030/77', '2030/91', '2030/1234', '13.01.2030', '14.01.2030', 'ONAYLANDI', true, true]);
  esit('Karar: mahkeme adı ve konu', [ka.mahkeme, ka.konu], ['ÖRNEK 3. İCRA HUKUK MAHKEMESİ', 'İcra Müdürünün Konutta Haciz Kararının Onaylanması (İİK.m.79/a)']);

  const kararB = 'T.C.\nÖRNEK\n38. İCRA HUKUK MAHKEMESİ\t\tDEĞİŞİK İŞ KARARI\n\nESAS NO\t: 2030/3496 D.İş\nKARAR NO\t: 2030/3509\nÖrnek 7. İcra Dairesi\t: 2030/9268\n\nHAKİM\t: Ad SOYAD 000001\n'
    + 'TALEP TARİHİ\t: 23/10/2030\nKARAR TARİHİ\t: 02/11/2030\n\tÖrnek 7. İcra Dairesinin talebi doğrultusunda İİK 79/a maddesi kapsamında konutta haciz yapılması talebinin kabulüne ilişkin icra müdürlük kararının onaylanması talep edilmiş olmakla dosya incelendi.\n'
    + '\tGEREĞİ DÜŞÜNÜLDÜ:\n\tAlacaklı vekilinin talebi üzerine, haciz yapılması talep edilen yerin konut olduğunun dosya kapsamı itibariyle anlaşıldığından, İİK\'nun 79/a maddesi uyarınca İCRA MÜDÜRLÜĞÜ KARARININ ONAYLANMASINA,\n\tKararın bir suretinin İcra Müdürlüğüne gönderilmesine,\n\tDosya üzerinden yapılan inceleme sonucu KESİN olarak karar verildi. 02/11/2030\n';
  const kb = KH.kararCoz(kararB);
  esit('Karar (GEREĞİ DÜŞÜNÜLDÜ biçimi)', [kb.esasNo, kb.kararNo, kb.icraNo, kb.kararTarihi, kb.sonuc, kb.mahkeme], ['2030/3496', '2030/3509', '2030/9268', '02.11.2030', 'ONAYLANDI', 'ÖRNEK 38. İCRA HUKUK MAHKEMESİ']);

  const kc = KH.kararCoz(kararA.replace(/KARAR:\n[\s\S]*$/, 'KARAR:\n1-Haciz yapılması talep edilen adresin konut olmadığı anlaşıldığından icra müdürlüğünün konutta haciz kararının KALDIRILMASINA,\nDair KESİN olarak karar verildi.'));
  esit('Karar: konut değilse "kaldırıldı" (gerekçedeki kanun metni sonucu etkilemez)', kc.sonuc, 'KALDIRILDI');
  const kd = KH.kararCoz(kararA.replace(/KARAR:\n[\s\S]*$/, 'KARAR:\n1-Talebin REDDİNE,\nDair karar verildi.'));
  esit('Karar: ret', kd.sonuc, 'REDDEDİLDİ');
  esit('Karar okunamazsa alanlar boş kalır', [KH.kararCoz('').esasNo, KH.kararCoz('').sonuc], ['', '']);

  /* ---------- Tevzi formu ve talimat yazısı ---------- */
  const tevziXml = '<?xml version="1.0"?><template><content><![CDATA[TEVZİ FORMU (acilisTuru)\nTEVZİ EDİLEN MAHKEME\t:ilIlceMahkemeAdi\nESAS NO\t:kayitNo\nTEVZİ NO\t: tevziNo\nDAVA TÜRÜ\t:davaTuru\nAÇILIŞ TARİHİ \t: acilisTarihi\n]]></content>'
    + '<data><acilisTuru>Hukuk Değişik İş Dosyası</acilisTuru><ilIlceMahkemeAdi>Örnek 3. İcra Hukuk Mahkemesi</ilIlceMahkemeAdi><kayitNo>2030/77</kayitNo><icraMudurlugu>Örnek 1. İcra Dairesi</icraMudurlugu>'
    + '<tevziNo>2030/5000</tevziNo><davaTuru>İcra Müdürünün Konutta Haciz Kararının Onaylanması (İİK M.79/a)</davaTuru><acilisTarihi>14/01/2030 10:17</acilisTarihi></data></template>';
  const tv = KH.tevziCoz(tevziXml);
  esit('Tevzi formu (şablon verisi)', [tv.mahkeme, tv.esasNo, tv.tevziNo, tv.acilisTarihi, tv.konutMu], ['Örnek 3. İcra Hukuk Mahkemesi', '2030/77', '2030/5000', '14.01.2030', true]);
  const tv2 = KH.tevziCoz('<template><content><![CDATA[TEVZİ FORMU (Hukuk Değişik İş Dosyası)\nTEVZİ EDİLEN MAHKEME\t:Örnek 38. İcra Hukuk Mahkemesi\nESAS NO\t:2030/3496\nTEVZİ NO\t: 2030/388030\nDAVA TÜRÜ\t:İcra Müdürünün Konutta Haciz Kararının Onaylanması (İİK M.79/a)\nAÇILIŞ TARİHİ \t: 23/10/2030  10:17\n]]></content></template>');
  esit('Tevzi formu (düz yazı)', [tv2.mahkeme, tv2.esasNo, tv2.acilisTarihi], ['Örnek 38. İcra Hukuk Mahkemesi', '2030/3496', '23.10.2030']);

  esit('Talimat yazısının muhatabı', [
    KH.talimatYeri('\tT.C.\n\tÖRNEK\t28/06/2030\n1. İCRA DAİRESİ\n\t2030/1234 ESAS\n\t\t\t\nİCRA TEVZİ BÜROSU\'NE\n\tMERKEZ / BAŞKA İL\n\nİLGİ\t:  / Talimat Dosyası\nALACAKLI\t: ÖRNEK BANKA'),
    KH.talimatYeri('T.C.\nÖRNEK\n1. İCRA DAİRESİ\n2030/1234 ESAS\n30/10/2030\nİCRA DAİRESİ\nİLÇE / BAŞKA İL\n\nALACAKLI : ÖRNEK')
  ], ['MERKEZ / BAŞKA İL (İCRA TEVZİ BÜROSU)', 'İLÇE / BAŞKA İL (İCRA DAİRESİ)']);

  /* ---------- Özet ve Excel satırı ---------- */
  const oz = KH.ozetle(tam, { kararlar: [{ evrak: E.karar, coz: ka }] });
  esit('Özet: değişik iş dosyası (mahkeme evrak listesinden, numaralar karardan)', oz.disler, [{ mahkeme: 'Örnek 3. İcra Hukuk Mahkemesi', esasNo: '2030/77', kararNo: '2030/91', kararTarihi: '14.01.2030', sonuc: 'ONAYLANDI', evrakTarihi: '14.01.2030' }]);
  esit('Karardaki icra dosya no ana dosyadan farklıysa notta görünür', [/ana dosyadan farklı/.test(KH.ozetle(tam, { kararlar: [{ evrak: E.karar, coz: ka }], anaNo: '2030/9999' }).notlar.join(' ')), KH.ozetle(tam, { kararlar: [{ evrak: E.karar, coz: ka }], anaNo: '2030/1234' }).notlar], [true, []]);
  const k0 = { daire: 'Örnek 1. İcra Dairesi', no: '2030/1234' };
  const st = KH.satir(k0, { ozet: oz, dosyaDurum: 'Açık' });
  esit('Excel satırı: sütun sayısı başlıklarla aynı', [st.length, KH.satir(k0, null).length, KH.satir(k0, { durum: 'Dosya bulunamadı', mesaj: 'x', notlar: [] }).length], [KH.BASLIKLAR.length, KH.BASLIKLAR.length, KH.BASLIKLAR.length]);
  esit('Excel satırı: aşama, D.İş, talimat', [st[3], st[5], st[6], st[7], st[8], st[9], st[10], st[11]],
    ['7 - Talimat dosyası açıldı', 'Örnek 3. İcra Hukuk Mahkemesi', '2030/77 D.İş', '2030/91', '14.01.2030', 'ONAYLANDI', 'Başka İl İcra Dairesi', '2030/321']);
  const oz3 = KH.ozetle(KH.surec(zincir.slice(0, 5)), { tevzi: tv });
  esit('3. adım: değişik iş dosyası tevzi formundan, karar bekleniyor', [oz3.adim, oz3.disler[0].mahkeme, oz3.disler[0].esasNo, oz3.disler[0].sonuc], [3, 'Örnek 3. İcra Hukuk Mahkemesi', '2030/77', 'KARAR BEKLENİYOR']);
  const ozOkunmadi = KH.ozetle(tam, { kararlar: [{ evrak: E.karar, coz: null, okunamadi: true }] });
  esit('Karar okunamazsa mahkeme ve esas no evrak listesinden', [ozOkunmadi.disler[0].mahkeme, ozOkunmadi.disler[0].esasNo, /okunamadı/.test(ozOkunmadi.notlar.join(' '))], ['Örnek 3. İcra Hukuk Mahkemesi', '2030/77', true]);

  /* ---------- İcra dairesi adı ---------- */
  const liste = ['Örnek Anadolu 1. Banka Alacakları İcra Dairesi', 'Örnek Anadolu 2. Banka Alacakları İcra Dairesi', 'Örnek Anadolu 2. İcra Dairesi'].map(function (a) { return { ad: a, duz: KH.icraDuz(a) }; });
  esit('Daire adı: yazım farkı (müdürlüğü, noktasız)', (KH.enYakin(liste, KH.icraDuz('ÖRNEK ANADOLU 2.BANKA ALACAKLARI İCRA MÜDÜRLÜĞÜ')) || {}).ad, 'Örnek Anadolu 2. Banka Alacakları İcra Dairesi');
  esit('Daire adı: harf hatası aynı numaralı daireye gider', (KH.enYakin(liste, KH.icraDuz('Örnek Anadolu 2. Banka Alacaklari İcra Dairesi')) || {}).ad, 'Örnek Anadolu 2. Banka Alacakları İcra Dairesi');
  esit('Daire adı: numarası listede olmayan daire eşleşmez', KH.enYakin(liste, KH.icraDuz('Örnek Anadolu 3. Banka Alacakları İcra Dairesi')), null);

  /* ---------- Excel ---------- */
  const basliksiz = { 1: { A: 'Örnek 1. İcra Dairesi', B: '2030/1234', C: 'Taşınır Haciz Talebi,' }, 2: { A: 'Örnek 1. İcra Dairesi', B: '2030/00056', C: 'Taşınır Haciz Talebi,' }, 3: { A: 'not', B: 'numara değil' } };
  const kb1 = KH.kayitlar(basliksiz, '');
  esit('Excel: başlıksız liste, sütunlar içerikten bulunur', [kb1.sutunlar, kb1.kayitlar.map(function (x) { return x.satir + ' ' + x.daire + ' ' + x.no; })],
    [{ no: 'B', daire: 'A' }, ['1 Örnek 1. İcra Dairesi 2030/1234', '2 Örnek 1. İcra Dairesi 2030/56']]);
  const baslikli = { 1: { A: 'Sıra', B: 'Borçlu', C: 'Dosya No', D: 'İcra Müdürlüğü' }, 2: { A: 1, B: 'X', C: '2030/9 E.', D: 'Örnek 2. İcra Müdürlüğü' }, 3: { A: 2, B: 'Y', C: '2030/10', D: 'Örnek 2. İcra Müdürlüğü' } };
  esit('Excel: başlıklı liste, başlık satırı kayıt sayılmaz', KH.kayitlar(baslikli, '').kayitlar.map(function (x) { return x.satir + ' ' + x.no; }), ['2 2030/9', '3 2030/10']);
  const dairesiz = KH.kayitlar({ 1: { A: '2030/1' }, 2: { A: '2030/2' } }, 'Örnek 5. İcra Dairesi');
  esit('Excel: daire sütunu yoksa panele yazılan daire kullanılır', [dairesiz.sutunlar.daire, dairesiz.kayitlar[1].daire], [null, 'Örnek 5. İcra Dairesi']);

  const blob = await KH.excelYaz([st, KH.satir(k0, null)]);
  const geri = await KH.excelHucreler(new Uint8Array(await blob.arrayBuffer()));
  esit('Excel: yazılan dosya yeniden okunabiliyor', [geri[1].A, geri[1].U, geri[2].B, geri[2].D, geri[2].L, geri[3].U], ['İcra Dairesi', 'Not', '2030/1234', '7 - Talimat dosyası açıldı', '2030/321', 'Sorgulanmadı']);
  esit('Excel: listedeki öteki hücreler "Listedeki Bilgi" sütununa taşınır', [kb1.kayitlar[0].bilgi, KH.satir(kb1.kayitlar[0], null)[2], KH.kayitlar(baslikli, '').kayitlar[0].bilgi, KH.BASLIKLAR[2]], ['Taşınır Haciz Talebi', 'Taşınır Haciz Talebi', '1 | X', 'Listedeki Bilgi']);

  /* ---------- UYAP taklidiyle uçtan uca ---------- */
  async function udf(icerik, veri) {
    const xml = '<?xml version="1.0" encoding="UTF-8"?><template><content><![CDATA[' + icerik + ']]></content>' + (veri || '') + '</template>';
    return new Uint8Array(await KH.zipYaz([await KH.girdiYap('content.xml', xml)]).arrayBuffer());
  }
  const belgeler = { k1: await udf(kararA), t1: await udf('TEVZİ FORMU', tevziXml.slice(tevziXml.indexOf('<data>'), tevziXml.indexOf('</template>'))), g1: await udf('\tT.C.\n\tÖRNEK\n1. İCRA DAİRESİ\n\t2030/1234 ESAS\n\nİCRA TEVZİ BÜROSU\'NE\n\tMERKEZ / BAŞKA İL\n\nİLGİ\t: Talimat') };
  function taklit(evrakListesi, ayar) {
    ayar = ayar || {};
    const gunluk = [];
    let bozuk = ayar.bozukIstek || 0;
    const yanit = function (govde, durum) { return { status: durum || 200, text: async function () { return typeof govde === 'string' ? govde : JSON.stringify(govde); }, arrayBuffer: async function () { return govde.buffer.slice(govde.byteOffset, govde.byteOffset + govde.byteLength); } }; };
    const getir = async function (url, s) {
      gunluk.push(url.replace(/\?.*$/, ''));
      if (bozuk > 0) { bozuk--; return yanit('[Fiddler] ReadResponse() failed', 504); }
      const g = s.body ? JSON.parse(s.body) : {};
      if (/avukat_mahkemeleri_sorgula/.test(url)) return yanit([{ birimAdi: 'Örnek 1. İcra Dairesi', birimId: 11 }, { birimAdi: 'Örnek 2. İcra Dairesi', birimId: 12 }]);
      if (/search_phrase_detayli/.test(url)) {
        if (ayar.aramaBozuk) return yanit({ beklenmeyen: true });
        const acik = g.dosyaDurumKod === 0;
        if (g.dosyaSira === '1234' && acik === !ayar.kapali) return yanit([[{ dosyaId: 'D1', dosyaNo: '2030/1234', dosyaDurum: ayar.kapali ? 'Kapalı' : 'Açık', dosyaTurKod: 35 }], 1]);
        return yanit([[], 0]);
      }
      if (/list_dosya_evraklar/.test(url)) return yanit({ tumEvraklar: { '2030/1234(İcra Dosyası)': evrakListesi, '2030/999(Başka Dosya)': [{ evrakId: 'x', tur: 'Değişik İş Kararı', sistemeGonderildigiTarih: '01/01/2030' }] }, pageTotal: 1 });
      const m = url.match(/evrakId=([^&]+)/);
      if (m) return yanit(belgeler[decodeURIComponent(m[1])] || new Uint8Array([37, 80, 68, 70]));
      return yanit({}, 404);
    };
    return { bag: KH.baglanti({ fetch: getir, onek: '/', aralik: 0, uyu: async function () {}, yenidenDeneme: [1, 1] }), gunluk: gunluk };
  }
  const uyapEvrak = function (e, id) { return { evrakId: id, tur: e.tur, aciklama: e.aciklama, sistemeGonderildigiTarih: e.tarih, onaylandigiTarih: e.tarih, gonderenYerKisi: e.gonderen, gonderenDosyaNo: e.gonderenDosyaNo, ekEvrakListesi: e.ekTurleri ? [{ evrakId: 'ek', sira: 1, ekTuru: e.ekTurleri }] : [] }; };
  const s0 = await KH.dosyaSorgula(taklit([uyapEvrak(E.talep, 'a'), uyapEvrak(tensip('11/01/2030', 'Karar/Red', hEk), 'r')]).bag, { daire: 'Örnek 1. İcra Dairesi', no: '2030/1234' });
  esit('Uçtan uca: tensip zaptının eki evrak listesinden okunur (talep reddedilmiş)', [s0.ozet.adim, s0.ozet.adimAdi], [1, 'Haciz talebi reddedildi']);
  const tumListe = [uyapEvrak(E.talep, 'a'), uyapEvrak(E.maas, 'b'), uyapEvrak(E.yazi, 'c'), uyapEvrak(E.tevzi, 't1'), uyapEvrak(E.karar, 'k1'), uyapEvrak(E.talep2, 'd'), uyapEvrak(E.talimat, 'g1'), uyapEvrak(E.gelen, 'e')];

  const t1 = taklit(tumListe);
  const s1 = await KH.dosyaSorgula(t1.bag, k0);
  esit('Uçtan uca (tam süreç): aşama, D.İş, talimat', [s1.ozet.adim, s1.ozet.disler[0].esasNo, s1.ozet.disler[0].kararNo, s1.ozet.disler[0].sonuc, s1.ozet.talimatlar[0].dosyaNo, s1.ozet.notlar], [7, '2030/77', '2030/91', 'ONAYLANDI', '2030/321', []]);
  esit('Uçtan uca: yalnız karar okunur (arama, liste ve tek evrak)', t1.gunluk.filter(function (u) { return /view_document/.test(u); }).length, 1);

  const t2 = taklit(tumListe.slice(0, 4));
  const s2 = await KH.dosyaSorgula(t2.bag, k0);
  esit('Uçtan uca (3. adım): değişik iş dosyası tevzi formundan', [s2.ozet.adim, s2.ozet.disler[0].mahkeme, s2.ozet.disler[0].esasNo], [3, 'Örnek 3. İcra Hukuk Mahkemesi', '2030/77']);

  const t3 = taklit(tumListe.slice(0, 7));
  const s3 = await KH.dosyaSorgula(t3.bag, k0);
  esit('Uçtan uca (6. adım): talimat yazılan yer yazıdan', [s3.ozet.adim, s3.ozet.talimatYeri], [6, 'MERKEZ / BAŞKA İL (İCRA TEVZİ BÜROSU)']);

  const t4 = taklit(tumListe, { kapali: true });
  const s4 = await KH.dosyaSorgula(t4.bag, k0);
  esit('Açıkta bulunmayan dosya kapalılarda aranır', [s4.dosyaDurum, s4.ozet.adim, /Dosya durumu: Kapalı/.test(KH.satir(k0, s4)[20])], ['Kapalı', 7, true]);

  const s5 = await KH.dosyaSorgula(taklit(tumListe).bag, { daire: 'Örnek 1. İcra Dairesi', no: '2030/4321' });
  esit('UYAP\'ta olmayan dosya', [s5.ozet, s5.durum], [null, 'Dosya bulunamadı']);

  const t6 = taklit(tumListe, { bozukIstek: 2 });
  const s6 = await KH.dosyaSorgula(t6.bag, k0);
  esit('UYAP iki kez 504 verirse yeniden denenir ve sonuç alınır', s6.ozet.adim, 7);
  let kod7 = '';
  try { await KH.dosyaSorgula(taklit(tumListe, { bozukIstek: 50 }).bag, k0); } catch (h) { kod7 = h.kod; }
  esit('UYAP hiç yanıt vermezse dosya "yok" sayılmaz, bot durur', kod7, 'BAGLANTI');
  let kod8 = '';
  try { await KH.dosyaSorgula(taklit(tumListe, { aramaBozuk: true }).bag, k0); } catch (h) { kod8 = h.kod; }
  esit('Arama beklenmeyen yanıt verirse dosya "yok" sayılmaz', kod8, 'BAGLANTI');
  let kod9 = '';
  try { await KH.dosyaSorgula(taklit(tumListe).bag, { daire: 'Örnek 9. İcra Dairesi', no: '2030/1234' }); } catch (h) { kod9 = h.kod; }
  esit('Listede olmayan icra dairesi atlanır', kod9, 'ATLA');

  const ol = document.getElementById('sonuc');
  let hata = 0;
  sonuc.forEach(function (s) {
    const li = document.createElement('li');
    li.className = s.ok ? 'ok' : 'hata';
    li.textContent = (s.ok ? '✓ ' : '✗ ') + s.ad + (s.ok ? '' : ': ' + JSON.stringify(s.a) + ' (beklenen ' + JSON.stringify(s.b) + ')');
    if (!s.ok) hata++;
    ol.appendChild(li);
  });
  document.getElementById('ozet').textContent = hata ? hata + ' test başarısız' : sonuc.length + ' testin hepsi geçti';
  document.getElementById('ozet').className = hata ? 'hata' : 'ok';
})().catch(function (h) {
  document.getElementById('ozet').textContent = 'Testler çalışırken hata: ' + (h && h.message);
  document.getElementById('ozet').className = 'hata';
});
