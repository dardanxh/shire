"""Shared machinery for git-provider connectors.

A connector does two jobs for a `ProviderCredential`:
- `test()` — hit the provider's "current user" endpoint and report whether the credential works;
- `authenticated_url()` — inject credentials into an `https://` clone URL so a private clone
  succeeds. SSH (`git@…`) URLs are returned untouched (git handles those via local keys).
"""

from __future__ import annotations

from urllib.parse import quote

import httpx

from hobits.domain.connections.domain import AuthMethod, ProviderCredential, TestResult

_TIMEOUT = 10.0


def _error_message(resp: httpx.Response) -> str:
    """Best-effort human-readable message from a non-2xx provider response."""
    try:
        body = resp.json()
    except ValueError:
        body = None
    if isinstance(body, dict):
        for key in ("message", "error_description", "error"):
            value = body.get(key)
            if isinstance(value, str) and value:
                return f"{resp.status_code}: {value}"
    if resp.status_code in (401, 403):
        return f"{resp.status_code}: authentication failed — check the credentials."
    return f"HTTP {resp.status_code}"


class BaseConnector:
    """Base connector. Subclasses set `name`, `default_api`, `token_userinfo_prefix`, the user
    endpoint, and how to read the account login from the response."""

    name: str
    default_api: str
    # Username portion used when embedding a *token* into a clone URL (e.g. "x-access-token").
    token_userinfo_prefix: str
    user_path: str  # path appended to the API base for the "current user" endpoint
    account_field: str = "login"

    def _api_base(self, credential: ProviderCredential) -> str:
        return (credential.base_url or self.default_api).rstrip("/")

    def _auth_kwargs(self, credential: ProviderCredential) -> dict[str, object]:
        """Return httpx auth kwargs (headers/auth) for the credential. Overridable per provider."""
        if credential.auth_method is AuthMethod.token:
            return {"headers": {"Authorization": f"Bearer {credential.secret}"}}
        return {"auth": (credential.username or "", credential.secret)}

    def test(self, credential: ProviderCredential) -> TestResult:
        url = f"{self._api_base(credential)}{self.user_path}"
        try:
            resp = httpx.get(url, timeout=_TIMEOUT, **self._auth_kwargs(credential))  # type: ignore[arg-type]
        except httpx.HTTPError as exc:
            return TestResult(ok=False, message=f"Could not reach {self.name}: {exc}")
        if resp.status_code >= 400:
            return TestResult(ok=False, message=_error_message(resp))
        account = None
        try:
            data = resp.json()
            if isinstance(data, dict):
                account = data.get(self.account_field)
        except ValueError:
            pass
        return TestResult(ok=True, message="Authenticated successfully.", account=account)

    def authenticated_url(self, url: str, credential: ProviderCredential) -> str:
        if not (url.startswith("http://") or url.startswith("https://")):
            return url  # SSH or unknown scheme — leave for git's own credential handling
        if credential.auth_method is AuthMethod.token:
            userinfo = f"{self.token_userinfo_prefix}:{quote(credential.secret, safe='')}"
        else:
            userinfo = (
                f"{quote(credential.username or '', safe='')}:{quote(credential.secret, safe='')}"
            )
        scheme, rest = url.split("://", 1)
        # Drop any credentials already present in the URL before injecting ours.
        authority = rest.split("/", 1)[0]
        if "@" in authority:
            rest = rest.split("@", 1)[1]
        return f"{scheme}://{userinfo}@{rest}"
