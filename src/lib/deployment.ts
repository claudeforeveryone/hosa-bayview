// The running deployment, from the variables Vercel sets at build time (VERCEL_GIT_COMMIT_SHA and friends). None of
// them is a secret; each is checked against the shape it should have before the owner console shows it.
import type { Deployment } from "./owner-types";

type Env = Record<string, string | undefined>;

const clean = (value: string | undefined, shape: RegExp): string | null => {
  const v = value?.trim();
  return v && shape.test(v) ? v : null;
};

export function deploymentFrom(env: Env): Deployment {
  const owner = clean(env.VERCEL_GIT_REPO_OWNER, /^[\w.-]{1,100}$/);
  const slug = clean(env.VERCEL_GIT_REPO_SLUG, /^[\w.-]{1,100}$/);
  return {
    commit: clean(env.VERCEL_GIT_COMMIT_SHA, /^[0-9a-f]{7,40}$/),
    branch: clean(env.VERCEL_GIT_COMMIT_REF, /^[\w./-]{1,200}$/),
    environment: clean(env.VERCEL_ENV, /^[a-z]{1,20}$/),
    repo: owner && slug ? `${owner}/${slug}` : null,
  };
}

export function commitUrl(d: Deployment): string | null {
  return d.commit && d.repo
    ? `https://github.com/${d.repo}/commit/${d.commit}`
    : null;
}
