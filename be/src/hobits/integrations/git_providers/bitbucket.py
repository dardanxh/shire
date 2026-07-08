"""Bitbucket connector.

Token clone URLs use the `x-token-auth:<token>@` form (Bitbucket access tokens); username +
app-password uses basic auth. `test()` calls `GET {api}/2.0/user`. Note: Bitbucket Cloud's REST
API host is `api.bitbucket.org` (distinct from the `bitbucket.org` clone host).
"""

from __future__ import annotations

from hobits.domain.connections.domain import AuthMethod, ProviderCredential
from hobits.integrations.git_providers.base import BaseConnector


class BitbucketConnector(BaseConnector):
    name = "Bitbucket"
    default_api = "https://api.bitbucket.org"
    token_userinfo_prefix = "x-token-auth"
    user_path = "/2.0/user"
    account_field = "username"

    def _auth_kwargs(self, credential: ProviderCredential) -> dict[str, object]:
        if credential.auth_method is AuthMethod.token:
            return {"headers": {"Authorization": f"Bearer {credential.secret}"}}
        return {"auth": (credential.username or "", credential.secret)}
