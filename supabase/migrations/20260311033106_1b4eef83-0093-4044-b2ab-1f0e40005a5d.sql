-- Credit cards table
CREATE TABLE public.credit_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  card_limit numeric NOT NULL DEFAULT 0,
  closing_day integer NOT NULL DEFAULT 1,
  due_day integer NOT NULL DEFAULT 10,
  color text DEFAULT '#6366f1',
  icon text DEFAULT '💳',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own cards" ON public.credit_cards FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own cards" ON public.credit_cards FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own cards" ON public.credit_cards FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own cards" ON public.credit_cards FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_credit_cards_updated_at BEFORE UPDATE ON public.credit_cards FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add card_id to transactions and future_transactions
ALTER TABLE public.transactions ADD COLUMN card_id uuid REFERENCES public.credit_cards(id) ON DELETE SET NULL;
ALTER TABLE public.future_transactions ADD COLUMN card_id uuid REFERENCES public.credit_cards(id) ON DELETE SET NULL;

-- Add installment_group to future_transactions for cascade operations
ALTER TABLE public.future_transactions ADD COLUMN installment_group uuid;