#!/usr/bin/env python3
"""Build questions.json for the quiz site from the source files in data/.

Sources handled:
  * data/*.json  – past-paper files (a list of questions, each with "parts"), or
                   flashcard files ({"kind": "flashcards", "cards": [...]})
  * data/*.csv   – flashcards (columns: question/front, answer/back, optional topic, difficulty)

Each past-paper *part* becomes one timed question. Difficulty is derived from
marks:  1-2 -> easy, 3-4 -> medium, 5+ -> hard.

Usage:  python3 scripts/build_questions.py
"""
import csv
import glob
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data")
OUT_FILE = os.path.join(ROOT, "questions.json")

SETTINGS = {
    "timeLimits": {"easy": 60, "medium": 120, "hard": 180},
    "points": {"easy": 1, "medium": 2, "hard": 3},
    "difficultyFromMarks": {"easy": "1-2 marks", "medium": "3-4 marks", "hard": "5+ marks"},
}

OPTION_RE = re.compile(r"^\s*([A-H])[.)]\s+(.*)$")


def difficulty_from_marks(marks):
    if marks <= 2:
        return "easy"
    if marks <= 4:
        return "medium"
    return "hard"


def split_mcq(text):
    """Split 'stem\\nA. ...\\nB. ...' into (stem, [{letter, text}])."""
    stem_lines, options = [], []
    for line in text.split("\n"):
        m = OPTION_RE.match(line)
        if m:
            options.append({"letter": m.group(1), "text": m.group(2).strip()})
        elif options:  # continuation of an option
            options[-1]["text"] += " " + line.strip()
        else:
            stem_lines.append(line)
    return "\n".join(stem_lines).strip(), options


def convert_past_papers(path):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    out = []
    for q in data:
        earlier = []  # question text of earlier parts, shown as context
        for part in q.get("parts", []):
            marks = int(part.get("marks", 1))
            label = part.get("part_label", "")
            text = part.get("question_text", "").strip()
            is_mcq = label.upper().startswith("MCQ") or "multiple choice" in q.get("question_type", "").lower()

            item = {
                "id": f"{q['id']}_{label}".replace(" ", ""),
                "set": "Past papers",
                "parentId": q["id"],
                "partLabel": label,
                "topic": q.get("topic", "General"),
                "source": q.get("paper_source", ""),
                "questionType": q.get("question_type", ""),
                "marks": marks,
                "difficulty": difficulty_from_marks(marks),
                "markScheme": part.get("mark_scheme", []),
                "sampleAnswer": part.get("sample_answer", ""),
            }
            if earlier and not is_mcq:
                item["context"] = earlier[:]

            if is_mcq:
                stem, options = split_mcq(text)
                answer = (part.get("sample_answer") or "").strip()
                if not re.fullmatch(r"[A-H]", answer):
                    m = re.search(r"Correct Answer:\s*([A-H])", " ".join(item["markScheme"]))
                    answer = m.group(1) if m else answer
                item.update({"type": "mcq", "question": stem, "options": options, "answers": [answer]})
            else:
                item.update({"type": "open", "question": text, "answers": []})

            out.append(item)
            if not is_mcq:
                earlier.append(f"{label} {text}".strip())
    return out


def convert_flashcard_json(path, data):
    """{"kind": "flashcards", "cards": [...]} -> open (self-marked) or short (auto-marked) questions."""
    out = []
    set_name = data.get("set", "Flashcards")
    for i, c in enumerate(data.get("cards", []), 1):
        if c.get("answers"):
            qtype = "short"
            marks = int(c.get("marks", 1))
        else:
            qtype = "open"
            marks = int(c.get("marks", len(c.get("markScheme", [])) or 1))
        item = {
            "id": c.get("id", f"FC_{i:03d}"),
            "set": set_name,
            "topic": c.get("topic", "Flashcards"),
            "source": c.get("source", "Flashcard"),
            "type": qtype,
            "marks": marks,
            "difficulty": c.get("difficulty") or difficulty_from_marks(marks),
            "question": c["question"],
            "answers": c.get("answers", []),
            "markScheme": c.get("markScheme", []),
            "sampleAnswer": c.get("sampleAnswer", " ".join(c.get("markScheme", []))),
            "explanation": c.get("explanation", ""),
        }
        for k in ("answerDisplay", "tolerance", "timeLimit", "reconstructed"):
            if k in c:
                item[k] = c[k]
        out.append(item)
    return out


def convert_flashcards(path):
    """Generic flashcard CSV -> short-answer questions."""
    out = []
    with open(path, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            return out
        cols = {c.lower().strip(): c for c in reader.fieldnames}

        def pick(row, *names):
            for n in names:
                if n in cols and row.get(cols[n]):
                    return row[cols[n]].strip()
            return ""

        for i, row in enumerate(reader, 1):
            question = pick(row, "question", "front", "term", "prompt", "q")
            answer = pick(row, "answer", "back", "definition", "a")
            if not question or not answer:
                # fall back to the first two columns
                vals = [v for v in row.values() if v]
                if len(vals) < 2:
                    continue
                question, answer = vals[0].strip(), vals[1].strip()
            difficulty = pick(row, "difficulty", "level").lower() or "easy"
            if difficulty not in ("easy", "medium", "hard"):
                difficulty = "easy"
            out.append({
                "id": f"FC_{i:03d}",
                "set": "Flashcards",
                "topic": pick(row, "topic", "subject", "deck", "category") or "Flashcards",
                "source": os.path.basename(path),
                "type": "short",
                "difficulty": difficulty,
                "marks": SETTINGS["points"][difficulty],
                "question": question,
                "answers": [a.strip() for a in re.split(r"\s*\|\s*", answer) if a.strip()],
                "explanation": pick(row, "explanation", "notes", "hint"),
            })
    return out


def main():
    questions = []
    for path in sorted(glob.glob(os.path.join(DATA_DIR, "*.json"))):
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict) and data.get("kind") == "flashcards":
            items = convert_flashcard_json(path, data)
            print(f"{os.path.basename(path)}: {len(items)} flashcards")
        else:
            items = convert_past_papers(path)
            print(f"{os.path.basename(path)}: {len(items)} question parts")
        questions.extend(items)
    for path in sorted(glob.glob(os.path.join(DATA_DIR, "*.csv"))):
        items = convert_flashcards(path)
        print(f"{os.path.basename(path)}: {len(items)} flashcards")
        questions.extend(items)

    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump({"settings": SETTINGS, "questions": questions}, f, ensure_ascii=False, indent=2)
        f.write("\n")

    by_diff = {}
    for q in questions:
        by_diff[q["difficulty"]] = by_diff.get(q["difficulty"], 0) + 1
    print(f"Wrote {len(questions)} questions to questions.json  {by_diff}")


if __name__ == "__main__":
    main()
