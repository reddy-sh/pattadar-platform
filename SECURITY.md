# Security Policy

## Reporting a vulnerability

Please report security issues privately to **sankara.telukutla@gmail.com**. Do not open public issues for vulnerabilities. You will receive an acknowledgement within 72 hours.

## Scope notes

- `services/api` trusts the `x-user-id` header by contract and must only ever be reachable through `services/gateway`. Reports demonstrating direct reachability are high severity.
- User documents (Aadhaar cards, land deeds) are the most sensitive data class — anything affecting the S3 documents bucket, storage authorization, or share-token routes is treated as critical.

## Supported versions

Only the `main` branch is supported. Compliance posture and controls: see `docs/compliance/`.
