DROP TABLE IF EXISTS payouts, collections, rps, deals, loans, pools CASCADE;
CREATE TABLE pools(id SERIAL PRIMARY KEY, name TEXT NOT NULL, originator TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE loans(loan_id TEXT PRIMARY KEY, pool_id INT REFERENCES pools(id) ON DELETE CASCADE, borrower TEXT NOT NULL,
  principal NUMERIC(14,2) NOT NULL, rate NUMERIC(5,2) NOT NULL, tenor INT NOT NULL, region TEXT NOT NULL, credit_score INT, dpd INT DEFAULT 0);
CREATE INDEX ON loans(pool_id); CREATE INDEX ON loans(region);
CREATE TABLE deals(id SERIAL PRIMARY KEY, name TEXT, pool_id INT REFERENCES pools(id), deal_value NUMERIC(16,2), tenure INT,
  senior_pct NUMERIC(5,2), senior_rate NUMERIC(5,2), sub_rate NUMERIC(5,2), target_irr NUMERIC(5,2), servicer_fee_pct NUMERIC(5,2) DEFAULT 0.5,
  start_date DATE DEFAULT CURRENT_DATE, status TEXT DEFAULT 'ACTIVE');
CREATE TABLE rps(deal_id INT REFERENCES deals(id) ON DELETE CASCADE, month INT, due_date DATE, principal NUMERIC(16,2), interest NUMERIC(16,2), PRIMARY KEY(deal_id,month));
CREATE TABLE collections(deal_id INT REFERENCES deals(id) ON DELETE CASCADE, month INT, expected NUMERIC(16,2), actual NUMERIC(16,2), flag TEXT, PRIMARY KEY(deal_id,month));
CREATE TABLE payouts(deal_id INT REFERENCES deals(id) ON DELETE CASCADE, month INT, detail JSONB, PRIMARY KEY(deal_id,month));
