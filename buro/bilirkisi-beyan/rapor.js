/*
 * Bilirkişi Raporuna Beyan: rapordan bilgi çıkarma
 *
 * Rapor metninden (ve UYAP'ın verdiği dosya adından) mahkeme, esas no, davalı,
 * kimlik no, plaka, geçiş tarihleri, icra dosyası, tutarlar, ara karar ve rapor
 * tarihini bulur; raporda dikkat edilmesi gereken tespitleri işaretler. Bulunan her
 * bilgi bir öneridir: dilekçeye girmeden önce kullanıcı görür ve onaylar.
 */
(function (kok) {
  'use strict';

  const O = kok.BkOrtak;
  const TARIH = '(\\d{1,2}[./]\\d{1,2}[./]\\d{4})';
  const TUTAR = /(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})(?=\s*-?\s*(?:TL|TRY|₺))/g;

  /* UYAP dosya adı: "2026_888 - İstanbul 7. Tüketici Mahkemesi - Bilirkişi Raporu - ... - 02_09_2026.pdf" */
  function dosyaAdiCoz(ad) {
    const s = String(ad || '').replace(/\.(pdf|udf|tiff?)$/i, '');
    const m = /^(\d{4})_(\d+)\s*-\s*(.+?)\s*-\s*/.exec(s);
    const t = /(\d{2})_(\d{2})_(\d{4})\s*$/.exec(s);
    const o = {};
    if (m) { o.esas = m[1] + '/' + m[2]; if (/MAHKEMES|HAKIMLIG|DAIRES/.test(O.katla(m[3]))) o.mahkeme = m[3]; }
    if (t) o.tarih = t[1] + '.' + t[2] + '.' + t[3];
    return o;
  }

  function cumle(T, bas, son) {
    let a = bas, b = son;
    while (a > 0 && a > bas - 220 && !/[.;:\n]/.test(T[a - 1])) a--;
    while (b < T.length && b < son + 260 && !/[.;\n]/.test(T[b])) b++;
    if (T[b] === '.') b++;
    return O.sade(T.slice(a, b));
  }

  function coz(metin, dosyaAdi) {
    const T = O.temizMetin(metin || '');
    const K = O.katla(T);
    const r = { bulunanlar: [], tutarlar: [], plakalar: [], isaretler: [], oneri: null, oneriNedeni: '', sonuc: '', metinVar: T.trim().length > 50 };
    function ekle(alan, deger, bas, son, kaynak) {
      if (!deger) return;
      r[alan] = deger;
      r.bulunanlar.push({ alan: alan, deger: deger, alinti: bas >= 0 ? O.alinti(T, bas, son, 50) : '', kaynak: kaynak || 'rapor' });
    }
    const da = dosyaAdiCoz(dosyaAdi);

    /* Mahkeme */
    let m = /([A-Z]{3,}(?:\s+[A-Z]{3,}){0,2})\s+(\d{1,3})\s*\.\s*((?:[A-Z]{3,}\s+){0,3})MAHKEMESI/.exec(K);
    if (m) {
      let bas = m.index;
      const yasak = /^(SAYIN|HAKIMLIGINE|RAPORU|BILIRKISI|BASKANLIGINA)\s+/;
      let k = K.slice(bas, m.index + m[0].length);
      while (yasak.test(k)) { const y = yasak.exec(k)[0].length; bas += y; k = k.slice(y); }
      ekle('mahkeme', O.sade(T.slice(bas, m.index + m[0].length)), bas, m.index + m[0].length);
    } else if (da.mahkeme) ekle('mahkeme', da.mahkeme, -1, -1, 'dosya adı');

    /* Esas no */
    m = /(?:DOSYA|ESAS)\s*NO\s*:?\s*(\d{4})\s*\/\s*(\d+)/.exec(K) || /(\d{4})\s*\/\s*(\d+)\s*(?:E\.|ESAS)/.exec(K);
    if (m) ekle('esas', m[1] + '/' + m[2], m.index, m.index + m[0].length);
    else if (da.esas) ekle('esas', da.esas, -1, -1, 'dosya adı');

    /* Davalı ve kimlik no */
    m = /DAVALI(?:\s*[-–]?\s*BORCLU)?\s*:\s*/.exec(K);
    if (m) {
      const bas = m.index + m[0].length;
      const kalan = K.slice(bas, bas + 400);
      const dur = /\n\s*(?:T\.?\s?C\.?|TCKN|VKN|VERGI|ADRES|VEKILI|DAVA\s|KONU|\()|\(|,\s*T\.?\s?C\.?\s*(?:KIMLIK)?\s*(?:NO)?\s*:|\s(?:TCKN|VKN)\s*:/.exec(kalan);
      const son = bas + (dur ? dur.index : Math.min(kalan.indexOf('\n') < 0 ? 120 : kalan.indexOf('\n'), 120));
      const ad = O.sade(T.slice(bas, son)).replace(/[,;:\-–\s]+$/, '');
      if (ad) ekle('davali', ad, bas, son);
      const km = /(?:T\.?\s?C\.?(?:\s*KIMLIK)?(?:\s*NO)?|TCKN|VKN|VERGI(?:\s*KIMLIK)?\s*NO)\s*:?\s*(\d{10,11})(?!\d)/.exec(K.slice(bas, bas + 500));
      if (km) {
        const no = km[1];
        ekle('kimlik', (no.length === 11 ? 'TCKN: ' : 'VKN: ') + no, bas + km.index, bas + km.index + km[0].length);
      }
    }

    /* Plaka: yanında "plaka" geçen ve en sık görülen */
    const plakalar = new Map();
    const pr = /(?:^|[^A-Z0-9])(\d{2})\s?([A-Z]{1,3})\s?(\d{2,5})(?![A-Z0-9])/g;
    while ((m = pr.exec(K)) !== null) {
      const bas = m.index + m[0].indexOf(m[1]), son = m.index + m[0].length;
      if (!/PLAKA/.test(K.slice(son, son + 25)) && !/PLAKA/.test(K.slice(Math.max(0, bas - 25), bas))) continue;
      const p = m[1] + m[2] + m[3];
      const v = plakalar.get(p) || { sayi: 0, bas: bas, son: son };
      v.sayi++;
      plakalar.set(p, v);
    }
    r.plakalar = Array.from(plakalar.entries()).sort(function (a, b) { return b[1].sayi - a[1].sayi; }).map(function (x) { return x[0]; });
    if (r.plakalar.length) { const p = plakalar.get(r.plakalar[0]); ekle('plaka', r.plakalar[0], p.bas, p.son); }

    /* Geçiş tarih aralığı */
    m = new RegExp(TARIH + '\\s*(?:ILE|VE|-|–)\\s*' + TARIH + '\\s*TARIHLERI\\s*ARASI').exec(K);
    if (m) {
      ekle('gecisBas', O.tarihNorm(m[1]), m.index, m.index + m[0].length);
      ekle('gecisSon', O.tarihNorm(m[2]), m.index, m.index + m[0].length);
    }

    /* İcra dairesi ve dosya no */
    m = /([A-Z]+(?:\s+[A-Z]+)?)\s+(\d{1,3})\s*\.\s*ICRA\s+(DAIRESI|MUDURLUGU)[^0-9\n]{0,40}?(\d{4})\s*\/\s*(\d+)/.exec(K);
    if (m) {
      const kelimeler = m[1].split(/\s+/);
      const bas = O.daireBasi(T, K, m.index, kelimeler[0], kelimeler[1]);
      const daireSon = m.index + m[0].indexOf(m[3]) + m[3].length;
      ekle('icraDaire', O.sade(T.slice(bas, daireSon)), bas, daireSon);
      ekle('icraNo', m[4] + '/' + m[5], bas, m.index + m[0].length);
    }

    /* Ara karar: tarih, türü, numarası */
    m = new RegExp(TARIH + '\\s*TARIHLI\\s*(TENSIP|DURUSMA|ON\\s*INCELEME|ARA\\s*KARAR)').exec(K);
    if (m) {
      const tur = { TENSIP: 'tensip', DURUSMA: 'duruşma', ARA: 'ara karar' }[m[2].split(/\s/)[0]] || 'ön inceleme';
      const n = /(\d+)\s*(?:NUMARALI|NOLU|NO\s?.?LU|SAYILI)\s*ARA\s*KARAR/.exec(K.slice(m.index, m.index + 160));
      ekle('araKarar', { tarih: O.tarihNorm(m[1]), tur: tur, no: n ? n[1] : '' }, m.index, m.index + m[0].length);
      r.bulunanlar[r.bulunanlar.length - 1].deger = O.tarihNorm(m[1]) + ' tarihli ' + tur + (n ? ', ' + n[1] + ' numaralı ara karar' : '');
    }

    /* Tutarlar: bağlamıyla */
    TUTAR.lastIndex = 0;
    const gorulen = new Set();
    while ((m = TUTAR.exec(T)) !== null) {
      const bas = m.index;
      if (/[\d.,]/.test(T[bas - 1] || '')) continue;
      const deger = m[0] + ' TL';
      const once = K.slice(Math.max(0, bas - 45), bas), sonra = K.slice(bas, bas + 60);
      let etiket = '';
      if (/GENEL\s*TOPLAM\s*:?\s*$/.test(once)) etiket = 'Genel toplam';
      else if (/KDV\S*\s*:?\s*$/.test(once)) etiket = 'İşlemiş faiz KDV';
      else if (/ISLEMIS\s*FAIZ\s*:?\s*$/.test(once)) etiket = 'İşlemiş faiz';
      else if (/CEZA\S*\)?\s*:?\s*$/.test(once)) etiket = 'Ceza';
      else if (/GECIS\s*UCRET\S*\s*:?\s*$/.test(once)) etiket = 'Geçiş ücreti';
      else if (/^[\d.,]+\s*TL\s*(TAKIB|TUTARLI\s*TAKIP|BEDELLI)/.test(sonra) || /TAKIP\s*TUTARI\s*:?\s*$/.test(once)) etiket = 'Takip tutarı';
      else etiket = 'Tutar';
      const a = etiket + '|' + deger;
      if (gorulen.has(a)) { if (etiket === 'Genel toplam') r.tutarlar.forEach(function (x) { if (x.etiket === etiket && x.deger === deger) x.sonMu = true; }); continue; }
      gorulen.add(a);
      r.tutarlar.push({ etiket: etiket, deger: deger, alinti: O.alinti(T, bas, bas + m[0].length, 50) });
    }
    if (r.tutarlar.length > 14) r.tutarlar = r.tutarlar.filter(function (x) { return x.etiket !== 'Tutar'; }).slice(0, 14);

    /* Rapor tarihi: son sayfadaki imzadan önceki tarih, yoksa dosya adındaki tarih */
    const sonBaslangic = Math.max(0, T.length - 700), sonKisim = T.slice(sonBaslangic);
    const tarihler = sonKisim.match(/\b\d{1,2}[./]\d{1,2}[./]\d{4}\b/g);
    if (tarihler && /ARZ\s*EDER|SAYGI/.test(O.katla(sonKisim))) {
      const i = sonBaslangic + sonKisim.lastIndexOf(tarihler[tarihler.length - 1]);
      ekle('raporTarihi', O.tarihNorm(tarihler[tarihler.length - 1]), i, i + tarihler[tarihler.length - 1].length);
    }
    else if (da.tarih) ekle('raporTarihi', da.tarih, -1, -1, 'dosya adı');

    /* Sonuç bölümü */
    const sr = /\n[^\n]{0,14}SONUC\s*(?:VE\s*(?:KANAAT|DEGERLENDIRME|TALEP))?\s*:?\s*\n/g;
    let sonBas = -1;
    while ((m = sr.exec(K)) !== null) sonBas = m.index + 1;
    if (sonBas >= 0) r.sonuc = T.slice(sonBas, sonBas + 5000).replace(/\n(EK|Ek)\s*-?\s*\d[^\n]*/g, '').trim();
    const incelemeBas = Math.max(0, K.search(/INCELEME|DEGERLENDIRME|TESPIT/));
    const IK = K.slice(incelemeBas);

    /* Faiz türü ve öneri */
    const yasal = /(YASAL|KANUNI)\s*(ISLEMIS\s*)?FAIZ/.exec(IK);
    const avans = /AVANS\s*FAIZ/.exec(IK);
    if (yasal) {
      r.faiz = 'yasal';
      r.oneri = 'aleyhe';
      r.oneriNedeni = 'Bilirkişi faizi yasal faiz üzerinden hesaplamış.';
    } else if (avans) {
      r.faiz = 'avans';
      r.oneri = 'lehe';
      r.oneriNedeni = 'Bilirkişi avans faizi uygulamış.';
    }

    /* Dikkat edilecek tespitler: karar kullanıcıya aittir */
    function isaret(re, aciklama, alan) {
      const k = re.exec(alan === 'sonuc' && sonBas >= 0 ? K.slice(sonBas) : IK);
      if (!k) return;
      const fark = alan === 'sonuc' && sonBas >= 0 ? sonBas : incelemeBas;
      r.isaretler.push({ aciklama: aciklama, alinti: cumle(T, fark + k.index, fark + k.index + k[0].length) });
    }
    isaret(/(YASAL|KANUNI)\s*(ISLEMIS\s*)?FAIZ/, 'Bilirkişi yasal faiz uygulamış; şablondaki avans faizi cümleleri rapora uymayabilir.');
    isaret(/TICARI\s*FAIZ[^.]{0,120}UYGULANAMA/, 'Raporda ticari faizin uygulanamayacağı görüşü var.');
    isaret(/BILDIRIM[^.]{0,160}(TESPIT\s*EDILEME|BULUNMAMAKTA|YAPILMADIG)/, 'Raporda araç sahibine bildirim yapıldığının tespit edilemediği yönünde bir tespit var.');
    isaret(/ZAMANASIMI/, 'Raporda zamanaşımı değerlendirmesi var.');
    isaret(/(REDDI|REDDINE|RED\s*EDIL|TALEP\s*EDEMEYECEG)/, 'Sonuçta ret ya da talep edilemeyecek bir kalem geçiyor.', 'sonuc');
    isaret(/KDV[^.]{0,160}(TAKDIR|TALEP\s*EDIP\s*EDEMEYECEG|YANSITIL)/, 'KDV\'nin istenip istenemeyeceği mahkemenin takdirine bırakılmış.');
    isaret(/(YETERLI\s*BAKIYE|BAKIYE\S*\s*(YETERLI|BULUNDUG|MEVCUT\s*OLDUG))/, 'Raporda HGS/OGS bakiyesine ilişkin bir tespit var; sorumluluk değerlendirmesini okuyun.');
    const takip = r.tutarlar.find(function (x) { return x.etiket === 'Takip tutarı'; });
    const toplam = r.tutarlar.filter(function (x) { return x.etiket === 'Genel toplam'; }).pop();
    if (takip && toplam && takip.deger !== toplam.deger) {
      r.isaretler.push({ aciklama: 'Rapordaki genel toplam (' + toplam.deger + ') takip tutarından (' + takip.deger + ') farklı.', alinti: '' });
    }
    return r;
  }

  kok.RaporOku = { coz: coz, dosyaAdiCoz: dosyaAdiCoz };
})(typeof window !== 'undefined' ? window : this);
