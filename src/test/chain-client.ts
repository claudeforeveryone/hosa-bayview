import { vi } from "vitest";

export type Result = { data: unknown; error: { message: string; code?: string } | null; count?: number | null };

// Chainable stand-in for supabase.from(...)/rpc(...)/auth. Every chain resolves to `result`.
export function makeClient(result: Result) {
  const calls: { op: string; args: unknown[] }[] = [];
  const chain: Record<string, unknown> = {};
  for (const op of ["insert", "update", "delete", "select", "eq", "in", "order", "limit", "single", "maybeSingle"]) {
    chain[op] = (...args: unknown[]) => {
      calls.push({ op, args });
      return chain;
    };
  }
  chain.then = (resolve: (r: Result) => unknown) => resolve(result);
  return {
    calls,
    result,
    from: vi.fn((table: string) => {
      calls.push({ op: "from", args: [table] });
      return chain;
    }),
    rpc: vi.fn((fn: string, args: unknown) => {
      calls.push({ op: "rpc", args: [fn, args] });
      return chain;
    }),
    auth: {
      updateUser: vi.fn(async () => ({ error: result.error })),
      signOut: vi.fn(async () => ({ error: null })),
    },
  };
}
