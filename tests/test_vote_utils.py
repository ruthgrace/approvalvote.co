import pytest
from vote_utils import (
    format_vote_confirmation, 
    format_winners_text, 
    calculate_vote_overlap,
    sorted_candidate_sets,
    votes_by_candidate,
    votes_by_number_of_candidates
)

def test_format_vote_confirmation_single_vote():
    selected = ["1|Option A"]
    result = format_vote_confirmation(selected)
    assert "You voted for: Option A" in result

def test_format_vote_confirmation_multiple_votes():
    selected = ["1|Option A", "2|Option B", "3|Option C"]
    result = format_vote_confirmation(selected)
    assert "You voted for: Option A, Option B, and Option C" in result

def test_format_winners_text_single_winner():
    winning_set = {1}
    candidate_text = {1: "Option A", 2: "Option B"}
    result = format_winners_text(winning_set, candidate_text, seats=1)
    assert result == 'The winner is <strong>Option A</strong>.'

def test_format_winners_text_two_winners():
    winning_set = {1, 2}
    candidate_text = {1: "Option A", 2: "Option B"}
    result = format_winners_text(winning_set, candidate_text, seats=2)
    assert result == 'The winners are <strong>Option A and Option B</strong>.'

def test_format_winners_text_tie():
    winning_set = {1, 2}
    candidate_text = {1: "Option A", 2: "Option B"}
    result = format_winners_text(winning_set, candidate_text, seats=1, is_tie=True)
    assert result == '<strong>Option A and Option B</strong> are tied.'

def test_calculate_vote_overlap():
    candidates = {
        1: {101, 102},  # Users 101 and 102 voted for candidate 1
        2: {102, 103},  # Users 102 and 103 voted for candidate 2
    }
    winning_set = [1, 2]
    result = calculate_vote_overlap(winning_set, candidates)
    assert len(result) == 2
    assert len(result[0]) == 1  # One user voted for only candidate 1
    assert len(result[1]) == 1  # One user voted for both candidates

def test_sorted_candidate_sets_single_seat():
    candidates = {
        1: {101, 102},  # 2 votes
        2: {103},       # 1 vote
    }
    result = sorted_candidate_sets(1, candidates)
    assert result[0][0] == 2  # First candidate has 2 votes
    assert result[0][1] == (1,)  # Candidate ID 1 won

def test_votes_by_number_of_candidates():
    candidates = {
        1: {101, 102},  # Users 101 and 102 voted for candidate 1
        2: {102, 103},  # Users 102 and 103 voted for candidate 2
    }
    winning_set = [1, 2]
    result = votes_by_number_of_candidates(winning_set, candidates)
    assert len(result) == 2
    assert len(result[0]) == 2  # Two users voted for exactly one candidate
    assert len(result[1]) == 1  # One user voted for both candidates 