import { vi } from "vitest";

// Minimal stand-in for the Supabase client surface the auth code touches.
export function mockSupabase(opts: {
  userId?: string | null;
  profile?: { id: string } | null;
  profileError?: { message: string } | null;
  authError?: { message: string } | null;
  session?: object | null;
  claimsError?: unknown;
} = {}) {
  const auth = {
    getClaims: vi.fn(async () => ({
      data: opts.userId ? { claims: { sub: opts.userId } } : null,
      error: opts.claimsError ?? null,
    })),
    signOut: vi.fn(async () => ({ error: null })),
    exchangeCodeForSession: vi.fn(async () => ({ error: opts.authError ?? null })),
    verifyOtp: vi.fn(async () => ({ error: opts.authError ?? null })),
    signInWithPassword: vi.fn(async () => ({ error: opts.authError ?? null })),
    signUp: vi.fn(async () => ({
      data: { session: opts.session === undefined ? {} : opts.session },
      error: opts.authError ?? null,
    })),
    resetPasswordForEmail: vi.fn(async () => ({ error: opts.authError ?? null })),
    updateUser: vi.fn(async () => ({ error: opts.authError ?? null })),
  };
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: opts.profile ?? null, error: opts.profileError ?? null }),
  };
  return { auth, from: vi.fn(() => query) };
}
