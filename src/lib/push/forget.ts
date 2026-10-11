import "server-only";
import { cookies } from "next/headers";
import { parseDeviceId, PUSH_DEVICE_COOKIE } from "./device-cookie";

// Push rows go with the session. A member's notifications (reply text, names, role changes) must not keep landing
// on a phone after it is signed out, so the sign-out paths remove the matching rows. Best effort: a failure is
// logged and never stops the sign-out itself. RLS limits every delete here to the signed-in member's own rows.

type Deleted = PromiseLike<{
  error: { code?: string; message: string } | null;
}>;
type DeleteQuery = Deleted & {
  eq(column: string, value: string): DeleteQuery;
  neq(column: string, value: string): DeleteQuery;
};
export type PushDb = {
  from(table: "push_subscriptions"): { delete(): DeleteQuery };
};

async function deviceCookie() {
  const store = await cookies();
  return { store, id: parseDeviceId(store.get(PUSH_DEVICE_COOKIE)?.value) };
}

function log(where: string, err: unknown) {
  const detail =
    err && typeof err === "object" && "message" in err
      ? String((err as { message: unknown }).message)
      : String(err);
  console.error(`[push] ${where}:`, detail);
}

// Signing out on this browser: drop the row this browser saved (its id is in the HttpOnly device cookie).
export async function forgetThisDevice(db: PushDb): Promise<void> {
  try {
    const { store, id } = await deviceCookie();
    if (!id) return;
    store.delete(PUSH_DEVICE_COOKIE);
    const { error } = await db.from("push_subscriptions").delete().eq("id", id);
    if (error) log("sign-out", error);
  } catch (err) {
    log("sign-out", err);
  }
}

// A password change signs every other session out, so every other device of this member stops getting pushes
// too. This browser keeps its own.
export async function forgetOtherDevices(
  db: PushDb,
  userId: string,
): Promise<void> {
  try {
    const { id } = await deviceCookie();
    let query = db.from("push_subscriptions").delete().eq("user_id", userId);
    if (id) query = query.neq("id", id);
    const { error } = await query;
    if (error) log("other devices", error);
  } catch (err) {
    log("other devices", err);
  }
}
