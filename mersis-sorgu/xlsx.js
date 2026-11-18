/*
 * MERSİS Şirket Sorgulama: Excel (.xlsx) okuyucu ve düzenleyici
 *
 * Yüklenen çalışma kitabını tarayıcıda açar, sayfaları satır satır okur.
 * Yazarken dosyanın geri kalanına dokunmaz: yalnız istenen hücreleri
 * değiştirir ve yeni bir sayfa ekler; biçimler, öteki sayfalar ve formüller
 * olduğu gibi kalır. Dış kütüphane kullanmaz; dosya hiçbir sunucuya gitmez.
 */
(function (kok) {
  'use strict';

  const ANA_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const P_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const CT_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';
  const XML_NS = 'http://www.w3.org/XML/1998/namespace';
  const ILISKI = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
  const SAYFA_ICERIK = 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml';
  const XML_BASI = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';
  const kodla = new TextEncoder();
  const coz = new TextDecoder('utf-8');

  /* ---------------- ZIP ---------------- */

  async function zipAc(b) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let son = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { son = i; break; }
    }
    if (son < 0) throw new Error('Dosya bir Excel (.xlsx) dosyası değil ya da bozuk.');
    const adet = dv.getUint16(son + 10, true);
    let p = dv.getUint32(son + 16, true);
    if (p === 0xFFFFFFFF) throw new Error('Dosya çok büyük (ZIP64); desteklenmiyor.');
    const girisler = [];
    for (let k = 0; k < adet; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Excel dosyasının içi okunamadı (zip dizini bozuk).');
      const bayrak = dv.getUint16(p + 8, true), yontem = dv.getUint16(p + 10, true);
      const sikiBoy = dv.getUint32(p + 20, true);
      const adBoy = dv.getUint16(p + 28, true), ekBoy = dv.getUint16(p + 30, true), notBoy = dv.getUint16(p + 32, true);
      const yerel = dv.getUint32(p + 42, true);
      const adBayt = b.subarray(p + 46, p + 46 + adBoy);
      const ad = (bayrak & 0x0800) ? coz.decode(adBayt) : String.fromCharCode.apply(null, adBayt);
      const veriBas = yerel + 30 + dv.getUint16(yerel + 26, true) + dv.getUint16(yerel + 28, true);
      girisler.push({ ad: ad, yontem: yontem, ham: b.subarray(veriBas, veriBas + sikiBoy) });
      p += 46 + adBoy + ekBoy + notBoy;
    }
    for (const g of girisler) {
      if (g.ad.endsWith('/')) { g.veri = new Uint8Array(0); continue; }
      if (g.yontem === 0) g.veri = g.ham;
      else if (g.yontem === 8) g.veri = await ac(g.ham);
      else throw new Error('Excel dosyasında desteklenmeyen sıkıştırma yöntemi: ' + g.yontem);
      delete g.ham;
    }
    return girisler;
  }

  async function ac(veri) {
    if (typeof DecompressionStream === 'undefined') throw new Error('Bu tarayıcı Excel dosyasını açamıyor. Chrome ya da Edge\'in güncel sürümünü kullanın.');
    const akis = new Blob([veri]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(akis).arrayBuffer());
  }

  async function sikistir(veri) {
    const akis = new Blob([veri]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(akis).arrayBuffer());
  }

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

  /* girisler: [{ad, veri}] */
  async function zipYaz(girisler) {
    const simdi = new Date();
    const saat = (simdi.getHours() << 11) | (simdi.getMinutes() << 5) | (simdi.getSeconds() >> 1);
    const gun = ((Math.max(simdi.getFullYear(), 1980) - 1980) << 9) | ((simdi.getMonth() + 1) << 5) | simdi.getDate();
    const sikistirabilir = typeof CompressionStream !== 'undefined';
    const parcalar = [], merkez = [];
    let ofset = 0;
    for (const g of girisler) {
      const ad = kodla.encode(g.ad), veri = g.veri, crc = crc32(veri);
      let govde = veri, yontem = 0;
      if (sikistirabilir && veri.length > 64) {
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

  /* ---------------- XML yardımcıları ---------------- */

  function xmlCoz(m, ad) {
    const d = new DOMParser().parseFromString(m.replace(/^﻿/, ''), 'application/xml');
    if (d.getElementsByTagName('parsererror').length) throw new Error('Excel dosyasındaki ' + (ad || 'XML') + ' okunamadı.');
    return d;
  }
  function xmlYaz(doc) {
    return XML_BASI + new XMLSerializer().serializeToString(doc).replace(/^<\?xml[^>]*\?>\s*/, '');
  }
  function etiketler(kap, ad) { return Array.from(kap.getElementsByTagNameNS('*', ad)); }
  function cocuklar(el, ad) { return Array.from(el.children).filter(function (c) { return c.localName === ad; }); }
  function ilkCocuk(el, ad) { return cocuklar(el, ad)[0] || null; }
  function kacis(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function temizMetin(s) { return String(s == null ? '' : s).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F￾￿]/g, '').slice(0, 32767); }

  function dizin(yol) { const i = yol.lastIndexOf('/'); return i < 0 ? '' : yol.slice(0, i + 1); }
  function yolCoz(taban, hedef) {
    if (hedef.charAt(0) === '/') return hedef.slice(1);
    const parca = (taban + hedef).split('/'), cikti = [];
    parca.forEach(function (p) { if (p === '..') cikti.pop(); else if (p !== '.' && p !== '') cikti.push(p); });
    return cikti.join('/');
  }

  /* "AB12" → 28 (1'den sayılır) */
  function sutunNo(ref) {
    let n = 0;
    for (let i = 0; i < ref.length; i++) {
      const k = ref.charCodeAt(i);
      if (k >= 65 && k <= 90) n = n * 26 + (k - 64);
      else if (k >= 97 && k <= 122) n = n * 26 + (k - 96);
      else break;
    }
    return n;
  }
  /* 28 → "AB" */
  function sutunAdi(n) {
    let s = '';
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }

  /* ---------------- Okuma ---------------- */

  /* Çalışma kitabını açar. Dönen nesne hem okumak hem yazmak için kullanılır. */
  async function kitapAc(tampon) {
    const b = tampon instanceof Uint8Array ? tampon : new Uint8Array(tampon);
    if (b.length >= 4 && b[0] === 0xD0 && b[1] === 0xCF && b[2] === 0x11 && b[3] === 0xE0) {
      throw new Error('Dosya eski Excel 97-2003 (.xls) biçiminde. Excel\'de açıp "Farklı Kaydet > Excel Çalışma Kitabı (.xlsx)" ile kaydedin ve yeniden yükleyin.');
    }
    if (!(b.length >= 4 && b[0] === 0x50 && b[1] === 0x4B)) throw new Error('Dosya bir Excel (.xlsx) dosyası değil.');
    const girisler = await zipAc(b);
    const harita = new Map(girisler.map(function (g) { return [g.ad, g]; }));
    const metinAl = function (ad) { const g = harita.get(ad); return g ? coz.decode(g.veri) : null; };

    let kitapYolu = 'xl/workbook.xml';
    const kokIliski = metinAl('_rels/.rels');
    if (kokIliski) etiketler(xmlCoz(kokIliski, 'ilişki dosyası'), 'Relationship').forEach(function (r) {
      if (/\/officeDocument$/.test(r.getAttribute('Type') || '')) kitapYolu = yolCoz('', r.getAttribute('Target'));
    });
    const kitapMetni = metinAl(kitapYolu);
    if (!kitapMetni) throw new Error('Dosya bir Excel çalışma kitabı değil (workbook.xml yok).');
    const iliskiYolu = dizin(kitapYolu) + '_rels/' + kitapYolu.slice(dizin(kitapYolu).length) + '.rels';
    const iliskiler = {};
    const iliskiMetni = metinAl(iliskiYolu);
    if (iliskiMetni) etiketler(xmlCoz(iliskiMetni, 'ilişki dosyası'), 'Relationship').forEach(function (r) {
      iliskiler[r.getAttribute('Id')] = { tur: r.getAttribute('Type') || '', yol: yolCoz(dizin(kitapYolu), r.getAttribute('Target') || '') };
    });
    const kitapDoc = xmlCoz(kitapMetni, 'workbook.xml');
    const sayfalar = etiketler(kitapDoc, 'sheet').map(function (s) {
      const rid = s.getAttributeNS(R_NS, 'id') || s.getAttribute('r:id');
      const il = iliskiler[rid] || {};
      return { ad: s.getAttribute('name'), yol: il.yol, gizli: !!s.getAttribute('state') && s.getAttribute('state') !== 'visible' };
    }).filter(function (s) { return s.yol && harita.has(s.yol); });

    const turYolu = function (son) {
      for (const k in iliskiler) if (iliskiler[k].tur.endsWith(son)) return iliskiler[k].yol;
      return null;
    };
    const paylasimli = [];
    const psMetni = metinAl(turYolu('/sharedStrings') || '');
    if (psMetni) cocuklar(xmlCoz(psMetni, 'sharedStrings.xml').documentElement, 'si').forEach(function (si) { paylasimli.push(siMetni(si)); });

    return {
      girisler: girisler, harita: harita, kitapYolu: kitapYolu, iliskiYolu: iliskiYolu,
      stilYolu: turYolu('/styles'), sayfalar: sayfalar, paylasimli: paylasimli
    };
  }

  function siMetni(si) {
    let s = '';
    etiketler(si, 't').forEach(function (t) {
      let ust = t.parentNode, fonetik = false;
      while (ust && ust !== si) { if (ust.localName === 'rPh') fonetik = true; ust = ust.parentNode; }
      if (!fonetik) s += t.textContent;
    });
    return s;
  }

  /* Sayfayı satır dizisine çevirir: satirlar[satırNo-1][sütunNo-1] = metin */
  function sayfaOku(kitap, sayfaAdi) {
    const s = kitap.sayfalar.find(function (x) { return x.ad === sayfaAdi; });
    if (!s) throw new Error('"' + sayfaAdi + '" sayfası bulunamadı.');
    const doc = xmlCoz(coz.decode(kitap.harita.get(s.yol).veri), sayfaAdi + ' sayfası');
    const satirlar = [];
    let sonSatir = 0;
    etiketler(doc, 'row').forEach(function (row) {
      const rAt = parseInt(row.getAttribute('r'), 10);
      const rNo = rAt > 0 ? rAt : sonSatir + 1;
      sonSatir = rNo;
      const dizi = [];
      let sonSutun = 0;
      cocuklar(row, 'c').forEach(function (c) {
        const ref = c.getAttribute('r');
        const cNo = ref ? sutunNo(ref) : sonSutun + 1;
        sonSutun = cNo;
        dizi[cNo - 1] = hucreMetni(c, kitap.paylasimli);
      });
      for (let i = 0; i < dizi.length; i++) if (dizi[i] === undefined) dizi[i] = '';
      satirlar[rNo - 1] = dizi;
    });
    for (let i = 0; i < satirlar.length; i++) if (!satirlar[i]) satirlar[i] = [];
    return satirlar;
  }

  function hucreMetni(c, paylasimli) {
    const t = c.getAttribute('t');
    if (t === 'inlineStr') { const is = ilkCocuk(c, 'is'); return is ? siMetni(is) : ''; }
    const v = ilkCocuk(c, 'v');
    const ham = v ? v.textContent : '';
    if (t === 's') return paylasimli[parseInt(ham, 10)] || '';
    if (t === 'b') return ham === '1' ? 'DOĞRU' : 'YANLIŞ';
    if (t === 'str' || t === 'e') return ham;
    if (ham === '') return '';
    /* Sayı: 1234567808 gibi uzun tamsayılar bilimsel gösterime dönmesin */
    const n = Number(ham);
    if (Number.isFinite(n) && Number.isInteger(n) && Math.abs(n) < 1e16) return n.toFixed(0);
    return ham;
  }

  /* ---------------- Yazma ---------------- */

  /*
   * Çalışma kitabını düzenleyip yeni .xlsx baytlarını döndürür.
   * islem = {
   *   sayfa: 'Sayfa1',
   *   hucreler: [{ satir: 370, sutun: 5, deger: 'Aktif', dolgu: 'FFFCE4D6' | null, stilKaynagi: {satir, sutun} }],
   *   yeniSayfa: { ad, satirlar: [[...]], dolgular: [argb|null per satır], genislikler: [..] }
   * }
   */
  async function kitapYaz(kitap, islem) {
    const degisen = new Map();
    const metinAl = function (ad) { return degisen.has(ad) ? degisen.get(ad) : coz.decode(kitap.harita.get(ad).veri); };
    const stil = stilDuzenleyici(kitap.stilYolu ? xmlCoz(metinAl(kitap.stilYolu), 'styles.xml') : null);
    let formulSilindi = false;

    if (islem.sayfa && islem.hucreler && islem.hucreler.length) {
      const s = kitap.sayfalar.find(function (x) { return x.ad === islem.sayfa; });
      if (!s) throw new Error('"' + islem.sayfa + '" sayfası bulunamadı.');
      const doc = xmlCoz(metinAl(s.yol), islem.sayfa + ' sayfası');
      const veri = etiketler(doc, 'sheetData')[0];
      if (!veri) throw new Error('"' + islem.sayfa + '" sayfasının içeriği okunamadı.');
      islem.hucreler.forEach(function (h) {
        let taban = null;
        if (h.stilKaynagi) { const k = hucreBul(doc, veri, h.stilKaynagi.satir, h.stilKaynagi.sutun, false); if (k && k.getAttribute('s')) taban = parseInt(k.getAttribute('s'), 10); }
        const c = hucreBul(doc, veri, h.satir, h.sutun, true);
        if (taban === null && c.getAttribute('s')) taban = parseInt(c.getAttribute('s'), 10);
        let stilNo = taban;
        if (h.dolgu && stil) stilNo = stil.turet(taban || 0, { dolgu: h.dolgu });
        if (hucreyeYaz(doc, c, h.deger, stilNo)) formulSilindi = true;
      });
      degisen.set(s.yol, xmlYaz(doc));
    }

    if (islem.yeniSayfa) {
      const ys = islem.yeniSayfa;
      const ad = benzersizSayfaAdi(kitap.sayfalar.map(function (x) { return x.ad; }), ys.ad);
      const no = (function () { let n = 1; while (kitap.harita.has('xl/worksheets/sheet' + n + '.xml') || degisen.has('xl/worksheets/sheet' + n + '.xml')) n++; return n; })();
      const yol = 'xl/worksheets/sheet' + no + '.xml';
      const baslikStili = stil ? stil.turet(0, { dolgu: 'FFDCE6F1', kalin: true, kaydir: true }) : 0;
      const dolguStili = {};
      const satirStili = function (argb) {
        if (!argb || !stil) return stil ? stil.turet(0, { kaydir: true }) : 0;
        if (!(argb in dolguStili)) dolguStili[argb] = stil.turet(0, { dolgu: argb, kaydir: true });
        return dolguStili[argb];
      };
      degisen.set(yol, yeniSayfaXml(ys, baslikStili, satirStili));

      /* workbook.xml: sayfayı listeye ekle */
      const kitapDoc = xmlCoz(metinAl(kitap.kitapYolu), 'workbook.xml');
      const sheetsEl = etiketler(kitapDoc, 'sheets')[0];
      let enBuyukId = 0;
      cocuklar(sheetsEl, 'sheet').forEach(function (x) { enBuyukId = Math.max(enBuyukId, parseInt(x.getAttribute('sheetId'), 10) || 0); });
      const iliskiDoc = xmlCoz(metinAl(kitap.iliskiYolu), 'workbook ilişkileri');
      const kokIl = iliskiDoc.documentElement;
      const mevcutIdler = new Set(cocuklar(kokIl, 'Relationship').map(function (r) { return r.getAttribute('Id'); }));
      let rid = 'rIdMersis1', k = 1;
      while (mevcutIdler.has(rid)) rid = 'rIdMersis' + (++k);
      const yeniSheet = kitapDoc.createElementNS(sheetsEl.namespaceURI || ANA_NS, 'sheet');
      yeniSheet.setAttribute('name', ad);
      yeniSheet.setAttribute('sheetId', String(enBuyukId + 1));
      yeniSheet.setAttributeNS(R_NS, 'r:id', rid);
      sheetsEl.appendChild(yeniSheet);
      degisen.set(kitap.kitapYolu, xmlYaz(kitapDoc));

      const il = iliskiDoc.createElementNS(kokIl.namespaceURI || P_NS, 'Relationship');
      il.setAttribute('Id', rid);
      il.setAttribute('Type', ILISKI + 'worksheet');
      il.setAttribute('Target', yolGoreli(dizin(kitap.kitapYolu), yol));
      kokIl.appendChild(il);
      degisen.set(kitap.iliskiYolu, xmlYaz(iliskiDoc));

      const ctDoc = xmlCoz(metinAl('[Content_Types].xml'), '[Content_Types].xml');
      const ov = ctDoc.createElementNS(ctDoc.documentElement.namespaceURI || CT_NS, 'Override');
      ov.setAttribute('PartName', '/' + yol);
      ov.setAttribute('ContentType', SAYFA_ICERIK);
      ctDoc.documentElement.appendChild(ov);
      degisen.set('[Content_Types].xml', xmlYaz(ctDoc));
    }

    if (stil && stil.degisti()) degisen.set(kitap.stilYolu, xmlYaz(stil.doc));
    const silinecek = new Set();
    if (formulSilindi) calcChainKaldir(kitap, degisen, metinAl, silinecek);

    const cikti = [];
    kitap.girisler.forEach(function (g) {
      if (silinecek.has(g.ad)) return;
      cikti.push({ ad: g.ad, veri: degisen.has(g.ad) ? kodla.encode(degisen.get(g.ad)) : g.veri });
      degisen.delete(g.ad);
    });
    degisen.forEach(function (m, ad) { cikti.push({ ad: ad, veri: kodla.encode(m) }); });
    return zipYaz(cikti);
  }

  function yolGoreli(taban, yol) { return yol.indexOf(taban) === 0 ? yol.slice(taban.length) : '/' + yol; }

  function benzersizSayfaAdi(mevcut, istenen) {
    const kucuk = new Set(mevcut.map(function (x) { return x.toLocaleLowerCase('tr-TR'); }));
    let ad = istenen.replace(/[\\\/\?\*\[\]:]/g, ' ').slice(0, 31), n = 2;
    while (kucuk.has(ad.toLocaleLowerCase('tr-TR'))) { const ek = ' (' + n++ + ')'; ad = istenen.slice(0, 31 - ek.length) + ek; }
    return ad;
  }

  /* Formül hücresi değiştiyse hesap zinciri (calcChain) eskir; Excel onarım istemesin diye kaldırılır */
  function calcChainKaldir(kitap, degisen, metinAl, silinecek) {
    const yol = 'xl/calcChain.xml';
    if (!kitap.harita.has(yol)) return;
    silinecek.add(yol);
    const iliskiDoc = xmlCoz(metinAl(kitap.iliskiYolu), 'workbook ilişkileri');
    cocuklar(iliskiDoc.documentElement, 'Relationship').forEach(function (r) { if (/\/calcChain$/.test(r.getAttribute('Type') || '')) r.parentNode.removeChild(r); });
    degisen.set(kitap.iliskiYolu, xmlYaz(iliskiDoc));
    const ctDoc = xmlCoz(metinAl('[Content_Types].xml'), '[Content_Types].xml');
    cocuklar(ctDoc.documentElement, 'Override').forEach(function (o) { if (o.getAttribute('PartName') === '/' + yol) o.parentNode.removeChild(o); });
    degisen.set('[Content_Types].xml', xmlYaz(ctDoc));
  }

  /* Satırı ve hücreyi bulur; olusturma=true ise yoksa sıralı yere ekler */
  function hucreBul(doc, veri, satirNo, sutun, olustur) {
    let satir = null, sonraki = null, onceki = 0;
    for (const row of cocuklar(veri, 'row')) {
      const r = parseInt(row.getAttribute('r'), 10) || onceki + 1;
      onceki = r;
      if (r === satirNo) { satir = row; break; }
      if (r > satirNo) { sonraki = row; break; }
    }
    if (!satir) {
      if (!olustur) return null;
      satir = doc.createElementNS(veri.namespaceURI || ANA_NS, 'row');
      satir.setAttribute('r', String(satirNo));
      veri.insertBefore(satir, sonraki);
    }
    const hucreler = cocuklar(satir, 'c');
    let sira = 0;
    hucreler.forEach(function (c) {
      const ref = c.getAttribute('r');
      sira = ref ? sutunNo(ref) : sira + 1;
      if (!ref) c.setAttribute('r', sutunAdi(sira) + satirNo);
    });
    let sonrakiHucre = null;
    for (const c of hucreler) {
      const n = sutunNo(c.getAttribute('r'));
      if (n === sutun) return c;
      if (n > sutun) { sonrakiHucre = c; break; }
    }
    if (!olustur) return null;
    const c = doc.createElementNS(satir.namespaceURI || ANA_NS, 'c');
    c.setAttribute('r', sutunAdi(sutun) + satirNo);
    satir.insertBefore(c, sonrakiHucre);
    satir.removeAttribute('spans');
    return c;
  }

  /* Hücreye metin yazar. Formül silindiyse true döner. */
  function hucreyeYaz(doc, c, deger, stilNo) {
    const formul = ilkCocuk(c, 'f');
    if (formul && formul.getAttribute('t') === 'shared' && formul.getAttribute('ref')) {
      throw new Error(c.getAttribute('r') + ' hücresinde başka hücrelerin de kullandığı bir formül var; SONUÇ için başka bir sütun seçin.');
    }
    while (c.firstChild) c.removeChild(c.firstChild);
    ['t', 'cm', 'vm', 'ph'].forEach(function (a) { c.removeAttribute(a); });
    if (stilNo != null && !isNaN(stilNo)) c.setAttribute('s', String(stilNo));
    const m = temizMetin(deger);
    if (m !== '') {
      c.setAttribute('t', 'inlineStr');
      const ns = c.namespaceURI || ANA_NS;
      const is = doc.createElementNS(ns, 'is'), t = doc.createElementNS(ns, 't');
      t.setAttributeNS(XML_NS, 'xml:space', 'preserve');
      t.textContent = m;
      is.appendChild(t);
      c.appendChild(is);
    }
    return !!formul;
  }

  /* styles.xml'e dolgu, kalın yazı ve satır kaydırma ekleyip yeni hücre biçimi numarası verir */
  function stilDuzenleyici(doc) {
    if (!doc) return null;
    const kok = doc.documentElement, ns = kok.namespaceURI || ANA_NS;
    const bolum = function (ad) {
      let el = ilkCocuk(kok, ad);
      if (!el) {
        el = doc.createElementNS(ns, ad);
        const sira = ['numFmts', 'fonts', 'fills', 'borders', 'cellStyleXfs', 'cellXfs', 'cellStyles', 'dxfs', 'tableStyles', 'colors', 'extLst'];
        const benim = sira.indexOf(ad);
        let once = null;
        for (const c of Array.from(kok.children)) { if (sira.indexOf(c.localName) > benim) { once = c; break; } }
        kok.insertBefore(el, once);
      }
      return el;
    };
    const say = function (el, cocuk) { el.setAttribute('count', String(cocuklar(el, cocuk).length)); };
    const fonts = bolum('fonts'), fills = bolum('fills'), xfs = bolum('cellXfs');
    if (!cocuklar(fonts, 'font').length) { fonts.appendChild(xmlParca(doc, ns, '<font><sz val="11"/><name val="Calibri"/></font>')); say(fonts, 'font'); }
    if (cocuklar(fills, 'fill').length < 2) {
      while (cocuklar(fills, 'fill').length < 2) fills.appendChild(xmlParca(doc, ns, cocuklar(fills, 'fill').length ? '<fill><patternFill patternType="gray125"/></fill>' : '<fill><patternFill patternType="none"/></fill>'));
      say(fills, 'fill');
    }
    if (!cocuklar(xfs, 'xf').length) { xfs.appendChild(xmlParca(doc, ns, '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>')); say(xfs, 'xf'); }
    const dolguNo = {}, kalinNo = {}, onbellek = {};
    let degisti = false;

    function dolgu(argb) {
      if (argb in dolguNo) return dolguNo[argb];
      fills.appendChild(xmlParca(doc, ns, '<fill><patternFill patternType="solid"><fgColor rgb="' + argb + '"/><bgColor indexed="64"/></patternFill></fill>'));
      say(fills, 'fill');
      degisti = true;
      return (dolguNo[argb] = cocuklar(fills, 'fill').length - 1);
    }
    function kalin(fontId) {
      if (fontId in kalinNo) return kalinNo[fontId];
      const f = (cocuklar(fonts, 'font')[fontId] || cocuklar(fonts, 'font')[0]).cloneNode(true);
      if (!ilkCocuk(f, 'b')) f.insertBefore(doc.createElementNS(ns, 'b'), f.firstChild);
      fonts.appendChild(f);
      say(fonts, 'font');
      degisti = true;
      return (kalinNo[fontId] = cocuklar(fonts, 'font').length - 1);
    }
    function turet(taban, ist) {
      const anahtar = taban + '|' + (ist.dolgu || '') + '|' + (ist.kalin ? 1 : 0) + '|' + (ist.kaydir ? 1 : 0);
      if (anahtar in onbellek) return onbellek[anahtar];
      const liste = cocuklar(xfs, 'xf');
      const xf = (liste[taban] || liste[0]).cloneNode(true);
      if (ist.dolgu) { xf.setAttribute('fillId', String(dolgu(ist.dolgu))); xf.setAttribute('applyFill', '1'); }
      if (ist.kalin) { xf.setAttribute('fontId', String(kalin(parseInt(xf.getAttribute('fontId'), 10) || 0))); xf.setAttribute('applyFont', '1'); }
      if (ist.kaydir) {
        let hiza = ilkCocuk(xf, 'alignment');
        if (!hiza) { hiza = doc.createElementNS(ns, 'alignment'); xf.insertBefore(hiza, xf.firstChild); }
        hiza.setAttribute('wrapText', '1');
        hiza.setAttribute('vertical', 'top');
        xf.setAttribute('applyAlignment', '1');
      }
      xfs.appendChild(xf);
      say(xfs, 'xf');
      degisti = true;
      return (onbellek[anahtar] = cocuklar(xfs, 'xf').length - 1);
    }
    return { doc: doc, turet: turet, degisti: function () { return degisti; } };
  }

  function xmlParca(doc, ns, m) {
    const p = new DOMParser().parseFromString('<k xmlns="' + ns + '">' + m + '</k>', 'application/xml');
    return doc.importNode(p.documentElement.firstElementChild, true);
  }

  function yeniSayfaXml(ys, baslikStili, satirStili) {
    const satirlar = ys.satirlar || [];
    const sutunSayisi = satirlar.reduce(function (m, s) { return Math.max(m, s.length); }, 1);
    let x = XML_BASI + '<worksheet xmlns="' + ANA_NS + '" xmlns:r="' + R_NS + '">';
    x += '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
      '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>';
    x += '<sheetFormatPr defaultRowHeight="15"/>';
    const gen = ys.genislikler || [];
    if (gen.length) {
      x += '<cols>';
      gen.forEach(function (g, i) { if (g) x += '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + g + '" customWidth="1"/>'; });
      x += '</cols>';
    }
    x += '<sheetData>';
    satirlar.forEach(function (s, i) {
      const r = i + 1;
      const st = i === 0 ? baslikStili : satirStili((ys.dolgular || [])[i]);
      x += '<row r="' + r + '">';
      for (let c = 0; c < sutunSayisi; c++) {
        const ref = sutunAdi(c + 1) + r;
        const m = temizMetin(s[c]);
        x += m === '' ? '<c r="' + ref + '" s="' + st + '"/>' :
          '<c r="' + ref + '" s="' + st + '" t="inlineStr"><is><t xml:space="preserve">' + kacis(m) + '</t></is></c>';
      }
      x += '</row>';
    });
    x += '</sheetData>';
    if (satirlar.length > 1) x += '<autoFilter ref="A1:' + sutunAdi(sutunSayisi) + satirlar.length + '"/>';
    x += '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>';
    x += '</worksheet>';
    return x;
  }

  kok.XlsxDuzen = {
    kitapAc: kitapAc, sayfaOku: sayfaOku, kitapYaz: kitapYaz,
    sutunAdi: sutunAdi, sutunNo: sutunNo, zipAc: zipAc, zipYaz: zipYaz
  };
})(typeof window !== 'undefined' ? window : this);
