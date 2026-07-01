"""ID generation utility — generates CUID2 IDs."""

from cuid2 import Cuid

_cuid_generator = Cuid()


def generate_id() -> str:
    """Generate a CUID2 ID (URL-safe, sortable, globally unique)."""
    return _cuid_generator.generate()
