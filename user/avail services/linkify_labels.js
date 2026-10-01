// linkify_labels.js - make URLs in the Research Info form labels clickable.
(function () {
    'use strict';
    var URL_RE = /((?:https?:\/\/|www\.)[^\s<>"']+)/gi;
    var SKIP = { A: 1, SCRIPT: 1, STYLE: 1, INPUT: 1, TEXTAREA: 1, BUTTON: 1, SELECT: 1, OPTION: 1 };

    function toHref(raw) {
        var u = raw;
        if (/^www\./i.test(u)) u = 'https://' + u;
        return /^https?:\/\//i.test(u) ? u : null;
    }

    function linkifyNode(textNode) {
        var text = textNode.nodeValue;
        if (!text || !/(https?:\/\/|www\.)/i.test(text)) return;
        var frag = document.createDocumentFragment();
        var last = 0, m;
        URL_RE.lastIndex = 0;
        while ((m = URL_RE.exec(text)) !== null) {
            var raw = m[1];
            var trail = '';
            var t = raw.match(/[.,;:!?)\]]+$/);
            if (t) { trail = t[0]; raw = raw.slice(0, -trail.length); }
            var href = toHref(raw);
            if (!href) continue;
            if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
            var a = document.createElement('a');
            a.href = href;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.className = 'lk-link';
            a.textContent = raw;
            a.addEventListener('click', function (e) { e.stopPropagation(); });
            frag.appendChild(a);
            if (trail) frag.appendChild(document.createTextNode(trail));
            last = m.index + m[1].length;
        }
        if (last === 0) return;
        if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
        textNode.parentNode.replaceChild(frag, textNode);
    }

    function walk(root) {
        var nodes = [];
        var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: function (n) {
                for (var p = n.parentNode; p && p !== root; p = p.parentNode) {
                    if (SKIP[p.nodeName]) return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        while (w.nextNode()) nodes.push(w.currentNode);
        nodes.forEach(linkifyNode);
    }

    function addStyles() {
        var st = document.createElement('style');
        st.textContent =
            '.lk-link{color:#7aa7ff;text-decoration:underline;word-break:break-all;cursor:pointer}' +
            '.lk-link:hover{opacity:.85}';
        document.head.appendChild(st);
    }

    function init() {
        var wrap = document.getElementById('riDynamicFieldsWrap');
        if (!wrap) return;
        addStyles();
        walk(wrap);
        new MutationObserver(function () { walk(wrap); })
            .observe(wrap, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();