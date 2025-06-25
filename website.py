from flask import Flask, render_template, request, session, make_response
from supabase import create_client, Client
import itertools
import traceback
from database import PollDatabase
from email_service import EmailService
from vote_utils import format_vote_confirmation, format_winners_text, sorted_candidate_sets, votes_by_candidate, votes_by_number_of_candidates
import secret_constants
from constants import EMAIL, TITLE, COVER_URL, DESCRIPTION, CANDIDATES, SEATS, NEW_POLL, NEW_VOTE, EMAIL_VERIFICATION, SELECTED, ID, VERIFICATION_CODE

app = Flask(__name__)
app.secret_key = secret_constants.FLASK_SECRET

# Initialize services
supabase: Client = create_client(secret_constants.DB_URL, secret_constants.DB_SERVICE_ROLE_KEY)
db = PollDatabase(supabase)
email_service = EmailService(secret_constants.NOREPLY_EMAIL, secret_constants.NOREPLY_PASSWORD)

@app.route("/")
def home_page():
    return render_template('home.html.j2')

@app.route("/makepoll")
def make_poll_page():
    return render_template('make_poll.html.j2')

@app.route("/vote/<int:poll_id>")
def poll_page(poll_id):
    try:
        poll_details = db.get_poll_details(poll_id)
        seats = poll_details['seats']
        title = poll_details['title']
        description = poll_details['description'] or "Vote on this poll!"
        thumbnail_url = poll_details['cover_photo'] or ""
        candidates = db.get_poll_candidates(poll_id)
        return render_template('poll.html.j2', 
                            seats=seats, 
                            candidates=candidates, 
                            poll_id=poll_id, 
                            page_title=title, 
                            page_description=description, 
                            thumbnail_url=thumbnail_url)
    except Exception as err:
        print(traceback.format_exc())
        return f"Error loading poll: {type(err).__name__}. Please check if the poll ID is correct.", 404

@app.route("/votesubmit", methods=["POST"])
def new_vote(form_data=None):
    poll_data = form_data or {
        SELECTED: request.form.getlist("poll_option"),
        ID: request.form.get("poll_id"),
        EMAIL: request.form.get("user_email")
    }

    if len(poll_data[SELECTED]) == 0:
        response = make_response(f"""
        <p>Your vote was not counted. Please select at least one option.</p>
        """)
        response.headers["HX-Retarget"] = "#error-message-div"
        return response

    try:
        # Check if email verification is required
        email_verification = db.get_poll_email_verification(poll_data[ID])
        if email_verification and not poll_data[EMAIL]:
            return "Please enter an email address."

        # Handle user verification
        if poll_data[EMAIL]:
            if not db.user_exists(poll_data[EMAIL]):
                db.save_form_data(poll_data[EMAIL], poll_data)
                response = make_response(render_template(
                    "new_user_snippet.html.j2", 
                    email=poll_data[EMAIL], 
                    origin_function=NEW_VOTE
                ))
                response.headers["HX-Retarget"] = "#error-message-div"
                return response

            if email_verification and EMAIL not in session:
                db.save_form_data(poll_data[EMAIL], poll_data)
                code = email_service.send_verification_email(poll_data[EMAIL])
                session[VERIFICATION_CODE] = code
                return render_template(
                    "verification_code_snippet.html.j2",
                    user_id=db.get_user_id(poll_data[EMAIL]),
                    origin_function=NEW_VOTE
                )

        # Process the vote
        user_id = db.get_user_id(poll_data[EMAIL]) if poll_data[EMAIL] else db.create_anonymous_user()
        db.save_votes(poll_data[ID], user_id, poll_data[SELECTED])
        
        return format_vote_confirmation(poll_data[SELECTED], poll_data[ID])

    except Exception as err:
        print(traceback.format_exc())
        return type(err).__name__

@app.route("/results/<int:poll_id>")
def poll_results_page(poll_id):
    try:
        # Get poll details
        poll_details = db.get_poll_details(poll_id)
        seats = poll_details['seats']
        title = poll_details['title']
        description = poll_details['description'] or ""
        if description:
            description = f"Poll description: {description}"

        # Get vote data
        candidate_text = db.get_candidate_text(poll_id)
        candidates = db.get_votes_by_candidate(poll_id)
        
        # Calculate results
        vote_tally = {candidate: len(votes) for candidate, votes in candidates.items()}
        vote_tally = dict(sorted(vote_tally.items(), key=lambda x: x[1], reverse=True))
        vote_labels = [candidate_text[c] for c in vote_tally.keys()]
        
        sorted_sets = sorted_candidate_sets(seats, candidates)
        
        # Determine winners
        is_tie = len(sorted_sets) > seats and sorted_sets[seats-1][0] == sorted_sets[seats][0]
        if is_tie:
            tie_value = sorted_sets[0][0]
            winning_set = set()
            for score, candidates in sorted_sets:
                if score == tie_value:
                    winning_set.update(candidates)
                else:
                    break
            winners = "There is a tie. " + format_winners_text(winning_set, candidate_text, seats, is_tie=True)
        else:
            winning_set = set(sorted_sets[0][1])
            winners = format_winners_text(winning_set, candidate_text, seats)

        # Save results
        db.save_poll_results(poll_id, winning_set, candidate_text, vote_tally)

        return render_template(
            'poll_results.html.j2',
            winners=winners,
            candidates=candidate_text,
            seats=seats,
            poll_id=poll_id,
            vote_labels=vote_labels,
            vote_tally=list(vote_tally.values()),
            title=title,
            description=description
        )

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
                if i == 0:
                    actual_candidates_text.append(f"Votes for {i+1} candidate in this set")
                    desired_candidates_text.append(f"Votes for {i+1} candidate in this set")
                else:
                    actual_candidates_text.append(f"Votes for {i+1} candidates in this set")
                    desired_candidates_text.append(f"Votes for {i+1} candidates in this set")
        return render_template('alternate_results.html.j2', actual_candidates=actual_candidates,
        actual_chart_labels=actual_candidates_text, desired_candidates=list(desired_candidates.values()), 
        desired_chart_labels=desired_candidates_text, actual_vote_tally=actual_vote_tally, desired_vote_tally=desired_vote_tally, max_votes=max_votes, tie=tie)
    except Exception as err:
        print(traceback.format_exc())
        return type(err).__name__

@app.route("/new_user", methods=["POST"])
def new_user():
    print("=== NEW_USER ROUTE CALLED ===")
    email = request.form.get("email")
    origin_function = request.form.get("origin_function")
    full_name = request.form.get("full_name", "")
    preferred_name = request.form.get("preferred_name", "")
    
    print(f"📧 Email: {email}")
    print(f"🎯 Origin function: {origin_function}")
    print(f"👤 Full name: {full_name}")
    print(f"🏷️ Preferred name: {preferred_name}")
    
    try:
        if preferred_name == "":
            preferred_name = full_name.strip().split()[0]
            print(f"🔄 Auto-generated preferred name: {preferred_name}")
        
        print("💾 Attempting to insert user into database...")
        response = (
            supabase.table("Users")
            .insert({"email": email, "full_name": full_name, "preferred_name": preferred_name})
            .execute()
        )
        print(f"✅ Database insert response: {response}")
        
        user_id = response.data[0]['id']
        print(f"🆔 Generated user ID: {user_id}")
        
        print("📨 Attempting to send verification email...")
        verification_code = email_service.send_verification_email(email)
        print(f"🔐 Email service returned verification code: {verification_code}")
        
        # Store verification code in session for later verification
        session[VERIFICATION_CODE] = verification_code
        print(f"📝 Stored verification code in session")
        
        print("📝 Rendering verification code template...")
        template_response = render_template("verification_code_snippet.html.j2", user_id=user_id, origin_function=origin_function)
        print(f"📄 Template rendered successfully, length: {len(template_response)}")
        
        response = make_response(template_response)
        response.headers["HX-Retarget"] = "#error-message-div"
        response.headers["HX-Swap"] = "innerHTML"
        print("✅ Response prepared with HTMX headers")
        return response
        
    except Exception as e:
        print("❌ EXCEPTION IN NEW_USER ROUTE:")
        print(f"Exception type: {type(e).__name__}")
        print(f"Exception message: {str(e)}")
        print(traceback.format_exc())
        
        # Return an error response instead of None
        error_response = make_response(f"Registration failed: {str(e)}")
        error_response.headers["HX-Retarget"] = "#error-message-div"
        error_response.headers["HX-Swap"] = "innerHTML"
        return error_response

@app.route("/verification", methods=["POST"])
def user_verification():
    code = request.form.get("code")
    if session[VERIFICATION_CODE] != code:
        return "Incorrect code. Please try again."
    origin_function = request.form.get("origin_function")
    user_id = request.form.get("user_id")
    # get previous form data from the original task the user was trying to complete
    try:
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

@app.route("/remove-option", methods=["DELETE"])
def remove_poll_option():
    return ""

@app.route("/add-option", methods=["POST"])
def add_poll_option():
    return """
          <div class="relative mt-3">
            <input type="text" name="option" placeholder="Option" autofocus class="py-2 w-full pr-10 placeholder:text-lg bg-gray-50 focus:outline-none" required>
            <button 
              class="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-300 text-xl hover:text-gray-600"
              hx-delete="/remove-option"
              hx-target="closest div"
              hx-swap="outerHTML"
            >✕</button>
          <hr class="mt-3">
          </div>
"""

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
        poll_data[CANDIDATES] = request.form.getlist("option")
        poll_data[SEATS] = int(request.form.get("seats", "0"))
        poll_data[EMAIL_VERIFICATION] = bool(request.form.get("email_verification", ""))
    try:
        if not db.user_exists(poll_data[EMAIL]):
            db.save_form_data(poll_data)
            response = make_response(render_template("new_user_snippet.html.j2", email=poll_data[EMAIL], origin_function=NEW_POLL))
            response.headers["HX-Retarget"] = "#error-message-div"
            response.headers["HX-Swap"] = "innerHTML"
            return response
        user_id = db.get_user_id(poll_data[EMAIL])
        if EMAIL not in session or session[EMAIL] != poll_data[EMAIL]:
            db.save_form_data(poll_data)
            # Send verification email (with timeout protection)
            verification_code = email_service.send_verification_email(poll_data[EMAIL])
            session[VERIFICATION_CODE] = verification_code
            response = make_response(render_template("verification_code_snippet.html.j2", user_id=user_id, origin_function=NEW_POLL))
            response.headers["HX-Retarget"] = "#error-message-div"
            response.headers["HX-Swap"] = "innerHTML"
            return response
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
        for candidate in poll_data[CANDIDATES]:
            response = (
                supabase.table("PollOptions")
                .insert({"option": candidate, "poll": poll_id})
                .execute()
            )
            # print(f"insert candidate {candidate} response: {response}")
        return render_template("make_poll_success.html.j2", poll_id=poll_id, preview_title=poll_data[TITLE], preview_description=poll_data[DESCRIPTION], thumbnail_preview_url=poll_data[COVER_URL])
    except Exception as err:
        print(traceback.format_exc())
        response = make_response(f"Error: {err}")
        response.headers["HX-Retarget"] = "#error-message-div"
        return response

@app.route("/api/poll/<int:poll_id>", methods=["DELETE"])
def delete_poll_api(poll_id):
    """API endpoint to delete a poll"""
    try:
        # Get email from request (could be from JSON body or form data)
        email = None
        if request.is_json:
            email = request.json.get('email')
        else:
            email = request.form.get('email')
        
        if not email:
            return {"error": "Email is required"}, 400
        
        # Check if user exists
        user_id = db.get_user_id(email)
        if not user_id:
            return {"error": "User not found"}, 404
        
        # Check if poll exists
        if not db.poll_exists(poll_id):
            return {"error": "Poll not found"}, 404
        
        # Delete the poll (this will check admin permissions)
        db.delete_poll(poll_id, user_id)
        
        return {"message": f"Poll {poll_id} deleted successfully"}, 200
        
    except ValueError as e:
        return {"error": str(e)}, 403
    except Exception as e:
        print(traceback.format_exc())
        return {"error": "An error occurred while deleting the poll"}, 500

@app.route("/api/user", methods=["DELETE"])
def delete_user_api():
    """API endpoint to delete a user"""
    try:
        # Get email from request (could be from JSON body or form data)
        email = None
        if request.is_json:
            email = request.json.get('email')
        else:
            email = request.form.get('email')
        
        if not email:
            return {"error": "Email is required"}, 400
        
        # Delete the user (this will check if user exists)
        db.delete_user(email)
        
        return {"message": f"User with email {email} deleted successfully"}, 200
        
    except ValueError as e:
        return {"error": str(e)}, 404
    except Exception as e:
        print(traceback.format_exc())
        return {"error": "An error occurred while deleting the user"}, 500

@app.route("/api/test/verification-code", methods=["GET"])
def get_test_verification_code():
    """Get the last verification code (TEST ONLY - only works in development)"""
    import os
    if os.getenv('FLASK_ENV') != 'development':
        return {"error": "This endpoint is only available in development mode"}, 403
    
    code = email_service.get_last_verification_code()
    if code:
        return {"verification_code": code}, 200
    else:
        return {"error": "No verification code available"}, 404

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=3000, debug=True)
