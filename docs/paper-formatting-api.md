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

When the selected template has an uploaded DOCX reference, that document is
the formatting source. The formatter copies its paragraph/run properties,
inherited styles, heading gaps, page-break properties and page geometry.
Custom styles with inherited outline levels work without chapter labels.
Page starts stored in leading runs, empty break paragraphs or preceding section
boundaries are transferred to the matching paragraph. Page-break properties
are materialized as equivalent leading run breaks for the browser renderer.
Combined chapter labels/titles can match separate student paragraphs without
adding a second page break. The preview reserves the following paragraph with
a keep-with-next heading when that paragraph fits within a printable page.
Heading text and structure select the source paragraph; body paragraphs use
the matching section's sample where available. Student titles and content
are preserved. Checklist-only cover placement, chapter breaks and appendix
typography are not applied over a DOCX reference.
Minor heading-word variations can match a unique template heading using
normalized word overlap. At least three significant words, strong overlap,
and a clear lead over competing headings are required. Ambiguous matches
remain for review. Dot-leader and TOC-style entries are excluded from heading
matching so they cannot supply a section's typography or indentation.
Paragraph-based covers are filled by content blocks rather than paragraph
indices. Shared text anchors and formatting identify the title, submission
statement, author and date blocks; the template's blank paragraphs and fixed
text are retained. Multi-paragraph student titles can fill a single template
title paragraph. Student names, degree text and date replace variable examples,
and extra names are retained. Remaining template placeholders are reported
for completion. Ambiguous covers or covers containing graphics/fields retain
their content and require review rather than silently losing student text.

Template headings written as alternatives using `or` can match either student
title. Matching is scoped to the corresponding chapter. Two or more bold,
bracketed heading examples with identical formatting can supply that chapter's
repeatable heading style for researcher-defined topics; inconsistent examples
require review. Bracketed instructions are not treated as heading examples.
In browser previews, line-based paragraph gaps are converted using the rendered
paragraph's measured line height, including documents needing no extra page breaks.

The report includes `template_mapping` and lists ambiguous or unmatched
paragraphs under `manual_review_rules`. It also identifies preserved tables,
embedded objects, headers/footers and templates with multiple sections that
need layout review. This is not a pixel-identical rendering guarantee.
Missing template sections are reported; their placeholder text is not inserted.
PDF/DOC reference files receive a validation error asking for an editable
DOCX, rather than silently using checklist rules as a replacement layout.

For templates without an attached reference, supported rules include font, font size, line spacing, abstract spacing,
margins, alignment, indentation, hanging reference indents, and the special
References/Appendices headings. Explicit rule `type`/`value` settings take
precedence over recognized descriptions. Paper size defaults to short bond
(US Letter), with A4 supported when specified by the template. Chapter headings
get explicit page breaks. A title page with a degree statement, authors and
date receives additional space between groups without changing line spacing.
Its vertical layout is estimated from text length; Word's rendering can vary.

Content criteria (citation accuracy, required argumentation, word counts and
section completeness) need review. Written checklist criteria remain part of
the content review; the attached DOCX controls reference formatting. Existing
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
