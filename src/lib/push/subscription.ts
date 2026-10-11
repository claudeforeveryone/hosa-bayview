import { z } from "zod";
import { isAllowedPushEndpoint, MAX_ENDPOINT_LENGTH } from "./endpoints";

// What a browser's PushSubscription.toJSON() gives. Same shapes as the table checks in 0220: a P-256 public key is
// 65 bytes (87 base64url characters), the auth secret 16 bytes (22); some browsers add base64 padding.
const P256DH = /^[A-Za-z0-9_-]{80,100}={0,2}$/;
const AUTH = /^[A-Za-z0-9_-]{16,32}={0,2}$/;

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
