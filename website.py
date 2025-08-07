from flask import Flask, render_template, request, session, make_response, redirect, Response
from supabase import create_client, Client
import itertools
import traceback
import csv
import io
from datetime import datetime
from database import PollDatabase
from email_service import EmailService
from vote_utils import format_vote_confirmation, format_winners_text, sorted_candidate_sets, excess_vote_rounds, votes_by_candidate, votes_by_number_of_candidates
import secret_constants
from constants import EMAIL, TITLE, COVER_URL, DESCRIPTION, CANDIDATES, SEATS, NEW_POLL, NEW_VOTE, LOGIN, EMAIL_VERIFICATION, SELECTED, ID, VERIFICATION_CODE

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
                db.save_form_data(poll_data)
                response = make_response(render_template(
                    "new_user_snippet.html.j2", 
                    email=poll_data[EMAIL], 
                    origin_function=NEW_VOTE
                ))
                response.headers["HX-Retarget"] = "#error-message-div"
                return response

            if email_verification and (EMAIL not in session or session[EMAIL] != poll_data[EMAIL]):
                db.save_form_data(poll_data)
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
        ballot_counts = db.get_votes_by_candidate_sets(poll_id)
        
        # Calculate results
        vote_tally = {candidate: len(votes) for candidate, votes in candidates.items()}
        vote_tally = dict(sorted(vote_tally.items(), key=lambda x: x[1], reverse=True))
        vote_labels = [candidate_text[c] for c in vote_tally.keys()]
        
        # Calculate using excess vote method for animation
        excess_rounds_raw = excess_vote_rounds(seats, candidates, ballot_counts, candidate_text)
        
        # Convert excess_rounds to JSON-serializable format
        excess_rounds = []
        winning_set = set()
        for round_data in excess_rounds_raw:
            json_round = {}
            
            # Collect winners
            if 'winner' in round_data and round_data['winner']:
                winning_set.add(round_data['winner'])
            
            # Convert ballot_counts (has frozenset keys)
            if 'ballot_counts' in round_data:
                json_round['ballot_counts'] = {
                    str(list(ballot)): count 
                    for ballot, count in round_data['ballot_counts'].items()
                }
            
            # Convert votes_per_candidate (has set values)
            if 'votes_per_candidate' in round_data:
                json_round['votes_per_candidate'] = {
                    str(cand_id): list(voters) 
                    for cand_id, voters in round_data['votes_per_candidate'].items()
                }
            
            # Copy other fields as-is
            for key in ['winner', 'is_tie']:
                if key in round_data:
                    json_round[key] = round_data[key]
            
            excess_rounds.append(json_round)
        
        # Check if there's an actual tie (more winners than seats)
        is_tie = len(winning_set) > seats
        
        # Format winners text using the actual winners from excess_vote_rounds
        if is_tie:
            winners = "There is a tie. " + format_winners_text(winning_set, candidate_text, seats, is_tie=True)
        else:
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
            description=description,
            excess_rounds=excess_rounds
        )

    except Exception as err:
        print(traceback.format_exc())
        return type(err).__name__

@app.route("/download-votes/<int:poll_id>")
def download_votes_csv(poll_id):
    try:
        # Get vote data and poll options
        user_votes, option_map = db.get_votes_for_csv(poll_id)
        
        # Get poll title for filename
        poll_details = db.get_poll_details(poll_id)
        poll_title = poll_details['title'] if poll_details else f"Poll_{poll_id}"
        
        # Create CSV in memory
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Create header row
        header = ["Timestamp"] + [option_text for option_text in option_map.values()]
        writer.writerow(header)
        
        # Write data rows
        for vote_data in user_votes.values():
            timestamp = vote_data["timestamp"]
            
            # Parse the timestamp to make it more readable
            try:
                # Parse ISO format timestamp
                dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                formatted_timestamp = dt.strftime('%Y-%m-%d %H:%M:%S UTC')
            except:
                formatted_timestamp = timestamp
            
            # Create row with timestamp and yes/no for each option
            row = [formatted_timestamp]
            for option_id, option_text in option_map.items():
                row.append("yes" if option_id in vote_data["votes"] else "no")
            
            writer.writerow(row)
        
        # Prepare the response
        output.seek(0)
        csv_data = output.getvalue()
        output.close()
        
        # Create filename with safe characters
        safe_title = "".join(c for c in poll_title if c.isalnum() or c in (' ', '-', '_')).rstrip()
        filename = f"{safe_title}_votes.csv"
        
        # Return CSV as download
        response = Response(
            csv_data,
            mimetype='text/csv',
            headers={'Content-Disposition': f'attachment; filename="{filename}"'}
        )
        return response
        
    except Exception as err:
        print(traceback.format_exc())
        return f"Error generating CSV: {type(err).__name__}", 500

@app.route("/resultsubmit", methods=["POST"])
def compare_results():
    poll_id = request.form.get("poll_id")
    poll_option = request.form.get("poll_option")  # Single option now
    seats = int(request.form.get("seats"))
    
    if not poll_option:
        return "<div class='text-red-600'>Please select a candidate.</div>"
    
    # Parse the selected candidate
    option_id, option_name = poll_option.split("|", maxsplit=1)
    selected_candidate_id = int(option_id)
    
    try:
        # Get all candidates and their vote counts
        candidates = db.get_votes_by_candidate(poll_id)
        candidate_text = db.get_candidate_text(poll_id)
        ballot_counts = db.get_votes_by_candidate_sets(poll_id)
        
        # Run excess_vote_rounds to get the winners in order
        excess_rounds = excess_vote_rounds(seats, candidates, ballot_counts, candidate_text)
        
        # Extract winners and their vote counts from each round
        winners_in_order = []
        winner_votes_by_round = {}
        selected_votes_by_round = {}
        
        for round_idx, round_data in enumerate(excess_rounds):
            if 'winner' in round_data and round_data['winner']:
                winner_id = round_data['winner']
                winners_in_order.append(winner_id)
                
                # Get winner's votes in their winning round
                if 'votes_per_candidate' in round_data and winner_id in round_data['votes_per_candidate']:
                    winner_votes_by_round[winner_id] = len(round_data['votes_per_candidate'][winner_id])
                
                # Get selected candidate's votes in each round
                if 'votes_per_candidate' in round_data and selected_candidate_id in round_data['votes_per_candidate']:
                    selected_votes_by_round[round_idx] = len(round_data['votes_per_candidate'][selected_candidate_id])
                elif 'ballot_counts' in round_data:
                    # Calculate from ballot_counts if not in votes_per_candidate
                    vote_count = 0
                    for ballot, count in round_data['ballot_counts'].items():
                        if selected_candidate_id in ballot:
                            vote_count += count
                    selected_votes_by_round[round_idx] = vote_count
                else:
                    selected_votes_by_round[round_idx] = 0
        
        # Get initial selected candidate's vote count
        initial_selected_votes = len(candidates.get(selected_candidate_id, set()))
        
        # Check if selected candidate is a winner
        if selected_candidate_id in winners_in_order:
            position = winners_in_order.index(selected_candidate_id) + 1
            position_text = "1st" if position == 1 else "2nd" if position == 2 else f"{position}th"
            return f"""
            <div class='p-4 bg-green-50 border border-green-300 rounded-lg'>
                <h3 class='font-bold text-green-800 mb-2'>Your candidate won!</h3>
                <p class='text-green-700'>{option_name} finished in {position_text} place with {initial_selected_votes} votes.</p>
            </div>
            """
        
        # Calculate how many votes short for each position
        vote_differences = []
        
        for i, winner_id in enumerate(winners_in_order[:seats]):
            position = i + 1
            position_text = "1st" if position == 1 else "2nd" if position == 2 else "3rd" if position == 3 else f"{position}th"
            winner_name = candidate_text[winner_id]
            
            # For round 1, use initial votes
            if i == 0:
                winner_vote_count = winner_votes_by_round[winner_id]
                selected_vote_count = initial_selected_votes
                votes_needed = winner_vote_count - selected_vote_count + 1  # +1 to beat, not tie
                
                # For 1st place, need votes that don't overlap with the winner
                exclusion_text = f" who did not also vote for {winner_name}"
                
                if votes_needed > 0:
                    vote_differences.append(f"<li>{position_text} place ({winner_name}): <strong>{votes_needed} more vote{'s' if votes_needed != 1 else ''}</strong> needed{exclusion_text}</li>")
                else:
                    vote_differences.append(f"<li>{position_text} place ({winner_name}): Had enough votes but lost in the tie-breaking</li>")
            else:
                # For subsequent rounds, calculate votes from ballot_counts after redistribution
                # The winner's vote count in round i is from ballot_counts
                round_data = excess_rounds[i]
                
                # Calculate winner's actual votes from ballot_counts
                winner_vote_count = 0
                if 'ballot_counts' in round_data:
                    for ballot, count in round_data['ballot_counts'].items():
                        if winner_id in ballot:
                            winner_vote_count += count
                
                # Calculate selected candidate's votes from ballot_counts
                selected_vote_count = 0
                if 'ballot_counts' in round_data:
                    for ballot, count in round_data['ballot_counts'].items():
                        if selected_candidate_id in ballot:
                            selected_vote_count += count
                
                # Round to 1 decimal place for display
                winner_vote_count = round(winner_vote_count, 1)
                selected_vote_count = round(selected_vote_count, 1)
                votes_needed = round(winner_vote_count - selected_vote_count + 0.1, 1)  # +0.1 to beat, not tie
                
                # Build the exclusion list text - include ALL winners up to this position
                all_winners_so_far = [candidate_text[winners_in_order[j]] for j in range(i + 1)]
                if len(all_winners_so_far) == 1:
                    exclusion_text = f" who did not also vote for {all_winners_so_far[0]}"
                else:
                    exclusion_text = f" who did not also vote for {' or '.join(all_winners_so_far)}"
                
                if votes_needed > 0:
                    vote_differences.append(f"<li>{position_text} place ({winner_name}): <strong>{votes_needed} more vote{'s' if votes_needed != 1 else ''}</strong> needed{exclusion_text}</li>")
                else:
                    vote_differences.append(f"<li>{position_text} place ({winner_name}): Had enough votes but lost in the redistribution</li>")
        
        return f"""
        <div class='p-4 bg-blue-50 border border-blue-300 rounded-lg'>
            <h3 class='font-bold text-blue-800 mb-2'>Vote Analysis for {option_name}</h3>
            <p class='text-blue-700 mb-2'>Your candidate received {initial_selected_votes} vote{'s' if initial_selected_votes != 1 else ''}.</p>
            <p class='text-blue-700 mb-2'>To win each position, they would have needed:</p>
            <ul class='list-disc list-inside text-blue-700'>
                {''.join(vote_differences)}
            </ul>
        </div>
        """
        
    except Exception as err:
        print(traceback.format_exc())
        return f"<div class='text-red-600'>Error: {type(err).__name__}</div>"

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
    
    # Handle login verification
    if origin_function == LOGIN:
        try:
            email = session.get("login_email")
            if email:
                session[EMAIL] = email
                session.pop("login_email", None)  # Clean up temporary email storage
                # Redirect to dashboard using HTMX
                response = make_response("")
                response.headers["HX-Redirect"] = "/dashboard"
                return response
            else:
                return "Login session expired. Please try again."
        except Exception:
            print(traceback.format_exc())
            return "Login failed. Please try again."
    
    # get previous form data from the original task the user was trying to complete
    form_data = None
    try:
        response = supabase.table("Users").select("email").eq("id", user_id).execute()
        email = response.data[0]["email"]
        response = supabase.table("FormData").select("form_data").eq("email", email).execute()
        form_data = response.data[0]["form_data"]
        session[EMAIL] = email
    except Exception:
        print(traceback.format_exc())
        return "Error retrieving form data. Please try again."
    
    if origin_function == NEW_VOTE:
        print(f"trying to run new vote with form_data {form_data}")
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
        
        # Check if this is an HTMX request
        if request.headers.get('HX-Request'):
            # Return empty content to remove the element from DOM
            return "", 200
        else:
            return {"message": f"Poll {poll_id} deleted successfully"}, 200
        
    except ValueError as e:
        return {"error": str(e)}, 403
    except Exception as e:
        print(traceback.format_exc())
        return {"error": "An error occurred while deleting the poll"}, 500

@app.route("/poll/<int:poll_id>/delete-confirm")
def poll_delete_confirm(poll_id):
    """Return confirmation dialog for poll deletion"""
    # Check if user is authenticated
    if EMAIL not in session:
        return "Authentication required", 401
    
    try:
        # Get poll info to show in confirmation
        poll = db.get_poll_details(poll_id)
        if not poll:
            return "Poll not found", 404
        
        # Check if user is authorized to delete this poll
        user_id = db.get_user_id(session[EMAIL])
        if not db.is_poll_admin(poll_id, user_id):
            return "Not authorized to delete this poll", 403
        
        return f"""
        <div class="bg-red-50 rounded-3xl p-4 border border-red-200">
          <div class="text-center">
            <h3 class="text-lg font-medium text-red-800 mb-2">Delete Poll?</h3>
            <p class="text-red-700 mb-1 font-medium">"{poll['title']}"</p>
            <p class="text-sm text-red-600 mb-4">This action cannot be undone.</p>
            <div class="flex gap-3 justify-center">
              <form hx-delete="/api/poll/{poll_id}" 
                    hx-target="#poll-{poll_id}"
                    hx-swap="outerHTML">
                <input type="hidden" name="email" value="{session[EMAIL]}">
                <button type="submit" class="btn-primary">
                  Yes, Delete
                </button>
              </form>
              <button hx-get="/poll/{poll_id}/cancel-delete"
                      hx-target="#poll-{poll_id}"
                      class="text-blue-600 border border-blue-600 hover:bg-blue-50 font-medium px-4 py-2 rounded-full transition duration-150 ease-in-out">
                Cancel
              </button>
            </div>
          </div>
        </div>
        """
        
    except Exception as e:
        print(traceback.format_exc())
        return f"Error: {type(e).__name__}", 500


@app.route("/poll/<int:poll_id>/cancel-delete")
def poll_cancel_delete(poll_id):
    """Cancel poll deletion and restore original view"""
    # Check if user is authenticated
    if EMAIL not in session:
        return "Authentication required", 401
    
    try:
        # Get poll info to restore the original view
        poll = db.get_poll_details(poll_id)
        if not poll:
            return "Poll not found", 404
        
        return f"""
        <div id="poll-{poll_id}" class="bg-gray-50 rounded-3xl p-4 border border-gray-300">
          <div class="flex justify-between items-start gap-6">
            <div class="flex-1">
              <h2 class="text-xl font-medium mb-3">{poll['title']}</h2>
              {'<p class="text-gray-600 mb-4">' + poll['description'] + '</p>' if poll.get('description') else ''}
              <p class="text-sm text-gray-500">Created: {poll['created_at'][:10] if poll.get('created_at') else 'Unknown'}</p>
            </div>
            <div class="flex gap-4 flex-shrink-0">
              <button hx-get="/poll/{poll_id}/delete-confirm" 
                      hx-target="#poll-{poll_id}"
                      class="text-red-600 hover:text-red-800 font-medium">
                Delete
              </button>
              <a href="/vote/{poll_id}" class="text-blue-600 hover:text-blue-800 font-medium">
                Vote
              </a>
              <a href="/results/{poll_id}" class="text-blue-600 hover:text-blue-800 font-medium">
                Results
              </a>
            </div>
          </div>
        </div>
        """
        
    except Exception as e:
        print(traceback.format_exc())
        return f"Error: {type(e).__name__}", 500

@app.route("/api/user", methods=["DELETE"])
def delete_user_api():
    """API endpoint to delete a user - requires session authentication"""
    try:
        # Check if user is authenticated via session
        if EMAIL not in session:
            return {"error": "Authentication required"}, 401
        
        # Get email from request (could be from JSON body or form data)
        requested_email = None
        if request.is_json:
            requested_email = request.json.get('email')
        else:
            requested_email = request.form.get('email')
        
        if not requested_email:
            return {"error": "Email is required"}, 400
        
        # Authorization check: Users can only delete themselves
        authenticated_email = session[EMAIL]
        if authenticated_email != requested_email:
            return {"error": "Unauthorized: You can only delete your own account"}, 403
        
        # Delete the user (this will check if user exists)
        db.delete_user(requested_email)
        
        # Clear the session since user is deleted
        session.clear()
        
        return {"message": f"User with email {requested_email} deleted successfully"}, 200
        
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

@app.route("/login")
def login_page():
    return render_template('login.html.j2')

@app.route("/login_submit", methods=["POST"])
def login_submit():
    email = request.form.get("email")
    
    if not email:
        return "Please enter an email address."
    
    try:
        # Check if user exists
        if not db.user_exists(email):
            return "No account found with this email address. Please create a poll first to register."
        
        user_id = db.get_user_id(email)
        
        # Send verification email
        verification_code = email_service.send_verification_email(email)
        session[VERIFICATION_CODE] = verification_code
        session["login_email"] = email  # Store email for after verification
        
        return render_template("verification_code_snippet.html.j2", user_id=user_id, origin_function=LOGIN)
        
    except Exception as err:
        print(traceback.format_exc())
        return f"Error: {type(err).__name__}"

@app.route("/dashboard")
def dashboard():
    # Check if user is authenticated
    if EMAIL not in session:
        return redirect("/login")
    
    try:
        user_id = db.get_user_id(session[EMAIL])
        polls = db.get_user_polls(user_id)
        return render_template('dashboard.html.j2', polls=polls)
    except Exception as err:
        print(traceback.format_exc())
        return f"Error loading dashboard: {type(err).__name__}"

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=3000, debug=True)
