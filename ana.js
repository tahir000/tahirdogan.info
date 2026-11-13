/* Ana sayfa: başlığa art arda üç kez tıklanınca büro araçları bölümü açılır */
(function () {
  'use strict';
  const baslik = document.getElementById('baslik');
  if (!baslik) return;
  let sayi = 0, son = 0;
  baslik.addEventListener('click', function (e) {
    const simdi = Date.now();
    sayi = simdi - son < 700 ? sayi + 1 : 1;
    son = simdi;
    if (sayi >= 3 || e.detail >= 3) {
      sayi = 0;
      window.location.href = 'buro/';
    }
  });
})();
