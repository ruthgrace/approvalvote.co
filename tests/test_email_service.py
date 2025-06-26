import pytest
from unittest.mock import Mock, patch, MagicMock
from email_service import EmailService

@pytest.fixture
def email_service():
    return EmailService('noreply@example.com', 'password123')

def test_generate_verification_code(email_service):
    code = email_service.generate_verification_code()
    assert len(code) == email_service.VERIFICATION_CODE_LENGTH
    assert code.isdigit()

@patch('smtplib.SMTP')
def test_send_verification_email_success(mock_smtp, email_service):
    """Test that email is successfully sent and SMTP methods are called correctly"""
    # Setup mock
    mock_server = MagicMock()
    mock_smtp.return_value.__enter__.return_value = mock_server
    
    with patch('ssl.create_default_context') as mock_ssl:
        code = email_service.send_verification_email('user@example.com')
        
        # Verify code generation
        assert len(code) == 4
        assert code.isdigit()
        
        # Verify SMTP connection was established
        mock_smtp.assert_called_once_with('smtp.gmail.com', 587, timeout=10)
        
        # Verify SMTP methods were called in correct order
        mock_server.ehlo.assert_called()
        mock_server.starttls.assert_called_once()
        mock_server.login.assert_called_once_with('noreply@example.com', 'password123')
        mock_server.send_message.assert_called_once()
        
        # Verify SSL context was created
        mock_ssl.assert_called_once()

@patch('smtplib.SMTP')
def test_send_verification_email_content(mock_smtp, email_service):
    """Test that the email message contains correct content"""
    mock_server = MagicMock()
    mock_smtp.return_value.__enter__.return_value = mock_server
    
    with patch('ssl.create_default_context'):
        code = email_service.send_verification_email('user@example.com')
        
        # Get the message that was sent
        call_args = mock_server.send_message.call_args
        message = call_args[0][0]  # First argument to send_message
        
        # Verify message headers
        assert message['Subject'] == 'ApprovalVote.Co Verification Code'
        assert message['From'] == 'noreply@example.com'
        assert message['To'] == 'user@example.com'
        
        # Verify message content contains the verification code
        content = message.get_content()
        assert code in content
        assert 'ApprovalVote.Co' in content
        assert 'verification code' in content.lower()

@patch('smtplib.SMTP')
def test_send_verification_email_smtp_failure(mock_smtp, email_service):
    """Test email sending failure handling"""
    # Mock SMTP to raise an exception
    mock_smtp.side_effect = Exception("SMTP connection failed")
    
    with patch('ssl.create_default_context'):
        with patch('os.getenv', return_value='production'):  # Not development mode
            with pytest.raises(Exception, match="Failed to send verification email"):
                email_service.send_verification_email('user@example.com')

@patch('smtplib.SMTP')
def test_send_verification_email_development_mode_failure(mock_smtp, email_service):
    """Test that email failure in development mode doesn't break the flow"""
    # Mock SMTP to raise an exception
    mock_smtp.side_effect = Exception("SMTP connection failed")
    
    with patch('ssl.create_default_context'):
        with patch('os.getenv', return_value='development'):  # Development mode
            # Should not raise exception, should return code anyway
            code = email_service.send_verification_email('user@example.com')
            assert len(code) == 4
            assert code.isdigit()
            # Verify code was stored for test access
            assert EmailService.get_last_verification_code() == code

def test_email_content(email_service):
    """Test email content without mocking SMTP (legacy test)"""
    with patch.object(email_service, '_send_email'):
        code = email_service.send_verification_email('user@example.com')
        assert len(code) == 4
        assert code.isdigit()

def test_last_verification_code_storage(email_service):
    """Test that verification codes are properly stored for test access"""
    with patch.object(email_service, '_send_email', return_value=True):
        with patch('os.getenv', return_value='development'):
            code = email_service.send_verification_email('user@example.com')
            assert EmailService.get_last_verification_code() == code 