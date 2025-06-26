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
        const submitButton = document.querySelector('button[type="submit"]');
        if (submitButton) {
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
    
    results_link = f'<div><a href="/results/{poll_id}" class="btn-primary">See preliminary results</a></div>'
    
    if len(option_names) == 1:
        return f"""
        <div class="space-y-6">
            <h2>Vote submitted!</h2>
            <p>You voted for: {option_names[0]}</p>
            {results_link}
        </div>
        {button_replacement_script}
        """
    return f"""
    <div class="space-y-6">
        <h2>Vote submitted!</h2>
        <p>You voted for: {", ".join(option_names[:-1])}, and {option_names[-1]}</p>
        {results_link}
    </div>
    {button_replacement_script}
    """

def format_winners_text(winning_set, candidate_text, seats, is_tie=False):
    winners_array = list(winning_set)
    if is_tie:
        if len(winning_set) == 2:
            return f"<strong>{candidate_text[winners_array[0]]} and {candidate_text[winners_array[1]]}</strong> are tied."
        tie_winners_string = ", ".join([candidate_text[x] for x in winners_array[0:len(winners_array)-1]]) + ", and " + candidate_text[winners_array[-1]]
        return f"<strong>{tie_winners_string}</strong> are tied."
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