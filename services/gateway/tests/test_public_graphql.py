import json
import pytest
from src.routes.proxy import is_public_verify


def allowed(query, **extra):
    return is_public_verify("graphql", "POST", json.dumps({"query": query, **extra}).encode())


@pytest.mark.parametrize("query", [
    'mutation { verifyBeneficiary(token:"t") { id status } }',
    'mutation Accept($token:String!) { accepted: verifyBeneficiary(token:$token) { id } }',
    'mutation { ...Verify } fragment Verify on Mutation { verifyBeneficiary(token:"t") { id } }',
    'mutation { ... on Mutation { verifyBeneficiary(token:"t") { id } } }',
    'mutation { acknowledgeInactivity(token:"t") }',
    'mutation Ack($token:String!,$withdraw:Boolean!){ acknowledgeInactivity(token:$token,withdraw:$withdraw) }',
])
def test_single_public_capability_mutation_remains_public(query):
    assert allowed(query)


@pytest.mark.parametrize("query", [
    'query verifyBeneficiary { pendingInvitations { token } }',
    '# verifyBeneficiary\nquery { pendingInvitations { token } }',
    'query { verifyBeneficiary: pendingInvitations { token } }',
    'mutation { verifyBeneficiary(token:"t") { id } createUser(mobile:"",email:"",name:"",language:"") { id } }',
    'mutation { verifyBeneficiary(token:"t") { id } ...Private } fragment Private on Mutation { deleteInvitation(id:"x") }',
    'mutation A { verifyBeneficiary(token:"t") { id } } query B { pendingInvitations { token } }',
    'mutation { ...Cycle } fragment Cycle on Mutation { ...Cycle }',
    'mutation { ...Missing }',
    'mutation { verifyMember(token:"t") { id } }',
    'mutation { verifyBeneficiary(token:"t") { id } again:verifyBeneficiary(token:"x") { id } }',
    'mutation { acknowledgeInactivity(token:"t") verifyBeneficiary(token:"x") { id } }',
    'mutation { acknowledgeInactivity(token:"t") again:acknowledgeInactivity(token:"x") }',
])
def test_other_operations_cannot_smuggle_through(query):
    assert not allowed(query)


def test_operation_name_must_match_and_batches_are_rejected():
    q = 'mutation Accept { verifyBeneficiary(token:"t") { id } }'
    assert allowed(q, operationName="Accept")
    assert not allowed(q, operationName="Other")
    assert not is_public_verify("graphql", "POST", json.dumps([{"query": q}]).encode())


@pytest.mark.parametrize("path", ["internal/capabilities/shares/token/files/id", "%69nternal/capabilities", "%2569nternal/capabilities", "public/../internal/capabilities"])
def test_internal_resolution_routes_are_never_generically_proxied(path):
    import asyncio
    import types
    from src.routes.proxy import proxy_pattadar
    response = asyncio.run(proxy_pattadar(types.SimpleNamespace(), path))
    assert response.status_code == 403
