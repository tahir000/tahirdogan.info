/* Fotoğraf ve taranmış CV'ler için OCR (Tesseract, tesseract.js 6.0.1; Türkçe + İngilizce, yalnız LSTM).
   Kitaplık, motor ve dil verisi bu sitenin ocr/ klasöründen yüklenir; dışarıya bağlantı kurulmaz, görüntüler bu bilgisayarda okunur.
   Ocr.oku(goruntu) -> Promise<metin> ; goruntu: {tur:'dosya', veri, ad} | {tur:'jpeg', veri} | {tur:'ham', w, h, kanal, veri} */
(function () {
  'use strict';
  const kok = new URL('ocr/', document.currentScript ? document.currentScript.src : location.href).href;
  let isci = null, hazirlaniyor = null;

  function hazirla(durum) {
    if (isci) return Promise.resolve(isci);
    if (hazirlaniyor) return hazirlaniyor;
    if (!globalThis.Tesseract) return Promise.reject(new Error('OCR kitaplığı yüklenemedi'));
    hazirlaniyor = globalThis.Tesseract.createWorker(['tur', 'eng'], 1, {
      workerPath: kok + 'worker.min.js', corePath: kok, langPath: kok, gzip: true, workerBlobURL: false,
      logger: m => { if (durum && m && m.status && /loading|initializ/i.test(m.status)) durum(m); }
    }).then(w => { isci = w; return w; }, e => { hazirlaniyor = null; throw e; });
    return hazirlaniyor;
  }

  // Görüntüyü tuvale çizer: telefon fotoğrafının yönü düzeltilir, çok büyükse küçültülür, küçükse büyütülür
  async function tuval(g) {
    let kaynak, w, h;
    if (g.tur === 'ham') {
      const id = new ImageData(g.w, g.h); const d = id.data;
      for (let i = 0, j = 0; i < g.w * g.h; i++, j += g.kanal) { const r = g.veri[j], gg = g.kanal === 3 ? g.veri[j + 1] : r, b = g.kanal === 3 ? g.veri[j + 2] : r; d[i * 4] = r; d[i * 4 + 1] = gg; d[i * 4 + 2] = b; d[i * 4 + 3] = 255; }
      kaynak = await createImageBitmap(id); w = g.w; h = g.h;
    } else {
      const tur = g.tur === 'jpeg' || /\.jpe?g$/i.test(g.ad || '') ? 'image/jpeg' : /\.png$/i.test(g.ad || '') ? 'image/png' : '';
      kaynak = await createImageBitmap(new Blob([g.veri], tur ? { type: tur } : {}), { imageOrientation: 'from-image' });
      w = kaynak.width; h = kaynak.height;
    }
    const uzun = Math.max(w, h); const olcek = uzun > 3000 ? 3000 / uzun : uzun < 1200 ? 1600 / uzun : 1;
    const c = document.createElement('canvas'); c.width = Math.round(w * olcek); c.height = Math.round(h * olcek);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(kaynak, 0, 0, c.width, c.height);
    if (kaynak.close) kaynak.close();
    return c;
  }

  async function oku(g) {
    const w = await hazirla();
    const c = await tuval(g);
    const r = await w.recognize(c);
    return (r && r.data && r.data.text) || '';
  }

  async function kapat() { if (isci) { const w = isci; isci = null; hazirlaniyor = null; await w.terminate(); } }

  globalThis.Ocr = { hazirla, oku, kapat };
})();
