-- Purge dummy/seed/orphan rows from the LOCAL pattadar DB (founder request
-- 26/07/2026: "remove all the mock data, it is real application now").
-- Keeps: everything owned by sankara.telukutla (groups, members, notes),
-- reference data (districts/mandals/villages/SRO/fees/deed_types), users.
-- Run:  PGPASSWORD=rhub-dev-pwd psql -h localhost -U rhub -d pattadar -f .local/purge-dummy.sql
BEGIN;
DELETE FROM parcels WHERE passbook_id NOT IN (SELECT id FROM passbooks) OR passbook_id IN ('pb01','pb02','pb03','pb04','pb05','pb06');
DELETE FROM parcel_owners WHERE parcel_id NOT IN (SELECT id FROM parcels);
DELETE FROM passbooks WHERE owner_user_id <> 'sankara.telukutla';
DELETE FROM documents;            -- all rows are dead-ref test uploads (bytes not in local MinIO)
DELETE FROM document_parties;
DELETE FROM registered_documents; -- the '9221' test deed
DELETE FROM beneficiaries;        -- 8 seed rows, empty owner
DELETE FROM family_members WHERE coalesce(owner_user_id,'') <> 'sankara.telukutla';
DELETE FROM groups WHERE owner_user_id <> 'sankara.telukutla' OR name = 'zz-test-delete';
DELETE FROM family_notifiers WHERE group_id NOT IN (SELECT id FROM groups);
DELETE FROM inactivity_escalations WHERE group_id NOT IN (SELECT id FROM groups);
COMMIT;
SELECT 'passbooks' t, count(*) FROM passbooks
UNION ALL SELECT 'parcels', count(*) FROM parcels
UNION ALL SELECT 'documents', count(*) FROM documents
UNION ALL SELECT 'groups', count(*) FROM groups
UNION ALL SELECT 'family_members', count(*) FROM family_members;
