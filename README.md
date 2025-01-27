# approval voting website

# dev
## set up on new server
i have an almalinux server. the default python is 3.9 but i also have 3.12 so i can use fstrings

`pip3.12 install virtualenv` if necessary

```
python3.12 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## run in development

```
flask --app website run --host=0.0.0.0 --debug
```

## to do
* voting results page fix axis labels, put charts side by side on web (but not mobile)
* production server
* feature for whether or not a poll requires email verification from voters
* voting results page - take into account ties
* incorporate design
* revisit domain reputation issue for sending verification code email
* feature for opening and closing polls
** consider caching results in results db once poll closes
* make sure there aren't duplicate options