from flask import Flask, render_template

app = Flask(__name__)

@app.route("/")
def homepage():
    return render_template('home.html.j2')

@app.route("/makepoll")
def makepollpage():
    return render_template('makepoll.html.j2')

@app.route("/vote")
def pollpage():
    return render_template('poll.html.j2')

@app.route("/results")
def pollresultspage():
    return render_template('pollresults.html.j2')