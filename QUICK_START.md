# CVhive 2.0 - Quick Start Guide

Get your CVhive platform running in 5 minutes! 🚀

## Prerequisites Installed?
- [ ] Node.js 18+ (`node --version`)
- [ ] PostgreSQL 15+ (`psql --version`)

If not, install them first.

## 5-Minute Setup

### Step 1: Start PostgreSQL (1 min)
```bash
# Windows
net start PostgreSQL-x64-15

# Mac (Homebrew)
brew services start postgresql

# Linux
sudo service postgresql start
```

### Step 2: Create Database (1 min)
```bash
# Create the database
createdb cvhive
```

### Step 3: Initialize Project (2 min)
```bash
cd c:/CVhive/CVhive

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Initialize database schema
node setup-db.js
```

### Step 4: Start Server (1 min)
```bash
npm run dev
```

You should see:
```
🚀 CVhive listening on port 3001
✅ Database connected
```

## Next: Test the Platform

### Test as Job Seeker
1. Open: http://localhost:3001/signup
2. Select "Job Seeker"
3. Sign up with: 
   - Email: seeker@test.com
   - Password: Test12345678
4. Upload a PDF (any file)
5. ✅ You're done!

### Test as Employer
1. Open new incognito window
2. Go to: http://localhost:3001/signup
3. Select "Employer"
4. Sign up with:
   - Email: employer@test.com
   - Password: Test12345678
   - Company: Test Company
5. See dashboard → You need to purchase access
6. ✅ System working!

## What's Working Now

✅ **Job Seekers Can**:
- Create free account
- Upload CVs (PDF, DOC, DOCX)
- Manage their CVs
- See download count

✅ **Employers Can**:
- Create paid account
- Browse all available CVs
- Purchase access packages
- Download CVs

✅ **Payments**:
- Stripe integration ready
- Need real Stripe keys for live payments
- Test mode works with test card: `4242 4242 4242 4242`

## What to Do Next

### For Testing
1. Follow STARTUP_CHECKLIST.md
2. Test all features
3. Check database directly:
   ```bash
   psql -U postgres -d cvhive -c "SELECT * FROM users;"
   ```

### For Stripe Setup (Optional - for real payments)
1. Go to https://stripe.com and create account
2. Get API keys from Dashboard
3. Update `.env`:
   ```
   STRIPE_PUBLIC_KEY=pk_test_xxx
   STRIPE_SECRET_KEY=sk_test_xxx
   ```
4. Payment processing will then work

### For Production Deployment
1. Read: SETUP_GUIDE.md
2. Deploy database to managed PostgreSQL
3. Deploy server to Railway, Render, or AWS
4. Get live Stripe keys
5. Enable HTTPS

## Troubleshooting

**Port 3001 already in use?**
```bash
# Change port in .env
PORT=3002
```

**Database won't start?**
```bash
# Verify PostgreSQL is running
psql -U postgres -c "SELECT 1"

# If error, restart PostgreSQL
net stop PostgreSQL-x64-15
net start PostgreSQL-x64-15
```

**Can't create account?**
```bash
# Check server is running
curl http://localhost:3001/health

# Check .env file exists and has DATABASE_URL
cat .env
```

## File Locations

- 📁 Main server: `server.js`
- 📁 Database: `database/schema.sql`
- 📁 Config: `.env`
- 📁 UI: `*.html` files
- 📁 CVs uploaded: `uploads/` directory

## Important Files to Check

- ✅ `IMPLEMENTATION_SUMMARY.md` - What was built
- ✅ `SETUP_GUIDE.md` - Detailed setup
- ✅ `STARTUP_CHECKLIST.md` - Pre-startup verification
- ✅ `README.md` - Full documentation

## Commands Cheat Sheet

```bash
# Start server
npm run dev

# Stop server
Ctrl + C

# Create database
createdb cvhive

# Connect to database
psql -U postgres -d cvhive

# Run migrations
node setup-db.js

# Install npm packages
npm install

# Check health
curl http://localhost:3001/health

# View logs
npm run dev 2>&1 | grep -i error
```

## Pages Reference

| What | URL |
|------|-----|
| Home | http://localhost:3001/ |
| Sign Up | http://localhost:3001/signup |
| Login | http://localhost:3001/login |
| Job Seeker Dashboard | http://localhost:3001/job-seeker-dashboard |
| Employer Dashboard | http://localhost:3001/employer-dashboard |

## Feature Matrix

| Feature | Job Seeker | Employer |
|---------|-----------|----------|
| Free Account | ✅ | ❌ |
| Upload CVs | ✅ | ❌ |
| View CVs | ❌ | ✅ (with payment) |
| Download CVs | ❌ | ✅ (with payment) |
| Pay for Access | ❌ | ✅ |
| See Download Count | ✅ | ❌ |
| Manage Profile | ✅ | ✅ |

## Need Help?

1. **Can't login?** → Check credentials, make sure account was created
2. **Upload fails?** → Check file is PDF/DOC/DOCX and <10MB
3. **Payment errors?** → Use test card 4242 4242 4242 4242
4. **Database errors?** → Make sure PostgreSQL is running
5. **Port conflicts?** → Change PORT in .env file

## Success Indicators ✅

If you see these, everything is working:

- [ ] Server starts without errors
- [ ] Can visit http://localhost:3001 in browser
- [ ] Can create job seeker account
- [ ] Can upload CV successfully
- [ ] Can create employer account
- [ ] Can see available CVs on employer dashboard
- [ ] Can see "No Active Access" message for employer
- [ ] Database shows 2 users after test signup

## What's Next?

After testing locally:

1. **Deploy Test**: Push to Heroku/Railway/AWS
2. **Real Stripe**: Get live keys from Stripe
3. **Production DB**: Use managed PostgreSQL
4. **Email Setup**: Configure SendGrid
5. **Go Live**: Launch to users!

---

**Questions?** Check the detailed docs:
- SETUP_GUIDE.md (Complete setup)
- README.md (Full features)
- IMPLEMENTATION_SUMMARY.md (What was built)

**Ready to test?** Start with Step 1 above! 🚀
