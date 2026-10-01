(function () {
  var API = 'https://aideanc-production.up.railway.app/api';
  var modal = document.getElementById('uploadModal');
  var openBtn = document.getElementById('addDocBtn');
  var submit = document.getElementById('upSubmit');
  var errEl = document.getElementById('upErr');
  if (!modal || !openBtn || !submit) return;

  var ids = ['upTitle', 'upAuthors', 'upYear', 'upCourse', 'upAdviser', 'upAbstract', 'upFile'];
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

  function openModal() { errEl.textContent = ''; modal.hidden = false; el('upTitle').focus(); }
  function closeModal() { modal.hidden = true; }
  function reset() { ids.forEach(function (i) { el(i).value = ''; }); errEl.textContent = ''; }

  openBtn.addEventListener('click', openModal);
  modal.addEventListener('click', function (e) {
    if (e.target === modal || e.target.closest('[data-upload-close]')) closeModal();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

  submit.addEventListener('click', async function () {
    errEl.textContent = '';
    var title = el('upTitle').value.trim();
    var authors = el('upAuthors').value.trim();
    var year = el('upYear').value.trim();
    var file = el('upFile').files[0];

    if (!title || !authors || !year) { errEl.textContent = 'Title, author(s) and academic year are required.'; return; }
    if (!file) { errEl.textContent = 'Please choose a PDF file.'; return; }
    if (!/\.pdf$/i.test(file.name)) { errEl.textContent = 'Only PDF files are allowed.'; return; }
    if (file.size > 20 * 1024 * 1024) { errEl.textContent = 'File is larger than 20 MB.'; return; }

    var fd = new FormData();
    fd.append('title', title);
    fd.append('authors', authors);
    fd.append('academic_year', year);
    if (el('upCourse').value.trim()) fd.append('course', el('upCourse').value.trim());
    if (el('upAdviser').value.trim()) fd.append('adviser_name', el('upAdviser').value.trim());
    if (el('upAbstract').value.trim()) fd.append('abstract', el('upAbstract').value.trim());
    fd.append('file', file);

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