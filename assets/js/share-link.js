/* 링크 복사 — 앱 공통.
 * 공유 시트를 쓸 수 있으면 그것을, 아니면 클립보드에 복사한다.
 * 버튼과 안내 말풍선은 여기서 만들어 붙이므로 index.html 은 건드리지 않는다.
 */
(function () {
  'use strict';

  var host = document.querySelector('.header-inner')
    || document.querySelector('.app-header')
    || document.querySelector('header')
    || document.body;

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'share-link-btn';
  btn.title = '링크 복사';
  btn.setAttribute('aria-label', '이 페이지 링크 복사');
  btn.textContent = '\uD83D\uDD17';

  var toast = document.createElement('p');
  toast.className = 'share-link-toast';
  toast.setAttribute('role', 'status');
  toast.hidden = true;
  toast.textContent = '링크가 복사됐어요!';

  host.appendChild(btn);
  host.appendChild(toast);

  var timer;
  function flash(msg) {
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(function () { toast.hidden = true; }, 2000);
  }

  btn.addEventListener('click', function () {
    var url = location.href;
    if (navigator.share) {
      navigator.share({ title: document.title, url: url })['catch'](function () {});
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        flash('링크가 복사됐어요!');
      }, function () {
        window.prompt('아래 링크를 복사하세요', url);
      });
      return;
    }
    window.prompt('아래 링크를 복사하세요', url);
  });
})();
