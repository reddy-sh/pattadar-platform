import asyncio
import time
import types

from fastapi import HTTPException
import pytest

from app import auth
from app.routes_account import check_account_access, require_fresh_auth


def test_fresh_auth_requires_original_login_time_not_refresh_time():
    require_fresh_auth({"auth_time":time.time()-10})
    for claims in ({"iat":time.time()}, {"auth_time":time.time()-301,"iat":time.time()}, {"auth_time":time.time()+20}, {}):
        with pytest.raises(HTTPException) as error:
            require_fresh_auth(claims)
        assert error.value.status_code == 401
        assert error.value.detail["error"] == "REAUTH_REQUIRED"


def test_erased_account_is_blocked_even_with_valid_unexpired_token(monkeypatch):
    from app import routes_account
    monkeypatch.setattr(routes_account.db,"query_native",lambda *args: [{"exists":1}])
    claims = {"iss":"pool","sub":"subject","email":"a@example.com"}
    request = types.SimpleNamespace(method="POST",url=types.SimpleNamespace(path="/api/gateway/pattadar/graphql"))
    with pytest.raises(HTTPException) as error:
        asyncio.run(check_account_access(request,claims))
    assert error.value.status_code == 403
    request.method = "GET"
    request.url.path = "/api/gateway/account/erasure"
    asyncio.run(check_account_access(request,claims))
