# Gemini checklist review

Set `GEMINI_API_KEY` in the Railway backend service Variables. Create a key in
[Google AI Studio](https://aistudio.google.com/apikey). Do not put it in frontend
JavaScript, a committed `.env`, screenshots, or chat messages. Redeploy or
refresh the Laravel configuration cache after setting the variable.

`GEMINI_MODEL` defaults to `gemini-3.5-flash-lite` and can be changed on the
server. Its free-tier availability and limits depend on the Google project;
the app does not switch models or enable paid billing automatically.

**Check formatting** now performs the Gemini review and creates the formatted
copy in one action. The separate Gemini button has been removed. This action
sends paper text and the selected admin checklist to Google. Free-tier data handling is described in
[Google's pricing and data-use information](https://ai.google.dev/gemini-api/docs/pricing).

`POST /api/papers/ai-check` requires a Sanctum bearer token and multipart fields
`file` (DOCX, up to 20 MB) and `template_id`. The server loads the active saved
template through the same resolver as the formatting API. Client rules are ignored.
Uploads are validated using the Word ZIP package, content types and document
XML, rather than MIME guessing alone. Valid exported DOCX files remain
uploadable when fileinfo identifies them as generic binary or ZIP files.

`POST /api/papers/check-and-fix` accepts the same fields and returns the advisory
review plus `document_base64` and a formatter `report`. Formatting uses the
server-saved admin rules; Gemini cannot silently override them. Preview and
download share this returned file. The original remains unchanged.

Gemini also returns `formatting_rules`, each tied to an original `rule_index`
with a verbatim evidence quote. The combined endpoint validates the quote,
scope, values and conflicts before passing supported mappings to the formatter.
Supported mappings cover fonts, point sizes, body/abstract/CV line spacing,
side-specific margins, alignment, first-line indentation, paper size and
heading gaps. Explicit admin settings retain precedence. Unsupported, optional,
ambiguous or unsubstantiated mappings are skipped and reported for review.
`report.gemini_formatting` records validated mappings and warnings. This helps
with written checklist phrasing the deterministic parser does not recognize;
it does not generate missing research content or prove visual compliance.

The combined response also includes `attention_document_base64` and
`attention_issues`. Needs attention displays this annotated original: yellow
highlights identify affected paragraphs and red suggestions appear in the left
sidebar cards. Bookmarks connect located cards to their rendered page without
adding inline notes or changing the paper's text. Clicking a located card
scrolls to the issue and adds a yellow outline; margin cards also mark the page
boundary. Findings without an exact location do not offer a page jump.
Explicit paragraph line spacing and section margins are compared with
the selected template. Inherited or unverifiable settings are not treated as
confirmed failures. AI content failures remain advisory. Fix paper displays the
separate corrected copy without these annotations.
Body spacing checks exclude graphic/text-box/table layout, respect abstract
and CV scopes, and do not compare point-based exact spacing with line multiples.
Rechecking the fixed copy evaluates that uploaded document again; it does not
reuse the original paper's errors or mark every item passed because it was fixed.

The response includes an advisory summary and a finding for every checklist
rule, with status, explanation, paragraph reference, and suggestion. Exact
printed layout checks are marked manual. This endpoint does not rewrite or
auto-submit the paper. Only validated checklist formatting mappings are applied;
content suggestions are not automatically rewritten into the manuscript.
Inputs are limited to 500,000 encoded bytes; larger papers are rejected rather
than silently truncated. Missing keys, timeouts, quota errors, incomplete reviews,
invalid JSON are reported explicitly. Missing checklist findings and unverified
paragraph references are marked manual, with warnings, rather than discarding
all valid findings. A partial review is never presented as complete compliance.

The integration uses Google's [Interactions REST API](https://ai.google.dev/gemini-api/docs/text-generation)
and [structured JSON output](https://ai.google.dev/gemini-api/docs/structured-output),
with `store: false`. No additional PHP package is needed.

Tests mock Google requests. A live smoke test requires the server API key.
