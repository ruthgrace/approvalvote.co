import random
import smtplib
import ssl
from email.message import EmailMessage

class EmailService:
    def __init__(self, noreply_email, noreply_password):
        self.noreply_email = noreply_email
        self.noreply_password = noreply_password
        self.DIGITS = "0123456789"
        self.VERIFICATION_CODE_LENGTH = 4

    def generate_verification_code(self):
        return "".join([random.choice(self.DIGITS) for _ in range(self.VERIFICATION_CODE_LENGTH)])

    def send_verification_email(self, recipient_email):
        code = self.generate_verification_code()
        print(f"verification code is {code}")
        message = EmailMessage()
        message["Subject"] = "ApprovalVote.Co Verification Code"
        message["From"] = self.noreply_email
        message["To"] = recipient_email
        message.set_content(f"""
Hello,

Your verification code for ApprovalVote.Co is: {code}

If you didn't request this code, please ignore this email.
        """.strip())

        self._send_email(message)
        return code

    def _send_email(self, message):
        smtp_server = "smtp.gmail.com"
        port = 587
        context = ssl.create_default_context()
        
        try:
            # Set timeout to prevent hanging workers
            with smtplib.SMTP(smtp_server, port, timeout=10) as server:
                server.ehlo()
                server.starttls(context=context)
                server.ehlo()
                server.login(self.noreply_email, self.noreply_password)
                server.send_message(message)
                print(f"✅ Email sent successfully to {message['To']}")
        except Exception as e:
            print(f"❌ Failed to send email to {message['To']}: {type(e).__name__}: {e}")
            # Don't re-raise the exception - log it and continue
            # This prevents worker crashes when email fails 