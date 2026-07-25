"""Cognito pre-token-generation trigger (V2_0 event version).

Copies the user's email — lowercased — into BOTH the access token and the id
token, so the gateway can derive the platform user id (email local-part,
lowercased) from whichever token it receives, without a userinfo round-trip.
"""


def handler(event, context):
    email = (event["request"]["userAttributes"].get("email") or "").strip().lower()
    claims = {"email": email} if email else {}

    event["response"]["claimsAndScopeOverrideDetails"] = {
        "idTokenGeneration": {"claimsToAddOrOverride": claims},
        "accessTokenGeneration": {"claimsToAddOrOverride": claims},
    }
    return event
