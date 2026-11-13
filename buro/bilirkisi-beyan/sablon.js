/*
 * Bilirkişi Raporuna Beyan: şablondaki alanlar
 *
 * Şablon, önceki bir dosya için yazılmış gerçek bir dilekçedir. Bu dosya o dilekçede
 * dosyaya özgü bilgileri (mahkeme, esas no, borçlu, kimlik no, adres, tarihler, icra
 * dosyası, plaka, tutarlar) bulur; kullanıcı yeni değerleri girer, metnin geri kalanı
 * olduğu gibi kalır. İçtihat alıntılarındaki tarihler alan sayılmaz.
 */
(function (kok) {
  'use strict';

  const O = kok.BkOrtak;

  const ETIKET = {
    mahkeme: 'Mahkeme', esas: 'Esas no', borclu: 'Borçlu adı', kimlik: 'Borçlu kimlik no', adres: 'Borçlu adresi',
    araKarar: 'Ara karar', araKararTarihi: 'Ara karar tarihi', raporTarihi: 'Rapor tarihi', icraDaire: 'İcra dairesi',
    icraNo: 'İcra dosya no', plaka: 'Plaka', gecisBas: 'Geçişlerin başlangıç tarihi', gecisSon: 'Geçişlerin bitiş tarihi',
    takipTarihi: 'Takip tarihi', tutar: 'Tutar', alinti: 'Rapordan alıntı', dilekceTarihi: 'Dilekçe tarihi'
  };
  /* Formdaki sıra */
  const SIRA = ['mahkeme', 'esas', 'borclu', 'kimlik', 'adres', 'araKarar', 'araKararTarihi', 'raporTarihi', 'icraDaire', 'icraNo', 'plaka', 'gecisBas', 'gecisSon', 'takipTarihi', 'tutar', 'alinti', 'dilekceTarihi'];
  /* Çakışmada önce gelen kazanır: alıntının içindeki tutar ayrı alan olmaz */
  const ONCELIK = ['alinti', 'adres', 'kimlik', 'borclu', 'araKarar', 'mahkeme', 'esas', 'icraDaire', 'icraNo', 'plaka', 'gecisBas', 'gecisSon', 'raporTarihi', 'araKararTarihi', 'takipTarihi', 'dilekceTarihi', 'tutar'];
  const ETIKET_SATIRI = /^\s*(KONU|VEKILI|DAVACI|DAVALI|ACIKLAMA|SONUC|NETICE|DOSYA|ESAS|TALEP|DELIL|HUKUKI|MAHKEME|IHTIYATI)\b/;
  /* Gün ya da ay yerine "?" yazılmış taslak tarihler de ("1?.04.2026") tarih sayılır */
  const TARIH_RE = /[\d?]{1,2}([.\/])[\d?]{1,2}\1\d{4}/g;
  const GENEL_SOZCUK = new Set(['LIMITED', 'SIRKETI', 'SIRKET', 'TICARET', 'SANAYI', 'ANONIM', 'HIZMETLERI', 'INSAAT', 'NAKLIYAT', 'TURIZM', 'GIDA', 'PAZARLAMA', 'ITHALAT', 'IHRACAT', 'YATIRIM', 'ISLETME', 'ISLETMESI', 'VEYA', 'LTD', 'STI']);

  function satirlar(T) {
    const l = [];
    let b = 0;
    for (;;) {
      const e = T.indexOf('\n', b), son = e < 0 ? T.length : e;
      l.push({ bas: b, son: son, metin: T.slice(b, son) });
      if (e < 0) break;
      b = e + 1;
    }
    return l;
  }
  function kirp(T, bas, son) {
    while (bas < son && /\s/.test(T[bas])) bas++;
    while (son > bas && /\s/.test(T[son - 1])) son--;
    return [bas, son];
  }
  function tarihSinirli(T, bas, son) { return !/[\d.\/?]/.test(T[bas - 1] || '') && !/\d/.test(T[son] || ''); }

  /* Şablondaki alanları bulur */
  function alanlariBul(T) {
    const K = O.katla(T), S = satirlar(T);
    const adaylar = [];
    function aday(tur, bas, son, ek) {
      const k = kirp(T, bas, son);
      if (k[1] > k[0]) adaylar.push(Object.assign({ tur: tur, bas: k[0], son: k[1] }, ek || {}));
    }
    function hepsi(tur, deger, ek) {
      O.hepsiniBul(T, deger, true).forEach(function (i) { aday(tur, i, i + deger.length, ek); });
    }
    let m;

    /* Mahkeme: ilk dolu satır */
    const ilk = S.find(function (s) { return s.metin.trim(); });
    if (ilk && /MAHKEMES|HAKIMLIG|BASKANLIG|DAIRES/.test(O.katla(ilk.metin))) aday('mahkeme', ilk.bas, ilk.son);

    /* Esas no */
    m = /(?:DOSYA|ESAS)\s*NO\s*:\s*(\d{4}\s*\/\s*\d+)/.exec(K);
    if (m) hepsi('esas', T.substr(m.index + m[0].length - m[1].length, m[1].length));

    /* Borçlu bloğu: DAVALI satırından boş satıra ya da sonraki başlığa kadar */
    const di = S.findIndex(function (s) { return /^\s*DAVALI\b/.test(O.katla(s.metin)) && s.metin.indexOf(':') >= 0; });
    let borcluAdi = '';
    if (di >= 0) {
      const blok = [S[di]];
      for (let i = di + 1; i < S.length; i++) {
        if (!S[i].metin.trim() || ETIKET_SATIRI.test(O.katla(S[i].metin))) break;
        blok.push(S[i]);
      }
      const ilkS = blok[0], ikiNokta = ilkS.bas + ilkS.metin.indexOf(':') + 1;
      const km = /\(?\s*(TCKN|VKN|T\.?\s?C\.?(?:\s*KIMLIK)?(?:\s*NO)?|VERGI(?:\s*KIMLIK)?\s*NO)\s*:?\s*\d{10,11}/;
      let kimlikSatiri = -1;
      blok.forEach(function (s, i) {
        if (kimlikSatiri >= 0) return;
        const x = km.exec(O.katla(s.metin));
        if (!x) return;
        kimlikSatiri = i;
        const lb = s.bas + x.index + x[0].search(/[A-Z]/);
        aday('kimlik', lb, s.bas + x.index + x[0].length);
      });
      let adSon = ilkS.son;
      const parantez = /\(\s*(TCKN|VKN|T\.?\s?C|VERGI)/.exec(O.katla(T.slice(ikiNokta, ilkS.son)));
      if (parantez) adSon = ikiNokta + parantez.index;
      const ak = kirp(T, ikiNokta, adSon);
      if (ak[1] > ak[0]) { borcluAdi = T.slice(ak[0], ak[1]); hepsi('borclu', borcluAdi); }
      const adresIlk = kimlikSatiri >= 0 ? kimlikSatiri + 1 : 1;
      if (adresIlk < blok.length) {
        const a = blok[adresIlk], z = blok[blok.length - 1];
        const girinti = /^\s*/.exec(a.metin)[0];
        aday('adres', a.bas, z.son, { girinti: girinti });
      }
    }

    /* Ara karar ifadesi: "10.01.2026 tarihli duruşma zaptının ara kararı" */
    const arR = /(\d{1,2}[.\/]\d{1,2}[.\/]\d{4})\s*TARIHLI\s*(?:DURUSMA|TENSIP|ON\s*INCELEME)[^\n.]{0,90}?ARA\s*KARARI/g;
    while ((m = arR.exec(K)) !== null) aday('araKarar', m.index, m.index + m[0].length);
    const araKararVar = adaylar.some(function (a) { return a.tur === 'araKarar'; });

    /* Tarihler: yalnız bağlamı tanınanlar */
    const digerTarihler = [];
    const tirnaklar = O.tirnakAraliklari(T);
    let gecisSonKonum = -1;
    TARIH_RE.lastIndex = 0;
    while ((m = TARIH_RE.exec(T)) !== null) {
      const bas = m.index, son = bas + m[0].length;
      if (!tarihSinirli(T, bas, son)) continue;
      if (tirnaklar.some(function (r) { return bas > r[0] && son < r[1]; })) { digerTarihler.push({ deger: m[0], alinti: O.alinti(T, bas, son, 40) }); continue; }
      const sonra = K.slice(son, son + 70), once = K.slice(Math.max(0, bas - 50), bas);
      let tur = '';
      if (bas === gecisSonKonum) tur = 'gecisSon';
      else if (/^\s*(VE|ILE|-|–)\s*\d{1,2}[.\/]\d{1,2}[.\/]\d{4}\s*TARIHLERI\s*ARASI/.test(sonra)) {
        tur = 'gecisBas';
        gecisSonKonum = son + /\d{1,2}[.\/]\d{1,2}[.\/]\d{4}/.exec(T.slice(son)).index;
      }
      else if (/^\s*TARIHLI\s*BILIRKISI\s*RAPOR/.test(sonra)) tur = 'raporTarihi';
      else if (/^\s*TARIHLI\s*(DURUSMA|TENSIP|ON\s*INCELEME)/.test(sonra)) tur = araKararVar ? '' : 'araKararTarihi';
      else if (/(TALEP|ARZ)\s*EDER(IM|IZ)\.?\s*$/.test(once)) tur = 'dilekceTarihi';
      else if (/^\s*TARIHINDE\s[^.\n]{0,60}TAKIP/.test(sonra) || /TAKIP\s*TARIHI\s*:?\s*$/.test(once)) tur = 'takipTarihi';
      if (tur) aday(tur, bas, son);
      else if (!adaylar.some(function (a) { return a.tur === 'araKarar' && bas >= a.bas && bas < a.son; })) digerTarihler.push({ deger: m[0], alinti: O.alinti(T, bas, son, 40) });
    }

    /* İcra dairesi ve icra dosya no */
    const icR = /([A-Z]+)(?:\s+([A-Z]+))?\s+(\d{1,3})\s*\.\s*ICRA\s+(MUDURLUGU|DAIRESI)/g;
    while ((m = icR.exec(K)) !== null) {
      const bas = O.daireBasi(T, K, m.index, m[1], m[2]);
      if (!/[A-ZÇĞİÖŞÜ]/.test(T[bas])) continue;
      const son = m.index + m[0].length;
      aday('icraDaire', bas, son);
      const no = /^[^0-9\n]{0,30}?(\d{4}\s*\/\s*\d+)/.exec(K.slice(son, son + 45));
      if (no) hepsi('icraNo', T.substr(son + no[0].length - no[1].length, no[1].length));
    }

    /* Plaka */
    const plR = /(\d{2}) ?([A-Z]{1,3}) ?(\d{2,5})/g;
    while ((m = plR.exec(T)) !== null) {
      const bas = m.index, son = bas + m[0].length;
      if (/[A-Za-z0-9]/.test(T[bas - 1] || '') || /[A-Za-z0-9]/.test(T[son] || '')) continue;
      if (/PLAKA/.test(K.slice(son, son + 25)) || /PLAKA\S*\s*:?\s*$/.test(K.slice(Math.max(0, bas - 25), bas))) aday('plaka', bas, son);
    }

    /* Tutarlar */
    const tuR = /(\d{1,3}(?:\.\d{3})+|\d+),\d{2}(?=\s*-?\s*(?:TL|TRY|₺))/g;
    while ((m = tuR.exec(T)) !== null) {
      if (/[\d.,]/.test(T[m.index - 1] || '')) continue;
      const satirBas = T.lastIndexOf('\n', m.index) + 1;
      const once = T.slice(Math.max(satirBas, m.index - 70), m.index).trim().split(/\s+/).slice(-6).join(' ');
      aday('tutar', m.index, m.index + m[0].length, { baglam: once });
    }

    /* Rapordan alıntı: tırnak içindeki ve ardından "şeklinde" gelen metin */
    const alR = /["“]([^"”\n]{10,800})["”][ \t]{0,3}(?:şeklinde|ŞEKLİNDE)[ \t]+(?:beyan|tespit|kanaat|görüş|hesap|değerlendirme)/g;
    while ((m = alR.exec(T)) !== null) aday('alinti', m.index + 1, m.index + 1 + m[1].length);

    /* Çakışmaları öncelik sırasıyla çöz */
    adaylar.sort(function (a, b) { return (ONCELIK.indexOf(a.tur) - ONCELIK.indexOf(b.tur)) || (a.bas - b.bas); });
    const alinan = [], kalan = [];
    adaylar.forEach(function (a) {
      if (alinan.some(function (x) { return a.bas < x.son && x.bas < a.son; })) return;
      alinan.push(a);
      kalan.push(a);
    });

    /* Aynı türde aynı değer tek alan */
    const alanlar = [], harita = new Map();
    kalan.sort(function (a, b) { return a.bas - b.bas; }).forEach(function (a) {
      const ham = T.slice(a.bas, a.son);
      const deger = a.tur === 'adres'
        ? ham.split('\n').map(function (x) { return x.trim(); }).filter(Boolean).join('\n')
        : O.sade(ham);
      const anahtar = a.tur + '|' + (a.tur === 'borclu' || a.tur === 'icraDaire' ? O.katla(deger) : deger);
      let alan = harita.get(anahtar);
      if (!alan) {
        alan = {
          id: a.tur + '-' + (alanlar.filter(function (x) { return x.tur === a.tur; }).length + 1),
          tur: a.tur, etiket: ETIKET[a.tur], eski: deger, konumlar: [],
          cokSatir: a.tur === 'adres', uzun: a.tur === 'alinti' || a.tur === 'adres', girinti: a.girinti || '',
          baglam: a.baglam || '', zorunlu: true
        };
        harita.set(anahtar, alan);
        alanlar.push(alan);
      }
      alan.konumlar.push({ bas: a.bas, son: a.son, buyuk: O.buyukMu(ham) });
    });
    alanlar.sort(function (a, b) { return (SIRA.indexOf(a.tur) - SIRA.indexOf(b.tur)) || (a.konumlar[0].bas - b.konumlar[0].bas); });
    alanlar.forEach(function (a) {
      if (a.tur === 'tutar') a.etiket = 'Tutar' + (a.baglam ? ' (' + a.baglam + ' …)' : '');
      if (a.konumlar.length > 1) a.etiket += ' · ' + a.konumlar.length + ' yerde';
    });
    return { alanlar: alanlar, digerTarihler: digerTarihler };
  }

  function degerTemizle(alan, d) {
    d = O.temizMetin(d);
    return alan.cokSatir
      ? d.split('\n').map(function (x) { return x.trim(); }).filter(Boolean).join('\n')
      : d.replace(/\s*\n\s*/g, ' ').trim();
  }
  function degistiMi(alan, d) { return d !== undefined && degerTemizle(alan, d) !== '' && degerTemizle(alan, d) !== alan.eski; }
  function kisalt(s) { s = O.sade(s); return s.length > 50 ? s.slice(0, 47) + '…' : s; }

  /* Girilen değerlerden metin değişiklikleri: { degisiklikler, hatalar } */
  function plan(T, alanlar, degerler, serbest) {
    const hatalar = [], d = [];
    alanlar.forEach(function (a) {
      const v = degerler[a.id];
      if (v === undefined) return;
      const t = degerTemizle(a, v);
      if (!t) { hatalar.push(a.etiket.split(' · ')[0] + ' boş bırakılamaz. Şablondaki gibi kalması için eski değeri yazın.'); return; }
      if (t === a.eski) return;
      a.konumlar.forEach(function (k) {
        let y = a.cokSatir ? t.split('\n').join('\n' + a.girinti) : t;
        if (k.buyuk) y = O.buyukHarf(y);
        d.push({ bas: k.bas, son: k.son, yeni: y, kaynak: a.etiket.split(' · ')[0] });
      });
    });
    (serbest || []).forEach(function (s) {
      const eski = O.temizMetin(s.eski || '');
      if (!eski.trim()) return;
      const yerler = O.hepsiniBul(T, eski, false);
      if (!yerler.length) { hatalar.push('"' + kisalt(eski) + '" şablonda bulunamadı.'); return; }
      yerler.forEach(function (b) { d.push({ bas: b, son: b + eski.length, yeni: O.temizMetin(s.yeni || ''), kaynak: '"' + kisalt(eski) + '"' }); });
    });
    d.sort(function (a, b) { return a.bas - b.bas; });
    for (let i = 1; i < d.length; i++) {
      if (d[i].bas < d[i - 1].son) {
        hatalar.push(d[i].kaynak + ' ile ' + d[i - 1].kaynak + ' aynı metne denk geliyor; birini kaldırın.');
        d.splice(i, 1);
        i--;
      }
    }
    return { degisiklikler: d, hatalar: hatalar };
  }

  /* Rapordan alanlara öneriler: { alanId: değer } */
  function oneriler(alanlar, r) {
    const o = {};
    if (!r) return o;
    alanlar.forEach(function (a) {
      const e = a.eski;
      let v = '';
      switch (a.tur) {
        case 'mahkeme':
          if (r.mahkeme) {
            v = O.buyukHarf(O.sade(r.mahkeme));
            if (/NE$/.test(O.katla(e)) && /MAHKEMESI$/.test(O.katla(v))) v += 'NE';
          }
          break;
        case 'esas': v = r.esas || ''; break;
        case 'borclu': v = r.davali || ''; break;
        case 'kimlik': v = r.kimlik || ''; break;
        case 'icraNo': v = r.icraNo || ''; break;
        case 'plaka': v = r.plaka || ''; break;
        case 'gecisBas': v = r.gecisBas ? O.tarihBicimle(r.gecisBas, e) : ''; break;
        case 'gecisSon': v = r.gecisSon ? O.tarihBicimle(r.gecisSon, e) : ''; break;
        case 'raporTarihi': v = r.raporTarihi ? O.tarihBicimle(r.raporTarihi, e) : ''; break;
        case 'araKararTarihi': v = r.araKarar ? O.tarihBicimle(r.araKarar.tarih, e) : ''; break;
        case 'icraDaire':
          if (r.icraDaire) {
            const ad = /^(.*?\d+\s*\.)\s*/.exec(r.icraDaire), kelime = /(\S+)\s*$/.exec(e);
            v = ad && kelime ? ad[1] + ' İcra ' + kelime[1] : r.icraDaire;
          }
          break;
        case 'araKarar':
          if (r.araKarar) {
            v = e.replace(/\d{1,2}[.\/]\d{1,2}[.\/]\d{4}/, function (x) { return O.tarihBicimle(r.araKarar.tarih, x); });
            if (r.araKarar.tur !== 'ara karar') {
              v = v.replace(/(duruşma|Duruşma|DURUŞMA|tensip|Tensip|TENSİP|ön inceleme|Ön inceleme|ÖN İNCELEME)/, function (x) {
                return O.buyukMu(x) ? O.buyukHarf(r.araKarar.tur) : (x[0] === x[0].toLocaleUpperCase('tr-TR') ? r.araKarar.tur[0].toLocaleUpperCase('tr-TR') + r.araKarar.tur.slice(1) : r.araKarar.tur);
              });
            }
            if (/\d+\s+numaralı\s+/i.test(v)) v = r.araKarar.no ? v.replace(/\d+(\s+numaralı)/i, r.araKarar.no + '$1') : v.replace(/\d+\s+numaralı\s+/i, '');
            else if (r.araKarar.no) v = v.replace(/(ara\s+kararı)/i, r.araKarar.no + ' numaralı $1');
          }
          break;
        default: break;
      }
      if (v && v !== e) o[a.id] = v;
    });
    return o;
  }

  /* Son denetim: değişmeyen alanlar, eski dosyadan kalan izler, raporla uyumsuzluklar */
  function denetim(Y, alanlar, degerler, r) {
    const uyarilar = [];
    const KY = O.katla(Y);
    alanlar.forEach(function (a) {
      const ad = a.etiket.split(' · ')[0];
      const v = degerler[a.id];
      const degisti = degistiMi(a, v);
      if (!degisti) {
        if (a.zorunlu) uyarilar.push({ tur: 'degismedi', metin: ad + ' şablondaki gibi kaldı: ' + kisalt(a.eski) });
        return;
      }
      /* Eski değerin izi */
      let izler = [];
      if (a.tur === 'kimlik') { const n = O.rakamlar(a.eski); if (n.length >= 10 && O.hepsiniBul(Y, n, true).length) izler.push(n); }
      else if (a.tur === 'borclu') {
        O.katla(a.eski).split(/[^A-Z0-9]+/).forEach(function (w) {
          if (w.length >= 4 && !GENEL_SOZCUK.has(w) && !O.katla(degerTemizle(a, v)).split(/[^A-Z0-9]+/).includes(w) && O.hepsiniBul(KY, w, true).length) izler.push(w);
        });
      } else if (['esas', 'icraNo', 'plaka'].indexOf(a.tur) >= 0) {
        if (O.hepsiniBul(KY, O.katla(a.eski), true).length) izler.push(a.eski);
      }
      izler.forEach(function (w) {
        const i = O.hepsiniBul(a.tur === 'kimlik' ? Y : KY, a.tur === 'kimlik' ? w : O.katla(w), true)[0];
        uyarilar.push({ tur: 'iz', metin: 'Eski dosyadan iz: "' + w + '" metinde yine geçiyor.', alinti: O.alinti(Y, i, i + w.length, 50) });
      });
      /* Raporla karşılaştırma */
      if (!r) return;
      const t = degerTemizle(a, v);
      const kars = {
        mahkeme: [r.mahkeme, function (x) { return O.sade(O.katla(x)).replace(/NE$/, ''); }],
        esas: [r.esas, O.sade], icraNo: [r.icraNo, O.sade],
        kimlik: [r.kimlik, O.rakamlar], plaka: [r.plaka, function (x) { return O.katla(x).replace(/\s/g, ''); }],
        borclu: [r.davali, function (x) { return O.sade(O.katla(x)); }],
        raporTarihi: [r.raporTarihi, O.tarihNorm], gecisBas: [r.gecisBas, O.tarihNorm], gecisSon: [r.gecisSon, O.tarihNorm]
      }[a.tur];
      if (kars && kars[0] && kars[1](kars[0]) !== kars[1](t)) uyarilar.push({ tur: 'rapor', metin: ad + ' rapordakinden farklı. Raporda: ' + kars[0] + ' · Dilekçede: ' + kisalt(t) });
    });
    return uyarilar;
  }

  /* "2026/900" > "2026-900 BK Beyan.udf" */
  function dosyaAdi(alanlar, degerler) {
    const e = alanlar.find(function (a) { return a.tur === 'esas'; });
    const v = e ? degerTemizle(e, degerler[e.id] || e.eski) : '';
    const m = /(\d{4})\s*\/\s*(\d+)/.exec(v);
    return (m ? m[1] + '-' + m[2] + ' ' : '') + 'BK Beyan.udf';
  }

  kok.Sablon = {
    alanlariBul: alanlariBul, plan: plan, oneriler: oneriler, denetim: denetim, dosyaAdi: dosyaAdi,
    degistiMi: degistiMi, degerTemizle: degerTemizle, ETIKET: ETIKET
  };
})(typeof window !== 'undefined' ? window : this);
