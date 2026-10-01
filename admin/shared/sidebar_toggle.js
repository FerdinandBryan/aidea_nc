// sidebar_toggle.js - desktop: hamburger lives inside the sidebar when open, in the top bar when collapsed.
(function () {
    'use strict';
    var KEY = 'aidea_sidebar_collapsed';
    var DESK = '(min-width: 1025px)';
    var root = document.documentElement;
    var sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    function getState() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
    function setState(v) { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) { } }
    function isDesk() { return window.matchMedia(DESK).matches; }

    function findMain() {
        var m = document.querySelector('.main');
        if (m && m !== sidebar) return m;
        var kids = sidebar.parentNode ? sidebar.parentNode.children : [];
        for (var i = 0; i < kids.length; i++) {
            var el = kids[i];
            if (el === sidebar) continue;
            var ml = parseFloat(getComputedStyle(el).marginLeft) || 0;
            if (ml > 100 && ml >= sidebar.offsetWidth - 4) return el;
        }
        return null;
    }

    var main = findMain();
    if (main) main.classList.add('sb-main');
    if (getComputedStyle(sidebar).position === 'static') sidebar.style.position = 'relative';
    var brand = sidebar.querySelector('.sidebar-brand') || sidebar.querySelector('[class*="brand"]');

    // Hamburger inside the sidebar panel
    var inner = document.createElement('button');
    inner.type = 'button';
    inner.id = 'sbCloseBtn';
    inner.setAttribute('aria-label', 'Collapse sidebar');
    inner.title = 'Collapse sidebar';
    inner.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10"/></svg>';
    sidebar.appendChild(inner);

    var st = document.createElement('style');
    st.textContent =
        '#sbCloseBtn{display:none}' +
        '@media (min-width:1025px){' +
        '#sidebar{transition:transform .25s ease}' +
        '.sb-main{transition:margin-left .25s ease}' +
        '#sbCloseBtn{display:inline-flex;align-items:center;justify-content:center;position:absolute;top:16px;right:10px;width:34px;height:34px;padding:0;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:rgba(255,255,255,.85);cursor:pointer;z-index:5}' +
        '#sbCloseBtn:hover{background:rgba(255,255,255,.14);color:#fff}' +
        'html:not(.sb-collapsed) #sidebar .sidebar-brand{padding-right:56px;min-width:0;overflow:hidden;box-sizing:border-box}' +
        '#sidebar .brand-name,#sidebar .brand-sub{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}' +
        '#menuBtn,.menu-btn{display:inline-flex !important;align-items:center;justify-content:center}' +
        'html:not(.sb-collapsed) #menuBtn,html:not(.sb-collapsed) .menu-btn{display:none !important}' +
        'html.sb-collapsed #sidebar{transform:translateX(-100%);box-shadow:none}' +
        'html.sb-collapsed .sb-main{margin-left:0 !important}' +
        '}' +
        '@media (prefers-reduced-motion:reduce){#sidebar,.sb-main{transition:none !important}}';
    document.head.appendChild(st);

    // Center the button on the logo row, whatever the sidebar width or logo height.
    function place() {
        if (!isDesk()) return;
        var top = 16;
        if (brand) {
            var sr = sidebar.getBoundingClientRect();
            var br = brand.getBoundingClientRect();
            if (br.height > 0) top = Math.max(8, Math.round(br.top - sr.top + (br.height - 34) / 2));
        }
        inner.style.top = top + 'px';
    }

    function apply(collapsed) {
        root.classList.toggle('sb-collapsed', collapsed);
        var b = document.getElementById('menuBtn');
        if (b && isDesk()) b.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        place();
    }

    apply(getState());
    window.addEventListener('resize', place);
    window.addEventListener('load', place);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(place);

    // Capture phase so the old mobile-drawer handler doesn't also run on desktop.
    document.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('#menuBtn, #sbCloseBtn') : null;
        if (!b || !isDesk()) return;
        e.stopPropagation();
        e.preventDefault();
        var next = !root.classList.contains('sb-collapsed');
        setState(next);
        apply(next);
    }, true);
})();