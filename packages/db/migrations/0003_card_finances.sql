CREATE TABLE IF NOT EXISTS credit_card (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name text NOT NULL,
  closing_day integer NOT NULL CHECK (closing_day BETWEEN 1 AND 28),
  due_day integer NOT NULL CHECK (due_day BETWEEN 1 AND 28),
  credit_limit_cents integer CHECK (credit_limit_cents IS NULL OR credit_limit_cents > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS credit_card_user_idx ON credit_card(user_id);

CREATE TABLE IF NOT EXISTS card_purchase (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  card_id text NOT NULL REFERENCES credit_card(id) ON DELETE RESTRICT,
  title text NOT NULL,
  purchase_date date NOT NULL,
  total_cents integer NOT NULL CHECK (total_cents > 0),
  installment_count integer NOT NULL DEFAULT 1 CHECK (installment_count BETWEEN 1 AND 120),
  first_invoice_month date NOT NULL CHECK (date_trunc('month', first_invoice_month)::date = first_invoice_month),
  project text,
  tags text NOT NULL DEFAULT '[]',
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS card_purchase_user_month_idx ON card_purchase(user_id, first_invoice_month);
CREATE INDEX IF NOT EXISTS card_purchase_card_idx ON card_purchase(card_id);

CREATE TABLE IF NOT EXISTS invoice_payment (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  card_id text NOT NULL REFERENCES credit_card(id) ON DELETE RESTRICT,
  invoice_month date NOT NULL CHECK (date_trunc('month', invoice_month)::date = invoice_month),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  paid_at date NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoice_payment_user_month_idx ON invoice_payment(user_id, invoice_month);
CREATE INDEX IF NOT EXISTS invoice_payment_card_idx ON invoice_payment(card_id);
