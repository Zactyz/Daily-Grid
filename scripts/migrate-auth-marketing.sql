-- Marketing email opt-in for account holders (run once)

ALTER TABLE users ADD COLUMN marketing_opt_in INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN marketing_opt_in_at DATETIME;
