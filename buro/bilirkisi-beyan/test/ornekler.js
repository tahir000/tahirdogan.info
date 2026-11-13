/*
 * Test için örnek dosyalar: UDF şablonu ve metinli PDF rapor, kod içinde üretilir.
 * Yapı gerçek dosyalara benzer; kişi, şirket, numara ve tutarlar uydurmadır.
 */
(function (kok) {
  'use strict';

  /* paragraflar: [{ hiza, parcalar: [[metin, { bold, underline, italic, bosluk }], ...] }] */
  function udfXml(paragraflar) {
    let metin = '', el = '';
    paragraflar.forEach(function (p) {
      el += '<paragraph Alignment="' + (p.hiza || 3) + '">';
      p.parcalar.forEach(function (x) {
        const t = x[0], b = x[1] || {};
        if (b.bosluk) el += '<space resolver="hvl-default" startOffset="' + metin.length + '" length="' + t.length + '" />';
        else el += '<content' + (b.bold ? ' bold="true"' : '') + (b.underline ? ' underline="true"' : '') + (b.italic ? ' italic="true"' : '') + ' startOffset="' + metin.length + '" length="' + t.length + '" />';
        metin += t;
      });
      el += '</paragraph>';
    });
    metin += '\n';
    return '<?xml version="1.0" encoding="UTF-8" ?> \n\n<template format_id="1.8" >\n<content><![CDATA[' + metin + ']]></content>' +
      '<properties><pageFormat mediaSizeName="1" leftMargin="42.5" rightMargin="42.5" topMargin="42.5" bottomMargin="42.5" paperOrientation="1" headerFOffset="20.0" footerFOffset="20.0" /></properties>\n' +
      '<elements resolver="hvl-default" >\n' + el + '\n</elements>\n' +
      '<styles><style name="hvl-default" family="Times New Roman" size="12" description="Gövde" /></styles>\n</template>\n';
  }

  const B = { bold: true }, BU = { bold: true, underline: true }, I = { italic: true };
  function p(hiza) { return { hiza: hiza, parcalar: Array.prototype.slice.call(arguments, 1).map(function (x) { return typeof x === 'string' ? [x] : x; }) }; }

  function sablon() {
    return udfXml([
      p(1, ['İSTANBUL 9. ASLİYE TİCARET MAHKEMESİNE', B], '\n'),
      p(3, '\n'),
      p(3, ['DOSYA NO', BU], ['\t', { bosluk: true }], ['\t: 2025/111 E.', B], '\n'),
      p(3, '\n'),
      p(3, ['DAVACI – ALACAKLI', BU], '\t: Örnek Otoyol İşletme A.Ş.\n'),
      p(3, '\n'),
      p(3, ['DAVALI -BORÇLU', BU], '\t: DENEME LOJİSTİK LİMİTED ŞİRKETİ (VKN: 1234567890 )\n'),
      p(3, '\t\t', ['Örnek Mah. Test Cad. No:5', I], '\n'),
      p(3, '\t\t', ['Kadıköy / İSTANBUL', I], '\n'),
      p(3, '\n'),
      p(3, ['KONU', BU], '\t\t: Bilirkişi raporuna karşı beyanlarımız sunumudur.\n'),
      p(3, '\n'),
      p(3, 'Sayın Mahkemeniz nezdinde görülen dava kapsamında 12.01.2026 tarihli duruşma zaptının 7 numaralı ara kararı ile dosyanın bilirkişiye tevdiine karar verilmiştir. 15.02.2026 tarihli bilirkişi raporu tarafımıza tebliğ edilmiştir.\n'),
      p(3, 'Davalı-Borçlu 34AB123 plakalı araçla 01.01.2024 ve 31.03.2024 tarihleri arasında ihlalli geçişler yapmıştır.\n'),
      p(3, 'Davalı-Borçlunun İstanbul 5. İcra Müdürlüğü\'nün 2025/2222 E. sayılı dosyası ile başlatılan takipte alacak 3.250,00-TL olarak hesaplanmıştır. ', ['DENEME LOJİSTİK', B], ' takibe itiraz etmiştir.\n'),
      p(3, 'Sayın Bilirkişi tarafından raporun sonuç bölümünde "geçişlerin ihlalli olduğu ve 4.100,25 TL" şeklinde beyanda bulunulmuştur.\n'),
      p(3, 'Yargıtay 3. HD\'nin 01.02.2010 tarihli kararı: ', ['“... 05.05.2009 tarihinden itibaren faiz yürütülmelidir ...”', I], '\n'),
      p(3, '\n'),
      p(3, 'Karar verilmesini saygılarımla arz ve talep ederim. 20.02.2026\n'),
      p(2, ['Davacı-Alacaklı vekili', B], '\n')
    ]);
  }

  /* ---------------- PDF ---------------- */

  async function zlib(metin) {
    const b = new Uint8Array(metin.length);
    for (let i = 0; i < metin.length; i++) b[i] = metin.charCodeAt(i) & 255;
    const akis = new Blob([b]).stream().pipeThrough(new CompressionStream('deflate'));
    return new Uint8Array(await new Response(akis).arrayBuffer());
  }
  function hex4(n) { return ('0000' + n.toString(16).toUpperCase()).slice(-4); }

  /*
   * satirlar: her satır bir parça listesi. Parça: { t: metin } (Türkçe karakterli, Type0 yazı tipi),
   * { a: metin } (ASCII, basit WinAnsi yazı tipi, literal dize), { k: sayı } (TJ aralığı).
   * Rakamlar CMap'te başlangıç değerli bfrange ile, ilk üç karakter dizi biçimli bfrange ile eşlenir.
   */
  async function pdf(satirlar) {
    const harfler = [];
    satirlar.forEach(function (s) { s.forEach(function (x) { if (x.t) for (const c of x.t) if (!/[0-9]/.test(c) && harfler.indexOf(c) < 0) harfler.push(c); }); });
    function cid(c) { return /[0-9]/.test(c) ? 0x100 + (+c) : harfler.indexOf(c) + 1; }
    let cmap = '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n';
    cmap += '2 beginbfrange\n<0001> <0003> [' + harfler.slice(0, 3).map(function (c) { return '<' + hex4(c.charCodeAt(0)) + '>'; }).join(' ') + ']\n<0100> <0109> <0030>\nendbfrange\n';
    cmap += (harfler.length - 3) + ' beginbfchar\n' + harfler.slice(3).map(function (c, i) { return '<' + hex4(i + 4) + '> <' + hex4(c.charCodeAt(0)) + '>'; }).join('\n') + '\nendbfchar\nendcmap\nend\nend';
    let icerik = '';
    satirlar.forEach(function (s, i) {
      icerik += 'BT\n1 0 0 1 72 ' + (780 - i * 16) + ' Tm\n';
      s.forEach(function (x) {
        if (x.t !== undefined) {
          icerik += '/F2 11 Tf\n[<' + Array.from(x.t).map(function (c) { return hex4(cid(c)); }).join('') + '>] TJ\n';
        } else if (x.a !== undefined) {
          icerik += '/F1 11 Tf\n(' + x.a.replace(/[\\()]/g, function (c) { return '\\' + c; }) + ') Tj\n';
        } else if (x.k !== undefined) {
          icerik += '[' + x.k + '] TJ\n';
        }
      });
      icerik += 'ET\n';
    });
    const cmapZ = await zlib(cmap), icerikZ = await zlib(icerik);
    const genislik = [];
    for (let i = 32; i <= 126; i++) genislik.push(500);
    /* 4, 5 ve 7 numaralı nesneler nesne akışında */
    const akisNesneleri = [
      [4, '<</Type/Font/Subtype/TrueType/BaseFont/ABCDEF+Deneme/Encoding/WinAnsiEncoding/FirstChar 32/LastChar 126/Widths[' + genislik.join(' ') + ']>>'],
      [5, '<</Type/Font/Subtype/Type0/BaseFont/ABCDEF+Deneme-Bold/Encoding/Identity-H/DescendantFonts[7 0 R]/ToUnicode 8 0 R>>'],
      [7, '<</Type/Font/Subtype/CIDFontType2/BaseFont/ABCDEF+Deneme-Bold/CIDSystemInfo<</Registry(Adobe)/Ordering(Identity)/Supplement 0>>/DW 500>>']
    ];
    let bas = '', govde = '';
    akisNesneleri.forEach(function (n) { bas += n[0] + ' ' + govde.length + ' '; govde += n[1] + '\n'; });
    const objStm = await zlib(bas + govde);
    const parcalar = [];
    function ekle(s) { parcalar.push(typeof s === 'string' ? Uint8Array.from(s, function (c) { return c.charCodeAt(0) & 255; }) : s); }
    ekle('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n');
    ekle('1 0 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj\n');
    ekle('2 0 obj\n<</Type/Pages/Count 1/Kids[ 3 0 R] >>\nendobj\n');
    ekle('3 0 obj\n<</Type/Page/Parent 2 0 R/Resources<</Font<</F1 4 0 R/F2 5 0 R>> >>/MediaBox[ 0 0 595.32 841.92] /Contents 6 0 R>>\nendobj\n');
    ekle('6 0 obj\n<</Filter/FlateDecode/Length ' + icerikZ.length + '>>\nstream\r\n'); ekle(icerikZ); ekle('\r\nendstream\nendobj\n');
    ekle('8 0 obj\n<</Filter/FlateDecode/Length ' + cmapZ.length + '>>\nstream\r\n'); ekle(cmapZ); ekle('\r\nendstream\nendobj\n');
    ekle('9 0 obj\n<</Type/ObjStm/N 3/First ' + bas.length + '/Filter/FlateDecode/Length ' + objStm.length + '>>\nstream\r\n'); ekle(objStm); ekle('\r\nendstream\nendobj\n');
    ekle('trailer\n<</Size 10/Root 1 0 R>>\n%%EOF\n');
    let n = 0;
    parcalar.forEach(function (x) { n += x.length; });
    const o = new Uint8Array(n);
    let i = 0;
    parcalar.forEach(function (x) { o.set(x, i); i += x.length; });
    return o;
  }

  /* Uydurma bilirkişi raporu */
  function raporSatirlari() {
    return [
      [{ a: 'T.C. ' }, { t: 'İSTAN' }, { k: -20 }, { t: 'BUL 4. TÜKETİCİ MAHKEMESİ' }],
      [{ t: 'BİLİRKİŞİ RAPORU' }],
      [{ t: 'DOSYA' }, { k: -600 }, { t: 'NO : 2026/900 Esas' }],
      [{ a: 'DAVACI : Ornek Otoyol A.S. (deneme) \\ son' }],
      [{ t: 'DAVALI : AYŞE ÖRNEK' }],
      [{ a: 'T.C.: 12345678901' }],
      [{ t: 'Sayın Mahkemenizde görülen davanın 03.03.2026 tarihli tensip tutanağının 5 numaralı ara kararı ile' }],
      [{ t: 'II- İNCELEME VE DEĞERLENDİRME' }],
      [{ t: 'Davalıya ait 06ABC123 plaka sayılı araç 01.06.2024 ile 30.06.2024 tarihleri arasında geçiş yapmıştır.' }],
      [{ t: 'Davalı Ankara 2. İcra Dairesi 2025/4444 esas sayılı dosyası ile başlatılan 2.500,00 TL takibe itiraz etmiştir.' }],
      [{ t: 'V- SONUÇ VE KANAAT' }],
      [{ t: 'Faiz hesaplaması yasal faiz oranlarına göre yapılmıştır.' }],
      [{ t: 'Genel Toplam: 2.100,50 TL olarak hesap edildiği,' }],
      [{ t: 'Saygıyla arz ederim. 10.04.2026' }],
      [{ t: 'Bilirkişi' }]
    ];
  }

  kok.Ornekler = { udfXml: udfXml, sablon: sablon, pdf: pdf, raporSatirlari: raporSatirlari };
})(typeof window !== 'undefined' ? window : this);
