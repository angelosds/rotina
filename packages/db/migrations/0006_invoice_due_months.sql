UPDATE card_purchase AS purchase
SET first_invoice_month = (
  date_trunc('month', purchase.purchase_date)::date
  + CASE
      WHEN extract(day FROM purchase.purchase_date)::integer > card.closing_day
      THEN interval '1 month'
      ELSE interval '0 month'
    END
  + CASE
      WHEN card.due_day <= card.closing_day
      THEN interval '1 month'
      ELSE interval '0 month'
    END
)::date,
updated_at = now()
FROM credit_card AS card
WHERE card.id = purchase.card_id;

UPDATE invoice_payment AS payment
SET invoice_month = (payment.invoice_month + interval '1 month')::date,
updated_at = now()
FROM credit_card AS card
WHERE card.id = payment.card_id
  AND card.due_day <= card.closing_day;
