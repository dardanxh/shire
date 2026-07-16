"""Bitbucket connector.

Token clone URLs use the `x-token-auth:<token>@` form (Bitbucket access tokens); username +
app-password uses basic auth. `test()` calls `GET {api}/2.0/user`. Note: Bitbucket Cloud's REST
API host is `api.bitbucket.org` (distinct from the `bitbucket.org` clone host).
"""

from __future__ import annotations

from hobits.domain.connections.domain import (
    AuthMethod,
    ProviderCredential,
    PullRequestRef,
)
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

    # Issue creation stays unsupported: Bitbucket's issue tracker is per-repo opt-in and its
    # REST shape differs enough that we punt until someone actually needs it.

    def create_pull_request(
        self,
        credential: ProviderCredential,
        owner: str,
        name: str,
        *,
        head: str,
        base: str,
        title: str,
        body: str,
    ) -> PullRequestRef:
        data = self._request(
            credential,
            "POST",
            f"{self._api_base(credential)}/2.0/repositories/{owner}/{name}/pullrequests",
            json={
                "title": title,
                "description": body,
                "source": {"branch": {"name": head}},
                "destination": {"branch": {"name": base}},
            },
        )
        return _pr_ref(data)

    def get_pull_request(
        self, credential: ProviderCredential, owner: str, name: str, number: int
    ) -> PullRequestRef:
        data = self._request(
            credential,
            "GET",
            f"{self._api_base(credential)}/2.0/repositories/{owner}/{name}/pullrequests/{number}",
        )
        return _pr_ref(data)


def _pr_ref(data: dict) -> PullRequestRef:
    raw_state = data.get("state")
    if raw_state == "MERGED":
        state = "merged"
    elif raw_state == "OPEN":
        state = "open"
    else:
        state = "closed"  # DECLINED / SUPERSEDED
    links = data.get("links") or {}
    html = links.get("html") or {}
    return PullRequestRef(number=int(data["id"]), url=str(html.get("href") or ""), state=state)
