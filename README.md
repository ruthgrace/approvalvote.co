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
flask --app website run --host=0.0.0.0
```

## to do
* do poll administrator logic - admin must have verified email status
* you must also verify your email to be able to edit your vote
* user sessions so people dont' have to verify each time. bonus link to google account
* voting results page
* feature for whether or not a poll requires email verification from voters
* feature for opening and closing polls