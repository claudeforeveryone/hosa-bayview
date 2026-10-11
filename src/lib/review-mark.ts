// One flashcard mark (Know it / Still learning) sent to the server. It never throws: no connection is a failed
// mark, so the study round carries on and says the mark didn't save instead of falling to the error page.

export const MARK_FAILED = "That mark didn't save. Check your connection.";

// Resolves to null when the mark saved, or to the message to show.
export async function sendMark(
  send: () => Promise<{ error?: string }>,
): Promise<string | null> {
  try {
    const result = await send();
    return result && !result.error ? null : MARK_FAILED;
  } catch {
    return MARK_FAILED;
  }
}
