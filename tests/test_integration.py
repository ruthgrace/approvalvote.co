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
    assert b'Optimize group decisions.' in rv.data
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
