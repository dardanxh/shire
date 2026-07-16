"""GitLab connector.

Token clone URLs use the `oauth2:<token>@` form. `test()` calls `GET {base}/api/v4/user` with a
`PRIVATE-TOKEN` header for token auth (works for personal/project access tokens); set the
connection's base_url to a self-hosted GitLab host if not gitlab.com.
"""

from __future__ import annotations

from urllib.parse import quote

from shire.domain.connections.domain import (
    AuthMethod,
    IssueRef,
    ProviderCredential,
    PullRequestRef,
)
from shire.integrations.git_providers.base import BaseConnector


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

    def _project_api(self, credential: ProviderCredential, owner: str, name: str) -> str:
        project_id = quote(f"{owner}/{name}", safe="")
        return f"{self._api_base(credential)}/api/v4/projects/{project_id}"

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
            f"{self._project_api(credential, owner, name)}/merge_requests",
            json={
                "source_branch": head,
                "target_branch": base,
                "title": title,
                "description": body,
            },
        )
        return _mr_ref(data)

    def get_pull_request(
        self, credential: ProviderCredential, owner: str, name: str, number: int
    ) -> PullRequestRef:
        data = self._request(
            credential,
            "GET",
            f"{self._project_api(credential, owner, name)}/merge_requests/{number}",
        )
        return _mr_ref(data)

    def create_issue(
        self, credential: ProviderCredential, owner: str, name: str, *, title: str, body: str
    ) -> IssueRef:
        data = self._request(
            credential,
            "POST",
            f"{self._project_api(credential, owner, name)}/issues",
            json={"title": title, "description": body},
        )
        return IssueRef(url=str(data.get("web_url") or ""))


def _mr_ref(data: dict) -> PullRequestRef:
    raw_state = data.get("state")
    if raw_state == "merged":
        state = "merged"
    elif raw_state == "opened":
        state = "open"
    else:
        state = "closed"
    return PullRequestRef(number=int(data["iid"]), url=str(data.get("web_url") or ""), state=state)
