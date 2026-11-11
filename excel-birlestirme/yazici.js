/*
 * Excel Birleştirme: Excel yazıcı
 *
 * Biçimli .xlsx üretir: kalın ve dondurulmuş başlık satırı, filtre, sütun
 * genişlikleri, metin biçimli sütunlar (dosya no ve kimlik no bozulmasın diye).
 * Dış kütüphane kullanmaz.
 *
 * Girdi: [{ ad, satirlar: [[...], ...], baslikSatirlari: [0], genislikler: [..], dondur, filtre }]
 */
(function (kok) {
  'use strict';

  const ANA_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const P_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const ILISKI = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
  const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const XML_BASI = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const STIL = { NORMAL: 0, BASLIK: 1, METIN: 2, TARIH: 3 };

  const STILLER = XML_BASI +
    '<styleSheet xmlns="' + ANA_NS + '">' +
    '<fonts count="2">' +
    '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
    '</fonts>' +
    '<fills count="3">' +
    '<fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE3EBF5"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="2">' +
    '<border><left/><right/><top/><bottom/><diagonal/></border>' +
    '<border><left/><right/><top/><bottom style="thin"><color rgb="FF8EA3BC"/></bottom><diagonal/></border>' +
    '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="4">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="49" fontId="1" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf>' +
    '<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  async function olustur(sayfalar, secenek) {
    return new Blob([await bayt(sayfalar, secenek)], { type: MIME });
  }

  async function bayt(sayfalar, secenek) {
    secenek = secenek || {};
    if (!sayfalar || !sayfalar.length) sayfalar = [{ ad: 'Sayfa1', satirlar: [] }];
    const ps = secenek.paylasimliMetin ? { liste: [], harita: new Map(), toplam: 0 } : null;
    const adlar = benzersizAdlar(sayfalar.map(function (s) { return s.ad; }));
    const xmller = sayfalar.map(function (s, i) { return sayfaXml(s, i === 0, ps); });
    const dosyalar = [
      ['[Content_Types].xml', icerikTurleri(sayfalar.length, !!ps)],
      ['_rels/.rels', XML_BASI + '<Relationships xmlns="' + P_NS + '"><Relationship Id="rId1" Type="' + ILISKI + 'officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ['xl/workbook.xml', calismaKitabi(adlar, xmller)],
      ['xl/_rels/workbook.xml.rels', kitapIliskileri(sayfalar.length, !!ps)],
      ['xl/styles.xml', STILLER]
    ];
    xmller.forEach(function (x, i) { dosyalar.push(['xl/worksheets/sheet' + (i + 1) + '.xml', x.xml]); });
    if (ps) dosyalar.push(['xl/sharedStrings.xml', paylasimliXml(ps)]);
    const kodla = new TextEncoder();
    return zipYaz(dosyalar.map(function (d) { return [d[0], kodla.encode(d[1])]; }), secenek.sikistirma !== false);
  }

  function sayfaXml(s, ilk, ps) {
    const satirlar = s.satirlar || [];
    const baslikSatirlari = new Set(s.baslikSatirlari || []);
    let genislik = 0;
    satirlar.forEach(function (r) { if (r && r.length > genislik) genislik = r.length; });
    const harfler = [];
    for (let j = 0; j < genislik; j++) harfler.push(kolonHarfi(j));
    const p = [];
    p.push(XML_BASI + '<worksheet xmlns="' + ANA_NS + '" xmlns:r="' + R_NS + '">');
    p.push('<dimension ref="A1' + (genislik && satirlar.length ? ':' + harfler[genislik - 1] + satirlar.length : '') + '"/>');
    const dondur = s.dondur && satirlar.length > 1;
    p.push('<sheetViews><sheetView workbookViewId="0"' + (ilk ? ' tabSelected="1"' : '') + '>' +
      (dondur ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/>' : '') +
      '</sheetView></sheetViews>');
    p.push('<sheetFormatPr defaultRowHeight="15"/>');
    if (s.genislikler && s.genislikler.length) {
      p.push('<cols>');
      s.genislikler.forEach(function (g, j) {
        p.push('<col min="' + (j + 1) + '" max="' + (j + 1) + '" width="' + (Number(g) || 12) + '" style="' + STIL.METIN + '" customWidth="1"/>');
      });
      p.push('</cols>');
    }
    p.push('<sheetData>');
    satirlar.forEach(function (r, i) {
      if (!r || !r.length) return;
      const baslik = baslikSatirlari.has(i);
      const hucreler = [];
      for (let j = 0; j < r.length; j++) {
        const h = hucre(r[j], harfler[j] + (i + 1), baslik, ps);
        if (h) hucreler.push(h);
      }
      if (!hucreler.length) return;
      p.push('<row r="' + (i + 1) + '"' + (baslik ? ' ht="32" customHeight="1"' : '') + '>' + hucreler.join('') + '</row>');
    });
    p.push('</sheetData>');
    const filtre = s.filtre && genislik > 0 && satirlar.length > 0 ? 'A1:' + harfler[genislik - 1] + satirlar.length : '';
    if (filtre) p.push('<autoFilter ref="' + filtre + '"/>');
    p.push('<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>');
    p.push('</worksheet>');
    return { xml: p.join(''), filtre: filtre };
  }

  function hucre(v, ref, baslik, ps) {
    if (v === null || v === undefined || v === '') return '';
    if (v instanceof Date) {
      if (isNaN(v.getTime())) return '';
      return '<c r="' + ref + '" s="' + (baslik ? STIL.BASLIK : STIL.TARIH) + '"><v>' + (v.getTime() / 86400000 + 25569) + '</v></c>';
    }
    if (typeof v === 'number') {
      return isFinite(v) ? '<c r="' + ref + '"' + (baslik ? ' s="' + STIL.BASLIK + '"' : ' s="' + STIL.NORMAL + '"') + '><v>' + v + '</v></c>' : '';
    }
    if (typeof v === 'boolean') {
      return '<c r="' + ref + '" s="' + (baslik ? STIL.BASLIK : STIL.NORMAL) + '" t="b"><v>' + (v ? 1 : 0) + '</v></c>';
    }
    const metin = temizMetin(String(v));
    if (metin === '') return '';
    const stil = baslik ? STIL.BASLIK : STIL.METIN;
    if (ps) {
      let i = ps.harita.get(metin);
      if (i === undefined) { i = ps.liste.length; ps.liste.push(metin); ps.harita.set(metin, i); }
      ps.toplam++;
      return '<c r="' + ref + '" s="' + stil + '" t="s"><v>' + i + '</v></c>';
    }
    return '<c r="' + ref + '" s="' + stil + '" t="inlineStr"><is><t xml:space="preserve">' + kacis(metin) + '</t></is></c>';
  }

  function paylasimliXml(ps) {
    return XML_BASI + '<sst xmlns="' + ANA_NS + '" count="' + ps.toplam + '" uniqueCount="' + ps.liste.length + '">' +
      ps.liste.map(function (m) { return '<si><t xml:space="preserve">' + kacis(m) + '</t></si>'; }).join('') + '</sst>';
  }

  function icerikTurleri(n, ps) {
    let x = XML_BASI + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>';
    for (let i = 1; i <= n; i++) {
      x += '<Override PartName="/xl/worksheets/sheet' + i + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
    }
    if (ps) x += '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>';
    return x + '</Types>';
  }

  function calismaKitabi(adlar, xmller) {
    const tanimlar = [];
    xmller.forEach(function (x, i) {
      if (!x.filtre) return;
      const uc = x.filtre.split(':');
      tanimlar.push('<definedName name="_xlnm._FilterDatabase" localSheetId="' + i + '" hidden="1">' +
        kacis("'" + adlar[i].replace(/'/g, "''") + "'!" + mutlak(uc[0]) + ':' + mutlak(uc[1])) + '</definedName>');
    });
    return XML_BASI + '<workbook xmlns="' + ANA_NS + '" xmlns:r="' + R_NS + '"><workbookPr/>' +
      '<bookViews><workbookView activeTab="0"/></bookViews><sheets>' +
      adlar.map(function (a, i) { return '<sheet name="' + kacis(a) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') +
      '</sheets>' + (tanimlar.length ? '<definedNames>' + tanimlar.join('') + '</definedNames>' : '') + '</workbook>';
  }

  function kitapIliskileri(n, ps) {
    let x = XML_BASI + '<Relationships xmlns="' + P_NS + '">';
    for (let i = 1; i <= n; i++) x += '<Relationship Id="rId' + i + '" Type="' + ILISKI + 'worksheet" Target="worksheets/sheet' + i + '.xml"/>';
    x += '<Relationship Id="rId' + (n + 1) + '" Type="' + ILISKI + 'styles" Target="styles.xml"/>';
    if (ps) x += '<Relationship Id="rId' + (n + 2) + '" Type="' + ILISKI + 'sharedStrings" Target="sharedStrings.xml"/>';
    return x + '</Relationships>';
  }

  function mutlak(ref) {
    const m = /^([A-Z]+)(\d+)$/.exec(ref);
    return m ? '$' + m[1] + '$' + m[2] : ref;
  }

  /* ---------------- Yardımcılar ---------------- */

  function sayfaAdiTemizle(ad) {
    let s = String(ad === null || ad === undefined ? '' : ad).replace(/[\[\]:*?\/\\]/g, ' ').replace(/\s+/g, ' ').trim();
    s = s.replace(/^'+/, '').replace(/'+$/, '');
    s = s.slice(0, 31).trim();
    return s || 'Sayfa';
  }

  function benzersizAdlar(adlar) {
    const gorulen = new Set();
    return adlar.map(function (a) {
      const taban = sayfaAdiTemizle(a);
      let s = taban, n = 2;
      while (gorulen.has(s.toLocaleUpperCase('tr-TR'))) {
        const ek = ' (' + n++ + ')';
        s = taban.slice(0, 31 - ek.length) + ek;
      }
      gorulen.add(s.toLocaleUpperCase('tr-TR'));
      return s;
    });
  }

  function kolonHarfi(j) {
    let s = '';
    let n = j + 1;
    while (n > 0) {
      const m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  function kacis(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function gecersizKarakter(k) {
    return (k < 32 && k !== 9 && k !== 10 && k !== 13) || k === 0xFFFE || k === 0xFFFF;
  }

  function temizMetin(s) {
    let temiz = true;
    for (let i = 0; i < s.length; i++) if (gecersizKarakter(s.charCodeAt(i))) { temiz = false; break; }
    if (!temiz) {
      let o = '';
      for (let i = 0; i < s.length; i++) if (!gecersizKarakter(s.charCodeAt(i))) o += s[i];
      s = o;
    }
    return s.length > 32767 ? s.slice(0, 32767) : s;
  }

  /* ---------------- Zip ---------------- */

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

  async function zipYaz(girisler, sikistirmaIste) {
    const simdi = new Date();
    const dosSaat = (simdi.getHours() << 11) | (simdi.getMinutes() << 5) | (simdi.getSeconds() >> 1);
    const dosTarih = ((Math.max(simdi.getFullYear(), 1980) - 1980) << 9) | ((simdi.getMonth() + 1) << 5) | simdi.getDate();
    const sikistirabilir = sikistirmaIste && typeof CompressionStream !== 'undefined';
    const parcalar = [], merkez = [];
    let ofset = 0;
    for (const giris of girisler) {
      const adB = new TextEncoder().encode(giris[0]);
      const veri = giris[1];
      const crc = crc32(veri);
      let govde = veri, yontem = 0;
      if (sikistirabilir && veri.length > 128) {
        const s = await sikistir(veri);
        if (s.length < veri.length) { govde = s; yontem = 8; }
      }
      const yerel = new Uint8Array(30 + adB.length);
      const yv = new DataView(yerel.buffer);
      yv.setUint32(0, 0x04034b50, true);
      yv.setUint16(4, 20, true);
      yv.setUint16(6, 0x0800, true);
      yv.setUint16(8, yontem, true);
      yv.setUint16(10, dosSaat, true);
      yv.setUint16(12, dosTarih, true);
      yv.setUint32(14, crc, true);
      yv.setUint32(18, govde.length, true);
      yv.setUint32(22, veri.length, true);
      yv.setUint16(26, adB.length, true);
      yv.setUint16(28, 0, true);
      yerel.set(adB, 30);
      parcalar.push(yerel, govde);
      const m = new Uint8Array(46 + adB.length);
      const mv = new DataView(m.buffer);
      mv.setUint32(0, 0x02014b50, true);
      mv.setUint16(4, 20, true);
      mv.setUint16(6, 20, true);
      mv.setUint16(8, 0x0800, true);
      mv.setUint16(10, yontem, true);
      mv.setUint16(12, dosSaat, true);
      mv.setUint16(14, dosTarih, true);
      mv.setUint32(16, crc, true);
      mv.setUint32(20, govde.length, true);
      mv.setUint32(24, veri.length, true);
      mv.setUint16(28, adB.length, true);
      mv.setUint32(42, ofset, true);
      m.set(adB, 46);
      merkez.push(m);
      ofset += yerel.length + govde.length;
    }
    let merkezBoyu = 0;
    merkez.forEach(function (m) { merkezBoyu += m.length; });
    const son = new Uint8Array(22);
    const sv = new DataView(son.buffer);
    sv.setUint32(0, 0x06054b50, true);
    sv.setUint16(8, girisler.length, true);
    sv.setUint16(10, girisler.length, true);
    sv.setUint32(12, merkezBoyu, true);
    sv.setUint32(16, ofset, true);
    const tum = parcalar.concat(merkez, [son]);
    let toplam = 0;
    tum.forEach(function (x) { toplam += x.length; });
    const cikti = new Uint8Array(toplam);
    let p = 0;
    tum.forEach(function (x) { cikti.set(x, p); p += x.length; });
    return cikti;
  }

  kok.ExcelYazici = { olustur: olustur, bayt: bayt, MIME: MIME, sayfaAdiTemizle: sayfaAdiTemizle, kolonHarfi: kolonHarfi };
})(typeof window !== 'undefined' ? window : this);
