# TOC pagination integration

This integration is disabled by default. Do not enable it until the Writer/UNO
integration has been tested on the backend image. Existing formatting continues
to work, with an explicit unverified-TOC warning when synchronization is disabled.

Linux backend requirements: `libreoffice-writer`, `python3-uno`, and fonts matching
the selected admin template (including suitable licensed or metrically compatible
fonts). Both `python3` and `soffice` must be available on PATH.

The isolated renderer uses a private LibreOffice profile per request, disables
macros and load-time link updates, restarts Chapter 1 numbering, updates supported
existing TOC rows until pagination converges, and exports DOCX and PDF together.
Ambiguous entries retain their original values and are listed for review. The
preview uses the exported PDF so browser pagination cannot introduce a second,
different page-number sequence. Word can still reflow a DOCX on a computer with
different fonts or printer settings.

Before setting `PAPER_PAGINATION_ENABLED=true`, validate all of:

- Manual TOCs with tabs and typed dot leaders, and Word-generated TOCs.
- Split and combined chapter headings; duplicated subsection titles by chapter.
- Chapter 1 visibly starts at 1, later sections continue without resets.
- Title/preliminary pages and existing template headers/footers are preserved.
- Tables, photographs, section geometry, and all thesis text survive the reflow.
- Every matched TOC target agrees with its printed number in the exported PDF.
- Two consecutive fixes produce stable numbering, including TOCs spanning pages.
- Concurrent requests use separate profiles; failed/timed-out rendering preserves
  the pre-rendered DOCX and deletes job files.

Run the guarded API checks without requiring LibreOffice:

    php artisan test tests/Feature/PaperPaginationTest.php

Run a renderer job on the Linux deployment image with a private directory
containing `input.docx`:

    python3 scripts/paginate-paper.py /usr/bin/soffice /absolute/private/job

Inspect `result.json`, `output.docx`, and `output.pdf`. A complete result can still
contain unmatched-entry warnings; these must be visible to the reviewer.
