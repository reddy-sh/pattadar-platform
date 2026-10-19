# Pattadar Intelligence provider setup

The settings page is `/app/admin/intelligence`. Only the production Cognito
principal for `sankara.telukutla@gmail.com` is bootstrapped as a super admin in
`infra/terraform/envs/prod/runtime/main.tf`. The grant takes effect when that
runtime is deployed. Local startup also grants that immutable principal; a
reviewed legacy identity binding can map it to the existing local owner ID.

## Prepare credentials

1. Create a Gemini API key with access to `gemini-3.5-flash-lite`. Store it in an
   existing AWS Secrets Manager secret encrypted by the persistent Pattadar CMK.
   Pass its ARN as `gemini_api_key_secret_arn` to the runtime root.
2. Create an Enterprise Document OCR processor in Google Cloud, preferably in
   `asia-south1` for Indian records if that processor version is available
   there. Grant a Google service account permission to process documents on
   the chosen processor. Store its JSON credential in a separate Secrets
   Manager secret encrypted by the same Pattadar CMK, and pass its ARN as
   `google_service_account_secret_arn`. Never enter either credential in the
   browser or commit it to source.
3. Deploy the runtime and API/gateway/web images together. The gateway uses
   the Gemini key only for model discovery; the API uses it for document reads.
   The service-account credential reaches only the API task. A key rotation
   means updating the secret value and restarting the affected tasks.

## Select and test

1. Sign in as the verified super-admin account, open **Pattadar Intelligence**,
   and pull Gemini models from Google. Newly discovered models start disabled.
2. Select and enable the desired model. Enter the OCR processor resource name,
   for example `projects/PROJECT/locations/asia-south1/processors/PROCESSOR`.
   Select Gemini, keep OCR enabled, and save.
3. Test a small Telugu/English passbook and registered document. Confirm the
   extracted fields and page references against the original scan before
   filing. Test a poor scan too; the service should return a reading error,
   never silent empty fields.
4. To roll back, choose Claude and save. Aadhaar KYC and parcel photo screening
   stay on Claude regardless of the document-reading selection. Claude's API
   credential remains in the existing `anthropic-api-key` secret; rotate its
   value in Secrets Manager and restart the affected tasks to change it.

Without a Gemini key, OCR credential, or processor, the API keeps using Claude
for document reading. Google Document AI online OCR has its own page and file
limits; documents above those limits need a separate batch workflow. The
admin page shows configuration, not proof that a cloud processor or credential
has been tested. No provider call is made when settings are saved.
