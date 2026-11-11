/*
 * UYAP Takip XML Birleştirme: birleştirme mantığı
 *
 * İcra programlarının (ör. Galle) ürettiği UYAP takip XML'lerini (exchangeData)
 * okur, borçlu adlarını bulur ve <dosya> bloklarını tek XML'de birleştirir.
 * Bloklar metin olarak aynen alınır; yalnız dosyalar arasında çakışan id
 * değerleri (taraf_11, adres_1 ...) ve aynı bloktaki ref atıfları yeniden
 * numaralanır. Tarayıcıda çalışır, dosya içeriği hiçbir yere gönderilmez.
 */
(function (kok) {
  'use strict';

  const ID_RE = /(\sid=")([^"]+)(")/g;
  const BLOK_RE = /<dosya\b[\s\S]*?<\/dosya>/g;

  /* UTF-8 (BOM'lu ya da BOM'suz) okunur; olmazsa XML bildirimindeki kodlama denenir */
  function metneCevir(bayt) {
    const b = bayt instanceof Uint8Array ? bayt : new Uint8Array(bayt);
    try {
      return { metin: new TextDecoder('utf-8', { fatal: true }).decode(b), utf8: true };
    } catch (e) {
      const bas = new TextDecoder('windows-1254').decode(b.subarray(0, 300));
      const m = /encoding=["']([^"']+)["']/i.exec(bas);
      let metin;
      try { metin = new TextDecoder(m ? m[1] : 'windows-1254').decode(b); } catch (e2) { metin = new TextDecoder('windows-1254').decode(b); }
      return { metin: metin, utf8: false };
    }
  }

  function cocuk(el, ad) {
    for (let c = el.firstElementChild; c; c = c.nextElementSibling) if (c.nodeName === ad) return c;
    return null;
  }

  function sayi(v) {
    if (v === null || v === undefined || v === '') return 0;
    const x = parseFloat(String(v).replace(',', '.'));
    return isFinite(x) ? x : 0;
  }

  function xmlCoz(metin) {
    const doc = new DOMParser().parseFromString(metin, 'application/xml');
    return doc.getElementsByTagName('parsererror').length ? null : doc;
  }

  /* Bir dosyayı okur: borçlular, alacaklılar, <dosya> blokları, takip sayısı, alacak tutarı */
  function oku(metin, utf8) {
    const doc = xmlCoz(metin);
    if (!doc) throw new Error('XML okunamadı; dosya bozuk ya da yarım inmiş olabilir.');
    const k = doc.documentElement;
    const dosyalar = cocuk(k, 'dosyalar');
    if (k.nodeName !== 'exchangeData' || !dosyalar || !cocuk(dosyalar, 'dosya')) {
      throw new Error("UYAP takip XML'i değil (exchangeData > dosyalar > dosya yok).");
    }
    const borclular = [], alacaklilar = [];
    Array.from(doc.getElementsByTagName('taraf')).forEach(function (t) {
      const rol = cocuk(t, 'rolTur'), kk = cocuk(t, 'kisiKurumBilgileri');
      if (!rol || !kk) return;
      const r = rol.getAttribute('Rol') || '';
      if (r.indexOf('BORÇLU') === 0) borclular.push(kk.getAttribute('ad') || '');
      else if (r.indexOf('ALACAKLI') === 0) alacaklilar.push(kk.getAttribute('ad') || '');
    });
    const bloklar = metin.match(BLOK_RE) || [];
    if (!bloklar.length) throw new Error('<dosya> bloğu bulunamadı.');
    let tutar = 0;
    Array.from(doc.getElementsByTagName('digerAlacak')).forEach(function (e) { tutar += sayi(e.getAttribute('tutar')); });
    const takipSayisi = Array.from(dosyalar.children).filter(function (c) { return c.nodeName === 'dosya'; }).length;
    return { metin: metin, utf8: utf8 !== false, bloklar: bloklar, borclular: borclular, alacaklilar: alacaklilar, takipSayisi: takipSayisi, tutar: tutar };
  }

  function idler(blok) {
    const l = [];
    let m;
    ID_RE.lastIndex = 0;
    while ((m = ID_RE.exec(blok)) !== null) l.push(m[2]);
    return l;
  }

  /* Borçlu adına göre sıralar (Python scriptiyle aynı: harf kodu sırası) */
  function sirala(kayitlar) {
    function anahtar(k) { return k.borclular.join(' ').normalize('NFC'); }
    return kayitlar.slice().sort(function (a, b) {
      const x = anahtar(a), y = anahtar(b);
      return x < y ? -1 : (x > y ? 1 : 0);
    });
  }

  /* Sıralı kayıtları birleştirir; çakışan id'leri ikinci ve sonraki bloklarda benzersizleştirir */
  function birlestir(kayitlar) {
    if (!kayitlar.length) throw new Error('Birleştirilecek dosya yok.');
    const kullanilan = new Set(), bloklar = [], degisen = [];
    let sira = 0;
    kayitlar.forEach(function (k) {
      let sayac = 0;
      k.bloklar.forEach(function (blok) {
        const eslem = new Map(), atanan = new Set();
        Array.from(new Set(idler(blok))).forEach(function (idv) {
          if (!kullanilan.has(idv)) return;
          const i = idv.lastIndexOf('_');
          const on = i >= 0 ? idv.slice(0, i) : '', son = i >= 0 ? idv.slice(i + 1) : idv;
          let aday = /^\d+$/.test(son) && on ? on + '_' + (parseInt(son, 10) + 1000000 * sira) : idv + '_' + sira;
          while (kullanilan.has(aday) || atanan.has(aday)) aday += '0';
          eslem.set(idv, aday);
          atanan.add(aday);
        });
        if (eslem.size) {
          blok = blok.replace(ID_RE, function (tum, a, idv, c) { return a + (eslem.has(idv) ? eslem.get(idv) : idv) + c; });
        }
        idler(blok).forEach(function (v) { kullanilan.add(v); });
        bloklar.push(blok);
        sayac += eslem.size;
        sira++;
      });
      degisen.push(sayac);
    });
    const bas = kayitlar[0].metin, ac = '<dosyalar>', kapa = '</dosyalar>';
    const i1 = bas.indexOf(ac), i2 = bas.indexOf(kapa);
    if (i1 < 0 || i2 < 0) throw new Error('İlk dosyada <dosyalar> etiketi bulunamadı.');
    let onek = bas.slice(0, i1 + ac.length);
    if (kayitlar[0].utf8 === false) onek = onek.replace(/encoding=["'][^"']*["']/i, 'encoding="UTF-8"');
    return { metin: onek + bloklar.join('') + bas.slice(i2), degisen: degisen };
  }

  /* Birleşik dosyayı denetler: id'ler benzersiz mi, her ref kendi takibinde çözülüyor mu */
  function dogrula(metin) {
    const doc = xmlCoz(metin);
    if (!doc) throw new Error('Birleşik XML okunamadı.');
    function kimlikler(kap) {
      return Array.from(kap.getElementsByTagName('*'))
        .filter(function (e) { return e.nodeName !== 'ref' && e.getAttribute('id'); })
        .map(function (e) { return e.getAttribute('id'); });
    }
    const tum = kimlikler(doc);
    if (new Set(tum).size !== tum.length) throw new Error('Birleşik dosyada tekrar eden id var.');
    const dosyalar = cocuk(doc.documentElement, 'dosyalar');
    const takipler = dosyalar ? Array.from(dosyalar.children).filter(function (c) { return c.nodeName === 'dosya'; }) : [];
    let ref = 0;
    takipler.forEach(function (d) {
      const yerel = new Set(kimlikler(d));
      Array.from(d.getElementsByTagName('ref')).forEach(function (r) {
        ref++;
        if (!yerel.has(r.getAttribute('id'))) throw new Error('Çözülmeyen ref: ' + r.getAttribute('id'));
      });
    });
    return { takip: takipler.length, id: tum.length, ref: ref };
  }

  function temizAd(ad) {
    const s = String(ad === null || ad === undefined ? '' : ad).replace(/[\/:\\*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
    return s || 'BORÇLU ADI YOK';
  }

  function kisaAd(kayit) { return temizAd(kayit.borclular.join(' - ')); }

  function birlesikAd(kisaAdlar) {
    const n = kisaAdlar.length;
    let ad = n <= 3 ? 'Toplu Takip - ' + kisaAdlar.join(', ') + '.xml' : 'Toplu Takip - ' + n + ' dosya.xml';
    if (ad.length > 200) ad = 'Toplu Takip - ' + n + ' dosya.xml';
    return ad;
  }

  /* Aynı ad iki kez çıkarsa "(2)" eklenir */
  function benzersiz(adlar) {
    const gorulen = new Set();
    return adlar.map(function (a) {
      const nokta = a.lastIndexOf('.');
      const govde = nokta > 0 ? a.slice(0, nokta) : a, uz = nokta > 0 ? a.slice(nokta) : '';
      let s = a, i = 2;
      while (gorulen.has(s.toLocaleLowerCase('tr-TR'))) s = govde + ' (' + i++ + ')' + uz;
      gorulen.add(s.toLocaleLowerCase('tr-TR'));
      return s;
    });
  }

  function klasorAdi(tarih, n) {
    function iki(x) { return x < 10 ? '0' + x : String(x); }
    return tarih.getFullYear() + '-' + iki(tarih.getMonth() + 1) + '-' + iki(tarih.getDate()) + ' ' + iki(tarih.getHours()) + '.' + iki(tarih.getMinutes()) + ' - ' + n + ' dosya';
  }

  kok.UyapBirlestirme = {
    metneCevir: metneCevir, oku: oku, sirala: sirala, birlestir: birlestir, dogrula: dogrula,
    temizAd: temizAd, kisaAd: kisaAd, birlesikAd: birlesikAd, benzersiz: benzersiz, klasorAdi: klasorAdi
  };
})(typeof window !== 'undefined' ? window : this);
