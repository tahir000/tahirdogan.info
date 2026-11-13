/*
 * Bilirkişi Raporuna Beyan: ortak yardımcılar
 * Metin karşılaştırma, tarih ve harf işlemleri. Tarayıcıda çalışır.
 */
(function (kok) {
  'use strict';

  const KATLA = {
    'ç': 'C', 'Ç': 'C', 'ğ': 'G', 'Ğ': 'G', 'ı': 'I', 'İ': 'I', 'i': 'I', 'ö': 'O', 'Ö': 'O',
    'ş': 'S', 'Ş': 'S', 'ü': 'U', 'Ü': 'U', 'â': 'A', 'Â': 'A', 'î': 'I', 'Î': 'I', 'û': 'U', 'Û': 'U'
  };
  const HARF = /[0-9A-Za-zÇĞİÖŞÜçğıöşüÂÎÛâîû]/;

  /* Karşılaştırma için: Türkçe harfler sadeleşir, büyük harfe çevrilir.
     Uzunluk değişmez; böylece katlanmış metindeki konumlar asıl metinle aynıdır. */
  function katla(s) {
    s = String(s === null || s === undefined ? '' : s);
    let o = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i], k = KATLA[c];
      if (k) { o += k; continue; }
      const u = c.toUpperCase();
      o += u.length === 1 ? u : c;
    }
    return o;
  }

  function buyukHarf(s) { return String(s).toLocaleUpperCase('tr-TR'); }

  /* En az iki harfi olan ve hepsi büyük harf olan metin */
  function buyukMu(s) {
    const h = String(s).replace(/[^A-Za-zÇĞİÖŞÜçğıöşüÂÎÛâîû]/g, '');
    return h.length >= 2 && h === buyukHarf(h);
  }

  function iki(n) { return n < 10 ? '0' + n : String(n); }
  function bugun(d) { d = d || new Date(); return iki(d.getDate()) + '.' + iki(d.getMonth() + 1) + '.' + d.getFullYear(); }

  /* "4/8/2026" > "04.08.2026" */
  function tarihNorm(s) {
    const m = /(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/.exec(s || '');
    return m ? iki(+m[1]) + '.' + iki(+m[2]) + '.' + m[3] : '';
  }

  /* Tarihi örnekteki ayraçla yazar: örnek "05/11/2025" ise "04/08/2026" */
  function tarihBicimle(tarih, ornek) {
    const t = tarihNorm(tarih);
    if (!t) return tarih;
    return /\d\/\d/.test(ornek || '') ? t.replace(/\./g, '/') : t;
  }

  function rakamlar(s) { return String(s || '').replace(/\D/g, ''); }
  function sade(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
  function sinirMi(c) { return !c || !HARF.test(c); }

  /* Metinde bir değerin geçtiği yerler; sinirli ise önü ve arkası harf ya da rakam olmayanlar */
  function hepsiniBul(T, aranan, sinirli) {
    const l = [];
    if (!aranan) return l;
    let i = T.indexOf(aranan);
    while (i !== -1) {
      if (!sinirli || (sinirMi(T[i - 1]) && sinirMi(T[i + aranan.length]))) l.push(i);
      i = T.indexOf(aranan, i + aranan.length);
    }
    return l;
  }

  /* Bir konumun çevresinden tek satırlık kısa alıntı */
  function alinti(T, bas, son, pay) {
    pay = pay || 60;
    let a = Math.max(0, bas - pay), b = Math.min(T.length, son + pay);
    while (a > 0 && HARF.test(T[a - 1])) a--;
    while (b < T.length && HARF.test(T[b])) b++;
    return (a > 0 ? '…' : '') + sade(T.slice(a, b)) + (b < T.length ? '…' : '');
  }

  /* XML'de bulunamayacak denetim karakterleri silinir, satır sonları \n olur */
  function temizMetin(s) {
    return String(s === null || s === undefined ? '' : s).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '');
  }

  /* İcra dairesi adının önündeki "Borçlunun", "aleyhine" gibi kelime ad sayılmaz */
  const DAIRE_DISI = /^(DAVAL|BORCLU|DAVACI|HAKKIN|MUVEKKIL|ALACAKLI|ALEYH|TARAFIN|DOSYA|SAYILI|OLAN|ILE|VE|DE|DA)/;
  function daireBasi(T, K, bas, ilkKelime, ikinciKelime) {
    let kelimeBas = bas, kelime = ilkKelime;
    if (ikinciKelime !== undefined && (DAIRE_DISI.test(ilkKelime) || !/[A-ZÇĞİÖŞÜ]/.test(T[bas]) || /[-–]/.test(T[bas - 1] || ''))) {
      kelimeBas = bas + K.slice(bas).indexOf(ikinciKelime, ilkKelime.length);
      kelime = ikinciKelime;
    }
    /* Boşluksuz yapışmış kelime ("Borçlununİstanbul"): küçük harften sonra gelen büyük harften başlar */
    for (let k = kelimeBas + kelime.length - 1; k > kelimeBas; k--) {
      if (/[a-zçğıöşüâîû]/.test(T[k - 1]) && /[A-ZÇĞİÖŞÜÂÎÛ]/.test(T[k])) return k;
    }
    return kelimeBas;
  }

  /* Tırnak içindeki bölgeler (içtihat ve kanun alıntıları): [[bas, son], ...] */
  function tirnakAraliklari(T) {
    const l = [];
    const re = /“[^”]{0,4000}”|"[^"]{0,4000}"|''[\s\S]{0,4000}?''/g;
    let m;
    while ((m = re.exec(T)) !== null) l.push([m.index, m.index + m[0].length]);
    return l;
  }

  kok.BkOrtak = {
    katla: katla, buyukHarf: buyukHarf, buyukMu: buyukMu, bugun: bugun, tarihNorm: tarihNorm,
    tarihBicimle: tarihBicimle, rakamlar: rakamlar, sade: sade, sinirMi: sinirMi, hepsiniBul: hepsiniBul,
    alinti: alinti, temizMetin: temizMetin, daireBasi: daireBasi, tirnakAraliklari: tirnakAraliklari
  };
})(typeof window !== 'undefined' ? window : this);
