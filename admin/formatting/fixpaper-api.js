/* The selected server template is authoritative for both preview and download. */
(function () {
    var endpoint = 'https://aideanc-production.up.railway.app/api/papers/fix';
    var cached = null;
    window._dvInvalidateFixedCopy = function () { cached = null; };
    _dvGenerateFixedDocx = async function (file) {
        var templateId = window._dvFixTemplateId;
        if (templateId == null || templateId === '') throw new Error('Choose an admin template and run Check formatting first.');
        var token = localStorage.getItem('auth_token');
        if (!token) throw new Error('Sign in again to fix your paper.');
        var key = String(templateId) + ':' + String(window._dvFixRevision || 0);
        if (cached && cached.file === file && cached.key === key) return cached.promise;
        var promise = (async function () {
            var bytes = await _resolveArrayBuffer(file);
            var form = new FormData();
            form.append('file', new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), file.name || 'paper.docx');
            form.append('template_id', String(templateId));
            form.append('include_report', '1');
            var response = await fetch(endpoint, {
                method: 'POST', headers: { Accept: 'application/json', Authorization: 'Bearer ' + token }, body: form
            });
            if (!response.ok) {
                var error = await response.json().catch(function () { return {}; });
                var messages = error.errors ? Object.values(error.errors).flat().join(' ') : error.message;
                throw new Error(messages || 'Paper formatting failed (HTTP ' + response.status + ').');
            }
            var blob;
            if ((response.headers.get('Content-Type') || '').includes('application/json')) {
                var result = await response.json();
                if (!result.document_base64) throw new Error('The formatting API did not return a corrected document.');
                var binary = atob(result.document_base64);
                var data = new Uint8Array(binary.length);
                for (var i = 0; i < binary.length; i++) data[i] = binary.charCodeAt(i);
                blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
                blob.formattingReport = result.report;
            } else {
                // Allow the frontend to work while the backend update deploys.
                blob = await response.blob();
            }
            if (!blob.size) throw new Error('The formatting API returned an empty document.');
            return blob;
        })();
        cached = { file: file, key: key, promise: promise };
        try { return await promise; }
        catch (error) { if (cached && cached.promise === promise) cached = null; throw error; }
    };

    async function checkWithGemini(button) {
        var file = _dvLastFile, templateId = window._dvFixTemplateId;
        var revision = window._dvFixRevision;
        var parent = document.getElementById('docValidationBody');
        if (!parent || !file || templateId == null) return;
        var old = document.getElementById('dvGeminiReview');
        if (old) old.remove();
        var panel = document.createElement('section');
        panel.id = 'dvGeminiReview';
        panel.style.cssText = 'padding:16px;margin:14px 0;border:1px solid #374151;border-radius:10px;';
        panel.textContent = 'Gemini is reviewing this paper against the selected admin checklist...';
        parent.insertBefore(panel, parent.firstChild);
        button.disabled = true;
        try {
            var form = new FormData();
            form.append('file', new Blob([await _resolveArrayBuffer(file)], {type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}), file.name || 'paper.docx');
            form.append('template_id', String(templateId));
            var response = await fetch('https://aideanc-production.up.railway.app/api/papers/ai-check', {
                method:'POST', headers:{Accept:'application/json',Authorization:'Bearer '+localStorage.getItem('auth_token')}, body:form
            });
            var data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Gemini review failed.');
            if (window._dvFixRevision !== revision) return;
            panel.textContent = '';
            var title = document.createElement('strong');
            title.textContent = 'Gemini review — ' + data.template;
            panel.appendChild(title);
            var summary = document.createElement('p');
            summary.textContent = data.review.summary;
            panel.appendChild(summary);
            var note = document.createElement('p');
            note.textContent = 'AI findings are advisory. Exact page layout still needs the formatter and visual review.';
            panel.appendChild(note);
            var list = document.createElement('ul');
            data.review.findings.forEach(function (finding) {
                var item = document.createElement('li');
                item.textContent = finding.status.toUpperCase() + ' — ' + finding.rule + ': ' +
                    finding.explanation + (finding.paragraph ? ' (Paragraph ' + finding.paragraph + ')' : '') +
                    (finding.suggestion ? ' Suggestion: ' + finding.suggestion : '');
                list.appendChild(item);
            });
            panel.appendChild(list);
        } catch (error) { panel.textContent = 'Could not complete Gemini review: ' + error.message; }
        finally { button.disabled = false; }
    }
    function addGeminiButtons() {
        document.querySelectorAll('.dv-download-row').forEach(function (row) {
            if (row.querySelector('[data-dv-gemini]')) return;
            var button = document.createElement('button');
            button.type = 'button'; button.className = 'btn-modal-close';
            button.setAttribute('data-dv-gemini', '1');
            button.textContent = 'AI checklist review (Gemini)';
            button.title = 'Sends this paper and the selected admin checklist to Google Gemini for an advisory review.';
            button.onclick = function () { checkWithGemini(button); };
            row.appendChild(button);
        });
    }
    addGeminiButtons();
    new MutationObserver(addGeminiButtons).observe(document.body, {childList:true,subtree:true});})();
