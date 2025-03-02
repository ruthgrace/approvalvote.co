import pytest
from unittest.mock import Mock, patch
from email_service import EmailService

@pytest.fixture
def email_service():
    return EmailService('noreply@example.com', 'password123')

def test_generate_verification_code(email_service):
    code = email_service.generate_verification_code()
    assert len(code) == email_service.VERIFICATION_CODE_LENGTH
    assert code.isdigit()

@patch('smtplib.SMTP')
def test_send_verification_email(mock_smtp, email_service):
    with patch('ssl.create_default_context'):
        code = email_service.send_verification_email('user@example.com')
        assert len(code) == 4
        assert code.isdigit()
        # Verify SMTP was called correctly
        mock_smtp.return_value.__enter__.return_value.send_message.assert_called_once()

def test_email_content(email_service):
    with patch.object(email_service, '_send_email'):
        code = email_service.send_verification_email('user@example.com')
        assert len(code) == 4
        assert code.isdigit() 