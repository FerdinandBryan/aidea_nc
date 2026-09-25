document.addEventListener('DOMContentLoaded', () => {
  const papers = [
    { title: 'Impact of Social Media on Academic Performance of NC Students', authors: 'Juan Dela Cruz, Maria Santos', course: 'BSCS', year: '2025', abstract: 'This study examines the influence of social media platforms on the academic performance of students at Norzagaray College, analyzing usage patterns and GPA correlations.' },
    { title: 'AI Integration in Local Government Services in Norzagaray', authors: 'Juan Dela Cruz', course: 'BSCS', year: '2025', abstract: 'Explores how artificial intelligence technologies can streamline and improve service delivery in the municipal government of Norzagaray, Bulacan.' },
    { title: 'Blockchain-Based Student Record System', authors: 'Ana Reyes, Luis Torres', course: 'BSCS', year: '2024', abstract: 'A proposed distributed ledger solution for managing student academic records with enhanced security, immutability, and verifiability.' },
    { title: 'Smart Irrigation System Using IoT', authors: 'Pedro Garcia', course: 'BSCS', year: '2024', abstract: 'Development of an IoT-based automated irrigation system that monitors soil moisture and weather data to optimize water usage in local farms.' },
    { title: 'E-Commerce Platform for Local Bulacan Artisans', authors: 'Rosa Mendoza, Carlo Lim', course: 'BSCS', year: '2023', abstract: 'Design and development of a localized e-commerce platform connecting Bulacan artisans with online customers, supporting MSMEs.' },
    { title: 'Mobile App for Early Detection of Dengue Hotspots', authors: 'Alicia Bautista', course: 'BSCS', year: '2024', abstract: 'A mobile health application utilizing GPS data and barangay-level reports to identify and visualize potential dengue outbreak areas.' },
    { title: 'Digital Literacy Training Program for Senior Citizens', authors: 'Carla Navarro, Jose Flores', course: 'BSED', year: '2023', abstract: 'A study on the effectiveness of tailored digital literacy modules for senior citizens in rural Norzagaray community centers.' },
    { title: 'Automated Grading System for Multiple-Choice Exams', authors: 'Mark Villanueva', course: 'BSCS', year: '2023', abstract: 'An optical mark recognition system that automates grading of paper-based multiple choice examinations, reducing faculty workload.' },
  ];

  let search = '';
  let course = '';
  let year = '';

  function render() {
    const grid = document.getElementById('repoGrid');
    const filtered = papers.filter(p => {
      const matchSearch = !search || p.title.toLowerCase().includes(search) || p.authors.toLowerCase().includes(search);
      const matchCourse = !course || p.course === course;
      const matchYear = !year || p.year === year;
      return matchSearch && matchCourse && matchYear;
    });
    if (filtered.length === 0) {
      grid.innerHTML = '<p style="color:#888;font-size:14px;grid-column:1/-1;padding:40px 0;text-align:center;">No papers found matching your search.</p>';
      return;
    }
    grid.innerHTML = filtered.map(p => `
      <div class="repo-card">
        <div class="repo-card-header">
          <span class="repo-course">${p.course}</span>
        </div>
        <h4>${p.title}</h4>
        <p class="repo-authors">👤 ${p.authors}</p>
        <p class="repo-abstract">${p.abstract}</p>
        <div class="repo-footer">
          <span class="repo-year">📅 ${p.year}</span>
          <button class="btn-read" onclick="alert('Opening: ${p.title.replace(/'/g, "\\'")}')">Read Paper</button>
        </div>
      </div>
    `).join('');
  }

  document.getElementById('repoSearch')?.addEventListener('input', e => { search = e.target.value.toLowerCase(); render(); });
  document.getElementById('courseFilter')?.addEventListener('change', e => { course = e.target.value; render(); });
  document.getElementById('yearFilter')?.addEventListener('change', e => { year = e.target.value; render(); });
  document.querySelector('.btn-signout')?.addEventListener('click', () => { if (confirm('Sign out?')) alert('Signed out.'); });

  render();
});