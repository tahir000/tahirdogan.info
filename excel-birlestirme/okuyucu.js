/*
 * Excel Birleştirme: Excel okuyucu
 *
 * .xlsx / .xlsm (zip içinde XML), Excel 2003 XML, HTML tablolu .xls ve CSV
 * dosyalarını tarayıcıda okur. Dış kütüphane kullanmaz; dosya içeriği
 * hiçbir sunucuya gönderilmez.
 *
 * Dönen değer: [{ ad: 'Sayfa adı', satirlar: [[hücre, ...], ...] }]
 * Hücreler: metin, sayı, Date (tarih), true/false ya da null.
 */
(function (kok) {
  'use strict';

  const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const SS_NS = 'urn:schemas-microsoft-com:office:spreadsheet';

  async function oku(tampon, dosyaAdi) {
    const b = tampon instanceof Uint8Array ? tampon : new Uint8Array(tampon);
    const ad = dosyaAdi || 'Dosya';
    if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4B && b[2] === 0x03 && b[3] === 0x04) return xlsxOku(b);
    if (b.length >= 4 && b[0] === 0xD0 && b[1] === 0xCF && b[2] === 0x11 && b[3] === 0xE0) {
      throw new Error('"' + ad + '" eski Excel 97-2003 (.xls) biçiminde. Dosyayı Excel\'de açıp "Farklı Kaydet > Excel Çalışma Kitabı (.xlsx)" ile kaydedin ve yeniden yükleyin.');
    }
    const metin = metneCevir(b);
    if (!metin.trim()) return [];
    if (metin.indexOf(SS_NS) !== -1) return xml2003Oku(metin);
    if (/^\s*</.test(metin) && /<table[\s>]/i.test(metin)) return htmlOku(metin);
    return [{ ad: ad.replace(/\.[^.]+$/, '') || 'Sayfa1', satirlar: csvOku(metin) }];
  }

  /* ---------------- Metin dosyaları ---------------- */

  function metneCevir(b) {
    if (b.length >= 2 && b[0] === 0xFF && b[1] === 0xFE) return new TextDecoder('utf-16le').decode(b.subarray(2));
    if (b.length >= 2 && b[0] === 0xFE && b[1] === 0xFF) return new TextDecoder('utf-16be').decode(b.subarray(2));
    let metin;
    try {
      metin = new TextDecoder('utf-8', { fatal: true }).decode(b);
    } catch (e) {
      metin = new TextDecoder('windows-1254').decode(b);
    }
    if (metin.charCodeAt(0) === 0xFEFF) metin = metin.slice(1);
    return metin;
  }

  function csvOku(metin) {
    const ilk = metin.split(/\r\n|\n|\r/).slice(0, 10).join('\n');
    function say(ayrac) {
      let n = 0, tirnak = false;
      for (let i = 0; i < ilk.length; i++) {
        const c = ilk[i];
        if (c === '"') tirnak = !tirnak;
        else if (!tirnak && c === ayrac) n++;
      }
      return n;
    }
    let ayrac = ',', en = -1;
    [';', ',', '\t', '|'].forEach(function (a) { const n = say(a); if (n > en) { en = n; ayrac = a; } });
    const satirlar = [];
    let r = [], f = '', tirnak = false;
    for (let i = 0; i < metin.length; i++) {
      const c = metin[i];
      if (tirnak) {
        if (c === '"') {
          if (metin[i + 1] === '"') { f += '"'; i++; } else tirnak = false;
        } else f += c;
      } else if (c === '"' && f === '') tirnak = true;
      else if (c === ayrac) { r.push(f); f = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && metin[i + 1] === '\n') i++;
        r.push(f); satirlar.push(r); r = []; f = '';
      } else f += c;
    }
    if (f !== '' || r.length) { r.push(f); satirlar.push(r); }
    return satirlar.map(function (x) {
      return x.map(function (v) { const t = v.trim(); return t === '' ? null : t; });
    });
  }

  function htmlOku(metin) {
    const doc = new DOMParser().parseFromString(metin, 'text/html');
    const tablolar = Array.prototype.slice.call(doc.querySelectorAll('table'))
      .filter(function (t) { return !t.querySelector('table'); });
    return tablolar.map(function (t, i) {
      const satirlar = Array.prototype.map.call(t.rows, function (tr) {
        const r = [];
        Array.prototype.forEach.call(tr.cells, function (td) {
          const v = td.textContent.replace(/\s+/g, ' ').trim();
          r.push(v === '' ? null : v);
          const yayilma = Math.min(td.colSpan || 1, 100);
          for (let k = 1; k < yayilma; k++) r.push(null);
        });
        return r;
      });
      return { ad: tablolar.length > 1 ? 'Tablo ' + (i + 1) : 'Sayfa1', satirlar: satirlar };
    }).filter(function (s) { return s.satirlar.length; });
  }

  function xml2003Oku(metin) {
    const doc = xmlCoz(metin);
    return etiketler(doc, 'Worksheet').map(function (ws, i) {
      const satirlar = [];
      etiketler(ws, 'Row').forEach(function (row) {
        const ri = parseInt(row.getAttributeNS(SS_NS, 'Index'), 10);
        if (ri) while (satirlar.length < ri - 1) satirlar.push([]);
        const r = [];
        cocuklar(row, 'Cell').forEach(function (c) {
          const ci = parseInt(c.getAttributeNS(SS_NS, 'Index'), 10);
          if (ci) while (r.length < ci - 1) r.push(null);
          const d = cocuklar(c, 'Data')[0];
          let v = null;
          if (d) {
            const tur = d.getAttributeNS(SS_NS, 'Type');
            const t = d.textContent;
            if (tur === 'Number') v = Number(t);
            else if (tur === 'DateTime') {
              const x = new Date(/(Z|[+-]\d\d:?\d\d)$/.test(t) ? t : t + 'Z');
              v = isNaN(x.getTime()) ? t : x;
            } else if (tur === 'Boolean') v = t === '1';
            else v = t === '' ? null : t;
          }
          r.push(v);
          const birlesik = parseInt(c.getAttributeNS(SS_NS, 'MergeAcross'), 10) || 0;
          for (let k = 0; k < birlesik; k++) r.push(null);
        });
        satirlar.push(r);
      });
      return { ad: ws.getAttributeNS(SS_NS, 'Name') || 'Sayfa' + (i + 1), satirlar: satirlar };
    });
  }

  /* ---------------- .xlsx ---------------- */

  async function xlsxOku(b) {
    const zip = zipAc(b);
    async function dosya(yol) {
      let e = zip.get(yol);
      if (!e) {
        const k = yol.toLowerCase();
        zip.forEach(function (v, ad) { if (!e && ad.toLowerCase() === k) e = v; });
      }
      return e ? new TextDecoder('utf-8').decode(await ac(b, e)) : null;
    }
    let kitapYolu = 'xl/workbook.xml';
    const kokIliski = await dosya('_rels/.rels');
    if (kokIliski) {
      etiketler(xmlCoz(kokIliski), 'Relationship').forEach(function (r) {
        if (/\/officeDocument$/.test(r.getAttribute('Type') || '')) kitapYolu = yolCoz('', r.getAttribute('Target') || '');
      });
    }
    const kitapMetni = await dosya(kitapYolu);
    if (!kitapMetni) throw new Error('Excel dosyasının içi okunamadı (çalışma kitabı bulunamadı).');
    const kitap = xmlCoz(kitapMetni);
    const iliskiYolu = kitapYolu.replace(/[^\/]+$/, function (ad) { return '_rels/' + ad + '.rels'; });
    const iliskiMetni = await dosya(iliskiYolu);
    const hedefler = {};
    let paylasimliYol = null, stilYolu = null;
    if (iliskiMetni) {
      etiketler(xmlCoz(iliskiMetni), 'Relationship').forEach(function (r) {
        const yol = yolCoz(kitapYolu, r.getAttribute('Target') || '');
        const tur = r.getAttribute('Type') || '';
        hedefler[r.getAttribute('Id')] = yol;
        if (/\/sharedStrings$/.test(tur)) paylasimliYol = yol;
        else if (/\/styles$/.test(tur)) stilYolu = yol;
      });
    }
    const paylasimli = [];
    const psMetni = paylasimliYol ? await dosya(paylasimliYol) : null;
    if (psMetni) cocuklar(xmlCoz(psMetni).documentElement, 'si').forEach(function (si) { paylasimli.push(siMetni(si)); });
    const tarihStilleri = stilleriOku(stilYolu ? await dosya(stilYolu) : null);
    const ozellik = etiketler(kitap, 'workbookPr')[0];
    const tarih1904 = !!ozellik && /^(1|true)$/i.test(ozellik.getAttribute('date1904') || '');
    const sayfalar = [];
    for (const s of etiketler(kitap, 'sheet')) {
      const durum = s.getAttribute('state');
      if (durum === 'hidden' || durum === 'veryHidden') continue;
      const yol = hedefler[kimlikBul(s)];
      if (!yol) continue;
      const sx = await dosya(yol);
      if (!sx) continue;
      sayfalar.push({ ad: s.getAttribute('name') || 'Sayfa', satirlar: sayfaOku(xmlCoz(sx), paylasimli, tarihStilleri, tarih1904) });
    }
    return sayfalar;
  }

  function kimlikBul(el) {
    const v = el.getAttributeNS(R_NS, 'id');
    if (v) return v;
    for (const a of Array.from(el.attributes)) if (a.localName === 'id') return a.value;
    return null;
  }

  function yolCoz(taban, hedef) {
    if (hedef.charAt(0) === '/') return hedef.slice(1);
    const parcalar = taban.split('/');
    parcalar.pop();
    hedef.split('/').forEach(function (p) {
      if (p === '..') parcalar.pop();
      else if (p !== '.' && p !== '') parcalar.push(p);
    });
    return parcalar.filter(Boolean).join('/');
  }

  function stilleriOku(metin) {
    const tarihli = new Set();
    if (!metin) return tarihli;
    const doc = xmlCoz(metin);
    const ozel = {};
    etiketler(doc, 'numFmt').forEach(function (n) { ozel[n.getAttribute('numFmtId')] = n.getAttribute('formatCode') || ''; });
    const xfs = etiketler(doc, 'cellXfs')[0];
    if (!xfs) return tarihli;
    cocuklar(xfs, 'xf').forEach(function (xf, i) {
      const id = parseInt(xf.getAttribute('numFmtId') || '0', 10);
      if (tarihBicimiMi(id, ozel[id])) tarihli.add(i);
    });
    return tarihli;
  }

  function tarihBicimiMi(id, kod) {
    if ((id >= 14 && id <= 22) || (id >= 27 && id <= 36) || (id >= 45 && id <= 47) || (id >= 50 && id <= 58)) return true;
    if (!kod) return false;
    const temiz = kod.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
    return /[dmyhs]/i.test(temiz) && !/general/i.test(temiz);
  }

  function sayfaOku(doc, paylasimli, tarihli, tarih1904) {
    const satirlar = [];
    let siradaki = 0;
    etiketler(doc, 'row').forEach(function (row) {
      const rn = parseInt(row.getAttribute('r'), 10);
      const ri = isNaN(rn) ? siradaki : rn - 1;
      siradaki = ri + 1;
      let r = null, sira = 0;
      cocuklar(row, 'c').forEach(function (c) {
        const ref = c.getAttribute('r');
        const ci = ref ? kolonIndeksi(ref) : sira;
        sira = ci + 1;
        const v = hucreDegeri(c, paylasimli, tarihli, tarih1904);
        if (v === null || v === undefined || v === '') return;
        if (!r) r = satirlar[ri] = [];
        r[ci] = v;
      });
    });
    for (let i = 0; i < satirlar.length; i++) {
      const r = satirlar[i] || (satirlar[i] = []);
      for (let j = 0; j < r.length; j++) if (r[j] === undefined) r[j] = null;
    }
    return satirlar;
  }

  function hucreDegeri(c, paylasimli, tarihli, tarih1904) {
    const tur = c.getAttribute('t') || 'n';
    const vEl = cocuklar(c, 'v')[0];
    const v = vEl ? vEl.textContent : null;
    if (tur === 's') return v === null ? null : (paylasimli[parseInt(v, 10)] !== undefined ? paylasimli[parseInt(v, 10)] : null);
    if (tur === 'inlineStr') { const is = cocuklar(c, 'is')[0]; return is ? siMetni(is) : null; }
    if (tur === 'str' || tur === 'e') return v;
    if (tur === 'b') return v === '1' || v === 'true';
    if (tur === 'd') { const d = new Date(v); return isNaN(d.getTime()) ? v : d; }
    if (v === null || v === '') return null;
    const x = Number(v);
    if (isNaN(x)) return v;
    const stil = parseInt(c.getAttribute('s') || '0', 10);
    if (tarihli.has(stil)) return seriTarih(x, tarih1904);
    return x;
  }

  function seriTarih(x, tarih1904) {
    const gun = tarih1904 ? x + 1462 : x;
    return new Date(Math.round((gun - 25569) * 86400000));
  }

  function siMetni(si) {
    let s = '';
    etiketler(si, 't').forEach(function (t) {
      let p = t.parentNode, fonetik = false;
      while (p && p !== si) { if (p.localName === 'rPh') { fonetik = true; break; } p = p.parentNode; }
      if (!fonetik) s += t.textContent;
    });
    return s;
  }

  function kolonIndeksi(ref) {
    let n = 0;
    for (let i = 0; i < ref.length; i++) {
      const k = ref.charCodeAt(i);
      if (k >= 65 && k <= 90) n = n * 26 + (k - 64);
      else if (k >= 97 && k <= 122) n = n * 26 + (k - 96);
      else break;
    }
    return n - 1;
  }

  /* ---------------- Zip ve XML ---------------- */

  function zipAc(b) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let son = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { son = i; break; }
    }
    if (son < 0) throw new Error('Excel dosyası bozuk görünüyor (zip dizini bulunamadı).');
    const adet = dv.getUint16(son + 10, true);
    let p = dv.getUint32(son + 16, true);
    const girisler = new Map();
    const cozucu = new TextDecoder('utf-8');
    for (let k = 0; k < adet; k++) {
      if (p + 46 > b.length || dv.getUint32(p, true) !== 0x02014b50) break;
      const yontem = dv.getUint16(p + 10, true);
      const sikisik = dv.getUint32(p + 20, true);
      const adUz = dv.getUint16(p + 28, true), ekUz = dv.getUint16(p + 30, true), yorumUz = dv.getUint16(p + 32, true);
      const yerel = dv.getUint32(p + 42, true);
      const ad = cozucu.decode(b.subarray(p + 46, p + 46 + adUz));
      girisler.set(ad, { yontem: yontem, sikisik: sikisik, yerel: yerel });
      p += 46 + adUz + ekUz + yorumUz;
    }
    return girisler;
  }

  async function ac(b, e) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const adUz = dv.getUint16(e.yerel + 26, true), ekUz = dv.getUint16(e.yerel + 28, true);
    const bas = e.yerel + 30 + adUz + ekUz;
    const veri = b.subarray(bas, bas + e.sikisik);
    if (e.yontem === 0) return veri;
    if (e.yontem !== 8) throw new Error('Excel dosyasında desteklenmeyen sıkıştırma var (' + e.yontem + ').');
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Bu tarayıcı Excel dosyasını açamıyor. Güncel Chrome, Edge, Safari ya da Firefox kullanın.');
    }
    const akis = new Blob([veri]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(akis).arrayBuffer());
  }

  function xmlCoz(metin) {
    const doc = new DOMParser().parseFromString(metin, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Excel dosyasındaki XML okunamadı.');
    return doc;
  }

  function etiketler(kap, ad) { return Array.from(kap.getElementsByTagNameNS('*', ad)); }

  function cocuklar(el, ad) {
    const l = [];
    for (let c = el.firstElementChild; c; c = c.nextElementSibling) if (c.localName === ad) l.push(c);
    return l;
  }

  kok.ExcelOkuyucu = { oku: oku, _ic: { zipAc: zipAc, ac: ac, xmlCoz: xmlCoz, csvOku: csvOku, metneCevir: metneCevir } };
})(typeof window !== 'undefined' ? window : this);
