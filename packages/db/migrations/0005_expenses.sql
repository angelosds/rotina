CREATE TABLE IF NOT EXISTS expense (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  title text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  spent_at date NOT NULL,
  payment_method text NOT NULL CHECK (payment_method IN ('pix', 'cash', 'debit', 'meal_voucher', 'food_voucher')),
  project text,
  tags text NOT NULL DEFAULT '[]',
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS expense_user_date_idx ON expense(user_id, spent_at);
