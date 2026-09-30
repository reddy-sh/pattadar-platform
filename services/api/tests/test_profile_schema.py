"""The profile writes every client sends must exist in the schema.

`update_me` was once added directly above `update_profile` and took its
`@strawberry.mutation` decorator with it. The method stayed in the file, so
nothing looked wrong, but `updateProfile` left the schema while the web
Profile and the mobile Aadhaar update kept calling it and were refused.
"""
from src import main


def _mutation_args(name: str) -> set[str]:
    mutation = main.schema._schema.mutation_type
    assert mutation is not None
    field = mutation.fields.get(name)
    assert field is not None, f"Mutation.{name} is missing from the schema"
    return set(field.args)


def test_update_profile_is_a_mutation_with_every_argument_clients_send():
    # The exact argument names apps/web and packages/core put on the wire.
    assert _mutation_args("updateProfile") >= {
        "language", "districtsOfInterest", "notificationPrefs",
        "kycRef", "mfaEnabled", "address",
    }


def test_update_me_is_still_a_mutation():
    assert _mutation_args("updateMe") >= {"name", "email"}


def test_me_reads_every_field_the_profile_screen_seeds_from():
    user = main.schema._schema.get_type("UserType") or main.schema._schema.query_type.fields["me"].type
    fields = set(getattr(user, "of_type", user).fields)
    assert fields >= {
        "id", "name", "email", "address", "language", "districtsOfInterest",
        "notificationPrefs", "kycRefMasked", "mfaEnabled",
    }
