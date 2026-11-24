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

  /* 1.1.0: icra takip talebi, bilirkişi, karar tarihi, ad toleransı */
  const takipXml = '<template><content><![CDATA[şablon]]></content><data><dosyaNo>2023/1</dosyaNo><alacakTaraf>DAVALI A.Ş.</alacakTaraf>'
    + '<miktar>1.872,50</miktar><etiket>TL Asıl Alacak (Geçiş Ücreti-Para Cezası) (İstenen:%41.75 Yıllık Diğer)</etiket>'
    + '<miktar>502,34</miktar><etiket>TL Faiz- (Ticari-Yıllık)</etiket><miktar>90,45</miktar><etiket>TL KDV</etiket>'
    + '<miktar>2.465,29</miktar><etiket>TL Toplam Alacak</etiket><miktar>9,99</miktar><etiket>TL Toplam Alacak</etiket></data></template>';
  const tt = KS.takipTalebiCoz(takipXml);
  esit('Takip talebi verisi: asıl, faiz, KDV, toplam (ilk grup)', [tt.asil, tt.faiz, tt.kdv, tt.toplam], [1872.5, 502.34, 90.45, 2465.29]);

  const hk10 = KS.hukumCoz(KS.hukumAyikla('HÜKÜM: 1-Davanın KISMEN KABULÜNE, takibin 2.442,25 TL alacak üzerinden devamına, fazlaya ilişkin istemin reddine,'));
  esit('"… TL alacak" asıl alacak sayılmaz, ayrı tutulur', [hk10.kabul.asil, hk10.kabul.alacak], [null, 2442.25]);
  const u = KS.bilirkisiUclu('… talep 1.872,50.- TL asıl alacak, 502,34.-Faiz, 90,45.- KDV … SONUÇ: 1.855,00 TL asıl alacak, 488,04 TL işlemiş faiz, 99,21 TL KDV olmak üzere toplam 2.442,25 TL', 2442.25);
  esit('Bilirkişi raporunda kabul toplamını veren üçlü', u, { asil: 1855, faiz: 488.04, kdv: 99.21 });
  Object.assign(hk10.kabul, { asil: 1855, faiz: 488.04, kdv: 99.21, toplam: 2442.25, alacak: null });
  const c10 = KS.hucreler(KS.hesapla(tt, hk10), KS.asama([{ tur: 'Kesinleşme Şerhi' }], hk10));
  esit('Takip talebi + bilirkişi ile kalem bazında red', [c10.N, c10.S, c10.T, c10.U, c10.V, c10.R], ['GEÇİŞ ÜCRETİ, GECİKME CEZASI, FAİZ', 14.3, 'YOK', 3.5, 14, 31.8]);

  esit('Karar tarihi (başlık)', KS.kararTarihi('ESAS NO : 2023/1\nKARAR TARİHİ\t: 18/01/2024\n'), { metin: '18.01.2024', seri: 45309 });
  esit('Mahkeme adı yazım hataları', [KS.mahkemeDuz('İST. 12. TÜKETİCİ.'), KS.mahkemeDuz('İstanbul 11. Asliye Ticaret Mahkemes ')], ['İSTANBUL 12. TÜKETİCİ', 'İSTANBUL 11. ASLİYE TİCARET']);
  const liste = ['İstanbul 13. Tüketici Mahkemesi', 'İstanbul 3. Tüketici Mahkemesi', 'Bakırköy 13. Tüketici Mahkemesi'].map(function (a) { return { ad: a, duz: KS.mahkemeDuz(a) }; });
  esit('En yakın mahkeme adı ("İSTANBUK 13.")', (KS.enYakin(liste, KS.mahkemeDuz('İSTANBUK 13. TÜKETİCİ')) || {}).ad, 'İstanbul 13. Tüketici Mahkemesi');
  esit('Parantez içindeki eski mahkeme atlanır', [KS.yeniDeger('(İSTANBUL 2. TÜKETİCİ)\nİstanbul 7. Asliye Ticaret Mahkemesi'), KS.esasNo('(2025/812)\n2025/823').no], ['İstanbul 7. Asliye Ticaret Mahkemesi', '2025/823']);

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
