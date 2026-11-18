/*
 * MERSİS taklidi: Firma Sorgulama sayfasının yer iminin dayandığı kısmını
 * (form alanları, sonuç listesi, firma bilgileri, konkordato bölümü, güvenlik
 * sorusu) örnek verilerle canlandırır. Yalnız testler içindir.
 *
 * Testlerin kullandığı ayarlar: window.__taklit.cevap() doğru toplam,
 * window.__taklit.bosDon = true ise arama boş sonuç döndürür (sorgu sınırı benzetimi).
 */
(function () {
  'use strict';
  const F = window.MersisOrnekler.FIRMALAR, KB = window.MersisOrnekler.KONK_BASLIK;
  const $ = function (id) { return document.getElementById(id); };
  const alan = $('divFirmaAraResult');
  let cevap = 0;
  const T = window.__taklit = { cevap: function () { return cevap; }, bosDon: false, sorgu: 0, gecikme: 150 };

  function kac(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function sade(x) {
    return String(x || '').toLocaleUpperCase('tr-TR').replace(/İ/g, 'I').replace(/Ş/g, 'S').replace(/Ğ/g, 'G')
      .replace(/Ü/g, 'U').replace(/Ö/g, 'O').replace(/Ç/g, 'C').replace(/[^A-Z0-9]+/g, ' ').trim();
  }
  function yeniSoru() {
    const a = 1 + Math.floor(Math.random() * 90), b = 1 + Math.floor(Math.random() * 9);
    cevap = a + b;
    $('soru').textContent = a + ' + ' + b + ' = ?';
  }
  yeniSoru();

  $('form0').addEventListener('submit', function (e) {
    e.preventDefault();
    const girilen = $('Captcha').value.trim();
    const vkn = $('VergiNo').value.trim(), unvan = $('TamUnvan').value.trim();
    setTimeout(function () {
      $('mesajlar').innerHTML = '';
      if (girilen !== String(cevap)) {
        $('mesajlar').innerHTML = '<div class="alert alert-danger">Güvenlik sorusu hatalı cevaplandı.</div>';
        yeniSoru(); $('Captcha').value = '';
        return;
      }
      T.sorgu++;
      yeniSoru(); $('Captcha').value = '';
      if (T.bosDon) { alan.innerHTML = '<div class="panel"><div class="panel-heading">Arama Sonuçları</div><div class="panel-body">Arama kriterlerini belirleyerek \'Ara\' tuşuna tıklayınız.</div></div>'; return; }
      let bulunan = [];
      if (vkn) bulunan = F.filter(function (f) { return f.vkn === vkn; });
      else if (unvan) bulunan = F.filter(function (f) { return sade(f.unvan).indexOf(sade(unvan)) >= 0; });
      const ogeler = [];
      bulunan.forEach(function (f) {
        if (f.sube) ogeler.push({ f: f, ad: f.sube, no: f.mersis.slice(0, -1) + '9' });
        ogeler.push({ f: f, ad: f.unvan, no: f.mersis });
      });
      if (!ogeler.length) {
        alan.innerHTML = '<div class="panel"><div class="panel-heading">Arama Sonuçları</div><div class="panel-body">Aradığınız kriterlere uygun sonuç bulunamadı.</div></div>';
        return;
      }
      alan.innerHTML = '<div class="panel"><div class="panel-heading">Arama Sonuçları</div><div class="list-group">' +
        ogeler.map(function (o, i) { return '<a href="#" class="list-group-item firmaItem" data-i="' + i + '">' + kac(o.no + ' - ' + o.ad) + '</a>'; }).join('') +
        '</div><div id="detay"></div></div>';
      alan.querySelectorAll('.firmaItem').forEach(function (a) {
        a.addEventListener('click', function (ev) { ev.preventDefault(); detay(ogeler[+a.getAttribute('data-i')]); });
      });
    }, T.gecikme);
  });

  function detay(o) {
    const f = o.f;
    setTimeout(function () {
      const alanlar = [['Unvan', o.ad], ['Kuruluş Tarihi', f.kurulus], ['Firma Durumu', f.durum], ['MERSİS No', o.no], ['Vergi Dairesi / No', f.vergi],
        ['Ticaret Sicil No / Dosya No', f.sicil], ['Firma Türü', o.ad === f.unvan ? f.tur : 'MERKEZİ TÜRKİYE’ DE BULUNAN ŞUBE'], ['Ticaret Sicili Müdürlüğü', f.tsm],
        ['Şehir', f.sehir], ['Toplam Sermaye', f.sermaye]].concat(f.ek || []).concat([['Firma Adres Bilgisi', f.adres], ['Elektronik Tebligat Adresi', f.tebligat]]);
      $('detay').innerHTML = '<div class="panel"><div class="panel-heading"><a href="#collapseOne">Firma Bilgileri</a></div><div>' +
        alanlar.map(function (a) { return '<div class="alan"><div>' + kac(a[0]) + '</div><div>' + kac(a[1]) + '</div></div>'; }).join('') +
        '</div><button class="btn btn-warning" type="button">İç Yönerge TTSG İlan Metni</button>' +
        '<h4><a id="hrefYKYetkili" href="#collapseYetkili">Yetkili Bilgilerini Göster</a></h4><div id="collapseYetkili" class="collapse"></div>' +
        '<h4><a id="hrefKonkordato" href="#collapseKonkordato">Konkordato/İflas Bilgilerini Göster</a></h4><div id="collapseKonkordato" class="panel-collapse collapse"></div></div>';
      $('hrefKonkordato').addEventListener('click', function (ev) {
        ev.preventDefault();
        const c = $('collapseKonkordato');
        c.classList.add('in');
        c.textContent = 'Yükleniyor...';
        setTimeout(function () {
          if (!f.konk) { c.innerHTML = '<p>Firmaya ait konkordato/iflas bilgisi bulunmamaktadır.</p>'; return; }
          c.innerHTML = '<table><thead><tr>' + KB.map(function (b) { return '<th>' + kac(b) + '</th>'; }).join('') + '</tr></thead><tbody>' +
            f.konk.map(function (s) { return '<tr>' + s.map(function (h) { return '<td>' + kac(h) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
        }, 200);
      });
    }, T.gecikme);
  }
})();
