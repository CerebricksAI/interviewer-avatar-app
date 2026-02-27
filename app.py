"""
AI Avatar Interviewer — Flask Backend
-------------------------------------
• Serves interview UI pages
• Tavus CVI integration for real-time avatar conversations
"""

import os
import requests
from flask import Flask, render_template, jsonify
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

# # ── Azure Speech Config (commented out — using Tavus only) ──────────────────
# SPEECH_KEY    = os.environ.get("SPEECH_KEY", "")
# SPEECH_REGION = os.environ.get("SPEECH_REGION", "eastus2")

# ── Tavus CVI Config ────────────────────────────────────────────────────────────
TAVUS_API_KEY    = os.environ.get("TAVUS_API_KEY", "")
TAVUS_PERSONA_ID = os.environ.get("TAVUS_PERSONA_ID", "")
TAVUS_REPLICA_ID = os.environ.get("TAVUS_REPLICA_ID", "")

# # ── Questions (Azure voice interview — commented out) ─────────────────────────
# QUESTIONS = [
#     {"id": 1, "text": "Tell me about a time you had to manage multiple deadlines. How did you handle it?"},
#     {"id": 2, "text": "Describe a situation where you disagreed with a team member. What did you do?"},
#     {"id": 3, "text": "Have you ever realized mid-project that something was going wrong? How did you respond?"},
#     {"id": 4, "text": "How do you handle critical feedback from a supervisor? Can you give an example?"},
# ]


# ── Page ───────────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("tavus.html")


# # ── Azure Speech Token Endpoints (commented out) ───────────────────────────
# @app.route("/api/getSpeechToken")
# def get_speech_token():
#     if not SPEECH_KEY:
#         return jsonify({"error": "SPEECH_KEY not configured"}), 500
#     last_error = None
#     for attempt in range(3):
#         try:
#             res = requests.post(
#                 f"https://{SPEECH_REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken",
#                 headers={"Ocp-Apim-Subscription-Key": SPEECH_KEY, "Content-Length": "0"},
#                 timeout=15,
#             )
#             res.raise_for_status()
#             return res.text
#         except requests.RequestException as e:
#             last_error = e
#     return jsonify({"error": str(last_error)}), 502


# @app.route("/api/getIceToken")
# def get_ice_token():
#     if not SPEECH_KEY:
#         return jsonify({"error": "SPEECH_KEY not configured"}), 500
#     last_error = None
#     for attempt in range(3):
#         try:
#             res = requests.get(
#                 f"https://{SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/avatar/relay/token/v1",
#                 headers={"Ocp-Apim-Subscription-Key": SPEECH_KEY},
#                 timeout=15,
#             )
#             res.raise_for_status()
#             return res.text
#         except requests.RequestException as e:
#             last_error = e
#     return jsonify({"error": str(last_error)}), 502


# # ── Interview Questions API (commented out) ────────────────────────────────
# @app.route("/api/questions")
# def get_questions():
#     return jsonify(QUESTIONS)


# ── Tavus CVI API ───────────────────────────────────────────────────────────────
@app.route("/api/startTavusConversation")
def start_tavus_conversation():
    """Create a new Tavus CVI conversation session."""
    if not TAVUS_API_KEY:
        return jsonify({"error": "TAVUS_API_KEY not configured"}), 500

    try:
        res = requests.post(
            "https://tavusapi.com/v2/conversations",
            headers={
                "x-api-key": TAVUS_API_KEY,
                "Content-Type": "application/json"
            },
            json={
                "persona_id": TAVUS_PERSONA_ID,
                "replica_id": TAVUS_REPLICA_ID,
                "conversation_name": "Interview Session",
                "properties": {
                    "max_call_duration": 600,
                    "enable_recording": False
                }
            },
            timeout=15
        )
        res.raise_for_status()
        data = res.json()
        return jsonify({
            "conversation_url": data["conversation_url"],
            "conversation_id": data["conversation_id"]
        })
    except requests.RequestException as e:
        return jsonify({"error": str(e)}), 502


# ── Run ────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    tavus_status = "OK configured" if TAVUS_API_KEY else "NOT SET -- add TAVUS_API_KEY to .env"
    print(f"\n Avatar Interviewer (Tavus CVI)")
    print(f"  Tavus API : {tavus_status}")
    print(f"  URL       : http://localhost:5000\n")
    app.run(debug=True, host="0.0.0.0", port=5000)
