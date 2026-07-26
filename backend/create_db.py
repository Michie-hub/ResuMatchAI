"""
Database Creation Script
Run this file to create all database tables
"""

from app import app, db

def create_database():
    with app.app_context():
        # Create all tables
        db.create_all()
        print("✅ Database created successfully!")
        print("📊 Tables created: User, Resume, JobDescription")
        print("📍 Database location: backend/site.db")

if __name__ == '__main__':
    create_database()