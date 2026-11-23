/* CV eklerinden metin: PDF (pdf.js), DOCX, eski Word (.doc), ODT, RTF, TXT/HTML. Görseller okunamaz (OCR yok).
   Belge.metin(ad, Uint8Array) -> { metin, durum: 'tamam'|'gorsel'|'sifreli'|'desteksiz'|'hata' } */
(function () {
  'use strict';
  const Z = globalThis.Zip;
  const td = new TextDecoder();
  const xmlCoz = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, '&');

  // ---------- DOCX ----------
  function wordXml(x) {
    x = x.replace(/<mc:Fallback>[\s\S]*?<\/mc:Fallback>/g, '');
    let out = '';
    for (const m of x.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>|<w:cr\/>|<\/w:p>|<\/w:tc>|<\/w:tr>/g)) {
      if (m[1] != null) out += xmlCoz(m[1]);
      else if (m[0] === '<w:tab/>') out += '\t';
      else if (m[0] === '</w:tc>') out = out.replace(/\n$/, '') + ' | ';
      else if (m[0] === '</w:tr>') out = out.replace(/ \| $/, '') + '\n';
      else out += '\n';
    }
    return out;
  }
  function docx(u) {
    const z = Z.unzip(u); const parca = [];
    const al = ad => { const b = z.al(ad); return b ? td.decode(b) : ''; };
    for (const ad of z.adlar.filter(a => /^word\/header\d*\.xml$/.test(a))) parca.push(wordXml(al(ad)));
    parca.push(wordXml(al('word/document.xml')));
    return parca.join('\n');
  }

  // ---------- ODT ----------
  function odt(u) {
    const x = td.decode(Z.unzip(u).al('content.xml') || new Uint8Array(0));
    return xmlCoz(x.replace(/<text:tab\/>/g, '\t').replace(/<text:line-break\/>/g, '\n').replace(/<\/text:(p|h)>/g, '\n').replace(/<[^>]+>/g, ''));
  }

  // ---------- eski Word (.doc): CFB kabı + parça tablosu ----------
  function cfb(u) {
    const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
    if (dv.getUint32(0, true) !== 0xE011CFD0) throw new Error('CFB değil');
    const ss = 1 << dv.getUint16(0x1E, true), mss = 1 << dv.getUint16(0x20, true);
    const sek = n => (n + 1) * ss;
    const difat = []; for (let i = 0; i < 109; i++) difat.push(dv.getInt32(0x4C + i * 4, true));
    let ds = dv.getInt32(0x44, true), dn = dv.getUint32(0x48, true);
    while (ds >= 0 && dn-- > 0 && sek(ds) + ss <= u.length) { for (let i = 0; i < ss / 4 - 1; i++) difat.push(dv.getInt32(sek(ds) + i * 4, true)); ds = dv.getInt32(sek(ds) + ss - 4, true); }
    const fat = []; for (const f of difat) { if (f < 0 || sek(f) + ss > u.length) continue; for (let i = 0; i < ss / 4; i++) fat.push(dv.getInt32(sek(f) + i * 4, true)); }
    const zincir = (s, tablo) => { const o = []; const gor = new Set(); while (s >= 0 && s < tablo.length && !gor.has(s)) { gor.add(s); o.push(s); s = tablo[s]; } return o; };
    const oku = (s, boy) => { const o = new Uint8Array(boy); let p = 0; for (const x of zincir(s, fat)) { if (p >= boy) break; const b = u.subarray(sek(x), Math.min(sek(x) + ss, u.length)); const n = Math.min(b.length, boy - p); o.set(b.subarray(0, n), p); p += n; } return o; };
    const dir = oku(dv.getInt32(0x30, true), zincir(dv.getInt32(0x30, true), fat).length * ss);
    const dd = new DataView(dir.buffer); const girdi = {};
    for (let i = 0; i + 128 <= dir.length; i += 128) {
      const nl = dd.getUint16(i + 0x40, true); if (!nl) continue;
      let ad = ''; for (let j = 0; j < nl - 2; j += 2) ad += String.fromCharCode(dd.getUint16(i + j, true));
      girdi[ad] = { tur: dir[i + 0x42], bas: dd.getInt32(i + 0x74, true), boy: dd.getUint32(i + 0x78, true) };
    }
    const kok = Object.values(girdi).find(g => g.tur === 5);
    const kesim = dv.getUint32(0x38, true);
    let mini = null, minifat = null;
    return ad => {
      const g = girdi[ad]; if (!g) return null;
      if (g.boy >= kesim) return oku(g.bas, g.boy);
      if (!mini) {
        mini = oku(kok.bas, kok.boy);
        const mf = zincir(dv.getInt32(0x3C, true), fat); minifat = [];
        for (const s of mf) for (let i = 0; i < ss / 4; i++) minifat.push(dv.getInt32(sek(s) + i * 4, true));
      }
      const o = new Uint8Array(g.boy); let p = 0;
      for (const x of zincir(g.bas, minifat)) { const n = Math.min(mss, g.boy - p); if (n <= 0) break; o.set(mini.subarray(x * mss, x * mss + n), p); p += n; }
      return o;
    };
  }
  function doc(u) {
    const akis = cfb(u); const w = akis('WordDocument'); if (!w) throw new Error('WordDocument yok');
    const wv = new DataView(w.buffer);
    if (wv.getUint16(0, true) !== 0xA5EC) throw new Error('Word 97 değil');
    const tablo = akis((wv.getUint16(0x0A, true) & 0x0200) ? '1Table' : '0Table'); if (!tablo) throw new Error('Tablo akışı yok');
    const fc = wv.getUint32(0x01A2, true), lcb = wv.getUint32(0x01A6, true);
    const tv = new DataView(tablo.buffer); let i = fc; const son = fc + lcb; let metin = '';
    while (i < son) {
      const t = tablo[i];
      if (t === 1) { i += 3 + tv.getUint16(i + 1, true); continue; }
      if (t !== 2) break;
      const boy = tv.getUint32(i + 1, true); const p = i + 5; const n = (boy - 4) / 12;
      const cp = k => tv.getUint32(p + k * 4, true);
      const w1252 = new TextDecoder('windows-1252'), u16 = new TextDecoder('utf-16le');
      for (let k = 0; k < n; k++) {
        const pcd = p + (n + 1) * 4 + k * 8; const f = tv.getUint32(pcd + 2, true); const say = cp(k + 1) - cp(k);
        if (f & 0x40000000) { const o = (f & 0x3FFFFFFF) / 2; metin += w1252.decode(w.subarray(o, o + say)); }
        else metin += u16.decode(w.subarray(f, f + say * 2));
      }
      break;
    }
    return metin.replace(/\x13[^\x14\x15]*\x14?/g, '').replace(/[\x14\x15]/g, '').replace(/\x07/g, '\t').replace(/[\r\x0b\x0c]/g, '\n').replace(/[\x00-\x08\x0e-\x1f]/g, '');
  }

  // ---------- RTF (kaba) ----------
  function rtf(u) {
    const s = new TextDecoder('windows-1254').decode(u);
    return s.replace(/\\u(-?\d+)\??/g, (m, n) => String.fromCharCode((+n + 65536) % 65536)).replace(/\\'([0-9a-f]{2})/gi, (m, h) => new TextDecoder('windows-1254').decode(Uint8Array.of(parseInt(h, 16))))
      .replace(/\\par[d]?\b/g, '\n').replace(/\\tab\b/g, '\t').replace(/\{\\\*[^{}]*\}/g, '').replace(/\\[a-z]+-?\d* ?/gi, '').replace(/[{}]/g, '');
  }

  const GORSEL = /\.(jpe?g|png|gif|bmp|tiff?|heic|heif|webp)$/i;
  function metin(ad, u) {
    const uz = (ad.match(/\.[^.]+$/) || [''])[0].toLowerCase();
    const bas = u.length >= 4 ? (u[0] << 24 | u[1] << 16 | u[2] << 8 | u[3]) >>> 0 : 0;
    try {
      if (bas === 0x25504446 || uz === '.pdf') return { metin: globalThis.PdfMetin.metin(u), durum: 'tamam' };
      if (uz === '.docx' || uz === '.dotx' || (uz === '.doc' && bas === 0x504B0304)) return { metin: docx(u), durum: 'tamam' };
      if (uz === '.odt') return { metin: odt(u), durum: 'tamam' };
      if (uz === '.doc' || bas === 0xD0CF11E0) return { metin: doc(u), durum: 'tamam' };
      if (uz === '.rtf') return { metin: rtf(u), durum: 'tamam' };
      if (uz === '.txt') return { metin: globalThis.Eml.coz(u, 'utf-8'), durum: 'tamam' };
      if (uz === '.htm' || uz === '.html') return { metin: globalThis.Eml.coz(u, 'utf-8').replace(/<[^>]+>/g, ' '), durum: 'tamam' };
      if (GORSEL.test(ad)) return { metin: '', durum: 'gorsel' };
      return { metin: '', durum: 'desteksiz' };
    } catch (e) {
      return { metin: '', durum: e && e.sifreli ? 'sifreli' : 'hata' };
    }
  }

  globalThis.Belge = { metin, GORSEL };
})();
