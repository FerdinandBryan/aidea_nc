# Gemini checklist review

Set `GEMINI_API_KEY` in the Railway backend service Variables. Create a key in
[Google AI Studio](https://aistudio.google.com/apikey). Do not put it in frontend
JavaScript, a committed `.env`, screenshots, or chat messages. Redeploy or
refresh the Laravel configuration cache after setting the variable.

`GEMINI_MODEL` defaults to `gemini-3.5-flash-lite` and can be changed on the
server. Its free-tier availability and limits depend on the Google project;
the app does not switch models or enable paid billing automatically.

Use the **AI checklist review (Gemini)** button after Check formatting. This is
an explicit, separate action because the paper text and selected admin checklist
are sent to Google. Free-tier data handling is described in
[Google's pricing and data-use information](https://ai.google.dev/gemini-api/docs/pricing).

`POST /api/papers/ai-check` requires a Sanctum bearer token and multipart fields
`file` (DOCX, up to 20 MB) and `template_id`. The server loads the active saved
template through the same resolver as the formatting API. Client rules are ignored.

The response includes an advisory summary and a finding for every checklist
rule, with status, explanation, paragraph reference, and suggestion. Exact
printed layout checks are marked manual. This endpoint does not rewrite or
auto-submit the paper and does not change the deterministic formatter's rules.
Inputs are limited to 500,000 encoded bytes; larger papers are rejected rather
than silently truncated. Missing keys, timeouts, quota errors, incomplete reviews,
invalid JSON and invalid paragraph references are reported explicitly.

The integration uses Google's [Interactions REST API](https://ai.google.dev/gemini-api/docs/text-generation)
and [structured JSON output](https://ai.google.dev/gemini-api/docs/structured-output),
with `store: false`. No additional PHP package is needed.

Tests mock Google requests. A live smoke test requires the server API key.
