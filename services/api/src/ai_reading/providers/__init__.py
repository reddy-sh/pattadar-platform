"""Model providers for AI document reading.

One module per provider. ``anthropic`` handles Claude readings and ``google``
handles Document AI OCR followed by Gemini. Provider calls stay in these
adapters so the retry and cost policy remains reviewable.

Named to match services/gateway/app/ai_catalog/providers/ so "where does this
service talk to a provider" has the same answer in both.
"""
