-- Sprint 1 baseline. JSON snapshots are stored as TEXT for PostgreSQL/H2 portability.

CREATE TABLE building (
    id UUID PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL,
    address TEXT NOT NULL
);

CREATE TABLE apartment (
    id UUID PRIMARY KEY,
    building_id UUID NOT NULL,
    code VARCHAR(20) NOT NULL,
    floor_no INTEGER NOT NULL,
    area_m2 NUMERIC(10,2) NOT NULL CHECK (area_m2 >= 0),
    status VARCHAR(20) NOT NULL CHECK (status IN ('VACANT','OCCUPIED','INACTIVE')),
    UNIQUE(building_id, code),
    CHECK(area_m2 > 0)
);

CREATE TABLE household (
    id UUID PRIMARY KEY,
    code VARCHAR(30) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    closed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE household_apartment (
    id UUID PRIMARY KEY,
    household_id UUID NOT NULL,
    apartment_id UUID NOT NULL,
    valid_from DATE NOT NULL,
    valid_to DATE,
    CHECK(valid_to IS NULL OR valid_to > valid_from)
);

CREATE TABLE resident (
    id UUID PRIMARY KEY,
    full_name VARCHAR(120) NOT NULL,
    identity_no VARCHAR(30) UNIQUE,
    birth_date DATE NOT NULL,
    gender VARCHAR(20) NOT NULL CHECK (gender IN ('MALE','FEMALE','OTHER','UNSPECIFIED')),
    phone VARCHAR(20)
);

CREATE TABLE household_member (
    id UUID PRIMARY KEY,
    household_id UUID NOT NULL,
    resident_id UUID NOT NULL,
    relationship VARCHAR(30) NOT NULL,
    is_head BOOLEAN NOT NULL,
    valid_from DATE NOT NULL,
    valid_to DATE,
    CHECK(valid_to IS NULL OR valid_to > valid_from)
);

CREATE TABLE app_user (
    id UUID PRIMARY KEY,
    resident_id UUID UNIQUE,
    username VARCHAR(60) NOT NULL UNIQUE,
    display_name VARCHAR(120) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('ACTIVE','LOCKED','DISABLED')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    password_hash VARCHAR(255) NOT NULL
);

CREATE TABLE app_role (
    id UUID PRIMARY KEY,
    code VARCHAR(30) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL
);

CREATE TABLE app_permission (
    id UUID PRIMARY KEY,
    code VARCHAR(80) NOT NULL UNIQUE,
    description TEXT NOT NULL
);

CREATE TABLE residence_change (
    id UUID PRIMARY KEY,
    household_id UUID NOT NULL,
    resident_id UUID,
    target_household_id UUID,
    requested_by UUID NOT NULL,
    approved_by UUID,
    change_type VARCHAR(30) NOT NULL CHECK (change_type IN ('MOVE_IN','MOVE_OUT','TRANSFER','TEMPORARY_ABSENCE','TEMPORARY_RESIDENCE')),
    effective_from DATE NOT NULL,
    effective_to DATE,
    status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
    details TEXT NOT NULL
);

CREATE TABLE vehicle (
    id UUID PRIMARY KEY,
    household_id UUID NOT NULL,
    plate_no VARCHAR(20) NOT NULL,
    vehicle_type VARCHAR(20) NOT NULL CHECK (vehicle_type IN ('MOTORBIKE','CAR','BICYCLE','OTHER')),
    registered_from DATE NOT NULL,
    registered_to DATE
);

CREATE TABLE fee_type (
    id UUID PRIMARY KEY,
    code VARCHAR(30) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL,
    basis VARCHAR(20) NOT NULL CHECK (basis IN ('PER_APARTMENT','PER_M2','PER_PERSON','PER_VEHICLE','ACTUAL')),
    mandatory BOOLEAN NOT NULL,
    active BOOLEAN NOT NULL
);
