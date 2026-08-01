// Dutch flashcard quiz app — logic only. Vocabulary lives in lessons.js.

const state = {
  selectedLessonIds: new Set(LESSONS.map((l) => l.id)),
  mode: "flip", // 'flip' | 'choice' | 'type'
  direction: "nl-en", // 'nl-en' | 'en-nl' | 'mixed'
  order: "shuffled", // 'sequential' | 'shuffled'
  queue: [],
  index: 0,
  score: 0,
  missed: [],
  currentCardDirection: "nl-en",
};

const STORAGE_KEY = "dutch-flashcards-progress-v1";

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveProgress(progress) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function recordResult(word, correct) {
  const progress = loadProgress();
  const key = word.nl;
  const entry = progress[key] || { seen: 0, correct: 0 };
  entry.seen += 1;
  if (correct) entry.correct += 1;
  progress[key] = entry;
  saveProgress(progress);
}

// ---------- Setup screen ----------

const lessonListEl = document.getElementById("lesson-list");
const selectAllBtn = document.getElementById("select-all-btn");
const startBtn = document.getElementById("start-btn");
const modeChips = document.querySelectorAll("[data-mode]");
const dirChips = document.querySelectorAll("[data-dir]");
const orderChips = document.querySelectorAll("[data-order]");

function renderLessonList() {
  lessonListEl.innerHTML = "";
  LESSONS.forEach((lesson) => {
    const row = document.createElement("label");
    row.className = "lesson-row" + (state.selectedLessonIds.has(lesson.id) ? " checked" : "");
    row.innerHTML = `
      <input type="checkbox" ${state.selectedLessonIds.has(lesson.id) ? "checked" : ""} data-id="${lesson.id}">
      <span class="name">${lesson.title}</span>
      <span class="count">${lesson.words.length} words</span>
    `;
    const checkbox = row.querySelector("input");
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) state.selectedLessonIds.add(lesson.id);
      else state.selectedLessonIds.delete(lesson.id);
      row.classList.toggle("checked", checkbox.checked);
      updateStartButton();
    });
    lessonListEl.appendChild(row);
  });
}

function updateStartButton() {
  startBtn.disabled = state.selectedLessonIds.size === 0;
}

selectAllBtn.addEventListener("click", () => {
  const allSelected = state.selectedLessonIds.size === LESSONS.length;
  state.selectedLessonIds = allSelected ? new Set() : new Set(LESSONS.map((l) => l.id));
  renderLessonList();
  updateStartButton();
});

modeChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    modeChips.forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    state.mode = chip.dataset.mode;
  });
});

dirChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    dirChips.forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    state.direction = chip.dataset.dir;
  });
});

orderChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    orderChips.forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    state.order = chip.dataset.order;
    startBtn.textContent = state.order === "sequential" ? "Start learning" : "Start quiz";
  });
});

startBtn.addEventListener("click", startQuiz);

// ---------- Quiz flow ----------

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQueue() {
  const words = LESSONS.filter((l) => state.selectedLessonIds.has(l.id)).flatMap((l) => l.words);
  return state.order === "sequential" ? words.slice() : shuffle(words);
}

function pickDirectionForCard() {
  if (state.direction === "mixed") return Math.random() < 0.5 ? "nl-en" : "en-nl";
  return state.direction;
}

function startQuiz() {
  state.queue = buildQueue();
  state.index = 0;
  state.score = 0;
  state.missed = [];
  showScreen("quiz");
  renderCard();
}

function currentWord() {
  return state.queue[state.index];
}

function renderCard() {
  const total = state.queue.length;
  document.getElementById("quiz-position").textContent = `${state.index + 1} / ${total}`;
  document.getElementById("quiz-score").textContent = `Score: ${state.score}`;
  document.getElementById("progress-fill").style.width = `${(state.index / total) * 100}%`;

  const word = currentWord();
  state.currentCardDirection = pickDirectionForCard();
  const asking = state.currentCardDirection === "nl-en" ? word.nl : word.en;
  const answerLang = state.currentCardDirection === "nl-en" ? "English" : "Dutch";
  const askLang = state.currentCardDirection === "nl-en" ? "Dutch" : "English";

  const body = document.getElementById("quiz-body");
  body.innerHTML = "";

  if (state.mode === "flip") {
    const back = state.currentCardDirection === "nl-en" ? word.en : word.nl;
    body.innerHTML = `
      <div class="flip-scene">
        <div class="flip-card" id="flip-card">
          <div class="card flip-face flip-front">
            <div class="hint">${askLang} → ${answerLang}. Tap to flip.</div>
            <div class="prompt">${asking}</div>
          </div>
          <div class="card flip-face flip-back">
            <div class="hint">How did you do?</div>
            <div class="answer">${back}</div>
          </div>
        </div>
      </div>
      <div class="flip-actions" id="flip-buttons">
        <button class="btn btn-bad" id="flip-wrong">I didn't know it</button>
        <button class="btn btn-good" id="flip-right">I knew it</button>
      </div>
    `;
    const cardEl = document.getElementById("flip-card");
    const buttonsEl = document.getElementById("flip-buttons");
    cardEl.addEventListener("click", () => {
      const flippingToBack = !cardEl.classList.contains("flipped");
      cardEl.classList.toggle("flipped");
      buttonsEl.classList.remove("visible");
      if (flippingToBack) {
        cardEl.addEventListener(
          "transitionend",
          () => buttonsEl.classList.add("visible"),
          { once: true }
        );
      }
    });
    document.getElementById("flip-right").addEventListener("click", () => submitFlip(true));
    document.getElementById("flip-wrong").addEventListener("click", () => submitFlip(false));
  } else if (state.mode === "choice") {
    const correctAnswer = state.currentCardDirection === "nl-en" ? word.en : word.nl;
    const pool = state.queue
      .filter((w) => w !== word)
      .map((w) => (state.currentCardDirection === "nl-en" ? w.en : w.nl))
      .filter((v) => v !== correctAnswer);
    const distractors = shuffle([...new Set(pool)]).slice(0, 3);
    const choices = shuffle([correctAnswer, ...distractors]);

    body.innerHTML = `
      <div class="card" style="cursor:default; min-height:auto; padding:36px 24px;">
        <div class="hint">${askLang} → ${answerLang}</div>
        <div class="prompt">${asking}</div>
      </div>
      <div class="choices" id="choices"></div>
    `;
    const choicesEl = document.getElementById("choices");
    choices.forEach((choice) => {
      const btn = document.createElement("button");
      btn.className = "choice-btn";
      btn.textContent = choice;
      btn.addEventListener("click", () => {
        const isCorrect = choice === correctAnswer;
        [...choicesEl.children].forEach((c) => (c.disabled = true));
        btn.classList.add(isCorrect ? "correct" : "incorrect");
        if (!isCorrect) {
          [...choicesEl.children].find((c) => c.textContent === correctAnswer)?.classList.add("correct");
        }
        submitAnswer(isCorrect, 700);
      });
      choicesEl.appendChild(btn);
    });
  } else if (state.mode === "type") {
    const correctAnswer = state.currentCardDirection === "nl-en" ? word.en : word.nl;
    body.innerHTML = `
      <div class="card" style="cursor:default; min-height:auto; padding:36px 24px;">
        <div class="hint">${askLang} → ${answerLang}. Type the translation.</div>
        <div class="prompt">${asking}</div>
      </div>
      <div class="type-row">
        <input type="text" id="type-input" autocomplete="off" placeholder="Type here...">
        <button class="btn btn-primary" style="margin:0; width:auto;" id="type-submit">Check</button>
      </div>
      <div class="type-feedback" id="type-feedback"></div>
    `;
    const input = document.getElementById("type-input");
    const feedback = document.getElementById("type-feedback");
    const submit = document.getElementById("type-submit");
    input.focus();

    function normalize(s) {
      return s.trim().toLowerCase().replace(/^(to|the|a)\s+/, "").replace(/[.,!?]/g, "");
    }

    function check() {
      submit.disabled = true;
      input.disabled = true;
      const userVal = normalize(input.value);
      const accepted = correctAnswer.split("/").map((s) => normalize(s));
      const isCorrect = accepted.includes(userVal);
      feedback.textContent = isCorrect ? "Correct!" : `Not quite — answer: ${correctAnswer}`;
      feedback.className = "type-feedback " + (isCorrect ? "correct" : "incorrect");
      submitAnswer(isCorrect, 900);
    }
    submit.addEventListener("click", check);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") check();
    });
  }
}

function submitFlip(knew) {
  recordResult(currentWord(), knew);
  if (knew) state.score += 1;
  else state.missed.push(currentWord());
  advance();
}

function submitAnswer(isCorrect, delay) {
  const word = currentWord();
  recordResult(word, isCorrect);
  if (isCorrect) state.score += 1;
  else state.missed.push(word);
  setTimeout(advance, delay);
}

function advance() {
  state.index += 1;
  if (state.index >= state.queue.length) {
    showResults();
  } else {
    renderCard();
  }
}

function showResults() {
  showScreen("results");
  const total = state.queue.length;
  document.getElementById("results-big").textContent = `${state.score} / ${total}`;
  const pct = total ? Math.round((state.score / total) * 100) : 0;
  document.getElementById("results-sub").textContent = `${pct}% correct`;

  const missedEl = document.getElementById("missed-list");
  missedEl.innerHTML = "";
  if (state.missed.length === 0) {
    missedEl.innerHTML = `<li style="justify-content:center; background:transparent;">Perfect round! 🎉</li>`;
  } else {
    state.missed.forEach((w) => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="nl">${w.nl}</span><span>${w.en}</span>`;
      missedEl.appendChild(li);
    });
  }
}

document.getElementById("retry-missed-btn").addEventListener("click", () => {
  if (state.missed.length === 0) return;
  state.queue = shuffle(state.missed);
  state.index = 0;
  state.score = 0;
  state.missed = [];
  showScreen("quiz");
  renderCard();
});

document.getElementById("restart-btn").addEventListener("click", () => {
  showScreen("setup");
});

document.getElementById("quit-btn").addEventListener("click", () => {
  showScreen("setup");
});

function showScreen(name) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById(`screen-${name}`).classList.add("active");
}

// ---------- Init ----------

renderLessonList();
updateStartButton();
