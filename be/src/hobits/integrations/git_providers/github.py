"""GitHub connector.

Token clone URLs use the `x-access-token:<token>@` form. `test()` calls `GET {api}/user`; for
GitHub Enterprise set the connection's base_url to the API base (e.g. `https://host/api/v3`).
"""

from __future__ import annotations

from hobits.domain.connections.domain import (
    AuthMethod,
    IssueRef,
    ProviderCredential,
    PullRequestRef,
)
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
            f"{self._api_base(credential)}/repos/{owner}/{name}/pulls",
            json={"title": title, "body": body, "head": head, "base": base},
        )
        return _pr_ref(data)

    def get_pull_request(
        self, credential: ProviderCredential, owner: str, name: str, number: int
    ) -> PullRequestRef:
        data = self._request(
            credential,
            "GET",
            f"{self._api_base(credential)}/repos/{owner}/{name}/pulls/{number}",
        )
        return _pr_ref(data)

    def create_issue(
        self, credential: ProviderCredential, owner: str, name: str, *, title: str, body: str
    ) -> IssueRef:
        data = self._request(
            credential,
            "POST",
            f"{self._api_base(credential)}/repos/{owner}/{name}/issues",
            json={"title": title, "body": body},
        )
        return IssueRef(url=str(data.get("html_url") or ""))


def _pr_ref(data: dict) -> PullRequestRef:
    if data.get("merged") or data.get("merged_at"):
        state = "merged"
    else:
        state = "open" if data.get("state") == "open" else "closed"
    return PullRequestRef(
        number=int(data["number"]), url=str(data.get("html_url") or ""), state=state
    )
