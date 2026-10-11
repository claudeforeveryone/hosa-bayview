// Web Push settings. Push is on only when every value is present and well-formed; otherwise Settings says it isn't
// set up and the deliver route answers 503. Nothing here is printed or sent to the browser except the public key.
export type PushConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
  // Shared with the database (vault row push_internal_secret, migration 0221).
  internalSecret: string;
};

type Env = Record<string, string | undefined>;

// The shapes `npx web-push generate-vapid-keys` prints: an uncompressed P-256 point (65 bytes, so 87 base64url
// characters starting with B) and a 32-byte private key (43 characters).
const PUBLIC_KEY = /^B[A-Za-z0-9_-]{86}$/;
const PRIVATE_KEY = /^[A-Za-z0-9_-]{43}$/;
// Push services want a contact: mailto: or https:.
const SUBJECT = /^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/;
const MIN_SECRET = 32;

export function pushConfig(env: Env = process.env): PushConfig | null {
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";
  const privateKey = env.VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject = env.VAPID_SUBJECT?.trim() ?? "";
  const internalSecret = env.PUSH_INTERNAL_SECRET?.trim() ?? "";
  if (
    !PUBLIC_KEY.test(publicKey) ||
    !PRIVATE_KEY.test(privateKey) ||
    !SUBJECT.test(subject) ||
    internalSecret.length < MIN_SECRET
  ) {
    return null;
  }
  return { publicKey, privateKey, subject, internalSecret };
}
