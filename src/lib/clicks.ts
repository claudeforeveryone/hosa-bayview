// Click counting for developer stats. The browser counts clicks in memory and sends the count with each
// heartbeat; the database (0105, record_clicks) caps every minute at the same number, so a flood can't inflate it.
export const CLICK_CAP = 300;

// The number to send for a count taken since the last flush: whole, never negative, never above the cap.
export function clicksToReport(counted: number): number {
  if (!Number.isFinite(counted) || counted <= 0) return 0;
  return Math.min(Math.floor(counted), CLICK_CAP);
}
