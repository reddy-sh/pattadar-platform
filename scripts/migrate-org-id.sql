-- rfactory → pattadar org rename (metadata only; S3 keys carry no org id)
--
-- Checked services/gateway/sql/init.sql for every table with org_id/
-- workspace_id columns: only storage_nodes carries them (storage_versions,
-- storage_shares, storage_tags, storage_node_tags do not) — one table to
-- migrate. Idempotent (WHERE ... = 'rfactory'), safe to re-run.
BEGIN;
UPDATE storage_nodes SET org_id = 'pattadar' WHERE org_id = 'rfactory';
UPDATE storage_nodes SET workspace_id = 'pattadar' WHERE workspace_id = 'rfactory';
COMMIT;
SELECT org_id, workspace_id, count(*) FROM storage_nodes GROUP BY 1, 2;
