
INSERT INTO storage.buckets (id, name, public)
VALUES ('complaint-media', 'complaint-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone authenticated can read complaint media"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'complaint-media');

CREATE POLICY "Users upload own complaint media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'complaint-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own complaint media"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'complaint-media' AND auth.uid()::text = (storage.foldername(name))[1]);
