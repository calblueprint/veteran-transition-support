-- TEMPORARY development RLS policies for VTS.
-- Enables RLS on every table (in case it wasn't already), then adds a
-- permissive "allow all" policy so dev work isn't blocked while
-- participant/admin auth is still unbuilt.
--
-- TODO before this project touches real participant data: replace every
-- policy below with real ones scoped to auth.uid() and admin/participant
-- roles.

ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE id_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE participant_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE workshops ENABLE ROW LEVEL SECURITY;
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "DEV allow all - participants" ON participants FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "DEV allow all - admin_users" ON admin_users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "DEV allow all - id_verifications" ON id_verifications FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "DEV allow all - certifications" ON certifications FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "DEV allow all - participant_certifications" ON participant_certifications FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "DEV allow all - workshops" ON workshops FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "DEV allow all - registrations" ON registrations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "DEV allow all - job_postings" ON job_postings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "DEV allow all - job_matches" ON job_matches FOR ALL USING (true) WITH CHECK (true);