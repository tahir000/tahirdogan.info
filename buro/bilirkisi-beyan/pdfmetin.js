/*
 * Bilirkişi Raporuna Beyan: PDF'ten metin çıkarma
 *
 * Dış kütüphane kullanmayan küçük bir okuyucu. Word ve benzeri programların
 * "PDF olarak kaydet" ile ürettiği metinli PDF'leri okur (UYAP'tan inen bilirkişi
 * raporları genelde böyledir). Taranmış (resim) ya da şifreli PDF'ten metin çıkmaz;
 * o zaman bilgiler elle girilir.
 */
(function (kok) {
  'use strict';

  function latin1(b) {
    let s = '';
    for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
    return s;
  }
  function birlestir(parcalar) {
    let n = 0;
    parcalar.forEach(function (p) { n += p.length; });
    const o = new Uint8Array(n);
    let i = 0;
    parcalar.forEach(function (p) { o.set(p, i); i += p.length; });
    return o;
  }

  /* Akışın sonunda fazladan bayt olsa da çözülebilen kısmı döndürür */
  async function coz(veri, tur) {
    const ds = new DecompressionStream(tur);
    const w = ds.writable.getWriter(), r = ds.readable.getReader();
    w.write(veri).catch(function () {});
    w.close().catch(function () {});
    const parcalar = [];
    try {
      for (;;) { const x = await r.read(); if (x.done) break; parcalar.push(x.value); }
    } catch (e) { /* bozuk ya da fazlalıklı akış: çözülebilen kadarı */ }
    return birlestir(parcalar);
  }
  async function flate(veri) {
    let o = await coz(veri, 'deflate');
    if (!o.length && veri.length > 2) o = await coz(veri.subarray(2), 'deflate-raw');
    return o;
  }

  /* ---------------- PDF nesne sözdizimi ---------------- */

  const BOSLUK = /[\0\t\n\f\r ]/;
  const AYRAC = /[\0\t\n\f\r ()<>\[\]{}\/%]/;

  function bosAtla(s, p) {
    for (;;) {
      while (p < s.length && BOSLUK.test(s[p])) p++;
      if (s[p] === '%') { while (p < s.length && s[p] !== '\n' && s[p] !== '\r') p++; continue; }
      return p;
    }
  }

  function literal(s, p) {
    let o = '', derinlik = 1;
    p++;
    while (p < s.length) {
      const c = s[p];
      if (c === '\\') {
        const n = s[p + 1];
        const kacis = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };
        if (kacis[n] !== undefined) { o += kacis[n]; p += 2; continue; }
        if (n >= '0' && n <= '7') {
          let k = '';
          p++;
          while (k.length < 3 && s[p] >= '0' && s[p] <= '7') k += s[p++];
          o += String.fromCharCode(parseInt(k, 8) & 255);
          continue;
        }
        if (n === '\r') { p += s[p + 2] === '\n' ? 3 : 2; continue; }
        if (n === '\n') { p += 2; continue; }
        p++;
        continue;
      }
      if (c === '(') derinlik++;
      else if (c === ')') { derinlik--; if (!derinlik) return [{ yazi: o }, p + 1]; }
      o += c;
      p++;
    }
    return [{ yazi: o }, p];
  }

  /* Bir PDF değeri okur: sayı, ad, metin, dizi, sözlük, başvuru (n 0 R) */
  function deger(s, p) {
    p = bosAtla(s, p);
    const c = s[p];
    if (c === '<' && s[p + 1] === '<') {
      const o = {};
      p += 2;
      for (;;) {
        p = bosAtla(s, p);
        if (p >= s.length) return [o, p];
        if (s[p] === '>' && s[p + 1] === '>') return [o, p + 2];
        const a = deger(s, p);
        p = a[1];
        if (!a[0] || a[0].ad === undefined) { p++; continue; }
        const v = deger(s, p);
        o[a[0].ad] = v[0];
        p = v[1];
      }
    }
    if (c === '<') {
      const son = s.indexOf('>', p);
      let h = s.slice(p + 1, son).replace(/[^0-9A-Fa-f]/g, '');
      if (h.length % 2) h += '0';
      let o = '';
      for (let i = 0; i < h.length; i += 2) o += String.fromCharCode(parseInt(h.substr(i, 2), 16));
      return [{ yazi: o }, son + 1];
    }
    if (c === '(') return literal(s, p);
    if (c === '[') {
      const o = [];
      p++;
      for (;;) {
        p = bosAtla(s, p);
        if (p >= s.length || s[p] === ']') return [o, p + 1];
        const v = deger(s, p);
        if (v[1] === p) { p++; continue; }
        o.push(v[0]);
        p = v[1];
      }
    }
    if (c === '/') {
      let q = p + 1;
      while (q < s.length && !AYRAC.test(s[q])) q++;
      const ad = s.slice(p + 1, q).replace(/#([0-9A-Fa-f]{2})/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); });
      return [{ ad: ad }, q];
    }
    const sayi = /^[+\-]?(?:\d+\.?\d*|\.\d+)/.exec(s.slice(p, p + 40));
    if (sayi) {
      const q = p + sayi[0].length;
      const ref = /^\s+(\d+)\s+R(?![A-Za-z])/.exec(s.slice(q, q + 20));
      if (ref && /^\d+$/.test(sayi[0])) return [{ ref: +sayi[0] }, q + ref[0].length];
      return [parseFloat(sayi[0]), q];
    }
    let q = p;
    while (q < s.length && !AYRAC.test(s[q])) q++;
    if (q === p) return [null, p + 1];
    const k = s.slice(p, q);
    return [{ op: k }, q];
  }

  /* ---------------- Belge ---------------- */

  async function belgeOku(b) {
    const s = latin1(b);
    if (!/^\s*%PDF-/.test(s.slice(0, 1024))) throw new Error('Bu dosya PDF değil.');
    if (/\/Encrypt\s*(?:\d+\s+\d+\s+R|<<)/.test(s)) throw new Error('PDF şifreli; metni okunamıyor. Bilgileri elle girin.');
    const nesneler = new Map();
    const re = /(\d+)\s+(\d+)\s+obj\b/g;
    let m;
    while ((m = re.exec(s)) !== null) {
      const no = +m[1];
      const v = deger(s, m.index + m[0].length);
      let p = bosAtla(s, v[1]);
      if (s.substr(p, 6) === 'stream') {
        p += 6;
        if (s[p] === '\r') p++;
        if (s[p] === '\n') p++;
        const sozluk = v[0] || {};
        let son = -1;
        if (typeof sozluk.Length === 'number') {
          const aday = p + sozluk.Length;
          if (/^\s*endstream/.test(s.slice(aday, aday + 20))) son = aday;
        }
        if (son < 0) {
          son = s.indexOf('endstream', p);
          if (son < 0) son = s.length;
          while (son > p && (s[son - 1] === '\n' || s[son - 1] === '\r')) son--;
        }
        nesneler.set(no, { sozluk: sozluk, ham: b.subarray(p, son) });
        const e = s.indexOf('endstream', son);
        re.lastIndex = e < 0 ? s.length : e + 9;
      } else {
        nesneler.set(no, { deger: v[0] });
        re.lastIndex = v[1];
      }
    }
    const belge = { nesneler: nesneler, akisBellek: new Map() };
    /* Nesne akışları (ObjStm) */
    for (const [no, n] of Array.from(nesneler)) {
      if (!n.ham || !n.sozluk || !n.sozluk.Type || n.sozluk.Type.ad !== 'ObjStm') continue;
      const d = latin1(await akisCoz(belge, no));
      const N = n.sozluk.N || 0, ilk = n.sozluk.First || 0;
      const bas = d.slice(0, ilk).trim().split(/\s+/).map(Number);
      for (let i = 0; i < N; i++) {
        const nn = bas[2 * i], ofs = bas[2 * i + 1];
        if (!nesneler.has(nn)) nesneler.set(nn, { deger: deger(d, ilk + ofs)[0] });
      }
    }
    return belge;
  }

  function al(belge, v) {
    let derinlik = 0;
    while (v && v.ref !== undefined && derinlik++ < 20) {
      const n = belge.nesneler.get(v.ref);
      v = n ? (n.ham ? n.sozluk : n.deger) : null;
    }
    return v;
  }

  async function akisCoz(belge, no) {
    if (belge.akisBellek.has(no)) return belge.akisBellek.get(no);
    const n = belge.nesneler.get(no);
    if (!n || !n.ham) return new Uint8Array(0);
    let f = al(belge, n.sozluk.Filter);
    if (f && !Array.isArray(f)) f = [f];
    let veri = n.ham;
    for (const x of f || []) {
      if (x.ad === 'FlateDecode' || x.ad === 'Fl') veri = await flate(veri);
      else { veri = new Uint8Array(0); break; }
    }
    belge.akisBellek.set(no, veri);
    return veri;
  }

  /* ---------------- Yazı tipleri ---------------- */

  const CP1252 = { 0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8A: 'Š', 0x8B: '‹', 0x8C: 'Œ', 0x8E: 'Ž', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0x98: '˜', 0x99: '™', 0x9A: 'š', 0x9B: '›', 0x9C: 'œ', 0x9E: 'ž', 0x9F: 'Ÿ' };
  const GLIF = {
    space: ' ', exclam: '!', quotedbl: '"', numbersign: '#', dollar: '$', percent: '%', ampersand: '&', quotesingle: "'",
    parenleft: '(', parenright: ')', asterisk: '*', plus: '+', comma: ',', hyphen: '-', period: '.', slash: '/',
    zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9',
    colon: ':', semicolon: ';', less: '<', equal: '=', greater: '>', question: '?', at: '@', bracketleft: '[',
    backslash: '\\', bracketright: ']', underscore: '_', quoteleft: '‘', quoteright: '’', quotedblleft: '“',
    quotedblright: '”', endash: '–', emdash: '—', bullet: '•', ellipsis: '…', percent2: '%',
    Gbreve: 'Ğ', gbreve: 'ğ', Idotaccent: 'İ', Idot: 'İ', dotlessi: 'ı', Scedilla: 'Ş', scedilla: 'ş',
    Ccedilla: 'Ç', ccedilla: 'ç', Odieresis: 'Ö', odieresis: 'ö', Udieresis: 'Ü', udieresis: 'ü',
    Acircumflex: 'Â', acircumflex: 'â', Icircumflex: 'Î', icircumflex: 'î', Ucircumflex: 'Û', ucircumflex: 'û', nbspace: ' '
  };
  function glifCoz(ad) {
    if (GLIF[ad] !== undefined) return GLIF[ad];
    if (/^[A-Za-z]$/.test(ad)) return ad;
    const u = /^uni([0-9A-Fa-f]{4})$/.exec(ad);
    return u ? String.fromCharCode(parseInt(u[1], 16)) : '';
  }

  function cmapCoz(d) {
    const h = new Map();
    let bayt = 1;
    const cs = /begincodespacerange([\s\S]*?)endcodespacerange/.exec(d);
    if (cs) { const k = /<([0-9A-Fa-f]+)>/.exec(cs[1]); if (k) bayt = Math.max(1, k[1].length / 2); }
    function u16(hx) {
      let o = '';
      for (let i = 0; i + 4 <= hx.length; i += 4) o += String.fromCharCode(parseInt(hx.substr(i, 4), 16));
      return o;
    }
    let m;
    const bc = /beginbfchar([\s\S]*?)endbfchar/g;
    while ((m = bc.exec(d)) !== null) {
      const r = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g;
      let x;
      while ((x = r.exec(m[1])) !== null) h.set(parseInt(x[1], 16), u16(x[2]));
    }
    const br = /beginbfrange([\s\S]*?)endbfrange/g;
    while ((m = br.exec(d)) !== null) {
      const r = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(\[[^\]]*\]|<[0-9A-Fa-f]+>)/g;
      let x;
      while ((x = r.exec(m[1])) !== null) {
        const a = parseInt(x[1], 16), z = parseInt(x[2], 16);
        if (z - a > 65535) continue;
        if (x[3][0] === '[') {
          const l = x[3].match(/<([0-9A-Fa-f]+)>/g) || [];
          l.forEach(function (hx, i) { h.set(a + i, u16(hx.slice(1, -1))); });
        } else {
          const hx = x[3].slice(1, -1), onEk = hx.slice(0, -4), son = parseInt(hx.slice(-4), 16);
          for (let i = 0; i <= z - a; i++) h.set(a + i, u16(onEk) + String.fromCharCode(son + i));
        }
      }
    }
    return { harita: h, bayt: bayt };
  }

  async function yaziTipi(belge, ref) {
    const f = al(belge, ref) || {};
    const tip = { iki: f.Subtype && f.Subtype.ad === 'Type0', harita: null, bayt: 1, kodlama: null, genislik: new Map(), varsayilan: 500 };
    if (tip.iki) {
      tip.bayt = 2;
      const alt = (al(belge, f.DescendantFonts) || [])[0];
      const cid = al(belge, alt) || {};
      tip.varsayilan = typeof cid.DW === 'number' ? cid.DW : 1000;
      const W = al(belge, cid.W) || [];
      for (let i = 0; i < W.length;) {
        const a = W[i], b = al(belge, W[i + 1]);
        if (Array.isArray(b)) { b.forEach(function (w, k) { tip.genislik.set(a + k, al(belge, w)); }); i += 2; }
        else { const w = al(belge, W[i + 2]); for (let k = a; k <= b && k - a < 65536; k++) tip.genislik.set(k, w); i += 3; }
      }
    } else {
      const ilk = typeof f.FirstChar === 'number' ? f.FirstChar : 0;
      (al(belge, f.Widths) || []).forEach(function (w, k) { tip.genislik.set(ilk + k, al(belge, w)); });
      const fd = al(belge, f.FontDescriptor) || {};
      if (typeof fd.MissingWidth === 'number') tip.varsayilan = fd.MissingWidth;
    }
    if (f.ToUnicode && f.ToUnicode.ref !== undefined) {
      const c = cmapCoz(latin1(await akisCoz(belge, f.ToUnicode.ref)));
      tip.harita = c.harita;
      if (tip.iki) tip.bayt = c.bayt || 2;
    }
    if (!tip.iki) {
      const kod = [];
      for (let i = 0; i < 256; i++) kod[i] = CP1252[i] || String.fromCharCode(i);
      const enc = al(belge, f.Encoding);
      if (enc && enc.Differences) {
        let k = 0;
        enc.Differences.forEach(function (x) {
          if (typeof x === 'number') k = x;
          else if (x && x.ad !== undefined) { kod[k] = glifCoz(x.ad) || kod[k]; k++; }
        });
      }
      tip.kodlama = kod;
    }
    return tip;
  }

  /* Kodları metne çevirir; genişlik 1/1000 yazı birimi cinsinden toplam ilerlemedir */
  function yaziCoz(tip, s) {
    if (!tip) return { metin: s, genislik: s.length * 500, adet: s.length, bosluk: (s.match(/ /g) || []).length };
    let o = '', g = 0, adet = 0, bosluk = 0;
    const n = tip.bayt;
    for (let i = 0; i + n <= s.length; i += n) {
      let k = 0;
      for (let j = 0; j < n; j++) k = k * 256 + s.charCodeAt(i + j);
      let c = '';
      if (tip.harita && tip.harita.has(k)) c = tip.harita.get(k);
      else if (tip.kodlama) c = tip.kodlama[k] || '';
      o += c;
      const w = tip.genislik.get(k);
      g += typeof w === 'number' ? w : tip.varsayilan;
      adet++;
      if (n === 1 && k === 32) bosluk++;
    }
    return { metin: o, genislik: g, adet: adet, bosluk: bosluk };
  }

  /* ---------------- Sayfalar ---------------- */

  function sayfalar(belge) {
    const l = [];
    let kok = null;
    for (const n of belge.nesneler.values()) {
      const d = n.ham ? n.sozluk : n.deger;
      if (d && d.Type && d.Type.ad === 'Catalog') { kok = d; break; }
    }
    function gez(ref, miras, derinlik) {
      if (derinlik > 30) return;
      const d = al(belge, ref);
      if (!d) return;
      const kaynak = d.Resources !== undefined ? d.Resources : miras;
      if (d.Type && d.Type.ad === 'Pages') (al(belge, d.Kids) || []).forEach(function (k) { gez(k, kaynak, derinlik + 1); });
      else l.push({ sozluk: d, kaynak: kaynak });
    }
    if (kok && kok.Pages) gez(kok.Pages, null, 0);
    if (!l.length) {
      Array.from(belge.nesneler.keys()).sort(function (a, b) { return a - b; }).forEach(function (no) {
        const n = belge.nesneler.get(no), d = n.ham ? n.sozluk : n.deger;
        if (d && d.Type && d.Type.ad === 'Page') l.push({ sozluk: d, kaynak: d.Resources });
      });
    }
    return l;
  }

  async function sayfaMetni(belge, sayfa) {
    const kaynak = al(belge, sayfa.kaynak) || {};
    const fontlar = al(belge, kaynak.Font) || {};
    const tipler = {};
    for (const ad of Object.keys(fontlar)) tipler[ad] = await yaziTipi(belge, fontlar[ad]);
    let icerik = sayfa.sozluk.Contents;
    if (icerik && icerik.ref !== undefined) {
      const n = belge.nesneler.get(icerik.ref);
      if (n && !n.ham && Array.isArray(n.deger)) icerik = n.deger;
    }
    if (!Array.isArray(icerik)) icerik = icerik ? [icerik] : [];
    let akis = '';
    for (const c of icerik) if (c && c.ref !== undefined) akis += latin1(await akisCoz(belge, c.ref)) + '\n';

    const satirlar = [];
    let satir = '', tip = null, boyut = 10, olcek = 1, x = 0, y = 0, satirX = 0, satirY = 0, TL = 0, Tc = 0, Tw = 0;
    let sonY = null, ucX = null;
    function goster(ham) {
      const r = yaziCoz(tip, ham);
      const e = boyut * olcek;
      const ilerleme = (r.genislik / 1000 * boyut + r.adet * Tc + r.bosluk * Tw) * olcek;
      if (r.metin) {
        if (sonY !== null && Math.abs(y - sonY) > Math.max(1, e * 0.5)) { satirlar.push(satir); satir = ''; ucX = null; }
        else if (ucX !== null && x - ucX > e * 0.15 && satir && !/\s$/.test(satir) && !/^\s/.test(r.metin)) satir += ' ';
        satir += r.metin;
        sonY = y;
      }
      x += ilerleme;
      ucX = x;
    }
    function sonrakiSatir() { satirY -= (TL || boyut) * olcek; x = satirX; y = satirY; }
    const yigin = [];
    let p = 0;
    while (p < akis.length) {
      p = bosAtla(akis, p);
      if (p >= akis.length) break;
      const v = deger(akis, p);
      if (v[1] <= p) { p++; continue; }
      p = v[1];
      const o = v[0];
      if (!o || o.op === undefined) { yigin.push(o); continue; }
      const op = o.op, a = yigin.splice(0);
      if (op === 'BI') { const e = akis.indexOf('EI', p); p = e < 0 ? akis.length : e + 2; continue; }
      if (op === 'BT') { x = y = satirX = satirY = 0; olcek = 1; }
      else if (op === 'Tf') { tip = tipler[a[0] && a[0].ad] || null; boyut = Math.abs(a[1]) || boyut; }
      else if (op === 'Tm') { olcek = Math.hypot(a[0] || 0, a[1] || 0) || 1; x = satirX = a[4] || 0; y = satirY = a[5] || 0; }
      else if (op === 'Td' || op === 'TD') {
        if (op === 'TD') TL = -(a[1] || 0);
        satirX += (a[0] || 0) * olcek; satirY += (a[1] || 0) * olcek; x = satirX; y = satirY;
      }
      else if (op === 'TL') TL = a[0] || 0;
      else if (op === 'Tc') Tc = a[0] || 0;
      else if (op === 'Tw') Tw = a[0] || 0;
      else if (op === 'T*') sonrakiSatir();
      else if (op === 'Tj') { if (a[0] && a[0].yazi !== undefined) goster(a[0].yazi); }
      else if (op === "'") { sonrakiSatir(); if (a[0] && a[0].yazi !== undefined) goster(a[0].yazi); }
      else if (op === '"') { Tw = a[0] || 0; Tc = a[1] || 0; sonrakiSatir(); if (a[2] && a[2].yazi !== undefined) goster(a[2].yazi); }
      else if (op === 'TJ') {
        (Array.isArray(a[0]) ? a[0] : []).forEach(function (e) {
          if (typeof e === 'number') { x -= e / 1000 * boyut * olcek; }
          else if (e && e.yazi !== undefined) goster(e.yazi);
        });
      }
    }
    satirlar.push(satir);
    return satirlar.map(function (l) { return l.replace(/[  ]+/g, ' ').replace(/\s+$/, ''); }).filter(function (l) { return l.trim(); }).join('\n');
  }

  /* PDF baytlarından metin: { metin, sayfaSayisi } */
  async function metin(bayt) {
    bayt = bayt instanceof Uint8Array ? bayt : new Uint8Array(bayt);
    const belge = await belgeOku(bayt);
    const l = sayfalar(belge);
    const parcalar = [];
    for (const s of l) parcalar.push(await sayfaMetni(belge, s));
    return { metin: parcalar.join('\n').replace(/\u0000/g, ''), sayfaSayisi: l.length };
  }

  kok.PdfMetin = { metin: metin, _ic: { deger: deger, cmapCoz: cmapCoz } };
})(typeof window !== 'undefined' ? window : this);
