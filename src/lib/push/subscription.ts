import { z } from "zod";
import { isAllowedPushEndpoint, MAX_ENDPOINT_LENGTH } from "./endpoints";

// What a browser's PushSubscription.toJSON() gives. Same shapes as the table checks in 0220. Exact sizes, because
// web-push refuses any other and a near miss would fail at every send: a P-256 public key is an uncompressed point,
// 65 bytes starting 0x04, so 87 base64url characters starting with B; the auth secret is 16 bytes, 22 characters.
// Some browsers add base64 padding (one = and two, respectively).
const P256DH = /^B[A-Za-z0-9_-]{86}=?$/;
const AUTH = /^[A-Za-z0-9_-]{22}(==)?$/;

const endpoint = z
  .string()
  .max(MAX_ENDPOINT_LENGTH)
  .refine(isAllowedPushEndpoint, {
    message: "That push service is not allowed",
  });

export const subscribeSchema = z.object({
  endpoint,
  keys: z.object({
    p256dh: z.string().regex(P256DH, "Bad subscription key"),
    auth: z.string().regex(AUTH, "Bad subscription key"),
  }),
  // The device's "Notification sound" setting. Missing means on.
  sound: z.boolean().optional(),
});

export const unsubscribeSchema = z.object({ endpoint });

export type SubscribeInput = z.infer<typeof subscribeSchema>;
