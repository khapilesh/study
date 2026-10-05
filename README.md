# Timed Study Quiz — Quantum Physics & Polarization

An interactive practice site for **Edexcel IAL Physics WPH12**, built entirely from verified
past-paper questions, where every question part is on a timer that depends on its difficulty.

| Difficulty | Based on marks | Default time |
|------------|----------------|--------------|
| Easy       | 1–2 marks      | 60 s         |
| Medium     | 3–4 marks      | 120 s        |
| Hard       | 5+ marks       | 180 s        |

Timers can be changed on the setup screen.

## How it works

- **Written / calculation parts** – type your answer or working in the box. When you
  submit (or the time runs out) the official mark scheme is revealed next to what you
  wrote; tick each marking point you hit and the marks are added to your score. A model
  answer is available under "Show model answer".
- **Multiple choice** – click A/B/C/D; auto-marked, with the explanation shown.
- **Question bank** – 99 parts from 39 verified WPH12 questions across both topics:
  Polarisation (8 questions, 32 marks) and Particle Nature of Light (31 questions,
  239 marks). Questions are taken from real papers (June 2025, Jan 2025, Jan 2026) and
  from the WPH12 topic packs; each part carries its official mark scheme and a model
  answer.
- The setup screen lets you filter by source, topic, difficulty and question type.
- Later parts of a multi-part question show the earlier parts in a collapsible
  "context" panel, so calculations that depend on an earlier result still make sense.
- Scores are in **marks**. The results screen shows marks per difficulty, a full review,
  and offers "Retry wrong ones" (anything that didn't get full marks).
- Keyboard: `Ctrl/⌘ + Enter` submits a written answer, `Enter` moves on.

## Running it

Static site, no build step. The questions are loaded with `fetch`, so serve the folder:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Works as-is on GitHub Pages (Settings → Pages → deploy from `main`, root folder).

## Adding / updating questions

Source files live in `data/`; `questions.json` is **generated** from them:

```bash
python3 scripts/build_questions.py
```

- `data/wph12_verified_past_papers.json` – the source past papers (verified WPH12 questions).
  Each question has `parts`, and every part becomes one timed question. Parts labelled
  `MCQ_*` (or in a "Multiple Choice" question) are parsed into options from lines like
  `A. …`, `B. …`; the correct letter comes from `sample_answer`.

The converter also understands other source formats if you ever want to add them:
`{"kind": "flashcards", "cards": [...]}` JSON (cards with `markScheme` are self-marked;
cards with `answers`, optional `answerDisplay` and `tolerance` are auto-marked) and
`data/*.csv` flashcard tables with columns `question`/`front`, `answer`/`back`, optional
`topic` and `difficulty` (`easy|medium|hard`, multiple answers separated with `|`).

## Files

- `index.html`, `styles.css`, `app.js` – the site
- `questions.json` – generated question bank (99 past-paper parts from 39 questions)
- `data/wph12_verified_past_papers.json` – source past papers
- `scripts/build_questions.py` – converter
