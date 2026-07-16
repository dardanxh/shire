"""Connector for local, on-disk repositories.

A local repo needs no network and no credentials — it's analyzed in place. So this connector is a
no-op: it "tests" as always-ok and leaves the path (the repo's absolute filesystem path) untouched
as its "clone URL". It exists so the connections/ingest machinery can treat `local` like any other
provider instead of special-casing it everywhere.
"""

from __future__ import annotations

from shire.domain.connections.domain import ProviderCredential, TestResult


class LocalConnector:
    def test(self, credential: ProviderCredential) -> TestResult:
        return TestResult(ok=True, message="Local repositories need no credentials.")

    def authenticated_url(self, url: str, credential: ProviderCredential) -> str:
        return url  # already an absolute filesystem path
