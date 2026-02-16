-- ============================================================
-- CVhive Database Schema
-- PostgreSQL 15+
-- Dubai's Premier Recruitment Platform
-- ============================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- fuzzy text search
CREATE EXTENSION IF NOT EXISTS "unaccent";  -- accent-insensitive search

-- ============================================================
-- AGENCIES (Recruitment Companies)
-- ============================================================
CREATE TABLE agencies (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_name                VARCHAR(255) NOT NULL,
    trade_license_number        VARCHAR(100),
    license_expiry              DATE,
    email                       VARCHAR(255) UNIQUE NOT NULL,
    password_hash               VARCHAR(255) NOT NULL,
    phone                       VARCHAR(50),
    website                     VARCHAR(255),

    -- Address
    address_line1               VARCHAR(255),
    address_line2               VARCHAR(255),
    city                        VARCHAR(100),
    emirate                     VARCHAR(50) CHECK (emirate IN (
                                    'Dubai','Abu Dhabi','Sharjah','Ajman',
                                    'Ras Al Khaimah','Fujairah','Umm Al Quwain'
                                )),
    country                     VARCHAR(100) DEFAULT 'UAE',

    -- Business details
    company_size                VARCHAR(50) CHECK (company_size IN (
                                    '1-10','11-50','51-200','201-500','500+'
                                )),
    industry_focus              TEXT[],

    -- Subscription & Billing
    subscription_tier           VARCHAR(50) DEFAULT 'starter'
                                CHECK (subscription_tier IN ('starter','professional','agency')),
    subscription_status         VARCHAR(50) DEFAULT 'trial'
                                CHECK (subscription_status IN (
                                    'trial','active','past_due','suspended','cancelled'
                                )),
    stripe_customer_id          VARCHAR(100),
    stripe_subscription_id      VARCHAR(100),
    trial_ends_at               TIMESTAMP,
    current_period_start        TIMESTAMP,
    current_period_end          TIMESTAMP,

    -- Usage counters (reset monthly)
    cv_views_this_month         INTEGER DEFAULT 0,
    searches_this_month         INTEGER DEFAULT 0,
    jobs_posted_this_month      INTEGER DEFAULT 0,

    -- Compliance & Verification
    is_verified                 BOOLEAN DEFAULT FALSE,
    verification_documents      JSONB DEFAULT '{}',
    gdpr_consent                BOOLEAN DEFAULT FALSE,
    gdpr_consent_date           TIMESTAMP,

    -- Emiratisation tracking
    emiratisation_target        INTEGER DEFAULT 0,
    emiratisation_current       INTEGER DEFAULT 0,

    -- Settings
    settings                    JSONB DEFAULT '{}',

    -- Timestamps
    created_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at               TIMESTAMP,
    password_reset_token        VARCHAR(255),
    password_reset_expires      TIMESTAMP,
    deleted_at                  TIMESTAMP
);

-- ============================================================
-- AGENCY USERS (staff accounts within an agency)
-- ============================================================
CREATE TABLE agency_users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agency_id       UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    first_name      VARCHAR(100),
    last_name       VARCHAR(100),
    role            VARCHAR(50) DEFAULT 'recruiter'
                    CHECK (role IN ('owner','admin','recruiter','viewer')),
    is_active       BOOLEAN DEFAULT TRUE,
    last_login_at   TIMESTAMP,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at      TIMESTAMP
);

-- ============================================================
-- CANDIDATES (Job Seekers)
-- ============================================================
CREATE TABLE candidates (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Personal Info
    first_name                  VARCHAR(100) NOT NULL,
    last_name                   VARCHAR(100) NOT NULL,
    email                       VARCHAR(255) UNIQUE NOT NULL,
    phone                       VARCHAR(50),

    -- Nationality & Demographics
    nationality                 VARCHAR(100),
    country_of_residence        VARCHAR(100) DEFAULT 'UAE',
    date_of_birth               DATE,
    gender                      VARCHAR(20) CHECK (gender IN (
                                    'male','female','other','prefer_not_to_say'
                                )),

    -- Visa Status (CRITICAL for Dubai market)
    visa_status                 VARCHAR(50) CHECK (visa_status IN (
                                    'employment','visit','cancellation','golden_visa',
                                    'spouse','student','retired','freelance'
                                )),
    visa_expiry_date            DATE,
    visa_file_number            VARCHAR(100),
    is_visa_verified            BOOLEAN DEFAULT FALSE,
    visa_verified_at            TIMESTAMP,
    visa_verification_source    VARCHAR(100),  -- 'GDRFA','ICP','manual'

    -- Emiratisation (UAE Nationals)
    is_emirati                  BOOLEAN DEFAULT FALSE,
    emirates_id                 VARCHAR(100),
    family_book_number          VARCHAR(100),

    -- Professional Info
    current_job_title           VARCHAR(255),
    current_company             VARCHAR(255),
    years_experience            INTEGER CHECK (years_experience >= 0),
    highest_education           VARCHAR(100) CHECK (highest_education IN (
                                    'high_school','diploma','bachelor','master','phd','other'
                                )),
    field_of_study              VARCHAR(255),

    -- Skills & Languages
    skills                      TEXT[],
    languages                   JSONB DEFAULT '[]',
    -- e.g. [{"language": "Arabic", "level": "native"}, {"language": "English", "level": "fluent"}]

    -- Job Preferences
    expected_salary_min         INTEGER,
    expected_salary_max         INTEGER,
    salary_currency             VARCHAR(3) DEFAULT 'AED',
    preferred_locations         TEXT[],
    preferred_industries        TEXT[],
    job_types                   TEXT[],   -- ['full_time','part_time','contract','freelance']
    notice_period_days          INTEGER DEFAULT 30,

    -- Availability
    is_active                   BOOLEAN DEFAULT TRUE,
    is_looking_for_job          BOOLEAN DEFAULT TRUE,
    available_from              DATE,

    -- Profile quality
    profile_completion_score    INTEGER DEFAULT 0
                                CHECK (profile_completion_score BETWEEN 0 AND 100),
    profile_views               INTEGER DEFAULT 0,

    -- Privacy & Consent (GDPR)
    privacy_settings            JSONB DEFAULT '{"show_profile": true, "allow_agency_contact": true}'::jsonb,
    gdpr_consent                BOOLEAN DEFAULT FALSE,
    gdpr_consent_date           TIMESTAMP,
    marketing_consent           BOOLEAN DEFAULT FALSE,

    -- Location (stored as JSON for flexibility)
    location                    JSONB DEFAULT '{}',
    -- e.g. {"city": "Dubai", "emirate": "Dubai", "area": "Downtown"}

    -- Timestamps
    created_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_active_at              TIMESTAMP,
    deleted_at                  TIMESTAMP
);

-- ============================================================
-- CV DOCUMENTS
-- ============================================================
CREATE TABLE cv_documents (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id        UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,

    -- File metadata
    file_name           VARCHAR(255) NOT NULL,
    file_path           VARCHAR(500) NOT NULL,   -- S3 key / local path
    file_type           VARCHAR(10) CHECK (file_type IN ('pdf','doc','docx','txt')),
    file_size_bytes     INTEGER,

    -- Parsed content (from AI/OCR)
    raw_text            TEXT,
    parsed_data         JSONB DEFAULT '{}',
    -- e.g. {"work_experience": [...], "education": [...], "skills": [...]}
    parsing_status      VARCHAR(50) DEFAULT 'pending'
                        CHECK (parsing_status IN ('pending','processing','completed','failed')),
    parsing_error       TEXT,

    -- Language detection
    detected_languages  TEXT[],
    primary_language    VARCHAR(50),

    is_primary          BOOLEAN DEFAULT TRUE,

    -- Timestamps
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at          TIMESTAMP
);

-- ============================================================
-- JOBS
-- ============================================================
CREATE TABLE jobs (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agency_id                   UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,

    -- Job Details
    title                       VARCHAR(255) NOT NULL,
    description                 TEXT NOT NULL,
    requirements                TEXT,
    responsibilities            TEXT,

    -- Classification
    job_type                    VARCHAR(50) CHECK (job_type IN (
                                    'full_time','part_time','contract','freelance','internship'
                                )),
    industry                    VARCHAR(100),
    category                    VARCHAR(100),
    subcategory                 VARCHAR(100),

    -- Location
    location_type               VARCHAR(50) CHECK (location_type IN ('onsite','remote','hybrid')),
    city                        VARCHAR(100),
    emirate                     VARCHAR(50),
    country                     VARCHAR(100) DEFAULT 'UAE',

    -- Compensation
    salary_min                  INTEGER,
    salary_max                  INTEGER,
    salary_currency             VARCHAR(3) DEFAULT 'AED',
    salary_period               VARCHAR(20) DEFAULT 'month'
                                CHECK (salary_period IN ('hour','day','month','year')),
    is_salary_visible           BOOLEAN DEFAULT TRUE,

    -- Requirements
    experience_min_years        INTEGER,
    experience_max_years        INTEGER,
    education_level             VARCHAR(100),
    required_skills             TEXT[],
    required_languages          TEXT[],
    required_nationalities      TEXT[],

    -- UAE-specific
    visa_sponsorship_available  BOOLEAN DEFAULT FALSE,
    requires_emirati            BOOLEAN DEFAULT FALSE,   -- Emiratisation target role

    -- Confidentiality
    is_hidden                   BOOLEAN DEFAULT FALSE,   -- Hidden job marketplace
    hidden_reason               VARCHAR(255),            -- 'sensitive_replacement', 'executive', 'confidential'

    -- Status & Lifecycle
    status                      VARCHAR(50) DEFAULT 'draft'
                                CHECK (status IN ('draft','active','paused','filled','expired','cancelled')),
    posted_at                   TIMESTAMP,
    expires_at                  TIMESTAMP,

    -- Analytics
    views_count                 INTEGER DEFAULT 0,
    applications_count          INTEGER DEFAULT 0,

    -- Timestamps
    created_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at                  TIMESTAMP
);

-- ============================================================
-- APPLICATIONS
-- ============================================================
CREATE TABLE applications (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id              UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    candidate_id        UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    agency_id           UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,

    -- Application content
    cover_letter        TEXT,
    custom_questions    JSONB DEFAULT '{}',

    -- Pipeline status
    status              VARCHAR(50) DEFAULT 'new'
                        CHECK (status IN (
                            'new','reviewing','shortlisted','interview_scheduled',
                            'interview_done','offer_sent','hired','rejected','withdrawn'
                        )),
    status_changed_at   TIMESTAMP,
    status_changed_by   UUID REFERENCES agency_users(id),

    -- Source tracking
    source              VARCHAR(50) DEFAULT 'direct'
                        CHECK (source IN ('direct','agency_search','referral','job_board','api')),
    referring_agency_id UUID REFERENCES agencies(id),

    -- Notes
    notes               TEXT,        -- visible to candidate
    internal_notes      TEXT,        -- agency-only

    -- Interview scheduling
    interview_date      TIMESTAMP,
    interview_type      VARCHAR(50) CHECK (interview_type IN ('in_person','video','phone')),
    interview_location  VARCHAR(255),

    -- Offer details
    offered_salary      INTEGER,
    offered_start_date  DATE,

    -- Timestamps
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Prevent duplicate applications
    UNIQUE(job_id, candidate_id)
);

-- ============================================================
-- CV VIEWS (GDPR compliance audit log)
-- ============================================================
CREATE TABLE cv_views (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agency_id               UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    candidate_id            UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    user_id                 UUID REFERENCES agency_users(id),

    -- View type
    view_type               VARCHAR(50) DEFAULT 'preview'
                            CHECK (view_type IN ('preview','full','download')),
    downloaded              BOOLEAN DEFAULT FALSE,

    -- Context (what search led here)
    search_query            TEXT,
    filters_applied         JSONB DEFAULT '{}',

    -- GDPR basis for processing
    gdpr_basis              VARCHAR(50) DEFAULT 'consent'
                            CHECK (gdpr_basis IN ('consent','legitimate_interest','contract')),
    candidate_notified      BOOLEAN DEFAULT TRUE,

    -- Request metadata
    ip_address              INET,
    user_agent              TEXT,

    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- SHORTLISTS (saved candidate collections)
-- ============================================================
CREATE TABLE shortlists (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agency_id       UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES agency_users(id),
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    job_id          UUID REFERENCES jobs(id),
    is_shared       BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE shortlist_candidates (
    shortlist_id    UUID REFERENCES shortlists(id) ON DELETE CASCADE,
    candidate_id    UUID REFERENCES candidates(id) ON DELETE CASCADE,
    added_by        UUID REFERENCES agency_users(id),
    notes           TEXT,
    added_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (shortlist_id, candidate_id)
);

-- ============================================================
-- VISA VERIFICATION LOG
-- ============================================================
CREATE TABLE visa_verifications (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id        UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    requested_by        UUID REFERENCES agencies(id),

    -- Verification details
    method              VARCHAR(50) CHECK (method IN ('GDRFA','ICP','manual','self_declaration')),
    status              VARCHAR(50) CHECK (status IN ('pending','verified','failed','expired')),
    verified_visa_type  VARCHAR(50),
    verified_expiry     DATE,
    raw_response        JSONB DEFAULT '{}',
    error_message       TEXT,

    verified_at         TIMESTAMP,
    expires_at          TIMESTAMP,  -- When this verification record expires and needs refresh
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- ACTIVITY LOGS (full audit trail)
-- ============================================================
CREATE TABLE activity_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID,
    user_type       VARCHAR(50) DEFAULT 'agency_user'
                    CHECK (user_type IN ('agency_user','candidate','system','api')),
    agency_id       UUID REFERENCES agencies(id),

    -- What happened
    action          VARCHAR(100) NOT NULL,
    -- e.g. 'cv_viewed','candidate_searched','job_posted','login','subscription_upgraded'
    entity_type     VARCHAR(50),
    entity_id       UUID,
    description     TEXT,
    metadata        JSONB DEFAULT '{}',

    -- Request context
    ip_address      INET,
    user_agent      TEXT,

    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- SUBSCRIPTION EVENTS (billing history)
-- ============================================================
CREATE TABLE subscription_events (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agency_id           UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    event_type          VARCHAR(100) NOT NULL,
    -- e.g. 'trial_started','upgraded','downgraded','cancelled','payment_failed'
    from_tier           VARCHAR(50),
    to_tier             VARCHAR(50),
    amount_aed          NUMERIC(10,2),
    stripe_event_id     VARCHAR(100),
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- INDEXES (performance-critical for search)
-- ============================================================

-- Candidate search indexes
CREATE INDEX idx_candidates_visa_status
    ON candidates(visa_status)
    WHERE is_active = TRUE AND deleted_at IS NULL;

CREATE INDEX idx_candidates_is_emirati
    ON candidates(is_emirati)
    WHERE is_active = TRUE AND deleted_at IS NULL;

CREATE INDEX idx_candidates_is_looking
    ON candidates(is_looking_for_job, is_active)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_candidates_notice_period
    ON candidates(notice_period_days)
    WHERE is_active = TRUE AND deleted_at IS NULL;

CREATE INDEX idx_candidates_experience
    ON candidates(years_experience)
    WHERE is_active = TRUE AND deleted_at IS NULL;

-- GIN indexes for array/JSONB searches
CREATE INDEX idx_candidates_skills       ON candidates USING GIN(skills);
CREATE INDEX idx_candidates_location     ON candidates USING GIN(location);
CREATE INDEX idx_candidates_languages    ON candidates USING GIN(languages);
CREATE INDEX idx_jobs_required_skills    ON jobs USING GIN(required_skills);

-- Full-text search (pg_trgm)
CREATE INDEX idx_candidates_name_trgm
    ON candidates USING GIN((first_name || ' ' || last_name) gin_trgm_ops);

CREATE INDEX idx_candidates_title_trgm
    ON candidates USING GIN(current_job_title gin_trgm_ops);

CREATE INDEX idx_jobs_title_trgm
    ON jobs USING GIN(title gin_trgm_ops);

-- Agency & job indexes
CREATE INDEX idx_jobs_agency         ON jobs(agency_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_jobs_emirate        ON jobs(emirate, status)   WHERE deleted_at IS NULL;
CREATE INDEX idx_jobs_requires_emirati ON jobs(requires_emirati)
    WHERE requires_emirati = TRUE AND deleted_at IS NULL;
CREATE INDEX idx_jobs_is_hidden      ON jobs(is_hidden, status)
    WHERE is_hidden = TRUE AND deleted_at IS NULL;

-- Application indexes
CREATE INDEX idx_applications_job        ON applications(job_id, status);
CREATE INDEX idx_applications_candidate  ON applications(candidate_id);
CREATE INDEX idx_applications_agency     ON applications(agency_id, status);

-- GDPR / compliance indexes
CREATE INDEX idx_cv_views_agency         ON cv_views(agency_id, created_at DESC);
CREATE INDEX idx_cv_views_candidate      ON cv_views(candidate_id, created_at DESC);
CREATE INDEX idx_activity_logs_agency    ON activity_logs(agency_id, created_at DESC);
CREATE INDEX idx_activity_logs_action    ON activity_logs(action, created_at DESC);

-- ============================================================
-- TRIGGERS (auto-update updated_at)
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_agencies_updated_at
    BEFORE UPDATE ON agencies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_candidates_updated_at
    BEFORE UPDATE ON candidates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_jobs_updated_at
    BEFORE UPDATE ON jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_applications_updated_at
    BEFORE UPDATE ON applications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_cv_documents_updated_at
    BEFORE UPDATE ON cv_documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TRIGGER: auto-increment application count on jobs
-- ============================================================
CREATE OR REPLACE FUNCTION increment_job_applications()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE jobs SET applications_count = applications_count + 1
    WHERE id = NEW.job_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_increment_applications
    AFTER INSERT ON applications
    FOR EACH ROW EXECUTE FUNCTION increment_job_applications();

-- ============================================================
-- TRIGGER: auto-increment CV view count on candidates
-- ============================================================
CREATE OR REPLACE FUNCTION increment_candidate_views()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE candidates SET profile_views = profile_views + 1
    WHERE id = NEW.candidate_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_increment_cv_views
    AFTER INSERT ON cv_views
    FOR EACH ROW EXECUTE FUNCTION increment_candidate_views();

-- ============================================================
-- VIEWS (handy query shortcuts)
-- ============================================================

-- Active candidates with visa info
CREATE OR REPLACE VIEW v_active_candidates AS
SELECT
    c.*,
    CASE
        WHEN c.is_emirati                          THEN 'emirati'
        WHEN c.visa_status = 'golden_visa'         THEN 'golden_visa'
        WHEN c.visa_status = 'employment'          THEN 'employment'
        WHEN c.visa_status = 'visit'               THEN 'visit'
        WHEN c.visa_status = 'cancellation'        THEN 'transfer_ready'
        ELSE c.visa_status
    END AS display_visa_status,
    CASE
        WHEN c.notice_period_days = 0              THEN 'immediate'
        WHEN c.notice_period_days <= 30            THEN 'within_30_days'
        WHEN c.notice_period_days <= 60            THEN 'within_60_days'
        ELSE 'more_than_60_days'
    END AS availability_bucket
FROM candidates c
WHERE c.is_active = TRUE
  AND c.deleted_at IS NULL
  AND c.is_looking_for_job = TRUE;

-- Agency subscription dashboard
CREATE OR REPLACE VIEW v_agency_dashboard AS
SELECT
    a.id,
    a.company_name,
    a.subscription_tier,
    a.subscription_status,
    a.trial_ends_at,
    a.emiratisation_target,
    a.emiratisation_current,
    COALESCE((
        SELECT COUNT(*) FROM jobs j
        WHERE j.agency_id = a.id AND j.status = 'active' AND j.deleted_at IS NULL
    ), 0) AS active_jobs,
    COALESCE((
        SELECT COUNT(*) FROM applications ap
        JOIN jobs j ON j.id = ap.job_id
        WHERE j.agency_id = a.id AND ap.created_at > NOW() - INTERVAL '30 days'
    ), 0) AS applications_last_30_days,
    COALESCE((
        SELECT COUNT(*) FROM cv_views cv
        WHERE cv.agency_id = a.id AND cv.created_at > NOW() - INTERVAL '30 days'
    ), 0) AS cv_views_last_30_days
FROM agencies a
WHERE a.deleted_at IS NULL;

-- ============================================================
-- CV UPLOADS
-- ============================================================
CREATE TABLE candidate_cvs (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id            UUID,
    user_id                 UUID,
    original_filename       VARCHAR(255) NOT NULL,
    stored_filename         VARCHAR(255) NOT NULL,
    file_size               INTEGER,
    mime_type               VARCHAR(100),
    is_primary              BOOLEAN DEFAULT FALSE,
    created_at              TIMESTAMP DEFAULT NOW(),
    updated_at              TIMESTAMP DEFAULT NOW(),
    deleted_at              TIMESTAMP,
    CONSTRAINT fk_candidate FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
);

CREATE INDEX idx_candidate_cvs_candidate_id ON candidate_cvs(candidate_id);
CREATE INDEX idx_candidate_cvs_user_id ON candidate_cvs(user_id);
CREATE INDEX idx_candidate_cvs_deleted ON candidate_cvs(deleted_at);

-- ============================================================
-- INDIVIDUAL USERS (Employers & Job Seekers)
-- ============================================================
CREATE TABLE users (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email                   VARCHAR(255) UNIQUE NOT NULL,
    password_hash           VARCHAR(255) NOT NULL,
    role                    VARCHAR(50) NOT NULL CHECK (role IN ('job_seeker', 'employer')),
    first_name              VARCHAR(100),
    last_name               VARCHAR(100),
    phone                   VARCHAR(50),
    profile_picture_url     VARCHAR(500),
    is_active               BOOLEAN DEFAULT TRUE,
    email_verified          BOOLEAN DEFAULT FALSE,
    email_verified_at       TIMESTAMP,
    is_deleted              BOOLEAN DEFAULT FALSE,
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at           TIMESTAMP,
    password_reset_token    VARCHAR(255),
    password_reset_expires  TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_deleted ON users(is_deleted);

-- ============================================================
-- JOB SEEKER PROFILES
-- ============================================================
CREATE TABLE job_seeker_profiles (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                 UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    headline                VARCHAR(255),
    bio                     TEXT,
    location                VARCHAR(255),
    country                 VARCHAR(100) DEFAULT 'UAE',
    date_of_birth           DATE,
    gender                  VARCHAR(20) CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say')),
    years_experience        INTEGER DEFAULT 0,
    highest_education       VARCHAR(100) CHECK (highest_education IN ('high_school', 'diploma', 'bachelor', 'master', 'phd', 'other')),
    field_of_study          VARCHAR(255),
    current_job_title       VARCHAR(255),
    current_company         VARCHAR(255),
    skills                  TEXT[] DEFAULT ARRAY[]::TEXT[],
    languages               JSONB DEFAULT '[]',
    links                   JSONB DEFAULT '{}',
    job_preferences         JSONB DEFAULT '{}',
    is_open_to_work         BOOLEAN DEFAULT TRUE,
    gdpr_consent            BOOLEAN DEFAULT FALSE,
    gdpr_consent_date       TIMESTAMP,
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_job_seeker_user ON job_seeker_profiles(user_id);

-- ============================================================
-- EMPLOYER PROFILES
-- ============================================================
CREATE TABLE employer_profiles (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                 UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    company_name            VARCHAR(255) NOT NULL,
    company_website         VARCHAR(255),
    company_logo_url        VARCHAR(500),
    industry                VARCHAR(100),
    company_size            VARCHAR(50) CHECK (company_size IN ('1-10', '11-50', '51-200', '201-500', '500+')),
    description             TEXT,
    country                 VARCHAR(100) DEFAULT 'UAE',
    city                    VARCHAR(100),
    gdpr_consent            BOOLEAN DEFAULT FALSE,
    gdpr_consent_date       TIMESTAMP,
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_employer_user ON employer_profiles(user_id);

-- ============================================================
-- JOB SEEKER CVs
-- ============================================================
CREATE TABLE job_seeker_cvs (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename                VARCHAR(255) NOT NULL,
    file_path               VARCHAR(500) NOT NULL,
    file_size               INTEGER,
    mime_type               VARCHAR(100),
    is_primary              BOOLEAN DEFAULT FALSE,
    parsed_text             TEXT,
    parsing_status          VARCHAR(50) DEFAULT 'pending' CHECK (parsing_status IN ('pending', 'processing', 'completed', 'failed')),
    is_deleted              BOOLEAN DEFAULT FALSE,
    download_count          INTEGER DEFAULT 0,
    last_downloaded_at      TIMESTAMP,
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at              TIMESTAMP
);

CREATE INDEX idx_job_seeker_cvs_user ON job_seeker_cvs(user_id);
CREATE INDEX idx_job_seeker_cvs_deleted ON job_seeker_cvs(is_deleted);
CREATE INDEX idx_job_seeker_cvs_primary ON job_seeker_cvs(is_primary);

-- ============================================================
-- CV ACCESS PAYMENTS (Employers pay to view CVs)
-- ============================================================
CREATE TABLE cv_access_payments (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employer_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stripe_payment_id       VARCHAR(255),
    stripe_session_id       VARCHAR(255),
    payment_method          VARCHAR(50) DEFAULT 'stripe',
    amount                  DECIMAL(10, 2) NOT NULL,
    currency                VARCHAR(3) DEFAULT 'AED',
    status                  VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    package_type            VARCHAR(50) NOT NULL CHECK (package_type IN ('monthly', 'one_time_unlimited', 'per_cv')),
    cv_view_limit           INTEGER DEFAULT NULL,
    cv_views_used           INTEGER DEFAULT 0,
    payment_date            TIMESTAMP,
    expires_at              TIMESTAMP,
    refunded_at             TIMESTAMP,
    metadata                JSONB DEFAULT '{}',
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_cv_access_employer ON cv_access_payments(employer_id);
CREATE INDEX idx_cv_access_status ON cv_access_payments(status);
CREATE INDEX idx_cv_access_expires ON cv_access_payments(expires_at);

-- ============================================================
-- CV VIEW LOGS (Track which employer viewed which CV)
-- ============================================================
CREATE TABLE cv_view_logs (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_seeker_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    employer_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cv_id                   UUID REFERENCES job_seeker_cvs(id) ON DELETE SET NULL,
    payment_id              UUID REFERENCES cv_access_payments(id),
    viewed_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address              VARCHAR(45),
    user_agent              TEXT
);

CREATE INDEX idx_cv_view_logs_seeker ON cv_view_logs(job_seeker_id);
CREATE INDEX idx_cv_view_logs_employer ON cv_view_logs(employer_id);
CREATE INDEX idx_cv_view_logs_cv ON cv_view_logs(cv_id);

-- ============================================================
-- ROW LEVEL SECURITY (enable per-agency data isolation)
-- ============================================================
ALTER TABLE jobs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cv_views      ENABLE ROW LEVEL SECURITY;
ALTER TABLE shortlists    ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Policy: agencies can only see their own data
-- (Policies are applied when connecting as the 'app_user' role)
-- In production, create a dedicated DB role and apply:
--
-- CREATE ROLE app_user;
-- CREATE POLICY agency_isolation ON jobs
--     USING (agency_id = current_setting('app.current_agency_id')::UUID);
