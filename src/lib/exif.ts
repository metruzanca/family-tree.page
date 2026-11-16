/**
 * EXIF dates have no timezone. Most cameras write `YYYY:MM:DD HH:MM:SS`,
 * while exifr may already revive the value into a local Date.
 */
export function formatExifDate(value: unknown): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  if (typeof value !== "string") return null;
  const match = /^(\d{4})[:-](\d{2})[:-](\d{2})/.exec(value.trim());
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
