/* Timed Study Quiz — app logic
 * Questions live in questions.json (see README for the format).
 */
(() => {
  'use strict';

  const DIFFICULTIES = ['easy', 'medium', 'hard'];
  const DEFAULT_TIMES = { easy: 60, medium: 120, hard: 180 };
  const DEFAULT_POINTS = { easy: 1, medium: 2, hard: 3 };
  const RING_CIRCUMFERENCE = 2 * Math.PI * 52; // matches r=52 in the SVG

  // ---------- State ----------
  let bank = [];                 // all questions from questions.json
  let settings = { timeLimits: { ...DEFAULT_TIMES }, points: { ...DEFAULT_POINTS } };
  let session = null;            // current session { questions, index, results, config }
  let timer = { id: null, remaining: 0, total: 0, startedAt: 0 };

  // ---------- DOM helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const screens = {
    setup: $('#screen-setup'),
    quiz: $('#screen-quiz'),
    results: $('#screen-results'),
  };
  const showScreen = (name) => {
    Object.values(screens).forEach((s) => s.classList.remove('active'));
    screens[name].classList.add('active');
    window.scrollTo({ top: 0 });
  };

  // ---------- Theme ----------
  const themeToggle = $('#theme-toggle');
  const applyTheme = (t) => {
    document.documentElement.dataset.theme = t;
    themeToggle.textContent = t === 'dark' ? '☀️' : '🌙';
    localStorage.setItem('quiz-theme', t);
  };
  applyTheme(localStorage.getItem('quiz-theme') ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  themeToggle.addEventListener('click', () =>
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));

  // ---------- Loading ----------
  async function loadQuestions() {
    try {
      const res = await fetch('questions.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      bank = (data.questions || []).map((q, i) => ({
        id: q.id ?? i + 1,
        topic: q.topic || 'General',
        difficulty: DIFFICULTIES.includes((q.difficulty || '').toLowerCase()) ? q.difficulty.toLowerCase() : 'medium',
        question: q.question,
        answers: Array.isArray(q.answers) ? q.answers : [q.answer ?? ''],
        explanation: q.explanation || '',
        timeLimit: q.timeLimit, // optional per-question override
      })).filter((q) => q.question && q.answers.length);
      settings.timeLimits = { ...DEFAULT_TIMES, ...(data.settings?.timeLimits || {}) };
      settings.points = { ...DEFAULT_POINTS, ...(data.settings?.points || {}) };
      buildSetup();
    } catch (err) {
      const msg = $('#setup-error');
      msg.hidden = false;
      msg.innerHTML = `Couldn't load <code>questions.json</code> (${err.message}). ` +
        `If you opened this file directly, serve the folder over HTTP instead, e.g. ` +
        `<code>python3 -m http.server</code> and open <code>http://localhost:8000</code>.`;
      $('#start-btn').disabled = true;
    }
  }

  // ---------- Setup screen ----------
  function buildSetup() {
    const topics = [...new Set(bank.map((q) => q.topic))].sort();
    const topicList = $('#topic-list');
    topicList.innerHTML = topics.map((t) => {
      const n = bank.filter((q) => q.topic === t).length;
      return `<label class="chip"><input type="checkbox" value="${escapeHtml(t)}" checked /> ${escapeHtml(t)} <small>(${n})</small></label>`;
    }).join('');

    DIFFICULTIES.forEach((d) => {
      $(`#count-${d}`).textContent = `(${bank.filter((q) => q.difficulty === d).length})`;
      $(`#time-${d}`).value = settings.timeLimits[d];
    });

    $('#num-questions').max = bank.length;
    $('#num-questions').value = Math.min(10, bank.length);

    const best = JSON.parse(localStorage.getItem('quiz-best') || 'null');
    if (best) {
      const el = $('#best-score');
      el.hidden = false;
      el.textContent = `🏆 Best session: ${best.score} pts · ${best.correct}/${best.total} correct · ${best.date}`;
    }
  }

  function readConfig() {
    const topics = [...$('#topic-list').querySelectorAll('input:checked')].map((i) => i.value);
    const difficulties = [...$('#difficulty-list').querySelectorAll('input:checked')].map((i) => i.value);
    const timeLimits = {};
    DIFFICULTIES.forEach((d) => {
      const v = parseInt($(`#time-${d}`).value, 10);
      timeLimits[d] = Number.isFinite(v) && v >= 5 ? v : settings.timeLimits[d];
    });
    return {
      topics,
      difficulties,
      count: parseInt($('#num-questions').value, 10) || 1,
      order: $('#order').value,
      timeLimits,
    };
  }

  $('#start-btn').addEventListener('click', () => {
    const cfg = readConfig();
    const pool = bank.filter((q) => cfg.topics.includes(q.topic) && cfg.difficulties.includes(q.difficulty));
    const err = $('#setup-error');
    if (!pool.length) {
      err.hidden = false;
      err.textContent = 'No questions match the selected topics and difficulties.';
      return;
    }
    err.hidden = true;
    startSession(pickQuestions(pool, cfg), cfg);
  });

  function pickQuestions(pool, cfg) {
    let list = [...pool];
    if (cfg.order === 'shuffle') shuffle(list);
    list = list.slice(0, Math.min(cfg.count, list.length));
    if (cfg.order === 'ascending') {
      list.sort((a, b) => DIFFICULTIES.indexOf(a.difficulty) - DIFFICULTIES.indexOf(b.difficulty));
    }
    return list;
  }

  // ---------- Session ----------
  function startSession(questions, cfg) {
    session = { questions, index: 0, results: [], config: cfg, score: 0 };
    $('#q-total').textContent = questions.length;
    $('#live-score').textContent = '0';
    showScreen('quiz');
    showQuestion();
  }

  function currentQuestion() { return session.questions[session.index]; }

  function showQuestion() {
    const q = currentQuestion();
    const limit = q.timeLimit || session.config.timeLimits[q.difficulty];

    $('#q-index').textContent = session.index + 1;
    $('#progress-fill').style.width = `${(session.index / session.questions.length) * 100}%`;
    $('#q-topic').textContent = q.topic;
    const diffTag = $('#q-difficulty');
    diffTag.textContent = q.difficulty;
    diffTag.className = `tag tag-difficulty ${q.difficulty}`;
    $('#q-text').textContent = q.question;

    const input = $('#answer-input');
    input.value = '';
    input.disabled = false;
    $('#submit-btn').disabled = false;
    $('#skip-btn').disabled = false;
    $('#answer-form').hidden = false;
    $('#feedback').hidden = true;

    const ring = $('.timer-ring');
    ring.className = `timer-ring ${q.difficulty}`;

    startTimer(limit);
    setTimeout(() => input.focus(), 50);
  }

  // ---------- Timer ----------
  function startTimer(seconds) {
    stopTimer();
    timer.total = seconds;
    timer.remaining = seconds;
    timer.startedAt = Date.now();
    renderTimer(true);
    timer.id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - timer.startedAt) / 1000);
      timer.remaining = Math.max(0, timer.total - elapsed);
      renderTimer();
      if (timer.remaining <= 0) {
        stopTimer();
        finishQuestion(null, true);
      }
    }, 250);
  }

  function stopTimer() {
    if (timer.id) clearInterval(timer.id);
    timer.id = null;
  }

  function renderTimer(reset = false) {
    const text = $('#timer-text');
    const ringFg = $('#ring-fg');
    const ring = $('.timer-ring');
    text.textContent = formatTime(timer.remaining);
    const fraction = timer.total ? timer.remaining / timer.total : 0;
    if (reset) {
      ringFg.style.transition = 'none';
      ringFg.style.strokeDashoffset = 0;
      // force reflow so the next transition animates from full
      void ringFg.getBoundingClientRect();
      ringFg.style.transition = '';
    } else {
      ringFg.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - fraction);
    }
    ring.classList.toggle('urgent', timer.remaining <= Math.min(10, timer.total * 0.2) && timer.remaining > 0);
  }

  function formatTime(s) {
    if (s < 60) return String(s);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  // ---------- Answering ----------
  $('#answer-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const val = $('#answer-input').value.trim();
    if (!val) return;
    finishQuestion(val, false);
  });

  $('#skip-btn').addEventListener('click', () => finishQuestion('', false, true));

  function finishQuestion(given, timedOut, skipped = false) {
    stopTimer();
    const q = currentQuestion();
    const timeTaken = Math.min(timer.total, Math.round((Date.now() - timer.startedAt) / 10) / 100);
    const correct = !timedOut && !skipped && isCorrect(given, q.answers);
    const points = correct ? (settings.points[q.difficulty] || 1) : 0;
    session.score += points;

    session.results.push({ q, given: given ?? '', correct, timedOut, skipped, timeTaken, points });
    $('#live-score').textContent = session.score;

    // lock the form
    $('#answer-input').disabled = true;
    $('#submit-btn').disabled = true;
    $('#skip-btn').disabled = true;

    // feedback
    const fb = $('#feedback');
    fb.hidden = false;
    fb.className = `feedback ${correct ? 'correct' : 'wrong'}`;
    const title = $('#feedback-title');
    if (correct) title.textContent = `✅ Correct! +${points} pt${points === 1 ? '' : 's'}`;
    else if (timedOut) title.textContent = '⏰ Time\'s up!';
    else if (skipped) title.textContent = '⏭ Skipped';
    else title.textContent = '❌ Not quite';

    const body = $('#feedback-body');
    const answerLine = `Answer: <span class="ans">${escapeHtml(q.answers[0])}</span>`;
    const explanation = q.explanation ? `<div class="muted">${escapeHtml(q.explanation)}</div>` : '';
    body.innerHTML = (correct ? '' : answerLine) + explanation;

    const nextBtn = $('#next-btn');
    nextBtn.textContent = session.index + 1 < session.questions.length ? 'Next question →' : 'See results →';
    setTimeout(() => nextBtn.focus(), 30);
  }

  $('#next-btn').addEventListener('click', nextQuestion);

  // Enter advances to next question when feedback is visible
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && screens.quiz.classList.contains('active') && !$('#feedback').hidden) {
      e.preventDefault();
      nextQuestion();
    }
  });

  function nextQuestion() {
    session.index += 1;
    if (session.index >= session.questions.length) return showResults();
    showQuestion();
  }

  $('#quit-btn').addEventListener('click', () => {
    stopTimer();
    if (session.results.length) showResults();
    else showScreen('setup');
  });

  // ---------- Answer checking ----------
  function normalize(s) {
    return String(s)
      .toLowerCase()
      .replace(/[²]/g, '^2').replace(/[³]/g, '^3').replace(/[⁴]/g, '^4')
      .replace(/[₂]/g, '2').replace(/[₃]/g, '3')
      .replace(/×/g, 'x').replace(/−/g, '-')
      .replace(/^(the|a|an)\s+/, '')
      .replace(/[\s.,;:!?'"()\[\]{}]/g, '')
      .trim();
  }

  function isCorrect(given, answers) {
    const g = normalize(given);
    if (!g) return false;
    return answers.some((a) => {
      const n = normalize(a);
      if (n === g) return true;
      // numeric tolerance: "6.0" vs "6"
      const gn = parseFloat(g), an = parseFloat(n);
      if (!Number.isNaN(gn) && !Number.isNaN(an) && /^-?\d*\.?\d+$/.test(g) && /^-?\d*\.?\d+$/.test(n)) {
        return Math.abs(gn - an) < 1e-9;
      }
      return false;
    });
  }

  // ---------- Results ----------
  function showResults() {
    const r = session.results;
    const total = r.length;
    const correct = r.filter((x) => x.correct).length;
    const accuracy = total ? Math.round((correct / total) * 100) : 0;
    const avg = total ? (r.reduce((s, x) => s + x.timeTaken, 0) / total) : 0;

    $('#r-score').textContent = session.score;
    $('#r-correct').textContent = `${correct}/${total}`;
    $('#r-accuracy').textContent = `${accuracy}%`;
    $('#r-avg-time').textContent = `${avg.toFixed(1)}s`;

    $('#breakdown').innerHTML = DIFFICULTIES.map((d) => {
      const rows = r.filter((x) => x.q.difficulty === d);
      if (!rows.length) return '';
      const c = rows.filter((x) => x.correct).length;
      return `<div class="breakdown-row ${d}">
        <div class="label">${d}</div>
        <div class="bar"><div style="width:${(c / rows.length) * 100}%"></div></div>
        <div class="nums">${c}/${rows.length}</div>
      </div>`;
    }).join('');

    $('#review-list').innerHTML = r.map((x, i) => {
      const status = x.correct ? 'Correct' : x.timedOut ? 'Timed out' : x.skipped ? 'Skipped' : `You answered "${escapeHtml(x.given)}"`;
      return `<li class="review-item ${x.correct ? 'correct' : 'wrong'}">
        <div class="q">${i + 1}. ${escapeHtml(x.q.question)}</div>
        <div class="meta">
          <span>${status}</span>
          ${x.correct ? '' : `<span>Answer: <strong>${escapeHtml(x.q.answers[0])}</strong></span>`}
          <span>${x.q.difficulty}</span>
          <span>${x.timeTaken.toFixed(1)}s</span>
        </div>
      </li>`;
    }).join('');

    $('#retry-wrong-btn').disabled = correct === total;

    // persist best score
    const best = JSON.parse(localStorage.getItem('quiz-best') || 'null');
    if (!best || session.score > best.score) {
      localStorage.setItem('quiz-best', JSON.stringify({
        score: session.score, correct, total, date: new Date().toLocaleDateString(),
      }));
    }

    showScreen('results');
  }

  $('#retry-btn').addEventListener('click', () => {
    const cfg = session.config;
    const pool = bank.filter((q) => cfg.topics.includes(q.topic) && cfg.difficulties.includes(q.difficulty));
    startSession(pickQuestions(pool, cfg), cfg);
  });

  $('#retry-wrong-btn').addEventListener('click', () => {
    const wrong = session.results.filter((x) => !x.correct).map((x) => x.q);
    if (!wrong.length) return;
    startSession(shuffle([...wrong]), session.config);
  });

  $('#home-btn').addEventListener('click', () => {
    buildSetup();
    showScreen('setup');
  });

  // ---------- Utils ----------
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  loadQuestions();
})();
