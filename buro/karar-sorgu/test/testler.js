/* Karar Sorgu testleri: uydurma dilekçe ve hüküm metinleriyle (kişisel veri yok) */
(function () {
  'use strict';
  const KS = window.KararSorgu;
  const sonuc = [];
  function esit(ad, a, b) { sonuc.push({ ad: ad, ok: JSON.stringify(a) === JSON.stringify(b), a: a, b: b }); }

  const dilekce = 'HARCA ESAS DEĞER : 533,37 TL\nSONUÇ VE TALEP : 1) İTİRAZININ İPTALİNE, 2) İcra takibinin geçiş ücreti ve gecikme cezası olmak üzere toplam 432,75 TL Alacak ile bu alacağa takip tarihinden önce işlemiş Faiz (85,27 TL) ve KDV (15,35 TL) yönünden toplam 533,37 TL takip talebinde gösterilen şartlarla devamına, 3) alacağın %20\'sinden aşağı olmamak üzere icra inkâr tazminatına hükmedilmesine';
  const t = KS.talepCoz(dilekce);
  esit('Dilekçe: asıl, faiz, KDV, toplam', [t.asil, t.faiz, t.kdv, t.toplam], [432.75, 85.27, 15.35, 533.37]);
  esit('Dilekçe: icra inkâr talebi ve oranı', [t.icraInkar, t.icraInkarOran], [true, 20]);

  const karar = 'HÜKÜM VERMEYE YETKİLİ\n...\n\tHÜKÜM/-Yukarıda açıklanan nedenlerle;\n\t1-Davacının davasının KISMEN KABULÜ ile,\n2-Davalının itirazının iptaline,\n3-Takibin 392,50-TL asıl alacak üzerinden devamına,\n4-Şartları oluşmadığından icra inkar tazminatı talebinin reddine,\n5-Fazlaya ilişkin talebin reddine,\nDair, miktarı itibariyle kesin olmak üzere verilen karar açıkça okundu.\n\nKatip 1\n¸e-imzalıdır\nYARGILAMA GİDERLERİ\nTebligat : 125,50-TL';
  const hk = KS.hukumCoz(KS.hukumAyikla(karar));
  esit('Hüküm: kısmen kabul, kabul edilen asıl, icra inkâr reddi, kesin', [hk.sonuc, hk.kabul.asil, hk.red.icraInkar, hk.kesin], ['KISMEN KABUL', 392.5, true, true]);
  const h = KS.hesapla(t, hk);
  const a = KS.asama([{ tur: 'Kesinleşme Şerhi' }], hk);
  esit('Excel hücreleri (kısmen kabul; icra inkâr reddi sayılmaz)', KS.hucreler(h, a), { X: 'KESİNLEŞTİ', Y: 'HİTAM', N: 'GEÇİŞ ÜCRETİ, GECİKME CEZASI, FAİZ, KDV', O: 'TAKİP ÖNCESİ FAİZ, KDV', R: 140.87, S: 85.27, T: 15.35, U: 8.05, V: 32.2, W: 'YOK' });

  const hk2 = KS.hukumCoz(KS.hukumAyikla('HÜKÜM: 1-Davanın KABULÜ ile itirazın İPTALİNE, takibin takip talebindeki şartlarla devamına, 2-Asıl alacağın %20\'si oranında icra inkar tazminatının davalıdan alınmasına, Dair istinaf yolu açık olmak üzere'));
  const c2 = KS.hucreler(KS.hesapla(t, hk2), KS.asama([{ tur: 'Gerekçeli Karar Evrakı' }], hk2));
  esit('Tam kabul: hiçbir şey reddedilmez, kesinleşme beklenir', [c2.N, c2.R, c2.X, c2.Y], ['YOK', 'YOK', 'KESİNLEŞMEDİ', 'KESİNLEŞME BEKLENİYOR']);

  const hk3 = KS.hukumCoz(KS.hukumAyikla('HÜKÜM: 1-Davanın KABULÜNE, itirazın iptaline, takibin devamına, 2-Şartları oluşmadığından icra inkar tazminatı talebinin reddine,'));
  const c3 = KS.hucreler(KS.hesapla(t, hk3), KS.asama([{ tur: 'İstinaf Dilekçesi' }], hk3));
  esit('Kabul + icra inkâr reddi (sayılmaz), istinafta', [c3.N, c3.W, c3.R, c3.Y], ['YOK', 'YOK', 'YOK', 'İSTİNAF']);

  const hk4 = KS.hukumCoz(KS.hukumAyikla('HÜKÜM: Yukarıda açıklanan nedenlerle; konusuz kalan dava hakkında KARAR VERİLMESİNE YER OLMADIĞINA,'));
  esit('Karar verilmesine yer olmadığına', [hk4.sonuc, KS.hucreler(KS.hesapla(null, hk4), KS.asama([], hk4)).N], ['KARAR VERİLMESİNE YER OLMADIĞINA', 'YOK']);

  const hk5 = KS.hukumCoz(KS.hukumAyikla('HÜKÜM: 1-Davanın REDDİNE,'));
  esit('Red: talebin tamamı reddedilir (icra inkâr hariç)', KS.hucreler(KS.hesapla(t, hk5), KS.asama([], hk5)).R, 533.37);

  const hk6 = KS.hukumCoz('');
  esit('Hüküm okunamazsa yalnız X ve Y yazılır', Object.keys(KS.hucreler(KS.hesapla(t, hk6), KS.asama([], hk6))), ['X', 'Y']);

  const yalnizToplam = KS.talepCoz('DAVA : İtirazın iptali ile takibin devamına ve %20 icra inkar tazminatına hükmedilmesi istemidir. HARCA ESAS DEĞER : 2.316,13 TL');
  const hk7 = KS.hukumCoz(KS.hukumAyikla('HÜKÜM; Yukarıda açıklanan nedenlerle; 1-Davanın KABULÜNE, 2-itirazın iptaline, 3-Takibin 847,50-TL asıl alacak, 160,30-TL faiz ve 28,85-TL KDV olmak üzere toplam 1.036,65-TL üzerinden devamına, 4-Şartları oluşmadığından icra inkar tazminatı talebinin reddine,'));
  const c7 = KS.hucreler(KS.hesapla(yalnizToplam, hk7), KS.asama([], hk7));
  esit('Kabul, dilekçede yalnız toplam, icra inkâr reddi: hepsi YOK', [c7.N, c7.W, c7.R], ['YOK', 'YOK', 'YOK']);

  const hk8 = KS.hukumCoz(KS.hukumAyikla('HÜKÜM; Yukarıda açıklanan nedenlerle; 1-Davanın KISMEN KABULÜNE, takibin 2.442,25 TL alacak üzerinden devamına, fazlaya ilişkin istemin reddine,'));
  const h8 = KS.hesapla(KS.talepCoz('HARCA ESAS DEĞER : 4.567,71- TL'), hk8);
  esit('Kısmen kabul, dilekçede yalnız toplam: kalemler yazılmaz, toplam notta', [h8.tamam, /reddedilen yaklaşık 2125.46 TL/.test(h8.notlar.join(' '))], [false, true]);

  const hk9 = KS.hukumCoz(KS.hukumAyikla('HÜKÜM; Yukarıda açıklanan nedenlerle; 1-Davanın AÇILMAMIŞ SAYILAMASINA, Dair kesin olmak üzere'));
  esit('Yazım hatalı "açılmamış sayılamasına"', [hk9.sonuc, hk9.kesin], ['AÇILMAMIŞ SAYILMASINA', true]);

  esit('Mahkeme adı eşleşmesi', KS.mahkemeDuz('İSTANBUL 5.TÜKETİCİ '), KS.mahkemeDuz('İstanbul 5. Tüketici Mahkemesi'));
  esit('Mahkeme türü kodu', [KS.birimTuru('İSTANBUL 4. ASLİYE TİCARET'), KS.birimTuru('İstanbul 5. Tüketici')], ['0902', '0912']);
  esit('Y/E hücresinde yeni esas', KS.esasNo('Y: 2023/252\nE: 2023/223').no, '2023/252');
  esit('Tutar okuma', [KS.sayi('1.234,56'), KS.sayi('392,50-'), KS.sayi('0.02')], [1234.56, 392.5, 0.02]);

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
})();
