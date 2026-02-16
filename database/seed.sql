-- ============================================================
-- CVhive Seed Data
-- Development / Demo environment only
-- ============================================================

-- Demo agency
INSERT INTO agencies (
    id, company_name, trade_license_number, email, password_hash,
    phone, website, city, emirate,
    company_size, industry_focus,
    subscription_tier, subscription_status, trial_ends_at,
    is_verified, gdpr_consent, gdpr_consent_date,
    emiratisation_target, emiratisation_current
) VALUES (
    'a1000000-0000-0000-0000-000000000001',
    'Gulf Talent Group',
    'DED-2021-123456',
    'admin@gulftalent.ae',
    -- password: password123  (bcrypt hash)
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TsG6P6h7yG8sVhGmzXAu6N7qjFPS',
    '+971 4 456 7890',
    'https://gulftalent.ae',
    'Dubai', 'Dubai',
    '51-200',
    ARRAY['technology','finance','construction','hospitality'],
    'professional', 'active',
    NOW() + INTERVAL '14 days',
    TRUE, TRUE, NOW(),
    10, 7
);

-- Demo agency user
INSERT INTO agency_users (agency_id, email, password_hash, first_name, last_name, role)
VALUES (
    'a1000000-0000-0000-0000-000000000001',
    'admin@gulftalent.ae',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TsG6P6h7yG8sVhGmzXAu6N7qjFPS',
    'Sarah', 'Al-Mansouri',
    'owner'
);

-- ============================================================
-- SAMPLE CANDIDATES
-- ============================================================
INSERT INTO candidates (
    first_name, last_name, email, phone,
    nationality, country_of_residence,
    visa_status, visa_expiry_date, is_visa_verified, visa_verification_source,
    is_emirati, emirates_id,
    current_job_title, current_company, years_experience,
    highest_education, field_of_study,
    skills, languages,
    expected_salary_min, expected_salary_max,
    preferred_locations, preferred_industries, job_types,
    notice_period_days, is_active, is_looking_for_job,
    profile_completion_score,
    privacy_settings, gdpr_consent, gdpr_consent_date,
    location
) VALUES
-- 1. Emirati Senior Engineer
(
    'Omar', 'Al-Rashid', 'omar.alrashid@email.ae', '+971 50 123 4567',
    'UAE', 'UAE',
    'employment', '2026-06-15', TRUE, 'GDRFA',
    TRUE, '784-1985-1234567-1',
    'Senior Civil Engineer', 'Arabtec Construction', 8,
    'bachelor', 'Civil Engineering',
    ARRAY['AutoCAD','Revit','Project Management','Structural Engineering','MS Project'],
    '[{"language":"Arabic","level":"native"},{"language":"English","level":"fluent"}]',
    25000, 35000,
    ARRAY['Dubai','Sharjah'], ARRAY['construction','real_estate'], ARRAY['full_time'],
    30, TRUE, TRUE,
    90,
    '{"show_profile":true,"allow_agency_contact":true}', TRUE, NOW(),
    '{"city":"Dubai","emirate":"Dubai","area":"Jumeirah Village Circle"}'
),
-- 2. Financial Analyst on Visit Visa (immediate)
(
    'Sarah', 'Khan', 'sarah.khan@email.com', '+971 55 234 5678',
    'Pakistan', 'UAE',
    'visit', '2026-04-30', TRUE, 'ICP',
    FALSE, NULL,
    'Financial Analyst', 'Emirates NBD', 5,
    'bachelor', 'Finance & Accounting',
    ARRAY['Financial Modeling','Excel','Bloomberg','Power BI','IFRS'],
    '[{"language":"English","level":"fluent"},{"language":"Urdu","level":"native"},{"language":"Arabic","level":"basic"}]',
    15000, 22000,
    ARRAY['Dubai','Abu Dhabi'], ARRAY['banking','finance','investment'], ARRAY['full_time'],
    0, TRUE, TRUE,
    85,
    '{"show_profile":true,"allow_agency_contact":true}', TRUE, NOW(),
    '{"city":"Dubai","emirate":"Dubai","area":"Business Bay"}'
),
-- 3. Senior IT Project Manager (transfer ready)
(
    'Rajesh', 'Kumar', 'rajesh.kumar@email.com', '+971 52 345 6789',
    'India', 'UAE',
    'cancellation', '2026-02-28', TRUE, 'GDRFA',
    FALSE, NULL,
    'Senior IT Project Manager', 'Dubai Holding', 12,
    'master', 'Information Technology',
    ARRAY['PMP','Agile','Scrum','PRINCE2','Jira','Azure','AWS'],
    '[{"language":"English","level":"fluent"},{"language":"Hindi","level":"native"},{"language":"Arabic","level":"basic"}]',
    28000, 40000,
    ARRAY['Dubai'], ARRAY['technology','telecom','government'], ARRAY['full_time'],
    30, TRUE, TRUE,
    92,
    '{"show_profile":true,"allow_agency_contact":true}', TRUE, NOW(),
    '{"city":"Dubai","emirate":"Dubai","area":"DIFC"}'
),
-- 4. Emirati HR Manager
(
    'Mariam', 'Al-Farsi', 'mariam.alfarsi@email.ae', '+971 56 456 7890',
    'UAE', 'UAE',
    'employment', '2027-01-10', TRUE, 'GDRFA',
    TRUE, '784-1990-7654321-2',
    'HR Manager', 'Emaar Properties', 6,
    'master', 'Human Resources Management',
    ARRAY['CIPD','Emiratisation','Talent Acquisition','HRIS','SAP HR','Performance Management'],
    '[{"language":"Arabic","level":"native"},{"language":"English","level":"fluent"}]',
    22000, 30000,
    ARRAY['Dubai','Abu Dhabi'], ARRAY['real_estate','hospitality','retail'], ARRAY['full_time'],
    60, TRUE, TRUE,
    88,
    '{"show_profile":true,"allow_agency_contact":true}', TRUE, NOW(),
    '{"city":"Dubai","emirate":"Dubai","area":"Downtown Dubai"}'
),
-- 5. Golden Visa Holder – Marketing Director
(
    'Nadia', 'Petrov', 'nadia.petrov@email.com', '+971 54 567 8901',
    'Russia', 'UAE',
    'golden_visa', '2030-12-31', TRUE, 'ICP',
    FALSE, NULL,
    'Digital Marketing Director', 'Chalhoub Group', 14,
    'master', 'Marketing & Communications',
    ARRAY['Digital Marketing','Brand Strategy','SEO','Paid Media','Google Analytics','HubSpot'],
    '[{"language":"English","level":"fluent"},{"language":"Russian","level":"native"},{"language":"French","level":"intermediate"}]',
    35000, 50000,
    ARRAY['Dubai'], ARRAY['retail','luxury','fmcg'], ARRAY['full_time'],
    60, TRUE, TRUE,
    95,
    '{"show_profile":true,"allow_agency_contact":true}', TRUE, NOW(),
    '{"city":"Dubai","emirate":"Dubai","area":"Palm Jumeirah"}'
),
-- 6. Fresh Graduate (spouse visa)
(
    'Ahmed', 'Malik', 'ahmed.malik@email.com', '+971 58 678 9012',
    'Egypt', 'UAE',
    'spouse', '2026-08-20', TRUE, 'GDRFA',
    FALSE, NULL,
    'Junior Software Developer', 'Freelance', 1,
    'bachelor', 'Computer Science',
    ARRAY['JavaScript','React','Node.js','Python','SQL','Git'],
    '[{"language":"Arabic","level":"native"},{"language":"English","level":"fluent"}]',
    8000, 12000,
    ARRAY['Dubai','Sharjah'], ARRAY['technology','startups'], ARRAY['full_time','contract'],
    0, TRUE, TRUE,
    70,
    '{"show_profile":true,"allow_agency_contact":true}', TRUE, NOW(),
    '{"city":"Sharjah","emirate":"Sharjah","area":"Al Majaz"}'
);

-- ============================================================
-- SAMPLE JOBS
-- ============================================================
INSERT INTO jobs (
    agency_id, title, description, requirements,
    job_type, industry, category,
    location_type, city, emirate,
    salary_min, salary_max, salary_currency,
    experience_min_years, experience_max_years,
    required_skills, required_languages,
    visa_sponsorship_available, requires_emirati,
    is_hidden, status, posted_at, expires_at
) VALUES
-- Job 1: Emirati-required Finance role (Emiratisation)
(
    'a1000000-0000-0000-0000-000000000001',
    'Senior Financial Analyst (Emiratisation)',
    'We are seeking a qualified UAE National for a Senior Financial Analyst position to support our Emiratisation mandate. You will lead financial planning, budgeting, and analysis across the group.',
    'UAE National (Emirati) required. CPA or ACCA preferred. Minimum 4 years experience in financial analysis.',
    'full_time', 'finance', 'accounting_finance',
    'onsite', 'Dubai', 'Dubai',
    20000, 30000, 'AED',
    4, 8,
    ARRAY['Financial Modeling','Excel','Bloomberg','IFRS'],
    ARRAY['Arabic','English'],
    FALSE, TRUE,
    FALSE, 'active', NOW(), NOW() + INTERVAL '30 days'
),
-- Job 2: Confidential replacement (hidden)
(
    'a1000000-0000-0000-0000-000000000001',
    'Chief Technology Officer',
    'Confidential: A leading UAE conglomerate is seeking a CTO to lead digital transformation across 12 business units.',
    '15+ years in technology leadership. P&L experience required. MENA market knowledge essential.',
    'full_time', 'technology', 'executive',
    'onsite', 'Dubai', 'Dubai',
    60000, 90000, 'AED',
    15, NULL,
    ARRAY['Digital Transformation','Cloud Architecture','Team Leadership','Budgeting'],
    ARRAY['English'],
    TRUE, FALSE,
    TRUE, 'active', NOW(), NOW() + INTERVAL '60 days'
),
-- Job 3: Standard tech role
(
    'a1000000-0000-0000-0000-000000000001',
    'Full Stack Developer (React/Node.js)',
    'Join a fast-growing fintech startup in DIFC. Build and scale our core platform serving 50,000+ users across the GCC.',
    '3+ years with React and Node.js. Experience with PostgreSQL and cloud deployment.',
    'full_time', 'technology', 'engineering',
    'hybrid', 'Dubai', 'Dubai',
    18000, 28000, 'AED',
    3, 7,
    ARRAY['React','Node.js','PostgreSQL','AWS','TypeScript'],
    ARRAY['English'],
    TRUE, FALSE,
    FALSE, 'active', NOW(), NOW() + INTERVAL '30 days'
);

-- ============================================================
-- SAMPLE APPLICATIONS
-- ============================================================
DO $$
DECLARE
    v_job1 UUID;
    v_job3 UUID;
    v_cand1 UUID;
    v_cand2 UUID;
    v_cand3 UUID;
    v_agency UUID := 'a1000000-0000-0000-0000-000000000001';
BEGIN
    SELECT id INTO v_job1 FROM jobs WHERE title LIKE '%Financial Analyst%' LIMIT 1;
    SELECT id INTO v_job3 FROM jobs WHERE title LIKE '%Full Stack%' LIMIT 1;
    SELECT id INTO v_cand1 FROM candidates WHERE email = 'mariam.alfarsi@email.ae';
    SELECT id INTO v_cand2 FROM candidates WHERE email = 'sarah.khan@email.com';
    SELECT id INTO v_cand3 FROM candidates WHERE email = 'ahmed.malik@email.com';

    INSERT INTO applications (job_id, candidate_id, agency_id, status, source, notes, created_at)
    VALUES
        (v_job1, v_cand1, v_agency, 'shortlisted', 'agency_search', 'Emirati - strong match for Emiratisation target', NOW() - INTERVAL '3 days'),
        (v_job1, v_cand2, v_agency, 'reviewing',   'direct',        'Financial background strong, not Emirati', NOW() - INTERVAL '2 days'),
        (v_job3, v_cand3, v_agency, 'interview_scheduled', 'agency_search', 'Junior but strong React portfolio', NOW() - INTERVAL '1 day');
END $$;

-- ============================================================
-- SAMPLE CV VIEWS (GDPR audit trail)
-- ============================================================
INSERT INTO cv_views (agency_id, candidate_id, view_type, gdpr_basis, candidate_notified, created_at)
SELECT
    'a1000000-0000-0000-0000-000000000001',
    c.id,
    'preview',
    'legitimate_interest',
    TRUE,
    NOW() - (random() * INTERVAL '7 days')
FROM candidates c
LIMIT 4;
