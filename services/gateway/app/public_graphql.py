"""Conservative AST policy for the bearer-token verification mutation."""
import json

from graphql import parse
from graphql.language import (
    FieldNode, FragmentDefinitionNode, FragmentSpreadNode, InlineFragmentNode,
    OperationDefinitionNode, OperationType,
)


def is_public_verification(body: bytes) -> bool:
    if len(body) > 65536:
        return False
    try:
        payload = json.loads(body)
        if not isinstance(payload, dict) or not isinstance(payload.get("query"), str):
            return False
        document = parse(payload["query"], max_tokens=4096)
        operations = [n for n in document.definitions if isinstance(n, OperationDefinitionNode)]
        # A public credential can execute one mutation. Reject batches and
        # multiple operation documents rather than guessing which gets run.
        if len(operations) != 1 or operations[0].operation != OperationType.MUTATION:
            return False
        operation = operations[0]
        requested = payload.get("operationName")
        if requested is not None and (not operation.name or requested != operation.name.value):
            return False
        fragments = {}
        for definition in document.definitions:
            if isinstance(definition, FragmentDefinitionNode):
                if definition.name.value in fragments:
                    return False
                fragments[definition.name.value] = definition
            elif not isinstance(definition, OperationDefinitionNode):
                return False

        def roots(selection_set, visiting=frozenset()):
            fields = []
            for selection in selection_set.selections:
                if isinstance(selection, FieldNode):
                    fields.append(selection.name.value)
                elif isinstance(selection, InlineFragmentNode):
                    fields.extend(roots(selection.selection_set, visiting))
                elif isinstance(selection, FragmentSpreadNode):
                    name = selection.name.value
                    if name in visiting or name not in fragments:
                        raise ValueError("Invalid fragment")
                    fields.extend(roots(fragments[name].selection_set, visiting | {name}))
                else:
                    raise ValueError("Invalid root selection")
                if len(fields) > 1:
                    raise ValueError("More than one root field")
            return fields

        return roots(operation.selection_set) == ["verifyBeneficiary"]
    except (ValueError, TypeError, RecursionError):
        return False
    except Exception:
        # GraphQL syntax exceptions are intentionally indistinguishable here;
        # malformed input never opens an anonymous route.
        return False
