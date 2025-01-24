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

def get_user_id(email, supabase):
        response = supabase.table("Users").select("id").eq("email", email).execute()
        if len(response.data) == 0:
            response = (
                supabase.table("Users")
                .insert({"email": email})
                .execute()
            )
        user_id = response.data[0]['id']
        return user_id

@app.route("/vote/<int:poll_id>")
def poll_page(poll_id):
    candidates = []
    seats = 0
    try:
        supabase: Client = create_client(constants.DB_URL, constants.DB_SERVICE_ROLE_KEY)
        response = supabase.table("Polls").select("seats").eq("id", poll_id).single().execute()
        seats = response.data['seats']
        response = supabase.table("PollOptions").select("id, option").eq("poll", poll_id).execute()
        candidates = [(row['id'], row['option']) for row in response.data]
    except Exception:
        print(traceback.format_exc())
    return render_template('poll.html.j2', seats=seats, candidates=candidates, poll_id=poll_id)

@app.route("/votesubmit", methods=["POST"])
def new_vote():
    selected = request.form.getlist("poll_option")
    poll_id = request.form.get("poll_id")
    email = request.form.get("user_email")
    selected_str = ""
    if len(selected) == 0:
        return f"""
        <h2>Your vote was not counted. Please select at least one option.</h2>
        """
    try:
        supabase: Client = create_client(constants.DB_URL, constants.DB_SERVICE_ROLE_KEY)
        user_id = get_user_id(email, supabase)
        # if user does not exist, create it
        response = supabase.table("PollOptions").select("option").eq("poll", poll_id).execute()
        for option_id in selected:
            response = (
                supabase.table("Votes")
                .insert({"poll": poll_id, "option": option_id, "user": user_id})
                .execute()
            )
            print(f"insert vote response: {response}")
    except Exception:
        print(traceback.format_exc())
    if len(selected) == 1:
        return f"""
        <h2>Vote submitted!</h2>
        <p>You voted for: {selected[0]}</p>
        """
    return f"""
    <h2>Vote submitted!</h2>
    <p>You voted for: {", ".join(selected[:-1])}, and {selected[-1]}</p>
    """

@app.route("/results")
def poll_results_page():
    return render_template('pollresults.html.j2')

@app.route("/pollsubmit", methods=["POST"])
def new_poll():
    title = request.form.get("title")
    cover_url = request.form.get("cover_url", "")
    email = request.form.get("email")
    description = request.form.get("description", "")
    candidates_text = request.form.get("candidates", "")
    seats = request.form.get("seats", "0")
    seats = int(seats)
    candidates = candidates_text.splitlines()
    try:
        supabase: Client = create_client(constants.DB_URL, constants.DB_SERVICE_ROLE_KEY)
        user_id = get_user_id(email, supabase)
        response = (
            supabase.table("Polls")
            .insert({"title": title, "description": description, "cover_photo": cover_url, "seats": seats})
            .execute()
        )
        poll_id = response.data[0]['id']
        response = (
            supabase.table("PollAdmins")
            .insert({"poll": poll_id, "user": user_id})
            .execute()
        )
        # print(f"insert poll response: {response}")
        for candidate in candidates:
            response = (
                supabase.table("PollOptions")
                .insert({"option": candidate, "poll": poll_id})
                .execute()
            )
            # print(f"insert candidate {candidate} response: {response}")
    except Exception:
        print(traceback.format_exc())
    return f"""
    <h2>Poll Created!</h2>
    <p>You entered {len(candidates)} candidate(s): {candidates}</p>
    <p>Number of options that will be selected: {seats}</p>
    """
