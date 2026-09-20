#!/usr/bin/env python
"""Seed a removable company-member roster for the Administration screen.

    .local/api-venv/bin/python scripts/seed-company-members.py
    .local/api-venv/bin/python scripts/seed-company-members.py --purge

All ids start with ``demo-member-``. The data is fictional, deterministic and
contains no real personal information.
"""
import os
import sys

import psycopg


DSN = os.getenv(
    "APP_PG_DSN",
    "host=localhost port=5432 dbname=pattadar user=rhub password=rhub-dev-pwd",
)
P = "demo-member-"
NOW = "2026-09-20T10:00:00"

MEMBERS = [
    ("anil", "Anil Kumar", "Delta Survey Studio", "9000000001",
     "active", "not_required", "", [("surveyor", 3), ("photo_studio", 2)], 4.7, 128),
    ("meera", "Meera Rao", "Rao Property Law", "meera@example.test",
     "active", "not_required", "", [("advocate", 4)], 4.9, 86),
    ("farah", "Farah Khan", "GreenLine Sites", "9000000003",
     "active", "not_required", "", [("landscaper", 3), ("contractor", 2)], 4.3, 57),
    ("vikram", "Vikram Reddy", "VKR Developments", "9000000004",
     "active", "not_required", "", [("developer", 2)], 4.1, 31),
    ("suresh", "Suresh Babu", "Revenue Services", "9000000005",
     "active", "required", "Rating below 3 after 100 services", [("writer", 3), ("agent", 3)], 2.7, 112),
    ("lakshmi", "Lakshmi Devi", "Independent", "9000000006",
     "paused", "in_training", "Site safety refresher", [("caretaker", 3), ("labour", 2)], 3.8, 104),
]


def purge(conn) -> None:
    conn.execute("DELETE FROM associate_reviews WHERE id LIKE %s", (f"{P}%",))
    conn.execute("DELETE FROM associate_events WHERE id LIKE %s", (f"{P}%",))
    conn.execute("DELETE FROM associate_credentials WHERE id LIKE %s", (f"{P}%",))
    conn.execute("DELETE FROM associate_areas WHERE id LIKE %s", (f"{P}%",))
    conn.execute("DELETE FROM associate_disciplines WHERE id LIKE %s", (f"{P}%",))
    conn.execute("DELETE FROM associates WHERE id LIKE %s", (f"{P}%",))


def seed(conn) -> None:
    purge(conn)
    for slug, name, firm, contact, state, training, training_note, roles, average, count in MEMBERS:
        aid = f"{P}{slug}"
        contact_key = contact.lower() if "@" in contact else contact[-10:]
        conn.execute(
            "INSERT INTO associates"
            " (id,name,firm,contact,contact_key,channel,state,state_reason,note,"
            " training_state,training_note,enrolled_by,created_at)"
            " VALUES (%s,%s,%s,%s,%s,'auto',%s,%s,'Fictional demo member',%s,%s,'demo-seed',%s)",
            (aid, name, firm, contact, contact_key, state,
             "Training in progress" if state == "paused" else "",
             training, training_note, NOW),
        )
        for index, (role, capacity) in enumerate(roles):
            conn.execute(
                "INSERT INTO associate_disciplines"
                " (id,associate_id,discipline,state,capacity,created_at)"
                " VALUES (%s,%s,%s,'on',%s,%s)",
                (f"{P}{slug}-discipline-{index}", aid, role, capacity, NOW),
            )
            conn.execute(
                "INSERT INTO associate_credentials"
                " (id,associate_id,discipline,kind,authority,review,reviewed_by,reviewed_at,created_at)"
                " VALUES (%s,%s,%s,'Company verification','Pattadar','verified','demo-seed',%s,%s)",
                (f"{P}{slug}-credential-{index}", aid, role, NOW, NOW),
            )
        conn.execute(
            "INSERT INTO associate_areas"
            " (id,associate_id,level,name,name_key,created_at)"
            " VALUES (%s,%s,'district','Prakasam','prakasam',%s)",
            (f"{P}{slug}-area", aid, NOW),
        )
        total = round(average * count)
        ratings = [1] * count
        extra = total - count
        for index in range(count):
            add = min(4, extra)
            ratings[index] += add
            extra -= add
        for index, rating in enumerate(ratings):
            conn.execute(
                "INSERT INTO associate_reviews"
                " (id,associate_id,ticket_id,owner_user_id,rating,note,created_at,updated_at)"
                " VALUES (%s,%s,%s,'demo-owner',%s,'',%s,%s)",
                (f"{P}{slug}-review-{index}", aid,
                 f"{P}{slug}-ticket-{index}", rating, NOW, NOW),
            )
        conn.execute(
            "INSERT INTO associate_events"
            " (id,associate_id,kind,headline,detail,actor,actor_kind,actor_label,at)"
            " VALUES (%s,%s,'enrolled','Demo member added','Fictional sample data',"
            " 'demo-seed','system','Demo seed',%s)",
            (f"{P}{slug}-event", aid, NOW),
        )


if __name__ == "__main__":
    with psycopg.connect(DSN, autocommit=True) as connection:
        if "--purge" in sys.argv:
            purge(connection)
            print("Removed demo company members.")
        else:
            seed(connection)
            print(f"Seeded {len(MEMBERS)} demo company members.")
