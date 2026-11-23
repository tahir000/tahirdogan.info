/* Seçilen dosyaları açar: zip (iç içe dahil), .eml (iletilmiş mailin içindeki mail dahil) ve doğrudan CV dosyaları.
   Tarama.calistir([{ad, yol, veri:Uint8Array}], ilerleme) -> { kayitlar, ekler: Map(kimlik -> {ad, veri}), sayac, okunamayan } */
(function () {
  'use strict';
  const Z = globalThis.Zip, E = globalThis.Eml, B = globalThis.Belge;
  const MIN_EK = 800; // bu boyutun altındaki ekler imza görseli ya da izleme pikseli

  const uz = ad => ((ad.match(/\.[^.]+$/) || [''])[0]).toLowerCase();
  const taban = ad => ad.split(/[\\/]/).pop();
  function ozet(u) { // içerik özeti (tekilleştirme için), FNV-1a 2x32
    let h1 = 0x811c9dc5, h2 = 0x01000193 ^ u.length;
    for (let i = 0; i < u.length; i++) { h1 = Math.imul(h1 ^ u[i], 0x01000193); h2 = Math.imul(h2 ^ u[i], 0x5bd1e995); }
    return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16) + ':' + u.length;
  }
  function zipAc(u, yol, derinlik, cikti) {
    let z; try { z = Z.unzip(u); } catch (e) { return false; }
    for (const ad of z.adlar) {
      if (ad.endsWith('/') || /(^|\/)__MACOSX\//.test(ad) || /(^|\/)\.[^/]*$/.test(ad)) continue;
      let veri; try { veri = z.al(ad); } catch (e) { continue; }
      if (!veri) continue;
      if (uz(ad) === '.zip' && derinlik < 4) { if (zipAc(veri, yol + '/' + ad, derinlik + 1, cikti)) continue; }
      cikti.push({ ad: taban(ad), yol: yol + '/' + ad, veri });
    }
    return true;
  }
  const bekle = () => new Promise(r => setTimeout(r, 0));

  async function calistir(dosyalar, ilerleme) {
    ilerleme = ilerleme || (() => {});
    // 1. zip'leri aç, .eml ve doğrudan CV'leri ayır
    const duz = [];
    for (const d of dosyalar) {
      if (uz(d.ad) === '.zip') { if (!zipAc(d.veri, d.yol || d.ad, 0, duz)) duz.push(d); }
      else duz.push(d);
    }
    const emller = duz.filter(d => uz(d.ad) === '.eml');
    const dogrudan = duz.filter(d => uz(d.ad) !== '.eml');
    const gorulen = new Set(), tekil = [];
    for (const d of emller) { const h = ozet(d.veri); if (gorulen.has(h)) continue; gorulen.add(h); tekil.push(d); }

    const ekler = new Map(); let kimlikNo = 0;
    const sayac = { girdi: dosyalar.length, mail: emller.length, tekilMail: tekil.length, ek: 0, dogrudan: dogrudan.length, okunan: 0 };
    const okunamayan = [];
    const toplam = tekil.length + dogrudan.length; let yapilan = 0;

    async function ekIsle(ad, veri, kaynak) {
      const kimlik = 'e' + (kimlikNo++);
      ekler.set(kimlik, { ad, veri });
      const r = B.metin(ad, veri);
      if (r.durum === 'tamam' && r.metin.trim().length >= 100) sayac.okunan++;
      else okunamayan.push({ ad, kaynak, durum: r.durum === 'tamam' ? 'metinsiz' : r.durum });
      return { ad, boy: veri.length, metin: (r.metin || '').trim(), durum: r.durum, kimlik };
    }

    const kayitlar = [];
    for (const d of tekil) {
      let m; try { m = E.oku(d.veri); } catch (e) { okunamayan.push({ ad: d.ad, kaynak: d.yol || d.ad, durum: 'hata' }); yapilan++; continue; }
      const kayit = { idx: kayitlar.length, dosya: d.ad, konu: m.konu, kimden: m.kimden, tarih: m.tarih, govde: m.govde, icMailler: m.icMailler, ekler: [] };
      const liste = [];
      for (const a of m.ekler) {
        if (!a.veri || a.veri.length < MIN_EK) continue;
        if (uz(a.ad) === '.zip') { const ic = []; if (zipAc(a.veri, a.ad, 1, ic)) { liste.push(...ic.filter(x => x.veri.length >= MIN_EK)); continue; } }
        liste.push({ ad: a.ad, veri: a.veri });
      }
      for (const a of liste) { sayac.ek++; kayit.ekler.push(await ekIsle(a.ad, a.veri, d.ad)); }
      kayitlar.push(kayit);
      yapilan++; ilerleme(yapilan, toplam, d.ad); await bekle();
    }
    for (const d of dogrudan) {
      if (d.veri.length < MIN_EK) { yapilan++; continue; }
      const klasor = (d.yol || '').split(/[\\/]/).slice(0, -1).join(' ');
      const kayit = { idx: kayitlar.length, dosya: d.ad, konu: klasor, kimden: '', tarih: '', govde: '', icMailler: [], ekler: [] };
      sayac.ek++; kayit.ekler.push(await ekIsle(d.ad, d.veri, d.yol || d.ad));
      kayitlar.push(kayit);
      yapilan++; ilerleme(yapilan, toplam, d.ad); await bekle();
    }
    return { kayitlar, ekler, sayac, okunamayan };
  }

  globalThis.Tarama = { calistir };
})();
