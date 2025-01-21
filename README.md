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
* make voting page connected to supabase - url should have poll id
** make sure users table has verified status for email
* ask proper questions in make poll to fill out table fields