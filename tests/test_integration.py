import pytest
import os
import sys

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, project_root)

from website import app

@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client

def test_home_page(client):
    """Test if home page loads"""
    rv = client.get('/')
    assert rv.status_code == 200
    assert b'Optimize group decisions' in rv.data
    assert b'You can\'t please everyone' in rv.data

def test_all_routes(client):
    """Test all defined routes"""
    routes = [
        '/',
        '/results/17', # poll 17 has 1 winner
        '/vote/17',
        '/results/6', # poll 6 has 2 winners
        '/vote/6',
        '/makepoll',
        # Add all your routes here
    ]
    for route in routes:
        rv = client.get(route)
        assert rv.status_code != 404, f"Route {route} not found"
        assert rv.status_code == 200, f"Route {route} returned {rv.status_code}"

def test_delete_user_api_requires_authentication(client):
    """Test user deletion API requires authentication (session)"""
    # Test with missing email - should return 401 (not 400) because no session
    rv = client.delete('/api/user', json={})
    assert rv.status_code == 401
    assert b'Authentication required' in rv.data
    
    # Test with email but no session - should return 401 (not 404) because no session
    rv = client.delete('/api/user', json={'email': 'nonexistent@example.com'})
    assert rv.status_code == 401
    assert b'Authentication required' in rv.data
    
    # Test with form data but no session - should return 401 (not 404) because no session
    rv = client.delete('/api/user', data={'email': 'nonexistent@example.com'})
    assert rv.status_code == 401
    assert b'Authentication required' in rv.data

def test_delete_user_api_with_mock_session(client):
    """Test user deletion API behavior with mocked session"""
    # This test demonstrates the expected behavior when properly authenticated
    # In a real scenario, you would need to establish a proper session
    
    with client.session_transaction() as sess:
        # Mock a session with an authenticated user
        sess['email'] = 'test@example.com'
        sess['verification_code'] = '123456'  # Simulate verified user
    
    # Now test the authenticated scenarios
    
    # Test missing email parameter (should be 400 when authenticated)
    rv = client.delete('/api/user', json={})
    assert rv.status_code == 400
    assert b'Email is required' in rv.data
    
    # Test trying to delete a different user (should be 403 - Forbidden)
    rv = client.delete('/api/user', json={'email': 'different@example.com'})
    assert rv.status_code == 403
    assert b'Unauthorized' in rv.data
    
    # Test user trying to delete themselves but user doesn't exist in DB (would be 404)
    # Note: This might return 403 or 404 depending on implementation details
    rv = client.delete('/api/user', json={'email': 'test@example.com'})
    # In our current implementation, this returns 403 because we check authorization first
    assert rv.status_code in [403, 404]  # Either is acceptable depending on implementation
