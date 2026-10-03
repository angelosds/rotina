CREATE TABLE IF NOT EXISTS bill (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  title text NOT NULL,
  estimated_amount_cents integer NOT NULL CHECK (estimated_amount_cents > 0),
  first_due_date date NOT NULL,
  due_day integer NOT NULL CHECK (due_day BETWEEN 1 AND 31),
  recurrence text NOT NULL CHECK (recurrence IN ('once', 'monthly')),
  project text,
  tags text NOT NULL DEFAULT '[]',
  active boolean NOT NULL DEFAULT true,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bill_user_due_idx ON bill(user_id, first_due_date);

CREATE TABLE IF NOT EXISTS bill_payment (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  bill_id text NOT NULL REFERENCES bill(id) ON DELETE RESTRICT,
  due_date date NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  paid_at date NOT NULL,
  payment_method text CHECK (payment_method IS NULL OR payment_method IN ('pix', 'cash', 'debit', 'bank_transfer', 'automatic_debit', 'other')),
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bill_id, due_date)
);
CREATE INDEX IF NOT EXISTS bill_payment_user_date_idx ON bill_payment(user_id, due_date);
