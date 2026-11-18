/*
 * MERSİS Şirket Sorgulama: MERSİS Takip yer imi
 *
 * Aşağıdaki mersisTakip işlevi araç sayfasında yer imine (bookmarklet)
 * dönüştürülür ve MERSİS'in Firma Sorgulama sayfasında çalışır:
 *  - araçtan kopyalanan sorgu listesini alır,
 *  - sıradaki şirketin vergi numarasını (ya da ünvanını) forma yazar ve
 *    imleci güvenlik kodu kutusuna koyar,
 *  - kullanıcı kodu yazıp Enter'a basınca sonucu açar, firma bilgilerini ve
 *    konkordato/iflas bilgisini okur, sıradakine geçer.
 * Güvenlik kodunu kullanıcı girer; yer imi kodu çözmez ve sorgu göndermez.
 * Sonuçlar bu tarayıcının hafızasında (MERSİS sitesine ait localStorage)
 * saklanır; çıkış yapıp başka bir e-Devlet hesabıyla girildiğinde yer imine
 * yeniden tıklamak yeterlidir, kaldığı yerden sürer.
 * İşlev tek başına çalışır: dışarıdaki hiçbir değişkene ya da dosyaya dayanmaz.
 */
(function (kok) {
  'use strict';

  function mersisTakip() {
    'use strict';
    var ANAHTAR = 'mersisTakip.v1';
    var SAYFA_YOLU = '/Common/FirmaSorgulamaIslemleri/FirmaSorgulama';
    var MERSIS_ADRESI = 'https://mersis.ticaret.gov.tr' + SAYFA_YOLU;
    if (window.__mersisTakip && window.__mersisTakip.goster) { window.__mersisTakip.goster(); return; }

    /* ---------- Durum ---------- */
    var D = yukle() || {};
    var calisiyor = false, nesil = 0, sayfaSorgu = 0, taban = '', tabanUyari = '', sonUyari = '', onayBekleyen = null;
    /* Her başlatılan döngü bir kuşak numarası alır; duraklatma ya da atlamada eski döngü kendiliğinden biter */
    function surmeli(n) { return calisiyor && n === nesil; }

    function yukle() { try { return JSON.parse(localStorage.getItem(ANAHTAR) || 'null'); } catch (e) { return null; } }
    function kaydet() {
      try { localStorage.setItem(ANAHTAR, JSON.stringify(D)); }
      catch (e) { uyar('Sonuç tarayıcı hafızasına yazılamadı: ' + e.message + '. Hemen "Sonuçları kopyala" ile alın.'); }
    }

    /* ---------- Yardımcılar ---------- */
    function $(id) { return document.getElementById(id); }
    function bekle(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function bosluk(x) { return String(x == null ? '' : x).replace(/\s+/g, ' ').trim(); }
    function satirlar(m) { return String(m || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean); }
    function kisa(m) { m = bosluk(m); return m.length > 160 ? m.slice(0, 157) + '…' : m; }
    function sade(x) {
      return String(x == null ? '' : x).toLocaleUpperCase('tr-TR')
        .replace(/İ/g, 'I').replace(/Ş/g, 'S').replace(/Ğ/g, 'G').replace(/Ü/g, 'U')
        .replace(/Ö/g, 'O').replace(/Ç/g, 'C').replace(/Â/g, 'A').replace(/Î/g, 'I').replace(/Û/g, 'U')
        .replace(/[^A-Z0-9]+/g, ' ').trim();
    }
    var DOLGU = ('VE LIMITED LTD SIRKETI SIRKET STI ANONIM AS A S SANAYI SAN TICARET TIC IC DIS ITHALAT IHRACAT ITH IHR PAZARLAMA PAZ TURIZM INSAAT VB').split(' ');
    /* mersis.js'teki benzerlik ile aynı kurallar (yer imi tek başına çalıştığı için burada da var) */
    function sozcukler(x) {
      return sade(x).split(' ').filter(function (w) { return w.length >= 2 && DOLGU.indexOf(w) < 0 && !(w.indexOf('VE') === 0 && DOLGU.indexOf(w.slice(2)) >= 0); });
    }
    function tekHarfFarki(x, y) {
      if (Math.min(x.length, y.length) < 5 || Math.abs(x.length - y.length) > 1) return false;
      var i = 0;
      while (i < x.length && i < y.length && x[i] === y[i]) i++;
      if (x.length === y.length) {
        if (x.slice(i + 1) === y.slice(i + 1)) return true;
        return x[i] === y[i + 1] && x[i + 1] === y[i] && x.slice(i + 2) === y.slice(i + 2);
      }
      return x.length > y.length ? x.slice(i + 1) === y.slice(i) : x.slice(i) === y.slice(i + 1);
    }
    function benzerlik(a, b) {
      var A = sozcukler(a), B = sozcukler(b);
      if (!A.length || !B.length) return 1;
      var kul = B.map(function () { return false; }), es = 0;
      A.forEach(function (x) {
        for (var j = 0; j < B.length; j++) {
          if (kul[j]) continue;
          var y = B[j];
          if (x === y || (Math.min(x.length, y.length) >= 3 && (x.indexOf(y) === 0 || y.indexOf(x) === 0)) || tekHarfFarki(x, y)) { kul[j] = true; es++; return; }
        }
      });
      return es / (A.length + B.length - es);
    }

    function sayfaUygun() { return !!($('VergiNo') && $('divFirmaAraResult') && $('Captcha')); }
    function sonucAlani() { return $('divFirmaAraResult'); }
    function liste() { return D.liste || null; }
    function aktifOge() { return liste() ? liste().ogeler[D.idx] || null : null; }
    function bitenSayisi() { return (D.sonuclar || []).length; }
    function toplam() { return liste() ? liste().toplam : 0; }

    /* Sayfadaki görünür hata ve uyarı kutularının metni (güvenlik kodu hatası gibi) */
    function uyariMetni() {
      var sec = '.modal.in, .modal.show, .bootbox, .swal2-popup, .sweet-alert, .toast, .alert-danger, .alert-warning, .validation-summary-errors, .field-validation-error';
      return Array.prototype.filter.call(document.querySelectorAll(sec), function (e) { return e.offsetParent !== null && !panel.contains(e); })
        .map(function (e) { return bosluk(e.innerText); }).filter(Boolean).join(' | ');
    }

    /* ---------- Panel ---------- */
    var panel = document.createElement('div');
    panel.id = 'mersis-takip-panel';
    panel.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;';
    var golge = panel.attachShadow({ mode: 'open' });
    golge.innerHTML =
      '<style>' +
      ':host{all:initial}' +
      '.k{width:370px;max-width:calc(100vw - 24px);background:#fff;color:#1c2433;border:1px solid #c9d3df;border-radius:12px;box-shadow:0 8px 28px rgba(16,36,64,.28);font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;overflow:hidden}' +
      '.u{display:flex;align-items:center;gap:8px;background:#1f4e79;color:#fff;padding:9px 12px}' +
      '.u b{flex:1;font-size:14.5px}.u button{background:transparent;border:0;color:#fff;font:inherit;font-size:18px;line-height:1;cursor:pointer;padding:0 4px;opacity:.85}.u button:hover{opacity:1}' +
      '.g{padding:12px 14px}.gizli{display:none!important}' +
      '.kisi{color:#5a6578;font-size:12.5px;margin:-2px 0 8px}' +
      '.bar{height:8px;background:#e7eff8;border-radius:5px;overflow:hidden}.bar i{display:block;height:100%;background:#1f4e79;width:0}' +
      '.say{display:flex;justify-content:space-between;font-size:12.5px;color:#5a6578;margin:4px 0 10px}' +
      '.sira{background:#f4f7fb;border:1px solid #dce2ea;border-radius:8px;padding:8px 10px;margin-bottom:8px}.sira small{display:block;color:#5a6578;font-size:12px}.sira strong{word-break:break-word}' +
      '.yon{font-weight:600;color:#1f4e79;margin:6px 0}.yon.iyi{color:#1d7246}' +
      '.uy{background:#fdf2dc;color:#5d4200;border-radius:7px;padding:7px 9px;margin:8px 0;font-size:13px}.uy.hata{background:#fbe8e6;color:#8c1d16}' +
      '.son{margin:8px 0 0;padding:0;list-style:none;font-size:12.5px;max-height:120px;overflow:auto}.son li{padding:3px 0;border-top:1px solid #eef1f5;word-break:break-word}.son li span{font-weight:600}' +
      '.d{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}' +
      'button.b{font:inherit;font-size:13px;border-radius:7px;border:1px solid #c3ccd8;background:#fff;color:#1c2433;padding:6px 11px;cursor:pointer}button.b:hover{border-color:#1f4e79}' +
      'button.b.ana{background:#1f4e79;border-color:#1f4e79;color:#fff;font-weight:600}button.b.ana:hover{background:#173b5c}' +
      'button.b:disabled{opacity:.45;cursor:default}' +
      'textarea{width:100%;box-sizing:border-box;min-height:80px;font:12px/1.35 Consolas,monospace;border:1px solid #c3ccd8;border-radius:7px;padding:6px;margin:6px 0}' +
      '.alt{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:10px;padding-top:8px;border-top:1px solid #eef1f5;font-size:12px;color:#5a6578}' +
      '.alt button{background:none;border:0;color:#1f4e79;text-decoration:underline;font:inherit;font-size:12px;cursor:pointer;padding:0}' +
      'a{color:#1f4e79}' +
      '</style>' +
      '<div class="k">' +
      ' <div class="u"><b>MERSİS Takip</b><button data-i="kucult" title="Küçült">–</button><button data-i="kapat" title="Kapat">×</button></div>' +
      ' <div class="g" data-r="govde">' +
      '  <div class="kisi" data-r="kisi"></div>' +
      '  <div data-r="ilerleme"><div class="bar"><i data-r="bar"></i></div><div class="say"><span data-r="sayi"></span><span data-r="dagilim"></span></div></div>' +
      '  <div class="sira" data-r="sira"><small data-r="siraEtiket">Sıradaki şirket</small><strong data-r="siraAd"></strong><small data-r="siraNo"></small></div>' +
      '  <div class="yon" data-r="yon"></div>' +
      '  <div class="uy gizli" data-r="uyari"></div>' +
      '  <div class="d" data-r="dugmeler">' +
      '   <button class="b" data-i="durdur">Duraklat</button>' +
      '   <button class="b" data-i="atla" title="Bu şirketi sorgulamadan geç">Bu şirketi atla</button>' +
      '   <button class="b ana" data-i="kopyala">Sonuçları kopyala</button>' +
      '  </div>' +
      '  <div class="gizli" data-r="kopyaKutu"><div class="uy">Pano kullanılamadı. Aşağıdaki metni seçip Ctrl+C ile kopyalayın ve araca yapıştırın.</div><textarea readonly data-r="kopyaMetin"></textarea></div>' +
      '  <div class="gizli" data-r="listeKutu">' +
      '   <div>Araçta <b>"Sorgu listesini kopyala"</b> düğmesine basın, sonra listeyi buraya yapıştırın:</div>' +
      '   <textarea data-r="listeMetin" placeholder="Sorgu listesini buraya yapıştırın (Ctrl+V)"></textarea>' +
      '   <div class="d" style="margin-top:4px"><button class="b ana" data-i="yukle">Listeyi yükle</button><button class="b" data-i="panodan">Panodan yapıştır</button><button class="b gizli" data-i="listeVazgec">Vazgeç</button></div>' +
      '  </div>' +
      '  <div class="uy gizli" data-r="onay"><div data-r="onayMetin"></div><div class="d"><button class="b ana" data-i="onayEvet">Evet</button><button class="b" data-i="onayHayir">Vazgeç</button></div></div>' +
      '  <ul class="son" data-r="son"></ul>' +
      '  <div class="alt"><span data-r="oturum"></span><span><button data-i="listeDegistir">Listeyi değiştir</button> · <button data-i="sifirla">Sıfırla</button></span></div>' +
      ' </div>' +
      '</div>';
    (document.body || document.documentElement).appendChild(panel);
    function el(ad) { return golge.querySelector('[data-r="' + ad + '"]'); }
    function dugme(ad) { return golge.querySelector('[data-i="' + ad + '"]'); }
    function goster(ad, evet) { el(ad).classList.toggle('gizli', !evet); }

    function uyar(m, hata) {
      sonUyari = m || '';
      var u = el('uyari');
      u.textContent = sonUyari;
      u.classList.toggle('hata', !!hata);
      goster('uyari', !!sonUyari);
    }
    function yon(m, iyi) { var y = el('yon'); y.textContent = m || ''; y.classList.toggle('iyi', !!iyi); }

    var DURUM_KISA = { OK: '', YOK: 'Bulunamadı', COKLU: 'Birden çok sonuç', BELIRSIZ: 'Sonuç alınamadı', ATLANDI: 'Atlandı' };
    function sonucSatiri(s) {
      if (s.sorgu === 'OK') {
        var t = s.durum || '?';
        if (s.konk && !s.konk.yok) t += s.konk.okunamadi ? ' · konkordato okunamadı' : ' · KONKORDATO/İFLAS';
        return t;
      }
      return DURUM_KISA[s.sorgu] || s.sorgu;
    }

    function ciz() {
      var l = liste();
      el('kisi').textContent = l ? ((l.kisi ? l.kisi + ' · ' : '') + (l.dosya || '')) : '';
      var b = bitenSayisi(), t = toplam();
      goster('ilerleme', !!l);
      el('bar').style.width = t ? Math.round(100 * b / t) + '%' : '0';
      el('sayi').textContent = t ? b + ' / ' + t + ' tamam' : '';
      var say = {};
      (D.sonuclar || []).forEach(function (s) { var k = s.sorgu === 'OK' ? (s.konk && !s.konk.yok && !s.konk.okunamadi ? 'Konkordato' : s.durum || '?') : (DURUM_KISA[s.sorgu] || s.sorgu); say[k] = (say[k] || 0) + 1; });
      el('dagilim').textContent = Object.keys(say).map(function (k) { return k + ' ' + say[k]; }).join(' · ');
      var o = aktifOge();
      goster('sira', !!o);
      if (o) {
        el('siraAd').textContent = o.n || '(ünvan yok)';
        el('siraNo').textContent = 'Satır ' + o.r + ' · ' + (o.a === 'vkn' ? 'Vergi no ' + o.v : 'Ünvanla aranıyor (vergi no yok ya da geçersiz)');
      }
      var son = el('son');
      son.innerHTML = '';
      (D.sonuclar || []).slice(-5).reverse().forEach(function (s) {
        var li = document.createElement('li');
        var sp = document.createElement('span');
        sp.textContent = sonucSatiri(s);
        li.appendChild(sp);
        li.appendChild(document.createTextNode(' – ' + (s.n || '') + ' (satır ' + s.r + ')'));
        son.appendChild(li);
      });
      el('oturum').textContent = 'Bu sayfada yapılan sorgu: ' + sayfaSorgu;
      dugme('durdur').textContent = calisiyor ? 'Duraklat' : 'Devam et';
      dugme('durdur').disabled = !o || !sayfaUygun();
      dugme('atla').disabled = !o;
      dugme('kopyala').disabled = !b;
      if (!l) {
        goster('listeKutu', true);
        dugme('listeVazgec').classList.add('gizli');
        yon('Sorgu listesini yükleyin.');
      } else if (!o) {
        yon('Tüm sorgular bitti. "Sonuçları kopyala" ile alıp araca yapıştırın.', true);
      } else if (!sayfaUygun()) {
        yon('Bu sayfa Firma Sorgulama sayfası değil.');
      } else if (calisiyor) {
        yon('Güvenlik kodunu yazıp Enter\'a basın.');
      } else {
        yon('Duraklatıldı. Sürdürmek için "Devam et".');
      }
      if (sayfaSorgu >= 45 && o) uyar('Bu oturumda ' + sayfaSorgu + ' sorgu yapıldı. MERSİS kişi başı yaklaşık 50 sorguya izin veriyor; sınır dolunca çıkış yapıp başka bir e-Devlet hesabıyla girin ve yer imine yeniden tıklayın. Sonuçlar kaybolmaz.');
    }

    function onayla(metin, fn) {
      onayBekleyen = fn;
      el('onayMetin').textContent = metin;
      goster('onay', true);
    }

    /* ---------- Liste ---------- */
    function listeYukle(metin) {
      var o;
      try {
        var m = String(metin || '').trim();
        o = JSON.parse(m.slice(m.indexOf('{'), m.lastIndexOf('}') + 1));
      } catch (e) { uyar('Yapıştırılan metin okunamadı. Araçta "Sorgu listesini kopyala"ya yeniden basıp yapıştırın.', true); return; }
      if (!o || o.tur !== 'mersis-liste' || !Array.isArray(o.ogeler)) {
        uyar(o && o.tur === 'mersis-sonuc' ? 'Bu metin sonuç listesi; sorgu listesi değil.' : 'Bu metin bir MERSİS sorgu listesi değil.', true);
        return;
      }
      if (!o.ogeler.length) { uyar('Listede sorgulanacak şirket yok.', true); return; }
      var uygula = function () {
        if (D.liste && D.liste.id === o.id) {
          uyar('Bu liste zaten yüklü; kaldığı yerden sürüyor.');
        } else {
          D = { liste: { id: o.id, kisi: o.kisi || '', dosya: o.dosya || '', ogeler: o.ogeler.slice(), toplam: o.ogeler.length }, idx: 0, sonuclar: [] };
          kaydet();
          uyar('');
        }
        el('listeMetin').value = '';
        goster('listeKutu', false);
        baslat();
      };
      if (D.liste && D.liste.id !== o.id && bitenSayisi() && aktifOge()) {
        onayla('Yüklü listede kopyalanmamış olabilecek ' + bitenSayisi() + ' sonuç var. Yeni liste yüklenince bunlar silinir. Önce "Sonuçları kopyala" ile aldıysanız devam edin.', uygula);
      } else uygula();
    }

    /* ---------- Sorgu döngüsü ---------- */
    function temizleVeHazirla(oge) {
      ['MersisNo', 'VergiNo', 'TamUnvan', 'SicilNo'].forEach(function (id) { var e = $(id); if (e) e.value = ''; });
      ['FirmaDurumuId', 'FirmaNeviGrubuId', 'FirmaNeviId', 'TSMId'].forEach(function (id) { var e = $(id); if (e && e.value) { e.value = ''; e.dispatchEvent(new Event('change', { bubbles: true })); } });
      var hedef = oge.a === 'vkn' ? $('VergiNo') : $('TamUnvan');
      if (hedef) {
        hedef.value = oge.a === 'vkn' ? oge.v : oge.n;
        hedef.dispatchEvent(new Event('input', { bubbles: true }));
        hedef.dispatchEvent(new Event('change', { bubbles: true }));
      }
      taban = sonucAlani() ? sonucAlani().innerText : '';
      tabanUyari = uyariMetni();
      var c = $('Captcha');
      if (c) { c.value = ''; try { c.focus({ preventScroll: false }); } catch (e) { c.focus(); } }
      try { window.scrollTo(0, 0); } catch (e) { /* önemsiz */ }
    }

    function baslat() {
      if (calisiyor || !aktifOge() || !sayfaUygun()) { ciz(); return; }
      calisiyor = true;
      dongu(++nesil);
    }
    function durdur() { calisiyor = false; nesil++; ciz(); }

    async function dongu(n) {
      ciz();
      while (surmeli(n)) {
        var oge = aktifOge();
        if (!oge || !sayfaUygun()) { calisiyor = false; break; }
        temizleVeHazirla(oge);
        ciz();
        var s = await sonucBekle(oge, n);
        if (!surmeli(n) || !s || aktifOge() !== oge) continue;
        sonucuKaydet(oge, s);
      }
      if (n === nesil) ciz();
    }

    function sonucuKaydet(oge, s) {
      s.r = oge.r; s.v = oge.v; s.n = oge.n; s.a = oge.a; s.zaman = new Date().toISOString();
      D.sonuclar = (D.sonuclar || []).filter(function (x) { return x.r !== oge.r; });
      D.sonuclar.push(s);
      D.idx++;
      kaydet();
      if (sonUyari && !/sorgu yapıldı/.test(sonUyari)) uyar('');
    }

    async function sonucBekle(oge, n) {
      var bekleyen = null, ayni = 0;
      while (surmeli(n) && aktifOge() === oge) {
        await bekle(400);
        var alan = sonucAlani();
        if (!alan) return null;
        var txt = alan.innerText;
        var adaylar = Array.prototype.slice.call(alan.querySelectorAll('.firmaItem'));

        /* Güvenlik kodu hatası: sonuç alanında ya da uyarı kutusunda */
        var u = uyariMetni();
        var yeniUyari = u && u !== tabanUyari ? u : '';
        if (/güvenlik|guvenlik|doğrulama kodu|captcha/i.test(yeniUyari) || (txt !== taban && /güvenlik sorusu|güvenlik kodu/i.test(txt))) {
          uyar('Güvenlik kodu hatalı. Yeni kodu yazıp Enter\'a basın.', true);
          taban = txt; tabanUyari = u;
          var c = $('Captcha'); if (c) { c.value = ''; c.focus(); }
          continue;
        }

        if (oge.a === 'vkn') {
          var isabet = adaylar.filter(function (e) { return e.innerText.indexOf(oge.v) >= 0; });
          if (isabet.length) { sayfaSorgu++; return detayOku(oge, siralaSubeSonra(isabet), adaylar.length, n); }
        }
        if (txt === taban) { bekleyen = null; continue; }
        if (txt !== bekleyen) { bekleyen = txt; ayni = 0; continue; }
        if (++ayni < 2) continue;

        /* Sonuç alanı değişti ve durulmuştur */
        if (!adaylar.length && /bulunamad/i.test(txt)) { sayfaSorgu++; return { sorgu: 'YOK' }; }
        if (!adaylar.length && /Arama kriterlerini belirleyerek/i.test(txt)) {
          sayfaSorgu++;
          uyar('MERSİS boş sonuç döndürdü. Kişi başı sorgu sınırı dolmuş olabilir: kodu yeniden girip deneyin; yine olursa çıkış yapıp başka bir e-Devlet hesabıyla girin ve yer imine tekrar tıklayın. Bu şirketi geçmek için "Bu şirketi atla".', true);
          taban = txt; ciz();
          var c2 = $('Captcha'); if (c2) { c2.value = ''; c2.focus(); }
          continue;
        }
        if (adaylar.length) {
          sayfaSorgu++;
          if (oge.a === 'vkn') return { sorgu: 'YOK', mesaj: 'Sonuçlarda bu vergi numarası yok: ' + adaylar.slice(0, 3).map(function (e) { return bosluk(e.innerText); }).join(' | ') };
          var sec = unvanSec(oge, adaylar);
          if (sec) return detayOku(oge, [sec], adaylar.length, n);
          return { sorgu: 'COKLU', adaylar: adaylar.slice(0, 10).map(function (e) { return bosluk(e.innerText); }), mesaj: adaylar.length + ' kayıt çıktı' };
        }
        if (/sınır|limit|hakkınız|aşıl|fazla sorgu/i.test(txt)) {
          uyar('MERSİS sorgu sınırı dolmuş görünüyor: "' + kisa(txt) + '". Çıkış yapıp başka bir e-Devlet hesabıyla girin, sonra yer imine yeniden tıklayın.', true);
          durdur();
          return null;
        }
        uyar('MERSİS beklenmeyen bir yanıt verdi: "' + kisa(txt) + '". Kodu yeniden girip deneyin.', true);
        taban = txt;
      }
      return null;
    }

    function siralaSubeSonra(liste) {
      return liste.slice().sort(function (a, b) { return (/ŞUBES/i.test(a.innerText) ? 1 : 0) - (/ŞUBES/i.test(b.innerText) ? 1 : 0); });
    }

    function adayUnvani(e) { return bosluk(e.innerText).replace(/^\d{10,16}\s*-\s*/, ''); }

    function unvanSec(oge, adaylar) {
      var tam = adaylar.filter(function (e) { return sade(adayUnvani(e)) === sade(oge.n); });
      if (tam.length === 1) return tam[0];
      if (adaylar.length === 1 && benzerlik(oge.n, adayUnvani(adaylar[0])) >= 0.6) return adaylar[0];
      var yakin = adaylar.filter(function (e) { return benzerlik(oge.n, adayUnvani(e)) >= 0.85; });
      return yakin.length === 1 ? yakin[0] : null;
    }

    var ETIKETLER = ['Unvan', 'Kuruluş Tarihi', 'Firma Durumu', 'MERSİS No', 'Vergi Dairesi / No', 'Ticaret Sicil No / Dosya No',
      'Firma Türü', 'Ticaret Sicili Müdürlüğü', 'Şehir', 'Toplam Sermaye', 'Firma Adres Bilgisi', 'Elektronik Tebligat Adresi'];

    async function detayOku(oge, adaylar, sayi, n) {
      var sec = adaylar[0];
      var mersisNo = (bosluk(sec.innerText).match(/^(\d{10,16})/) || [])[1] || '';
      sec.click();
      var L = null;
      for (var i = 0; i < 50 && surmeli(n); i++) {
        await bekle(300);
        var t = satirlar(sonucAlani().innerText);
        var vk = t.indexOf('Vergi Dairesi / No'), mk = t.indexOf('MERSİS No');
        var tutar = oge.a === 'vkn' ? vk >= 0 && (t[vk + 1] || '').indexOf(oge.v) >= 0 : mk >= 0 && (!mersisNo || t[mk + 1] === mersisNo);
        if (tutar && t.indexOf('Firma Durumu') >= 0) { L = t; break; }
      }
      if (!L) return surmeli(n) ? { sorgu: 'BELIRSIZ', mesaj: 'Firma ayrıntısı açılamadı' } : null;
      var al = function (e) { var k = L.indexOf(e); return k >= 0 && ETIKETLER.indexOf(L[k + 1]) < 0 ? L[k + 1] || '' : ''; };
      var s = {
        sorgu: 'OK', durum: al('Firma Durumu'), unvan: al('Unvan'), kurulus: al('Kuruluş Tarihi'), mersis: al('MERSİS No'),
        vergi: al('Vergi Dairesi / No'), sicilNo: al('Ticaret Sicil No / Dosya No'), tur: al('Firma Türü'),
        tsm: al('Ticaret Sicili Müdürlüğü'), sehir: al('Şehir'), sermaye: al('Toplam Sermaye'), adres: al('Firma Adres Bilgisi')
      };
      /* Bilinmeyen ek alanlar (ör. terkin ya da tasfiye tarihi) */
      var bas = L.indexOf('Firma Bilgileri'), bit = -1;
      for (var j = 0; j < L.length; j++) if (/^İç Yönerge|Bilgilerini Göster$/.test(L[j])) { bit = j; break; }
      var bilinen = ETIKETLER.map(al);
      var ek = L.slice(bas + 1, bit > 0 ? bit : undefined).filter(function (x) { return ETIKETLER.indexOf(x) < 0 && bilinen.indexOf(x) < 0 && x !== 'Firma Bilgileri'; });
      if (ek.length) s.ek = ek.join(' | ').slice(0, 500);
      if (sayi > 1) s.mesaj = sayi + ' kayıt çıktı; şube olmayan ilk kayıt alındı';
      s.konk = await konkOku();
      return s;
    }

    async function konkOku() {
      var a = $('hrefKonkordato');
      if (!a) return { okunamadi: true };
      var once = $('collapseKonkordato') ? bosluk($('collapseKonkordato').innerText) : '';
      a.click();
      for (var i = 0; i < 40; i++) {
        await bekle(300);
        var c = $('collapseKonkordato');
        if (!c) continue;
        var t = bosluk(c.innerText);
        if (!t || /yükleniyor|loading/i.test(t) || (t === once && i < 3)) continue;
        if (/bulunmamaktad/i.test(t)) return { yok: true };
        var tablo = c.querySelector('table');
        if (tablo) {
          var basliklar = [], satir = [];
          Array.prototype.forEach.call(tablo.querySelectorAll('tr'), function (tr) {
            var th = Array.prototype.map.call(tr.querySelectorAll('th'), function (x) { return bosluk(x.innerText); });
            if (th.length && !basliklar.length) { basliklar = th; return; }
            var td = Array.prototype.map.call(tr.querySelectorAll('td'), function (x) { return bosluk(x.innerText); });
            if (!td.length) return;
            if (!basliklar.length && !satir.length && /Mahkeme|Tarih/i.test(td.join(' ')) && !/\d{2}\.\d{2}\.\d{4}/.test(td.join(' '))) { basliklar = td; return; }
            satir.push(td);
          });
          return { basliklar: basliklar, satirlar: satir, metin: t.slice(0, 1500) };
        }
        return { metin: t.slice(0, 1500) };
      }
      return { okunamadi: true };
    }

    /* ---------- Sonuçları dışarı verme ---------- */
    function sonucMetni() {
      var l = liste() || {};
      return JSON.stringify({ tur: 'mersis-sonuc', surum: 1, id: l.id || '', kisi: l.kisi || '', dosya: l.dosya || '', zaman: new Date().toISOString(), sonuclar: D.sonuclar || [] });
    }

    function kopyala() {
      var m = sonucMetni();
      var yedek = function () {
        goster('kopyaKutu', true);
        var t = el('kopyaMetin');
        t.value = m;
        t.focus(); t.select();
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(m).then(function () {
          goster('kopyaKutu', false);
          uyar('');
          yon(bitenSayisi() + ' sonuç panoya kopyalandı. Araçtaki "Sonuçlar" kutusuna yapıştırın.', true);
        }, yedek);
      } else yedek();
    }

    /* ---------- Düğmeler ---------- */
    golge.addEventListener('click', function (e) {
      var b = e.target.closest('[data-i]');
      if (!b) return;
      var i = b.getAttribute('data-i');
      if (i === 'kapat') { durdur(); panel.remove(); window.__mersisTakip = null; return; }
      if (i === 'kucult') { var g = el('govde'); g.classList.toggle('gizli'); b.textContent = g.classList.contains('gizli') ? '+' : '–'; return; }
      if (i === 'durdur') { if (calisiyor) durdur(); else baslat(); return; }
      if (i === 'atla') {
        var o = aktifOge();
        if (o) {
          sonucuKaydet(o, { sorgu: 'ATLANDI' });
          if (calisiyor) dongu(++nesil); else ciz();
        }
        return;
      }
      if (i === 'kopyala') { kopyala(); return; }
      if (i === 'yukle') { listeYukle(el('listeMetin').value); return; }
      if (i === 'panodan') {
        if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(function (m) { el('listeMetin').value = m; listeYukle(m); }, function () { uyar('Panoya erişilemedi. Listeyi kutuya Ctrl+V ile yapıştırın.', true); });
        else uyar('Panoya erişilemedi. Listeyi kutuya Ctrl+V ile yapıştırın.', true);
        return;
      }
      if (i === 'listeDegistir') { goster('listeKutu', true); dugme('listeVazgec').classList.toggle('gizli', !liste()); el('listeMetin').focus(); return; }
      if (i === 'listeVazgec') { goster('listeKutu', false); return; }
      if (i === 'sifirla') {
        onayla('Yüklü liste ve ' + bitenSayisi() + ' sonuç bu tarayıcıdan silinsin mi? Sonuçları önce kopyaladığınızdan emin olun.', function () {
          durdur(); D = {}; try { localStorage.removeItem(ANAHTAR); } catch (e) { /* önemsiz */ } uyar(''); goster('kopyaKutu', false); ciz();
        });
        return;
      }
      if (i === 'onayEvet') { goster('onay', false); var f = onayBekleyen; onayBekleyen = null; if (f) f(); return; }
      if (i === 'onayHayir') { goster('onay', false); onayBekleyen = null; return; }
    });

    window.__mersisTakip = {
      goster: function () { if (!document.contains(panel)) (document.body || document.documentElement).appendChild(panel); el('govde').classList.remove('gizli'); ciz(); if (!calisiyor) baslat(); },
      durum: function () { return JSON.parse(JSON.stringify(D)); },
      sonucMetni: sonucMetni,
      durdur: durdur
    };

    /* ---------- Başlangıç ---------- */
    if (!/(^|\.)mersis\.ticaret\.gov\.tr$/.test(location.hostname) && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
      uyar('Bu yer imi yalnız MERSİS sitesinde çalışır.', true);
      var a = document.createElement('a'); a.href = MERSIS_ADRESI; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'MERSİS Firma Sorgulama sayfasını aç';
      el('uyari').appendChild(document.createElement('br')); el('uyari').appendChild(a);
    } else if (!sayfaUygun()) {
      uyar('Bu sayfa Firma Sorgulama sayfası değil. Açılınca yer imine yeniden tıklayın.', true);
      var a2 = document.createElement('a'); a2.href = SAYFA_YOLU; a2.textContent = 'Firma Sorgulama sayfasına git';
      el('uyari').appendChild(document.createElement('br')); el('uyari').appendChild(a2);
    } else if (liste() && aktifOge()) {
      uyar(bitenSayisi() ? 'Kaldığı yerden sürüyor: ' + bitenSayisi() + ' şirket önceden sorgulanmıştı.' : '');
    }
    ciz();
    baslat();
  }

  kok.MersisTakip = mersisTakip;
})(typeof window !== 'undefined' ? window : this);
