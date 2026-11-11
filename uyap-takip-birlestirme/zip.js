/*
 * UYAP Takip XML Birleştirme: küçük zip yazıcı
 * Birleşik dosyayı ve borçlu adıyla adlandırılmış dosyaları tek .zip olarak indirmek için.
 * Türkçe dosya adları UTF-8 işaretiyle yazılır.
 */
(function (kok) {
  'use strict';

  const CRC_TABLOSU = (function () {
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
    for (let i = 0; i < b.length; i++) c = CRC_TABLOSU[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  async function sikistir(veri) {
    const akis = new Blob([veri]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(akis).arrayBuffer());
  }

  /* girisler: [[ad, Uint8Array], ...] */
  async function olustur(girisler) {
    const simdi = new Date();
    const saat = (simdi.getHours() << 11) | (simdi.getMinutes() << 5) | (simdi.getSeconds() >> 1);
    const gun = ((Math.max(simdi.getFullYear(), 1980) - 1980) << 9) | ((simdi.getMonth() + 1) << 5) | simdi.getDate();
    const sikistirabilir = typeof CompressionStream !== 'undefined';
    const kodla = new TextEncoder();
    const parcalar = [], merkez = [];
    let ofset = 0;
    for (const g of girisler) {
      const ad = kodla.encode(g[0]), veri = g[1], crc = crc32(veri);
      let govde = veri, yontem = 0;
      if (sikistirabilir && veri.length > 128) {
        const s = await sikistir(veri);
        if (s.length < veri.length) { govde = s; yontem = 8; }
      }
      const yerel = new Uint8Array(30 + ad.length), yv = new DataView(yerel.buffer);
      yv.setUint32(0, 0x04034b50, true); yv.setUint16(4, 20, true); yv.setUint16(6, 0x0800, true);
      yv.setUint16(8, yontem, true); yv.setUint16(10, saat, true); yv.setUint16(12, gun, true);
      yv.setUint32(14, crc, true); yv.setUint32(18, govde.length, true); yv.setUint32(22, veri.length, true);
      yv.setUint16(26, ad.length, true); yerel.set(ad, 30);
      parcalar.push(yerel, govde);
      const m = new Uint8Array(46 + ad.length), mv = new DataView(m.buffer);
      mv.setUint32(0, 0x02014b50, true); mv.setUint16(4, 20, true); mv.setUint16(6, 20, true); mv.setUint16(8, 0x0800, true);
      mv.setUint16(10, yontem, true); mv.setUint16(12, saat, true); mv.setUint16(14, gun, true);
      mv.setUint32(16, crc, true); mv.setUint32(20, govde.length, true); mv.setUint32(24, veri.length, true);
      mv.setUint16(28, ad.length, true); mv.setUint32(42, ofset, true); m.set(ad, 46);
      merkez.push(m);
      ofset += yerel.length + govde.length;
    }
    let merkezBoyu = 0;
    merkez.forEach(function (m) { merkezBoyu += m.length; });
    const son = new Uint8Array(22), sv = new DataView(son.buffer);
    sv.setUint32(0, 0x06054b50, true); sv.setUint16(8, girisler.length, true); sv.setUint16(10, girisler.length, true);
    sv.setUint32(12, merkezBoyu, true); sv.setUint32(16, ofset, true);
    const tum = parcalar.concat(merkez, [son]);
    let toplam = 0;
    tum.forEach(function (x) { toplam += x.length; });
    const cikti = new Uint8Array(toplam);
    let p = 0;
    tum.forEach(function (x) { cikti.set(x, p); p += x.length; });
    return cikti;
  }

  kok.ZipYazici = { olustur: olustur };
})(typeof window !== 'undefined' ? window : this);
