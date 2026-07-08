"""GitLab connector.

Token clone URLs use the `oauth2:<token>@` form. `test()` calls `GET {base}/api/v4/user` with a
`PRIVATE-TOKEN` header for token auth (works for personal/project access tokens); set the
connection's base_url to a self-hosted GitLab host if not gitlab.com.
"""

from __future__ import annotations

from hobits.domain.connections.domain import AuthMethod, ProviderCredential
from hobits.integrations.git_providers.base import BaseConnector


class GitlabConnector(BaseConnector):
    name = "GitLab"
    default_api = "https://gitlab.com"
    token_userinfo_prefix = "oauth2"
    user_path = "/api/v4/user"
    account_field = "username"

    def _auth_kwargs(self, credential: ProviderCredential) -> dict[str, object]:
        if credential.auth_method is AuthMethod.token:
            return {"headers": {"PRIVATE-TOKEN": credential.secret}}
        return {"auth": (credential.username or "", credential.secret)}
