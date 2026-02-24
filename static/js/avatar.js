/**
 * AvatarManager
 * =============
 * Wraps the Azure Speech SDK AvatarSynthesizer with a WebRTC peer connection.
 *
 * The raw SPEECH_KEY never reaches this file — we only receive a short-lived
 * auth token (10 min) from the Flask backend at /api/getSpeechToken.
 *
 * Usage:
 *   const mgr = new AvatarManager({ videoElement, onConnected, onSpeakStart, onSpeakEnd });
 *   await mgr.connect(speechToken, region, iceTokenJson);
 *   await mgr.speak("Hello, welcome to your interview!");
 *   await mgr.disconnect();
 */
class AvatarManager {
  constructor(options = {}) {
    // Avatar appearance
    this.character = options.character || 'lisa';
    this.style     = options.style     || 'casual-sitting';
    this.voice     = options.voice     || 'en-US-JennyNeural';

    // DOM element that will show the avatar video stream
    this.videoEl = options.videoElement || null;

    // Event callbacks
    this.onConnected    = options.onConnected    || (() => {});
    this.onDisconnected = options.onDisconnected || (() => {});
    this.onSpeakStart   = options.onSpeakStart   || (() => {});
    this.onSpeakEnd     = options.onSpeakEnd     || (() => {});

    // Internal state
    this._synthesizer = null;
    this._peerConn    = null;
    this.isConnected  = false;
    this.isSpeaking   = false;
  }

  /**
   * Connect the avatar via WebRTC using Azure Speech tokens.
   *
   * @param {string}        speechToken  - Short-lived auth token from /api/getSpeechToken
   * @param {string}        region       - Azure region (e.g. "eastus2")
   * @param {string|object} iceTokenRaw  - ICE JSON from /api/getIceToken
   *                                       { Urls: [...], Username: "...", Password: "..." }
   */
  async connect(speechToken, region, iceTokenRaw) {
    const ice = typeof iceTokenRaw === 'string' ? JSON.parse(iceTokenRaw) : iceTokenRaw;

    // ICE Urls may be a single string or an array
    const iceUrls = Array.isArray(ice.Urls) ? ice.Urls : [ice.Urls];

    // 1. Create RTCPeerConnection with Azure TURN relay servers
    this._peerConn = new RTCPeerConnection({
      iceServers: [{
        urls:       iceUrls,
        username:   ice.Username,
        credential: ice.Password,
      }],
    });

    // 2. Route incoming video/audio tracks to the <video> element
    this._peerConn.ontrack = (ev) => {
      if (this.videoEl && ev.streams && ev.streams[0]) {
        this.videoEl.srcObject = ev.streams[0];
        // Retry play up to 3 times in case of autoplay/stream delay
        // Start muted (bypasses browser autoplay policy), then unmute immediately
        const tryPlay = (attempts) => {
          this.videoEl.play().then(() => {
            this.videoEl.muted = false; // unmute once playing starts
          }).catch((err) => {
            console.warn('[AvatarManager] play() failed:', err);
            if (attempts > 0) setTimeout(() => tryPlay(attempts - 1), 500);
          });
        };
        tryPlay(3);
      }
    };

    // 3. Watch for disconnection
    this._peerConn.oniceconnectionstatechange = () => {
      const state = this._peerConn.iceConnectionState;
      console.log('[AvatarManager] ICE state:', state);
      if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        this.isConnected = false;
        this.onDisconnected();
      }
    };

    // 4. Add send/receive transceivers (required before startAvatarAsync)
    this._peerConn.addTransceiver('video', { direction: 'sendrecv' });
    this._peerConn.addTransceiver('audio', { direction: 'sendrecv' });

    // 5. Build SpeechConfig from the short-lived token (not the raw key)
    const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(speechToken, region);
    speechConfig.speechSynthesisVoiceName = this.voice;

    // 6. Configure the avatar character and style
    const avatarConfig = new SpeechSDK.AvatarConfig(this.character, this.style);

    // 7. Create the AvatarSynthesizer
    this._synthesizer = new SpeechSDK.AvatarSynthesizer(speechConfig, avatarConfig);

    // Optional: log avatar lifecycle events
    this._synthesizer.avatarEventReceived = (s, e) => {
      const ms = e.offset / 10000;
      console.log(`[AvatarManager] Event at ${ms.toFixed(0)}ms: ${e.description}`);
    };

    // 8. Start the avatar — this handles the full WebRTC SDP offer/answer exchange
    await this._synthesizer.startAvatarAsync(this._peerConn);

    this.isConnected = true;
    this.onConnected();
    console.log('[AvatarManager] Connected successfully.');
  }

  /**
   * Make the avatar speak text with full lip-sync.
   * Returns a Promise that resolves when the avatar finishes speaking.
   *
   * @param {string} text  - Plain text to synthesize
   * @returns {Promise<SpeechSynthesisResult>}
   */
  speak(text) {
    return new Promise((resolve, reject) => {
      if (!this._synthesizer || !this.isConnected) {
        reject(new Error('Avatar is not connected. Call connect() first.'));
        return;
      }

      this.isSpeaking = true;
      this.onSpeakStart();

      this._synthesizer.speakTextAsync(
        text,
        (result) => {
          this.isSpeaking = false;
          this.onSpeakEnd();

          if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
            resolve(result);
          } else {
            const msg = `Speech synthesis failed (reason ${result.reason}): ${result.errorDetails || 'unknown error'}`;
            console.error('[AvatarManager]', msg);
            reject(new Error(msg));
          }
        },
        (err) => {
          this.isSpeaking = false;
          this.onSpeakEnd();
          console.error('[AvatarManager] speakTextAsync error:', err);
          reject(new Error(String(err)));
        },
      );
    });
  }

  /**
   * Interrupt the avatar mid-speech.
   */
  async stopSpeaking() {
    if (this._synthesizer && this.isSpeaking) {
      try {
        await this._synthesizer.stopSpeakingAsync();
      } catch (_) { /* ignore */ }
      this.isSpeaking = false;
    }
  }

  /**
   * Cleanly shut down the synthesizer and peer connection.
   */
  async disconnect() {
    if (this._synthesizer) {
      try { this._synthesizer.close(); } catch (_) { /* ignore */ }
      this._synthesizer = null;
    }
    if (this._peerConn) {
      try { this._peerConn.close(); } catch (_) { /* ignore */ }
      this._peerConn = null;
    }
    this.isConnected = false;
    console.log('[AvatarManager] Disconnected.');
  }
}
