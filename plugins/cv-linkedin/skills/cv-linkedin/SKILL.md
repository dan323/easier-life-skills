---
name: cv-linkedin
description: >
  Analyze and improve a CV and LinkedIn profile for software industry roles.
  Use when the user asks to "improve my CV", "review my resume", "optimize my
  LinkedIn profile", "help with my LinkedIn", "make my resume better", "create
  a CV", "prepare my resume for job applications", "update my LinkedIn", or
  anything about career documents for software engineers, developers, product
  managers, product owners, engineering managers, tech leads, SREs, DevOps
  engineers, data engineers, ML engineers, or other software-industry roles.
  The user must provide a CV file path and a LinkedIn username or URL. If
  either is missing, ask for both before proceeding.
tools: Read, Write, Glob, WebFetch, TaskCreate, TaskUpdate
model: sonnet
---

# CV & LinkedIn Improver — Software Industry Edition

Analyze the user's CV and LinkedIn profile for a software industry role, then
produce an improved CV and a LinkedIn optimization guide. All advice is
role-aware: the expectations for a Staff Engineer differ from those for a
Senior Product Manager or an Engineering Manager.

---

## Task Tracking

Before doing any work, call `TaskCreate` for each phase below. Call `TaskUpdate` (status `in_progress`) when you begin a phase and `TaskUpdate` (status `completed`) when you finish it.

- Read CV
- Detect role type
- Fetch LinkedIn profile
- Analyze CV
- Analyze LinkedIn profile
- Write improved CV
- Write LinkedIn improvement guide
- Print summary

---

## Phase 0: Gather Inputs

Before doing anything else, confirm you have both of:

1. **CV file path** — path to their CV (plain text, Markdown, PDF text, or similar)
2. **LinkedIn username or URL** — e.g. `john-doe-123` or `https://www.linkedin.com/in/john-doe-123/`

If either is missing from the user's message, ask for both at once before proceeding.

Parse the LinkedIn username from any format the user provides:
- `john-doe-123` → `john-doe-123`
- `https://www.linkedin.com/in/john-doe-123/` → `john-doe-123`
- `linkedin.com/in/john-doe-123` → `john-doe-123`

---

## Phase 1: Read the CV

Read the file at the path the user provided. If the file is not found, report the error and stop.

**PDF files (.pdf extension):**
- Log: "CV format: PDF — checking for document-skills:pdf skill."
- If the `document-skills:pdf` skill is available in your environment, invoke it to extract the CV text and then log: "Reading CV using document-skills:pdf skill."
- If it is not available, use the Read tool directly and log: "Reading CV as PDF using Read tool (document-skills:pdf not installed)."

**All other formats** (Markdown, plain text, Word, etc.): use the Read tool and log: "Reading CV as [format] using Read tool."

Parse the content into these sections (names vary — match by content, not heading label):

- **Contact**: name, email, phone, location, GitHub URL, portfolio/personal site, LinkedIn URL
- **Summary / Profile / Objective**: the opening pitch
- **Experience / Work History**: each role with title, company, dates, and bullet points
- **Education**: degrees, institutions, dates; also bootcamps and relevant MOOCs
- **Skills / Technical Skills**: keyword lists or grouped categories
- **Projects**: personal or open-source projects (especially relevant for engineers)
- **Certifications**: cloud certs (AWS, GCP, Azure), Kubernetes (CKA/CKAD), Scrum, PMP, etc.
- **Publications / Talks**: conference talks, blog posts, papers (senior/staff level)

Note which sections are present, absent, or thin.

---

## Phase 1b: Detect Software Role Type

Classify the user's target role from their current title, past titles, and skills. This
classification drives all downstream advice — do not skip it.

**Engineer** — any variant of: Software Engineer, Developer, SRE, DevOps Engineer,
Data Engineer, ML Engineer, Platform Engineer, Security Engineer, Frontend, Backend,
Full-Stack, Mobile, Embedded, QA Engineer. Signals: programming languages in skills,
technical architecture bullets, GitHub link, system design language.

**Product Manager / Product Owner** — any variant of: PM, APM, Senior PM, GPM, Director
of Product, VP Product, Product Owner, Product Lead. Signals: roadmap, user research,
A/B testing, PRD, OKRs, go-to-market, stakeholder management language.

**Engineering Manager / Technical Leader** — any variant of: Engineering Manager, EM,
Staff/Principal/Distinguished Engineer, Tech Lead, VP Engineering, CTO, Director of
Engineering, Head of Engineering. Signals: reports/headcount numbers, hiring, performance
reviews, org-level impact, both people management AND technical decision language.

**Other software roles** (Designer, Data Scientist, Analyst, etc.) — apply general
advice; note the role and adapt as best as possible.

If the role cannot be determined from the CV, ask: "What type of role are you targeting?
(e.g. Software Engineer, Product Manager, Engineering Manager)"

---

## Phase 2: Fetch the LinkedIn Profile

Attempt to fetch the public LinkedIn profile at:
`https://www.linkedin.com/in/{username}/`

**If the fetch succeeds and returns profile content:**
Extract: headline, about/summary text, experience entries (title, company, description),
education, skills list, any featured posts or certifications visible.

**If the fetch fails, returns a login page, or returns a 999/redirect response:**
Tell the user exactly this:
> "I couldn't access your LinkedIn profile automatically — LinkedIn restricts automated access.
> Please paste the key parts of your LinkedIn profile here: your current headline, the About/summary
> section, your experience descriptions (at least the most recent 2–3 roles), and your skills list.
> I'll continue once I have that content."

Wait for the user's response before proceeding with any LinkedIn analysis.

**If the user explicitly says to skip LinkedIn** (e.g. "skip LinkedIn", "just the CV"):
Skip Phases 4 and 6. Note the skip in the final summary.

---

## Phase 3: Analyse the CV

### 3a. Summary / Profile Section

- **Missing?** → Flag. Recruiters read the top third first; no summary = no pitch.
- **Generic phrases?** Flag any of: *results-oriented*, *dynamic*, *passionate about*,
  *team player*, *hard worker*, *detail-oriented*, *fast learner*, *self-starter*,
  *go-getter*, *ninja*, *rockstar*. These add zero signal.
- **First person?** "I am a developer..." → rewrite as a statement with no grammatical subject.
- **Length?** Ideal: 3–5 lines, 40–60 words. Flag if over 80 words.
- **Role-specific expectations:**
  - **Engineer**: should mention primary stack or domain (e.g. "backend engineer specialising
    in distributed systems and Go"), seniority signal (years or scope), and a standout outcome.
  - **PM**: should mention the type of product (B2B SaaS, consumer, platform, growth) and
    the scale or impact of past work (users, revenue, team size). "I love building products"
    is not a pitch.
  - **EM / Tech Lead**: should name team size or org scope, the type of engineering culture
    or transformation driven, and career-level signal (managed N engineers, built N teams).

### 3b. Work Experience Bullets

For each bullet across all roles, check:

**Weak verb openers — always flag:**
*helped*, *worked on*, *assisted with*, *was responsible for*, *involved in*,
*participated in*, *supported*, *contributed to*, *played a role in*, *tried to*

**Strong verb banks by role:**

| Role | Strong Verbs |
|---|---|
| Engineer | *engineered, architected, built, shipped, refactored, migrated, automated, reduced, optimised, scaled, deployed, integrated, designed, implemented, debugged* |
| PM / PO | *defined, launched, prioritised, drove, shipped, grew, negotiated, aligned, validated, synthesised, owned, partnered, increased, reduced, delivered* |
| EM / TL | *led, hired, grew, scaled, restructured, established, mentored, unblocked, defined, championed, partnered, transformed, delivered, set, cultivated* |

**Quantification — flag every bullet with zero numbers:**

| Role | Metric types to look for |
|---|---|
| Engineer | Latency (ms), throughput (req/s), uptime (%), test coverage (%), build/deploy time, lines of code removed, cost savings ($) |
| PM / PO | MAU/DAU, conversion rate (%), ARR/MRR ($), NPS, sprint velocity, time-to-market, number of experiments run |
| EM / TL | Team size (#), hiring targets met (#), attrition rate (%), delivery on-time (%), promotion rate, number of teams/squads managed |

A bullet with zero numbers needs `[METRIC: e.g. reduced latency by X%]` appended.

**Result vs. task:**
"Wrote unit tests" (task) vs. "Achieved 94% test coverage on the payments service,
catching 3 critical regressions before they reached production" (result).

### 3c. Education and Certifications

- Degrees fully named? "CS degree" → "B.Sc. Computer Science, University of X, Year"
- Graduation year present?
- **Certifications (software-specific):** Flag if the person has cloud/infra experience
  but no cloud cert listed, or does agile/scrum work but no cert — worth adding if held.
  Certs that matter: AWS SA/Developer/SysOps, GCP ACE/PCA, Azure AZ-900/AZ-204,
  CKA/CKAD, CSPO, CSM, PMP.

### 3d. Skills Section

- **Present?** Missing entirely is a serious ATS problem.
- **Structure by role:**
  - **Engineer** — group by: `Languages`, `Frameworks & Libraries`, `Databases`,
    `Cloud & Infrastructure`, `Testing`, `Tools`. Flat dumps are hard to skim.
  - **PM** — group by: `Product Methodology`, `Analytics & Research`, `Tools`,
    and optionally `Technical Background` if relevant.
  - **EM / TL** — group by: `Leadership & Management`, `Engineering Practices`,
    `Technical Background`, `Tools`.
- Technologies mentioned in experience bullets but absent from the skills section?
- Consistent casing: `JavaScript` (not `Javascript`), `TypeScript`, `PostgreSQL`,
  `AWS`, `Kubernetes`, `GraphQL`, `CI/CD`.

### 3e. Software-Specific Signals

- **GitHub / portfolio link in contact section?**
  - **Engineers**: flag if absent — recruiters and technical interviewers look for this.
    Even an empty profile is better than none; note the gap.
  - **PMs / EMs**: optional but valuable if they have public writing or side projects.
- **Open-source contributions** listed? For engineers, these are strong differentiators.
- **Projects section** present for engineers with fewer than 5 years experience? Essential
  if the work history is thin.
- **Tenure signals**: flag any unexplained gap longer than 6 months.
- **ATS keyword coverage**: verify that key terms from the user's target role appear
  in the CV. Common ATS terms by role:
  - Engineer: the actual technology names (React, Kubernetes, Python, etc.) must be
    spelled out in full — acronyms alone fail ATS parsers.
  - PM: "product roadmap", "A/B testing", "user research", "cross-functional",
    "go-to-market", "OKRs", "KPIs".
  - EM: "engineering management", "agile", "performance management", "technical
    strategy", "stakeholder management".

---

## Phase 4: Analyse the LinkedIn Profile

*(Skip entirely if the user chose to skip LinkedIn.)*

### 4a. Headline

If it is only the job title + company, it wastes the highest-visibility field on LinkedIn.
LinkedIn headline is the #1 field recruiters use in search filters.

**Headline templates by role:**

| Role | Template |
|---|---|
| Engineer | `{Seniority} {Specialisation} Engineer · {Primary Stack} · {Domain or Impact}` |
| PM | `{Seniority} Product Manager · {Product Type, e.g. B2B SaaS / Consumer / Platform} · {Impact angle, e.g. 0-to-1 / Growth / Enterprise}` |
| EM / TL | `Engineering Manager · {Team/Org context} · {Scale or domain, e.g. 40-person org / Fintech / Developer Tooling}` |

Examples:
- "Senior Backend Engineer · Go & Kafka · Building high-throughput fintech systems"
- "Product Manager · B2B SaaS · 0-to-1 Products & Enterprise Expansion"
- "Engineering Manager · 3 Teams, 24 Engineers · Platform & Infrastructure"

### 4b. About / Summary

- **Present?** (LinkedIn penalises completeness score if absent; profile ranks lower in search.)
- **Hook?** First 2 visible lines (before "...see more") must earn the click.
- **Flow:** what you do → what you are known for / strongest credential → what you are
  looking for → contact CTA.
- **Role-specific must-haves:**
  - **Engineer**: mention primary language/stack and one scale or performance achievement.
  - **PM**: mention product type and one business or user impact metric.
  - **EM**: mention team size and one org or delivery achievement.

### 4c. Experience Descriptions

- Roles with no descriptions are a missed opportunity — LinkedIn allows far more than a CV.
- Descriptions should expand on the CV, not copy-paste it.
- **Engineers**: describe the technical problem and the solution, not just the outcome.
- **PMs**: describe the business context (what problem, who the users were, what you shipped).
- **EMs**: describe the team's mission and your contribution to org health and delivery.

### 4d. Skills Section

- Top 3 featured skills should be the most recruiter-relevant for the target role.
- **Engineer**: feature the primary programming language, the main framework/platform,
  and either the cloud provider or a relevant specialisation.
- **PM**: feature "Product Management", the domain (e.g. "SaaS", "B2B", "Mobile"),
  and a methodology or tool (e.g. "Product Strategy", "A/B Testing").
- **EM**: feature "Engineering Management", a delivery methodology, and either a technical
  domain or a scale signal (e.g. "Team Building", "Agile", "Distributed Systems").

### 4e. CV vs. LinkedIn Alignment

Cross-reference every role, date, and title between the CV and LinkedIn. Flag:
- Different job title for the same role (recruiters notice and ask)
- Date mismatches (start or end year differs by more than 1 month)
- Roles present on the CV but absent from LinkedIn
- Roles present on LinkedIn but absent from the CV

---

## Phase 5: Write Improved CV

Write the improved CV to `cv-improved.md` in the **same directory** as the original CV file.
If the CV content was pasted directly (no file path), write to `./cv-improved.md`.

**Rules:**
- Rewrite the summary using a role-specific template (use content already in the CV):
  - **Engineer**: `{Seniority} {specialisation} engineer with {X} years building {domain}
    systems. Known for {technical strength from bullets}. Track record of {performance or
    scale achievement}.`
  - **PM**: `Product manager with {X} years shipping {product type} for {user type}.
    Known for {strength, e.g. "0-to-1 launches" / "growth experimentation"}. Track record
    of {business outcome type}.`
  - **EM**: `Engineering manager with {X} years leading {N}-person teams in {domain}.
    Known for {strength, e.g. "building high-trust teams" / "technical transformation"}.
    Track record of {delivery or org outcome}.`
- Replace every weak verb with a strong one from the role-specific verb bank in Phase 3b.
- For every unquantified bullet, append ` [METRIC: e.g. {role-relevant metric}]` — the
  user fills in the real number.
- **Do not invent facts.** Preserve company names, dates, titles, and technologies exactly.
- If the Skills section was absent, create one using the role-appropriate category structure
  from Phase 3d, populated from technologies named in experience bullets.
- For engineers: if no GitHub link is in the contact section, add a placeholder
  `GitHub: github.com/[your-username]` with a note that they should add the real link.
- Format: clean Markdown. `##` for section headers, `### Title @ Company (Start–End)`
  for each role, `-` for bullets.

**Begin the file with a "Changes Made" block:**

```
## Changes Made

- Role detected: {Engineer / PM / EM}
- Summary: [added / rewrote — reason]
- Bullets rewritten: N across M roles (weak verbs → strong verbs)
- [METRIC] placeholders added: N bullets
- Skills section: [added with role structure / reformatted / unchanged]
- [any other changes, e.g. GitHub placeholder added]
```

**Never overwrite the original CV file.**

---

## Phase 6: Write LinkedIn Improvement Guide

*(Skip if the user chose to skip LinkedIn. Write to `linkedin-improvements.md` in the
same directory as the improved CV.)*

```markdown
# LinkedIn Profile Improvements — {Full Name from CV}

Role: {Engineer / PM / EM}
Generated: {today's date}

---

## Headline

**Current:** {their current headline, or "(not set)"}

**Suggested options (pick one or adapt):**
1. {Role-specific option A — uses template from Phase 4a}
2. {Role-specific option B — alternative angle}
3. {Role-specific option C — third variation}

**Why these work better:** {one sentence — what keyword or signal the current headline misses}

---

## About / Summary

**Current status:** {present and strong / present but weak / missing}

**Suggested text (~150–200 words):**

{Write a complete improved About section using the role-specific flow from Phase 4b.
 Line 1–2 (hook, visible before "see more"): lead with role + domain + a hook credential.
 Lines 3–6: core skills, domain expertise, one or two standout achievements from the CV.
 Engineers: include primary stack and a scale/performance fact.
 PMs: include product type and a business impact fact.
 EMs: include team size and an org achievement.
 Final 2 lines: what they are looking for + contact CTA.}

---

## Experience Description Improvements

{For each role where descriptions are missing or weak, provide improved content.
 Skip roles that are already strong.}

### {Title} @ {Company}

**Add or replace with:**
- {Strong bullet — role-appropriate verb + quantified result drawn from CV content}
- {Additional bullet if the entry was sparse}

---

## Skills to Add or Feature

| Skill | Why | Seen in |
|---|---|---|
| {skill} | {missing from list / should be a top-3 featured skill} | {which role or section} |

---

## CV vs. LinkedIn Inconsistencies

| Field | CV | LinkedIn | Fix |
|---|---|---|---|
{rows — or omit entire table if no inconsistencies found}

---

## Quick Wins — Do These First

Ranked by recruiter visibility impact on LinkedIn for a {role type}:
1. **{Most impactful}** — {what to change and exactly where}
2. **{Second}** — {what to change}
3. **{Third}** — {what to change}
```

---

## Phase 7: Print Summary

```
## CV & LinkedIn Improvements Complete

Role: {Engineer / PM / EM / Other}

**Improved CV:** {full path to cv-improved.md}
  - Summary: {added fresh / rewrote generic version}
  - Bullets improved: {N} across {M} roles
  - [METRIC] placeholders added: {N}
  {any other notable changes}

**LinkedIn Guide:** {full path to linkedin-improvements.md}   [or "Skipped"]
  - Headline: {N} alternatives suggested
  - About section: {written fresh / rewrote weak version} (~{word count} words)
  - Experience descriptions: {N} roles with new/improved bullets
  - Inconsistencies flagged: {N}

**Top 3 Quick Wins:**
1. {Most impactful — specific and role-aware}
2. {Second}
3. {Third}
```
