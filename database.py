from supabase import Client
from constants import EMAIL

class PollDatabase:
    def __init__(self, supabase_client: Client):
        self.client = supabase_client

    def get_user_id(self, email):
        response = self.client.table("Users").select("id").eq("email", email).execute()
        if len(response.data) == 0:
            return None
        return response.data[0]['id']

    def user_exists(self, email):
        return self.get_user_id(email) is not None

    def create_anonymous_user(self):
        response = self.client.table("Users").insert({}).execute()
        return response.data[0]['id']

    def save_form_data(self, form_data):
        email = form_data[EMAIL]
        self.client.table("FormData").delete().eq("email", email).execute()
        return self.client.table("FormData").insert({"email": email, "form_data": form_data}).execute()

    def get_form_data(self, email):
        response = self.client.table("FormData").select("form_data").eq("email", email).execute()
        return response.data[0]["form_data"] if response.data else None

    def get_poll_details(self, poll_id):
        response = self.client.table("Polls").select("seats, title, description, cover_photo, email_verification").eq("id", poll_id).execute()
        return response.data[0] if response.data else None

    def get_poll_candidates(self, poll_id):
        response = self.client.table("PollOptions").select("id, option").eq("poll", poll_id).execute()
        return [(row['id'], row['option']) for row in response.data]

    def get_poll_email_verification(self, poll_id):
        response = self.client.table("Polls").select("email_verification").eq("id", poll_id).single().execute()
        return response.data['email_verification']

    def save_votes(self, poll_id, user_id, selected_options):
        # Delete existing votes
        self.client.table("Votes").delete().eq("poll", poll_id).eq("user", user_id).execute()
        # Save new votes
        for option in selected_options:
            option_id = option.split("|", maxsplit=1)[0]
            self.client.table("Votes").insert({
                "poll": poll_id,
                "option": option_id,
                "user": user_id
            }).execute()

    def get_votes_by_candidate(self, poll_id, candidate_ids=None):
        if candidate_ids is None:
            response = self.client.table("PollOptions").select("id").eq("poll", poll_id).execute()
            candidate_ids = [int(item["id"]) for item in response.data]
        
        candidates = {cid: set() for cid in candidate_ids}
        for candidate_id in candidate_ids:
            response = self.client.table("Votes").select("user", "option").eq("poll", poll_id).eq("option", candidate_id).execute()
            for vote in response.data:
                candidates[vote["option"]].add(vote["user"])
        return candidates

    def get_candidate_text(self, poll_id):
        response = self.client.table("PollOptions").select("id", "option").eq("poll", poll_id).execute()
        candidate_text = {item["id"]: item["option"] for item in response.data}
        return dict(sorted(candidate_text.items()))

    def save_poll_results(self, poll_id, winning_set, candidate_text, vote_tally):
        losing_set = set(candidate_text.keys()) - winning_set
        for c in winning_set:
            self.client.table("PollOptions").upsert({
                "id": c,
                "option": candidate_text[c],
                "poll": poll_id,
                "winner": True,
                "vote_tally": vote_tally[c]
            }).execute()
        for c in losing_set:
            self.client.table("PollOptions").upsert({
                "id": c,
                "option": candidate_text[c],
                "poll": poll_id,
                "winner": False,
                "vote_tally": vote_tally[c]
            }).execute()

    def create_poll(self, title, description, cover_url, seats, email_verification):
        response = self.client.table("Polls").insert({
            "title": title,
            "description": description,
            "cover_photo": cover_url,
            "seats": seats,
            "email_verification": email_verification
        }).execute()
        return response.data[0]['id']

    def add_poll_admin(self, poll_id, user_id):
        return self.client.table("PollAdmins").insert({
            "poll": poll_id,
            "user": user_id
        }).execute()

    def add_poll_options(self, poll_id, options):
        for option in options:
            self.client.table("PollOptions").insert({
                "option": option,
                "poll": poll_id
            }).execute() 