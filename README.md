# Timed Study Quiz

An interactive study website that gives you typed-answer questions on a timer.
The time you get depends on the difficulty of the question:

| Difficulty | Default time | Points |
|------------|--------------|--------|
| Easy       | 60 s         | 1      |
| Medium     | 120 s        | 2      |
| Hard       | 180 s        | 3      |

Timers can be changed from the setup screen or in `questions.json`.

## Features

- Filter by topic and difficulty, choose how many questions and the order (shuffled / easy→hard / file order)
- Countdown ring coloured by difficulty, turns red and pulses when time is nearly up
- Type your answer and press **Enter** — answers are checked case-insensitively, ignoring spaces/punctuation and leading "the/a/an"; numbers compare numerically (`6` = `6.0`)
- Instant feedback with the correct answer and an explanation
- Results screen with score, accuracy, average time, per-difficulty breakdown and a full review
- "Retry wrong ones" mode, best-score tracking, dark mode

## Running it

It's a static site — no build step. Because the questions are loaded with `fetch`, serve the folder over HTTP:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

It also works out of the box on GitHub Pages (Settings → Pages → deploy from `main`, root folder).

## Adding your own questions

Edit `questions.json`. Each question looks like this:

```json
{
  "id": 3,
  "topic": "Maths",
  "difficulty": "medium",
  "question": "Solve for x: 2x − 7 = 11",
  "answers": ["9", "x=9"],
  "explanation": "Add 7 to both sides: 2x = 18, so x = 9.",
  "timeLimit": 90
}
```

- `difficulty` must be `easy`, `medium` or `hard`
- `answers` is a list of accepted answers — the first one is shown as "the" answer
- `explanation` and `timeLimit` (per-question override, in seconds) are optional

Global defaults live under `settings` at the top of the file:

```json
"settings": {
  "timeLimits": { "easy": 60, "medium": 120, "hard": 180 },
  "points":     { "easy": 1,  "medium": 2,   "hard": 3 }
}
```

## Files

- `index.html` – page structure (setup, quiz and results screens)
- `styles.css` – styling and dark theme
- `app.js` – quiz logic, timer and answer checking
- `questions.json` – the question bank
