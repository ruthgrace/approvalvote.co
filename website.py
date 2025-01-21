from flask import Flask, render_template, request
from supabase import create_client, Client

import constants
import traceback

app = Flask(__name__)

@app.route("/")
def home_page():
    return render_template('home.html.j2')

@app.route("/makepoll")
def make_poll_page():
    return render_template('makepoll.html.j2')

@app.route("/vote")
def poll_page():
    return render_template('poll.html.j2')

@app.route("/results")
def poll_results_page():
    return render_template('pollresults.html.j2')

@app.route("/pollsubmit", methods=["POST"])
def newpoll():
    candidates_text = request.form.get("candidates", "")
    seats = request.form.get("seats", "0")
    seats = int(seats)
    candidates = candidates_text.splitlines()
    try:
        supabase: Client = create_client(constants.DB_URL, constants.DB_SERVICE_ROLE_KEY)
        response = (
            supabase.table("Polls")
            .insert({"title": "ruth test poll 1", "description": "filler description just for testing", "seats": seats})
            .execute()
        )
        print(f"insert poll response: {response}")
        poll_id = response.data[0]['id']
        for candidate in candidates:
            response = (
                supabase.table("PollOptions")
                .insert({"option": candidate, "poll": poll_id})
                .execute()
            )
            print(f"insert candidate {candidate} response: {response}")
    except Exception:
        print(traceback.format_exc())
    return f"""
    <h2>Poll Created!</h2>
    <p>You entered {len(candidates)} candidate(s): {candidates}</p>
    <p>Number of seats: {seats}</p>
    """




