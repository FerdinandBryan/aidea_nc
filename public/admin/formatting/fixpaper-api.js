/* The selected server template is authoritative for both preview and download. */
(function () {
    var endpoint = 'https://aideanc-production.up.railway.app/api/papers/fix';
    var cached = null;
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
})();
