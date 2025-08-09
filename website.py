from flask import Flask, render_template, request, session, make_response, redirect, Response
from supabase import create_client, Client
import itertools
import traceback
import csv
import io
import json
import math
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
        <p class="text-red-600 font-medium">Your vote was not counted. Please select at least one option.</p>
        """)
        response.headers["HX-Retarget"] = "#error-message-div"
        response.headers["HX-Swap"] = "innerHTML"
        return response

    try:
        # Check if email verification is required
        email_verification = db.get_poll_email_verification(poll_data[ID])
        if email_verification and not poll_data[EMAIL]:
            response = make_response(f"""
            <p class="text-red-600 font-medium">Please enter an email address.</p>
            """)
            response.headers["HX-Retarget"] = "#error-message-div"
            response.headers["HX-Swap"] = "innerHTML"
            return response

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
                response.headers["HX-Swap"] = "innerHTML"
                return response

            if email_verification and (EMAIL not in session or session[EMAIL] != poll_data[EMAIL]):
                db.save_form_data(poll_data)
                code = email_service.send_verification_email(poll_data[EMAIL])
                session[VERIFICATION_CODE] = code
                response = make_response(render_template(
                    "verification_code_snippet.html.j2",
                    user_id=db.get_user_id(poll_data[EMAIL]),
                    origin_function=NEW_VOTE
                ))
                response.headers["HX-Retarget"] = "#error-message-div"
                response.headers["HX-Swap"] = "innerHTML"
                return response

        # Process the vote
        user_id = db.get_user_id(poll_data[EMAIL]) if poll_data[EMAIL] else db.create_anonymous_user()
        db.save_votes(poll_data[ID], user_id, poll_data[SELECTED])
        
        response = make_response(format_vote_confirmation(poll_data[SELECTED], poll_data[ID]))
        response.headers["HX-Retarget"] = "#error-message-div"
        response.headers["HX-Swap"] = "innerHTML"
        return response

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
        
        # Check if there are any votes
        total_votes = sum(len(votes) for votes in candidates.values())
        if total_votes == 0:
            # No votes yet - show placeholder
            return render_template("poll_results.html.j2",
                poll_id=poll_id,
                poll_name=title,
                poll_description=description,
                no_votes=True,
                vote_labels=[],
                vote_tally={},
                seats=seats,
                excess_rounds=json.dumps([]),
                winners=""
            )
        
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
        
        # Check if there's an actual tie and format appropriately
        # Group winners by round to detect partial ties
        clear_winners = []
        tied_candidates = []
        
        # Process the excess_rounds to identify clear winners vs ties
        processed_rounds = set()
        for i, round_data in enumerate(excess_rounds_raw[:len(winning_set)]):
            if i in processed_rounds:
                continue
                
            # Check if this round is part of a tie
            if round_data.get('is_tie', False):
                # Find all rounds with the same ballot_counts (the tied group)
                tie_group = [round_data['winner']]
                processed_rounds.add(i)
                
                for j in range(i + 1, len(excess_rounds_raw)):
                    if j < len(winning_set) and excess_rounds_raw[j].get('is_tie', False):
                        if ('ballot_counts' in round_data and 
                            'ballot_counts' in excess_rounds_raw[j] and
                            round_data['ballot_counts'] == excess_rounds_raw[j]['ballot_counts']):
                            tie_group.append(excess_rounds_raw[j]['winner'])
                            processed_rounds.add(j)
                
                # If this tie group exceeds available seats, it's a tie situation
                if len(clear_winners) + len(tie_group) > seats:
                    tied_candidates = tie_group
                    break
                else:
                    # All tied candidates fit within seats
                    clear_winners.extend(tie_group)
            else:
                # Clear winner
                clear_winners.append(round_data['winner'])
                processed_rounds.add(i)
                
                if len(clear_winners) >= seats:
                    break
        
        # Format the winners text based on what we found
        if tied_candidates:
            # There's a tie for one of the positions
            if clear_winners:
                # Partial tie (some clear winners, then a tie)
                clear_winner_names = [f"<strong>{candidate_text[w]}</strong>" for w in clear_winners]
                tied_names = [f"<strong>{candidate_text[t]}</strong>" for t in tied_candidates]
                
                remaining_seats = seats - len(clear_winners)
                seat_text = f"{remaining_seats} seat" if remaining_seats == 1 else f"{remaining_seats} seats"
                
                if len(clear_winners) == 1:
                    winner_part = f"The winner of the first seat is {clear_winner_names[0]}. "
                else:
                    winner_part = f"The winners are {', '.join(clear_winner_names[:-1])} and {clear_winner_names[-1]}. "
                
                if len(tied_candidates) == 2:
                    tie_part = f"{tied_names[0]} and {tied_names[1]} are tied for the remaining {seat_text}."
                else:
                    tie_part = f"{', '.join(tied_names[:-1])}, and {tied_names[-1]} are tied for the remaining {seat_text}."
                
                winners = winner_part + tie_part
            else:
                # Full tie (all candidates tied for all seats)
                winners = "There is a tie. " + format_winners_text(set(tied_candidates), candidate_text, seats, is_tie=True)
        else:
            # No ties
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
            # Find which round this winner was selected in
            round_idx = winners_in_order.index(selected_candidate_id)
            
            # Check if this winner is part of a tie
            is_tied = False
            tied_with = []
            
            # Check if this round and adjacent rounds have the same ballot_counts (indicating a tie)
            if round_idx < len(excess_rounds) and excess_rounds[round_idx].get('is_tie', False):
                # Find all other winners in the same tie
                for other_idx, other_round in enumerate(excess_rounds):
                    if (other_idx != round_idx and 
                        other_round.get('is_tie', False) and
                        'ballot_counts' in excess_rounds[round_idx] and 
                        'ballot_counts' in other_round and
                        excess_rounds[round_idx]['ballot_counts'] == other_round['ballot_counts']):
                        if other_idx < len(winners_in_order):
                            tied_with.append(winners_in_order[other_idx])
                
                if tied_with:
                    is_tied = True
            
            # Get the actual vote count for the winner
            winner_vote_count = winner_votes_by_round.get(selected_candidate_id, initial_selected_votes)
            
            if is_tied:
                # For ties, all tied candidates effectively share 1st place
                # Count how many winners came before this tie group
                position = 1
                for idx in range(round_idx):
                    # Skip if this round is part of the same tie
                    if idx < len(excess_rounds) and not (
                        excess_rounds[idx].get('is_tie', False) and 
                        'ballot_counts' in excess_rounds[idx] and 
                        'ballot_counts' in excess_rounds[round_idx] and
                        excess_rounds[idx]['ballot_counts'] == excess_rounds[round_idx]['ballot_counts']):
                        position += 1
                
                position_text = "1st" if position == 1 else "2nd" if position == 2 else "3rd" if position == 3 else f"{position}th"
                
                # Special case: if there are more tied winners than seats available
                if len(tied_with) + 1 > seats and position == 1:
                    return f"""
                    <div class='p-4 bg-yellow-50 border border-yellow-300 rounded-lg'>
                        <h3 class='font-bold text-yellow-800 mb-2'>Your candidate tied!</h3>
                        <p class='text-yellow-700'>{option_name} tied for {position_text} place with {winner_vote_count} votes.</p>
                        <p class='text-yellow-600 text-sm mt-2'>Note: With {len(tied_with) + 1} candidates tied and only {seats} seat{'s' if seats != 1 else ''} available, a tiebreaker would be needed.</p>
                    </div>
                    """
                else:
                    return f"""
                    <div class='p-4 bg-green-50 border border-green-300 rounded-lg'>
                        <h3 class='font-bold text-green-800 mb-2'>Your candidate won!</h3>
                        <p class='text-green-700'>{option_name} tied for {position_text} place with {winner_vote_count} votes.</p>
                    </div>
                    """
            else:
                # Not tied - regular win
                position = round_idx + 1
                position_text = "1st" if position == 1 else "2nd" if position == 2 else "3rd" if position == 3 else f"{position}th"
                
                return f"""
                <div class='p-4 bg-green-50 border border-green-300 rounded-lg'>
                    <h3 class='font-bold text-green-800 mb-2'>Your candidate won!</h3>
                    <p class='text-green-700'>{option_name} finished in {position_text} place with {winner_vote_count} votes.</p>
                </div>
                """
        
        # Calculate how many votes short for each position
        vote_differences = []
        
        # Group tied winners together
        position_groups = []
        i = 0
        
        # When there are ties, we need to consider ALL tied winners even if seats < number of tied winners
        # This is important for showing "1st place (tie between X and Y)" even when only 1 seat is available
        while i < min(len(winners_in_order), len(excess_rounds)):
            winner_id = winners_in_order[i]
            tied_winners = [winner_id]
            
            # Check if next winners are part of the same tie
            j = i + 1
            while j < len(winners_in_order) and j < len(excess_rounds):
                # Check if both rounds are marked as ties and have the same ballot_counts
                if (excess_rounds[i].get('is_tie', False) and 
                    excess_rounds[j].get('is_tie', False) and
                    'ballot_counts' in excess_rounds[i] and 
                    'ballot_counts' in excess_rounds[j] and
                    excess_rounds[i]['ballot_counts'] == excess_rounds[j]['ballot_counts']):
                    tied_winners.append(winners_in_order[j])
                    j += 1
                else:
                    break
            
            position_groups.append(tied_winners)
            i = j
        
        # Process each position group (but only up to the number of seats)
        for group_idx, winner_group in enumerate(position_groups[:seats]):
            position = group_idx + 1
            position_text = "1st" if position == 1 else "2nd" if position == 2 else "3rd" if position == 3 else f"{position}th"
            
            # For first position group (round 1), use initial votes
            if group_idx == 0:
                # Get vote count (all tied winners have same vote count)
                winner_vote_count = winner_votes_by_round[winner_group[0]]
                selected_vote_count = initial_selected_votes
                votes_needed = winner_vote_count - selected_vote_count + 1  # +1 to beat, not tie
                
                # Build winner display text
                if len(winner_group) == 1:
                    winner_display = candidate_text[winner_group[0]]
                    exclusion_text = f" who did not also vote for {candidate_text[winner_group[0]]}"
                else:
                    # It's a tie
                    winner_names = [candidate_text[wid] for wid in winner_group]
                    if len(winner_names) == 2:
                        winner_display = f"tie between {winner_names[0]} and {winner_names[1]}"
                        exclusion_text = f" who did not also vote for {winner_names[0]} or {winner_names[1]}"
                    else:
                        winner_display = f"tie between {', '.join(winner_names[:-1])}, and {winner_names[-1]}"
                        exclusion_text = f" who did not also vote for {' or '.join(winner_names)}"
                
                if votes_needed > 0:
                    vote_differences.append(f"<li>{position_text} place ({winner_display}): <strong>{votes_needed} more vote{'s' if votes_needed != 1 else ''}</strong> needed{exclusion_text}</li>")
                else:
                    vote_differences.append(f"<li>{position_text} place ({winner_display}): Had enough votes but lost in the tie-breaking</li>")
            else:
                # For subsequent rounds, calculate votes from ballot_counts after redistribution
                # Get the first winner's round index (all tied winners have same round data)
                round_idx = winners_in_order.index(winner_group[0])
                round_data = excess_rounds[round_idx]
                
                # Calculate winner's actual votes from ballot_counts (all tied winners have same votes)
                winner_vote_count = 0
                if 'ballot_counts' in round_data:
                    for ballot, count in round_data['ballot_counts'].items():
                        if winner_group[0] in ballot:
                            winner_vote_count += count
                
                # Calculate selected candidate's votes from ballot_counts
                selected_vote_count = 0
                if 'ballot_counts' in round_data:
                    for ballot, count in round_data['ballot_counts'].items():
                        if selected_candidate_id in ballot:
                            selected_vote_count += count
                
                # Calculate the difference and round up to get whole votes needed
                vote_difference = winner_vote_count - selected_vote_count
                # Round up to next whole number since we need actual voters
                votes_needed = math.ceil(vote_difference + 0.01)  # +0.01 to beat, not just tie
                
                # Build winner display text
                if len(winner_group) == 1:
                    winner_display = candidate_text[winner_group[0]]
                else:
                    # It's a tie
                    winner_names = [candidate_text[wid] for wid in winner_group]
                    if len(winner_names) == 2:
                        winner_display = f"tie between {winner_names[0]} and {winner_names[1]}"
                    else:
                        winner_display = f"tie between {', '.join(winner_names[:-1])}, and {winner_names[-1]}"
                
                # Build the exclusion list text - include ALL winners up to this position
                all_winners_so_far = []
                for prev_group in position_groups[:group_idx + 1]:
                    all_winners_so_far.extend([candidate_text[wid] for wid in prev_group])
                
                if len(all_winners_so_far) == 1:
                    exclusion_text = f" who did not also vote for {all_winners_so_far[0]}"
                else:
                    exclusion_text = f" who did not also vote for {' or '.join(all_winners_so_far)}"
                
                if votes_needed > 0:
                    vote_differences.append(f"<li>{position_text} place ({winner_display}): <strong>{votes_needed} more vote{'s' if votes_needed != 1 else ''}</strong> needed{exclusion_text}</li>")
                else:
                    vote_differences.append(f"<li>{position_text} place ({winner_display}): Had enough votes but lost in the redistribution</li>")
        
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
        return """
        <p class="text-red-600 font-medium">Incorrect code. Please try again.</p>
        <script>
            // Show the submit button again if it was hidden
            const submitBtn = document.getElementById('submit-vote-btn');
            if (submitBtn) submitBtn.style.display = 'block';
        </script>
        """
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
                return """
                <p class="text-red-600 font-medium">Login session expired. Please try again.</p>
                <script>
                    const submitBtn = document.getElementById('submit-vote-btn');
                    if (submitBtn) submitBtn.style.display = 'block';
                </script>
                """
        except Exception:
            print(traceback.format_exc())
            return """
            <p class="text-red-600 font-medium">Login failed. Please try again.</p>
            <script>
                const submitBtn = document.getElementById('submit-vote-btn');
                if (submitBtn) submitBtn.style.display = 'block';
            </script>
            """
    
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
