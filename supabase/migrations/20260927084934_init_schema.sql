-- Veteran Transition Support (VTS) - Participant Portal Schema
-- Draft for DrawSQL import. Adjust freely.

CREATE TYPE military_branch AS ENUM ('army', 'navy', 'air_force', 'marines', 'coast_guard', 'space_force');
CREATE TYPE education_level AS ENUM ('high_school', 'some_college', 'associates', 'bachelors', 'masters', 'doctorate');
CREATE TYPE document_type AS ENUM ('military_id', 'dd214', 'drivers_license', 'other');
CREATE TYPE verification_status AS ENUM ('pending', 'verified', 'failed', 'manual_review');
CREATE TYPE attendance_status AS ENUM ('registered', 'attended', 'no_show', 'cancelled');
CREATE TYPE admin_role AS ENUM ('staff', 'admin', 'super_admin');
CREATE TYPE match_status AS ENUM ('suggested', 'applied', 'hired', 'dismissed');

CREATE TABLE participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR NOT NULL,
    last_name VARCHAR NOT NULL,
    email VARCHAR NOT NULL,
    phone_number VARCHAR,
    military_branch military_branch,
    rank VARCHAR,
    mos VARCHAR,
    service_start_date DATE,
    service_end_date DATE,
    education_level education_level,
    resume_url VARCHAR,
    duplicate_of_participant_id UUID REFERENCES participants(id),
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR NOT NULL,
    name VARCHAR NOT NULL,
    role admin_role NOT NULL DEFAULT 'staff',
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE id_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id UUID NOT NULL REFERENCES participants(id),
    document_type document_type NOT NULL,
    document_image_url VARCHAR NOT NULL,
    ocr_extracted_data JSONB,
    verification_status verification_status NOT NULL DEFAULT 'pending',
    verified_by UUID REFERENCES admin_users(id),
    verified_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE certifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR NOT NULL,
    issuing_org VARCHAR,
    description VARCHAR
);

CREATE TABLE participant_certifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id UUID NOT NULL REFERENCES participants(id),
    certification_id UUID NOT NULL REFERENCES certifications(id),
    date_earned DATE,
    expiration_date DATE,
    certificate_file_url VARCHAR
);

CREATE TABLE workshops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR NOT NULL,
    description VARCHAR,
    start_date DATE,
    end_date DATE,
    eventbrite_event_id VARCHAR,
    capacity INT,
    location VARCHAR
);

CREATE TABLE registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id UUID NOT NULL REFERENCES participants(id),
    workshop_id UUID NOT NULL REFERENCES workshops(id),
    registration_date DATE NOT NULL DEFAULT CURRENT_DATE,
    attendance_status attendance_status NOT NULL DEFAULT 'registered'
);

-- Semester 2 stubs, included now so the ERD doesn't need reshaping later
CREATE TABLE job_postings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employer_name VARCHAR NOT NULL,
    title VARCHAR NOT NULL,
    description VARCHAR,
    posted_date DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE job_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id UUID NOT NULL REFERENCES participants(id),
    job_posting_id UUID NOT NULL REFERENCES job_postings(id),
    match_score NUMERIC,
    status match_status NOT NULL DEFAULT 'suggested'
);