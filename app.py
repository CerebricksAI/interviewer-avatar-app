"""
AI Avatar Interviewer — Flask Backend
-------------------------------------
• Serves interview UI pages
• Issues Azure Speech tokens to the browser (raw key never leaves server)
• Provides questions API (voice-based interview, no MCQ scoring)
"""

import os
import requests
from flask import Flask, render_template, jsonify
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

SPEECH_KEY    = os.environ.get("SPEECH_KEY", "")
SPEECH_REGION = os.environ.get("SPEECH_REGION", "eastus2")

# ── Questions (open-ended, voice interview) ────────────────────────────────────
QUESTIONS = [
    {
        "id": 1,
        "text": "Tell me about a time you had to manage multiple deadlines. How did you handle it?",
    },
    {
        "id": 2,
        "text": "Describe a situation where you disagreed with a team member. What did you do?",
    },
    {
        "id": 3,
        "text": "Have you ever realized mid-project that something was going wrong? How did you respond?",
    },
    {
        "id": 4,
        "text": "How do you handle critical feedback from a supervisor? Can you give an example?",
    },
]


# ── Pages ──────────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/interview")
def interview():
    return render_template("interview.html", speech_region=SPEECH_REGION)


# ── Azure Speech Token Endpoints ───────────────────────────────────────────────
@app.route("/api/getSpeechToken")
def get_speech_token():
    if not SPEECH_KEY:
        return jsonify({"error": "SPEECH_KEY not configured"}), 500
    last_error = None
    for attempt in range(3):
        try:
            res = requests.post(
                f"https://{SPEECH_REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken",
                headers={"Ocp-Apim-Subscription-Key": SPEECH_KEY, "Content-Length": "0"},
                timeout=15,
            )
            res.raise_for_status()
            return res.text
        except requests.RequestException as e:
            last_error = e
    return jsonify({"error": str(last_error)}), 502


@app.route("/api/getIceToken")
def get_ice_token():
    if not SPEECH_KEY:
        return jsonify({"error": "SPEECH_KEY not configured"}), 500
    last_error = None
    for attempt in range(3):
        try:
            res = requests.get(
                f"https://{SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/avatar/relay/token/v1",
                headers={"Ocp-Apim-Subscription-Key": SPEECH_KEY},
                timeout=15,
            )
            res.raise_for_status()
            return res.text
        except requests.RequestException as e:
            last_error = e
    return jsonify({"error": str(last_error)}), 502


# ── Interview API ──────────────────────────────────────────────────────────────
@app.route("/api/questions")
def get_questions():
    """Return open-ended interview questions."""
    return jsonify(QUESTIONS)


# ── Run ────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    key_status = "OK configured" if SPEECH_KEY else "NOT SET -- add SPEECH_KEY to .env"
    print(f"\n Avatar Interviewer")
    print(f"  Region : {SPEECH_REGION}")
    print(f"  Key    : {key_status}")
    print(f"  URL    : http://localhost:5000\n")
    app.run(debug=True, host="0.0.0.0", port=5000)
