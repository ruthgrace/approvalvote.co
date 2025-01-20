from flask import Flask, render_template, request

app = Flask(__name__)

@app.route("/")
def home_page():
    return render_template('home.html.j2')

@app.route("/makepoll")
def make_poll_page():
    return render_template('makepoll.html.j2')

@app.route("/vote")
def poll_page():
    return render_template('poll.html.j2')

@app.route("/results")
def poll_results_page():
    return render_template('pollresults.html.j2')

@app.route("/pollsubmit", methods=["POST"])
def newpoll():
    candidates_text = request.form.get("candidates", "")
    seats = request.form.get("seats", "0")
    seats = int(seats)
    candidates = candidates_text.splitlines()

    return f"""
    <h2>Poll Created!</h2>
    <p>You entered {len(candidates)} candidate(s): {candidates}</p>
    <p>Number of seats: {seats}</p>
    """