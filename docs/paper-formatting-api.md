# Paper formatting API

`GET /api/format-templates/{templateId}/formatting` returns the active admin
template's effective settings and revision, using Sanctum authentication.
It rejects missing, inactive or malformed templates rather than selecting a
different template. Formatting uses this same resolver for every request.

Templates saved through the existing admin-only `PUT /api/format-templates`
may include an optional `formatting` object with exact settings:

```json
{
  "font": "Times New Roman",
  "font_size": 12,
  "line_spacing": 2,
  "abstract_spacing": 1,
  "paper_size": "letter",
  "margins": {"left": 1.5, "right": 1, "top": 1, "bottom": 1},
  "alignment": "justified",
  "first_line_indent": 0.5
}
```

These server-saved values override prose checklist descriptions. The current
admin editor still edits written rules; exact settings can be saved through
the authenticated admin API. Supported paper sizes are `letter`, `a4`, and
`legal`; margins and indents are in inches. Paper uploads do not supply rules.

`POST /api/papers/fix` requires a Sanctum bearer token and multipart form data:

- `file`: Word `.docx`, up to 20 MB.
- `template_id`: ID of an active template saved in the admin Format Templates screen.

The response is a downloadable `_fixed.docx`. The server reads the template
from `format_templates`; it does not accept client-supplied rules or document
URLs. The original upload is unchanged. The temporary output is private and
deleted after the response is streamed.

Set `include_report=1` to receive JSON with `document_base64` and `report`.
The report identifies the saved template, resolved settings, processed
paragraph count, recognized formatting rules, and rules needing manual review.
The preview displays this report and decodes the same file used for download.
This reports recognized rule coverage, not a guarantee that every natural-language
criterion or every rendered page has been independently verified.

Supported rules include font, font size, line spacing, abstract spacing,
margins, alignment, indentation, hanging reference indents, and the special
References/Appendices headings. Explicit rule `type`/`value` settings take
precedence over recognized descriptions. Paper size defaults to short bond
(US Letter), with A4 supported when specified by the template. Chapter headings
get explicit page breaks. A title page with a degree statement, authors and
date receives additional space between groups without changing line spacing.
Its vertical layout is estimated from text length; Word's rendering can vary.

Content criteria (citation accuracy, required argumentation, word counts and
section completeness) need review. An attached template reference document
is not treated as a replacement for the template's written rules. Existing
pagination headers are preserved rather than rebuilt.

The browser API client captures the template ID when the format check runs.
Preview and download share the returned document for that check. A new check
invalidates the cached result. API failures are shown to the user; the browser
does not silently fall back to the previous local fixer.

Deploy the Laravel backend with the new controller, service and route before
testing the frontend. PHP's DOM, ZIP and mbstring extensions are required. No
new Composer dependencies, database migrations or third-party AI keys are needed.

Validation:

```shell
php vendor/bin/phpunit tests/Unit/PaperFormatterTest.php tests/Feature/PaperFormattingApiTest.php
php artisan route:list --path=papers/fix
```
