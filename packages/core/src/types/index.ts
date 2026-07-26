/**
 * Seed domain types. This grows in Phase 2 as predecessor modules are ported in
 * (land, dashboard, documents, storage — see the PORT MAP in the README)
 * and as GraphQL codegen output replaces hand-written operation types.
 */

/** Cognito-derived user identifier (gateway injects it as x-user-id). */
export type UserId = string;

/** Identifier of a node (file or folder) in the S3-backed document store. */
export type StorageNodeId = string;

/** ISO 8601 date string (YYYY-MM-DD) as returned by the API. */
export type ISODateString = string;
