from flask import Flask, render_template, request, session
from supabase import create_client, Client

import constants
import itertools
import traceback
import random
import smtplib
import ssl
from email.message import EmailMessage

app = Flask(__name__)
app.secret_key = constants.FLASK_SECRET

EMAIL = "email"
TITLE = "title"
COVER_URL = "cover_url"
DESCRIPTION = "description"
CANDIDATES_TEXT = "candidates_text"
SEATS = "seats"
NEW_POLL = "new_poll"
NEW_VOTE = "new_vote"
EMAIL_VERIFICATION = "email_verification"

SELECTED = "selected"
ID = "id"
EMAIL = "email"

DIGITS = "0123456789"
VERIFICATION_CODE_LENGTH = 4
VERIFICATION_CODE = "verification_code"

@app.route("/")
def home_page():
    return render_template('home.html.j2')

@app.route("/makepoll")
def make_poll_page():
    return render_template('make_poll.html.j2')

def get_user_id(email, supabase):
        response = supabase.table("Users").select("id").eq("email", email).execute()
        user_id = response.data[0]['id']
        return user_id

def user_exists(email, supabase):
    response = supabase.table("Users").select("id").eq("email", email).execute()
    if len(response.data) == 0:
        return False
    return True

def update_form_data(poll_data, supabase):
    # delete their form data entry if they had any left over
    supabase.table("FormData").delete().eq("email", poll_data[EMAIL]).execute()
    # write new form data entry
    response = (
        supabase.table("FormData")
        .insert({"email": poll_data[EMAIL], "form_data": poll_data})
        .execute()
    )

def random_code():
    return "".join([random.choice(DIGITS) for _ in range(VERIFICATION_CODE_LENGTH)])

def send_verification_email(recipient_email):
    code = random_code()
    print(f"verification code is {code}")
    session[VERIFICATION_CODE] = code
    # Create the email content
    message = EmailMessage()
    message["Subject"] = "ApprovalVote.Co Verification Code"
    message["From"] = constants.NOREPLY_EMAIL
    message["To"] = recipient_email
    
    # Create a simple email body; you could also use HTML here
    message.set_content(f"""
Hello,

Your verification code for ApprovalVote.Co is: {code}

If you didn't request this code, please ignore this email.
    """.strip())

    smtp_server = "mail.privateemail.com"
    port = 587  # 587 is the standard port for STARTTLS

    # Create a secure SSL context
    context = ssl.create_default_context()

    try:
        with smtplib.SMTP(smtp_server, port) as server:
            # Identify yourself to the server (some servers may require this)
            server.ehlo()
            # Secure the connection
            server.starttls(context=context)
            server.ehlo()
            # Log in to your email account
            server.login(constants.NOREPLY_EMAIL, constants.NOREPLY_PASSWORD)
            # Send the message
            server.send_message(message)
        print(f"Verification email sent to {recipient_email}")
    except Exception as e:
        print(f"Error sending email: {e}")

def votes_by_candidate(poll_id, supabase, candidate_ids=None):
        if candidate_ids is None:
            response = supabase.table("PollOptions").select("id").eq("poll", poll_id).execute()
            candidate_ids = [int(item["id"]) for item in response.data]
        candidates = {}
        for candidate_id in candidate_ids:
            candidates[candidate_id] = set()
        # get votes
        for candidate_id in candidate_ids:
            response = supabase.table("Votes").select("user", "option").eq("poll", poll_id).eq("option", candidate_id).execute()
            for vote in response.data:
                candidates[vote["option"]].add(vote["user"])
        return candidates

def candidate_text_dict(poll_id, supabase):
        response = supabase.table("PollOptions").select("id", "option").eq("poll", poll_id).execute()
        candidate_text = {}
        for item in response.data:
            candidate_text[item["id"]] = item["option"]
        candidate_text = dict(sorted(candidate_text.items()))
        return candidate_text

def votes_by_number_of_candidates(winning_set, candidates):
    # vote overlap counts how many users voted for 1, 2, 3, etc of the candidates in the winning set
    vote_overlap = []
    for c in range(len(winning_set)):
        vote_overlap.append(set())
        votes = candidates[winning_set[c]]
        for i in range(0,c):
            promote = vote_overlap[i].intersection(votes)
            vote_overlap[i] = vote_overlap[i] - promote
            vote_overlap[i+1] = vote_overlap[i+1].union(promote)
            votes = votes - promote
        vote_overlap[0] = vote_overlap[0].union(votes)
    return vote_overlap

def sorted_candidate_sets(seats, candidates):
    if seats == 1:
        sorted_sets = list(sorted(zip([len(candidates[k]) for k in candidates.keys()], [(k,) for k in candidates.keys()]), reverse=True))
    else:
        # get each potential winning set
        winning_sets = []
        total_votes = []
        for combination in itertools.combinations(candidates.keys(), seats):
            winning_sets.append(combination)
        for winning_set in winning_sets:
            vote_overlap = votes_by_number_of_candidates(winning_set, candidates)
            total = 0
            for c in range(len(winning_set)):
                if c == 0:
                    total += len(vote_overlap[c])
                else:
                    total += len(vote_overlap[c])*(1+1/(c+1))
            total_votes.append(total)
        sorted_sets = sorted(zip(total_votes, winning_sets), reverse=True)
    # print(f"sorted sets is {sorted_sets}")
    return sorted_sets

@app.route("/vote/<int:poll_id>")
def poll_page(poll_id):
    candidates = []
    seats = 0
    try:
        supabase: Client = create_client(constants.DB_URL, constants.DB_SERVICE_ROLE_KEY)
        response = supabase.table("Polls").select("seats", "title", "description").eq("id", poll_id).single().execute()
        seats = response.data['seats']
        title = response.data['title']
        description = response.data['description'] or "Vote on this poll!"
        response = supabase.table("PollOptions").select("id, option").eq("poll", poll_id).execute()
        candidates = [(row['id'], row['option']) for row in response.data]
    except Exception:
        print(traceback.format_exc())
    return render_template('poll.html.j2', seats=seats, candidates=candidates, poll_id=poll_id, title=title, description=description)

@app.route("/votesubmit", methods=["POST"])
def new_vote(form_data=None):
    poll_data = {}
    if form_data is not None:
        poll_data = form_data
    else:
        poll_data[SELECTED] = request.form.getlist("poll_option")
        poll_data[ID] = request.form.get("poll_id")
        poll_data[EMAIL] = request.form.get("user_email")
    if len(poll_data[SELECTED]) == 0:
        return f"""
        <p>Your vote was not counted. Please select at least one option.</p>
        """
    try:
        supabase: Client = create_client(constants.DB_URL, constants.DB_SERVICE_ROLE_KEY)
        response = supabase.table("Polls").select("email_verification").eq("id", poll_data[ID]).single().execute()
        email_verification = response.data['email_verification']
        if email_verification and poll_data[EMAIL] == "":
            return f"""
            <p>Your vote was not counted. Please enter an email address.</p>
            """
        if email_verification and not user_exists(poll_data[EMAIL], supabase):
            # print(f"user does not exist based on email {poll_data[EMAIL]}")
            update_form_data(poll_data, supabase)
            return render_template("new_user_snippet.html.j2", email=poll_data[EMAIL], origin_function=NEW_VOTE)
        if poll_data[EMAIL] == "":
            response = supabase.table("Users").insert({}).execute()
            user_id = response.data[0]['id']
        else:
            user_id = get_user_id(poll_data[EMAIL], supabase)
        if email_verification and EMAIL not in session:
            update_form_data(poll_data, supabase)
            send_verification_email(poll_data[EMAIL])
            return render_template("verification_code_snippet.html.j2", user_id=user_id, origin_function=NEW_VOTE)
        # delete any existing votes user already has on this poll
        response = supabase.table("Votes").delete().eq("poll", poll_data[ID]).eq("user", user_id).execute()
        option_names = []
        for option in poll_data[SELECTED]:
            (option_id, option_name) = option.split("|", maxsplit=1)
            option_names.append(option_name)
            response = (
                supabase.table("Votes")
                .insert({"poll": poll_data[ID], "option": option_id, "user": user_id})
                .execute()
            )
            # print(f"insert vote response: {response}")
        if len(option_names) == 1:
            return f"""
            <h2>Vote submitted!</h2>
            <p>You voted for: {option_names[0]}</p>
            """
        return f"""
        <h2>Vote submitted!</h2>
        <p>You voted for: {", ".join(option_names[:-1])}, and {option_names[-1]}</p>
        """
    except Exception as err:
        print(traceback.format_exc())
        return type(err).__name__

@app.route("/results/<int:poll_id>")
def poll_results_page(poll_id):
    try:
        supabase: Client = create_client(constants.DB_URL, constants.DB_SERVICE_ROLE_KEY)
        response = supabase.table("Polls").select("seats, title, description").eq("id", poll_id).execute()
        seats = response.data[0]["seats"]
        title = response.data[0]["title"]
        description = response.data[0]["description"] or ""
        if description != "":
            description = f"Poll description: {description}"
        candidate_text = candidate_text_dict(poll_id, supabase)
        candidates = votes_by_candidate(poll_id, supabase)
        vote_tally = {}
        for candidate in candidates:
            vote_tally[candidate] = len(candidates[candidate])
        vote_tally = dict(sorted(vote_tally.items(), key=lambda x: x[1], reverse=True))
        vote_labels = [candidate_text[c] for c in vote_tally.keys()]
        sorted_sets = sorted_candidate_sets(seats, candidates)
        # check if there is a tie
        if len(sorted_sets) > seats and sorted_sets[seats-1][0] == sorted_sets[seats][0]:
            # extra winners in winning set
            tie_value = sorted_sets[0][0]
            tie_winners = set(sorted_sets[0][1])
            for i in range(1, len(sorted_sets)):
                if sorted_sets[i][0] == tie_value:
                    tie_winners = tie_winners.union(set(sorted_sets[i][1]))
                else:
                    break
            winners = "There is a tie. "
            tie_winners_array = list(tie_winners)
            if len(tie_winners) == 2:
                winners += f"<strong>{candidate_text[tie_winners_array[0]]} and {candidate_text[tie_winners_array[1]]}</strong> are tied."
            else:
                tie_winners_string = ", ".join([candidate_text[x] for x in tie_winners_array[0:len(tie_winners_array)-1]]) + ", and " + candidate_text[tie_winners_array[-1]]
                winners += f"<strong>{tie_winners_string}</strong> are tied."
            winning_set = tie_winners
        else:
            winning_set = set(sorted_sets[0][1])
            winners_array = list(winning_set)
            if seats == 1:
                winners = f"The winner is <strong>{candidate_text[winners_array[0]]}</strong>."
            elif seats == 2:
                winners = f"The winners are <strong>{candidate_text[winners_array[0]]} and {candidate_text[winners_array[1]]}</strong>."
            else:
                winners_string = ", ".join([candidate_text[x] for x in winners_array[0:seats-1]]) + ", and " + candidate_text[winners_array[-1]]
                winners = f"The winners are <strong>{winners_string}</strong>."
        # save results to database
        losing_set = set(candidate_text.keys()) - winning_set
        for c in winning_set:
            response = supabase.table("PollOptions").upsert({"id": c, "option": candidate_text[c], "poll": poll_id, "winner": True, "vote_tally": vote_tally[c]}).execute()
        for c in losing_set:
            response = supabase.table("PollOptions").upsert({"id": c, "option": candidate_text[c], "poll": poll_id, "winner": False, "vote_tally": vote_tally[c]}).execute()
        print(f"winners is {winners}")
        return render_template('poll_results.html.j2', winners=winners, candidates=candidate_text, seats=seats, poll_id=poll_id, vote_labels=vote_labels, vote_tally=list(vote_tally.values()), title=title, description=description)
    except Exception as err:
        print(traceback.format_exc())
        return type(err).__name__

@app.route("/resultsubmit", methods=["POST"])
def compare_results():
    poll_id = request.form.get("poll_id")
    poll_options = request.form.getlist("poll_option")
    seats = int(request.form.get("seats"))
    if len(poll_options) != seats:
        return f"You must select the same number of options as the number of winners. The number of winners is {seats}."
    desired_candidates = {}
    for option in poll_options:
        (option_id, option_name) = option.split("|", maxsplit=1)
        desired_candidates[int(option_id)] = option_name
    try:
        supabase: Client = create_client(constants.DB_URL, constants.DB_SERVICE_ROLE_KEY)
        response = supabase.table("PollOptions").select("id", "option", "winner").eq("poll", poll_id).execute()
        winners = []
        actual_candidates = []
        candidate_text = {}
        for item in response.data:
            if item["winner"]:
                winners.append(item["id"])
                actual_candidates.append(item["option"])
            candidate_text[item["id"]] = item["option"]
        # remove extra winners in the case of a tie, for results comparison only
        tie = False
        if len(winners) > seats:
            winners = winners[0:seats]
            actual_candidates = actual_candidates[0:seats]
            tie = True
        candidates = votes_by_candidate(poll_id, supabase, candidate_ids=list(candidate_text.keys()))
        actual_results = votes_by_number_of_candidates(winners, candidates)
        max_votes = 0
        actual_vote_tally = []
        for result in actual_results:
            actual_vote_tally.append(len(result))
            if len(result) > max_votes:
                max_votes = len(result)
        desired_results = votes_by_number_of_candidates(list(desired_candidates.keys()), candidates)
        desired_vote_tally = []
        for result in desired_results:
            desired_vote_tally.append(len(result))
            if len(result) > max_votes:
                max_votes = len(result)
        actual_candidates_text = []
        desired_candidates_text = []
        if len(actual_candidates) == 1:
            actual_candidates_text.append(actual_candidates[0])
            desired_candidates_text.append(list(desired_candidates.values())[0])
        else:
            for i in range(len(actual_candidates)):
                actual_candidates_text.append(f"Votes for {i+1} candidates in this set")
                desired_candidates_text.append(f"Votes for {i+1} candidates in this set")
        print(f"actual candidates is {actual_candidates}, desired candidates is {desired_candidates}")
        print(f"actual candidates text is {actual_candidates_text}, desired candidates text is {desired_candidates_text}")
        print(f"actual vote tally is {actual_vote_tally}, desired vote tally is {desired_vote_tally}")
        print(f"max votes is {max_votes}")
        return render_template('alternate_results.html.j2', actual_candidates=actual_candidates,
        actual_chart_labels=actual_candidates_text, desired_candidates=list(desired_candidates.values()), 
        desired_chart_labels=desired_candidates_text, actual_vote_tally=actual_vote_tally, desired_vote_tally=desired_vote_tally, max_votes=max_votes, tie=tie)
    except Exception as err:
        print(traceback.format_exc())
        return type(err).__name__

@app.route("/new_user", methods=["POST"])
def new_user():
    email = request.form.get("email")
    origin_function = request.form.get("origin_function")
    full_name = request.form.get("full_name", "")
    preferred_name = request.form.get("preferred_name", "")
    try:
        supabase: Client = create_client(constants.DB_URL, constants.DB_SERVICE_ROLE_KEY)
        if preferred_name == "":
            preferred_name = full_name.strip().split()[0]
        response = (
            supabase.table("Users")
            .insert({"email": email, "full_name": full_name, "preferred_name": preferred_name})
            .execute()
        )
        print(f"new user response {response}")
        user_id = response.data[0]['id']
        print(f"user id is {user_id}")
        send_verification_email(email)
        return render_template("verification_code_snippet.html.j2", user_id=user_id, origin_function=origin_function)
    except Exception:
        print(traceback.format_exc())

@app.route("/verification", methods=["POST"])
def user_verification():
    code = request.form.get("code")
    if session[VERIFICATION_CODE] != code:
        return "Incorrect code. Please try again."
    origin_function = request.form.get("origin_function")
    user_id = request.form.get("user_id")
    # get previous form data from the original task the user was trying to complete
    try:
        supabase: Client = create_client(constants.DB_URL, constants.DB_SERVICE_ROLE_KEY)
        response = supabase.table("Users").select("email").eq("id", user_id).execute()
        email = response.data[0]["email"]
        response = supabase.table("FormData").select("form_data").eq("email", email).execute()
        form_data = response.data[0]["form_data"]
        session[EMAIL] = email
    except Exception:
        print(traceback.format_exc())
    if origin_function == NEW_VOTE:
        print("trying to run new vote with form_data {form_data}")
        return new_vote(form_data=form_data)
    else: # new_poll
        print(f"trying to run new poll with form_data {form_data}")
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
        poll_data[EMAIL_VERIFICATION] = bool(request.form.get("email_verification", ""))
    if poll_data[SEATS] < 1:
        return f"""
        <p>Your poll was not created. The number of options that will be selected as winners must be at least 1.</p>
        """
    try:
        supabase: Client = create_client(constants.DB_URL, constants.DB_SERVICE_ROLE_KEY)
        if not user_exists(poll_data[EMAIL], supabase):
            print(f"user does not exist based on email {poll_data[EMAIL]}")
            update_form_data(poll_data, supabase)
            return render_template("new_user_snippet.html.j2", email=poll_data[EMAIL], origin_function=NEW_POLL)
        user_id = get_user_id(poll_data[EMAIL], supabase)
        if EMAIL not in session:
            update_form_data(poll_data, supabase)
            send_verification_email(poll_data[EMAIL])
            return render_template("verification_code_snippet.html.j2", user_id=user_id, origin_function=NEW_POLL)
        response = (
            supabase.table("Polls")
            .insert({"title": poll_data[TITLE], "description": poll_data[DESCRIPTION], "cover_photo": poll_data[COVER_URL], "seats": poll_data[SEATS], "email_verification": poll_data[EMAIL_VERIFICATION]})
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
    <p>Number of options that will be selected as winners: {poll_data[SEATS]}</p>
    <p>Link for your poll: <a href="https://approvalvote.co/vote/{poll_id}">approvalvote.co/vote/{poll_id}</a></p>
    <p>When everyone is done voting, you can check the results here: <a href="https://approvalvote.co/results/{poll_id}">approvalvote.co/results/{poll_id}</a></p>
    """
