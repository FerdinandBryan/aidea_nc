/* 
   AIDEA “ Landing Page
   Pulls live data from the same Laravel API as the admin
   panel. These calls are made WITHOUT an auth token (the
   visitor isn't logged in), so the backend must expose
   these routes outside the `auth:sanctum` group:
     GET /api/services                ’ public, active services + prices
     GET /api/thesis/list?status=Approved  ’ public repository listing
     GET /api/public/stats            ’ { total_thesis, total_students,
                                           total_validations, avg_rating }
   If any call fails (404 / CORS / not public yet), the
   section falls back to a safe placeholder instead of
   breaking the page â€” check the console for what failed.
 */

const API_BASE = 'https://aideanc-production.up.railway.app/api';

/* â”€â”€ Navigation: redirect to real pages  */
function openModal(id) {
    if (id === 'loginModal') {
        window.location.href = '../login/login.html';
    } else if (id === 'registerModal') {
        window.location.href = '../register/register.html';
    }
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
}

const heroBg = document.getElementById('heroBgLayer');
if (heroBg) {
    window.addEventListener('scroll', () => {
        heroBg.style.transform = `translateY(${window.scrollY * 0.35}px)`;
    }, { passive: true });
}

/* â”€â”€ Smooth scroll helper  */
function scrollTo(id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
}

function escHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function peso(n) {
    return 'â‚±' + Number(n || 0).toLocaleString('en-PH');
}

async function apiGet(path) {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: { Accept: 'application/json' }, // no Authorization ” public visitor
    });
    if (!res.ok) throw new Error(`${path} â†’ ${res.status}`);
    return res.json();
}

const asList = raw => Array.isArray(raw) ? raw : (raw?.data ?? []);

/* 
   STATS COUNTER ANIMATION
 */
function animateCounter(id, target, decimals = 0, suffix = '') {
    const el = document.getElementById(id);
    if (!el) return;
    const duration = 1400;
    const start = performance.now();
    function step(now) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const value = eased * target;
        el.textContent = decimals
            ? value.toFixed(decimals) + suffix
            : Math.floor(value).toLocaleString() + suffix;
        if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

let statsTarget = { statThesis: 0, statStudents: 0, statChecks: 0, statRating: 0 };
let statsAnimated = false;

function runStatsAnimation() {
    if (statsAnimated) return;
    statsAnimated = true;
    animateCounter('statThesis', statsTarget.statThesis);
    animateCounter('statStudents', statsTarget.statStudents);
    animateCounter('statChecks', statsTarget.statChecks);
    animateCounter('statRating', statsTarget.statRating, 1, ' / 5');
}

const statsObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => { if (entry.isIntersecting) { runStatsAnimation(); statsObserver.disconnect(); } });
}, { threshold: 0.3 });

const statsRow = document.querySelector('.stats-row');
// Scroll-triggered animation disabled -- loadStats() now sets values directly on load

async function loadStats() {
    // Preferred: one dedicated public endpoint (add this route in Laravel,
    // outside auth:sanctum, if it doesn't exist yet).
    try {
        const data = await apiGet('/public/stats');
        statsTarget = {
            statThesis: data.total_thesis ?? 0,
            statStudents: data.total_students ?? 0,
            statChecks: data.total_validations ?? 0,
            statRating: data.avg_rating ?? 0,
        };
    } catch {
        // Fallback: derive what we can from data already loaded for other
        // sections (repository + services), so the strip still shows real
        // numbers even without a dedicated stats route.
        statsTarget.statThesis = approvedTheses.length;
        statsTarget.statChecks = allTheses.length;
    }
    // Show real numbers immediately instead of sitting at 0 until scrolled into view
    statsAnimated = true;
    const statThesisEl = document.getElementById('statThesis');
    const statStudentsEl = document.getElementById('statStudents');
    const statChecksEl = document.getElementById('statChecks');
    const statRatingEl = document.getElementById('statRating');
    if (statThesisEl) statThesisEl.textContent = statsTarget.statThesis.toLocaleString();
    if (statStudentsEl) statStudentsEl.textContent = statsTarget.statStudents.toLocaleString();
    if (statChecksEl) statChecksEl.textContent = statsTarget.statChecks.toLocaleString();
    if (statRatingEl) statRatingEl.textContent = statsTarget.statRating.toFixed(1) + ' / 5';
}

/* 
   SERVICES GET /api/services
 */
function renderServices(list, gridId) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    if (!list.length) {
        grid.innerHTML = `<p style="color:var(--muted);font-size:.88rem;">No services listed yet.</p>`;
        return;
    }
    grid.innerHTML = list.map(s => `
    <div class="service-card">
      <div class="service-title">${escHtml(s.name)}${Number(s.price) > 0 ? `<span class="service-badge">${peso(s.price)}</span>` : ''}</div>
      <p class="service-desc">${escHtml(s.description || '')}</p>
    </div>
  `).join('');
}

async function loadServices() {
    const freeGrid = document.getElementById('freeServicesGrid');
    const paidGrid = document.getElementById('paidServicesGrid');
    if (freeGrid) freeGrid.innerHTML = `<p style="color:var(--muted);font-size:.88rem;">Loadingâ€¦</p>`;
    if (paidGrid) paidGrid.innerHTML = `<p style="color:var(--muted);font-size:.88rem;">Loadingâ€¦</p>`;

    try {
        const services = asList(await apiGet('/services')).filter(s => s.active !== false);
        renderServices(services.filter(s => Number(s.price) === 0), 'freeServicesGrid');
        renderServices(services.filter(s => Number(s.price) > 0), 'paidServicesGrid');
    } catch (err) {
        console.warn('Services unavailable:', err);
        if (freeGrid) freeGrid.innerHTML = `<p style="color:var(--muted);font-size:.88rem;">Couldn't load services right now.</p>`;
        if (paidGrid) paidGrid.innerHTML = '';
    }
}

/* 
   THESIS REPOSITORY GET /api/thesis/list
 */
let allTheses = [];
let approvedTheses = [];
let filteredThesis = [];

function renderRepo(list) {
    const grid = document.getElementById('repoGrid');
    if (!grid) return;
    if (!list.length) {
        grid.innerHTML = '<p style="color:var(--muted);text-align:center;grid-column:1/-1;padding:2rem 0;">No thesis found matching your search.</p>';
        return;
    }
    grid.innerHTML = list.map(t => `
    <div class="repo-card">
      <div class="repo-meta">${escHtml(t.course)} Â· ${escHtml(t.year)}</div>
      <div class="repo-title">${escHtml(t.title)}</div>
      <div class="repo-author">by ${escHtml(t.author)}</div>
      <p class="repo-abstract">${escHtml(t.abstract)}</p>
      <button class="btn btn-secondary btn-sm" onclick="window.location.href='../login/login.html'" style="margin-top:.9rem;">View full paper’</button>
    </div>
  `).join('');
}

function filterRepo() {
    const q = (document.getElementById('repoSearch')?.value || '').toLowerCase();
    const year = document.getElementById('repoYear')?.value || '';
    filteredThesis = approvedTheses.filter(t => {
        const matchQ = !q || t.title.toLowerCase().includes(q) || t.author.toLowerCase().includes(q) || t.course.toLowerCase().includes(q);
        const matchYear = !year || String(t.year) === year;
        return matchQ && matchYear;
    });
    renderRepo(filteredThesis);
}

async function loadRepository() {
    const grid = document.getElementById('repoGrid');
    if (grid) grid.innerHTML = '<p style="color:var(--muted);text-align:center;grid-column:1/-1;padding:2rem 0;">Loadingâ€¦</p>';

    try {
        // Ask the API to only send approved records if it supports the
        // query param; we still filter client-side as a safety net.
        const raw = asList(await apiGet('/public/thesis'));
        allTheses = raw;
        approvedTheses = raw
            .filter(t => {
                const status = (t.status || '').toLowerCase();
                return status === 'approved';
            })
            .map(t => ({
                title: t.title,
                author: t.author ?? t.user?.name ?? t.student_name ?? '”',
                year: t.academic_year ?? (t.created_at ? new Date(t.created_at).getFullYear() : ''),
                course: t.course ?? '”',
                abstract: t.abstract ?? '',
            }));
        filteredThesis = [...approvedTheses];
        renderRepo(filteredThesis);
    } catch (err) {
        console.warn('Repository unavailable:', err);
        if (grid) grid.innerHTML = '<p style="color:var(--muted);text-align:center;grid-column:1/-1;padding:2rem 0;">Couldn\'t load the repository right now. Please try again later.</p>';
    }
}

/* 
   ACTIVE NAV LINK ON SCROLL
 */
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.nav-links a');

window.addEventListener('scroll', () => {
    let current = '';
    sections.forEach(s => {
        if (window.scrollY >= s.offsetTop - 120) current = s.id;
    });
    navLinks.forEach(a => {
        a.classList.toggle('active', a.getAttribute('href') === '#' + current);
    });
}, { passive: true });

/* 
   BOOT
 */
(async function init() {
    await loadRepository();   // populate approvedTheses/allTheses first
    await Promise.all([
        loadServices(),
        loadStats(),          // so the stats fallback has real numbers to use
    ]);
})();