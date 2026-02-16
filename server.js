'use strict';

// ============================================================
// CVhive API Server
// Node.js 18+ / Express 4
// ============================================================

const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const compression  = require('compression');
const { Pool }     = require('pg');
const bcrypt       = require('bcrypt');
const crypto       = require('crypto');
const jwt          = require('jsonwebtoken');
const multer       = require('multer');
const rateLimit    = require('express-rate-limit');
const { v4: uuid } = require('uuid');
const path         = require('path');
const fs           = require('fs');
const nodemailer   = require('nodemailer');
const stripe       = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_fake_key');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3001;

// ============================================================
// DATABASE
// ============================================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL ||
        'postgresql://postgres:postgres@localhost:5432/CVhive',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
    console.error('Unexpected DB error', err);
});

// ============================================================
// CACHE — in-memory by default, Redis if available
// ============================================================
// Works perfectly with no Redis installed.
// To enable Redis, set REDIS_URL=redis://localhost:6379 in .env
// The server will try Redis once on startup; if it fails it
// silently falls back to the in-memory store — no errors, no crashes.
// ============================================================

// In-memory store: { key -> { value, expiresAt } }
const memCache = new Map();

// Clean up expired entries every 2 minutes
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of memCache) {
        if (v.expiresAt && v.expiresAt < now) memCache.delete(k);
    }
}, 120_000);

let redisClient = null;

// Attempt Redis connection only if REDIS_URL is explicitly set
if (process.env.REDIS_URL) {
    (async () => {
        try {
            const Redis = require('ioredis');
            redisClient = new Redis(process.env.REDIS_URL, {
                lazyConnect:          true,
                enableOfflineQueue:   false,
                connectTimeout:       2000,
                maxRetriesPerRequest: 1,
            });
            redisClient.on('ready', () => console.log('✅ Redis connected'));
            redisClient.on('error', () => {
                console.warn('⚠️  Redis unavailable — using in-memory cache');
                redisClient = null;
            });
            await redisClient.connect().catch(() => { redisClient = null; });
        } catch {
            redisClient = null;
        }
    })();
} else {
    console.log('ℹ️  Redis not configured — using in-memory cache (fine for local dev)');
}

async function cacheGet(key) {
    // Try Redis first
    if (redisClient) {
        try { return await redisClient.get(key); } catch { redisClient = null; }
    }
    // Fall back to memory
    const entry = memCache.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt < Date.now()) { memCache.delete(key); return null; }
    return entry.value;
}

async function cacheSet(key, value, ttlSeconds = 300) {
    const serialised = typeof value === 'string' ? value : JSON.stringify(value);
    // Try Redis first
    if (redisClient) {
        try { await redisClient.setex(key, ttlSeconds, serialised); return; } catch { redisClient = null; }
    }
    // Fall back to memory
    memCache.set(key, {
        value:     serialised,
        expiresAt: Date.now() + ttlSeconds * 1000,
    });
}

async function cacheDel(key) {
    if (redisClient) { try { await redisClient.del(key); } catch { redisClient = null; } }
    memCache.delete(key);
}

// ============================================================
// EMAIL SERVICE
// ============================================================
const emailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'localhost',
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: process.env.SMTP_USER ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    } : undefined,
});

async function sendEmail(to, subject, html) {
    try {
        await emailTransporter.sendMail({
            from: process.env.EMAIL_FROM || 'noreply@cvhive.com',
            to,
            subject,
            html,
        });
        return true;
    } catch (err) {
        console.error('Email send error:', err);
        return false;
    }
}

// ============================================================
// FILE UPLOAD (CV storage – local in dev, S3 in prod)
// ============================================================
const upload = multer({
    storage: multer.diskStorage({
        destination: './uploads/',
        filename: (req, file, cb) => cb(null, `${uuid()}-${file.originalname}`),
    }),
    limits: { fileSize: 10 * 1024 * 1024 },  // 10 MB
    fileFilter: (req, file, cb) => {
        const allowed = ['application/pdf', 'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        cb(null, allowed.includes(file.mimetype));
    },
});

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(helmet());
app.use(cors({
    origin:      process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
}));
app.use(compression());
app.use(express.static(__dirname));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logger
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
});

// Serve the main HTML file at root
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/CVhive.html');
});

// Serve login page (new user system)
app.get('/login', (req, res) => {
    res.sendFile(__dirname + '/login-new.html');
});

// Serve signup page (new user system)
app.get('/signup', (req, res) => {
    res.sendFile(__dirname + '/signup-new.html');
});

// Serve job seeker dashboard
app.get('/job-seeker-dashboard', (req, res) => {
    res.sendFile(__dirname + '/job-seeker-dashboard.html');
});

// Serve employer dashboard
app.get('/employer-dashboard', (req, res) => {
    res.sendFile(__dirname + '/employer-dashboard.html');
});

// Serve password reset page
app.get('/reset-password', (req, res) => {
    res.sendFile(__dirname + '/reset-password.html');
});

// Serve forgot password page
app.get('/forgot-password', (req, res) => {
    res.sendFile(__dirname + '/forgot-password.html');
});

// Serve dashboard
app.get('/dashboard', (req, res) => {
    res.sendFile(__dirname + '/dashboard.html');
});

// ============================================================
// RATE LIMITING
// ============================================================
const TIER_LIMITS = {
    starter:      { cv_views: 50,     searches: 100,    job_posts: 3 },
    professional: { cv_views: 500,    searches: 2000,   job_posts: 20 },
    agency:       { cv_views: 1000, searches: 5000, job_posts: 100 },
};

const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    message: { success: false, error: 'Too many requests' },
});
app.use(globalLimiter);

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { success: false, error: 'Too many auth attempts' },
});

// ============================================================
// AUTH MIDDLEWARE
// ============================================================
const authenticate = async (req, res, next) => {
    try {
        const auth = req.headers.authorization;
        if (!auth?.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'No token provided' });
        }
        const token   = auth.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
};

// Check subscription quota before billing actions
const checkQuota = (resource) => async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT subscription_tier FROM agencies WHERE id = $1 AND deleted_at IS NULL`,
            [req.user.agency_id]
        );
        if (!rows.length) return res.status(403).json({ success: false, error: 'Agency not found' });

        const tier  = rows[0].subscription_tier || 'starter';
        const limit = TIER_LIMITS[tier]?.[resource] ?? 0;

        const { rows: usage } = await pool.query(
            `SELECT COUNT(*) AS count FROM activity_logs
             WHERE agency_id = $1 AND action = $2
               AND created_at > NOW() - INTERVAL '30 days'`,
            [req.user.agency_id, resource]
        );

        if (parseInt(usage[0].count) >= limit) {
            return res.status(429).json({
                success: false,
                error:   `Monthly ${resource} limit reached for ${tier} plan`,
                upgrade_required: true,
                current_usage: parseInt(usage[0].count),
                limit,
            });
        }
        next();
    } catch (err) {
        next(err);
    }
};

// ============================================================
// HELPERS
// ============================================================
const logActivity = (agencyId, userId, action, entityType, entityId, meta = {}) =>
    pool.query(
        `INSERT INTO activity_logs
             (agency_id, user_id, user_type, action, entity_type, entity_id, metadata, created_at)
         VALUES ($1, $2, 'agency_user', $3, $4, $5, $6, NOW())`,
        [agencyId, userId, action, entityType, entityId, JSON.stringify(meta)]
    ).catch(console.error);

// ============================================================
// ── HEALTH ──
// ============================================================
app.get('/health', async (req, res) => {
    let dbOk = false;
    try { await pool.query('SELECT 1'); dbOk = true; } catch {}
    res.json({
        status:    dbOk ? 'ok' : 'degraded',
        service:   'CVhive-api',
        version:   '1.0.0',
        timestamp: new Date().toISOString(),
        db:        dbOk ? 'connected' : 'error',
    });
});

// ============================================================
// ── AUTH ROUTES ──
// ============================================================

// POST /v1/auth/register
app.post('/v1/auth/register', authLimiter, async (req, res) => {
    try {
        const {
            company_name, email, password, phone,
            trade_license_number, emirate, gdpr_consent,
        } = req.body;

        if (!company_name || !email || !password) {
            return res.status(400).json({ success: false, error: 'company_name, email, password required' });
        }
        if (!gdpr_consent) {
            return res.status(400).json({ success: false, error: 'GDPR consent required' });
        }

        const existing = await pool.query('SELECT id FROM agencies WHERE email = $1', [email]);
        if (existing.rows.length) {
            return res.status(409).json({ success: false, error: 'Email already registered' });
        }

        const hash = await bcrypt.hash(password, 12);

        const { rows } = await pool.query(
            `INSERT INTO agencies
                 (company_name, email, password_hash, phone, trade_license_number,
                  emirate, gdpr_consent, gdpr_consent_date,
                  subscription_tier, subscription_status, trial_ends_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),'starter','trial', NOW() + INTERVAL '14 days')
             RETURNING id, company_name, email, subscription_tier, subscription_status, trial_ends_at`,
            [company_name, email, hash, phone, trade_license_number, emirate, gdpr_consent]
        );

        const agency = rows[0];
        const token  = jwt.sign(
            { agency_id: agency.id, email: agency.email, tier: agency.subscription_tier },
            process.env.JWT_SECRET || 'dev-secret',
            { expiresIn: '7d' }
        );

        res.status(201).json({
            success: true,
            data: {
                agency_id:   agency.id,
                company_name: agency.company_name,
                subscription: {
                    tier:          agency.subscription_tier,
                    status:        agency.subscription_status,
                    trial_ends_at: agency.trial_ends_at,
                },
                token,
            },
        });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ success: false, error: 'Registration failed' });
    }
});

// POST /v1/auth/login
app.post('/v1/auth/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'email and password required' });
        }

        const { rows } = await pool.query(
            `SELECT id, company_name, email, password_hash,
                    subscription_tier, subscription_status, trial_ends_at
             FROM agencies WHERE email = $1 AND deleted_at IS NULL`,
            [email]
        );

        if (!rows.length || !(await bcrypt.compare(password, rows[0].password_hash))) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        const agency = rows[0];
        await pool.query('UPDATE agencies SET last_login_at = NOW() WHERE id = $1', [agency.id]);

        const token = jwt.sign(
            { agency_id: agency.id, email: agency.email, tier: agency.subscription_tier },
            process.env.JWT_SECRET || 'dev-secret',
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            data: {
                agency_id:    agency.id,
                company_name: agency.company_name,
                subscription: {
                    tier:          agency.subscription_tier,
                    status:        agency.subscription_status,
                    trial_ends_at: agency.trial_ends_at,
                },
                token,
            },
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, error: 'Login failed' });
    }
});

// GET /v1/auth/me
app.get('/v1/auth/me', authenticate, async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, company_name, email, phone, city, emirate,
                    subscription_tier, subscription_status, trial_ends_at,
                    emiratisation_target, emiratisation_current,
                    cv_views_this_month, searches_this_month
             FROM agencies WHERE id = $1 AND deleted_at IS NULL`,
            [req.user.agency_id]
        );
        if (!rows.length) return res.status(404).json({ success: false, error: 'Agency not found' });
        res.json({ success: true, data: rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to fetch profile' });
    }
});

// POST /v1/auth/forgot-password - Request password reset
app.post('/v1/auth/forgot-password', authLimiter, async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, error: 'Email required' });

        const { rows } = await pool.query(
            'SELECT id, company_name FROM agencies WHERE email = $1 AND deleted_at IS NULL',
            [email]
        );

        if (!rows.length) {
            return res.status(404).json({ success: false, error: 'Email not found' });
        }

        const agency = rows[0];
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenHash = await bcrypt.hash(resetToken, 10);
        const resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await pool.query(
            'UPDATE agencies SET password_reset_token = $1, password_reset_expires = $2 WHERE id = $3',
            [resetTokenHash, resetTokenExpires, agency.id]
        );

        const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}&email=${email}`;
        const htmlEmail = `
            <h2>Password Reset Request</h2>
            <p>Hi ${agency.company_name},</p>
            <p>You requested to reset your password. Click the link below:</p>
            <p><a href="${resetLink}" style="background: #1a56db; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a></p>
            <p>This link expires in 1 hour.</p>
            <p>If you didn't request this, ignore this email.</p>
        `;

        await sendEmail(email, 'CVhive - Password Reset Request', htmlEmail);
        res.json({ success: true, message: 'Password reset link sent to your email' });
    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ success: false, error: 'Failed to process request' });
    }
});

// POST /v1/auth/reset-password - Reset password with token
app.post('/v1/auth/reset-password', async (req, res) => {
    try {
        const { email, token, newPassword } = req.body;
        if (!email || !token || !newPassword) {
            return res.status(400).json({ success: false, error: 'Email, token, and new password required' });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
        }

        const { rows } = await pool.query(
            'SELECT id, password_reset_token, password_reset_expires FROM agencies WHERE email = $1 AND deleted_at IS NULL',
            [email]
        );

        if (!rows.length || !rows[0].password_reset_token) {
            return res.status(400).json({ success: false, error: 'Invalid or expired reset token' });
        }

        const agency = rows[0];
        const isTokenValid = await bcrypt.compare(token, agency.password_reset_token);
        const isTokenExpired = new Date() > agency.password_reset_expires;

        if (!isTokenValid || isTokenExpired) {
            return res.status(400).json({ success: false, error: 'Invalid or expired reset token' });
        }

        const newHash = await bcrypt.hash(newPassword, 12);
        await pool.query(
            'UPDATE agencies SET password_hash = $1, password_reset_token = NULL, password_reset_expires = NULL WHERE id = $2',
            [newHash, agency.id]
        );

        res.json({ success: true, message: 'Password reset successfully' });
    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ success: false, error: 'Failed to reset password' });
    }
});

// ============================================================
// ── NEW USER AUTH ROUTES (Job Seekers & Employers) ──
// ============================================================

// POST /v1/users/signup - Create new user account
app.post('/v1/users/signup', authLimiter, async (req, res) => {
    try {
        const { email, password, firstName, lastName, role, gdprConsent } = req.body;

        if (!email || !password || !role || !gdprConsent) {
            return res.status(400).json({ 
                success: false, 
                error: 'email, password, role, and gdprConsent required' 
            });
        }

        if (!['job_seeker', 'employer'].includes(role)) {
            return res.status(400).json({ 
                success: false, 
                error: 'role must be job_seeker or employer' 
            });
        }

        if (password.length < 8) {
            return res.status(400).json({ 
                success: false, 
                error: 'Password must be at least 8 characters' 
            });
        }

        // Check if email already exists
        const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existing.rows.length) {
            return res.status(409).json({ success: false, error: 'Email already registered' });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        
        // Create user
        const { rows } = await pool.query(
            `INSERT INTO users (email, password_hash, role, first_name, last_name, gdpr_consent, gdpr_consent_date)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             RETURNING id, email, role, first_name, last_name`,
            [email, passwordHash, role, firstName || '', lastName || '', gdprConsent]
        );

        const user = rows[0];

        // Create profile based on role
        if (role === 'job_seeker') {
            await pool.query(
                `INSERT INTO job_seeker_profiles (user_id) VALUES ($1)`,
                [user.id]
            );
        } else if (role === 'employer') {
            const { companyName } = req.body;
            await pool.query(
                `INSERT INTO employer_profiles (user_id, company_name) VALUES ($1, $2)`,
                [user.id, companyName || firstName + ' ' + lastName]
            );
        }

        const token = jwt.sign(
            { user_id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET || 'dev-secret',
            { expiresIn: '30d' }
        );

        res.status(201).json({
            success: true,
            data: {
                user_id: user.id,
                email: user.email,
                role: user.role,
                token,
            },
        });
    } catch (err) {
        console.error('Signup error:', err);
        res.status(500).json({ success: false, error: 'Signup failed' });
    }
});

// POST /v1/users/login - User login
app.post('/v1/users/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email and password required' });
        }

        const { rows } = await pool.query(
            'SELECT id, email, role, password_hash, first_name, last_name FROM users WHERE email = $1 AND is_deleted = FALSE',
            [email]
        );

        if (!rows.length) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        const user = rows[0];
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);

        if (!isPasswordValid) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        // Update last login
        await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

        const token = jwt.sign(
            { user_id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET || 'dev-secret',
            { expiresIn: '30d' }
        );

        res.json({
            success: true,
            data: {
                user_id: user.id,
                email: user.email,
                role: user.role,
                name: `${user.first_name} ${user.last_name}`.trim(),
                token,
            },
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, error: 'Login failed' });
    }
});

// Middleware to authenticate users (handles both user_id and agency_id)
const authenticateUser = async (req, res, next) => {
    try {
        const auth = req.headers.authorization;
        if (!auth?.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'No token provided' });
        }
        const token = auth.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
};

// GET /v1/users/profile - Get user profile
app.get('/v1/users/profile', authenticateUser, async (req, res) => {
    try {
        const { rows: userRows } = await pool.query(
            'SELECT id, email, role, first_name, last_name, phone, created_at FROM users WHERE id = $1 AND is_deleted = FALSE',
            [req.user.user_id]
        );

        if (!userRows.length) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const user = userRows[0];
        let profile = {};

        if (user.role === 'job_seeker') {
            const { rows: profileRows } = await pool.query(
                'SELECT * FROM job_seeker_profiles WHERE user_id = $1',
                [req.user.user_id]
            );
            profile = profileRows[0] || {};
        } else if (user.role === 'employer') {
            const { rows: profileRows } = await pool.query(
                'SELECT * FROM employer_profiles WHERE user_id = $1',
                [req.user.user_id]
            );
            profile = profileRows[0] || {};
        }

        res.json({ success: true, data: { ...user, profile } });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to fetch profile' });
    }
});

// PUT /v1/users/profile - Update user profile (including location)
app.put('/v1/users/profile', authenticateUser, async (req, res) => {
    try {
        if (req.user.role !== 'job_seeker') {
            return res.status(403).json({ success: false, error: 'Only job seekers can update profile' });
        }

        const { headline, bio, location, phone, years_experience, highest_education } = req.body;

        // Update base user info
        if (phone) {
            await pool.query(
                'UPDATE users SET phone = $1 WHERE id = $2',
                [phone, req.user.user_id]
            );
        }

        // Update job seeker profile
        const { rows } = await pool.query(
            `UPDATE job_seeker_profiles 
             SET headline = COALESCE($1, headline),
                 bio = COALESCE($2, bio),
                 location = COALESCE($3, location),
                 years_experience = COALESCE($4, years_experience),
                 highest_education = COALESCE($5, highest_education),
                 updated_at = NOW()
             WHERE user_id = $6
             RETURNING *`,
            [headline || null, bio || null, location || null, years_experience || null, highest_education || null, req.user.user_id]
        );

        res.json({ success: true, data: rows[0], message: 'Profile updated successfully' });
    } catch (err) {
        console.error('Profile update error:', err);
        res.status(500).json({ success: false, error: 'Failed to update profile' });
    }
});

// POST /v1/users/profile-picture - Upload profile picture
app.post('/v1/users/profile-picture', authenticateUser, upload.single('picture'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        const pictureUrl = `/uploads/${req.file.filename}`;

        // Update user profile picture
        const { rows } = await pool.query(
            'UPDATE users SET profile_picture_url = $1 WHERE id = $2 RETURNING profile_picture_url',
            [pictureUrl, req.user.user_id]
        );

        res.status(201).json({
            success: true,
            data: { profile_picture_url: rows[0].profile_picture_url },
            message: 'Profile picture uploaded successfully'
        });
    } catch (err) {
        console.error('Picture upload error:', err);
        res.status(500).json({ success: false, error: 'Failed to upload picture' });
    }
});

// GET /v1/locations - Get available job locations
app.get('/v1/locations', async (req, res) => {
    try {
        const locations = [
            { city: 'Dubai', emirate: 'Dubai', jobs_count: 0 },
            { city: 'Abu Dhabi', emirate: 'Abu Dhabi', jobs_count: 0 },
            { city: 'Sharjah', emirate: 'Sharjah', jobs_count: 0 },
            { city: 'Ajman', emirate: 'Ajman', jobs_count: 0 },
            { city: 'Ras Al Khaimah', emirate: 'Ras Al Khaimah', jobs_count: 0 },
            { city: 'Fujairah', emirate: 'Fujairah', jobs_count: 0 },
            { city: 'Umm Al Quwain', emirate: 'Umm Al Quwain', jobs_count: 0 },
        ];

        res.json({ success: true, data: locations });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to fetch locations' });
    }
});

// ============================================================
// ── CV UPLOAD ROUTES ──
// ============================================================

// POST /v1/cv/upload - Upload CV
app.post('/v1/cv/upload', authenticateUser, upload.single('cv'), async (req, res) => {
    try {
        // Only job seekers can upload CVs
        if (req.user.role !== 'job_seeker') {
            return res.status(403).json({ success: false, error: 'Only job seekers can upload CVs' });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        const { rows } = await pool.query(
            `INSERT INTO job_seeker_cvs (user_id, filename, file_path, file_size, mime_type, is_primary)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, filename, file_size, created_at`,
            [req.user.user_id, req.file.originalname, req.file.path, req.file.size, req.file.mimetype, false]
        );

        res.status(201).json({
            success: true,
            data: rows[0],
            message: 'CV uploaded successfully'
        });
    } catch (err) {
        console.error('CV upload error:', err);
        res.status(500).json({ success: false, error: 'Failed to upload CV' });
    }
});

// GET /v1/cvs/my - Get current user's CVs
app.get('/v1/cvs/my', authenticateUser, async (req, res) => {
    try {
        if (req.user.role !== 'job_seeker') {
            return res.status(403).json({ success: false, error: 'Only job seekers can manage CVs' });
        }

        const { rows } = await pool.query(
            `SELECT id, filename, file_size, is_primary, download_count, created_at, updated_at
             FROM job_seeker_cvs
             WHERE user_id = $1 AND is_deleted = FALSE
             ORDER BY is_primary DESC, created_at DESC`,
            [req.user.user_id]
        );

        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to fetch CVs' });
    }
});

// GET /v1/cvs/available - List available CVs for employers (with location filter)
app.get('/v1/cvs/available', authenticateUser, async (req, res) => {
    try {
        if (req.user.role !== 'employer') {
            return res.status(403).json({ success: false, error: 'Only employers can view CVs' });
        }

        // Check if employer has active payment
        const { rows: paymentRows } = await pool.query(
            `SELECT id, cv_view_limit, cv_views_used, expires_at 
             FROM cv_access_payments 
             WHERE employer_id = $1 AND status = 'completed' 
             AND (expires_at IS NULL OR expires_at > NOW())
             LIMIT 1`,
            [req.user.user_id]
        );

        if (!paymentRows.length) {
            return res.status(403).json({ 
                success: false, 
                error: 'No active CV access. Please purchase a package to view CVs.' 
            });
        }

        const payment = paymentRows[0];

        // Check if CV view limit reached
        if (payment.cv_view_limit && payment.cv_views_used >= payment.cv_view_limit) {
            return res.status(403).json({ 
                success: false, 
                error: 'CV view limit reached. Upgrade your package to view more.' 
            });
        }

        const { page = 1, limit = 20, location = '', search = '' } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        // Build query with optional location filter
        let whereClause = 'c.is_deleted = FALSE';
        const params = [];
        let paramCount = 1;

        if (location) {
            whereClause += ` AND p.location ILIKE $${paramCount}`;
            params.push(`%${location}%`);
            paramCount++;
        }

        if (search) {
            whereClause += ` AND (u.first_name ILIKE $${paramCount} OR u.last_name ILIKE $${paramCount} OR p.headline ILIKE $${paramCount})`;
            params.push(`%${search}%`);
            paramCount++;
        }

        params.push(parseInt(limit));
        params.push(offset);

        // Get available CVs
        const { rows } = await pool.query(
            `SELECT 
                c.id, c.filename, c.created_at, c.download_count,
                u.id as job_seeker_id, u.first_name, u.last_name, u.email, u.profile_picture_url,
                p.headline, p.years_experience, p.location, p.skills
             FROM job_seeker_cvs c
             JOIN users u ON c.user_id = u.id
             LEFT JOIN job_seeker_profiles p ON u.id = p.user_id
             WHERE ${whereClause}
             ORDER BY c.created_at DESC
             LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
            [...params]
        );

        res.json({ 
            success: true, 
            data: rows,
            access: {
                cv_view_limit: payment.cv_view_limit,
                cv_views_used: payment.cv_views_used,
                expires_at: payment.expires_at
            }
        });
    } catch (err) {
        console.error('Error:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch CVs' });
    }
});

// GET /v1/cvs/:id - View/Download a CV (with payment verification)
app.get('/v1/cvs/:id', authenticateUser, async (req, res) => {
    try {
        if (req.user.role !== 'employer') {
            return res.status(403).json({ success: false, error: 'Only employers can view CVs' });
        }

        const { rows: cvRows } = await pool.query(
            'SELECT * FROM job_seeker_cvs WHERE id = $1 AND is_deleted = FALSE',
            [req.params.id]
        );

        if (!cvRows.length) {
            return res.status(404).json({ success: false, error: 'CV not found' });
        }

        const cv = cvRows[0];

        // Check payment
        const { rows: paymentRows } = await pool.query(
            `SELECT id, cv_view_limit, cv_views_used, expires_at 
             FROM cv_access_payments 
             WHERE employer_id = $1 AND status = 'completed' 
             AND (expires_at IS NULL OR expires_at > NOW())
             LIMIT 1`,
            [req.user.user_id]
        );

        if (!paymentRows.length) {
            return res.status(403).json({ success: false, error: 'No active CV access' });
        }

        const payment = paymentRows[0];

        if (payment.cv_view_limit && payment.cv_views_used >= payment.cv_view_limit) {
            return res.status(403).json({ success: false, error: 'CV view limit reached' });
        }

        // Log the view
        await pool.query(
            `INSERT INTO cv_view_logs (job_seeker_id, employer_id, cv_id, payment_id)
             VALUES ($1, $2, $3, $4)`,
            [cv.user_id, req.user.user_id, cv.id, payment.id]
        );

        // Increment view count and payment usage
        await pool.query(
            'UPDATE job_seeker_cvs SET download_count = download_count + 1, last_downloaded_at = NOW() WHERE id = $1',
            [req.params.id]
        );
        
        if (payment.cv_view_limit) {
            await pool.query(
                'UPDATE cv_access_payments SET cv_views_used = cv_views_used + 1 WHERE id = $1',
                [payment.id]
            );
        }

        // Download the file
        const filepath = path.join(__dirname, cv.file_path);
        res.download(filepath, cv.filename);
    } catch (err) {
        console.error('CV download error:', err);
        res.status(500).json({ success: false, error: 'Failed to download CV' });
    }
});



// DELETE /v1/cv/:id - Delete CV
app.delete('/v1/cv/:id', authenticate, async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT stored_filename FROM candidate_cvs WHERE id = $1 AND deleted_at IS NULL`,
            [req.params.id]
        );

        if (!rows.length) {
            return res.status(404).json({ success: false, error: 'CV not found' });
        }

        const filepath = path.join(__dirname, 'uploads', rows[0].stored_filename);
        
        // Delete file from disk
        fs.unlink(filepath, (err) => {
            if (err) console.error('File delete error:', err);
        });

        // Soft delete from DB
        await pool.query(
            `UPDATE candidate_cvs SET deleted_at = NOW() WHERE id = $1`,
            [req.params.id]
        );

        res.json({ success: true, message: 'CV deleted' });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Delete failed' });
    }
});

// ============================================================
// ── PAYMENT ROUTES ──
// ============================================================

// GET /v1/payments/packages - Get available CV access packages
app.get('/v1/payments/packages', (req, res) => {
    res.json({
        success: true,
        data: [
            {
                id: 'monthly_access',
                name: 'Monthly Access',
                description: 'View unlimited CVs for 30 days',
                price: 99,
                currency: 'AED',
                cv_view_limit: null,
                duration_days: 30,
            },
            {
                id: 'one_time_unlimited',
                name: 'View All',
                description: 'Unlimited CV access for 7 days',
                price: 199,
                currency: 'AED',
                cv_view_limit: null,
                duration_days: 7,
            },
            {
                id: 'pay_per_cv',
                name: 'Single CV',
                description: 'View one CV',
                price: 19,
                currency: 'AED',
                cv_view_limit: 1,
                duration_days: null,
            },
        ]
    });
});

// POST /v1/payments/checkout-session - Create Stripe checkout session
app.post('/v1/payments/checkout-session', authenticateUser, async (req, res) => {
    try {
        if (req.user.role !== 'employer') {
            return res.status(403).json({ success: false, error: 'Only employers can make payments' });
        }

        const { packageId } = req.body;
        if (!packageId) {
            return res.status(400).json({ success: false, error: 'packageId required' });
        }

        const packages = {
            'monthly_access': { price: 9900, duration: 'Monthly Access' },
            'one_time_unlimited': { price: 19900, duration: '7-Day Unlimited' },
            'pay_per_cv': { price: 1900, duration: 'Single CV' },
        };

        const pkg = packages[packageId];
        if (!pkg) {
            return res.status(400).json({ success: false, error: 'Invalid package' });
        }

        // Get employer info
        const { rows } = await pool.query(
            'SELECT email, first_name, last_name FROM users WHERE id = $1',
            [req.user.user_id]
        );

        const user = rows[0];

        // Create Stripe checkout session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'aed',
                        product_data: {
                            name: `CVhive - ${pkg.duration}`,
                            description: 'Access to job seeker CVs',
                        },
                        unit_amount: pkg.price,
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-cancel`,
            customer_email: user.email,
            metadata: {
                user_id: req.user.user_id,
                package_id: packageId,
            },
        });

        // Store pending payment in DB
        await pool.query(
            `INSERT INTO cv_access_payments (employer_id, stripe_session_id, amount, status, package_type)
             VALUES ($1, $2, $3, $4, $5)`,
            [req.user.user_id, session.id, pkg.price / 100, 'pending', packageId]
        );

        res.json({
            success: true,
            data: {
                checkout_url: session.url,
                session_id: session.id,
            }
        });
    } catch (err) {
        console.error('Checkout session error:', err);
        res.status(500).json({ success: false, error: 'Failed to create checkout session' });
    }
});

// POST /v1/payments/webhook - Stripe webhook
app.post('/v1/payments/webhook', express.raw({type: 'application/json'}), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test';

    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).json({ success: false, error: 'Invalid signature' });
    }

    try {
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            const { user_id, package_id } = session.metadata;

            // Get payment record
            const { rows: paymentRows } = await pool.query(
                `SELECT id FROM cv_access_payments 
                 WHERE stripe_session_id = $1`,
                [session.id]
            );

            if (paymentRows.length) {
                const paymentId = paymentRows[0].id;

                // Determine access duration and limits
                let durationDays, viewLimit;
                if (package_id === 'monthly_access') {
                    durationDays = 30;
                    viewLimit = null;
                } else if (package_id === 'one_time_unlimited') {
                    durationDays = 7;
                    viewLimit = null;
                } else if (package_id === 'pay_per_cv') {
                    durationDays = null;
                    viewLimit = 1;
                }

                const expiresAt = durationDays ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000) : null;

                // Update payment in DB
                await pool.query(
                    `UPDATE cv_access_payments 
                     SET status = $1, payment_date = NOW(), cv_view_limit = $2, expires_at = $3, stripe_payment_id = $4
                     WHERE id = $5`,
                    ['completed', viewLimit, expiresAt, session.payment_intent, paymentId]
                );
            }
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Webhook processing error:', err);
        res.status(400).json({ success: false, error: 'Webhook processing failed' });
    }
});

// GET /v1/payments/status - Check current access status
app.get('/v1/payments/status', authenticateUser, async (req, res) => {
    try {
        if (req.user.role !== 'employer') {
            return res.status(403).json({ success: false, error: 'Only employers can check payment status' });
        }

        const { rows } = await pool.query(
            `SELECT id, package_type, cv_view_limit, cv_views_used, expires_at, status, payment_date
             FROM cv_access_payments 
             WHERE employer_id = $1 AND status = 'completed'
             ORDER BY payment_date DESC
             LIMIT 10`,
            [req.user.user_id]
        );

        const activeAccess = rows.find(p => !p.expires_at || new Date(p.expires_at) > new Date());

        res.json({
            success: true,
            data: {
                active_access: activeAccess || null,
                payment_history: rows,
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to check payment status' });
    }
});

// ============================================================
// ── CANDIDATE ROUTES ──
// ============================================================

// GET /v1/candidates/search
app.get('/v1/candidates/search', authenticate, async (req, res) => {
    try {
        const {
            q, visa_status, is_emirati, location, emirate,
            skills, experience_min, experience_max,
            salary_min, salary_max, notice_period_max,
            available_from, page = 1, limit = 20,
        } = req.query;

        const cacheKey = `search:${req.user.agency_id}:${JSON.stringify(req.query)}`;
        const cached   = await cacheGet(cacheKey);
        if (cached) return res.json(JSON.parse(cached));

        const offset = (parseInt(page) - 1) * parseInt(limit);
        const params = [];
        const wheres = [
            'c.is_active = TRUE',
            'c.is_looking_for_job = TRUE',
            'c.deleted_at IS NULL',
            '(c.privacy_settings->>\'show_profile\')::boolean = TRUE',
        ];

        const addParam = (val) => { params.push(val); return `$${params.length}`; };

        if (is_emirati === 'true')  wheres.push(`c.is_emirati = TRUE`);
        if (visa_status)            wheres.push(`c.visa_status = ${addParam(visa_status)}`);
        if (emirate)                wheres.push(`c.location->>'emirate' = ${addParam(emirate)}`);
        if (experience_min)         wheres.push(`c.years_experience >= ${addParam(parseInt(experience_min))}`);
        if (experience_max)         wheres.push(`c.years_experience <= ${addParam(parseInt(experience_max))}`);
        if (salary_max)             wheres.push(`c.expected_salary_min <= ${addParam(parseInt(salary_max))}`);
        if (salary_min)             wheres.push(`c.expected_salary_max >= ${addParam(parseInt(salary_min))}`);
        if (notice_period_max)      wheres.push(`c.notice_period_days <= ${addParam(parseInt(notice_period_max))}`);
        if (available_from)         wheres.push(`c.available_from <= ${addParam(available_from)}`);

        if (skills) {
            const skillArr = skills.split(',').map(s => s.trim().toLowerCase());
            wheres.push(`c.skills && ${addParam(skillArr)}`);
        }

        // Full-text search with pg_trgm
        if (q) {
            const term = `%${q.toLowerCase()}%`;
            params.push(term);
            const pNum = params.length;
            wheres.push(`(
                lower(c.current_job_title) LIKE $${pNum} OR
                lower(c.first_name || ' ' || c.last_name) LIKE $${pNum} OR
                EXISTS (SELECT 1 FROM unnest(c.skills) s WHERE lower(s) LIKE $${pNum})
            )`);
        }

        const whereClause = `WHERE ${wheres.join(' AND ')}`;

        // Count query
        const countResult = await pool.query(
            `SELECT COUNT(*) AS total FROM candidates c ${whereClause}`, params
        );
        const total = parseInt(countResult.rows[0].total);

        // Data query
        params.push(parseInt(limit));
        params.push(offset);
        const { rows } = await pool.query(
            `SELECT
                c.id, c.first_name, c.last_name,
                c.current_job_title, c.current_company, c.years_experience,
                c.visa_status, c.visa_expiry_date, c.is_visa_verified,
                c.is_emirati,
                c.notice_period_days, c.available_from,
                c.expected_salary_min, c.expected_salary_max, c.salary_currency,
                c.skills, c.highest_education,
                c.location,
                c.profile_completion_score,
                c.created_at
             FROM candidates c
             ${whereClause}
             ORDER BY
                c.is_emirati DESC,
                c.profile_completion_score DESC,
                c.last_active_at DESC NULLS LAST
             LIMIT $${params.length - 1}
             OFFSET $${params.length}`,
            params
        );

        const response = {
            candidates:  rows,
            pagination: {
                total,
                page:     parseInt(page),
                limit:    parseInt(limit),
                pages:    Math.ceil(total / parseInt(limit)),
            },
            filters_applied: req.query,
        };

        await cacheSet(cacheKey, response, 120);

        // Log the search
        await logActivity(req.user.agency_id, req.user.id, 'searches', 'candidate', null, req.query);

        res.json({ success: true, data: response });
    } catch (err) {
        console.error('Search error:', err);
        res.status(500).json({ success: false, error: 'Search failed' });
    }
});

// GET /v1/candidates/:id  (full profile view)
app.get('/v1/candidates/:id', authenticate, checkQuota('cv_views'), async (req, res) => {
    try {
        const { id } = req.params;

        const { rows } = await pool.query(
            `SELECT
                c.*,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'id',           d.id,
                            'file_name',    d.file_name,
                            'file_type',    d.file_type,
                            'file_size_bytes', d.file_size_bytes,
                            'primary_language', d.primary_language,
                            'created_at',   d.created_at
                        ) ORDER BY d.created_at DESC
                    ) FILTER (WHERE d.id IS NOT NULL),
                    '[]'
                ) AS cv_documents
             FROM candidates c
             LEFT JOIN cv_documents d ON d.candidate_id = c.id AND d.deleted_at IS NULL
             WHERE c.id = $1 AND c.is_active = TRUE AND c.deleted_at IS NULL
             GROUP BY c.id`,
            [id]
        );

        if (!rows.length) return res.status(404).json({ success: false, error: 'Candidate not found' });

        // GDPR: record the view
        await pool.query(
            `INSERT INTO cv_views
                 (agency_id, candidate_id, user_id, view_type, gdpr_basis, ip_address, user_agent, created_at)
             VALUES ($1,$2,$3,'full','legitimate_interest',$4,$5,NOW())`,
            [req.user.agency_id, id, req.user.id, req.ip, req.headers['user-agent']]
        );

        await logActivity(req.user.agency_id, req.user.id, 'cv_views', 'candidate', id);

        res.json({ success: true, data: rows[0] });
    } catch (err) {
        console.error('Get candidate error:', err);
        res.status(500).json({ success: false, error: 'Failed to retrieve candidate' });
    }
});

// POST /v1/candidates/:id/contact
app.post('/v1/candidates/:id/contact', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { message, job_id, contact_method = 'email' } = req.body;

        const { rows } = await pool.query(
            `SELECT email, phone, first_name, privacy_settings
             FROM candidates WHERE id = $1 AND deleted_at IS NULL`,
            [id]
        );
        if (!rows.length) return res.status(404).json({ success: false, error: 'Candidate not found' });

        const candidate = rows[0];
        if (!candidate.privacy_settings?.allow_agency_contact) {
            return res.status(403).json({ success: false, error: 'Candidate does not accept unsolicited contact' });
        }

        // In production: integrate SendGrid / Twilio here
        console.log(`[CONTACT] ${contact_method} → ${candidate.email}:`, message?.slice(0, 80));

        await logActivity(req.user.agency_id, req.user.id, 'candidate_contacted', 'candidate', id, { job_id, contact_method });

        res.json({
            success: true,
            data: {
                contact_id:          uuid(),
                status:              'sent',
                candidate_notified:  true,
                gdpr_compliant:      true,
            },
        });
    } catch (err) {
        console.error('Contact error:', err);
        res.status(500).json({ success: false, error: 'Failed to send contact' });
    }
});

// POST /v1/candidates  (self-registration by job seeker)
app.post('/v1/candidates', async (req, res) => {
    try {
        const {
            first_name, last_name, email, phone,
            nationality, visa_status, is_emirati,
            current_job_title, years_experience,
            skills, expected_salary_min, expected_salary_max,
            location, gdpr_consent,
        } = req.body;

        if (!first_name || !last_name || !email || !gdpr_consent) {
            return res.status(400).json({ success: false, error: 'first_name, last_name, email, gdpr_consent required' });
        }

        const existing = await pool.query('SELECT id FROM candidates WHERE email = $1', [email]);
        if (existing.rows.length) {
            return res.status(409).json({ success: false, error: 'Email already registered' });
        }

        const { rows } = await pool.query(
            `INSERT INTO candidates
                 (first_name, last_name, email, phone, nationality, visa_status,
                  is_emirati, current_job_title, years_experience,
                  skills, expected_salary_min, expected_salary_max,
                  location, gdpr_consent, gdpr_consent_date)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
             RETURNING id, first_name, last_name, email`,
            [first_name, last_name, email, phone, nationality, visa_status,
             is_emirati || false, current_job_title, years_experience,
             skills || [], expected_salary_min, expected_salary_max,
             JSON.stringify(location || {}), gdpr_consent]
        );

        res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
        console.error('Create candidate error:', err);
        res.status(500).json({ success: false, error: 'Failed to create candidate' });
    }
});

// POST /v1/candidates/:id/cv  (upload CV document)
app.post('/v1/candidates/:id/cv', authenticate, upload.single('cv'), async (req, res) => {
    try {
        const { id } = req.params;
        if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

        const { rows } = await pool.query(
            `INSERT INTO cv_documents
                 (candidate_id, file_name, file_path, file_type,
                  file_size_bytes, parsing_status)
             VALUES ($1,$2,$3,$4,$5,'pending')
             RETURNING id`,
            [id, req.file.originalname, req.file.path,
             req.file.originalname.split('.').pop().toLowerCase(),
             req.file.size]
        );

        // In production: queue CV parsing job here
        res.status(201).json({
            success: true,
            data: {
                document_id:    rows[0].id,
                parsing_status: 'pending',
                message:        'CV uploaded successfully. Parsing in progress.',
            },
        });
    } catch (err) {
        console.error('Upload error:', err);
        res.status(500).json({ success: false, error: 'Upload failed' });
    }
});

// ============================================================
// ── JOB ROUTES ──
// ============================================================

// POST /v1/jobs
app.post('/v1/jobs', authenticate, checkQuota('job_posts'), async (req, res) => {
    try {
        const {
            title, description, requirements, responsibilities,
            job_type, industry, category,
            location, salary, experience,
            required_skills, required_languages, required_nationalities,
            visa_sponsorship_available, requires_emirati,
            is_hidden, expires_at,
        } = req.body;

        if (!title || !description) {
            return res.status(400).json({ success: false, error: 'title and description required' });
        }

        const { rows } = await pool.query(
            `INSERT INTO jobs (
                agency_id, title, description, requirements, responsibilities,
                job_type, industry, category,
                location_type, city, emirate, country,
                salary_min, salary_max, salary_currency, salary_period, is_salary_visible,
                experience_min_years, experience_max_years,
                required_skills, required_languages, required_nationalities,
                visa_sponsorship_available, requires_emirati,
                is_hidden, status, posted_at,
                expires_at, created_at
            ) VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
                $18,$19,$20,$21,$22,$23,$24,$25,'active',NOW(),$26,NOW()
            ) RETURNING id, title, status, posted_at, expires_at`,
            [
                req.user.agency_id,
                title, description, requirements, responsibilities,
                job_type, industry, category,
                location?.type, location?.city, location?.emirate, location?.country || 'UAE',
                salary?.min, salary?.max, salary?.currency || 'AED',
                salary?.period || 'month', salary?.is_visible !== false,
                experience?.min_years, experience?.max_years,
                required_skills || [], required_languages || [], required_nationalities || [],
                visa_sponsorship_available || false, requires_emirati || false,
                is_hidden || false,
                expires_at || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            ]
        );

        await logActivity(req.user.agency_id, req.user.id, 'job_posts', 'job', rows[0].id);
        res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
        console.error('Create job error:', err);
        res.status(500).json({ success: false, error: 'Failed to create job' });
    }
});

// GET /v1/jobs  (list agency's own jobs)
app.get('/v1/jobs', authenticate, async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        const params = [req.user.agency_id, parseInt(limit), (parseInt(page) - 1) * parseInt(limit)];
        const statusFilter = status ? `AND status = $4` : '';
        if (status) params.splice(1, 0, status);  // insert at position 1

        // Rebuild properly
        const ps = [req.user.agency_id];
        const extra = [];
        if (status) { ps.push(status); extra.push(`AND status = $${ps.length}`); }

        const { rows: countRows } = await pool.query(
            `SELECT COUNT(*) AS total FROM jobs
             WHERE agency_id = $1 AND deleted_at IS NULL ${extra.join(' ')}`, ps
        );

        ps.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
        const { rows } = await pool.query(
            `SELECT id, title, status, job_type, industry, city, emirate,
                    salary_min, salary_max, salary_currency,
                    requires_emirati, is_hidden,
                    views_count, applications_count,
                    posted_at, expires_at, created_at
             FROM jobs
             WHERE agency_id = $1 AND deleted_at IS NULL ${extra.join(' ')}
             ORDER BY created_at DESC
             LIMIT $${ps.length - 1} OFFSET $${ps.length}`,
            ps
        );

        res.json({
            success: true,
            data: {
                jobs: rows,
                pagination: {
                    total: parseInt(countRows[0].total),
                    page:  parseInt(page),
                    limit: parseInt(limit),
                    pages: Math.ceil(parseInt(countRows[0].total) / parseInt(limit)),
                },
            },
        });
    } catch (err) {
        console.error('List jobs error:', err);
        res.status(500).json({ success: false, error: 'Failed to list jobs' });
    }
});

// GET /v1/jobs/:id/matches  (AI candidate matching)
app.get('/v1/jobs/:id/matches', authenticate, async (req, res) => {
    try {
        const { id } = req.params;

        const { rows: jobRows } = await pool.query(
            `SELECT * FROM jobs WHERE id = $1 AND agency_id = $2 AND deleted_at IS NULL`,
            [id, req.user.agency_id]
        );
        if (!jobRows.length) return res.status(404).json({ success: false, error: 'Job not found' });
        const job = jobRows[0];

        // Build filter conditions
        const params = [true, true];
        const wheres = ['c.is_active = $1', 'c.is_looking_for_job = $2', 'c.deleted_at IS NULL'];

        if (job.requires_emirati) wheres.push('c.is_emirati = TRUE');
        if (job.emirate) { params.push(job.emirate); wheres.push(`c.location->>'emirate' = $${params.length}`); }

        const { rows: candidates } = await pool.query(
            `SELECT c.id, c.first_name, c.last_name, c.current_job_title,
                    c.years_experience, c.skills, c.visa_status, c.is_emirati,
                    c.expected_salary_min, c.expected_salary_max,
                    c.notice_period_days, c.location
             FROM candidates c
             WHERE ${wheres.join(' AND ')}
             LIMIT 100`,
            params
        );

        // Score each candidate
        const scored = candidates
            .map(c => {
                const score   = calculateMatchScore(job, c);
                const reasons = generateMatchReasons(job, c);
                return { ...c, match_score: score, match_reasons: reasons };
            })
            .filter(c => c.match_score > 0)
            .sort((a, b) => b.match_score - a.match_score)
            .slice(0, 20);

        res.json({
            success: true,
            data: {
                job_id:               id,
                total_matches:        scored.length,
                emiratisation_matches: scored.filter(c => c.is_emirati).length,
                matches:              scored,
            },
        });
    } catch (err) {
        console.error('Matches error:', err);
        res.status(500).json({ success: false, error: 'Failed to find matches' });
    }
});

// ── Match scoring algorithm ──
function calculateMatchScore(job, candidate) {
    const W = { skills: 0.30, experience: 0.25, location: 0.15, salary: 0.15, visa: 0.10, language: 0.05 };
    let score = 0;

    // Skills (Jaccard similarity)
    if (job.required_skills?.length && candidate.skills?.length) {
        const jobS  = new Set(job.required_skills.map(s => s.toLowerCase()));
        const canS  = new Set(candidate.skills.map(s => s.toLowerCase()));
        const inter = [...jobS].filter(s => canS.has(s)).length;
        const union = new Set([...jobS, ...canS]).size;
        score += (inter / union) * W.skills * 100;
    }

    // Experience
    if (job.experience_min_years && candidate.years_experience != null) {
        const ratio = Math.min(candidate.years_experience / job.experience_min_years, 1.5) / 1.5;
        score += ratio * W.experience * 100;
    }

    // Location
    const canEmirate = candidate.location?.emirate;
    if (job.emirate && canEmirate) {
        if (job.emirate === canEmirate) score += W.location * 100;
        else                            score += W.location * 50;
    }

    // Salary
    if (job.salary_max && candidate.expected_salary_min) {
        if (candidate.expected_salary_min <= job.salary_max) score += W.salary * 100;
    }

    // Visa
    const noSponsorship = !job.visa_sponsorship_available;
    if (noSponsorship && candidate.visa_status === 'employment') score += W.visa * 100;
    else if (job.visa_sponsorship_available && ['visit','cancellation'].includes(candidate.visa_status)) score += W.visa * 100;

    // Emiratisation bonus
    if (job.requires_emirati && candidate.is_emirati) score += 20;

    return Math.min(Math.round(score), 100);
}

function generateMatchReasons(job, candidate) {
    const reasons = [];
    if (candidate.years_experience >= (job.experience_min_years || 0))
        reasons.push(`${candidate.years_experience} yrs exp (min: ${job.experience_min_years})`);
    if (job.requires_emirati && candidate.is_emirati)
        reasons.push('UAE National — meets Emiratisation requirement');
    if (candidate.notice_period_days === 0)
        reasons.push('Available immediately');
    else if (candidate.notice_period_days <= 30)
        reasons.push(`${candidate.notice_period_days}-day notice period`);
    if (candidate.visa_status === 'employment')
        reasons.push('Active employment visa');
    if (candidate.visa_status === 'cancellation')
        reasons.push('Transfer ready — no notice required');
    return reasons;
}

// ============================================================
// ── APPLICATION ROUTES ──
// ============================================================

// POST /v1/applications
app.post('/v1/applications', authenticate, async (req, res) => {
    try {
        const { job_id, candidate_id, cover_letter, notes } = req.body;
        if (!job_id || !candidate_id) {
            return res.status(400).json({ success: false, error: 'job_id and candidate_id required' });
        }

        const { rows } = await pool.query(
            `INSERT INTO applications (job_id, candidate_id, agency_id, cover_letter, notes, status)
             VALUES ($1,$2,$3,$4,$5,'new')
             ON CONFLICT (job_id, candidate_id) DO NOTHING
             RETURNING id, status, created_at`,
            [job_id, candidate_id, req.user.agency_id, cover_letter, notes]
        );

        if (!rows.length) {
            return res.status(409).json({ success: false, error: 'Candidate already applied to this job' });
        }

        res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
        console.error('Apply error:', err);
        res.status(500).json({ success: false, error: 'Failed to create application' });
    }
});

// PATCH /v1/applications/:id/status
app.patch('/v1/applications/:id/status', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, notes, internal_notes, interview_date, interview_type, offered_salary } = req.body;

        const validStatuses = ['reviewing','shortlisted','interview_scheduled','interview_done','offer_sent','hired','rejected','withdrawn'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
        }

        const { rows } = await pool.query(
            `UPDATE applications
             SET status = $1, status_changed_at = NOW(),
                 notes = COALESCE($2, notes),
                 internal_notes = COALESCE($3, internal_notes),
                 interview_date = COALESCE($4, interview_date),
                 interview_type = COALESCE($5, interview_type),
                 offered_salary = COALESCE($6, offered_salary)
             WHERE id = $7
               AND agency_id = $8
             RETURNING id, status, status_changed_at`,
            [status, notes, internal_notes, interview_date, interview_type, offered_salary,
             id, req.user.agency_id]
        );

        if (!rows.length) return res.status(404).json({ success: false, error: 'Application not found' });

        await logActivity(req.user.agency_id, req.user.id, 'application_status_changed', 'application', id, { status });
        res.json({ success: true, data: rows[0] });
    } catch (err) {
        console.error('Update application error:', err);
        res.status(500).json({ success: false, error: 'Failed to update application' });
    }
});

// ============================================================
// ── COMPLIANCE / EMIRATISATION ROUTES ──
// ============================================================

// GET /v1/compliance/emiratisation
app.get('/v1/compliance/emiratisation', authenticate, async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT
                a.company_size, a.emiratisation_target, a.emiratisation_current,
                (SELECT COUNT(*) FROM applications ap
                 JOIN jobs j ON j.id = ap.job_id
                 JOIN candidates c ON c.id = ap.candidate_id
                 WHERE j.agency_id = $1
                   AND c.is_emirati = TRUE
                   AND ap.status IN ('shortlisted','interview_scheduled','offer_sent')
                ) AS pipeline_count,
                (SELECT COUNT(*) FROM applications ap
                 JOIN jobs j ON j.id = ap.job_id
                 JOIN candidates c ON c.id = ap.candidate_id
                 WHERE j.agency_id = $1
                   AND c.is_emirati = TRUE
                   AND ap.status = 'hired'
                   AND ap.created_at > date_trunc('year', NOW())
                ) AS hired_this_year
             FROM agencies a WHERE a.id = $1`,
            [req.user.agency_id]
        );

        const d         = rows[0] || {};
        const required  = d.emiratisation_target  || 0;
        const current   = parseInt(d.emiratisation_current)  || 0;
        const pipeline  = parseInt(d.pipeline_count) || 0;
        const hired     = parseInt(d.hired_this_year) || 0;
        const remaining = Math.max(0, required - current);

        const yearEnd         = new Date(new Date().getFullYear(), 11, 31);
        const daysUntilYearEnd = Math.ceil((yearEnd - new Date()) / 86400000);
        const risk            = remaining === 0 ? 'none'
                               : daysUntilYearEnd < 60  ? 'critical'
                               : daysUntilYearEnd < 120 ? 'high'
                               : daysUntilYearEnd < 180 ? 'medium' : 'low';

        res.json({
            success: true,
            data: {
                company_size:            d.company_size,
                target:                  required,
                current_employees:       current,
                remaining_required:      remaining,
                pipeline_candidates:     pipeline,
                hired_ytd:               hired,
                compliance_status:       remaining === 0 ? 'compliant' : 'non_compliant',
                risk_level:              risk,
                days_until_year_end:     daysUntilYearEnd,
                recommended_actions:     remaining > 0 ? [
                    `Hire ${remaining} more Emirati${remaining > 1 ? 's' : ''} before Dec 31`,
                    `${pipeline} Emirati candidate${pipeline !== 1 ? 's' : ''} currently in pipeline`,
                    'Use the CV search with "UAE Nationals only" filter to find candidates',
                ] : ['Emiratisation target met — well done!'],
            },
        });
    } catch (err) {
        console.error('Emiratisation error:', err);
        res.status(500).json({ success: false, error: 'Failed to retrieve Emiratisation status' });
    }
});

// GET /v1/compliance/gdpr/cv-views
app.get('/v1/compliance/gdpr/cv-views', authenticate, async (req, res) => {
    try {
        const { from, to, page = 1, limit = 50 } = req.query;
        const params  = [req.user.agency_id];
        const filters = [];

        if (from) { params.push(from); filters.push(`cv.created_at >= $${params.length}`); }
        if (to)   { params.push(to);   filters.push(`cv.created_at <= $${params.length}`); }

        const where = filters.length ? `AND ${filters.join(' AND ')}` : '';

        params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

        const { rows } = await pool.query(
            `SELECT
                cv.id, cv.view_type, cv.downloaded, cv.gdpr_basis,
                cv.candidate_notified, cv.created_at,
                c.first_name || ' ' || c.last_name AS candidate_name,
                c.email AS candidate_email
             FROM cv_views cv
             JOIN candidates c ON c.id = cv.candidate_id
             WHERE cv.agency_id = $1 ${where}
             ORDER BY cv.created_at DESC
             LIMIT $${params.length - 1} OFFSET $${params.length}`,
            params
        );

        res.json({ success: true, data: { cv_views: rows } });
    } catch (err) {
        console.error('GDPR log error:', err);
        res.status(500).json({ success: false, error: 'Failed to retrieve GDPR log' });
    }
});

// ============================================================
// ── SHORTLIST ROUTES ──
// ============================================================

// GET /v1/shortlists
app.get('/v1/shortlists', authenticate, async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT s.*, COUNT(sc.candidate_id) AS candidate_count
             FROM shortlists s
             LEFT JOIN shortlist_candidates sc ON sc.shortlist_id = s.id
             WHERE s.agency_id = $1
             GROUP BY s.id
             ORDER BY s.created_at DESC`,
            [req.user.agency_id]
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to list shortlists' });
    }
});

// POST /v1/shortlists
app.post('/v1/shortlists', authenticate, async (req, res) => {
    try {
        const { name, description, job_id } = req.body;
        if (!name) return res.status(400).json({ success: false, error: 'name required' });

        const { rows } = await pool.query(
            `INSERT INTO shortlists (agency_id, user_id, name, description, job_id)
             VALUES ($1,$2,$3,$4,$5)
             RETURNING *`,
            [req.user.agency_id, req.user.id, name, description, job_id || null]
        );
        res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to create shortlist' });
    }
});

// POST /v1/shortlists/:id/candidates
app.post('/v1/shortlists/:id/candidates', authenticate, async (req, res) => {
    try {
        const { candidate_id, notes } = req.body;
        if (!candidate_id) return res.status(400).json({ success: false, error: 'candidate_id required' });

        await pool.query(
            `INSERT INTO shortlist_candidates (shortlist_id, candidate_id, added_by, notes)
             VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
            [req.params.id, candidate_id, req.user.id, notes]
        );
        res.status(201).json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to add to shortlist' });
    }
});

// ============================================================
// ── ANALYTICS ROUTES ──
// ============================================================

// GET /v1/analytics/dashboard
app.get('/v1/analytics/dashboard', authenticate, async (req, res) => {
    try {
        const agencyId = req.user.agency_id;

        const [jobs, apps, views, searches] = await Promise.all([
            pool.query(`SELECT COUNT(*) AS total, status FROM jobs WHERE agency_id=$1 AND deleted_at IS NULL GROUP BY status`, [agencyId]),
            pool.query(`SELECT COUNT(*) AS total, status FROM applications ap JOIN jobs j ON j.id=ap.job_id WHERE j.agency_id=$1 AND ap.created_at > NOW()-INTERVAL '30 days' GROUP BY ap.status`, [agencyId]),
            pool.query(`SELECT COUNT(*) AS total FROM cv_views WHERE agency_id=$1 AND created_at > NOW()-INTERVAL '30 days'`, [agencyId]),
            pool.query(`SELECT COUNT(*) AS total FROM activity_logs WHERE agency_id=$1 AND action='searches' AND created_at > NOW()-INTERVAL '30 days'`, [agencyId]),
        ]);

        res.json({
            success: true,
            data: {
                jobs_by_status:       jobs.rows,
                applications_30d:     apps.rows,
                cv_views_30d:         parseInt(views.rows[0]?.total || 0),
                searches_30d:         parseInt(searches.rows[0]?.total || 0),
            },
        });
    } catch (err) {
        console.error('Dashboard error:', err);
        res.status(500).json({ success: false, error: 'Failed to load dashboard' });
    }
});

// ============================================================
// ── GLOBAL ERROR HANDLER ──
// ============================================================
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    });
});

// 404
app.use((req, res) => {
    res.status(404).json({ success: false, error: `Route ${req.method} ${req.path} not found` });
});

// ============================================================
// START
// ============================================================
app.listen(PORT, () => {
    console.log(`🚀 CVhive API running on port ${PORT}`);
    console.log(`📊 Environment : ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 Frontend    : ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
    console.log(`🏥 Health check: http://localhost:${PORT}/health`);
});

module.exports = app;
