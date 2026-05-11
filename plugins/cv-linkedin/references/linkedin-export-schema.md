# LinkedIn Data Export — CSV Schema Reference

Non-obvious facts about the CSVs produced by LinkedIn's "Get a copy of your
data" export. Only what the agent would get wrong without seeing this.

## How the user obtained these files

LinkedIn → Settings & Privacy → Data Privacy → Get a copy of your data
(<https://www.linkedin.com/mypreferences/d/download-my-data>). The "fast"
archive is ZIP-emailed to the user in ~10 minutes; the full archive can take
up to 24 hours. Either is fine for this skill.

The ZIP unzips to a flat directory of CSVs. **Do not assume the directory name
follows any convention** — users may rename it; always treat the user-provided
path as the working directory.

## Required files and columns

The skill needs these four. Stop with an error if any are missing.

### `Profile.csv`

A single-row CSV (one member = one row).

| Column               | Notes                                                                                                                             |
|----------------------|-----------------------------------------------------------------------------------------------------------------------------------|
| `First Name`         | Required                                                                                                                          |
| `Last Name`          | Required                                                                                                                          |
| `Maiden Name`        | Often empty                                                                                                                       |
| `Address`            | Often empty (privacy)                                                                                                             |
| `Birth Date`         | Empty unless the user explicitly added it                                                                                         |
| `Headline`           | What goes under the name on the profile; this is what Phase 4a audits                                                             |
| `Summary`            | The LinkedIn "About" section — **multi-line, may contain embedded `\n` and quotes**; use a real CSV parser                        |
| `Industry`           | E.g. "Computer Software"                                                                                                          |
| `Zip Code`           | Often empty                                                                                                                       |
| `Geo Location`       | Free-form city/region string, e.g. "Barcelona, Catalonia, Spain"                                                                  |
| `Twitter Handles`    | Comma-separated within the single cell                                                                                            |
| `Websites`           | Comma-separated within the single cell, prefixed with category tags like `[OTHER:https://...]` — strip the prefix when displaying |
| `Instant Messengers` | Almost always empty                                                                                                               |

### `Positions.csv`

One row per work-experience entry.

| Column         | Notes                                                                                                                                                                  |
|----------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `Company Name` | Required for matching against the CV                                                                                                                                   |
| `Title`        | Required                                                                                                                                                               |
| `Description`  | **Multi-line, may contain newlines, commas, quotes**; use a real CSV parser. May be empty (= LinkedIn experience entry with no description; common and worth flagging) |
| `Location`     | Free-form, e.g. "Barcelona, Spain" or "Remote"                                                                                                                         |
| `Started On`   | Format: `Month YYYY` (e.g. `March 2022`). May be just `YYYY` for older entries                                                                                         |
| `Finished On`  | Same format. **Empty string ⇒ current role.** Sort with empty-as-newest                                                                                                |

Older exports may use `Start Date` / `End Date` instead of `Started On` / `Finished On`. Detect both spellings.

### `Education.csv`

One row per education entry.

| Column        | Notes                                                       |
|---------------|-------------------------------------------------------------|
| `School Name` | Required                                                    |
| `Start Date`  | Format: `YYYY` or `Month YYYY`                              |
| `End Date`    | Same. Empty ⇒ current. Sometimes the year only              |
| `Notes`       | Free-form, often empty                                      |
| `Degree Name` | E.g. "M.Sc.", "B.Eng." — may be empty for bootcamps / MOOCs |
| `Activities`  | Clubs, societies, etc. Often empty                          |

### `Skills.csv`

One row per skill. LinkedIn caps at 50 skills per profile, but exports may
include orphaned entries from past edits.

| Column | Notes                                                                                                    |
|--------|----------------------------------------------------------------------------------------------------------|
| `Name` | The skill string — preserve original casing for the audit (the Phase 3d casing check needs the original) |

The export does **not** mark which 3 skills are featured. If you need top-3
featured skill data, ask the user explicitly — it's not in the CSV.

## Optional files

Use if present; **do not fabricate findings** if absent.

### `Certifications.csv`

| Column           | Notes                                                |
|------------------|------------------------------------------------------|
| `Name`           | E.g. "AWS Certified Solutions Architect – Associate" |
| `Authority`      | Issuer, e.g. "Amazon Web Services (AWS)"             |
| `Started On`     | Issue date, `Month YYYY`                             |
| `Finished On`    | Expiry, or empty if no expiry                        |
| `License Number` | Often empty                                          |
| `Url`            | Verification URL, often empty                        |

### `Languages.csv`

| Column        | Notes                                                                                  |
|---------------|----------------------------------------------------------------------------------------|
| `Name`        | Language name                                                                          |
| `Proficiency` | Free-form: "Native or bilingual proficiency", "Professional working proficiency", etc. |

### `Projects.csv`

| Column                       | Notes                         |
|------------------------------|-------------------------------|
| `Title`                      |                               |
| `Description`                | Multi-line                    |
| `Started On` / `Finished On` | `Month YYYY`, empty = ongoing |
| `Url`                        | Often empty                   |

### `Volunteering.csv`

| Column                       | Notes                                                   |
|------------------------------|---------------------------------------------------------|
| `Company Name`               | The org                                                 |
| `Role`                       |                                                         |
| `Started On` / `Finished On` | As above                                                |
| `Cause`                      | LinkedIn-defined category, e.g. "Education", "Children" |
| `Description`                | Multi-line                                              |

## Gotchas

1. **Embedded newlines in descriptions.** `Summary` (Profile.csv), `Description` (Positions.csv, Projects.csv, Volunteering.csv), and `Notes` (Education.csv) all routinely contain `\n` characters inside quoted cells. **Never split these CSVs on raw commas or newlines** — use the host language's CSV parser with default RFC-4180 handling (Python `csv` module, JS `papaparse`, etc.). A naive `split(",")` will shred multi-line descriptions and break every downstream check.

2. **Date format is human, not ISO.** Dates are `Month YYYY` (English month names) or `YYYY`. Parse with locale-tolerant logic; do not assume ISO-8601.

3. **Empty `Finished On` = current.** Don't render this as the literal string "Present" without checking — it really is an empty cell. Sort algorithm: rows with empty `Finished On` rank newest; otherwise sort by parsed end-date descending.

4. **Column naming drift.** Old vs new exports may swap `Started On`/`Finished On` for `Start Date`/`End Date`. Look up by both names; do not hard-code one spelling.

5. **`Websites` is composite.** A single cell may contain `[OTHER:https://example.com], [PERSONAL:https://github.com/user]`. Strip the `[CATEGORY:...]` wrappers when extracting URLs for the contact-section audit (Phase 3e: GitHub link check).

6. **Encoding is UTF-8 with BOM** on some exports. Strip a leading `﻿` if the parser doesn't auto-handle it.

7. **The export has no "Featured skills" flag.** LinkedIn doesn't include which 3 of the user's skills are pinned at the top. If the Phase 4d "Top 3 featured skills" audit needs this, ask explicitly.

8. **The export has no recommendations text by default.** `Recommendations_Received.csv` only appears in the full ("the works") archive — assume it's not there in the fast archive.
