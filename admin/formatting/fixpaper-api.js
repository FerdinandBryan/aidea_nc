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
        var revision=window._dvFixRevision;
        var key = String(templateId) + ':' + String(revision || 0);
        // Use the corrected document paired with the current attention review.
        if(pendingCheck && pendingCheck.revision===revision)await pendingCheck.promise;
        if(window._dvFixRevision!==revision || window._dvFixTemplateId!==templateId || _dvLastFile!==file)throw new Error('The paper or template changed. Open the latest preview again.');
        if(window._dvAttentionResult && window._dvAttentionResult.revision===revision && (!cached || cached.file!==file || cached.key!==key)) {
            throw new Error('The corrected copy for this checklist review is unavailable. Run Check formatting again.');
        }
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

    var pendingCheck = null;
    async function checkAndFixPaper() {
        var file = _dvLastFile, templateId = window._dvFixTemplateId;
        var revision = window._dvFixRevision;
        window._dvAttentionResult = null;
        window._dvAttentionError = null;
        if (!file || templateId == null) return;
        var old = document.getElementById('dvGeminiReview');
        if (old) old.remove();

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
                window._dvAttentionResult = {revision:revision,blob:new Blob([markedBytes],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}),issues:data.attention_issues || [],objects:data.attention_objects || [],manualChecks:(data.review && data.review.findings || []).filter(function(f){return f.status==='manual';}).length,fixedValidation:data.report && data.report.fixed_validation};
                document.querySelectorAll('[data-dv-attention]').forEach(function (button) {
                    button.textContent = 'Preview Needs attention (' + (data.attention_issues || []).length + ')';
                });
            }
            var findings=data.review && data.review.findings || [];
            findings.forEach(function(finding){
                var row=document.querySelector('[data-dv-checklist-rule="'+finding.rule_index+'"]');
                var name=row && row.querySelector('.dv-rule-name');
                if(!name || name.textContent.trim()!==finding.rule)return;
                if(finding.status==='manual' && row.classList.contains('dv-rule-found'))return;
                row.classList.remove('dv-rule-found','dv-rule-fail','dv-rule-manual');
                row.classList.add(finding.status==='pass'?'dv-rule-found':finding.status==='fail'?'dv-rule-fail':'dv-rule-manual');
                var status=row.querySelector('.dv-rule-status');if(status)status.textContent='AI review: '+finding.explanation;
                var icon=row.querySelector('.dv-rule-top > span');if(icon)icon.textContent=finding.status==='pass'?'Pass':finding.status==='fail'?'Issue':'Review';
            });
            var passed=findings.filter(function(f){return f.status==='pass';}).length;
            var manual=findings.filter(function(f){return f.status==='manual';}).length;
            document.querySelectorAll('[data-dv-checklist-summary]').forEach(function(summary){
                var issues=data.attention_issues || [];
                var formatting=issues.filter(function(issue){return issue.type!=='content';}).length;
                summary.textContent='Formatting: '+formatting+' detected issues - Content: '+(issues.length-formatting)+' advisory findings - '+manual+' checklist items require manual review - '+passed+' checklist items passed'+(data.partial?' - review incomplete':'');
            });
            cached = {file:file,key:String(templateId)+':'+String(revision),promise:Promise.resolve(fixed)};
        } catch (error) {
            if(window._dvFixRevision===revision){
                window._dvAttentionError=error.message;
                document.querySelectorAll('[data-dv-attention]').forEach(function(button){button.textContent='Preview Needs attention (check failed)';});
                document.querySelectorAll('[data-dv-checklist-summary]').forEach(function(summary){summary.textContent='Checklist check could not complete: '+error.message;});
            }
        }

    }
    window._dvCheckAndFixPaper = function () {
        var revision=window._dvFixRevision;
        if(pendingCheck && pendingCheck.revision===revision)return pendingCheck.promise;
        if(window._dvAttentionResult && window._dvAttentionResult.revision===revision)return Promise.resolve();
        var promise=checkAndFixPaper();
        var task={revision:revision,promise:promise};pendingCheck=task;
        promise.finally(function(){if(pendingCheck===task)pendingCheck=null;});
        return promise;
    };
    window._dvPreviewAttention = async function () {
        var old = document.getElementById('dvPrevOverlay');
        if (old) { if (old.dismiss) old.dismiss(); else old.remove(); }
        var overlay = document.createElement('div');
        overlay.id = 'dvPrevOverlay'; overlay.className = 'dv-attention';
        var css = document.createElement('style');
        css.textContent = `
        .dv-attention *{box-sizing:border-box}
        .dv-attention .attention-dialog{display:flex;flex-direction:column;height:92vh;overflow:hidden!important;padding:0!important;width:min(1380px,100%)!important;border:1px solid #374151;box-shadow:0 24px 80px #0008}
        .dv-attention .attention-header{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:18px 22px;border-bottom:1px solid #374151;flex:none}
        .dv-attention h3{margin:0;font-size:18px;color:#f9fafb}
        .dv-attention button{cursor:pointer;border:1px solid #475569;background:#1e293b;color:#f1f5f9;border-radius:8px;padding:9px 12px;font:inherit;font-size:13px}
        .dv-attention button:hover{background:#334155}
        .dv-attention button:focus-visible{outline:2px solid #93c5fd;outline-offset:3px}
        .dv-attention .attention-layout{display:grid;grid-template-columns:300px minmax(0,1fr);flex:1;min-height:0}
        .dv-attention .attention-sidebar{padding:20px;overflow:auto;border-right:1px solid #374151;background:#0f172a;font-size:13px;line-height:1.6}
        .dv-attention .attention-legend{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 18px}
        .dv-attention .attention-yellow{background:#fef08a;color:#713f12;padding:4px 8px;border-radius:6px}
        .dv-attention .attention-red{background:#450a0a;color:#fecaca;padding:4px 8px;border-radius:6px}
        .dv-attention .attention-issues{list-style:none;padding:0;margin:12px 0;display:grid;gap:10px}
        .dv-attention .attention-issues li{padding:0}
        .dv-attention .attention-card{width:100%;text-align:left;white-space:normal;line-height:1.6;padding:12px;color:#fca5a5}
        .dv-attention .attention-object{color:#cbd5e1}
        .dv-attention .attention-card[aria-pressed=true]{border-color:#facc15;background:#293548}
        .dv-attention .attention-card:disabled{cursor:default;opacity:.8}
        .dv-attention .attention-target{outline:2px solid #facc15;outline-offset:4px;text-decoration:underline;text-decoration-color:#eab308;text-decoration-thickness:2px}
        .dv-attention .attention-margin-target{box-shadow:inset 0 0 0 3px #facc15!important}
        .dv-attention .attention-label{display:block;color:#fbbf24;font-weight:600;font-size:12px;margin-bottom:5px}
        .dv-attention .attention-paper{overflow:auto;min-width:0;padding:20px;background:#64748b}
        .dv-attention .attention-status{padding:18px;background:#1e293b;border-radius:10px;color:#e2e8f0;font-size:14px}
        #dvPrevOverlay.dv-attention .docx-wrapper{background:transparent!important;padding:0!important}
        @media(max-width:800px){.dv-attention .attention-layout{grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr)}.dv-attention .attention-sidebar{max-height:180px;border-right:0;border-bottom:1px solid #374151;padding:12px 16px}.dv-attention .attention-header{padding:14px 16px}.dv-attention .attention-paper{padding:12px}}
        `;
        overlay.appendChild(css);
        overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;padding:16px;';
        var box = document.createElement('div'); box.className = 'attention-dialog';
        box.style.cssText = 'background:#111827;color:#e5e7eb;border-radius:12px;width:min(1000px,100%);max-height:92vh;overflow:auto;padding:16px;';
        box.setAttribute('role','dialog'); box.setAttribute('aria-modal','true'); box.setAttribute('aria-label','Preview Needs attention');
        var close = document.createElement('button');
        var previousFocus = document.activeElement, observer;
        function dismiss(){if(observer)observer.disconnect();document.removeEventListener('keydown',onKey);overlay.remove();if(previousFocus&&previousFocus.isConnected)previousFocus.focus();}
        function onKey(e){if(e.key==='Escape'){e.preventDefault();dismiss();}else if(e.key==='Tab'){var buttons=Array.from(box.querySelectorAll('button'));var first=buttons[0],last=buttons[buttons.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}
        overlay.dismiss=dismiss;
        close.type = 'button'; close.textContent = 'Close'; close.onclick = dismiss;
        var header=document.createElement('div');header.className='attention-header';
        var title = document.createElement('h3'); title.textContent = 'Preview Needs attention'; header.appendChild(title);header.appendChild(close);box.appendChild(header);
        var layout=document.createElement('div');layout.className='attention-layout';box.appendChild(layout);
        var sidebar=document.createElement('aside');sidebar.className='attention-sidebar';sidebar.setAttribute('aria-label','Detected issues');layout.appendChild(sidebar);
        var legend = document.createElement('p');
        legend.className='attention-legend';
        [['attention-yellow','Yellow: affected text'],['attention-red','Red: issue notes']].forEach(function(entry){var badge=document.createElement('span');badge.className=entry[0];badge.textContent=entry[1];legend.appendChild(badge);});
        sidebar.appendChild(legend);
        var advisory=document.createElement('p');advisory.textContent='These cards describe the uploaded paper. Formatting corrections appear in Fix paper. AI content findings and unverifiable rules require review.';sidebar.appendChild(advisory);
        overlay.appendChild(box); document.body.appendChild(overlay);
        overlay.onclick = function(e){if(e.target===overlay)dismiss();}; document.addEventListener('keydown',onKey);close.focus();
        var result = window._dvAttentionResult;
        if (!result || result.revision !== window._dvFixRevision) {
            var waiting=document.createElement('div');waiting.className='attention-paper';
            var progress=document.createElement('div');progress.className='attention-status';progress.setAttribute('role','status');
            progress.textContent='Preparing marked paper. This preview will open automatically when the check finishes...';waiting.appendChild(progress);layout.appendChild(waiting);
            var requestedRevision=window._dvFixRevision;
            await window._dvCheckAndFixPaper();
            if(!overlay.isConnected)return;
            result=window._dvAttentionResult;
            if(requestedRevision!==window._dvFixRevision){progress.textContent='The paper or template changed. Open the preview for the latest check.';return;}
            if(!result || result.revision!==requestedRevision){progress.textContent=window._dvAttentionError ? 'Could not prepare the preview: '+window._dvAttentionError : 'Choose a paper and admin template, then run Check formatting.';return;}
            waiting.remove();
        }
        var count=document.createElement('strong');
        var formattingCount=result.issues.filter(function(issue){return issue.type!=='content';}).length;
        count.textContent='Formatting: '+formattingCount+' detected issues';sidebar.appendChild(count);
        var breakdown=document.createElement('div');breakdown.textContent='Content: '+(result.issues.length-formattingCount)+' advisory findings. '+(result.manualChecks || 0)+' checklist items require manual review.';sidebar.appendChild(breakdown);
        var list = document.createElement('ul');list.className='attention-issues';
        var cards=[];
        var entries=result.issues.concat(result.objects || []);
        entries.forEach(function(issue){
            var item = document.createElement('li');
            var card=document.createElement('button');card.type='button';card.className='attention-card';card.disabled=true;card.setAttribute('aria-pressed','false');
            var label=document.createElement('span');label.className='attention-label';
            var objectLabels={figure:'Figure detected',table:'Word table detected',image:'Image - figure unconfirmed',caption:'Caption - object unconfirmed'};
            var findingLabels={missing_section:'Missing required section',misplaced_section:'Section in wrong position'};
            var propertyLabels={font:'Font',size:'Font size',paper:'Paper size'};
            var category=findingLabels[issue.issue_kind] || propertyLabels[issue.type] || objectLabels[issue.type] || (issue.type==='appendix-title'?'Appendix title':issue.type==='content'?'Wording / checklist':issue.type==='margin'?'Margin':'Spacing');
            if(objectLabels[issue.type])card.classList.add('attention-object');
            label.textContent=category+(issue.paragraph?' - Paragraph '+issue.paragraph:' - No exact location');card.appendChild(label);
            var message=document.createElement('span');message.textContent=issue.message;card.appendChild(message);
            if(['spacing','margin','appendix-title'].includes(issue.type) && result.fixedValidation && !(result.fixedValidation.remaining_formatting_issues || []).length){
                var resolved=document.createElement('span');resolved.textContent='Corrected in Fix paper';resolved.style.cssText='display:block;color:#86efac;font-size:12px;margin-top:8px;';card.appendChild(resolved);
            }
            item.appendChild(card);list.appendChild(item);
            cards.push({button:card,label:label,issue:issue,category:category});
        });
        if((result.objects || []).length){var inventory=document.createElement('p');inventory.textContent=result.objects.length+' figure / table detections (review classifications below)';sidebar.appendChild(inventory);}
        sidebar.appendChild(list);
        if (!result.issues.length) {
            var notice = document.createElement('p');
            notice.textContent = 'No confirmed issues were found to mark. Unverifiable rules still require manual review.';
            sidebar.appendChild(notice);
        }
        var download=document.createElement('button');download.type='button';download.textContent='Download marked copy';download.onclick=function(){_dvTriggerDownload(result.blob,_dvBaseName(_dvLastFile.name)+'_needs_attention.docx');};sidebar.appendChild(download);
        var holder = document.createElement('div');holder.className='attention-paper';layout.appendChild(holder);
        var status=document.createElement('div');status.className='attention-status';status.setAttribute('role','status');status.textContent='Loading marked paper...';holder.appendChild(status);
        var paper=document.createElement('div');holder.appendChild(paper);
        try {
            await window._dvLoadPreviewLib();
            if (window._dvEnsurePagination) window._dvEnsurePagination();
            if(!overlay.isConnected)return;
            await window.docx.renderAsync(result.blob,paper,null,{className:'docx',inWrapper:true,breakPages:true,ignoreLastRenderedPageBreak:false,renderComments:false});
            status.remove();
            var sheets=Array.from(paper.querySelectorAll('section.docx'));
            cards.forEach(function(entry){
                var anchor=entry.issue.anchor && paper.querySelector('[id="'+entry.issue.anchor+'"]');
                var target=anchor && anchor.closest('p');var page=target && target.closest('section.docx');
                if(!target || !page){entry.label.textContent=entry.category+' - No exact location';return;}
                var pageNumber=sheets.indexOf(page)+1;
                entry.label.textContent=entry.category+' - Page '+pageNumber;
                entry.button.disabled=false;
                entry.button.setAttribute('aria-label',entry.category+' issue on page '+pageNumber+': '+entry.issue.message);
                entry.button.onclick=function(){
                    paper.querySelectorAll('.attention-target,.attention-margin-target').forEach(function(node){node.classList.remove('attention-target','attention-margin-target');});
                    cards.forEach(function(other){other.button.setAttribute('aria-pressed','false');});
                    entry.button.setAttribute('aria-pressed','true');target.classList.add('attention-target');
                    if(entry.issue.type==='margin')page.classList.add('attention-margin-target');
                    var destination=entry.issue.type==='margin'?page:target;
                    holder.scrollTo({top:Math.max(0,holder.scrollTop+destination.getBoundingClientRect().top-holder.getBoundingClientRect().top-24),behavior:'smooth'});
                };
            });
            function fitPaper(){paper.querySelectorAll('section.docx').forEach(function(page){page.style.zoom='1';var width=page.offsetWidth;var computed=getComputedStyle(holder);var available=holder.clientWidth-parseFloat(computed.paddingLeft)-parseFloat(computed.paddingRight);if(width>available&&available>0)page.style.zoom=String(available/width);});}
            if(overlay.isConnected){fitPaper();observer=new ResizeObserver(fitPaper);observer.observe(holder);}
        } catch(error){status.textContent='Could not display attention copy: '+error.message;}
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
