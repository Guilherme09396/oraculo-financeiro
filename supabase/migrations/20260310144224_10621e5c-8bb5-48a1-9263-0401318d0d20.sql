
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS receipt_url text;
ALTER TABLE public.future_transactions ADD COLUMN IF NOT EXISTS receipt_url text;
ALTER TABLE public.future_transactions ADD COLUMN IF NOT EXISTS paid_at date;

INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', true);

CREATE POLICY "Upload receipts" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Public read receipts" ON storage.objects FOR SELECT TO public USING (bucket_id = 'receipts');
CREATE POLICY "Delete own receipts" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);
