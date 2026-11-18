/* Bağımlılıksız ZIP/Deflate yardımcıları: inflate (PDF akışları ve XLSX okuma için), ZIP okuma ve ZIP yazma (XLSX üretimi için). */
(function () {
  'use strict';

  // ---------- inflate (RFC 1951) ----------
  const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  const CLORD = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

  function agac(uz, n) {
    const say = new Uint16Array(16), ofs = new Uint16Array(16), sem = new Uint16Array(n);
    for (let i = 0; i < n; i++) say[uz[i]]++;
    say[0] = 0;
    for (let i = 1; i < 16; i++) ofs[i] = ofs[i - 1] + say[i - 1];
    for (let i = 0; i < n; i++) if (uz[i]) sem[ofs[uz[i]]++] = i;
    return { say, sem };
  }
  let SABIT_L = null, SABIT_D = null;
  function sabit() {
    if (SABIT_L) return;
    const l = new Uint8Array(288); l.fill(8, 0, 144); l.fill(9, 144, 256); l.fill(7, 256, 280); l.fill(8, 280, 288);
    SABIT_L = agac(l, 288); SABIT_D = agac(new Uint8Array(30).fill(5), 30);
  }

  // Bozuk/yarım akışta o ana kadar açılan veriyi döndürür (zlib Z_SYNC_FLUSH davranışı gibi).
  function inflateRaw(src, bas) {
    let out = new Uint8Array(Math.max(1024, src.length * 4)), op = 0;
    let bb = 0, bc = 0, p = bas || 0;
    const bit = n => {
      while (bc < n) { if (p >= src.length) throw new Error('EOF'); bb |= src[p++] << bc; bc += 8; }
      const v = bb & ((1 << n) - 1); bb >>>= n; bc -= n; return v;
    };
    const yer = n => { if (op + n > out.length) { let m = out.length * 2; while (m < op + n) m *= 2; const o = new Uint8Array(m); o.set(out.subarray(0, op)); out = o; } };
    const sembol = t => {
      let kod = 0, ilk = 0, idx = 0;
      for (let uz = 1; uz < 16; uz++) {
        kod |= bit(1); const c = t.say[uz];
        if (kod - c < ilk) return t.sem[idx + (kod - ilk)];
        idx += c; ilk += c; ilk <<= 1; kod <<= 1;
      }
      throw new Error('gecersiz kod');
    };
    try {
      let son;
      do {
        son = bit(1); const tip = bit(2);
        if (tip === 0) {
          bb = 0; bc = 0;
          if (p + 4 > src.length) throw new Error('EOF');
          const len = src[p] | (src[p + 1] << 8); p += 4;
          const n = Math.min(len, src.length - p); yer(n); out.set(src.subarray(p, p + n), op); op += n; p += n;
          if (n < len) throw new Error('EOF');
        } else if (tip === 1 || tip === 2) {
          let lt, dt;
          if (tip === 1) { sabit(); lt = SABIT_L; dt = SABIT_D; }
          else {
            const hlit = bit(5) + 257, hdist = bit(5) + 1, hclen = bit(4) + 4;
            const cl = new Uint8Array(19); for (let i = 0; i < hclen; i++) cl[CLORD[i]] = bit(3);
            const ct = agac(cl, 19); const top = hlit + hdist; const uz = new Uint8Array(top);
            for (let i = 0; i < top;) {
              const s = sembol(ct);
              if (s < 16) { uz[i++] = s; continue; }
              let tekrar, deger = 0;
              if (s === 16) { if (!i) throw new Error('gecersiz'); deger = uz[i - 1]; tekrar = 3 + bit(2); }
              else if (s === 17) tekrar = 3 + bit(3); else tekrar = 11 + bit(7);
              if (i + tekrar > top) throw new Error('gecersiz');
              while (tekrar--) uz[i++] = deger;
            }
            lt = agac(uz.subarray(0, hlit), hlit); dt = agac(uz.subarray(hlit), hdist);
          }
          for (;;) {
            const s = sembol(lt);
            if (s < 256) { if (op >= out.length) yer(1); out[op++] = s; }
            else if (s === 256) break;
            else {
              const li = s - 257; if (li >= 29) throw new Error('gecersiz uzunluk');
              const len = LBASE[li] + bit(LEXT[li]); const ds = sembol(dt); if (ds >= 30) throw new Error('gecersiz mesafe');
              const dist = DBASE[ds] + bit(DEXT[ds]); if (dist > op) throw new Error('gecersiz mesafe');
              yer(len); for (let k = 0; k < len; k++) { out[op] = out[op - dist]; op++; }
            }
          }
        } else throw new Error('gecersiz blok');
      } while (!son);
    } catch (e) { /* kısmi çıktı */ }
    return out.subarray(0, op);
  }
  // zlib sarmalı varsa atla
  function inflate(src) {
    if (src.length > 2 && (src[0] & 0x0f) === 8 && ((src[0] << 8) | src[1]) % 31 === 0) return inflateRaw(src, 2 + ((src[1] & 0x20) ? 4 : 0));
    return inflateRaw(src, 0);
  }

  // ---------- ZIP okuma (merkezi dizinden) ----------
  function unzip(b) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let e = b.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('Dosya bir ZIP/XLSX değil');
    const n = dv.getUint16(e + 10, true); let c = dv.getUint32(e + 16, true);
    const td = new TextDecoder(); const dosyalar = {};
    for (let k = 0; k < n && c + 46 <= b.length; k++) {
      if (dv.getUint32(c, true) !== 0x02014b50) break;
      const yontem = dv.getUint16(c + 10, true), cs = dv.getUint32(c + 20, true), nl = dv.getUint16(c + 28, true), xl = dv.getUint16(c + 30, true), kl = dv.getUint16(c + 32, true), lho = dv.getUint32(c + 42, true);
      const ad = td.decode(b.subarray(c + 46, c + 46 + nl));
      const veri = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
      dosyalar[ad] = { yontem, ham: b.subarray(veri, veri + cs) };
      c += 46 + nl + xl + kl;
    }
    return { adlar: Object.keys(dosyalar), al(ad) { const f = dosyalar[ad]; if (!f) return null; return f.yontem === 0 ? f.ham : inflateRaw(f.ham, 0); } };
  }

  // ---------- ZIP yazma ----------
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  async function deflateRaw(veri) {
    if (typeof CompressionStream === 'undefined') return null;
    try { const s = new Blob([veri]).stream().pipeThrough(new CompressionStream('deflate-raw')); return new Uint8Array(await new Response(s).arrayBuffer()); }
    catch (e) { return null; }
  }
  // dosyalar: [{ad, veri: Uint8Array}] -> Uint8Array
  async function zip(dosyalar) {
    const te = new TextEncoder(); const parcalar = [], merkez = []; let ofs = 0;
    for (const f of dosyalar) {
      const ad = te.encode(f.ad); const sik = await deflateRaw(f.veri); const yontem = sik ? 8 : 0; const govde = sik || f.veri; const crc = crc32(f.veri);
      const lh = new Uint8Array(30); const l = new DataView(lh.buffer);
      l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x0800, true); l.setUint16(8, yontem, true); l.setUint16(12, 0x21, true);
      l.setUint32(14, crc, true); l.setUint32(18, govde.length, true); l.setUint32(22, f.veri.length, true); l.setUint16(26, ad.length, true);
      parcalar.push(lh, ad, govde);
      const ch = new Uint8Array(46); const c = new DataView(ch.buffer);
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, yontem, true); c.setUint16(14, 0x21, true);
      c.setUint32(16, crc, true); c.setUint32(20, govde.length, true); c.setUint32(24, f.veri.length, true); c.setUint16(28, ad.length, true); c.setUint32(42, ofs, true);
      merkez.push(ch, ad); ofs += 30 + ad.length + govde.length;
    }
    const mBoy = merkez.reduce((s, x) => s + x.length, 0);
    const son = new Uint8Array(22); const d = new DataView(son.buffer);
    d.setUint32(0, 0x06054b50, true); d.setUint16(8, dosyalar.length, true); d.setUint16(10, dosyalar.length, true); d.setUint32(12, mBoy, true); d.setUint32(16, ofs, true);
    return birlestir([...parcalar, ...merkez, son]);
  }
  function birlestir(liste) {
    const top = liste.reduce((s, x) => s + x.length, 0); const o = new Uint8Array(top); let i = 0;
    for (const x of liste) { o.set(x, i); i += x.length; }
    return o;
  }

  globalThis.Zip = { inflate, inflateRaw, unzip, zip, crc32, birlestir };
})();
