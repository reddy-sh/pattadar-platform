"""Errors exposed by the transport-independent public-record core."""


class PublicRecordsError(Exception):
    """Base class for public-record runtime failures."""


class PublicRecordsUnavailable(PublicRecordsError):
    """The configured historical corpus cannot currently be queried."""


class ToolInputError(PublicRecordsError):
    """A public-record handler received invalid user input."""


class EmbeddingUnavailable(PublicRecordsUnavailable):
    """Semantic search dependencies are disabled or unavailable."""
