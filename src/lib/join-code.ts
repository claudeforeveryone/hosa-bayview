// Join codes: 6 characters, no 0/O/1/I/L lookalikes. Mirrors the check in migration 0006.
export const JOIN_CODE = /^[A-HJKMNP-Z2-9]{6}$/;

// People type codes however they read them: lowercase, spaces, a dash in the middle.
export function normalizeCode(raw: unknown): string {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

// Shown as two groups of three so it's easy to read out loud: K7P Q2M.
export function displayCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

// Form numbers on every artifact: C-004, T-014, D-007.
export function formNumber(prefix: "C" | "T" | "D", n: number): string {
  return `${prefix}-${String(n).padStart(3, "0")}`;
}
