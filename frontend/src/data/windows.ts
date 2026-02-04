// Static window timestamp data - update when new windows open
// Run: node -e "..." (see script in useAllWindows.ts comments)
// Last updated: 2026-01-05

export interface WindowTimestamp {
  windowId: number;
  startTime: number;
  endTime: number;
}

export const WINDOW_TIMESTAMPS: WindowTimestamp[] = [
  { windowId: 0, startTime: 1766352035, endTime: 1766353235 }, // 2025-12-21T21:20:35.000Z
  { windowId: 1, startTime: 1766353247, endTime: 1766358647 }, // 2025-12-21T21:40:47.000Z
  { windowId: 2, startTime: 1766359595, endTime: 1766364995 }, // 2025-12-21T23:26:35.000Z
  { windowId: 3, startTime: 1766365463, endTime: 1766370863 }, // 2025-12-22T01:04:23.000Z
  { windowId: 4, startTime: 1766370947, endTime: 1766376347 }, // 2025-12-22T02:35:47.000Z
  { windowId: 5, startTime: 1766376467, endTime: 1766381867 }, // 2025-12-22T04:07:47.000Z
  { windowId: 6, startTime: 1766382131, endTime: 1766387531 }, // 2025-12-22T05:42:11.000Z
  { windowId: 7, startTime: 1766387795, endTime: 1766393195 }, // 2025-12-22T07:16:35.000Z
  { windowId: 8, startTime: 1766414231, endTime: 1766419631 }, // 2025-12-22T14:37:11.000Z
  { windowId: 9, startTime: 1766487923, endTime: 1766493323 }, // 2025-12-23T11:05:23.000Z
  { windowId: 10, startTime: 1766494427, endTime: 1766499827 }, // 2025-12-23T12:53:47.000Z
  { windowId: 11, startTime: 1766541263, endTime: 1766546663 }, // 2025-12-24T01:54:23.000Z
  { windowId: 12, startTime: 1766569655, endTime: 1766575055 }, // 2025-12-24T09:47:35.000Z
  { windowId: 13, startTime: 1766589239, endTime: 1766594639 }, // 2025-12-24T15:13:59.000Z
  { windowId: 14, startTime: 1766745083, endTime: 1766750483 }, // 2025-12-26T10:31:23.000Z
  { windowId: 15, startTime: 1766773931, endTime: 1766779331 }, // 2025-12-26T18:32:11.000Z
  { windowId: 16, startTime: 1766869619, endTime: 1766875019 }, // 2025-12-27T21:06:59.000Z
  { windowId: 17, startTime: 1767148991, endTime: 1767154391 }, // 2025-12-31T02:43:11.000Z
  { windowId: 18, startTime: 1767292535, endTime: 1767297935 }, // 2026-01-01T18:35:35.000Z
  { windowId: 19, startTime: 1767586391, endTime: 1767591791 }, // 2026-01-05T04:13:11.000Z
  { windowId: 20, startTime: 1767883499, endTime: 1767888899 }, // 2026-01-08T14:44:59.000Z
];

// Helper to get timestamps as a Map
export function getWindowTimestampMap(): Map<number, { start: number; end: number }> {
  const map = new Map<number, { start: number; end: number }>();
  for (const w of WINDOW_TIMESTAMPS) {
    map.set(w.windowId, { start: w.startTime, end: w.endTime });
  }
  return map;
}

// Get timestamp for a specific window
export function getWindowTimestamp(windowId: number): { start: number; end: number } | null {
  const w = WINDOW_TIMESTAMPS.find(w => w.windowId === windowId);
  return w ? { start: w.startTime, end: w.endTime } : null;
}
