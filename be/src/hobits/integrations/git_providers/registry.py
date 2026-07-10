"""Registry mapping each git provider to its connector (adapter pattern, like external_tools)."""

from __future__ import annotations

from hobits.core.exceptions import ValidationError
from hobits.domain.connections.domain import GitProviderConnector
from hobits.domain.repository.domain import GitProvider
from hobits.integrations.git_providers.bitbucket import BitbucketConnector
from hobits.integrations.git_providers.github import GithubConnector
from hobits.integrations.git_providers.gitlab import GitlabConnector
from hobits.integrations.git_providers.local import LocalConnector

_CONNECTORS: dict[GitProvider, GitProviderConnector] = {
    GitProvider.github: GithubConnector(),
    GitProvider.gitlab: GitlabConnector(),
    GitProvider.bitbucket: BitbucketConnector(),
    GitProvider.local: LocalConnector(),
}


def get_connector(provider: GitProvider) -> GitProviderConnector:
    connector = _CONNECTORS.get(provider)
    if connector is None:
        raise ValidationError(f"No connector available for provider {provider.value!r}.")
    return connector
