// The push services a browser can hand out. The server stores and sends only to these hosts. The Postgres function
// push_subscribe (0220) repeats the same list, so a lookalike host is refused twice.
const PUSH_ENDPOINT =
  /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com)(:443)?\//;

export const MAX_ENDPOINT_LENGTH = 2048;

export function isAllowedPushEndpoint(endpoint: string): boolean {
  return endpoint.length <= MAX_ENDPOINT_LENGTH && PUSH_ENDPOINT.test(endpoint);
}
