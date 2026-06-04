DROP POLICY IF EXISTS "Anyone can read invoice PDFs" ON storage.objects;
CREATE POLICY "Auth users read invoice PDFs" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'invoices');