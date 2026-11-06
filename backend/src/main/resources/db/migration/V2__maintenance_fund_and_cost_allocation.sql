CREATE TABLE maintenance_fund (
    id UUID PRIMARY KEY,
    code VARCHAR(30) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL,
    opening_balance NUMERIC(18,2) NOT NULL CHECK(opening_balance >= 0),
    opening_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_by UUID NOT NULL REFERENCES app_user(id)
);

CREATE TABLE maintenance_round (
    id UUID PRIMARY KEY,
    fund_id UUID NOT NULL REFERENCES maintenance_fund(id),
    period_id UUID NOT NULL REFERENCES billing_period(id),
    fee_type_id UUID NOT NULL REFERENCES fee_type(id),
    description TEXT NOT NULL,
    allocation_basis VARCHAR(20) NOT NULL CHECK(allocation_basis IN ('EQUAL','PER_M2')),
    total_cost NUMERIC(18,2) NOT NULL CHECK(total_cost > 0),
    snapshot_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_by UUID NOT NULL REFERENCES app_user(id)
);

CREATE TABLE maintenance_allocation (
    id UUID PRIMARY KEY,
    round_id UUID NOT NULL REFERENCES maintenance_round(id),
    occupancy_id UUID NOT NULL REFERENCES household_apartment(id),
    invoice_line_id UUID NOT NULL UNIQUE REFERENCES invoice_line(id),
    weight NUMERIC(12,3) NOT NULL CHECK(weight > 0),
    amount NUMERIC(18,2) NOT NULL CHECK(amount >= 0),
    UNIQUE(round_id,occupancy_id)
);

CREATE TABLE maintenance_expense (
    id UUID PRIMARY KEY,
    fund_id UUID NOT NULL REFERENCES maintenance_fund(id),
    amount NUMERIC(18,2) NOT NULL CHECK(amount > 0),
    spent_at TIMESTAMP WITH TIME ZONE NOT NULL,
    description TEXT NOT NULL,
    recorded_by UUID NOT NULL REFERENCES app_user(id)
);
CREATE INDEX maintenance_round_fund ON maintenance_round(fund_id);
CREATE INDEX maintenance_expense_fund ON maintenance_expense(fund_id);
