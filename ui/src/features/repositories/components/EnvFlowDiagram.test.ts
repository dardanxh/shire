import { describe, expect, it } from "vitest";

import type { CicdEnvironmentOut, CicdTransitionOut } from "@/lib/api";
import { buildEnvFlowMermaid } from "./EnvFlowDiagram";

function env(
  key: string,
  kind: string,
  extra: Partial<CicdEnvironmentOut> = {},
): CicdEnvironmentOut {
  return {
    key,
    name: key.toUpperCase(),
    kind,
    branch: "",
    deploy_target: "",
    trigger: "",
    gates: [],
    auto_deploy: false,
    notes: "",
    source_file: "",
    ...extra,
  } as CicdEnvironmentOut;
}

function hop(
  from: string,
  to: string,
  extra: Partial<CicdTransitionOut> = {},
): CicdTransitionOut {
  return {
    from_env: from,
    to_env: to,
    trigger: "",
    steps: [],
    gates: [],
    source_file: "",
    ...extra,
  } as CicdTransitionOut;
}

describe("buildEnvFlowMermaid", () => {
  it("renders one node per environment and a labelled edge per promotion", () => {
    const source = buildEnvFlowMermaid(
      [
        env("dev", "dev", { branch: "develop" }),
        env("qa", "qa"),
        env("prod", "prod"),
      ],
      [
        hop("dev", "qa", {
          trigger: "merge to release/qa",
          steps: ["build", "test"],
        }),
        hop("qa", "prod", { trigger: "PR to main" }),
      ],
    );

    expect(source.startsWith("flowchart LR")).toBe(true);
    // The steps that run on the way INTO an environment are bulleted inside its node.
    expect(source).toContain('dev["DEV<br/><i>develop</i>"]:::dev');
    expect(source).toContain('qa["QA<br/>· build<br/>· test"]:::qa');
    expect(source).toContain("dev -->|merge to release/qa| qa");
    expect(source).toContain("qa -->|PR to main| prod");
    // Our own palette, so prod/qa/dev read the same way in every repository.
    expect(source).toContain("classDef prod");
  });

  it("survives keys and labels that would break Mermaid syntax", () => {
    const source = buildEnvFlowMermaid(
      [
        env("release/qa-1", "qa", { name: 'QA "one"' }),
        env("2prod", "prod", { name: "Prod|main" }),
      ],
      [hop("release/qa-1", "2prod", { trigger: "tag v* {manual}" })],
    );

    // Node ids are identifiers (a leading digit gets prefixed) …
    expect(source).toContain('release_qa_1["');
    expect(source).toContain('env_1_2prod["');
    // … and no quote/pipe/brace survives inside a node label or an edge label.
    const labels = [...source.matchAll(/\["(.*)"\]/g)].map((m) => m[1]);
    expect(labels).toEqual(["QA one", "Prod main"]);
    expect(source).toContain("release_qa_1 -->|tag v* manual| env_1_2prod");
  });

  it("draws nothing without environments", () => {
    expect(buildEnvFlowMermaid([], [hop("a", "b")])).toBe("");
  });

  it("skips edges whose endpoints are not known environments", () => {
    const source = buildEnvFlowMermaid(
      [env("dev", "dev")],
      [hop("dev", "ghost")],
    );

    expect(source).toContain('dev["DEV"]');
    expect(source).not.toContain("-->");
  });
});
