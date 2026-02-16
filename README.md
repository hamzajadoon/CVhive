# CVhive - Recruitment Platform with Role-Based CV Access

A modern recruitment platform where **Job Seekers** can upload CVs for free and **Employers** can purchase access to view and download candidate CVs.

## 🚀 What's New

This version includes a complete overhaul of the user system:

### New User Types
- **Job Seekers**: Free access - upload and manage CVs
- **Employers**: Paid access - browse, view, and download CVs

### New Features
- 🔐 Role-based authentication (signup with role selection)
- 💳 Stripe payment integration for employers
- 💰 Multiple payment packages:
  - Monthly unlimited access (99 AED, 30 days)
  - 7-day unlimited access (199 AED)
  - Single CV access (19 AED per CV)
- 📊 CV management dashboard for job seekers
- 🔍 CV browser with payment verification for employers
- 📱 Responsive mobile-friendly design
- 🔒 Secure authentication with JWT tokens

## 📋 System Architecture

### Database Schema (PostgreSQL)
```
users
├── job_seeker_profiles (for job seekers)
├── job_seeker_cvs (uploaded CV files)
├── employer_profiles (for employers)
├── cv_access_payments (payment records)
└── cv_view_logs (audit trail)
```

### User Flows

**Job Seeker**:
```
Sign Up → Create Profile → Upload CVs → Manage Dashboard → Track Views
```

**Employer**:
```
Sign Up → Browse CVs → Select Package → Pay via Stripe → Download CVs
```

## 🛠️ Tech Stack

- **Backend**: Node.js + Express.js
- **Database**: PostgreSQL 15+
- **Authentication**: JWT (JSON Web Tokens)
- **Payments**: Stripe API
- **File Storage**: Local (dev), S3 (prod)
- **Frontend**: Vanilla HTML5 + CSS3 + JavaScript

## 📦 Installation

### Prerequisites
```bash
- Node.js 18+
- PostgreSQL 15+
- npm/yarn
```

### Quick Start
```bash
# 1. Install dependencies
npm install

# 2. Copy environment variables
cp .env.example .env

# 3. Create and initialize PostgreSQL database
createdb cvhive
node setup-db.js

# 4. Start the server
npm run dev
```

Server will run at: **http://localhost:3001**

## 🔐 Environment Setup

Create a `.env` file with:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/cvhive
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:3001

JWT_SECRET=your-long-random-secret-key-min-32-characters
JWT_REFRESH_SECRET=your-long-random-refresh-secret-min-32-characters

STRIPE_PUBLIC_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## 🌐 Pages & Routes

### Public Pages
| Route | Purpose |
|-------|---------|
| `/` | Home page |
| `/login` | User login |
| `/signup` | New account signup (with role selection) |

### Job Seeker Dashboard
| Route | Purpose |
|-------|---------|
| `/job-seeker-dashboard` | Upload and manage CVs |

### Employer Dashboard
| Route | Purpose |
|-------|---------|
| `/employer-dashboard` | Browse CVs and manage packages |

## 📡 API Endpoints

### Authentication
```
POST   /v1/users/signup              Sign up with role selection
POST   /v1/users/login               User login
GET    /v1/users/profile             Get user profile
```

### Job Seeker CV Management
```
POST   /v1/cv/upload                 Upload a CV
GET    /v1/cvs/my                    List my CVs
DELETE /v1/cvs/:id                   Delete a CV
```

### Employer CV Access
```
GET    /v1/cvs/available             List available CVs (with payment check)
GET    /v1/cvs/:id                   Download CV (verifies payment)
```

### Payment Management
```
GET    /v1/payments/packages         Get available payment packages
POST   /v1/payments/checkout-session Create Stripe checkout session
POST   /v1/payments/webhook          Stripe webhook handler
GET    /v1/payments/status           Check payment status
```

## 💳 Stripe Integration

### Test Mode Setup
1. Create free account at https://stripe.com
2. Get test keys from Dashboard → API keys
3. Add to `.env`:
   ```env
   STRIPE_PUBLIC_KEY=pk_test_...
   STRIPE_SECRET_KEY=sk_test_...
   ```

### Test Payment
Use test card: `4242 4242 4242 4242`
- Expiry: Any future date
- CVC: Any 3 digits

### Production Setup
- Use live keys (pk_live_*, sk_live_*)
- Configure webhook endpoint in Stripe dashboard
- Update STRIPE_WEBHOOK_SECRET

## 👥 User Flows & Workflows

### Job Seeker Workflow
1. **Sign Up**
   - Go to `/signup`
   - Select "Job Seeker" role
   - Enter email, password, name
   - Agree to terms

2. **Upload CV**
   - Go to dashboard
   - Drag & drop CV or click to upload
   - Supported formats: PDF, DOC, DOCX
   - Max file size: 10MB

3. **Manage CVs**
   - View all uploaded CVs
   - Track number of views per CV
   - Delete CVs as needed

### Employer Workflow
1. **Sign Up**
   - Go to `/signup`
   - Select "Employer" role
   - Enter company info
   - Agree to terms

2. **Purchase Access**
   - View available packages
   - Select one:
     - 99 AED/month (unlimited)
     - 199 AED/7 days (unlimited)
     - 19 AED (single CV)
   - Complete Stripe payment

3. **Download CVs**
   - Browse all available CVs
   - Click "Download CV"
   - CV is verified against payment
   - Download count tracked

## 📊 Database Structure

### Users Table
```sql
users (
  id UUID PRIMARY KEY
  email VARCHAR UNIQUE
  password_hash VARCHAR
  role ENUM('job_seeker', 'employer')
  first_name, last_name, phone
  created_at, updated_at
)
```

### Job Seeker Profiles
```sql
job_seeker_profiles (
  id UUID PRIMARY KEY
  user_id UUID FOREIGN KEY
  headline, bio, location
  years_experience, highest_education
  skills[], languages JSONB
)
```

### Job Seeker CVs
```sql
job_seeker_cvs (
  id UUID PRIMARY KEY
  user_id UUID FOREIGN KEY
  filename, file_path, file_size
  download_count, last_downloaded_at
  is_deleted, created_at
)
```

### CV Access Payments
```sql
cv_access_payments (
  id UUID PRIMARY KEY
  employer_id UUID FOREIGN KEY
  stripe_payment_id VARCHAR
  amount DECIMAL
  status ENUM('pending', 'completed', 'failed')
  package_type VARCHAR
  cv_view_limit, cv_views_used
  expires_at
)
```

### CV View Logs
```sql
cv_view_logs (
  id UUID PRIMARY KEY
  job_seeker_id, employer_id, cv_id UUID FOREIGN KEYS
  payment_id UUID FOREIGN KEY
  viewed_at TIMESTAMP
)
```

## 🚨 Error Handling

### Common Errors & Solutions

**"Cannot POST /v1/users/signup"**
- Issue: Server not running
- Solution: Run `npm run dev`

**"Database connection refused"**
- Issue: PostgreSQL not running
- Solution: `net start PostgreSQL-x64-15` (Windows)

**"Port 3001 already in use"**
- Issue: Another process using port
- Solution: Change PORT in .env or kill process

**"Invalid token"**
- Issue: Token expired or invalid
- Solution: Log out and log in again

**"No active CV access"**
- Issue: Employer hasn't purchased access
- Solution: Purchase a package first

## 🔒 Security Features

- ✅ Password hashing with bcrypt
- ✅ JWT token-based authentication
- ✅ CORS protection
- ✅ Rate limiting on auth endpoints
- ✅ SQL injection prevention (parameterized queries)
- ✅ File upload validation (type, size)
- ✅ GDPR consent tracking
- ✅ Payment verification before CV access

## 📈 Future Enhancements

- [ ] Email notifications for CV views
- [ ] Analytics dashboard for employers
- [ ] Advanced CV search filters
- [ ] Bulk CV uploads
- [ ] API rate limiting per user
- [ ] Integration with LinkedIn for CV import
- [ ] Mobile apps (iOS/Android)
- [ ] Multi-language support
- [ ] Advanced payment methods (Apple Pay, Google Pay)

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📝 License

UNLICENSED - All rights reserved

## 📞 Support

For issues and questions:
- Email: support@cvhive.com
- Documentation: See `SETUP_GUIDE.md`

## 🙏 Acknowledgments

Built with:
- Express.js for backend
- PostgreSQL for database
- Stripe for payments
- JWT for authentication

---

**Version**: 2.0.0  
**Last Updated**: February 2025  
**Status**: Production Ready ✅
