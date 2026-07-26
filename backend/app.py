import os
import json
import re
import requests
from flask import send_file
from flask import Flask, render_template, jsonify, request, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
import pyrebase
import firebase_admin
from firebase_admin import credentials, auth as admin_auth, credentials
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from datetime import datetime
from functools import wraps
from werkzeug.utils import secure_filename
import uuid
import PyPDF2
import docx
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import google.generativeai as genai
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.units import inch
from reportlab.lib import colors

# Load environment variables from a .env file
load_dotenv()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, '../frontend')  # backend/app.py → frontend/

app = Flask(
    __name__,
    template_folder=os.path.join(FRONTEND_DIR, 'templates'),
    static_folder=os.path.join(FRONTEND_DIR, 'static')
)

CORS(app)

# --- Configuration ---
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///site.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['RESUME_FOLDER'] = os.path.join(app.config['UPLOAD_FOLDER'], 'resumes')
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['RESUME_FOLDER'], exist_ok=True)

db = SQLAlchemy(app)
migrate = Migrate(app, db)

# --- Firebase & Gemini AI Configuration ---
firebase_config = {
  "apiKey": "AIzaSyCx6LXOhV92Zx42_vDpmITEcj2blPx0yBY",
  "authDomain": "skillmatcher-b91dd.firebaseapp.com",
  "projectId": "skillmatcher-b91dd",
  "storageBucket": "skillmatcher-b91dd.appspot.com",
  "messagingSenderId": "1062862079783",
  "appId": "1:1062862079783:web:60c50a836a045574854b02",
  "databaseURL": "https://skillmatcher-b91dd-default-rtdb.firebaseio.com/"
}
firebase = pyrebase.initialize_app(firebase_config)
auth = firebase.auth()

# Diagnostic check for service account key
service_account_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
if service_account_path and os.path.exists(service_account_path):
    try:
        with open(service_account_path, 'r') as f:
            service_account_info = json.load(f)
            print(f"--- Diagnostic: Project ID loaded from key file: {service_account_info.get('project_id')} ---")
        cred = credentials.Certificate(service_account_path)
        firebase_admin.initialize_app(cred)
        print("--- Firebase Admin SDK initialized successfully. ---")
    except Exception as e:
        print(f"--- CRITICAL: Could not initialize Firebase Admin SDK. Backend token verification will fail. Error: {e} ---")
else:
    print("--- CRITICAL: GOOGLE_APPLICATION_CREDENTIALS path not set or file not found. Backend token verification will fail. ---")

# Configure Gemini AI
try:
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    if not gemini_api_key:
        print("--- Warning: GEMINI_API_KEY not set in .env file. AI features will not work. ---")
    else:
        genai.configure(api_key=gemini_api_key)
        print("--- Gemini AI configured successfully. ---")
except Exception as e:
    print(f"--- Error configuring Gemini AI: {e} ---")

# --- Database Models ---
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    firebase_uid = db.Column(db.String(128), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    full_name = db.Column(db.String(100), nullable=True)
    profile_image_filename = db.Column(db.String(255), nullable=True)
    website_url = db.Column(db.String(255), nullable=True) 
    city = db.Column(db.String(100), nullable=True)
    country = db.Column(db.String(100), nullable=True)
    about = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    resumes = db.relationship('Resume', backref='owner', lazy=True, cascade="all, delete-orphan")
    job_descriptions = db.relationship('JobDescription', backref='owner', lazy=True, cascade="all, delete-orphan")

    def to_dict(self):
        profile_image_url = f"/uploads/{self.profile_image_filename}" if self.profile_image_filename else None
        return {
            "firebase_uid": self.firebase_uid, "email": self.email, "full_name": self.full_name,
            "profile_image_url": profile_image_url, "website_url": self.website_url, "city": self.city,
            "country": self.country, "about": self.about, "created_at": self.created_at.isoformat()
        }

class Resume(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    original_filename = db.Column(db.String(255), nullable=False)
    saved_filename = db.Column(db.String(255), nullable=False, unique=True)
    content_text = db.Column(db.Text, nullable=True)
    is_ai_generated = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    
    def to_dict(self):
        return { 
            "id": self.id, 
            "original_filename": self.original_filename, 
            "saved_filename": self.saved_filename,
            "created_at": self.created_at.isoformat(),
            "is_ai_generated": self.is_ai_generated
        }

class JobDescription(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(150), nullable=False)
    company = db.Column(db.String(100), nullable=True)
    description_text = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

    def to_dict(self):
        return { "id": self.id, "title": self.title, "company": self.company, "created_at": self.created_at.isoformat() }

# --- Helper Functions ---
def extract_text_from_pdf(file_stream):
    pdf_reader = PyPDF2.PdfReader(file_stream)
    text = ""
    for page in pdf_reader.pages: text += page.extract_text() or ''
    return text

def extract_text_from_docx(file_stream):
    doc = docx.Document(file_stream)
    return "\n".join([para.text for para in doc.paragraphs])
    
def preprocess_text(text):
    text = text.lower()
    text = re.sub(r'\s+', ' ', text)
    text = re.sub(r'[^a-z0-9\s]', '', text)
    return text

def create_resume_pdf(text_content, template_name, file_path):
    doc = SimpleDocTemplate(file_path)
    styles = getSampleStyleSheet()
    story = []

    # Define styles based on template
    if template_name == 'modern':
        name_style = ParagraphStyle(name='Name', fontSize=24, leading=28, alignment=TA_CENTER, textColor=colors.HexColor('#1E3A8A'))
        contact_style = ParagraphStyle(name='Contact', fontSize=10, leading=12, alignment=TA_CENTER)
        heading_style = ParagraphStyle(name='Heading', fontSize=14, leading=18, textColor=colors.HexColor('#1E3A8A'), spaceBefore=10, spaceAfter=4)
        body_style = ParagraphStyle(name='Body', fontSize=10, leading=14, alignment=TA_LEFT)
    else: # Classic template
        name_style = ParagraphStyle(name='Name', fontSize=22, leading=26, alignment=TA_LEFT, fontName='Times-Bold')
        contact_style = ParagraphStyle(name='Contact', fontSize=10, leading=12, alignment=TA_LEFT, fontName='Times-Roman')
        heading_style = ParagraphStyle(name='Heading', fontSize=12, leading=14, fontName='Times-Bold', spaceBefore=12, spaceAfter=6, borderBottomWidth=1, borderBottomColor=colors.black, paddingBottom=2)
        body_style = ParagraphStyle(name='Body', fontSize=10, leading=14, alignment=TA_LEFT, fontName='Times-Roman')

    # Basic Parsing of the resume text
    sections = re.split(r'\n\s*(SUMMARY|EDUCATION|EXPERIENCE|SKILLS|PROJECTS)\s*\n', text_content, flags=re.IGNORECASE)
    
    header_text = sections[0].strip()
    name_and_contact = header_text.split('\n')
    name = name_and_contact[0] if name_and_contact else "Your Name"
    contact_info = name_and_contact[1:]

    story.append(Paragraph(name, name_style))
    for line in contact_info:
        story.append(Paragraph(line, contact_style))
    story.append(Spacer(1, 0.25 * inch))

    i = 1
    while i < len(sections):
        title = sections[i].strip().upper()
        content = sections[i+1].strip().replace('\n', '<br/>')
        story.append(Paragraph(title, heading_style))
        story.append(Paragraph(content, body_style))
        story.append(Spacer(1, 0.1 * inch))
        i += 2

    doc.build(story)


# --- Authentication Decorator ---
def check_token(f):
    @wraps(f)
    def wrap(*args,**kwargs):
        auth_header = request.headers.get('Authorization')
        if not auth_header: return {'message': 'No token provided'}, 401
        try:
            token = auth_header.split(' ')[1]
            request.user = admin_auth.verify_id_token(token, clock_skew_seconds=15)
        except Exception as e: 
            print(f"Token verification failed: {e}")
            return {'message':f'Invalid token: {e}'}, 401
        return f(*args, **kwargs)
    return wrap

# --- Routes ---

# ---------- Serve frontend HTML ----------
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/job_seekers.html')
def job_seekers():
    return render_template('job_seekers.html')

@app.route('/employers.html')
def employers():
    return render_template('employers.html')

#---- API ENPOINTS ----

@app.route('/api/auth/signup', methods=['POST'])
def signup():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    if not email or not password: return jsonify({"message": "Email and password are required"}), 400
    try:
        user = auth.create_user_with_email_and_password(email, password)
        new_user = User(firebase_uid=user['localId'], email=email)
        db.session.add(new_user)
        db.session.commit()
        return jsonify({"status": "success", "message": "User created successfully", "userId": user['localId']}), 201
    except Exception as e: return jsonify({"message": f"Sign up failed: {e}"}), 400

@app.route('/api/auth/signin', methods=['POST'])
def signin():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    try:
        user_auth_data = auth.sign_in_with_email_and_password(email, password)
        user = User.query.filter_by(firebase_uid=user_auth_data['localId']).first()
        if not user: return jsonify({"message": "User not found in local DB"}), 404
        return jsonify({"status": "success", "user": {**user.to_dict(), "idToken": user_auth_data['idToken']}}), 200
    except Exception as e: return jsonify({"message": f"Sign in failed: {e}"}), 401

@app.route('/api/auth/google-signin', methods=['POST'])
def google_signin():
    data = request.get_json()
    id_token = data.get('idToken')
    if not id_token:
        return jsonify({"message": "ID token is required."}), 400
    try:
        decoded_token = admin_auth.verify_id_token(id_token, clock_skew_seconds=15)
        uid = decoded_token['uid']
        email = decoded_token.get('email')
        full_name = decoded_token.get('name')
        
        user = User.query.filter_by(firebase_uid=uid).first()
        if not user:
            user = User(firebase_uid=uid, email=email, full_name=full_name)
            db.session.add(user)
            db.session.commit()

        return jsonify({"status": "success", "user": {**user.to_dict(), "idToken": id_token}}), 200
    except Exception as e:
        print(f"Google sign-in token verification failed: {e}")
        return jsonify({"message": f"Google sign in failed: {e}"}), 401

# --- USER PROFILE API ---
@app.route('/api/user/profile', methods=['GET', 'PUT'])
@check_token
def user_profile():
    firebase_uid = request.user['uid']
    user = User.query.filter_by(firebase_uid=firebase_uid).first()
    if not user: return jsonify({"message": "User not found"}), 404

    if request.method == 'PUT':
        data = request.get_json()
        user.full_name = data.get('full_name', user.full_name)
        user.website_url = data.get('website_url', user.website_url)
        user.city = data.get('city', user.city)
        user.country = data.get('country', user.country)
        user.about = data.get('about', user.about)
        db.session.commit()
        return jsonify({"status": "success", "message": "Profile updated", "user": user.to_dict()})
    
    return jsonify({"status": "success", "user": user.to_dict()})

@app.route('/api/user/profile-picture', methods=['POST'])
@check_token
def upload_profile_picture():
    firebase_uid = request.user['uid']
    user = User.query.filter_by(firebase_uid=firebase_uid).first()
    if not user: return jsonify({"message": "User not found"}), 404
    
    if 'profile_picture' not in request.files: return jsonify({"message": "No file part"}), 400
    file = request.files['profile_picture']
    if file.filename == '': return jsonify({"message": "No selected file"}), 400
    if file:
        filename = secure_filename(f"{firebase_uid}_{uuid.uuid4()}_{file.filename}")
        file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
        user.profile_image_filename = filename
        db.session.commit()
        return jsonify({"status": "success", "message": "Profile picture updated", "profile_image_url": f"/uploads/{filename}"})
    return jsonify({"message": "File upload failed"}), 400

# --- RESUME & JOB API ---
@app.route('/api/resumes', methods=['GET'])
@check_token
def get_resumes():
    user = User.query.filter_by(firebase_uid=request.user['uid']).first()
    if not user: return jsonify({"message": "User not found"}), 404
    return jsonify({"status": "success", "resumes": [r.to_dict() for r in user.resumes]})

@app.route('/api/resumes/upload', methods=['POST'])
@check_token
def upload_resume():
    user = User.query.filter_by(firebase_uid=request.user['uid']).first()
    if not user: return jsonify({"message": "User not found"}), 404

    if 'resume_file' not in request.files: return jsonify({"message": "No resume file part"}), 400
    file = request.files['resume_file']
    if file.filename == '': return jsonify({"message": "No selected file"}), 400
    
    try:
        content_text = ""
        if file.filename.lower().endswith('.pdf'):
            content_text = extract_text_from_pdf(file.stream)
        elif file.filename.lower().endswith('.docx'):
            content_text = extract_text_from_docx(file.stream)
        else:
            return jsonify({"status": "error", "message": "Unsupported file type. Please upload a .pdf or .docx file."}), 400
        
        file.stream.seek(0)
        filename = secure_filename(f"{user.firebase_uid}_{uuid.uuid4()}_{file.filename}")
        file.save(os.path.join(app.config['RESUME_FOLDER'], filename))
        
        new_resume = Resume(original_filename=file.filename, saved_filename=filename, content_text=content_text, owner=user)
        db.session.add(new_resume)
        db.session.commit()
        
        return jsonify({"status": "success", "message": "Resume uploaded successfully", "resume": new_resume.to_dict()}), 201
    
    except Exception as e:
        db.session.rollback()
        print(f"Error during resume upload for user {user.firebase_uid}: {e}")
        return jsonify({"status": "error", "message": "An error occurred while processing the resume file."}), 500

@app.route('/api/resumes/<int:resume_id>', methods=['DELETE'])
@check_token
def delete_resume(resume_id):
    user = User.query.filter_by(firebase_uid=request.user['uid']).first()
    if not user: return jsonify({"message": "User not found"}), 404

    resume = Resume.query.filter_by(id=resume_id, user_id=user.id).first()
    if not resume: return jsonify({"message": "Resume not found"}), 404
    try:
        file_path = os.path.join(app.config['RESUME_FOLDER'], resume.saved_filename)
        if os.path.exists(file_path):
            os.remove(file_path)
    except Exception as e:
        print(f"Warning: Could not delete file: {resume.saved_filename}. Error: {e}")
    db.session.delete(resume)
    db.session.commit()
    return jsonify({"status": "success", "message": "Resume deleted"})

@app.route('/api/jobs', methods=['GET'])
@check_token
def get_jobs():
    user = User.query.filter_by(firebase_uid=request.user['uid']).first()
    if not user: return jsonify({"message": "User not found"}), 404
    return jsonify({"status": "success", "jobs": [j.to_dict() for j in user.job_descriptions]})

@app.route('/api/jobs/save', methods=['POST'])
@check_token
def save_job():
    user = User.query.filter_by(firebase_uid=request.user['uid']).first()
    if not user: return jsonify({"message": "User not found"}), 404

    data = request.get_json()
    new_job = JobDescription(
        title=data['title'], 
        company=data.get('company'), 
        description_text=data['description_text'], 
        owner=user
    )
    db.session.add(new_job)
    db.session.commit()
    return jsonify({"status": "success", "message": "Job saved", "job": new_job.to_dict()})

@app.route('/api/jobs/search', methods=['GET'])
@check_token
def search_jobs():
    jsearch_api_key = os.getenv("JSEARCH_API_KEY")
    if not jsearch_api_key:
        return jsonify({"status": "error", "message": "Job search service is not configured."}), 500

    query = request.args.get('query', 'Python developer')
    location = request.args.get('location', 'United States')
    page = request.args.get('page', '1')

    url = "https://jsearch.p.rapidapi.com/search"
    querystring = {"query": f"{query} in {location}", "page": page, "num_pages": "1"}
    headers = {
        "X-RapidAPI-Key": jsearch_api_key,
        "X-RapidAPI-Host": "jsearch.p.rapidapi.com"
    }

    try:
        response = requests.get(url, headers=headers, params=querystring)
        response.raise_for_status() # Raise an exception for bad status codes
        data = response.json()
        return jsonify(data.get('data', []))
    except requests.exceptions.RequestException as e:
        print(f"JSearch API Error: {e}")
        return jsonify({"status": "error", "message": "Failed to fetch jobs from the external service."}), 502


@app.route('/api/jobs/<int:job_id>', methods=['DELETE'])
@check_token
def delete_job(job_id):
    user = User.query.filter_by(firebase_uid=request.user['uid']).first()
    if not user: return jsonify({"message": "User not found"}), 404
    
    job = JobDescription.query.filter_by(id=job_id, user_id=user.id).first()
    if not job: return jsonify({"message": "Job not found"}), 404
    db.session.delete(job)
    db.session.commit()
    return jsonify({"status": "success", "message": "Job deleted"})

# --- AI Matcher & Builder API ---
@app.route('/api/match', methods=['POST'])
@check_token
def match_resume_to_job():
    user = User.query.filter_by(firebase_uid=request.user['uid']).first()
    if not user: return jsonify({"message": "User not found"}), 404

    data = request.get_json()
    resume_id = data.get('resume_id')
    job_id = data.get('job_id')

    if not resume_id or not job_id: return jsonify({"status": "error", "message": "Resume ID and Job ID are required."}), 400

    resume = Resume.query.filter_by(id=resume_id, user_id=user.id).first()
    job = JobDescription.query.filter_by(id=job_id, user_id=user.id).first()

    if not resume or not job: return jsonify({"status": "error", "message": "Resume or Job not found."}), 404
    if not resume.content_text or not job.description_text: return jsonify({"status": "error", "message": "Resume or Job content is empty."}), 400

    resume_text = preprocess_text(resume.content_text)
    job_text = preprocess_text(job.description_text)

    try:
        vectorizer = TfidfVectorizer(stop_words='english')
        tfidf_matrix = vectorizer.fit_transform([resume_text, job_text])
        cosine_sim = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:2])[0][0]
        match_score = int(cosine_sim * 100)
        
        feature_names = vectorizer.get_feature_names_out()
        job_vector = tfidf_matrix[1].toarray().flatten()
        top_keywords_indices = job_vector.argsort()[-15:][::-1]
        job_keywords = [feature_names[i] for i in top_keywords_indices if job_vector[i] > 0]
        found_keywords = [keyword for keyword in job_keywords if keyword in resume_text.split()]

        return jsonify({"status": "success", "match_score": match_score, "job_keywords": job_keywords, "found_keywords": found_keywords})
    except ValueError as e:
        print(f"TF-IDF Error: {e}")
        return jsonify({"status": "error", "message": "Could not process text. Ensure documents are not empty."}), 400

@app.route('/api/ai/generate-suggestions', methods=['POST'])
@check_token
def generate_suggestions():
    if not os.getenv("GEMINI_API_KEY"):
        return jsonify({"status": "error", "message": "AI service is not configured. Please contact support."}), 500

    user = User.query.filter_by(firebase_uid=request.user['uid']).first()
    if not user: return jsonify({"message": "User not found"}), 404

    data = request.get_json()
    resume_id = data.get('resume_id')
    job_id = data.get('job_id')

    resume = Resume.query.filter_by(id=resume_id, user_id=user.id).first()
    job = JobDescription.query.filter_by(id=job_id, user_id=user.id).first()

    if not resume or not job: return jsonify({"status": "error", "message": "Resume or Job not found."}), 404
    
    try:
        model = genai.GenerativeModel(os.getenv("GEMINI_MODEL_NAME", "models/gemini-flash-latest"))
        prompt = f"""
        Analyze the following resume and job description. Provide specific, actionable suggestions for the user to improve their resume to better match this job. Focus on highlighting relevant skills and experiences. Format your response as a valid JSON object with a single key "suggestions" which is an array of strings.

        **Job Description:**
        ---
        {job.description_text}
        ---

        **Current Resume:**
        ---
        {resume.content_text}
        ---
        """
        response = model.generate_content(prompt)
        return jsonify({"status": "success", "suggestions": response.text})

    except Exception as e:
        print(f"Gemini API Error: {e}")
        return jsonify({"status": "error", "message": f"An error occurred with the AI service: {str(e)}"}), 500

@app.route('/api/ai/create-resume', methods=['POST'])
@check_token
def create_ai_resume():
    if not os.getenv("GEMINI_API_KEY"):
        return jsonify({"status": "error", "message": "AI service is not configured."}), 500

    user = User.query.filter_by(firebase_uid=request.user['uid']).first()
    if not user: return jsonify({"message": "User not found"}), 404

    data = request.get_json()
    suggestions = data.get('suggestions')
    original_resume_id = data.get('resume_id')
    template = data.get('template', 'modern') # Default to modern template

    if not suggestions or not original_resume_id:
        return jsonify({"status": "error", "message": "Original resume and suggestions are required."}), 400

    original_resume = Resume.query.get(original_resume_id)
    if not original_resume or original_resume.user_id != user.id:
        return jsonify({"status": "error", "message": "Original resume not found."}), 404
    
    try:
        model = genai.GenerativeModel(os.getenv("GEMINI_MODEL_NAME", "models/gemini-flash-latest"))
        prompt = f"""
        Based on the original resume text and the following improvement suggestions, generate a new, complete resume text. 
        The output must be only the full text of the new resume, ready to be saved and parsed. Do not include any extra commentary, titles, or formatting like markdown. Start directly with the person's name. Ensure standard resume sections like SUMMARY, EDUCATION, EXPERIENCE, SKILLS, PROJECTS are included as capitalized headings on their own lines.

        **Improvement Suggestions:**
        ---
        {suggestions}
        ---

        **Original Resume Text:**
        ---
        {original_resume.content_text}
        ---
        """
        response = model.generate_content(prompt)
        new_resume_text = response.text

        # Create the PDF
        pdf_filename = secure_filename(f"AI_{user.firebase_uid}_{uuid.uuid4()}.pdf")
        pdf_filepath = os.path.join(app.config['RESUME_FOLDER'], pdf_filename)
        create_resume_pdf(new_resume_text, template, pdf_filepath)
        
        # Create a new resume entry in the database
        original_filename = f"AI_Improved_{original_resume.original_filename.split('.')[0]}.pdf"
        
        new_resume = Resume(
            original_filename=original_filename,
            saved_filename=pdf_filename, 
            content_text=new_resume_text,
            is_ai_generated=True,
            owner=user
        )
        db.session.add(new_resume)
        db.session.commit()
        
        return jsonify({"status": "success", "message": "AI-powered resume created successfully!", "new_resume": new_resume.to_dict()})

    except Exception as e:
        print(f"Gemini API Error during resume creation: {e}")
        db.session.rollback()
        return jsonify({"status": "error", "message": f"An error occurred while creating the resume with AI: {str(e)}"}), 500


@app.route('/uploads/<path:filename>')
def uploaded_file(filename): return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/resumes/<path:filename>')
@check_token
def download_resume(filename):
    return send_from_directory(app.config['RESUME_FOLDER'], filename)


@app.route('/favicon.ico')
def favicon():
    return '', 204

if __name__ == '__main__':
    app.run(debug=True, port=5000)

