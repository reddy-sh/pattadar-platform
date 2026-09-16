#!/usr/bin/env python3
"""Offline, fail-closed identity migration validation. Never writes any database.

Inputs are reviewed subject bindings, an AWS Cognito list-users JSON export,
and an inventory of legacy owner keys from every service database.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path


def principal_id(issuer, subject):
    data = json.dumps([issuer, subject], ensure_ascii=True, separators=(",", ":"))
    return "subject_" + hashlib.sha256(data.encode()).hexdigest()


def validate(manifest, cognito, inventory):
    issuer = manifest.get("issuer", "")
    if not re.fullmatch(r"https://cognito-idp\.[a-z0-9-]+\.amazonaws\.com/[A-Za-z0-9_-]+", issuer):
        raise ValueError("Manifest needs the exact Cognito pool issuer")
    subjects = {}
    for user in cognito.get("Users", []):
        attrs = {a["Name"]: a["Value"] for a in user.get("Attributes", [])}
        sub = attrs.get("sub")
        if not sub or sub in subjects:
            raise ValueError("Cognito inventory has missing or duplicate subjects")
        subjects[sub] = attrs
    owners = set(inventory.get("owner_ids", []))
    if not inventory.get("sources") or not inventory.get("complete"):
        raise ValueError("Owner inventory must identify all database sources and be marked complete")
    reserved = {"", "system", "guest", "anonymous", "local"}
    owners -= reserved
    # Already subject-keyed accounts require no legacy binding.
    owners = {o for o in owners if not re.fullmatch(r"subject_[0-9a-f]{64}", o)}
    bindings = {}
    covered = set()
    for binding in manifest.get("bindings", []):
        sub, owner = binding.get("subject"), binding.get("owner_id")
        if sub not in subjects:
            raise ValueError("Binding subject absent from Cognito inventory")
        if (not isinstance(owner, str) or owner not in owners or owner != owner.strip()
                or owner in reserved or owner.startswith("subject_")
                or any(c in owner for c in "/\\\x00\r\n")):
            raise ValueError("Binding owner absent from legacy inventory or invalid")
        if not str(binding.get("evidence", "")).strip():
            raise ValueError("Every binding needs independently reviewed ownership evidence")
        principal = principal_id(issuer, sub)
        if principal in bindings:
            raise ValueError("A subject cannot be assigned more than one owner")
        # Duplicate local parts and federated subjects must be resolved by a
        # reviewed explicit account link; never merge by first login or email.
        siblings = [b for b in manifest["bindings"] if b.get("owner_id") == owner]
        if len(siblings) > 1 and not all(b.get("account_link_review") for b in siblings):
            raise ValueError("Multiple subjects share an owner: account_link_review required")
        bindings[principal] = owner
        covered.add(owner)
    missing = owners - covered
    if missing:
        raise ValueError("Unmapped existing owner keys: " + ", ".join(sorted(missing)))
    admins = manifest.get("admin_subjects", [])
    for subject in admins:
        if subject not in subjects:
            raise ValueError("Admin subject absent from Cognito inventory")
    # Do not accidentally remove existing administrator access during rollout.
    for owner in inventory.get("admin_owner_ids", []):
        if not any(bindings.get(principal_id(issuer, sub)) == owner for sub in admins):
            raise ValueError("Existing administrator needs an explicit subject binding")
    return {
        "IDENTITY_LEGACY_BINDINGS": json.dumps(bindings, sort_keys=True, separators=(",", ":")),
        "ADMIN_SUBJECT_IDS": ",".join(principal_id(issuer, sub) for sub in admins),
    }


def inventory_databases(dsns):
    """Read owner columns in a repeatable-read, read-only snapshot per DB."""
    import psycopg
    from psycopg import sql
    owners, sources = set(), []
    for dsn in dsns:
        with psycopg.connect(dsn) as conn:
            conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
            db = conn.execute("SELECT current_database()").fetchone()[0]
            rows = conn.execute("""SELECT table_schema, table_name, column_name
                FROM information_schema.columns WHERE table_schema='public'
                AND (column_name IN ('owner_user_id','owner_id','user_id')
                     OR (table_name='users' AND column_name='id'))""").fetchall()
            for schema, table, column in rows:
                query = sql.SQL("SELECT DISTINCT {} FROM {}.{} WHERE {} IS NOT NULL").format(
                    sql.Identifier(column), sql.Identifier(schema), sql.Identifier(table), sql.Identifier(column))
                owners.update(str(row[0]) for row in conn.execute(query).fetchall())
                sources.append(f"{db}.{schema}.{table}.{column}")
    return {"owner_ids": sorted(owners), "sources": sorted(sources), "complete": False,
            "admin_owner_ids": []}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--cognito-export", type=Path)
    parser.add_argument("--owner-inventory", type=Path)
    parser.add_argument("--inventory-dsn-env", action="append", default=[],
                        help="Read DB DSN from named environment variable; never print DSN")
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    if args.inventory_dsn_env:
        import os
        result = inventory_databases([os.environ[name] for name in args.inventory_dsn_env])
    else:
        if not all([args.manifest, args.cognito_export, args.owner_inventory]):
            parser.error("--manifest, --cognito-export and --owner-inventory are required")
        result = validate(*[json.loads(path.read_text()) for path in
                            (args.manifest, args.cognito_export, args.owner_inventory)])
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    args.output.chmod(0o600)


if __name__ == "__main__":
    main()
