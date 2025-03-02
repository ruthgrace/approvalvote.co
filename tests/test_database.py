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

def test_save_votes(db, mock_supabase):
    db.save_votes(1, 123, ['1|Option A', '2|Option B'])
    # Should delete existing votes
    mock_supabase.table().delete().eq().eq().execute.assert_called_once()
    # Should insert two new votes
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