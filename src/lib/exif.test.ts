import { describe, expect, it } from "vitest";
import { formatExifDate } from "./exif";

describe("formatExifDate", () => {
  it("reads the EXIF datetime string format", () => {
    expect(formatExifDate("1962:04:18 09:30:00")).toBe("1962-04-18");
  });

  it("accepts an already revived date", () => {
    expect(formatExifDate(new Date(2019, 11, 31, 23, 59))).toBe("2019-12-31");
  });

  it("accepts ISO-style strings", () => {
    expect(formatExifDate("2001-09-11")).toBe("2001-09-11");
  });

  it("ignores empty or invalid values", () => {
    expect(formatExifDate(null)).toBeNull();
    expect(formatExifDate(undefined)).toBeNull();
    expect(formatExifDate("")).toBeNull();
    expect(formatExifDate("sometime in the eighties")).toBeNull();
    expect(formatExifDate(new Date("nope"))).toBeNull();
  });
});
