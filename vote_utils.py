def format_vote_confirmation(selected_options):
    option_names = []
    for option in selected_options:
        option_name = option.split("|", maxsplit=1)[1]
        option_names.append(option_name)
    
    if len(option_names) == 1:
        return f"""
        <h2>Vote submitted!</h2>
        <p>You voted for: {option_names[0]}</p>
        """
    return f"""
    <h2>Vote submitted!</h2>
    <p>You voted for: {", ".join(option_names[:-1])}, and {option_names[-1]}</p>
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