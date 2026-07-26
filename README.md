# ResuMatch AI - Project Structure

## Overview
The application has been refactored from a single-page application into a multi-page application with separate files for better organization and maintainability.

## File Structure

```
project/
├── backend/
│   └── app.py (your existing Flask backend)
├── frontend/
│   ├── index.html           # Landing page
│   ├── job_seekers.html     # Job seeker dashboard
│   ├── employers.html       # Employer dashboard
│   ├── styles.css           # Shared styles
│   ├── auth.js              # Authentication logic for landing page
│   └── dashboard.js         # Dashboard logic for both dashboards
└── README.md
```

## Pages

### 1. index.html (Landing Page)
**Purpose:** Marketing page with sign up/sign in functionality

**Features:**
- Hero section
- Features for job seekers and employers
- FAQ section
- About section
- Newsletter subscription
- Authentication modals (Sign Up, Sign In, Profile)
- Footer

**Scripts:** Uses `auth.js`

**Access:** Public (no authentication required)

---

### 2. job_seekers.html (Job Seeker Dashboard)
**Purpose:** Dashboard for job seekers to manage resumes and job applications

**Features:**
- Resume upload and management
- Job description saving
- Global job search (using external API)
- AI-powered resume/job matching
- Match score visualization
- AI resume builder with templates
- Keyword analysis
- Profile management
- Footer

**Scripts:** Uses `dashboard.js`

**Access:** Protected (requires authentication)

---

### 3. employers.html (Employer Dashboard)
**Purpose:** Dashboard for employers to screen candidates

**Features:**
- Candidate resume upload
- Job posting management
- AI-powered candidate screening
- Match score visualization
- Keyword analysis for candidate skills
- Profile management
- Footer

**Scripts:** Uses `dashboard.js`

**Access:** Protected (requires authentication)

---

## JavaScript Files

### auth.js
**Used by:** index.html

**Responsibilities:**
- Firebase authentication initialization
- Sign up with email/password
- Sign in with email/password
- Google OAuth sign in
- Profile management
- Session management
- Redirect to job_seekers.html after successful login
- Logout functionality

---

### dashboard.js
**Used by:** job_seekers.html, employers.html

**Responsibilities:**
- Authentication check on page load
- Resume management (upload, list, download, delete)
- Job management (save, list, delete)
- Job search (job seekers only)
- AI matching functionality
- AI resume builder (job seekers only)
- Profile management
- Session management
- Logout functionality

---

## CSS File

### styles.css
**Used by:** All HTML files

**Contains:**
- Global styles (fonts, colors)
- Button styles (CTA gradient, Google button)
- Modal styles
- Profile picture styles
- Template card styles
- Job card styles
- Footer styles

---

## Key Features

### Authentication Flow
1. User lands on `index.html`
2. User signs up or signs in
3. After authentication, user is redirected to `job_seekers.html`
4. User can navigate between dashboards using header links
5. User data is stored in localStorage
6. Protected pages check for authentication on load

### Protected Routes
Both dashboard pages check for authentication on load:
- If no user in localStorage → redirect to index.html
- If API returns 401 → clear localStorage and redirect to index.html

### Shared Functionality
Both dashboards share:
- Profile management
- Resume/job CRUD operations
- AI matching
- Same modal components
- Same footer

### Dashboard-Specific Features

**Job Seekers Only:**
- Global job search
- AI resume builder with templates
- Improve resume button

**Employers:**
- Simplified to focus on candidate screening
- No job search feature
- No AI resume builder

---

## API Integration

The frontend connects to your Flask backend at `http://127.0.0.1:5000`

### Authentication Endpoints
- POST `/api/auth/signup` - Create new account
- POST `/api/auth/signin` - Sign in with email/password
- POST `/api/auth/google-signin` - Sign in with Google

### User Endpoints
- GET `/api/user/profile` - Get user profile
- PUT `/api/user/profile` - Update user profile
- POST `/api/user/profile-picture` - Upload profile picture

### Resume Endpoints
- GET `/api/resumes` - Get all user resumes
- POST `/api/resumes/upload` - Upload new resume
- DELETE `/api/resumes/:id` - Delete resume
- GET `/resumes/:filename` - Download resume

### Job Endpoints
- GET `/api/jobs` - Get all saved jobs
- POST `/api/jobs/save` - Save new job
- DELETE `/api/jobs/:id` - Delete job
- GET `/api/jobs/search` - Search external job API

### AI Endpoints
- POST `/api/match` - Match resume to job
- POST `/api/ai/generate-suggestions` - Generate AI suggestions
- POST `/api/ai/create-resume` - Create AI-powered resume

---

## Setup Instructions

### 1. Backend Setup
Your existing Flask backend (`app.py`) should work without modifications.

Make sure you have:
- `.env` file with API keys
- Firebase service account key file
- All dependencies installed

### 2. Frontend Setup

1. Create the following file structure:
```
frontend/
├── index.html
├── job_seekers.html
├── employers.html
├── styles.css
├── auth.js
└── dashboard.js
```

2. Copy the code from each artifact into the corresponding file

3. Serve the files using a local web server:
```bash
# Option 1: Python
python -m http.server 8000

# Option 2: Node.js
npx http-server

# Option 3: VS Code Live Server extension
```

4. Update `API_BASE_URL` in both JavaScript files if your backend runs on a different port

### 3. Access the Application

1. Start your Flask backend:
```bash
python app.py
```

2. Open your browser and navigate to:
```
http://localhost:8000/index.html
```

---

## User Flow

### For Job Seekers:
1. Sign up/Sign in on landing page
2. Redirected to job seeker dashboard
3. Upload resume(s)
4. Save job descriptions or search for jobs
5. Run AI match to see compatibility score
6. Use AI to improve resume
7. Download improved resume

### For Employers:
1. Sign up/Sign in on landing page
2. Navigate to employer dashboard
3. Upload candidate resumes
4. Create job postings
5. Screen candidates using AI matcher
6. View match scores and keyword analysis

---

## Notes

### Session Management
- User data stored in localStorage
- JWT token used for API authentication
- Automatic redirect to login if session expires

### Modals
All modals are included in each HTML file:
- Profile modal (all pages)
- Sign Up modal (index.html only)
- Sign In modal (index.html only)
- Confirmation modal (dashboards only)
- AI Builder modal (job_seekers.html only)

### Footer
Footer is now present on all pages, including after login.

### Browser Compatibility
- Modern browsers (Chrome, Firefox, Safari, Edge)
- ES6+ JavaScript features used
- Requires localStorage support

---

## Future Enhancements

Potential improvements:
1. Add role selection during signup (job seeker vs employer)
2. Implement route-based role restrictions
3. Add dashboard analytics
4. Implement real-time notifications
5. Add batch resume upload for employers
6. Create a shared components file to reduce duplication

---

## Troubleshooting

**Issue:** "User not authenticated" error
- **Solution:** Clear localStorage and sign in again

**Issue:** 401 errors from API
- **Solution:** Check Firebase configuration and service account key

**Issue:** CORS errors
- **Solution:** Ensure Flask CORS is properly configured

**Issue:** Files not loading
- **Solution:** Check file paths and ensure all files are in the same directory

**Issue:** Job search not working
- **Solution:** Verify JSEARCH_API_KEY is set in backend .env file

---

## Security Considerations

1. **Never commit API keys** - Keep `.env` file private
2. **Use HTTPS in production** - Current setup uses HTTP for development
3. **Validate all inputs** - Backend has validation, but add frontend validation
4. **Implement rate limiting** - Protect against abuse
5. **Regular security audits** - Keep dependencies updated

---

## Support

For issues or questions:
1. Check browser console for errors
2. Check Flask backend logs
3. Verify all environment variables are set
4. Ensure Firebase configuration is correct