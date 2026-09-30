"""Invitation truthfulness, invitee claim + heir tasks, and referral attribution.

Runs against the isolated temporary PostgreSQL from test_invitation_security;
no application database is contacted and no message leaves the process
(`notify.notify_contact` is replaced).
"""
import asyncio
from contextlib import asynccontextmanager
from datetime import date, timedelta
import types

import psycopg
from psycopg.rows import dict_row
import pytest

from src import growth, main
from tests.test_invitation_security import isolated_postgres  # noqa: F401  (fixture)


def ctx(owner=None):
    return types.SimpleNamespace(request=types.SimpleNamespace(headers={"x-user-id": owner} if owner else {}))


def run(query, owner=None, **variables):
    async def go():
        return await main.schema.execute(query, variable_values=variables or None,
                                         context_value={"request": ctx(owner).request})
    return asyncio.run(go())


SCHEMA = """
DROP SCHEMA public CASCADE; CREATE SCHEMA public;
CREATE TABLE invitations (id text primary key,scope_type text,scope_id text,role text default 'view',invitee_contact text default '',token text,expiry text,status text,created_at text default '');
CREATE TABLE family_members (id text primary key,owner_user_id text,legacy_beneficiary_id text default '',group_id text default '',status text,invite_token text,invite_channel text default 'email',email_verified boolean default false,phone_verified boolean default false,inactivity_email_consent boolean default false,inactivity_email_consent_at text default '',name text default 'Person',phone text default '',email text default '',guardian_contact text default '',is_minor boolean default false,relation text default 'son',parcel_id text default '',share_pct float default 25,kind text default 'coowner',dob text default '',present_address text default '',gender text default '',marital_status text default '',spouse_name text default '',created_at text default '');
CREATE TABLE beneficiaries (id text primary key,owner_user_id text,parcel_id text default '',status text,invite_token text,person_name text default 'Person',person_contact text default '',relationship text default '',share_pct float default 0,kind text default 'nominee');
CREATE TABLE groups (id text primary key,name text default '',owner_user_id text default '');
CREATE TABLE users (id text primary key,name text default '');
CREATE TABLE passbooks (id text primary key,owner_user_id text);
CREATE TABLE properties (id text primary key,owner_user_id text);
CREATE TABLE parcels (id text primary key,passbook_id text);
CREATE TABLE documents (id text primary key,owner_user_id text);
CREATE TABLE audit_events (id text,actor text,action text,target text,details text,timestamp text);
INSERT INTO users VALUES ('owner','Telukutla Shankar Reddy'),('heir','Ravi Kumar');
INSERT INTO passbooks VALUES ('pb1','owner'); INSERT INTO parcels VALUES ('p1','pb1');
"""


@pytest.fixture
def db(isolated_postgres, monkeypatch):  # noqa: F811
    with psycopg.connect(isolated_postgres, autocommit=True) as conn:
        conn.execute(SCHEMA)
        for statement in growth.DDL:
            conn.execute(statement)

    class Pool:
        @asynccontextmanager
        async def connection(self):
            async with await psycopg.AsyncConnection.connect(
                    isolated_postgres, autocommit=True, row_factory=dict_row) as conn:
                yield conn
    monkeypatch.setattr(main, "pool", Pool())
    sent = []

    async def fake_notify(conn, contact, subject, body, owner=""):
        sent.append((contact, body))
        return {"ok": False, "status": "failed", "channel": "email"}
    monkeypatch.setattr(main.notify, "notify_contact", fake_notify)
    monkeypatch.setenv("APP_PUBLIC_URL", "https://pattadar.test")
    return types.SimpleNamespace(dsn=isolated_postgres, sent=sent)


def sql(db, q, *a):
    with psycopg.connect(db.dsn, autocommit=True, row_factory=dict_row) as conn:
        return conn.execute(q, a).fetchall() if q.lstrip().upper().startswith("SELECT") else conn.execute(q, a)


CREATE = """mutation($st:String!,$sid:String!,$role:String!,$c:String!,$e:String!){
  createInvitation(scopeType:$st,scopeId:$sid,role:$role,inviteeContact:$c,expiry:$e){ id token deliveryStatus } }"""


def in_days(n):
    return (date.today() + timedelta(days=n)).isoformat()


def test_created_invitation_is_hashed_reports_delivery_and_never_names_the_land(db):
    r = run(CREATE, "owner", st="parcel", sid="p1", role="view", c="ravi@example.com", e=in_days(30))
    assert r.errors is None
    out = r.data["createInvitation"]
    assert out["deliveryStatus"] == "failed"
    assert out["token"].startswith("/i/")
    raw = out["token"][3:]
    row = sql(db, "SELECT token, owner_user_id FROM invitations")[0]
    assert row["token"] == main._capability_hash(raw) and row["owner_user_id"] == "owner"
    assert db.sent and "p1" not in db.sent[0][1] and raw in db.sent[0][1]
    # A read never returns the link.
    listed = run("{ invitations { token } }", "owner").data["invitations"]
    assert listed == [{"token": ""}]


@pytest.mark.parametrize("st,sid,role,c,e", [
    ("document", "p1", "view", "a@b.co", 30),   # scope nobody can redeem
    ("parcel", "p1", "claim", "a@b.co", 30),    # role nothing enforces
    ("parcel", "p1", "view", "not a contact", 30),
    ("parcel", "p1", "view", "a@b.co", -1),     # in the past
    ("parcel", "p1", "view", "a@b.co", 400),    # beyond a year
])
def test_invalid_invitations_are_refused(db, st, sid, role, c, e):
    assert run(CREATE, "owner", st=st, sid=sid, role=role, c=c, e=in_days(e)).errors
    assert sql(db, "SELECT count(*) AS n FROM invitations")[0]["n"] == 0


def test_stranger_cannot_invite_to_someone_elses_parcel(db):
    assert run(CREATE, "stranger", st="parcel", sid="p1", role="view", c="a@b.co", e=in_days(5)).errors


def test_owner_can_only_revoke(db):
    r = run(CREATE, "owner", st="passbook", sid="pb1", role="manage", c="9876543210", e=in_days(5))
    iid = r.data["createInvitation"]["id"]
    q = 'mutation($id:String!,$s:String!){ updateInvitationStatus(id:$id,status:$s){ status } }'
    assert run(q, "owner", id=iid, s="accepted").errors
    assert run(q, "owner", id=iid, s="revoked").data["updateInvitationStatus"]["status"] == "revoked"


def test_co_manage_claim_binds_the_account_and_attributes_a_referral(db):
    raw = run(CREATE, "owner", st="parcel", sid="p1", role="view", c="ravi@example.com",
              e=in_days(10)).data["createInvitation"]["token"][3:]
    prev = run("query($t:String!){ invitePreview(token:$t){ state purpose inviter } }", None, t=raw)
    assert prev.errors is None
    assert prev.data["invitePreview"] == {"state": "live", "purpose": "co_manage", "inviter": "Telukutla R."}
    claim = 'mutation($t:String!){ claimInvitation(token:$t){ purpose } }'
    assert run(claim, "owner", t=raw).errors  # the sender cannot claim their own invitation
    assert run(claim, "heir", t=raw).data["claimInvitation"]["purpose"] == "co_manage"
    assert run(claim, "heir", t=raw).errors  # single use
    inv = sql(db, "SELECT status, token, accepted_by FROM invitations")[0]
    assert inv == {"status": "accepted", "token": "", "accepted_by": "heir"}
    att = sql(db, "SELECT owner_user_id, referrer_user_id, source FROM referral_attributions")
    assert att == [{"owner_user_id": "heir", "referrer_user_id": "owner", "source": "invitation"}]


def test_heir_claim_links_member_and_leaves_tasks_until_the_profile_is_done(db):
    token = "heir-secret"
    sql(db, "INSERT INTO family_members (id,owner_user_id,status,invite_token,email) "
            "VALUES ('m1','owner','pending',%s,'ravi@example.com')", main._capability_hash(token))
    sql(db, "INSERT INTO invitations (id,scope_type,scope_id,invitee_contact,token,expiry,status) "
            "VALUES ('i1','beneficiary','m1','ravi@example.com',%s,'2999-01-01','pending')",
        main._capability_hash(token))
    r = run('mutation($t:String!){ claimInvitation(token:$t, inactivityEmailConsent:true){ memberId } }',
            "heir", t=token)
    assert r.errors is None and r.data["claimInvitation"]["memberId"] == "m1"
    assert sql(db, "SELECT status, linked_principal FROM family_members")[0] == \
        {"status": "verified", "linked_principal": "heir"}

    tasks_q = "{ setupTasks { kind done route } }"
    kinds = {t["kind"]: t for t in run(tasks_q, "heir").data["setupTasks"]}
    assert set(kinds) == {"heir_confirm", "heir_profile", "first_record"}
    assert not any(t["done"] for t in kinds.values())
    assert kinds["heir_profile"]["route"] == "/app/heir/m1"

    # Nobody else can edit the heir's row through the heir mutation.
    upd = ('mutation($m:String!,$d:String!,$a:String!,$s:String!){ updateMyHeirProfile(memberId:$m,dob:$d,'
           'presentAddress:$a,maritalStatus:$s) }')
    assert run(upd, "stranger", m="m1", d="1990-01-01", a="Markapur", s="").errors
    assert run(upd, "heir", m="m1", d="1990-01-01", a="Markapur", s="married").errors  # spouse missing
    assert run(upd, "heir", m="m1", d="1990-01-01", a="Markapur", s="").data["updateMyHeirProfile"] is True

    conf = 'mutation($m:String!,$g:Boolean!,$n:String!){ confirmMyHeirDetails(memberId:$m,agree:$g,note:$n) }'
    assert run(conf, "heir", m="m1", g=False, n="").errors  # a correction must say what
    assert run(conf, "heir", m="m1", g=False, n="My share is 50%").errors is None
    kinds = {t["kind"]: t["done"] for t in run(tasks_q, "heir").data["setupTasks"]}
    assert kinds == {"heir_confirm": True, "heir_profile": True, "first_record": False}
    person = sql(db, "SELECT heir_confirmed, heir_note, dob FROM family_members")[0]
    assert person == {"heir_confirmed": "disputed", "heir_note": "My share is 50%", "dob": "1990-01-01"}


def test_referral_code_attributes_once_and_rewards_on_first_record(db, monkeypatch):
    monkeypatch.setenv("REFERRAL_REWARD_CREDITS", "2")
    code = run("{ myReferral { code path } }", "owner").data["myReferral"]["code"]
    assert code.startswith("TELUKUTL") or code[:2].isalpha()
    redeem = 'mutation($c:String!){ redeemReferralCode(code:$c) }'
    assert run(redeem, "owner", c=code).data["redeemReferralCode"] is False   # self
    assert run(redeem, "heir", c="NOPE123").data["redeemReferralCode"] is False
    assert run(redeem, "heir", c=code).data["redeemReferralCode"] is True
    assert run(redeem, "heir", c=code).data["redeemReferralCode"] is False    # once

    s = run("{ myReferral { joined qualified creditsEarned } }", "owner").data["myReferral"]
    assert s == {"joined": 1, "qualified": 0, "creditsEarned": 0}
    sql(db, "INSERT INTO properties VALUES ('pr1','heir')")
    s = run("{ myReferral { joined qualified creditsEarned } }", "owner").data["myReferral"]
    assert s == {"joined": 1, "qualified": 1, "creditsEarned": 2}
    heir = run("{ myReferral { creditsEarned referredBy } }", "heir").data["myReferral"]
    assert heir == {"creditsEarned": 2, "referredBy": "Telukutla R."}


def test_an_account_with_records_is_not_attributed(db):
    code = run("{ myReferral { code } }", "owner").data["myReferral"]["code"]
    sql(db, "INSERT INTO properties VALUES ('pr9','heir')")
    assert run('mutation($c:String!){ redeemReferralCode(code:$c) }', "heir", c=code).data["redeemReferralCode"] is False


def test_preview_of_an_unknown_token_says_nothing(db):
    r = run('query { invitePreview(token:"nope") { state purpose inviter } }')
    assert r.data["invitePreview"] == {"state": "invalid", "purpose": "", "inviter": ""}
