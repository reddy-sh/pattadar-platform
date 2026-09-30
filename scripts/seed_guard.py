"""One gate in front of every script that writes invented rows.

Why this exists: the four seed scripts and the e2e purge all read
``APP_PG_DSN`` with a localhost default and no check of any kind. Point that
variable somewhere else — a copied shell, a sourced .env, a tunnelled port —
and they write fabricated khatas, survey numbers, rupee valuations and people
into whatever database answers. ``seed-demo-data.py`` is the worst of them,
because it does not only add ``demo-`` rows: it stamps base fields onto records
that were empty, and a real record that comes back with eight generated papers,
fifteen photos and a pin 200 km from its own village has been corrupted rather
than decorated. That has already happened once to a hand-filed parcel; it is
written up at ``tests/e2e-web360/global-setup.ts:19-24``.

The id-prefix scoping those scripts already have limits the *cleanup*, not the
*writing*. This limits the writing.

Local means local: a loopback host, a container's gateway, or a unix socket.
Anything else stops, and the operator is told which host it refused and what to
do about it. The override is deliberately awkward to type and never implied by
``--force`` or a `-y` flag, because a seeder aimed at a shared database is a
data-integrity decision and not a keystroke.

Nothing here prints the DSN. It carries a password.
"""
import os
import sys
from urllib.parse import urlsplit

#: Loopback, the Docker host gateway, and "" for a unix-socket DSN.
LOCAL_HOSTS = frozenset({
    "", "localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0", "host.docker.internal",
})

OVERRIDE_ENV = "PATTADAR_SEED_ALLOW_REMOTE"
OVERRIDE_VALUE = "yes-write-invented-rows-to-this-database"


def dsn_host(dsn: str) -> str:
    """The host a libpq DSN points at, in either accepted spelling.

    Keyword form wins when both could parse, because that is what the scripts
    default to. A DSN with no host at all is a unix socket, which is local.

    >>> dsn_host("host=localhost port=5432 dbname=pattadar user=rhub")
    'localhost'
    >>> dsn_host("dbname=pattadar user=rhub")
    ''
    >>> dsn_host("postgresql://rhub:pw@db.example.internal:5432/pattadar")
    'db.example.internal'
    >>> dsn_host("postgres://rhub@127.0.0.1/pattadar")
    '127.0.0.1'
    >>> dsn_host("  HOST = 10.0.3.9  port=5432 ")
    '10.0.3.9'
    """
    text = (dsn or "").strip()
    if "://" in text:
        return (urlsplit(text).hostname or "").strip().lower()
    # Keyword/value form. Split on whitespace, tolerate spaces around '='.
    parts = text.replace("=", " = ").split()
    for i, token in enumerate(parts):
        if token.lower() == "host" and i + 2 < len(parts) and parts[i + 1] == "=":
            return parts[i + 2].strip().strip("'\"").lower()
    return ""


def is_local_dsn(dsn: str) -> bool:
    """>>> is_local_dsn("host=localhost dbname=pattadar"), is_local_dsn("host=rds.aws dbname=p")
    (True, False)
    """
    return dsn_host(dsn) in LOCAL_HOSTS


#: What a seeder does, for the refusal message. A purge passes its own.
WRITES_FABRICATED = ("writes fabricated records — invented owners, khatas, survey"
                     " numbers, valuations and people")


def require_local_dsn(dsn: str, script: str = "", action: str = WRITES_FABRICATED) -> None:
    """Stop unless the DSN is local, or the override is set to its exact value.

    Exits 2 rather than raising: these are operator scripts, and a traceback
    reads as a bug in the script instead of a refusal to touch the database.
    """
    if is_local_dsn(dsn):
        return

    host = dsn_host(dsn) or "(unset)"
    name = script or os.path.basename(sys.argv[0]) or "this script"

    if os.getenv(OVERRIDE_ENV) == OVERRIDE_VALUE:
        print(f"WARNING: {name} {action} against a NON-LOCAL host: {host}", file=sys.stderr)
        print(f"         {OVERRIDE_ENV} is set, so it was allowed.", file=sys.stderr)
        return

    print(f"refusing to run: APP_PG_DSN points at '{host}', which is not local.",
          file=sys.stderr)
    print(f"  {name} {action}.", file=sys.stderr)
    print("  It is for a local development database only.", file=sys.stderr)
    print(f"  If this really is what you want: {OVERRIDE_ENV}={OVERRIDE_VALUE}",
          file=sys.stderr)
    sys.exit(2)
