(function () {
  var API = 'https://aideanc-production.up.railway.app/api';
  var MIN_WORDS = 150, MAX_WORDS = 200, MAX_BYTES = 20 * 1024 * 1024;
  var modal = document.getElementById('uploadModal');
  var openBtn = document.getElementById('addDocBtn');
  var submit = document.getElementById('upSubmit');
  var errEl = document.getElementById('upErr');
  if (!modal || !openBtn || !submit) return;

  var ids = ['upTitle', 'upCourse', 'upYear', 'upAdviser', 'upAuthors', 'upAbstract', 'upFile', 'upImrad'];
  function el(id) { return document.getElementById(id); }
  function token() { try { return localStorage.getItem('auth_token') || ''; } catch (e) { return ''; } }

  function toast(msg, isErr) {
    var d = document.getElementById('upToast');
    if (d) d.remove();
    d = document.createElement('div');
    d.id = 'upToast';
    if (isErr) d.className = 'err';
    d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 3500);
  }

  function wordCount(t) { t = (t || '').trim(); return t ? t.split(/\s+/).length : 0; }
  function updateCount() {
    var n = wordCount(el('upAbstract').value);
    var c = el('upCount');
    c.textContent = n + ' words - required: ' + MIN_WORDS + ' to ' + MAX_WORDS + ' words';
    c.style.color = n === 0 ? '' : (n >= MIN_WORDS && n <= MAX_WORDS ? '#16a34a' : '#dc2626');
  }
  function updateImradLabel() {
    el('upImradReq').textContent = el('upType').value === 'research' ? ' *' : ' (optional)';
    var isRes = el('upType').value === 'research';
    el('upTitleLbl').textContent = isRes ? 'Research title *' : 'Thesis title *';
    el('upFileLbl').textContent = (isRes ? 'Research' : 'Thesis') + ' paper file * (PDF or DOCX, max 20 MB)';
  }

  function openModal() { errEl.textContent = ''; updateCount(); updateImradLabel(); modal.hidden = false; el('upTitle').focus(); }
  function closeModal() { modal.hidden = true; }
  function reset() {
    ids.forEach(function (i) { el(i).value = ''; });
    el('upType').value = 'thesis';
    errEl.textContent = '';
    updateCount();
    updateImradLabel();
  }

  openBtn.addEventListener('click', openModal);
  el('upAbstract').addEventListener('input', updateCount);
  el('upType').addEventListener('change', updateImradLabel);
  modal.addEventListener('click', function (e) {
    if (e.target === modal || e.target.closest('[data-upload-close]')) closeModal();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

  submit.addEventListener('click', async function () {
    errEl.textContent = '';
    var title = el('upTitle').value.trim();
    var course = el('upCourse').value;
    var year = el('upYear').value;
    var adviser = el('upAdviser').value.trim();
    var type = el('upType').value;
    var authors = el('upAuthors').value.trim();
    var abstractText = el('upAbstract').value.trim();
    var file = el('upFile').files[0];
    var imrad = el('upImrad').files[0];
    var words = wordCount(abstractText);

    if (!title || !course || !year || !adviser) { errEl.textContent = 'Title, course, academic year and adviser are required.'; return; }
    if (words < MIN_WORDS || words > MAX_WORDS) { errEl.textContent = 'Abstract must be ' + MIN_WORDS + ' to ' + MAX_WORDS + ' words (you entered ' + words + ').'; return; }
    if (!file) { errEl.textContent = 'Please choose the main file (PDF or DOCX).'; return; }
    if (!/\.(pdf|docx)$/i.test(file.name)) { errEl.textContent = 'The main file must be a PDF or DOCX.'; return; }
    if (file.size > MAX_BYTES) { errEl.textContent = 'The main file is larger than 20 MB.'; return; }
    if (type === 'research' && !imrad) { errEl.textContent = 'IMRAD file is required for a research paper.'; return; }
    if (imrad) {
      if (!/\.(pdf|docx)$/i.test(imrad.name)) { errEl.textContent = 'IMRAD file must be a PDF or DOCX.'; return; }
      if (imrad.size > MAX_BYTES) { errEl.textContent = 'IMRAD file is larger than 20 MB.'; return; }
    }

    var fd = new FormData();
    fd.append('title', title);
    fd.append('course', course);
    fd.append('academic_year', year);
    fd.append('adviser_name', adviser);
    fd.append('submission_type', type);
    fd.append('abstract', abstractText);
    if (authors) fd.append('authors', authors);
    fd.append('file', file);
    if (imrad) fd.append('imrad_file', imrad);

    submit.disabled = true;
    var oldText = submit.textContent;
    submit.textContent = 'Uploading...';
    try {
      var res = await fetch(API + '/thesis/librarian-upload', {
        method: 'POST',
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + token() },
        body: fd
      });
      var data = {};
      try { data = await res.json(); } catch (e) { /* non-JSON response */ }
      if (res.ok && data.success) {
        toast('Document added to the repository.');
        reset();
        closeModal();
        setTimeout(function () { location.reload(); }, 900);
      } else if (res.status === 422 && data.errors) {
        var first = Object.keys(data.errors)[0];
        errEl.textContent = data.errors[first][0];
      } else if (res.status === 403) {
        errEl.textContent = 'Your account is not allowed to add documents.';
      } else if (res.status === 401) {
        errEl.textContent = 'Session expired. Please sign in again.';
      } else {
        errEl.textContent = data.message || ('Upload failed (' + res.status + ').');
      }
    } catch (err) {
      errEl.textContent = 'Network error. Check your connection and try again.';
    } finally {
      submit.disabled = false;
      submit.textContent = oldText;
    }
  });
})();