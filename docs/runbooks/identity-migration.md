# Subject identity rollout

The gateway authorizes an immutable principal derived from the JWT issuer and
subject. `IDENTITY_LEGACY_BINDINGS` explicitly maps those principals to existing
owner keys so database ownership, assistant history, and S3 paths stay intact.
New accounts use their subject principal. Changing an email has no effect on
ownership. `ADMIN_SUBJECT_IDS` lists principal IDs, independently of owner aliases;
the old `ADMIN_USER_IDS` local-part setting grants no access.

Do not deploy until this preflight is complete. The gateway refuses production
startup if `IDENTITY_LEGACY_BINDINGS` is absent. An empty object is valid only for
an installation without legacy accounts. The local keypair mode retains seeded
local accounts; production never accepts those tokens.

1. Export the entire Cognito pool with an operator's read-only AWS credentials:
   `aws cognito-idp list-users --user-pool-id POOL_ID --output json > cognito-users.json`.
   Do not pass `--no-paginate`; all users must be included. Record export time and
   pool ID with the approved manifest.
2. Inventory **all** API, gateway/hub and assistant databases. The helper accepts
   DSNs via named environment variables and executes read-only queries:
   `python services/gateway/scripts/identity_preflight.py --inventory-dsn-env API_DSN --inventory-dsn-env HUB_DSN --inventory-dsn-env ASSISTANT_DSN --output owners.json`.
   Review sources, include old admin owner keys in `admin_owner_ids`, and set
   `complete` to true only once every active database is represented. Old/demo
   owners must be deliberately assigned or migrated separately; the checker
   refuses silently uncovered owner keys.
3. Produce a reviewed manifest:

   ```json
   {
     "issuer": "https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_POOL",
     "bindings": [{
       "subject": "IMMUTABLE-COGNITO-SUBJECT",
       "owner_id": "existing.owner",
       "evidence": "Independent ownership evidence / migration review reference"
     }],
     "admin_subjects": ["IMMUTABLE-COGNITO-SUBJECT"]
   }
   ```

   A verified email in Cognito is evidence of the **current** login, not proof
   that a legacy local-part account belongs to that person. `users.email` and
   display names are editable and must not be used to automatically claim old
   rows. Resolve collisions using historic trusted identity/provider records or
   an owner-assisted review. Explicitly linked federated subjects additionally
   require `account_link_review` evidence on every binding sharing that owner.
   Never arbitrarily assign combined data from a collision to the first login.
4. Validate and emit deployment environment values:
   `python services/gateway/scripts/identity_preflight.py --manifest approved.json --cognito-export cognito-users.json --owner-inventory owners.json --output identity-env.json`.
   Validation refuses missing owner bindings, ambiguous account links, missing
   evidence, unknown subjects, and omission of existing admins. This command
   reads local exports only and does not modify users or database rows.
5. Configure `IDENTITY_LEGACY_BINDINGS` and `ADMIN_SUBJECT_IDS` from the emitted
   JSON through the normal deployment configuration. Keep the approved inputs
   with the release evidence. Before promotion, compare a refreshed owner/user
   inventory against the manifest to cover registrations during preparation.
6. In staging, sign in as each migrated account and confirm `me.id`, a known
   holding, and a known stored file. Confirm a different subject with the same
   email local part receives an empty new account and no admin access. Existing
   accounts retain their exact owner aliases; no storage objects move.

If a subject has already used a new subject-keyed account, merging that data into
an old owner is a separate reviewed data migration. Do not add a binding that
hides the new account's rows. Unmapping an established binding also hides legacy
rows, so changes to this configuration are migrations requiring the same checks.
