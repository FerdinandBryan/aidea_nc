(function () {
  var API = 'https://aideanc-production.up.railway.app/api';
  var KEY = 'aidea_avatar_url';

  function cached() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }

  function apply() {
    var el = document.querySelector('.footer-avatar');
    var u = cached();
    if (!el || !u) return;
    var img = el.querySelector('img');
    if (img && img.getAttribute('src') === u) return;
    el.textContent = '';
    el.style.overflow = 'hidden';
    img = document.createElement('img');
    img.src = u;
    img.alt = '';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;display:block';
    el.appendChild(img);
  }

  function refresh() {
    var token = null;
    try { token = localStorage.getItem('auth_token'); } catch (e) {}
    if (!token) return;
    fetch(API + '/profile', { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) return;
        var user = (d.user || d.data || d);
        var u = user && user.avatar_url ? user.avatar_url : '';
        try { u ? localStorage.setItem(KEY, u) : localStorage.removeItem(KEY); } catch (e) {}
        apply();
      })
      .catch(function () {});
  }

  function start() {
    apply();
    var el = document.querySelector('.footer-avatar');
    if (el) new MutationObserver(apply).observe(el, { childList: true, characterData: true, subtree: true });
    refresh();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
