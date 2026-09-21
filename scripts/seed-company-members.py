#!/usr/bin/env python
"""Seed a removable company-member roster for the Administration screen.

    .local/api-venv/bin/python scripts/seed-company-members.py
    .local/api-venv/bin/python scripts/seed-company-members.py --purge

All ids start with ``demo-member-``. The data is fictional, deterministic and
contains no real personal information.
"""
import os
import sys
from pathlib import Path

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services" / "api" / "src"))
import associates


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

ADDRESSES = {
    "anil": ("Survey office", "Katragunta", "Katragunta B.O.",
             "Konakanamitla", "Prakasam", "Andhra Pradesh", "523246"),
    "meera": ("Court Road", "Markapur", "Markapur H.O.",
              "Markapur", "Prakasam", "Andhra Pradesh", "523316"),
    "farah": ("Site office", "Podili", "Podili S.O.",
              "Podili", "Prakasam", "Andhra Pradesh", "523240"),
    "vikram": ("Development office", "Ongole", "Ongole H.O.",
               "Ongole", "Prakasam", "Andhra Pradesh", "523001"),
    "suresh": ("Revenue services office", "Konakanamitla", "Konakanamitla S.O.",
               "Konakanamitla", "Prakasam", "Andhra Pradesh", "523241"),
    "lakshmi": ("Near village secretariat", "Katragunta", "Katragunta B.O.",
                "Konakanamitla", "Prakasam", "Andhra Pradesh", "523246"),
}

CREDENTIALS = {
    "surveyor": ("Survey licence", "Andhra Pradesh survey authority"),
    "advocate": ("Bar Council enrolment", "Bar Council of Andhra Pradesh"),
    "writer": ("Writer's licence", "Registration and Stamps Department"),
    "photo_studio": ("GST", "Goods and Services Tax Network"),
    "developer": ("RERA / company verification", "Andhra Pradesh RERA"),
}


def purge(conn) -> None:
    conn.execute("DELETE FROM work_requests WHERE id LIKE %s", (f"{P}%",))
    conn.execute("DELETE FROM associate_training_certificates WHERE id LIKE %s", (f"{P}%",))
    conn.execute("DELETE FROM associate_training_courses WHERE id LIKE %s", (f"{P}%",))
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
        address = ADDRESSES[slug]
        conn.execute(
            "INSERT INTO associates"
            " (id,name,firm,contact,contact_key,channel,state,state_reason,note,"
            " training_state,training_note,address_line,village_locality,post_office,"
            " mandal_city,district,state_name,postal_code,enrolled_by,created_at)"
            " VALUES (%s,%s,%s,%s,%s,'auto',%s,%s,'Fictional demo member',%s,%s,"
            " %s,%s,%s,%s,%s,%s,%s,'demo-seed',%s)",
            (aid, name, firm, contact, contact_key, state,
             "Training in progress" if state == "paused" else "",
             training, training_note, *address, NOW),
        )
        for index, (role, capacity) in enumerate(roles):
            conn.execute(
                "INSERT INTO associate_disciplines"
                " (id,associate_id,discipline,state,capacity,created_at)"
                " VALUES (%s,%s,%s,'on',%s,%s)",
                (f"{P}{slug}-discipline-{index}", aid, role, capacity, NOW),
            )
            credential_kind, authority = CREDENTIALS.get(
                role, ("Company verification", "Pattadar"))
            conn.execute(
                "INSERT INTO associate_credentials"
                " (id,associate_id,discipline,kind,number_masked,authority,issued_on,"
                " file_ref,file_name,review,review_note,reviewed_by,reviewed_at,created_at)"
                " VALUES (%s,%s,%s,%s,'••••DEMO',%s,%s,"
                " %s,%s,'verified','Demo evidence reviewed','demo-seed',%s,%s)",
                (f"{P}{slug}-credential-{index}", aid, role, credential_kind, authority,
                 "2026-09-01",
                 f"demo://credential/{slug}/{role}", f"{role}-verification.pdf", NOW, NOW),
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

    # Two internal training credentials. These are separate from the statutory
    # credential rows above and therefore cannot make a regulated discipline
    # dispatchable by themselves.
    secret = os.getenv(
        "CERTIFICATE_SIGNING_SECRET",
        "pattadar-local-training-certificate-signing-key-v1",
    )
    course = conn.execute(
        "INSERT INTO associate_training_courses"
        " (id,code,title,version,description,hours,valid_months,active,created_by,created_at,updated_at)"
        " VALUES (%s,'PU-FIELD-SAFETY','Field safety and owner privacy','1.0',"
        " 'Safe site conduct, data minimisation and evidence handling',8,24,true,'demo-seed',%s,%s)"
        " ON CONFLICT (code,version) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,"
        " hours=EXCLUDED.hours,valid_months=EXCLUDED.valid_months,active=true,updated_at=EXCLUDED.updated_at"
        " RETURNING id",
        (f"{P}course-field-safety", NOW, NOW),
    ).fetchone()
    course_id = course[0]
    for slug, name, completed, valid_until, trainer, trainer_ref in (
        ("anil", "Anil Kumar", "2026-08-18", "2028-08-18",
         "Dr. Kavitha Narayan", "PU-FACULTY-014"),
        ("lakshmi", "Lakshmi Devi", "2025-05-12", "2027-05-12",
         "R. Pradeep", "PU-FACULTY-009"),
    ):
        row = {
            "id": f"{P}certificate-{slug}",
            "certificate_no": f"PU-2026-DEMO-{slug.upper()}",
            "associate_id": f"{P}{slug}",
            "recipient_name": name,
            "course_code": "PU-FIELD-SAFETY",
            "course_title": "Field safety and owner privacy",
            "course_version": "1.0",
            "trainer_name": trainer,
            "trainer_ref": trainer_ref,
            "completed_on": completed,
            "issued_on": completed,
            "valid_until": valid_until,
            "hours": 8.0,
            "skills_json": '["Owner privacy","Field safety","Evidence handling"]',
            "evidence_ref": f"demo-attendance:{slug}:{completed}",
            "note": "Fictional sample training record; identity and attendance reviewed.",
            "issued_by": "demo-seed",
            "created_at": NOW,
        }
        conn.execute(
            "INSERT INTO associate_training_certificates"
            " (id,certificate_no,associate_id,course_id,recipient_name,course_code,course_title,"
            " course_version,trainer_name,trainer_ref,completed_on,issued_on,valid_until,hours,"
            " skills_json,evidence_ref,note,status,payload_hash,signature,issued_by,created_at)"
            " VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'active',%s,%s,%s,%s)",
            (row["id"], row["certificate_no"], row["associate_id"], course_id,
             row["recipient_name"], row["course_code"], row["course_title"], row["course_version"],
             row["trainer_name"], row["trainer_ref"], row["completed_on"], row["issued_on"],
             row["valid_until"], row["hours"], row["skills_json"], row["evidence_ref"], row["note"],
             associates.training_certificate_hash(row),
             associates.training_certificate_signature(row, secret), row["issued_by"], row["created_at"]),
        )

    # Realistic current and historical assignments, attached only when the
    # bundled demo parcel is present. This makes the first-run member profile
    # exercise the same assignee_ref path as production assignments.
    record = conn.execute(
        "SELECT p.id,pb.owner_user_id,pb.village,pb.mandal,pb.district FROM parcels p"
        " JOIN passbooks pb ON pb.id=p.passbook_id WHERE p.id='w360-p-189-1a'"
    ).fetchone()
    if record:
        area_key = associates.area_key_of({
            "kind": "parcel", "village": record[2], "mandal": record[3], "district": record[4],
        })
        for suffix, title, kind, status, closed, created, due, cost in (
            ("survey-current", "Boundary verification survey", "survey", "on_site", False,
             "2026-09-16T09:30:00", "2026-09-24", 3200),
            ("map-current", "FMB field-map reconciliation", "survey", "assigned", False,
             "2026-09-18T11:15:00", "2026-09-27", 1800),
            ("survey-done", "Pre-sale boundary survey", "survey", "accepted", True,
             "2026-07-08T10:00:00", "2026-07-15", 2800),
        ):
            conn.execute(
                "INSERT INTO work_requests"
                " (id,owner_user_id,kind,title,entity_type,entity_id,assignee,cost,stage,needs_you,"
                " note,due_date,closed,created_at,status,status_at,quoted,payee_share,service_key,"
                " assignee_ref,area_key,area_label,dispatch_state)"
                " VALUES (%s,%s,%s,%s,'record',%s,'Anil Kumar',%s,%s,false,"
                " 'Fictional sample assignment',%s,%s,%s,%s,%s,%s,0.7,%s,%s,%s,%s,'working')",
                (f"{P}{suffix}", record[1], kind, title, record[0], cost,
                 3 if closed else 1, due, closed, created, status, created, cost, kind,
                 f"{P}anil", area_key[0], area_key[1]),
            )


if __name__ == "__main__":
    with psycopg.connect(DSN, autocommit=True) as connection:
        if "--purge" in sys.argv:
            purge(connection)
            print("Removed demo company members.")
        else:
            seed(connection)
            print(f"Seeded {len(MEMBERS)} demo company members.")
