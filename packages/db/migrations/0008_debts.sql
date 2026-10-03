CREATE TABLE IF NOT EXISTS debt (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  title text NOT NULL,
  original_balance_cents integer NOT NULL CHECK (original_balance_cents > 0),
  installment_count integer NOT NULL CHECK (installment_count BETWEEN 1 AND 600),
  installment_cents integer NOT NULL CHECK (installment_cents > 0),
  first_due_date date NOT NULL,
  due_day integer NOT NULL CHECK (due_day BETWEEN 1 AND 28),
  project text,
  tags text NOT NULL DEFAULT '[]',
  active boolean NOT NULL DEFAULT true,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS debt_user_due_idx ON debt(user_id, first_due_date);

CREATE TABLE IF NOT EXISTS debt_payment (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  debt_id text NOT NULL REFERENCES debt(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('regular', 'extra')),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  paid_at date NOT NULL,
  payment_method text CHECK (payment_method IS NULL OR payment_method IN ('pix', 'cash', 'debit', 'bank_transfer', 'automatic_debit', 'other')),
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS debt_payment_user_date_idx ON debt_payment(user_id, paid_at);
CREATE INDEX IF NOT EXISTS debt_payment_debt_idx ON debt_payment(debt_id);
