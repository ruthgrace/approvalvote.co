import itertools

def format_vote_confirmation(selected_options, poll_id):
    option_names = []
    for option in selected_options:
        option_name = option.split("|", maxsplit=1)[1]
        option_names.append(option_name)
    
    # JavaScript to replace the submit button with a checkmark
    button_replacement_script = """
    <script>
        // Find the submit button and replace it with a checkmark
        const submitButton = document.getElementById('submit-vote-btn');
        if (submitButton) {
            // First make sure it's visible (in case it was hidden during verification)
            submitButton.style.display = 'block';
            
            // Store original dimensions to preserve them
            const originalWidth = submitButton.offsetWidth;
            const originalHeight = submitButton.offsetHeight;
            
            submitButton.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="white" class="w-8 h-8 mx-auto">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
            `;
            
            // Preserve the original button size
            submitButton.style.width = originalWidth + 'px';
            submitButton.style.height = originalHeight + 'px';
            submitButton.style.minWidth = originalWidth + 'px';
            submitButton.style.minHeight = originalHeight + 'px';
            submitButton.disabled = true;
            submitButton.style.cursor = 'default';
        }
    </script>
    """
    
    results_link = f'<div class="mt-3"><a href="/results/{poll_id}" class="btn-primary-sm">See preliminary results</a></div>'
    
    if len(option_names) == 1:
        return f"""
        <div class="bg-green-50 border-2 border-green-300 rounded-lg p-4 mt-4">
            <h2 class="text-lg font-semibold text-green-800 mb-2">✓ Vote submitted!</h2>
            <p class="text-green-700">You voted for: <strong>{option_names[0]}</strong></p>
            {results_link}
        </div>
        {button_replacement_script}
        """
    return f"""
    <div class="bg-green-50 border-2 border-green-300 rounded-lg p-4 mt-4">
        <h2 class="text-lg font-semibold text-green-800 mb-2">✓ Vote submitted!</h2>
        <p class="text-green-700">You voted for: <strong>{", ".join(option_names[:-1])}, and {option_names[-1]}</strong></p>
        {results_link}
    </div>
    {button_replacement_script}
    """

def format_winners_text(winning_set, candidate_text, seats, is_tie=False):
    winners_array = list(winning_set)
    if is_tie:
        # Format the seat text properly
        seat_text = f"for {seats} seat" if seats == 1 else f"for {seats} seats"
        
        if len(winning_set) == 2:
            return f"<strong>{candidate_text[winners_array[0]]} and {candidate_text[winners_array[1]]}</strong> are tied {seat_text}."
        tie_winners_string = ", ".join([candidate_text[x] for x in winners_array[0:len(winners_array)-1]]) + ", and " + candidate_text[winners_array[-1]]
        return f"<strong>{tie_winners_string}</strong> are tied {seat_text}."
    else:
        if seats == 1:
            return f"The winner is <strong>{candidate_text[winners_array[0]]}</strong>."
        elif seats == 2:
            return f"The winners are <strong>{candidate_text[winners_array[0]]} and {candidate_text[winners_array[1]]}</strong>."
        winners_string = ", ".join([candidate_text[x] for x in winners_array[0:seats-1]]) + ", and " + candidate_text[winners_array[-1]]
        return f"The winners are <strong>{winners_string}</strong>."

def calculate_vote_overlap(winning_set, candidates):
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
        return list(sorted(zip([len(candidates[k]) for k in candidates.keys()], 
                             [(k,) for k in candidates.keys()]), reverse=True))
    
    winning_sets = []
    total_votes = []
    for combination in itertools.combinations(candidates.keys(), seats):
        winning_sets.append(combination)
    
    multiplier = 1
    for winning_set in winning_sets:
        vote_overlap = calculate_vote_overlap(winning_set, candidates)
        total = 0
        for c in range(len(winning_set)):
            if c != 0:
                multiplier += 1/(c+1)
            total += len(vote_overlap[c])*multiplier
        total_votes.append(total)
    
    return sorted(zip(total_votes, winning_sets), reverse=True)

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

def excess_vote_rounds(seats, candidate_counts, ballot_counts, candidate_text=None):
    """
    Calculate winners using excess vote method.
    
    Args:
        seats: Number of seats to fill
        ballot_counts: Dictionary where keys are frozensets of candidate IDs 
                      and values are the count of voters who cast that ballot
        candidate_text: Optional dictionary mapping candidate IDs to names for display
    """
    print("\n=== DEBUG: excess_vote_rounds called ===")
    print(f"seats: {seats}")
    print(f"ballot_counts type: {type(ballot_counts)}")
    print(f"Number of unique ballots: {len(ballot_counts)}")
    print(f"Total votes: {sum(ballot_counts.values())}")
    
    print("\n=== Ballot Combinations ===")
    for ballot, count in sorted(ballot_counts.items(), key=lambda x: x[1], reverse=True):
        if candidate_text:
            candidates_str = ", ".join([candidate_text.get(c, f"ID {c}") for c in sorted(ballot)])
        else:
            candidates_str = ", ".join([f"{c}" for c in sorted(ballot)])
        print(f"  [{candidates_str}]: {count} vote{'s' if count != 1 else ''}")
    
    # Get all unique candidates from all ballots
    all_candidates = set()
    for ballot in ballot_counts.keys():
        all_candidates.update(ballot)
    print(f"\nAll candidates in race: {sorted(all_candidates)}")
    print(f"Candidate counts: {candidate_counts}")
    print("=== END DEBUG ===\n")

    rounds = []
    i = 0
    while i < seats:
        print(f"\n=== ROUND {i+1} ===")
        rounds.append({})
        rounds[i]["ballot_counts"] = ballot_counts.copy()
        rounds[i]["votes_per_candidate"] = candidate_counts.copy()

        # Calculate vote counts from ballot_counts (handles fractional votes)
        vote_counts = {}
        for ballot, count in ballot_counts.items():
            for candidate in ballot:
                if candidate not in vote_counts:
                    vote_counts[candidate] = 0
                vote_counts[candidate] += count
        
        print(f"Vote counts this round:")
        for cand, votes in sorted(vote_counts.items(), key=lambda x: x[1], reverse=True):
            print(f"  Candidate {cand}: {votes:.2f} votes")
        print(f"Total ballots in play: {sum(ballot_counts.values()):.2f}")
        
        # Handle case where no votes have been cast
        if not vote_counts:
            print("No votes cast yet")
            break
        
        max_votes = max(vote_counts.values())
        # Get all candidates with max votes (handles ties)
        winners_with_max = [cand for cand, votes in vote_counts.items() if votes == max_votes]
        print(f"Winners with max votes: {winners_with_max}")
        for j in range(len(winners_with_max)):
            if j > 0:
                rounds.append({})
            rounds[i + j]["winner"] = winners_with_max[j]
            rounds[i + j]["is_tie"] = True
            rounds[i + j]["ballot_counts"] = ballot_counts.copy()
            rounds[i + j]["votes_per_candidate"] = candidate_counts.copy()
        print(f"i + len(winners_with_max): {i + len(winners_with_max)}, seats: {seats}")
        if i + len(winners_with_max) < seats:
            # Find the runner-up vote count (accounting for ties)
            # Remove winners from consideration
            remaining_vote_counts = {cand: votes for cand, votes in vote_counts.items() 
                                    if cand not in winners_with_max}
            threshold = max(remaining_vote_counts.values())
            
            # Calculate excess votes to redistribute
            excess = max_votes - threshold
            
            # redistribute excess votes
            # Find all ballots that include at least one winner
            ballots_with_winners = {}
            for ballot, count in ballot_counts.items():
                # Check if this ballot contains any of the winning candidates
                if any(winner in ballot for winner in winners_with_max):
                    ballots_with_winners[ballot] = count
            
            winner_votes = len(winners_with_max) * max_votes
            excess_fraction = {}
            
            # remove candidate sets that include any of the winners from ballot_counts
            new_ballot_counts = {}
            for ballot, count in ballot_counts.items():
                # Only keep ballots that don't contain any winning candidates
                if not any(winner in ballot for winner in winners_with_max):
                    new_ballot_counts[ballot] = count
            
            # Update ballot_counts for the next round
            ballot_counts = new_ballot_counts
            print(f"ballot_counts before adding excess votes: {ballot_counts}")
            print(f"\nBallots containing winner(s) {winners_with_max}:")
            total_votes_with_winners = sum(ballots_with_winners.values())
            for ballot, count in sorted(ballots_with_winners.items(), key=lambda x: x[1], reverse=True):
                ballot_str = ", ".join([str(c) for c in sorted(ballot)])
                print(f"  [{ballot_str}]: {count} votes")
                excess_fraction[ballot] = count / total_votes_with_winners
                
                # for this candidate set, remove the winners, and add excess * excess_fraction to the resulting candidate set, in ballot_counts
                # Remove all winners from this ballot to get the remaining candidates
                remaining_candidates = ballot - set(winners_with_max)
                
                if remaining_candidates:  # Only redistribute if there are remaining candidates
                    # Convert to frozenset so it can be used as a dictionary key
                    remaining_ballot = frozenset(remaining_candidates)
                    
                    # Add the proportional excess votes to this ballot combination
                    votes_to_add = excess * excess_fraction[ballot]
                    
                    if remaining_ballot in ballot_counts:
                        ballot_counts[remaining_ballot] += votes_to_add
                    else:
                        ballot_counts[remaining_ballot] = votes_to_add
                    
                    print(f"    Redistributing {votes_to_add:.2f} votes from [{ballot_str}] to [{', '.join(str(c) for c in sorted(remaining_candidates))}]")
            print(f"ballot_counts after adding excess votes: {ballot_counts}")
            print(f"  Total votes for winner(s): {total_votes_with_winners}")
            print(f"  Excess fraction: {excess_fraction}")
            
            # Show updated ballot counts after redistribution
            print(f"\nUpdated ballot counts after redistribution:")
            for ballot, count in sorted(ballot_counts.items(), key=lambda x: x[1], reverse=True):
                ballot_str = ", ".join([str(c) for c in sorted(ballot)])
                print(f"  [{ballot_str}]: {count:.2f} votes")
            print(f"Total ballots after redistribution: {sum(ballot_counts.values()):.2f}")
            
            # Remove winners from candidate_counts for next round
            for winner in winners_with_max:
                if winner in candidate_counts:
                    del candidate_counts[winner]
        print(f"i: {i}, len(winners_with_max): {len(winners_with_max)}")
        i = i + len(winners_with_max)
    
    print(f"\n=== FINAL RESULTS ===")
    print(f"Winners selected across {len(rounds)} rounds:")
    for idx, round_data in enumerate(rounds):
        if "winner" in round_data:
            print(f"  Round {idx+1}: Candidate {round_data['winner']}")
    
    return rounds