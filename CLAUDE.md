# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Running the Application
```bash
# Start development server (runs on port 3000)
python website.py

# The app uses environment variables from .env file for:
# - SUPABASE_URL
# - SUPABASE_KEY  
# - GMAIL_USER (for email verification)
# - GMAIL_PASSWORD
# - SESSION_SECRET_KEY
```

### CSS Building
```bash
npm run build  # Production CSS build (minified)
npm run watch  # Development mode with auto-rebuild
```

### Testing
```bash
# Unit tests (Python/pytest)
pytest -v
pytest tests/test_database.py -v  # Run specific test file

# E2E tests (Playwright)
npm run test:e2e          # Headless mode
npm run test:e2e:ui       # With Playwright UI
npm run test:e2e:headed   # Headed browser mode

# Note: In development mode, the app exposes /api/test/verification-code 
# endpoint for getting email verification codes in tests
```

## Architecture Overview

### Core Application Structure
The application is a Flask-based approval voting system with Supabase (PostgreSQL) backend:

- **website.py**: Main Flask application containing all routes and business logic
- **database.py**: PollDatabase class providing abstraction over Supabase operations
- **email_service.py**: Email verification service using Gmail SMTP
- **vote_utils.py**: Vote calculation algorithms including multi-winner approval voting logic
- **constants.py**: Shared application constants

### Key Architectural Patterns

1. **Email Verification Flow**: 
   - Users must verify email before creating polls or accessing admin features
   - 4-digit verification codes stored temporarily in FormData table
   - Session-based authentication after verification

2. **Multi-Winner Vote Calculation**:
   - Complex algorithm in vote_utils.py handles seat allocation
   - Considers vote overlaps when multiple candidates can win
   - Produces detailed results with vote breakdowns

3. **HTMX-Powered Interactivity**:
   - Templates use HTMX for dynamic updates without full page reloads
   - Partial HTML responses for interactive elements
   - Progressive enhancement approach

4. **Database Schema**:
   - Users table: Stores verified user accounts
   - Polls table: Poll metadata including seats, end date, options visibility
   - PollOptions: Individual candidates/options for each poll
   - Votes: Individual vote records with voter email and selected options
   - PollAdmins: Many-to-many relationship for poll administration

### Testing Strategy

- **Unit Tests**: Mock Supabase client for isolated testing of database operations
- **Integration Tests**: Test full workflows including email verification
- **E2E Tests**: Playwright tests covering user journeys from poll creation to voting
- **Development Mode**: Special test endpoints enabled via DEVELOPMENT=true environment variable

### Frontend Architecture

- **Templates**: Jinja2 templates (.html.j2 files) in templates/ directory
- **Styling**: Tailwind CSS with custom configuration for Red Hat Display font
- **JavaScript**: Minimal vanilla JS for HTMX interactions and ApexCharts for results visualization
- **Static Files**: Served from static/ directory with proper caching headers in production
