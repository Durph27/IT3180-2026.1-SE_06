-- Self-registered residents wait here; app_user and resident rows exist only after approval.
CREATE TABLE account_registration (
    id UUID PRIMARY KEY,
    username VARCHAR(60) NOT NULL,
    password_hash VARCHAR(255),
    full_name VARCHAR(120) NOT NULL,
    identity_no VARCHAR(30) NOT NULL,
    birth_date DATE NOT NULL,
    gender VARCHAR(20) NOT NULL CHECK (gender IN ('MALE','FEMALE','OTHER','UNSPECIFIED')),
    phone VARCHAR(20),
    apartment_code VARCHAR(30) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING','APPROVED','REJECTED')),
    reject_reason VARCHAR(1000),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    reviewed_by UUID REFERENCES app_user(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    user_id UUID REFERENCES app_user(id)
);

CREATE INDEX account_registration_status ON account_registration(status, created_at);
CREATE INDEX account_registration_username ON account_registration(username);
