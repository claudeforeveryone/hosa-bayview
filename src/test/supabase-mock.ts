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
    eq: vi.fn((column: string, value: unknown) => {
      void column;
      void value;
      return query;
    }),
    neq: vi.fn((column: string, value: unknown) => {
      void column;
      void value;
      return query;
    }),
    delete: vi.fn(() => query),
    maybeSingle: async () => ({ data: opts.profile ?? null, error: opts.profileError ?? null }),
  };
  // No RPCs by default: every call answers like a function that doesn't exist yet.
  const rpc = vi.fn(async (fn: string, args?: Record<string, unknown>) => {
    void fn;
    void args;
    return { data: null as unknown, error: { code: "PGRST202", message: "missing" } as { code?: string; message: string } | null };
  });
  return { auth, from: vi.fn((table: string) => {
    void table;
    return query;
  }), rpc, query };
}
