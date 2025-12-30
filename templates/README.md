# Call JSON template notes

Use `templates/call.json` as the starting point for each earnings call brief.

Requirements
- Store ONLY recreated summaries/analyst notes.
- Do NOT include or paste any transcript text.
- `source_links` are intentionally omitted and should not be added.

Where to save
- `calls/<TICKER>/FY####Q#.json` (one file per quarter per company).

Minimum fields
- `company`, `ticker`, `fyq`, `call_date`, `tldr`, `bullets`.

Completeness badge
- The brief is marked "Incomplete" if key sections are missing (participants, deep dive, Q&A, VDC Angle, follow-ups).
