import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  currentLogContext,
  log,
  serializeError,
  setLogContext,
  withLogContext,
} from "./logger";

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const out = vi.spyOn(process.stdout, "write").mockImplementation(chunk => {
    stdout.push(String(chunk));
    return true;
  });
  const err = vi.spyOn(process.stderr, "write").mockImplementation(chunk => {
    stderr.push(String(chunk));
    return true;
  });
  return { stdout, stderr, restore: () => [out, err].forEach(spy => spy.mockRestore()) };
}

describe("logger", () => {
  const originalLevel = process.env.LOG_LEVEL;
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.LOG_LEVEL = "debug";
    process.env.NODE_ENV = "production";
    process.env.RAILWAY_GIT_COMMIT_SHA = "abc123";
  });

  afterEach(() => {
    process.env.LOG_LEVEL = originalLevel;
    process.env.NODE_ENV = originalEnv;
    delete process.env.RAILWAY_GIT_COMMIT_SHA;
    vi.restoreAllMocks();
  });

  it("writes one JSON line with base fields and context", () => {
    const output = capture();
    withLogContext({ requestId: "req-1", action: "people.update" }, async () => {
      log.info("action.succeeded", { durationMs: 12, userId: "user-1" });
    });
    output.restore();

    expect(output.stdout).toHaveLength(1);
    const record = JSON.parse(output.stdout[0]);
    expect(record).toMatchObject({
      level: "info",
      msg: "action.succeeded",
      service: "family-tree",
      release: "abc123",
      requestId: "req-1",
      action: "people.update",
      durationMs: 12,
      userId: "user-1",
    });
    expect(record.ts).toEqual(expect.any(String));
  });

  it("filters below the configured level", () => {
    process.env.LOG_LEVEL = "warn";
    const output = capture();
    log.info("ignored");
    log.warn("kept");
    output.restore();

    expect(output.stdout).toHaveLength(1);
    expect(JSON.parse(output.stdout[0]).msg).toBe("kept");
  });

  it("writes errors to stderr and redacts sensitive fields", () => {
    const output = capture();
    log.error("action.failed", {
      email: "person@example.com",
      password: "hunter2",
      nested: { token: "secret", treeId: "tree-1" },
      error: new Error("boom"),
    });
    output.restore();

    expect(output.stderr).toHaveLength(1);
    const record = JSON.parse(output.stderr[0]);
    expect(record.email).toBe("[redacted]");
    expect(record.password).toBe("[redacted]");
    expect(record.nested.token).toBe("[redacted]");
    expect(record.nested.treeId).toBe("tree-1");
    expect(record.error).toMatchObject({ name: "Error", message: "boom" });
  });

  it("enriches an existing context and leaves it alone outside one", () => {
    withLogContext({ requestId: "req-2" }, async () => {
      setLogContext({ userId: "user-2", treeId: undefined });
      expect(currentLogContext()).toMatchObject({ requestId: "req-2", userId: "user-2" });
      expect(currentLogContext().treeId).toBeUndefined();
    });

    expect(() => setLogContext({ userId: "ignored" })).not.toThrow();
  });

  it("keeps safe error fields and drops Postgres detail", () => {
    const error = Object.assign(new Error("duplicate key value violates unique constraint"), {
      code: "23505",
      constraint: "people_tree_id_slug_unique",
      detail: "Key (email)=(person@example.com) already exists.",
      where: "SQL statement",
    });

    const record = serializeError(error);
    expect(record).toMatchObject({
      name: "Error",
      code: "23505",
      constraint: "people_tree_id_slug_unique",
    });
    expect(record).not.toHaveProperty("detail");
    expect(record).not.toHaveProperty("where");
    expect(JSON.stringify(record)).not.toContain("person@example.com");
  });
});
