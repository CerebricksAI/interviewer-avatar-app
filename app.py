"""
AI Avatar Interviewer — Flask Backend
-------------------------------------
• Serves interview UI pages
• Issues Azure Speech tokens to the browser (raw key never leaves server)
• Provides questions API and scoring endpoint
"""

import os
import requests
from flask import Flask, render_template, jsonify, request
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

SPEECH_KEY    = os.environ.get("SPEECH_KEY", "")
SPEECH_REGION = os.environ.get("SPEECH_REGION", "eastus2")

# ── Questions ──────────────────────────────────────────────────────────────────
QUESTIONS = [
    {
        "id": 1,
        "text": "How do you prioritize tasks when you have multiple deadlines at the same time?",
        "options": [
            {"id": "A", "text": "Work on the easiest task first to build momentum"},
            {"id": "B", "text": "Prioritize by deadline and impact, tackle the most critical first"},
            {"id": "C", "text": "Ask your manager to decide the priority for you"},
            {"id": "D", "text": "Work on all tasks simultaneously to show multitasking ability"},
        ],
        "correct": "B",
    },
    {
        "id": 2,
        "text": "A team member disagrees with your approach on an important project. How do you handle it?",
        "options": [
            {"id": "A", "text": "Ignore their feedback and proceed with your original plan"},
            {"id": "B", "text": "Immediately adopt their suggestion without discussion"},
            {"id": "C", "text": "Schedule a discussion to understand their perspective and find common ground"},
            {"id": "D", "text": "Escalate to your manager to make the final call"},
        ],
        "correct": "C",
    },
    {
        "id": 3,
        "text": "You realize mid-project that the initial requirements were unclear and the deliverable may miss the mark. What do you do?",
        "options": [
            {"id": "A", "text": "Complete the project as planned and hope it meets expectations"},
            {"id": "B", "text": "Immediately communicate the issue to stakeholders and realign on requirements"},
            {"id": "C", "text": "Restart the project from scratch without informing anyone"},
            {"id": "D", "text": "Submit the work and wait for feedback before making changes"},
        ],
        "correct": "B",
    },
    {
        "id": 4,
        "text": "How do you respond when you receive critical feedback about your work from a supervisor?",
        "options": [
            {"id": "A", "text": "Defend your work and explain why the feedback is wrong"},
            {"id": "B", "text": "Feel discouraged and avoid taking similar tasks in future"},
            {"id": "C", "text": "Listen actively, ask clarifying questions, and create an action plan to improve"},
            {"id": "D", "text": "Agree outwardly but make no changes to your approach"},
        ],
        "correct": "C",
    },
    {
        "id": 5,
        "text": "You are assigned a task that requires a skill you do not currently have. What is your approach?",
        "options": [
            {"id": "A", "text": "Decline the task as it is outside your current skillset"},
            {"id": "B", "text": "Accept the task, proactively learn the skill, and ask for guidance if needed"},
            {"id": "C", "text": "Complete the task using only what you already know, even if quality suffers"},
            {"id": "D", "text": "Pass the task to a colleague without informing your manager"},
        ],
        "correct": "B",
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
    """Issue a short-lived speech auth token (10 min).
    Raw SPEECH_KEY is never sent to the browser."""
    if not SPEECH_KEY:
        return jsonify({"error": "SPEECH_KEY not configured — check your .env file"}), 500
    last_error = None
    for attempt in range(3):
        try:
            res = requests.post(
                f"https://{SPEECH_REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken",
                headers={"Ocp-Apim-Subscription-Key": SPEECH_KEY, "Content-Length": "0"},
                timeout=15,
            )
            res.raise_for_status()
            return res.text  # plain text token
        except requests.RequestException as e:
            last_error = e
    return jsonify({"error": str(last_error)}), 502


@app.route("/api/getIceToken")
def get_ice_token():
    """Get ICE server credentials for the WebRTC peer connection."""
    if not SPEECH_KEY:
        return jsonify({"error": "SPEECH_KEY not configured — check your .env file"}), 500
    last_error = None
    for attempt in range(3):
        try:
            res = requests.get(
                f"https://{SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/avatar/relay/token/v1",
                headers={"Ocp-Apim-Subscription-Key": SPEECH_KEY},
                timeout=15,
            )
            res.raise_for_status()
            return res.text  # JSON: { "Urls": [...], "Username": "...", "Password": "..." }
        except requests.RequestException as e:
            last_error = e
    return jsonify({"error": str(last_error)}), 502


# ── Interview API ──────────────────────────────────────────────────────────────
@app.route("/api/questions")
def get_questions():
    """Return questions WITHOUT correct answers (scored server-side)."""
    safe = [
        {"id": q["id"], "text": q["text"], "options": q["options"]}
        for q in QUESTIONS
    ]
    return jsonify(safe)


@app.route("/api/submit", methods=["POST"])
def submit_answers():
    """Score submitted answers and return detailed results."""
    data = request.get_json() or {}
    answers = data.get("answers", {})  # e.g. {"1": "B", "2": "C", ...}

    score = 0
    results = []
    for q in QUESTIONS:
        selected = answers.get(str(q["id"]), "").upper()
        correct = q["correct"]
        is_correct = selected == correct
        if is_correct:
            score += 1
        results.append(
            {
                "id": q["id"],
                "text": q["text"],
                "options": q["options"],
                "selected": selected,
                "correct": correct,
                "is_correct": is_correct,
            }
        )

    total = len(QUESTIONS)
    pct = round(score / total * 100) if total else 0

    if pct >= 80:
        grade = "Excellent"
    elif pct >= 60:
        grade = "Good"
    elif pct >= 40:
        grade = "Average"
    else:
        grade = "Needs Improvement"

    return jsonify(
        {"score": score, "total": total, "percentage": pct, "grade": grade, "results": results}
    )


# ── Run ────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    key_status = "OK configured" if SPEECH_KEY else "NOT SET -- add SPEECH_KEY to .env"
    print(f"\n Avatar Interviewer")
    print(f"  Region : {SPEECH_REGION}")
    print(f"  Key    : {key_status}")
    print(f"  URL    : http://localhost:5000\n")
    app.run(debug=True, host="0.0.0.0", port=5000)
