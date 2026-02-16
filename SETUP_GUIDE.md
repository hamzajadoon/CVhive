# CVhive - Setup Guide

## Overview
CVhive is a modern recruitment platform with two user types:
- **Job Seekers**: Upload CVs for free
- **Employers**: Pay to view and download candidate CVs

## Prerequisites
- Node.js 18+ 
- PostgreSQL 15+
- npm or yarn

## Installation Steps

### 1. Setup PostgreSQL Database (Local)

```bash
# Start PostgreSQL service (Windows)
net start PostgreSQL-x64-15

# Or use WSL/Linux
sudo service postgresql start

# Create the database
createdb cvhive

# Create a user (if not already created)
createuser -P postgres
# Password: postgres (or your preferred password)
```

### 2. Install Dependencies

```bash
cd c:/CVhive/CVhive
npm install
```

### 3. Create .env File

Create a `.env` file in the project root:

```env
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/cvhive
NODE_ENV=development

# Server
PORT=3001
FRONTEND_URL=http://localhost:3000

# JWT
JWT_SECRET=your-secret-key-min-32-characters-very-long
JWT_REFRESH_SECRET=your-refresh-secret-key-min-32-characters

# Stripe (Get keys from https://dashboard.stripe.com/apikeys)
STRIPE_PUBLIC_KEY=pk_test_your_public_key_here
STRIPE_SECRET_KEY=sk_test_your_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here

# Email (SendGrid or Nodemailer)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG.your_sendgrid_key_here

# AWS S3 (Optional - for CV storage)
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
AWS_REGION=us-east-1
AWS_S3_BUCKET=cvhive-cvs-prod
```

### 4. Initialize Database Schema

```bash
# Option 1: Using setup script
node setup-db.js

# Option 2: Manual psql
psql -U postgres -d cvhive -f database/schema.sql
psql -U postgres -d cvhive -f database/seed.sql
```

### 5. Start the Server

```bash
# Development mode (with nodemon)
npm run dev

# Production mode
npm start
```

Server will start at: http://localhost:3001

## Features by User Type

### Job Seekers
- ✅ Sign up with email/password
- ✅ Create profile
- ✅ Upload multiple CVs (PDF, DOC, DOCX)
- ✅ Track CV views
- ✅ Manage CV visibility

### Employers
- ✅ Sign up with company info
- ✅ Browse all available CVs
- ✅ Purchase access packages:
  - **Monthly Access** (99 AED): Unlimited CVs for 30 days
  - **7-Day Unlimited** (199 AED): Unlimited CVs for 7 days
  - **Single CV** (19 AED): One CV view
- ✅ Download CVs
- ✅ Track payment history
- ✅ View access expiration

## API Endpoints

### Authentication
```
POST   /v1/users/signup          - Create new account
POST   /v1/users/login           - User login
GET    /v1/users/profile         - Get user profile
```

### CV Management (Job Seekers)
```
POST   /v1/cv/upload             - Upload CV
GET    /v1/cvs/my                - List my CVs
GET    /v1/cvs/:id               - View CV details
DELETE /v1/cvs/:id               - Delete CV
```

### CV Browsing (Employers)
```
GET    /v1/cvs/available         - List all CVs
GET    /v1/cvs/:id               - Download CV (checks payment)
```

### Payments
```
GET    /v1/payments/packages     - Get available packages
POST   /v1/payments/checkout-session - Create Stripe session
POST   /v1/payments/webhook      - Stripe webhook (automatic)
GET    /v1/payments/status       - Check payment status
```

## Pages

### Public Pages
- `/` - Home page
- `/signup` - New account creation
- `/login` - User login

### Job Seeker Pages
- `/job-seeker-dashboard` - Upload and manage CVs

### Employer Pages
- `/employer-dashboard` - Browse CVs and manage access

## Stripe Integration

### Setup Stripe Account
1. Go to https://stripe.com
2. Create a free account
3. Go to Dashboard → API keys
4. Copy your keys to `.env` file

### Webhook Setup (for production)
1. Go to Webhooks section
2. Add endpoint: `YOUR_URL/v1/payments/webhook`
3. Subscribe to: `checkout.session.completed`
4. Copy webhook secret to `.env`

## Database Schema

### Main Tables
- `users` - User accounts (job seekers + employers)
- `job_seeker_profiles` - Job seeker info
- `employer_profiles` - Employer company info
- `job_seeker_cvs` - Uploaded CV files
- `cv_access_payments` - Payment records
- `cv_view_logs` - Audit trail of CV views

## File Structure

```
cvhive/
├── server.js                      - Main API server
├── setup-db.js                    - Database initialization
├── package.json                   - Dependencies
├── .env                          - Environment variables
│
├── database/
│   ├── schema.sql                - Database tables
│   └── seed.sql                  - Sample data
│
├── uploads/                      - CV file storage
│
└── HTML Pages/
    ├── CVhive.html               - Home page
    ├── login-new.html            - New login page
    ├── signup-new.html           - New signup with role selection
    ├── job-seeker-dashboard.html - Seeker dashboard
    └── employer-dashboard.html   - Employer dashboard
```

## Troubleshooting

### Database Connection Error
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```
**Solution**: Make sure PostgreSQL is running
```bash
# Windows
net start PostgreSQL-x64-15

# Linux/Mac
sudo service postgresql start
```

### Port 3001 Already in Use
```
Error: listen EADDRINUSE: address already in use :::3001
```
**Solution**: Kill the process or use different port
```bash
# Windows
netstat -ano | findstr :3001
taskkill /PID <PID> /F

# Linux/Mac
lsof -i :3001
kill -9 <PID>
```

### Stripe Payment Not Working
- Verify `STRIPE_SECRET_KEY` and `STRIPE_PUBLIC_KEY` in `.env`
- Check webhook secret is correct
- Use Stripe test mode keys during development

## Testing

### Test Job Seeker Flow
1. Go to http://localhost:3001/signup
2. Select "Job Seeker" role
3. Create account
4. Upload a CV
5. Check dashboard

### Test Employer Flow
1. Go to http://localhost:3001/signup
2. Select "Employer" role
3. Create account
4. Purchase a package
5. Browse and download CVs

### Test Stripe (Use test card)
- Card Number: `4242 4242 4242 4242`
- Expiry: Any future date (e.g., 12/25)
- CVC: Any 3 digits

## Production Deployment

### Before Going Live
- [ ] Set NODE_ENV=production
- [ ] Use real Stripe keys (not test keys)
- [ ] Enable SSL/HTTPS
- [ ] Configure database backups
- [ ] Set up email service (SendGrid, AWS SES)
- [ ] Configure S3 for CV storage
- [ ] Set strong JWT_SECRET
- [ ] Update FRONTEND_URL

### Deployment Platforms
- **Railway**: Recommended for PostgreSQL + Node.js
- **Render**: Free tier available
- **Heroku**: Traditional choice (paid)
- **AWS/Azure**: For enterprise

## Support & Documentation

For API documentation and more details, visit:
- Stripe Docs: https://stripe.com/docs
- PostgreSQL Docs: https://www.postgresql.org/docs/
- Express.js: https://expressjs.com/

## License
UNLICENSED - All rights reserved
