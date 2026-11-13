/*
 * Bilirkişi Raporuna Beyan: UDF okuma ve yazma
 *
 * UDF (UYAP Doküman Editörü) dosyası içinde tek content.xml bulunan bir zip'tir
 * (bazen zip'siz düz XML). Dilekçe metni <content> içindeki CDATA'dadır; kalın,
 * altı çizili gibi biçimler <elements> altındaki öğelerde startOffset / length ile
 * metne bağlanır. Metin değişince bu konumlar yeniden hesaplanır; öteki her şey
 * (sayfa düzeni, stiller, paragraf ayarları) olduğu gibi kalır.
 */
(function (kok) {
  'use strict';

  /* ---------------- Zip ---------------- */

  async function ac(veri, yontem) {
    if (yontem === 0) return veri;
    if (yontem !== 8) throw new Error('Dosyada desteklenmeyen bir sıkıştırma yöntemi var (' + yontem + ').');
    const akis = new Blob([veri]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(akis).arrayBuffer());
  }

  async function zipOku(b) {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let e = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
      if (v.getUint32(i, true) === 0x06054b50) { e = i; break; }
    }
    if (e < 0) throw new Error('Dosya bozuk: zip dizini bulunamadı.');
    const adet = v.getUint16(e + 10, true);
    let p = v.getUint32(e + 16, true);
    const girisler = new Map();
    for (let k = 0; k < adet; k++) {
      if (p + 46 > b.length || v.getUint32(p, true) !== 0x02014b50) throw new Error('Dosya bozuk: zip dizini okunamadı.');
      const yontem = v.getUint16(p + 10, true), boy = v.getUint32(p + 20, true);
      const adBoy = v.getUint16(p + 28, true), ekBoy = v.getUint16(p + 30, true), notBoy = v.getUint16(p + 32, true);
      const yerel = v.getUint32(p + 42, true);
      const ad = new TextDecoder().decode(b.subarray(p + 46, p + 46 + adBoy));
      const bas = yerel + 30 + v.getUint16(yerel + 26, true) + v.getUint16(yerel + 28, true);
      girisler.set(ad, { yontem: yontem, veri: b.subarray(bas, bas + boy) });
      p += 46 + adBoy + ekBoy + notBoy;
    }
    return girisler;
  }

  const CRC = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(b) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  /* Tek dosyalı zip: UYAP'ın ürettiği gibi "content.xml", deflate ile */
  async function zipYaz(ad, veri) {
    const simdi = new Date();
    const saat = (simdi.getHours() << 11) | (simdi.getMinutes() << 5) | (simdi.getSeconds() >> 1);
    const gun = ((Math.max(simdi.getFullYear(), 1980) - 1980) << 9) | ((simdi.getMonth() + 1) << 5) | simdi.getDate();
    const adB = new TextEncoder().encode(ad), crc = crc32(veri);
    const akis = new Blob([veri]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const govde = new Uint8Array(await new Response(akis).arrayBuffer());
    const yerel = new Uint8Array(30 + adB.length), y = new DataView(yerel.buffer);
    y.setUint32(0, 0x04034b50, true); y.setUint16(4, 20, true); y.setUint16(6, 0, true); y.setUint16(8, 8, true);
    y.setUint16(10, saat, true); y.setUint16(12, gun, true); y.setUint32(14, crc, true);
    y.setUint32(18, govde.length, true); y.setUint32(22, veri.length, true); y.setUint16(26, adB.length, true);
    yerel.set(adB, 30);
    const merkez = new Uint8Array(46 + adB.length), m = new DataView(merkez.buffer);
    m.setUint32(0, 0x02014b50, true); m.setUint16(4, 20, true); m.setUint16(6, 20, true); m.setUint16(8, 0, true);
    m.setUint16(10, 8, true); m.setUint16(12, saat, true); m.setUint16(14, gun, true); m.setUint32(16, crc, true);
    m.setUint32(20, govde.length, true); m.setUint32(24, veri.length, true); m.setUint16(28, adB.length, true);
    m.setUint32(42, 0, true); merkez.set(adB, 46);
    const son = new Uint8Array(22), s = new DataView(son.buffer);
    s.setUint32(0, 0x06054b50, true); s.setUint16(8, 1, true); s.setUint16(10, 1, true);
    s.setUint32(12, merkez.length, true); s.setUint32(16, yerel.length + govde.length, true);
    const cikti = new Uint8Array(yerel.length + govde.length + merkez.length + son.length);
    let p = 0;
    [yerel, govde, merkez, son].forEach(function (x) { cikti.set(x, p); p += x.length; });
    return cikti;
  }

  /* ---------------- content.xml ---------------- */

  const ICERIK = /<content>\s*((?:<!\[CDATA\[[\s\S]*?\]\]>\s*)+)<\/content>/;

  /* <elements> bloğunu etiket ağacına çevirir. Ham etiket metinleri saklanır; yazarken
     yalnız startOffset ve length değerleri değişir. */
  function agacKur(s) {
    const kok = { ad: '#kok', cocuklar: [] }, yigin = [kok];
    const re = /<(?:"[^"]*"|'[^']*'|[^'">])*>|[^<]+/g;
    let m;
    while ((m = re.exec(s)) !== null) {
      const t = m[0], ust = yigin[yigin.length - 1];
      if (t[0] !== '<') { ust.cocuklar.push({ ad: '#metin', ham: t }); continue; }
      if (/^<[?!]/.test(t)) { ust.cocuklar.push({ ad: '#metin', ham: t }); continue; }
      if (t[1] === '/') {
        if (yigin.length > 1) { ust.kapanis = t; yigin.pop(); }
        continue;
      }
      const ad = /^<([^\s\/>]+)/.exec(t)[1];
      const dugum = { ad: ad, ham: t, tek: /\/\s*>$/.test(t), cocuklar: [], kapanis: '' };
      ust.cocuklar.push(dugum);
      if (!dugum.tek) yigin.push(dugum);
    }
    if (yigin.length > 1) throw new Error('Dosya bozuk: biçim bölümü kapanmamış.');
    return kok;
  }

  function konumAl(d) {
    const a = /\sstartOffset="(\d+)"/.exec(d.ham), b = /\slength="(\d+)"/.exec(d.ham);
    return a && b ? { bas: +a[1], boy: +b[1] } : null;
  }
  function konumYaz(ham, bas, boy) {
    return ham.replace(/(\s)startOffset="\d+"/, '$1startOffset="' + bas + '"').replace(/(\s)length="\d+"/, '$1length="' + boy + '"');
  }
  function yazdir(d) {
    if (d.ad === '#metin') return d.ham;
    return d.ham + (d.tek ? '' : d.cocuklar.map(yazdir).join('') + d.kapanis);
  }

  /* Dosya içeriğinden (zip ya da düz XML) şablonu okur */
  async function oku(bayt) {
    bayt = bayt instanceof Uint8Array ? bayt : new Uint8Array(bayt);
    let xmlBayt = bayt;
    if (bayt[0] === 0x50 && bayt[1] === 0x4B) {
      const g = await zipOku(bayt);
      const giris = g.get('content.xml') || Array.from(g.values())[0];
      if (!giris) throw new Error('UDF dosyasının içinde content.xml yok.');
      xmlBayt = await ac(giris.veri, giris.yontem);
    }
    return coz(new TextDecoder('utf-8').decode(xmlBayt));
  }

  function coz(xml) {
    xml = xml.replace(/^﻿/, '');
    const ic = ICERIK.exec(xml);
    if (!ic) throw new Error('Bu dosya UDF dilekçesi gibi görünmüyor: metin bölümü bulunamadı.');
    let metin = '';
    ic[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, function (m, t) { metin += t; return m; });
    metin = metin.replace(/\r\n?/g, '\n');
    const ea = /<elements\b(?:"[^"]*"|'[^']*'|[^'">])*>/.exec(xml);
    const ek = xml.lastIndexOf('</elements>');
    if (!ea || ek < ea.index) throw new Error('Bu dosya UDF dilekçesi gibi görünmüyor: biçim bölümü bulunamadı.');
    return {
      xml: xml, metin: metin,
      icerik: { bas: ic.index, son: ic.index + ic[0].length },
      elemanlar: { bas: ea.index + ea[0].length, son: ek },
      agac: agacKur(xml.slice(ea.index + ea[0].length, ek))
    };
  }

  /* Paragraf yalnız konumlu tek etiketlerden (content, space...) oluşuyorsa birleştirilip bölünebilir */
  function basitParagrafMi(d) {
    if (d.ad !== 'paragraph' || d.tek) return false;
    let var_ = false;
    for (const c of d.cocuklar) {
      if (c.ad === '#metin') { if (c.ham.trim()) return false; continue; }
      if (!c.tek || !konumAl(c)) return false;
      var_ = true;
    }
    return var_;
  }

  /*
   * Metinde değişiklik yapar ve biçim konumlarını yeniden hesaplar.
   * degisiklikler: [{ bas, son, yeni }] (asıl metindeki konumlar; çakışmaz, son > bas).
   * Yeni metnin bir biçim parçasının içine düşen kısmı o parçanın biçimini alır.
   * Yeni metinde satır sonu varsa paragraf bölünür; bir paragrafın satır sonu
   * değişikliğin içinde kaldıysa paragraf sonrakiyle birleşir.
   * Döner: { xml, metin, araliklar (yeni metinde değişen yerler) }
   */
  function uygula(sablon, degisiklikler) {
    const T = sablon.metin;
    const liste = (degisiklikler || []).map(function (d) {
      return { bas: d.bas, son: d.son, yeni: String(d.yeni).replace(/\r\n?/g, '\n') };
    }).sort(function (a, b) { return a.bas - b.bas; });
    for (let i = 0; i < liste.length; i++) {
      const d = liste[i];
      if (!(d.bas >= 0 && d.son > d.bas && d.son <= T.length)) throw new Error('Geçersiz değişiklik aralığı.');
      if (i && d.bas < liste[i - 1].son) throw new Error('İki değişiklik aynı metne denk geliyor.');
    }
    let Y = '', onceki = 0;
    const araliklar = [];
    liste.forEach(function (d) {
      Y += T.slice(onceki, d.bas);
      araliklar.push([Y.length, Y.length + d.yeni.length]);
      Y += d.yeni;
      onceki = d.son;
    });
    Y += T.slice(onceki);

    function esle(p) {
      let fark = 0;
      for (const d of liste) {
        if (p <= d.bas) return p + fark;
        if (p < d.son) return d.bas + fark + d.yeni.length;
        fark += d.yeni.length - (d.son - d.bas);
      }
      return p + fark;
    }
    function silindiMi(p) { return liste.some(function (d) { return p >= d.bas && p < d.son; }); }
    function eklendiMi(q) { return araliklar.some(function (r) { return q >= r[0] && q < r[1]; }); }

    /* Karmaşık öğelerde (alt bilgi, tablo...) yalnız konumlar güncellenir */
    function yerindeGuncelle(d) {
      if (d.ad === '#metin') return d.ham;
      if (d.tek) {
        const k = konumAl(d);
        if (!k) return d.ham;
        const a = esle(k.bas), b = esle(k.bas + k.boy);
        return b > a ? konumYaz(d.ham, a, b - a) : '';
      }
      return d.ham + d.cocuklar.map(yerindeGuncelle).join('') + d.kapanis;
    }

    function paragrafYaz(acilis, kapanis, parcalar) {
      return acilis + parcalar.map(function (p) { return konumYaz(p.ham, p.bas, p.son - p.bas); }).join('') + kapanis;
    }

    const ust = sablon.agac.cocuklar;
    let cikti = '';
    for (let i = 0; i < ust.length; i++) {
      const d = ust[i];
      if (!basitParagrafMi(d)) { cikti += yerindeGuncelle(d); continue; }
      /* Satır sonu değişikliğin içinde kalan paragraflar sonrakiyle birleşir */
      const grup = [d];
      for (;;) {
        const son = grup[grup.length - 1];
        const ys = son.cocuklar.filter(function (c) { return c.ad !== '#metin'; });
        const k = konumAl(ys[ys.length - 1]), e = k.bas + k.boy;
        if (!(T[e - 1] === '\n' && silindiMi(e - 1))) break;
        let j = i + 1;
        while (j < ust.length && ust[j].ad === '#metin' && !ust[j].ham.trim()) j++;
        if (j >= ust.length || !basitParagrafMi(ust[j])) break;
        grup.push(ust[j]);
        i = j;
      }
      /* Yeni konumlar; yeni metindeki satır sonlarında parça bölünür */
      const parcalar = [];
      grup.forEach(function (p) {
        p.cocuklar.forEach(function (c) {
          if (c.ad === '#metin') return;
          const k = konumAl(c), a = esle(k.bas), b = esle(k.bas + k.boy);
          if (b <= a) return;
          let x = a;
          for (let q = a; q < b; q++) {
            if (Y[q] === '\n' && eklendiMi(q)) {
              parcalar.push({ ham: c.ham, bas: x, son: q + 1, kaynak: p, kapat: true });
              x = q + 1;
            }
          }
          if (x < b) parcalar.push({ ham: c.ham, bas: x, son: b, kaynak: p, kapat: false });
        });
      });
      let simdiki = [];
      parcalar.forEach(function (p, n) {
        simdiki.push(p);
        if (p.kapat && n < parcalar.length - 1) {
          cikti += paragrafYaz(simdiki[0].kaynak.ham, simdiki[0].kaynak.kapanis, simdiki);
          simdiki = [];
        }
      });
      if (simdiki.length) cikti += paragrafYaz(simdiki[0].kaynak.ham, simdiki[0].kaynak.kapanis, simdiki);
    }

    const icerik = '<content><![CDATA[' + Y.replace(/\]\]>/g, ']]]]><![CDATA[>') + ']]></content>';
    const x = sablon.xml;
    const xml = x.slice(0, sablon.icerik.bas) + icerik + x.slice(sablon.icerik.son, sablon.elemanlar.bas) + cikti + x.slice(sablon.elemanlar.son);
    return { xml: xml, metin: Y, araliklar: araliklar };
  }

  /* Yazılan dosyanın tutarlılığı: biçim parçaları metni boşluksuz ve sırayla kaplamalı,
     her paragraf satır sonuyla bitmeli. Sorun listesi döner (boşsa sorun yok). */
  function denetle(xml) {
    const sorunlar = [];
    let s;
    try { s = coz(xml); } catch (e) { return [e.message]; }
    const T = s.metin;
    let p = 0, parSay = 0, nlYok = 0;
    (function gez(d, ustParagraf) {
      d.cocuklar.forEach(function (c) {
        if (c.ad === '#metin') return;
        if (c.tek) {
          const k = konumAl(c);
          if (!k) return;
          if (k.bas !== p && sorunlar.length < 5) sorunlar.push('Biçim parçası metinle örtüşmüyor (konum ' + k.bas + ', beklenen ' + p + ').');
          if (k.boy <= 0 && sorunlar.length < 5) sorunlar.push('Boş biçim parçası (konum ' + k.bas + ').');
          p = k.bas + k.boy;
          return;
        }
        gez(c, c.ad === 'paragraph' ? c : ustParagraf);
        if (c.ad === 'paragraph' && basitParagrafMi(c)) {
          parSay++;
          const ys = c.cocuklar.filter(function (x) { return x.ad !== '#metin'; });
          const k = konumAl(ys[ys.length - 1]);
          if (T[k.bas + k.boy - 1] !== '\n') nlYok++;
        }
      });
    })(s.agac, null);
    if (p > T.length) sorunlar.push('Biçim parçaları metnin sonunu aşıyor.');
    if (T.length - p > 2) sorunlar.push('Metnin sonundaki ' + (T.length - p) + ' karakterin biçimi yok.');
    if (nlYok > 1) sorunlar.push(nlYok + ' paragraf satır sonuyla bitmiyor.');
    if (!parSay) sorunlar.push('Dosyada paragraf yok.');
    return sorunlar;
  }

  async function paketle(xml) {
    return zipYaz('content.xml', new TextEncoder().encode(xml));
  }

  kok.Udf = { oku: oku, coz: coz, uygula: uygula, denetle: denetle, paketle: paketle, _ic: { zipOku: zipOku, zipYaz: zipYaz, ac: ac, crc32: crc32 } };
})(typeof window !== 'undefined' ? window : this);
