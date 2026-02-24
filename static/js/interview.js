// ── STEP 1: Questions hardcoded here ────────────────────────────────────────
const QUESTIONS = [
  {
    id: 1,
    text: "How do you prioritize tasks when you have multiple deadlines at the same time?",
    options: [
      { id: "A", text: "Work on the easiest task first to build momentum" },
      { id: "B", text: "Prioritize by deadline and impact, tackle the most critical first" },
      { id: "C", text: "Ask your manager to decide the priority for you" },
      { id: "D", text: "Work on all tasks simultaneously to show multitasking ability" },
    ],
    correct: "B",
  },
  {
    id: 2,
    text: "A team member disagrees with your approach on an important project. How do you handle it?",
    options: [
      { id: "A", text: "Ignore their feedback and proceed with your original plan" },
      { id: "B", text: "Immediately adopt their suggestion without discussion" },
      { id: "C", text: "Schedule a discussion to understand their perspective and find common ground" },
      { id: "D", text: "Escalate to your manager to make the final call" },
    ],
    correct: "C",
  },
  {
    id: 3,
    text: "You realize mid-project that the initial requirements were unclear and the deliverable may miss the mark. What do you do?",
    options: [
      { id: "A", text: "Complete the project as planned and hope it meets expectations" },
      { id: "B", text: "Immediately communicate the issue to stakeholders and realign on requirements" },
      { id: "C", text: "Restart the project from scratch without informing anyone" },
      { id: "D", text: "Submit the work and wait for feedback before making changes" },
    ],
    correct: "B",
  },
  {
    id: 4,
    text: "How do you respond when you receive critical feedback about your work from a supervisor?",
    options: [
      { id: "A", text: "Defend your work and explain why the feedback is wrong" },
      { id: "B", text: "Feel discouraged and avoid taking similar tasks in future" },
      { id: "C", text: "Listen actively, ask clarifying questions, and create an action plan to improve" },
      { id: "D", text: "Agree outwardly but make no changes to your approach" },
    ],
    correct: "C",
  },
  {
    id: 5,
    text: "You are assigned a task that requires a skill you do not currently have. What is your approach?",
    options: [
      { id: "A", text: "Decline the task as it is outside your current skillset" },
      { id: "B", text: "Accept the task, proactively learn the skill, and ask for guidance if needed" },
      { id: "C", text: "Complete the task using only what you already know, even if quality suffers" },
      { id: "D", text: "Pass the task to a colleague without informing your manager" },
    ],
    correct: "B",
  },
];

/**
 * InterviewController
 * ===================
 * Orchestrates the full interview session:
 *
 *   init()
 *     → fetch tokens from backend
 *     → connect AvatarManager
 *     → speak welcome message
 *     → loop: speak question → user picks answer → next question
 *     → score answers locally
 *     → avatar announces score
 *     → show results UI
 */
class InterviewController {
  constructor() {
    this.questions    = QUESTIONS;   // hardcoded above — STEP 1
    this.currentIdx   = 0;          // which question we're on (0-based)
    this.answers      = {};          // { "1": "B", "2": "C", ... }
    this.answerLocked = true;        // locked while avatar is speaking
    this.avatar       = null;        // AvatarManager instance
    this.region       = window.SPEECH_REGION || 'eastus2';
  }

  // ── Entry point ─────────────────────────────────────────────────────────────

  async init() {
    this._setLoadingText('Connecting to Azure…');

    try {
      // Fetch only the Azure tokens from backend (questions are hardcoded)
      const [speechToken, iceTokenRaw] = await Promise.all([
        fetch('/api/getSpeechToken').then(r => {
          if (!r.ok) throw new Error(`Speech token error ${r.status}: ${r.statusText}`);
          return r.text();
        }),
        fetch('/api/getIceToken').then(r => {
          if (!r.ok) throw new Error(`ICE token error ${r.status}: ${r.statusText}`);
          return r.text();
        }),
      ]);

      // Build AvatarManager with callbacks that update the UI
      this.avatar = new AvatarManager({
        videoElement: document.getElementById('avatar-video'),
        character: 'lisa',
        style:     'casual-sitting',
        voice:     'en-US-JennyNeural',

        onConnected: () => {
          // Hide loading overlay, show video
          document.getElementById('avatar-loading').style.display = 'none';
          this._setDot('connected');
          this._setStatusLabel('Ready');
        },

        onDisconnected: () => {
          this._setDot('');
          this._setStatusLabel('Disconnected');
          // Show reconnect overlay on video panel
          const wrapper = document.querySelector('.avatar-video-wrapper');
          if (wrapper && !document.getElementById('reconnect-overlay')) {
            const overlay = document.createElement('div');
            overlay.id = 'reconnect-overlay';
            overlay.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.85);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;z-index:10;';
            overlay.innerHTML = `
              <p style="color:#e0e0f0;font-size:14px;">Avatar disconnected</p>
              <button onclick="location.reload()" style="padding:10px 28px;background:#6c63ff;color:#fff;border:none;border-radius:50px;font-size:14px;cursor:pointer;">
                Reconnect
              </button>`;
            wrapper.appendChild(overlay);
          }
        },

        onSpeakStart: () => {
          // Unmute video so avatar audio is audible (bypasses autoplay mute)
          const vid = document.getElementById('avatar-video');
          if (vid && vid.muted) vid.muted = false;
          // Lock options while avatar speaks
          this.answerLocked = true;
          this._setOptionsEnabled(false);
          this._setDot('speaking');
          this._setStatusLabel('Speaking…');
          this._setHint(true);
        },

        onSpeakEnd: () => {
          // Unlock options when avatar finishes
          this.answerLocked = false;
          this._setOptionsEnabled(true);
          this._setDot('connected');
          this._setStatusLabel('Ready — select your answer');
          this._setHint(false);
        },
      });

      // STEP 2 → 3: Connect WebRTC + start avatar video
      this._setLoadingText('Initialising avatar…');
      await this.avatar.connect(speechToken, this.region, iceTokenRaw);

      // STEP 4 onwards: kick off the interview
      await this._startInterview();

    } catch (err) {
      console.error('[Interview] Initialisation failed:', err);
      this._setLoadingText(`⚠ ${err.message || 'Unknown error'}`);
      // Show retry button instead of forcing full page refresh
      const loadingEl = document.getElementById('avatar-loading');
      if (loadingEl) {
        const btn = document.createElement('button');
        btn.textContent = 'Retry Connection';
        btn.style.cssText = 'margin-top:16px;padding:10px 28px;background:#6c63ff;color:#fff;border:none;border-radius:50px;font-size:14px;cursor:pointer;';
        btn.onclick = () => { loadingEl.innerHTML = '<div class="spinner"></div><p id="loading-text">Reconnecting…</p>'; this.init(); };
        loadingEl.appendChild(btn);
      }
    }
  }

  // ── Interview flow ──────────────────────────────────────────────────────────

  async _startInterview() {
    this._updateProgress(0, this.questions.length);

    const welcomeText =
      'Hello! Welcome to your behavioral interview. ' +
      'I will ask you five questions. ' +
      'After I finish speaking each question, the answer options will become active. ' +
      'Select the option that best reflects your approach. ' +
      "Let's begin.";

    try {
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Speech timeout')), 25000)
      );
      await Promise.race([this.avatar.speak(welcomeText), timeout]);
    } catch (err) {
      console.warn('[Interview] Welcome speech failed/timed out:', err);
    }

    await this._askQuestion(0);
  }

  async _askQuestion(idx) {
    if (idx >= this.questions.length) {
      await this._finishInterview();
      return;
    }

    this.currentIdx   = idx;
    this.answerLocked = true;
    const q = this.questions[idx];

    // Update progress indicator
    this._updateProgress(idx + 1, this.questions.length);

    // Render question + disabled options
    this._renderQuestion(q);
    this._setOptionsEnabled(false);

    // Build speech text: question + all four options
    const optionsText = q.options
      .map(o => `Option ${o.id}: ${o.text}`)
      .join('. ');

    const speech =
      `Question ${idx + 1}. ${q.text}. ` +
      `The options are. ${optionsText}. ` +
      `Please select your answer.`;

    // Avatar speaks — if speech fails or hangs, still unlock options so interview continues
    const unlockOptions = () => {
      this.answerLocked = false;
      this._setOptionsEnabled(true);
      this._setDot('connected');
      this._setStatusLabel('Select your answer');
      this._setHint(false);
    };

    try {
      // Timeout after 30s in case speak() hangs
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Speech timeout')), 30000)
      );
      await Promise.race([this.avatar.speak(speech), timeout]);
    } catch (err) {
      console.warn('[Interview] Speech failed/timed out for question', idx + 1, err);
      unlockOptions();
    }
  }

  _renderQuestion(q) {
    document.getElementById('question-badge').textContent =
      `Question ${q.id} / ${this.questions.length}`;
    document.getElementById('question-text').textContent = q.text;

    const container = document.getElementById('options-container');
    container.innerHTML = '';

    q.options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className       = 'option-btn';
      btn.dataset.optionId = opt.id;
      btn.disabled         = true;
      btn.innerHTML =
        `<span class="option-label">${opt.id}</span>` +
        `<span class="option-text">${opt.text}</span>`;

      btn.addEventListener('click', () => this._handleAnswer(q.id, opt.id));
      container.appendChild(btn);
    });
  }

  async _handleAnswer(questionId, optionId) {
    if (this.answerLocked) return;

    // Lock immediately so double-clicks are ignored
    this.answerLocked = true;
    this._setOptionsEnabled(false);

    // Record answer
    this.answers[String(questionId)] = optionId;

    // Highlight the chosen option
    document.querySelectorAll('.option-btn').forEach(btn => {
      if (btn.dataset.optionId === optionId) {
        btn.classList.add('selected');
      }
    });

    // Brief visual pause before moving to next question
    await new Promise(r => setTimeout(r, 700));
    await this._askQuestion(this.currentIdx + 1);
  }

  async _finishInterview() {
    // Clear question panel while we wait for scoring
    this._setOptionsEnabled(false);
    document.getElementById('question-badge').textContent = 'Interview Complete';
    document.getElementById('question-text').textContent  = 'Calculating your results…';
    document.getElementById('options-container').innerHTML = '';
    this._updateProgress(this.questions.length, this.questions.length);

    const waitText =
      'Thank you for completing the interview. ' +
      'Please wait a moment while I calculate your results.';
    try {
      await Promise.race([
        this.avatar.speak(waitText),
        new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 20000)),
      ]);
    } catch (_) { /* avatar speech failed — continue silently */ }

    // STEP 7: Score answers locally (questions are hardcoded, no server call needed)
    const data = this._scoreAnswers();

    // Avatar announces the result
    const resultText =
      `You scored ${data.score} out of ${data.total}, ` +
      `which is ${data.percentage} percent. ` +
      `Your grade is ${data.grade}. ` +
      `Well done on completing the interview!`;
    try {
      await Promise.race([
        this.avatar.speak(resultText),
        new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 20000)),
      ]);
    } catch (_) { /* avatar speech failed — continue silently */ }

    // Show results UI
    this._showResults(data);

    // Clean up WebRTC + synthesizer
    await this.avatar.disconnect();
  }

  // ── Scoring (local — no server call) ────────────────────────────────────────

  _scoreAnswers() {
    let score = 0;
    const results = QUESTIONS.map(q => {
      const selected   = (this.answers[String(q.id)] || '').toUpperCase();
      const is_correct = selected === q.correct;
      if (is_correct) score++;
      return { id: q.id, text: q.text, options: q.options, selected, correct: q.correct, is_correct };
    });
    const total      = QUESTIONS.length;
    const percentage = Math.round(score / total * 100);
    const grade      = percentage >= 80 ? 'Excellent'
                     : percentage >= 60 ? 'Good'
                     : percentage >= 40 ? 'Average'
                     : 'Needs Improvement';
    return { score, total, percentage, grade, results };
  }

  // ── Results UI ──────────────────────────────────────────────────────────────

  _showResults(data) {
    const layout = document.getElementById('interview-layout');

    const rows = data.results.map(r => {
      const cls  = r.is_correct ? 'correct' : 'incorrect';
      const mark = r.is_correct
        ? `✓ Correct — <strong>${r.correct}</strong>`
        : `✗ You chose <strong>${r.selected || '—'}</strong> &nbsp;·&nbsp; Correct: <strong>${r.correct}</strong>`;
      return `
        <div class="result-item ${cls}">
          <div class="result-q">${r.text}</div>
          <div class="result-a">${mark}</div>
        </div>`;
    }).join('');

    layout.innerHTML = `
      <div class="results-container" style="--pct: ${data.percentage}">
        <div class="score-circle" style="--pct: ${data.percentage}">
          <span class="score-number">${data.percentage}%</span>
          <span class="score-grade">${data.grade}</span>
        </div>

        <div class="score-detail">${data.score} of ${data.total} correct</div>

        <div class="results-list">${rows}</div>

        <button class="restart-btn" onclick="location.replace('/')">Back to Home</button>
      </div>`;
  }

  // ── UI helpers ──────────────────────────────────────────────────────────────

  _setOptionsEnabled(enabled) {
    document.querySelectorAll('.option-btn').forEach(btn => {
      btn.disabled = !enabled;
    });
  }

  _updateProgress(current, total) {
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    document.getElementById('progress-fill').style.width = `${pct}%`;
    document.getElementById('progress-label').textContent =
      current === 0 ? 'Starting…' : `Question ${current} of ${total}`;
  }

  _setDot(state) {
    const dot = document.getElementById('status-dot');
    if (dot) dot.className = `status-dot${state ? ' ' + state : ''}`;
  }

  _setStatusLabel(text) {
    const el = document.getElementById('status-label');
    if (el) el.textContent = text;
  }

  _setLoadingText(text) {
    const el = document.getElementById('loading-text');
    if (el) el.textContent = text;
  }

  _setHint(visible) {
    const el = document.getElementById('listening-hint');
    if (el) el.classList.toggle('visible', visible);
  }
}

// ── Bootstrap ────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  new InterviewController().init();
});
