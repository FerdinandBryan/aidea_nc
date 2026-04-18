/* ═══════════════════════════════════════════════════
   AIDEA – Landing Page JS (index.js)
   Place this file next to index.html and update
   the <script> tag: <script src="index.js"></script>
═══════════════════════════════════════════════════ */

/* ── Navigation: redirect to real pages ───────────── */
function openModal(id) {
    if (id === 'loginModal') {
        window.location.href = '../login/login.html';
    } else if (id === 'registerModal') {
        window.location.href = '../register/register.html';
    }
}

const heroBg = document.getElementById('heroBgLayer');
if (heroBg) {
    window.addEventListener('scroll', () => {
        heroBg.style.transform = `translateY(${window.scrollY * 0.45}px)`;
    }, { passive: true });
}

/* ── Smooth scroll helper ─────────────────────────── */
function scrollTo(id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
}

/* ═══════════════════════════════════════════════════
   STATS COUNTER ANIMATION
═══════════════════════════════════════════════════ */
const statsTarget = {
    statThesis: 1248,
    statStudents: 3560,
    statChecks: 8920,
    statRating: 4.8,
};

function animateCounter(id, target, decimals = 0, suffix = '') {
    const el = document.getElementById(id);
    if (!el) return;
    const duration = 1800;
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

/* ── Intersection Observer: trigger when stats visible ── */
const statsObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            animateCounter('statThesis', statsTarget.statThesis);
            animateCounter('statStudents', statsTarget.statStudents);
            animateCounter('statChecks', statsTarget.statChecks);
            animateCounter('statRating', statsTarget.statRating, 1, ' / 5');
            statsObserver.disconnect();
        }
    });
}, { threshold: 0.3 });

const statsRow = document.querySelector('.stats-row');
if (statsRow) statsObserver.observe(statsRow);

/* ═══════════════════════════════════════════════════
   SERVICES DATA
═══════════════════════════════════════════════════ */
const freeServices = [
    { icon: '📋', title: 'Formatting Validator', desc: 'Check IMRAD structure, margins, font, and citation format automatically.' },
    { icon: '🔍', title: 'Plagiarism Check', desc: 'AI-based originality analysis with a detailed integrity report.' },
    { icon: '📝', title: 'Grammar Review', desc: 'Automated grammar and style suggestions for your abstract and body.' },
    { icon: '📖', title: 'Thesis Repository', desc: 'Browse and reference approved thesis works from past NC students.' },
    { icon: '📊', title: 'Basic Data Summary', desc: 'Generate simple descriptive statistics from uploaded datasets.' },
];

const paidServices = [
    { icon: '🧮', title: 'Full Statistical Analysis', desc: 'Advanced inferential statistics, regression, ANOVA, and interpretation.', badge: ' ₱ 0' },
    { icon: '👨‍🏫', title: 'Expert Statistician', desc: 'One-on-one session with a licensed statistician for your data.', badge: ' ₱ 0' },
    { icon: '✍️', title: 'Professional Grammarian', desc: 'Human grammar and language editing by an academic writing expert.', badge: ' ₱ 0' },
    { icon: '📑', title: 'Full Thesis Formatting', desc: 'Done-for-you APA/MLA/Chicago formatting by our editorial team.', badge: ' ₱ 0' },
];

function renderServices(list, gridId, paid = false) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    grid.innerHTML = list.map(s => `
    <div class="service-card">
      <div class="service-icon">${s.icon}</div>
      <div class="service-body">
        <div class="service-title">${s.title}${s.badge ? `<span class="service-badge">${s.badge}</span>` : ''}</div>
        <p class="service-desc">${s.desc}</p>
      </div>
    </div>
  `).join('');
}

renderServices(freeServices, 'freeServicesGrid');
renderServices(paidServices, 'paidServicesGrid', true);

/* ═══════════════════════════════════════════════════
   THESIS REPOSITORY MOCK DATA
═══════════════════════════════════════════════════ */
const thesisList = [
    { title: 'Smart Attendance System Using Facial Recognition', author: 'Maria Santos', year: 2024, course: 'BSCS', abstract: 'An automated attendance tracking system using OpenCV and deep learning for Norzagaray College classrooms.' },
    { title: 'Online Barangay Document Request System', author: 'Juan dela Cruz', year: 2024, course: 'BSCS', abstract: 'A web-based system to streamline barangay document requests and issuance in Norzagaray, Bulacan.' },
    { title: 'Mobile App for Mental Health Monitoring Among College Students', author: 'Carla Reyes', year: 2023, course: 'BSCS', abstract: 'A cross-platform app employing sentiment analysis to monitor student mental health indicators.' },
    { title: 'Inventory Management System for Small Retailers in Norzagaray', author: 'Rodel Flores', year: 2022, course: 'BSCS', abstract: 'A desktop-based inventory system tailored for sari-sari stores and small businesses.' },
    { title: 'E-Learning Platform with Adaptive Quiz Generation', author: 'Liza Mendoza', year: 2022, course: 'BSCS', abstract: 'A web platform using machine learning to generate personalized quizzes for college-level learners.' },
    { title: 'Water Quality Monitoring System Using IoT Sensors', author: 'Patrick Bautista', year: 2021, course: 'BSCS', abstract: 'An IoT-based system to continuously monitor potable water quality in Norzagaray households.' },
    { title: 'Social Media Usage and Academic Motivation', author: 'Cynthia Abad', year: 2021, course: 'BSED', abstract: 'A correlational study on social media habits and their effect on student academic motivation.' },
];

let filteredThesis = [...thesisList];

function renderRepo(list) {
    const grid = document.getElementById('repoGrid');
    if (!grid) return;
    if (!list.length) {
        grid.innerHTML = '<p style="color:var(--nc-gray);text-align:center;grid-column:1/-1;padding:2rem 0;">No thesis found matching your search.</p>';
        return;
    }
    grid.innerHTML = list.map(t => `
    <div class="repo-card">
      <div class="repo-meta">${t.course} · ${t.year}</div>
      <div class="repo-title">${t.title}</div>
      <div class="repo-author">by ${t.author}</div>
      <p class="repo-abstract">${t.abstract}</p>
      <button class="btn btn-navy btn-sm" onclick="window.location.href='../login/login.html'" style="margin-top:.75rem;">View Full Paper →</button>
    </div>
  `).join('');
}

function filterRepo() {
    const q = (document.getElementById('repoSearch')?.value || '').toLowerCase();
    const year = document.getElementById('repoYear')?.value || '';
    filteredThesis = thesisList.filter(t => {
        const matchQ = !q || t.title.toLowerCase().includes(q) || t.author.toLowerCase().includes(q) || t.course.toLowerCase().includes(q);
        const matchYear = !year || String(t.year) === year;
        return matchQ && matchYear;
    });
    renderRepo(filteredThesis);
}

renderRepo(thesisList);

/* ═══════════════════════════════════════════════════
   LANDING VOICE DEMO (Web Speech API)
═══════════════════════════════════════════════════ */
let voiceActive = false;
let recognition = null;

function toggleLandingVoice() {
    const orb = document.getElementById('landingVoiceOrb');
    const transcript = document.getElementById('landingTranscript');
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
        transcript.textContent = '⚠️ Speech recognition is not supported in your browser. Try Chrome.';
        return;
    }
    if (voiceActive) {
        recognition && recognition.stop();
        return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SR();
    recognition.lang = 'en-PH';
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onstart = () => {
        voiceActive = true;
        orb.classList.add('listening');
        transcript.textContent = 'Listening… speak now.';
    };
    recognition.onresult = (e) => {
        let text = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
            text += e.results[i][0].transcript;
        }
        transcript.textContent = text || 'Listening…';
    };
    recognition.onerror = (e) => {
        transcript.textContent = `⚠️ Error: ${e.error}. Please try again.`;
        voiceActive = false;
        orb.classList.remove('listening');
    };
    recognition.onend = () => {
        voiceActive = false;
        orb.classList.remove('listening');
    };

    recognition.start();
}

/* ═══════════════════════════════════════════════════
   ACTIVE NAV LINK ON SCROLL
═══════════════════════════════════════════════════ */
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