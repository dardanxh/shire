"""GitHub connector.

Token clone URLs use the `x-access-token:<token>@` form. `test()` calls `GET {api}/user`; for
GitHub Enterprise set the connection's base_url to the API base (e.g. `https://host/api/v3`).
"""

from __future__ import annotations

from hobits.domain.connections.domain import AuthMethod, ProviderCredential
from hobits.integrations.git_providers.base import BaseConnector


class GithubConnector(BaseConnector):
    name = "GitHub"
    default_api = "https://api.github.com"
    token_userinfo_prefix = "x-access-token"
    user_path = "/user"
    account_field = "login"

    def _auth_kwargs(self, credential: ProviderCredential) -> dict[str, object]:
        headers = {"Accept": "application/vnd.github+json"}
        if credential.auth_method is AuthMethod.token:
            headers["Authorization"] = f"Bearer {credential.secret}"
            return {"headers": headers}
        return {"headers": headers, "auth": (credential.username or "", credential.secret)}
