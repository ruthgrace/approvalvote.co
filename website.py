from flask import Flask, render_template, request, redirect
from supabase import create_client, Client

import constants
import traceback

app = Flask(__name__)


EMAIL = "email"
TITLE = "title"
COVER_URL = "cover_url"
DESCRIPTION = "description"
CANDIDATES_TEXT = "candidates_text"
SEATS = "seats"
NEW_POLL = "new_poll"
NEW_VOTE = "new_vote"
@app.route("/")
def home_page():
    return render_template('home.html.j2')

@app.route("/makepoll")
def make_poll_page():
    return render_template('makepoll.html.j2')

def get_user_id(email, supabase):
        response = supabase.table("Users").select("id").eq("email", email).execute()
        user_id = response.data[0]['id']
        return user_id

def user_exists(email, supabase):
    response = supabase.table("Users").select("id").eq("email", email).execute()
    if len(response.data) == 0:
        return False
    return True


@app.route("/vote/<int:poll_id>")
def poll_page():
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

@app.route("/new_user", methods=["POST"])
def new_user():
    email = request.form.get("email")
    origin_function = request.form.get("origin_function")
    full_name = request.form.get("full_name", "")
    preferred_name = request.form.get("preferred_name", "")
    try:
        supabase: Client = create_client(constants.DB_URL, constants.DB_SERVICE_ROLE_KEY)
        if preferred_name == "":
            preferred_name = full_name.trim().split()[0]
        response = (
            supabase.table("Users")
            .insert({"email": email, "full_name": full_name, "preferred_name": preferred_name})
            .execute()
        )
        print(f"new user response {response}")
        user_id = response.data[0]['id']
        print(f"user id is {user_id}")
        # TODO - send verification code
        return render_template("verification_code_snippet.html.j2", user_id=user_id, origin_function=origin_function)
    except Exception:
        print(traceback.format_exc())

@app.route("/verification", methods=["POST"])
def user_verification():
    # check the verification code
    origin_function = request.form.get("origin_function")
    user_id = request.form.get("user_id")
    # get previous form data from the original task the user was trying to complete
    try:
        supabase: Client = create_client(constants.DB_URL, constants.DB_SERVICE_ROLE_KEY)
        response = supabase.table("Users").select("email").eq("id", user_id).execute()
        email = response.data[0]["email"]
        response = supabase.table("FormData").select("form_data").eq("email", email).execute()
        form_data = response.data[0]["form_data"]
    except Exception:
        print(traceback.format_exc())
    if origin_function == NEW_VOTE:
        print("trying to run new vote")
        return new_vote(form_data=form_data)
    else: # new_poll
        print(f"trying to run new poll with function eval {origin_function}(user_id='{user_id}')")
        return new_poll(form_data=form_data)

@app.route("/pollsubmit", methods=["POST"])
def new_poll(form_data=None):
    poll_data = {}
    if form_data is not None:
        poll_data = form_data
    else:
        poll_data[EMAIL] = request.form.get("email")
        poll_data[TITLE] = request.form.get("title")
        poll_data[COVER_URL] = request.form.get("cover_url", "")
        poll_data[DESCRIPTION] = request.form.get("description", "")
        poll_data[CANDIDATES_TEXT] = request.form.get("candidates", "")
        poll_data[SEATS] = int(request.form.get("seats", "0"))
    try:
        supabase: Client = create_client(constants.DB_URL, constants.DB_SERVICE_ROLE_KEY)
        if not user_exists(poll_data[EMAIL], supabase):
            print(f"user does not exist based on email {poll_data[EMAIL]}")
            # delete their form data entry if they had any left over
            supabase.table("FormData").delete().eq("email", poll_data[EMAIL]).execute()
            # write new form data entry
            response = (
                supabase.table("FormData")
                .insert({"email": poll_data[EMAIL], "form_data": poll_data})
                .execute()
            )
            return render_template("new_user_snippet.html.j2", email=poll_data[EMAIL], origin_function=NEW_POLL)
        print("getting user id")
        user_id = get_user_id(poll_data[EMAIL], supabase)
        response = (
            supabase.table("Polls")
            .insert({"title": poll_data[TITLE], "description": poll_data[DESCRIPTION], "cover_photo": poll_data[COVER_URL], "seats": poll_data[SEATS]})
            .execute()
        )
        # print(f"insert poll response: {response}")
        poll_id = response.data[0]['id']
        response = (
            supabase.table("PollAdmins")
            .insert({"poll": poll_id, "user": user_id})
            .execute()
        )
        # print(f"insert poll admin response: {response}")
        candidates = poll_data[CANDIDATES_TEXT].splitlines()
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
    <p>Number of options that will be selected: {poll_data[SEATS]}</p>
    <p>Link for your poll: <a href="https://approvalvote.co/vote/{poll_id}">approvalvote.co/vote/{poll_id}</a></p>
    """
