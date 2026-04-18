-- ============================================================
-- AIDEA: AI-Powered Research Management Platform
-- Norzagaray College | Full MySQL Database Schema
-- ============================================================
CREATE DATABASE IF NOT EXISTS aidea_nc;
USE aidea_nc;
-- ============================================================
-- USERS TABLE
-- ============================================================
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_number VARCHAR(20) UNIQUE NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('student', 'guest', 'admin') DEFAULT 'student',
    avatar_url VARCHAR(255) DEFAULT NULL,
    course VARCHAR(100) DEFAULT NULL,
    year_level TINYINT DEFAULT NULL,
    section VARCHAR(20) DEFAULT NULL,
    is_verified TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
-- ============================================================
-- GUEST ACCOUNTS
-- ============================================================
CREATE TABLE guest_accounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    student_number VARCHAR(20) NOT NULL,
    session_token VARCHAR(255) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL
);
-- ============================================================
-- THESIS SUBMISSIONS
-- ============================================================
CREATE TABLE thesis_submissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(500) NOT NULL,
    abstract_text LONGTEXT,
    imrad_format LONGTEXT COMMENT 'Full IMRAD structured content (JSON or plain text)',
    whole_paper_url VARCHAR(500) COMMENT 'File path or cloud URL',
    abstract_url VARCHAR(500),
    status ENUM(
        'pending',
        'under_review',
        'approved',
        'rejected',
        'revision'
    ) DEFAULT 'pending',
    year_submitted YEAR NOT NULL,
    course VARCHAR(100),
    adviser VARCHAR(150),
    keywords TEXT,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
-- ============================================================
-- THESIS REPOSITORY (Public / Approved)
-- ============================================================
CREATE TABLE thesis_repository (
    id INT AUTO_INCREMENT PRIMARY KEY,
    thesis_id INT NOT NULL UNIQUE,
    published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    views INT DEFAULT 0,
    downloads INT DEFAULT 0,
    FOREIGN KEY (thesis_id) REFERENCES thesis_submissions(id)
);
-- ============================================================
-- SERVICES
-- ============================================================
CREATE TABLE services (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    category ENUM('paid', 'free') NOT NULL,
    price DECIMAL(10, 2) DEFAULT 0.00,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Seed default services
INSERT INTO services (name, description, category, price)
VALUES (
        'Data Analysis',
        'Statistical data analysis by certified analyst',
        'paid',
        500.00
    ),
    (
        'Statistician Service',
        'Expert statistician consultation and computation',
        'paid',
        750.00
    ),
    (
        'Grammarian Review',
        'Grammar and language review by certified grammarian',
        'paid',
        350.00
    ),
    (
        'AI & Plagiarism Check',
        'AI-powered plagiarism detection and integrity report',
        'paid',
        200.00
    ),
    (
        'Formatting Validation',
        'Automated APA/IMRaD formatting check',
        'free',
        0.00
    ),
    (
        'Dashboard of Events',
        'Access to upcoming thesis defense events dashboard',
        'free',
        0.00
    ),
    (
        'Checking & Validation',
        'Basic document checking and validation',
        'free',
        0.00
    ),
    (
        'Thesis Repository',
        'Browse all approved thesis titles of Norzagaray College',
        'free',
        0.00
    );
-- ============================================================
-- SERVICE REQUESTS / TRANSACTIONS
-- ============================================================
CREATE TABLE service_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    thesis_id INT DEFAULT NULL,
    service_id INT NOT NULL,
    status ENUM(
        'pending',
        'processing',
        'completed',
        'cancelled',
        'refunded'
    ) DEFAULT 'pending',
    notes TEXT,
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (thesis_id) REFERENCES thesis_submissions(id),
    FOREIGN KEY (service_id) REFERENCES services(id)
);
-- ============================================================
-- PAYMENTS (GCash / QR Based)
-- ============================================================
CREATE TABLE payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    request_id INT NOT NULL,
    user_id INT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    payment_method ENUM('gcash', 'qr_code') DEFAULT 'gcash',
    gcash_ref_number VARCHAR(100),
    gcash_receipt_url VARCHAR(500),
    status ENUM('pending', 'verified', 'rejected') DEFAULT 'pending',
    paid_at TIMESTAMP NULL,
    verified_by INT DEFAULT NULL COMMENT 'Admin user ID who verified',
    verified_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES service_requests(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (verified_by) REFERENCES users(id)
);
-- ============================================================
-- ACKNOWLEDGEMENT RECEIPTS
-- ============================================================
CREATE TABLE acknowledgement_receipts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    payment_id INT NOT NULL,
    receipt_number VARCHAR(50) UNIQUE NOT NULL,
    issued_to INT NOT NULL COMMENT 'user_id',
    issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    receipt_pdf_url VARCHAR(500),
    email_sent TINYINT(1) DEFAULT 0,
    email_sent_at TIMESTAMP NULL,
    FOREIGN KEY (payment_id) REFERENCES payments(id),
    FOREIGN KEY (issued_to) REFERENCES users(id)
);
-- ============================================================
-- EMAIL LOGS
-- ============================================================
CREATE TABLE email_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    to_email VARCHAR(150) NOT NULL,
    subject VARCHAR(255),
    type ENUM(
        'acknowledgement',
        'receipt',
        'notification',
        'otp',
        'other'
    ) DEFAULT 'other',
    status ENUM('sent', 'failed', 'pending') DEFAULT 'pending',
    sent_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
-- ============================================================
-- PRICE AUDIT LOG
-- ============================================================
CREATE TABLE price_audit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    service_id INT NOT NULL,
    old_price DECIMAL(10, 2),
    new_price DECIMAL(10, 2),
    changed_by INT NOT NULL COMMENT 'Admin user ID',
    reason TEXT,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (service_id) REFERENCES services(id),
    FOREIGN KEY (changed_by) REFERENCES users(id)
);
-- ============================================================
-- SYSTEM ACTIVITY LOG
-- ============================================================
CREATE TABLE system_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT DEFAULT NULL,
    action VARCHAR(255) NOT NULL,
    module VARCHAR(100) COMMENT 'e.g. payment, thesis, admin',
    ip_address VARCHAR(45),
    details TEXT,
    logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
-- ============================================================
-- CUSTOMER SATISFACTION (Post-Transaction Survey)
-- ============================================================
CREATE TABLE customer_satisfaction (
    id INT AUTO_INCREMENT PRIMARY KEY,
    request_id INT NOT NULL,
    user_id INT NOT NULL,
    rating TINYINT NOT NULL CHECK (
        rating BETWEEN 1 AND 5
    ),
    feedback TEXT,
    ai_suggestion TEXT COMMENT 'AI-generated suggestion based on feedback',
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES service_requests(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
-- ============================================================
-- REPORT GENERATOR CACHE (Monthly / Yearly)
-- ============================================================
CREATE TABLE generated_reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    report_type ENUM('monthly', 'yearly', 'custom') NOT NULL,
    period_label VARCHAR(50) COMMENT 'e.g. 2025-03 or 2025',
    generated_by INT NOT NULL COMMENT 'Admin user ID',
    report_url VARCHAR(500),
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (generated_by) REFERENCES users(id)
);
-- ============================================================
-- EVENTS / DASHBOARD OF EVENTS
-- ============================================================
CREATE TABLE events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    event_date DATE NOT NULL,
    event_time TIME,
    location VARCHAR(255),
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
);
-- ============================================================
-- VOICE REVIEW SESSIONS
-- ============================================================
CREATE TABLE voice_review_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    thesis_id INT NOT NULL,
    user_id INT NOT NULL,
    transcript LONGTEXT COMMENT 'Voice-to-text transcript',
    ai_feedback LONGTEXT COMMENT 'AI response to voice review',
    audio_url VARCHAR(500),
    duration_seconds INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (thesis_id) REFERENCES thesis_submissions(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
-- ============================================================
-- FORMATTING VALIDATION RESULTS
-- ============================================================
CREATE TABLE formatting_validations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    thesis_id INT NOT NULL,
    checked_by ENUM('ai', 'manual') DEFAULT 'ai',
    format_type ENUM('APA', 'IMRaD', 'MLA', 'other') DEFAULT 'IMRaD',
    result ENUM('pass', 'fail', 'needs_revision') NOT NULL,
    issues_found TEXT COMMENT 'JSON array of issues',
    suggestions TEXT,
    checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (thesis_id) REFERENCES thesis_submissions(id)
);
-- ============================================================
-- INTEGRITY / PLAGIARISM CHECK RESULTS
-- ============================================================
CREATE TABLE integrity_checks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    thesis_id INT NOT NULL,
    similarity_pct DECIMAL(5, 2) COMMENT 'Percentage similarity',
    ai_generated_pct DECIMAL(5, 2) COMMENT 'AI-generated content %',
    result ENUM('pass', 'flagged', 'fail') NOT NULL,
    report_url VARCHAR(500),
    checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (thesis_id) REFERENCES thesis_submissions(id)
);
-- ============================================================
-- USEFUL VIEWS
-- ============================================================
-- Monthly transactions summary
CREATE OR REPLACE VIEW vw_monthly_summary AS
SELECT DATE_FORMAT(p.created_at, '%Y-%m') AS period,
    COUNT(p.id) AS total_transactions,
    SUM(p.amount) AS total_revenue,
    SUM(
        CASE
            WHEN p.status = 'verified' THEN p.amount
            ELSE 0
        END
    ) AS verified_revenue,
    AVG(cs.rating) AS avg_satisfaction
FROM payments p
    LEFT JOIN service_requests sr ON sr.id = p.request_id
    LEFT JOIN customer_satisfaction cs ON cs.request_id = sr.id
GROUP BY period;
-- Thesis repository public view
CREATE OR REPLACE VIEW vw_thesis_public AS
SELECT ts.id,
    ts.title,
    ts.abstract_text,
    ts.year_submitted,
    ts.course,
    ts.keywords,
    u.full_name AS author,
    tr.views,
    tr.downloads,
    tr.published_at
FROM thesis_submissions ts
    JOIN thesis_repository tr ON tr.thesis_id = ts.id
    JOIN users u ON u.id = ts.user_id
WHERE ts.status = 'approved';
-- ============================================================
-- DEFAULT ADMIN ACCOUNT (change password immediately!)
-- password: Admin@AIDEA2025 (bcrypt hashed placeholder)
-- ============================================================
INSERT INTO users (
        student_number,
        full_name,
        email,
        password_hash,
        role,
        is_verified
    )
VALUES (
        'ADMIN-001',
        'AIDEA Administrator',
        'admin@norzagaray.edu.ph',
        '$2y$12$placeholder_hash_change_this',
        'admin',
        1
    );