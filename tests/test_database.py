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