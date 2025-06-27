import pytest
from unittest.mock import Mock, patch
from database import PollDatabase

@pytest.fixture
def mock_supabase():
    return Mock()

@pytest.fixture
def db(mock_supabase):
    return PollDatabase(mock_supabase)

def test_get_user_id_exists(db, mock_supabase):
    mock_supabase.table().select().eq().execute.return_value.data = [{'id': 123}]
    assert db.get_user_id('test@example.com') == 123

def test_get_user_id_not_exists(db, mock_supabase):
    mock_supabase.table().select().eq().execute.return_value.data = []
    assert db.get_user_id('test@example.com') is None

def test_user_exists(db, mock_supabase):
    mock_supabase.table().select().eq().execute.return_value.data = [{'id': 123}]
    assert db.user_exists('test@example.com') is True

def test_create_anonymous_user(db, mock_supabase):
    mock_supabase.table().insert().execute.return_value.data = [{'id': 123}]
    assert db.create_anonymous_user() == 123

def test_save_form_data(db, mock_supabase):
    form_data = {'email': 'test@example.com', 'title': 'Test Poll'}
    db.save_form_data(form_data)
    mock_supabase.table().delete().eq().execute.assert_called_once()
    mock_supabase.table().insert().execute.assert_called_once()

def test_get_poll_details(db, mock_supabase):
    mock_data = {'seats': 2, 'title': 'Test', 'description': 'Desc'}
    mock_supabase.table().select().eq().execute.return_value.data = [mock_data]
    result = db.get_poll_details(1)
    assert result == mock_data

def test_save_votes(mock_supabase):
    db = PollDatabase(mock_supabase)
    db.save_votes(1, 123, ["1|Option 1", "2|Option 2"])
    
    mock_supabase.table().delete().eq().eq().execute.assert_called_once()
    # Called twice - once for each option
    assert mock_supabase.table().insert().execute.call_count == 2

def test_get_votes_by_candidate(db, mock_supabase):
    mock_supabase.table().select().eq().execute.return_value.data = [
        {'id': 1}, {'id': 2}
    ]
    mock_supabase.table().select().eq().eq().execute.return_value.data = [
        {'user': 101, 'option': 1},
        {'user': 102, 'option': 1}
    ]
    result = db.get_votes_by_candidate(1)
    assert len(result[1]) == 2  # Two votes for candidate 1 

def test_is_poll_admin():
    """Test checking if user is admin of a poll"""
    mock_supabase = Mock()
    mock_supabase.table().select().eq().eq().execute.return_value.data = [{'id': 1}]
    
    db = PollDatabase(mock_supabase)
    result = db.is_poll_admin(poll_id=1, user_id=123)
    
    assert result is True

def test_is_poll_admin_false():
    """Test checking if user is NOT admin of a poll"""
    mock_supabase = Mock()
    mock_supabase.table().select().eq().eq().execute.return_value.data = []
    
    db = PollDatabase(mock_supabase)
    result = db.is_poll_admin(poll_id=1, user_id=123)
    
    assert result is False

def test_poll_exists():
    """Test checking if poll exists"""
    mock_supabase = Mock()
    mock_supabase.table().select().eq().execute.return_value.data = [{'id': 1}]
    
    db = PollDatabase(mock_supabase)
    result = db.poll_exists(poll_id=1)
    
    assert result is True

def test_poll_exists_false():
    """Test checking if poll does NOT exist"""
    mock_supabase = Mock()
    mock_supabase.table().select().eq().execute.return_value.data = []
    
    db = PollDatabase(mock_supabase)
    result = db.poll_exists(poll_id=1)
    
    assert result is False

def test_delete_poll_authorized():
    """Test deleting a poll when user is authorized"""
    mock_supabase = Mock()
    # Mock that user is admin
    mock_supabase.table().select().eq().eq().execute.return_value.data = [{'id': 1}]
    
    db = PollDatabase(mock_supabase)
    result = db.delete_poll(poll_id=1, user_id=123)
    
    assert result is True
    # Should call delete 4 times (votes, options, admins, poll)
    assert mock_supabase.table().delete().eq().execute.call_count == 4

def test_delete_poll_unauthorized():
    """Test deleting a poll when user is NOT authorized"""
    mock_supabase = Mock()
    # Mock that user is NOT admin
    mock_supabase.table().select().eq().eq().execute.return_value.data = []
    
    db = PollDatabase(mock_supabase)
    
    with pytest.raises(ValueError, match="User is not authorized to delete this poll"):
        db.delete_poll(poll_id=1, user_id=123)

def test_delete_user_success():
    """Test deleting a user when user exists"""
    mock_supabase = Mock()
    # Mock that user exists
    mock_supabase.table().select().eq().execute.return_value.data = [{'id': 123}]
    
    db = PollDatabase(mock_supabase)
    result = db.delete_user('test@example.com')
    
    assert result is True
    # Should call delete 4 times (votes, poll admins, form data, user)
    assert mock_supabase.table().delete().eq().execute.call_count == 4

def test_delete_user_not_found():
    """Test deleting a user when user does NOT exist"""
    mock_supabase = Mock()
    # Mock that user does NOT exist
    mock_supabase.table().select().eq().execute.return_value.data = []
    
    db = PollDatabase(mock_supabase)
    
    with pytest.raises(ValueError, match="User not found"):
        db.delete_user('nonexistent@example.com')

def test_delete_user_nonexistent():
    """Test deleting a user that doesn't exist"""
    mock_supabase = Mock()
    # Mock that user doesn't exist
    mock_supabase.table().select().eq().execute.return_value.data = []
    
    db = PollDatabase(mock_supabase)
    
    with pytest.raises(ValueError, match="User not found"):
        db.delete_user('nonexistent@example.com')

def test_get_user_polls_with_polls():
    """Test getting polls for a user who has polls"""
    mock_supabase = Mock()
    # Mock PollAdmins response
    mock_supabase.table().select().eq().execute.return_value.data = [
        {"poll": 1}, {"poll": 2}
    ]
    # Mock Polls response
    mock_supabase.table().select().in_().execute.return_value.data = [
        {"id": 1, "title": "Poll 1", "description": "Test poll 1", "created_at": "2024-01-01"},
        {"id": 2, "title": "Poll 2", "description": "Test poll 2", "created_at": "2024-01-02"}
    ]
    
    db = PollDatabase(mock_supabase)
    result = db.get_user_polls(user_id=123)
    
    assert len(result) == 2
    assert result[0]["title"] == "Poll 1"
    assert result[1]["title"] == "Poll 2"

def test_get_user_polls_no_polls():
    """Test getting polls for a user who has no polls"""
    mock_supabase = Mock()
    # Mock empty PollAdmins response
    mock_supabase.table().select().eq().execute.return_value.data = []
    
    db = PollDatabase(mock_supabase)
    result = db.get_user_polls(user_id=123)
    
    assert result == []

def test_get_votes_for_csv():
    """Test getting votes formatted for CSV export"""
    mock_supabase = Mock()
    
    # Mock votes data - simulate multiple votes from same user and different users
    mock_votes_data = [
        {'user': 1, 'option': 101, 'created_at': '2025-01-01T10:00:00+00:00'},
        {'user': 1, 'option': 102, 'created_at': '2025-01-01T10:00:01+00:00'},  # Same user, later timestamp
        {'user': 2, 'option': 101, 'created_at': '2025-01-01T11:00:00+00:00'},
        {'user': 3, 'option': 102, 'created_at': '2025-01-01T12:00:00+00:00'},
        {'user': 3, 'option': 103, 'created_at': '2025-01-01T12:00:01+00:00'},
    ]
    
    # Mock poll options data
    mock_options_data = [
        {'id': 101, 'option': 'Option A'},
        {'id': 102, 'option': 'Option B'},
        {'id': 103, 'option': 'Option C'},
    ]
    
    # Set up mock responses
    mock_supabase.table().select().eq().execute.side_effect = [
        Mock(data=mock_votes_data),    # First call for votes
        Mock(data=mock_options_data),  # Second call for options
    ]
    
    db = PollDatabase(mock_supabase)
    user_votes, option_map = db.get_votes_for_csv(poll_id=1)
    
    # Verify option mapping
    expected_option_map = {101: 'Option A', 102: 'Option B', 103: 'Option C'}
    assert option_map == expected_option_map
    
    # Verify user votes are grouped correctly
    assert len(user_votes) == 3  # 3 unique users
    
    # User 1 should have both options 101 and 102, with earliest timestamp
    assert 1 in user_votes
    assert user_votes[1]['user_id'] == 1
    assert user_votes[1]['timestamp'] == '2025-01-01T10:00:00+00:00'  # Earlier timestamp
    assert user_votes[1]['votes'] == {101, 102}
    
    # User 2 should have only option 101
    assert 2 in user_votes
    assert user_votes[2]['user_id'] == 2
    assert user_votes[2]['votes'] == {101}
    
    # User 3 should have options 102 and 103
    assert 3 in user_votes
    assert user_votes[3]['user_id'] == 3
    assert user_votes[3]['votes'] == {102, 103}

def test_get_votes_for_csv_empty():
    """Test CSV function with no votes"""
    mock_supabase = Mock()
    
    # Mock empty responses
    mock_supabase.table().select().eq().execute.side_effect = [
        Mock(data=[]),  # No votes
        Mock(data=[{'id': 101, 'option': 'Option A'}]),  # Has options
    ]
    
    db = PollDatabase(mock_supabase)
    user_votes, option_map = db.get_votes_for_csv(poll_id=1)
    
    assert user_votes == {}
    assert option_map == {101: 'Option A'} 