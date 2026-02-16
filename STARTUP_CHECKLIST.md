# CVhive Startup Checklist

Use this checklist to ensure your system is properly set up before starting the server.

## ✅ Pre-Startup Checks

### Environment & Tools
- [ ] Node.js 18+ installed (`node --version`)
- [ ] npm installed (`npm --version`)
- [ ] PostgreSQL 15+ installed (`psql --version`)
- [ ] PostgreSQL service running
  - Windows: `net start PostgreSQL-x64-15`
  - Linux: `sudo service postgresql start`
  - Mac: `brew services start postgresql`

### Project Files
- [ ] `.env` file created with:
  - [ ] DATABASE_URL set
  - [ ] JWT_SECRET set (32+ characters)
  - [ ] STRIPE_SECRET_KEY set (from https://dashboard.stripe.com)
  - [ ] STRIPE_PUBLIC_KEY set
  - [ ] STRIPE_WEBHOOK_SECRET set

- [ ] `package.json` includes Stripe dependency
- [ ] `uploads/` directory exists (will be created if missing)
- [ ] All new files created:
  - [ ] `signup-new.html`
  - [ ] `login-new.html`
  - [ ] `job-seeker-dashboard.html`
  - [ ] `employer-dashboard.html`
  - [ ] `database/schema.sql` (updated with new tables)

### Database Setup
```bash
# Run these commands

# 1. Create database
createdb cvhive

# 2. Initialize schema
psql -U postgres -d cvhive -f database/schema.sql

# 3. (Optional) Seed sample data
psql -U postgres -d cvhive -f database/seed.sql

# Or use the setup script
node setup-db.js
```

- [ ] Database created
- [ ] Schema migrations applied
- [ ] Sample data loaded (optional)

### Verify Database Connection

```bash
# Connect to database and test
psql -U postgres -d cvhive -c "SELECT COUNT(*) FROM users;"

# Should return: count | 0
```

- [ ] Database connection successful
- [ ] New tables exist

### Node Dependencies
```bash
# Install dependencies
npm install

# Verify stripe package added
npm list stripe
```

- [ ] Dependencies installed
- [ ] No critical vulnerabilities (`npm audit`)

## 🚀 Startup

### Start Development Server
```bash
npm run dev
```

- [ ] Server started without errors
- [ ] Console shows: "🚀 CVhive listening on port 3001"
- [ ] Database health check passes

### Health Check
```bash
# In another terminal, test the server
curl http://localhost:3001/health

# Should respond with:
# {
#   "status": "ok",
#   "service": "CVhive-api",
#   "version": "1.0.0",
#   "db": "connected"
# }
```

- [ ] Health endpoint responds
- [ ] Database connection confirmed
- [ ] All services functional

## 🧪 Feature Testing

### Test Job Seeker Registration
```
1. Go to http://localhost:3001/signup
2. Select "Job Seeker" role
3. Enter:
   - First Name: John
   - Last Name: Doe
   - Email: seeker@test.com
   - Password: TestPassword123
4. Check GDPR box
5. Click "Create Account"
```

- [ ] Account created successfully
- [ ] Redirected to job-seeker-dashboard
- [ ] Token stored in localStorage

### Test Job Seeker CV Upload
```
1. On dashboard, upload a test PDF
2. Verify CV appears in list
3. Check download count shows 0
```

- [ ] CV uploaded successfully
- [ ] File appears in uploads/ directory
- [ ] CV visible in dashboard

### Test Employer Registration
```
1. Go to http://localhost:3001/signup
2. Select "Employer" role
3. Enter:
   - First Name: Jane
   - Last Name: Smith
   - Email: employer@test.com
   - Password: TestPassword123
   - Company Name: Test Corp
4. Check GDPR box
5. Click "Create Account"
```

- [ ] Employer account created
- [ ] Redirected to employer-dashboard
- [ ] Profile linked to company

### Test Employer CV Browsing
```
1. On employer dashboard
2. Verify can see available CVs
3. Without payment: should see "No Active Access" message
4. Click purchase button (will fail without real Stripe keys)
```

- [ ] CV list visible
- [ ] Payment status shown
- [ ] Packages displayed

### Test Login
```
1. Go to http://localhost:3001/login
2. Enter job seeker credentials
3. Verify redirected to job-seeker-dashboard
4. Logout and test employer
5. Verify redirected to employer-dashboard
```

- [ ] Both role logins work
- [ ] Correct dashboard shown per role
- [ ] Logout clears token

## 📊 Database Verification

Check that all tables were created:

```bash
psql -U postgres -d cvhive -c "
  SELECT table_name 
  FROM information_schema.tables 
  WHERE table_schema = 'public'
  ORDER BY table_name;
"
```

Should include:
- [ ] users
- [ ] job_seeker_profiles
- [ ] employer_profiles
- [ ] job_seeker_cvs
- [ ] cv_access_payments
- [ ] cv_view_logs
- [ ] (+ existing agency tables if keeping backward compatibility)

## 🔧 Troubleshooting

### Server won't start
```bash
# Check port availability
netstat -ano | findstr :3001

# Verify environment variables
echo %DATABASE_URL%  # Windows
echo $DATABASE_URL  # Linux/Mac

# Check logs for errors
npm run dev 2>&1 | head -50
```

### Database connection fails
```bash
# Verify PostgreSQL is running
psql -U postgres -c "SELECT 1"

# Check connection string
psql 'postgresql://postgres:postgres@localhost:5432/cvhive'

# Verify database exists
psql -U postgres -c "SELECT datname FROM pg_database WHERE datname='cvhive';"
```

### Stripe errors
```bash
# Verify Stripe keys are set
grep STRIPE .env

# Test Stripe key format (should start with pk_test_ or sk_test_)
# For production: pk_live_ or sk_live_
```

### CSV upload fails
```bash
# Verify uploads directory exists
ls -la uploads/  # Linux/Mac
dir uploads/     # Windows

# Check file permissions
chmod 755 uploads/  # Linux/Mac
# Windows: Right-click → Properties → Security → Edit
```

## 📝 Verification Checklist Summary

| Item | Status | Notes |
|------|--------|-------|
| PostgreSQL running | ⏳ | |
| Database created | ⏳ | |
| Schema applied | ⏳ | |
| npm dependencies installed | ⏳ | |
| .env configured | ⏳ | |
| Server starts | ⏳ | |
| Health endpoint works | ⏳ | |
| Job seeker signup works | ⏳ | |
| Employer signup works | ⏳ | |
| CV upload works | ⏳ | |
| CV download works | ⏳ | |
| Login/logout works | ⏳ | |

## 🎉 You're Ready!

Once all checks pass, your CVhive deployment is ready for:
- Job seekers to upload and manage CVs
- Employers to browse and purchase CV access
- Stripe payments to process
- Real business operations!

For issues, check SETUP_GUIDE.md or contact support@cvhive.com
