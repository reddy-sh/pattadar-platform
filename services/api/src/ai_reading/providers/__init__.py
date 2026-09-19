"""Model providers for AI document reading.

One module per provider. ``anthropic`` is the only one wired, and it is the only
place in this service permitted to call a model provider — that single call site
is what makes the retry and cost policy reviewable.

Named to match services/gateway/app/ai_catalog/providers/ so "where does this
service talk to a provider" has the same answer in both.
"""
