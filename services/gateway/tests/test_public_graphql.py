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
    'query Preview($t:String!){ invitePreview(token:$t){ state purpose inviter } }',
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
    # Claiming binds an account, so it is never anonymous.
    'mutation { claimInvitation(token:"t") { purpose } }',
    'query { invitePreview(token:"t") { state } myReferral { code } }',
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


_NETWORK_SEL = 'registerNetworkInterest(input:$input){ status field }'
_NETWORK_VARS = '($input:NetworkInterestInput!)'


@pytest.mark.parametrize("query", [
    # The exact document the landing form sends.
    f'mutation RegisterNetworkInterest{_NETWORK_VARS} {{ {_NETWORK_SEL} }}',
    f'mutation{_NETWORK_VARS} {{ ...N }} fragment N on Mutation {{ {_NETWORK_SEL} }}',
    f'mutation{_NETWORK_VARS} {{ ... on Mutation {{ {_NETWORK_SEL} }} }}',
    f'mutation{_NETWORK_VARS} {{ saved: {_NETWORK_SEL} }}',
])
def test_network_interest_is_public_as_a_single_root(query):
    """AC 16: the credential-less root takes the same single-root forms as
    verifyBeneficiary — plain, fragment, inline fragment and alias."""
    assert allowed(query)


@pytest.mark.parametrize("query", [
    # A second root by fragment, inline fragment or alias.
    f'mutation{_NETWORK_VARS} {{ {_NETWORK_SEL} ...P }} fragment P on Mutation {{ deleteInvitation(id:"x") }}',
    f'mutation{_NETWORK_VARS} {{ {_NETWORK_SEL} ... on Mutation {{ createUser(mobile:"",email:"",name:"",language:"") {{ id }} }} }}',
    f'mutation{_NETWORK_VARS} {{ a: {_NETWORK_SEL} b: {_NETWORK_SEL} }}',
    f'mutation{_NETWORK_VARS} {{ {_NETWORK_SEL} again: {_NETWORK_SEL} }}',
    # Batched beside a capability root or a private root.
    f'mutation{_NETWORK_VARS} {{ {_NETWORK_SEL} verifyBeneficiary(token:"t") {{ id }} }}',
    f'mutation{_NETWORK_VARS} {{ {_NETWORK_SEL} createUser(mobile:"",email:"",name:"",language:"") {{ id }} }}',
    # Two operations in one document.
    f'mutation A{_NETWORK_VARS} {{ {_NETWORK_SEL} }} query B {{ pendingInvitations {{ token }} }}',
    # It is a mutation root, never a query root.
    'query { registerNetworkInterest { status } }',
])
def test_network_interest_cannot_carry_a_second_root(query):
    assert not allowed(query)


def test_network_interest_batch_array_is_rejected():
    q = f'mutation RegisterNetworkInterest{_NETWORK_VARS} {{ {_NETWORK_SEL} }}'
    assert not is_public_verify("graphql", "POST", json.dumps([{"query": q}, {"query": q}]).encode())


@pytest.mark.parametrize("path", ["internal/capabilities/shares/token/files/id", "%69nternal/capabilities", "%2569nternal/capabilities", "public/../internal/capabilities"])
def test_internal_resolution_routes_are_never_generically_proxied(path):
    import asyncio
    import types
    from src.routes.proxy import proxy_pattadar
    response = asyncio.run(proxy_pattadar(types.SimpleNamespace(), path))
    assert response.status_code == 403
