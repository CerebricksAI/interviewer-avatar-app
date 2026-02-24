// ── Hardcoded open-ended questions ───────────────────────────────────────────
const QUESTIONS = [
  { id: 1, text: "Tell me about a time you had to manage multiple deadlines. How did you handle it?" },
  { id: 2, text: "Describe a situation where you disagreed with a team member. What did you do?" },
  { id: 3, text: "Have you ever realized mid-project that something was going wrong? How did you respond?" },
  { id: 4, text: "How do you handle critical feedback from a supervisor? Can you give an example?" },
];

const RESPONSES = [
  "Alright, thank you for sharing that.",
  "Got it, I appreciate your response.",
  "That's a great perspective, thank you.",
  "Thank you for your answer.",
];

class InterviewController {
  constructor() {
    this.questions   = QUESTIONS;
    this.currentIdx  = 0;
    this.avatar      = null;
    this.speechToken = null;
    this.region      = window.SPEECH_REGION || 'eastus2';
  }

  async init() {
    this._setLoadingText('Connecting to Azure…');
    try {
      const [speechToken, iceTokenRaw] = await Promise.all([
        fetch('/api/getSpeechToken').then(r => { if (!r.ok) throw new Error(`Speech token error ${r.status}`); return r.text(); }),
        fetch('/api/getIceToken').then(r => { if (!r.ok) throw new Error(`ICE token error ${r.status}`); return r.text(); }),
      ]);
      this.speechToken = speechToken;
      this.avatar = new AvatarManager({
        videoElement: document.getElementById('avatar-video'),
        character: 'lisa', style: 'casual-sitting', voice: 'en-US-JennyNeural',
        onConnected: () => {
          document.getElementById('avatar-loading').style.display = 'none';
          this._setDot('connected'); this._setStatusLabel('Ready');
        },
        onDisconnected: () => {
          this._setDot(''); this._setStatusLabel('Disconnected');
          const wrapper = document.querySelector('.avatar-video-wrapper');
          if (wrapper && !document.getElementById('reconnect-overlay')) {
            const overlay = document.createElement('div');
            overlay.id = 'reconnect-overlay';
            overlay.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.85);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;z-index:10;';
            overlay.innerHTML = `<p style="color:#e0e0f0;font-size:14px;">Avatar disconnected</p><button onclick="location.reload()" style="padding:10px 28px;background:#6c63ff;color:#fff;border:none;border-radius:50px;font-size:14px;cursor:pointer;">Reconnect</button>`;
            wrapper.appendChild(overlay);
          }
        },
        onSpeakStart: () => {
          const vid = document.getElementById('avatar-video');
          if (vid && vid.muted) vid.muted = false;
          this._setDot('speaking'); this._setStatusLabel('Speaking…');
          this._setHint(true); this._showMic(false);
        },
        onSpeakEnd: () => {
          this._setDot('connected'); this._setStatusLabel('Listening…'); this._setHint(false);
        },
      });
      this._setLoadingText('Initialising avatar…');
      await this.avatar.connect(speechToken, this.region, iceTokenRaw);
      await this._startInterview();
    } catch (err) {
      console.error('[Interview] Init failed:', err);
      this._setLoadingText(`⚠ ${err.message || 'Unknown error'}`);
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

  async _startInterview() {
    this._updateProgress(0, this.questions.length);
    const welcome = 'Hello! Welcome to your behavioral interview. I will ask you four questions. After I finish speaking each question, the microphone will activate. Simply speak your answer naturally and I will listen. Let\'s begin.';
    await this._speak(welcome);
    await this._askQuestion(0);
  }

  async _askQuestion(idx) {
    if (idx >= this.questions.length) { await this._finishInterview(); return; }
    this.currentIdx = idx;
    const q = this.questions[idx];
    this._updateProgress(idx + 1, this.questions.length);
    this._showQuestionText(q, idx);
    this._showTranscript('');
    await this._speak(`Question ${idx + 1}. ${q.text}`);
    const userSpeech = await this._listenForAnswer();
    if (userSpeech) this._showTranscript(userSpeech);
    await this._speak(RESPONSES[idx] || 'Thank you for your answer.');
    await new Promise(r => setTimeout(r, 600));
    await this._askQuestion(idx + 1);
  }

  _listenForAnswer() {
    return new Promise((resolve) => {
      try {
        const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(this.speechToken, this.region);
        speechConfig.speechRecognitionLanguage = 'en-US';
        const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig);
        this._showMic(true); this._setMicStatus('Listening…');
        const timeout = setTimeout(() => { recognizer.close(); this._showMic(false); resolve(''); }, 30000);
        recognizer.recognizeOnceAsync(
          (result) => {
            clearTimeout(timeout); recognizer.close(); this._showMic(false);
            if (result.reason === SpeechSDK.ResultReason.RecognizedSpeech && result.text) resolve(result.text);
            else resolve('');
          },
          (err) => { clearTimeout(timeout); recognizer.close(); this._showMic(false); resolve(''); }
        );
      } catch (err) { this._showMic(false); resolve(''); }
    });
  }

  async _finishInterview() {
    document.getElementById('question-badge').textContent = 'Interview Complete';
    document.getElementById('question-text').textContent  = 'Wrapping up…';
    this._showMic(false); this._showTranscript('');
    this._updateProgress(this.questions.length, this.questions.length);
    await this._speak('That concludes our interview. Thank you for your time and thoughtful responses. We will be in touch soon. Have a great day!');
    await this.avatar.disconnect();
    document.getElementById('interview-layout').innerHTML = `
      <div class="results-container">
        <div style="font-size:64px;margin-bottom:8px;">🎉</div>
        <h2 style="font-size:24px;font-weight:700;margin-bottom:8px;">Interview Complete</h2>
        <p style="color:var(--text-muted);font-size:15px;margin-bottom:32px;text-align:center;line-height:1.6;">
          Thank you for completing the behavioral interview.<br/>Your responses have been noted.
        </p>
        <button class="restart-btn" onclick="location.replace('/')">Back to Home</button>
      </div>`;
  }

  async _speak(text) {
    try {
      await Promise.race([this.avatar.speak(text), new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 30000))]);
    } catch (err) { console.warn('[Interview] speak() failed:', err); }
  }

  _showQuestionText(q, idx) {
    document.getElementById('question-badge').textContent = `Question ${idx + 1} / ${this.questions.length}`;
    document.getElementById('question-text').textContent = q.text;
  }
  _showMic(visible) {
    const micArea = document.getElementById('mic-area');
    if (micArea) micArea.style.display = visible ? 'flex' : 'none';
    const ind = document.getElementById('mic-indicator');
    if (ind) ind.classList.toggle('active', visible);
  }
  _setMicStatus(text) { const el = document.getElementById('mic-status'); if (el) el.textContent = text; }
  _showTranscript(text) {
    const box = document.getElementById('transcript-box');
    const textEl = document.getElementById('transcript-text');
    if (!box || !textEl) return;
    textEl.textContent = text;
    box.style.display = text ? 'block' : 'none';
  }
  _updateProgress(current, total) {
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    document.getElementById('progress-fill').style.width = `${pct}%`;
    document.getElementById('progress-label').textContent = current === 0 ? 'Starting…' : `Question ${current} of ${total}`;
  }
  _setDot(state) { const dot = document.getElementById('status-dot'); if (dot) dot.className = `status-dot${state ? ' ' + state : ''}`; }
  _setStatusLabel(text) { const el = document.getElementById('status-label'); if (el) el.textContent = text; }
  _setLoadingText(text) { const el = document.getElementById('loading-text'); if (el) el.textContent = text; }
  _setHint(visible) { const el = document.getElementById('listening-hint'); if (el) el.classList.toggle('visible', visible); }
}

window.addEventListener('DOMContentLoaded', () => { new InterviewController().init(); });
