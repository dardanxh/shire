"""Symmetric encryption for credential secrets at rest (Fernet).

Connection tokens/passwords are encrypted before they touch the database and decrypted only
when a clone or connection-test needs them. The key comes from `HOBITS_SECRET_KEY`:

- a valid urlsafe-base64 32-byte Fernet key is used as-is;
- any other non-empty string is stretched to a key via SHA-256 (convenience for local dev);
- if unset, a stable *insecure* dev key is derived from a constant so local dev works without
  configuration — a warning is logged so this is never mistaken for production-safe.
"""

from __future__ import annotations

import base64
import hashlib
import logging

from cryptography.fernet import Fernet

from hobits.core.settings import get_settings

logger = logging.getLogger(__name__)

_INSECURE_DEV_PASSPHRASE = "hobits-insecure-dev-key"


def _derive_key(passphrase: str) -> bytes:
    """Stretch an arbitrary passphrase into a urlsafe-base64 32-byte Fernet key."""
    digest = hashlib.sha256(passphrase.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def _fernet() -> Fernet:
    key = get_settings().secret_key
    if key:
        try:
            return Fernet(key.encode("utf-8"))
        except (ValueError, TypeError):
            # Not a raw Fernet key — treat it as a passphrase to stretch.
            return Fernet(_derive_key(key))
    logger.warning(
        "HOBITS_SECRET_KEY is not set — encrypting credentials with an INSECURE dev key. "
        "Set HOBITS_SECRET_KEY (e.g. `python -c 'from cryptography.fernet import Fernet; "
        "print(Fernet.generate_key().decode())'`) before storing real credentials."
    )
    return Fernet(_derive_key(_INSECURE_DEV_PASSPHRASE))


def encrypt(plaintext: str) -> str:
    """Encrypt a secret for storage; returns urlsafe-base64 ciphertext."""
    return _fernet().encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt(token: str) -> str:
    """Decrypt a stored ciphertext back to the original secret."""
    return _fernet().decrypt(token.encode("utf-8")).decode("utf-8")
