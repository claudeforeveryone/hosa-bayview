import { describe, expect, it } from "vitest";
import { commitUrl, deploymentFrom } from "./deployment";

describe("deploymentFrom", () => {
  it("reads Vercel's git variables", () => {
    expect(
      deploymentFrom({
        VERCEL_GIT_COMMIT_SHA: "66a9ed72bf8d61ba95e96969ccc0d1dadc4d9a4a",
        VERCEL_GIT_COMMIT_REF: "main",
        VERCEL_ENV: "production",
        VERCEL_GIT_REPO_OWNER: "claudemaxforeveryone-hue",
        VERCEL_GIT_REPO_SLUG: "hosa-bayview",
      }),
    ).toEqual({
      commit: "66a9ed72bf8d61ba95e96969ccc0d1dadc4d9a4a",
      branch: "main",
      environment: "production",
      repo: "claudemaxforeveryone-hue/hosa-bayview",
    });
  });

  it("is all nulls on a local machine", () => {
    expect(deploymentFrom({})).toEqual({
      commit: null,
      branch: null,
      environment: null,
      repo: null,
    });
  });

  it("drops anything that isn't the shape it claims to be", () => {
    const d = deploymentFrom({
      VERCEL_GIT_COMMIT_SHA: "not a sha",
      VERCEL_GIT_REPO_OWNER: "a/b",
      VERCEL_GIT_REPO_SLUG: "c",
    });
    expect(d.commit).toBeNull();
    expect(d.repo).toBeNull();
  });
});

describe("commitUrl", () => {
  it("links the commit on GitHub when the repo is known", () => {
    expect(
      commitUrl({
        commit: "66a9ed7",
        branch: null,
        environment: null,
        repo: "owner/repo",
      }),
    ).toBe("https://github.com/owner/repo/commit/66a9ed7");
  });
  it("has no link without both", () => {
    expect(
      commitUrl({
        commit: "66a9ed7",
        branch: null,
        environment: null,
        repo: null,
      }),
    ).toBeNull();
  });
});
