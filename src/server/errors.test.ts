import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AppError, runAction } from "./errors";

function capture() {
  const lines: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation(chunk => {
    lines.push(String(chunk));
    return true;
  });
  const errSpy = vi.spyOn(process.stderr, "write").mockImplementation(chunk => {
    lines.push(String(chunk));
    return true;
  });
  return { lines, restore: () => [spy, errSpy].forEach(item => item.mockRestore()) };
}

function records(lines: string[]) {
  return lines.flatMap(line =>
    line
      .split("\n")
      .filter(Boolean)
      .map(item => JSON.parse(item)),
  );
}

describe("runAction logging", () => {
  const originalLevel = process.env.LOG_LEVEL;
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.LOG_LEVEL = "debug";
    process.env.NODE_ENV = "production";
  });

  afterEach(() => {
    process.env.LOG_LEVEL = originalLevel;
    process.env.NODE_ENV = originalEnv;
    vi.restoreAllMocks();
  });

  it("logs successful actions with their name and duration", async () => {
    const output = capture();
    const result = await runAction("people.updatePerson", async () => ({ id: "person-1" }), {
      treeId: "tree-1",
    });
    output.restore();

    expect(result).toEqual({ ok: true, data: { id: "person-1" } });
    expect(records(output.lines)).toContainEqual(
      expect.objectContaining({
        msg: "action.succeeded",
        action: "people.updatePerson",
        treeId: "tree-1",
        durationMs: expect.any(Number),
      }),
    );
  });

  it("logs expected failures as warnings with a reason", async () => {
    const output = capture();
    const result = await runAction("people.createPerson", async () => {
      throw new AppError("Too many requests.", 429);
    });
    output.restore();

    expect(result).toMatchObject({ ok: false, error: "Too many requests." });
    expect(records(output.lines)).toContainEqual(
      expect.objectContaining({
        level: "warn",
        msg: "action.rejected",
        action: "people.createPerson",
        reason: "rate_limited",
        status: 429,
      }),
    );
  });

  it("logs validation field paths without echoing values", async () => {
    const output = capture();
    const schema = z.object({ firstName: z.string().min(1) });
    const result = await runAction("people.createPerson", async () => {
      schema.parse({ firstName: "", email: "person@example.com" });
    });
    output.restore();

    expect(result.ok).toBe(false);
    const record = records(output.lines).find(item => item.msg === "action.rejected");
    expect(record).toMatchObject({ reason: "validation", fields: ["firstName"] });
    expect(JSON.stringify(record)).not.toContain("person@example.com");
  });

  it("logs unexpected failures as errors with a stack", async () => {
    const output = capture();
    const result = await runAction("files.finalizeUpload", async () => {
      throw new Error("storage exploded");
    });
    output.restore();

    expect(result).toMatchObject({
      ok: false,
      error: "Something went wrong. Please try again.",
    });
    const record = records(output.lines).find(item => item.msg === "action.failed");
    expect(record).toMatchObject({
      level: "error",
      action: "files.finalizeUpload",
      error: { name: "Error", message: "storage exploded" },
    });
  });
});
