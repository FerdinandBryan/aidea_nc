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

    window._dvCheckAndFixPaper = async function () {
        var file = _dvLastFile, templateId = window._dvFixTemplateId;
        var revision = window._dvFixRevision;
        window._dvAttentionResult = null;
        var parent = document.getElementById('docValidationBody');
        if (!parent || !file || templateId == null) return;
        var old = document.getElementById('dvGeminiReview');
        if (old) old.remove();
        var panel = document.createElement('section');
        panel.id = 'dvGeminiReview';
        panel.style.cssText = 'padding:16px;margin:14px 0;border:1px solid #374151;border-radius:10px;';
        panel.textContent = 'Checking the paper against the admin checklist and preparing its formatted copy...';
        parent.insertBefore(panel, parent.firstChild);

        try {
            var form = new FormData();
            form.append('file', new Blob([await _resolveArrayBuffer(file)], {type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}), file.name || 'paper.docx');
            form.append('template_id', String(templateId));
            var response = await fetch('https://aideanc-production.up.railway.app/api/papers/check-and-fix', {
                method:'POST', headers:{Accept:'application/json',Authorization:'Bearer '+localStorage.getItem('auth_token')}, body:form
            });
            var data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Gemini review failed.');
            if (window._dvFixRevision !== revision) return;
            if (!data.document_base64) throw new Error('The server did not return a formatted paper.');
            var binary = atob(data.document_base64);
            var bytes = new Uint8Array(binary.length);
            for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            var fixed = new Blob([bytes], {type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
            fixed.formattingReport = data.report;
            if (data.attention_document_base64) {
                var annotated = atob(data.attention_document_base64);
                var markedBytes = new Uint8Array(annotated.length);
                for (var j = 0; j < annotated.length; j++) markedBytes[j] = annotated.charCodeAt(j);
                window._dvAttentionResult = {revision:revision,blob:new Blob([markedBytes],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}),issues:data.attention_issues || []};
                document.querySelectorAll('[data-dv-attention]').forEach(function (button) {
                    button.textContent = 'Preview Needs attention (' + (data.attention_issues || []).length + ')';
                });
            }
            cached = {file:file,key:String(templateId)+':'+String(revision),promise:Promise.resolve(fixed)};
            panel.textContent = '';
            var title = document.createElement('strong');
            title.textContent = 'Checklist review — ' + data.template;
            panel.appendChild(title);
            var summary = document.createElement('p');
            summary.textContent = data.review.summary;
            panel.appendChild(summary);
            var note = document.createElement('p');
            note.textContent = 'The formatted copy is ready for preview and download. AI content findings are advisory.';
            panel.appendChild(note);
            (data.warnings || []).forEach(function (warning) {
                var message = document.createElement('p'); message.textContent = warning; panel.appendChild(message);
            });
            var list = document.createElement('ul');
            data.review.findings.forEach(function (finding) {
                var item = document.createElement('li');
                item.textContent = finding.status.toUpperCase() + ' — ' + finding.rule + ': ' +
                    finding.explanation + (finding.paragraph ? ' (Paragraph ' + finding.paragraph + ')' : '') +
                    (finding.suggestion ? ' Suggestion: ' + finding.suggestion : '');
                list.appendChild(item);
            });
            panel.appendChild(list);
        } catch (error) { panel.textContent = 'Could not check and format this paper: ' + error.message; }

    }
    window._dvPreviewAttention = async function () {
        var old = document.getElementById('dvPrevOverlay');
        if (old) old.remove();
        var overlay = document.createElement('div');
        overlay.id = 'dvPrevOverlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;padding:16px;';
        var box = document.createElement('div');
        box.style.cssText = 'background:#111827;color:#e5e7eb;border-radius:12px;width:min(1000px,100%);max-height:92vh;overflow:auto;padding:16px;';
        box.setAttribute('role','dialog'); box.setAttribute('aria-modal','true'); box.setAttribute('aria-label','Preview Needs attention');
        var close = document.createElement('button');
        close.type = 'button'; close.textContent = 'Close'; close.onclick = function(){overlay.remove();};
        box.appendChild(close);
        var title = document.createElement('h3'); title.textContent = 'Preview Needs attention'; box.appendChild(title);
        var legend = document.createElement('p');
        legend.textContent = 'Yellow: affected original text. Red: issue and required template setting. AI content findings are advisory.';
        box.appendChild(legend);
        overlay.appendChild(box); document.body.appendChild(overlay);
        overlay.onclick = function(e){if(e.target===overlay)overlay.remove();};
        var result = window._dvAttentionResult;
        if (!result || result.revision !== window._dvFixRevision) {
            legend.textContent = 'Run Check formatting and wait for the check to finish before opening this preview.';
            return;
        }
        var list = document.createElement('ul');
        result.issues.forEach(function(issue){
            var item = document.createElement('li'); item.textContent = issue.message; list.appendChild(item);
        });
        box.appendChild(list);
        if (!result.issues.length) {
            var notice = document.createElement('p');
            notice.textContent = 'No confirmed issues were found to mark. Unverifiable rules still require manual review.';
            box.appendChild(notice);
        }
        var holder = document.createElement('div');
        box.appendChild(holder);
        try {
            await window._dvLoadPreviewLib();
            if (window._dvEnsurePagination) window._dvEnsurePagination();
            await window.docx.renderAsync(result.blob,holder,null,{className:'docx',inWrapper:true,breakPages:true,ignoreLastRenderedPageBreak:false,renderComments:false});
        } catch(error){holder.textContent='Could not display attention copy: '+error.message;}
    };
    var previousRedlineDownload = window._dvDownloadRedline;
    window._dvDownloadRedline = async function(){
        var result=window._dvAttentionResult;
        if(result && result.revision===window._dvFixRevision){
            _dvTriggerDownload(result.blob,_dvBaseName(_dvLastFile.name)+'_needs_attention.docx');
            return;
        }
        if(previousRedlineDownload) return previousRedlineDownload();
    };})();
