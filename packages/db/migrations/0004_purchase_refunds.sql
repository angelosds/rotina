CREATE TABLE IF NOT EXISTS card_purchase_refund (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  purchase_id text NOT NULL UNIQUE REFERENCES card_purchase(id) ON DELETE RESTRICT,
  refunded_at date NOT NULL,
  refund_invoice_month date NOT NULL CHECK (date_trunc('month', refund_invoice_month)::date = refund_invoice_month),
  credit_cents integer NOT NULL CHECK (credit_cents >= 0),
  refunded_installment_count integer NOT NULL DEFAULT 0 CHECK (refunded_installment_count >= 0),
  canceled_installment_count integer NOT NULL DEFAULT 0 CHECK (canceled_installment_count >= 0),
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS card_purchase_refund_user_month_idx ON card_purchase_refund(user_id, refund_invoice_month);
