# Job fit scoring

Trackr scores how well each job fits the person's resume, out of 100, with the reasons behind every point. It is meant for deciding which saved jobs to apply to first, not for ruling jobs out.

## The resume profile

The person uploads a resume PDF in Settings. Claude reads it once and returns a profile: a headline, a seniority level, years of full-time experience, skills, industries and education. Each skill records where it was used:

| Evidence  | Meaning                                                  | Counts toward fit |
| --------- | -------------------------------------------------------- | ----------------- |
| `WORK`    | Used in a job or internship                              | Fully             |
| `PROJECT` | Used in a personal, school or open-source project        | Partly            |
| `COURSE`  | Coursework, a certificate, or listed with nothing behind | Not at all        |

Only the profile is stored (`resume_profiles`), never the file. The person also sets preferences the resume can't tell: where they'd work, remote or on site, and the lowest salary they'd take. The profile appears in the data export and is removed with **Delete** in Settings, which also clears every score made from it.

## The rubric

| Part             | Points | What it asks                                                                      |
| ---------------- | -----: | --------------------------------------------------------------------------------- |
| Skills           |     40 | Has the person used the required skills? The first thing a hiring manager checks. |
| Seniority        |     25 | Does the level asked for match theirs?                                            |
| Domain           |     20 | Have they worked in this industry? The same title elsewhere isn't the same job.   |
| Location and pay |     15 | Do the place, remote policy and salary suit their preferences?                    |

Claude only **rates** each part (`NONE`, `WEAK`, `PARTIAL`, `STRONG`, `FULL`) and quotes the posting's words behind each rating. The arithmetic is done in `packages/domain/src/fit/fit.ts`, so the same ratings always give the same score, and two rules are enforced in code rather than trusted to the model:

- **What the posting doesn't say scores low.** When the posting hides the salary, the location or the level, that part is capped at `WEAK` instead of being guessed.
- **A rating needs the posting's own words.** A quote that isn't found in the posting holds that part to `PARTIAL`, and the quote isn't shown.

Labels: **Strong fit** from 75, **Possible fit** from 55, **Stretch** below. The drawer shows each part's points, the reason, the quote, and up to five things the posting asks for that the resume doesn't show.

## When scoring happens

- A job tracked by the extension, which now sends the posting's description.
- A job added or edited with a description pasted into the form.
- Everything with a description, saved jobs first, right after a resume is uploaded.
- **Score fit** and **Score again** in the drawer.
- Postings open in the browser, when the extension triages its tabs (`POST /api/extension/triage`).

A score is current while it is newer than the profile (a new resume or new preferences make it stale) and was made with the current prompt version. Changing a job's description clears its score. Scoring runs in the background with `after()`, so saving never waits for the model.

Every score is also kept by a fingerprint of the posting (`fit_cache`), so the same posting is never paid for twice: triaging the same tabs again, or saving a triaged job, reuses the score until the profile changes.

## Cost and limits

Haiku (`claude-haiku-5-5`, or `FIT_LLM_MODEL`) reads the resume for about $0.0004 and scores a posting for about $0.0004, in 3 to 6 seconds. Each user may read 10 resumes and score 100 postings a day. Without `ANTHROPIC_API_KEY`, fit scoring is off and Settings says so.

## The demo

Demo workspaces get a fictional resume and three saved jobs with stored ratings, scored by the same `computeFit` as real ones: a strong fit (95), a possible fit (63) and a stretch (37). Integrations also has a pretend browser window to try tab triage on, with sample postings scored the same way. The demo never calls the model.

## Checking that it works

The scores have not been measured against real outcomes yet: none of the applications tracked so far kept their descriptions. Each score is stored with its application, so once enough scored applications have outcomes, interview rates by fit label show whether the score predicts anything. Until then it is a structured second opinion, not a prediction.
