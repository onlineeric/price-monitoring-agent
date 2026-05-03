import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { once } from "node:events";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// tests/helpers/spawn-server.ts → apps/mcp-server/
const PACKAGE_ROOT = resolve(HERE, "../..");
const ENTRY = resolve(PACKAGE_ROOT, "src/index.ts");
// We deliberately invoke `node --import tsx/esm/index.mjs` rather than the
// `tsx` CLI: the CLI forks an inner process which then *fails to forward*
// SIGTERM/SIGINT to the JS-level handler, breaking the graceful-shutdown
// tests (US4). The `--import` form runs the script in the same node process
// so signals are delivered to our `process.on("SIGTERM", ...)` directly.
const TSX_LOADER = resolve(PACKAGE_ROOT, "node_modules/tsx/dist/esm/index.mjs");

/**
 * Live integration helper: spawns the MCP server as a real child process
 * (no SDK mocks). Captures stderr line-by-line and exposes helpers for the
 * common "wait for X to appear on stderr" / "kill cleanly" patterns the
 * transport tests need.
 */
export interface SpawnedServer {
  child: ChildProcessWithoutNullStreams;
  /** Lines that have already been seen on stderr. */
  stderrLines: string[];
  /** Concatenated stdout buffer (used by stdio mode tests). */
  stdoutBuffer(): string;
  /** Lines seen on stdout (split on \n, useful for stdio JSON-RPC frames). */
  stdoutLines(): string[];
  /**
   * Wait until a stderr line matches `predicate`. Resolves with the matching
   * line. Rejects if `timeoutMs` elapses first or the child exits.
   */
  waitForStderr(predicate: RegExp | ((line: string) => boolean), timeoutMs: number): Promise<string>;
  /**
   * Wait until a stdout line matches `predicate`. Same semantics as
   * `waitForStderr`.
   */
  waitForStdout(predicate: RegExp | ((line: string) => boolean), timeoutMs: number): Promise<string>;
  /** Send a signal to the child (default: SIGTERM). */
  kill(signal?: NodeJS.Signals): void;
  /**
   * Wait for the child to exit. Resolves with `{ code, signal }`. Rejects on
   * timeout (default: 15 s).
   */
  waitForExit(timeoutMs?: number): Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  /**
   * Send SIGTERM and await exit. Force-kills with SIGKILL after 12 s if the
   * graceful path stalls (the 10 s grace window in FR-011 plus headroom).
   */
  close(): Promise<void>;
}

export interface SpawnServerOptions {
  /** Extra environment overlaid on `process.env`. */
  env?: Record<string, string | undefined>;
  /** Extra CLI args appended after the entry script. */
  args?: string[];
}

export function spawnServer(options: SpawnServerOptions = {}): SpawnedServer {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (options.env) {
    for (const [k, v] of Object.entries(options.env)) {
      if (v === undefined) {
        delete env[k];
      } else {
        env[k] = v;
      }
    }
  }

  const child = spawn(
    process.execPath,
    ["--import", `file://${TSX_LOADER}`, ENTRY, ...(options.args ?? [])],
    {
      env,
      cwd: PACKAGE_ROOT,
      stdio: ["pipe", "pipe", "pipe"],
    },
  ) as ChildProcessWithoutNullStreams;

  const stderrLines: string[] = [];
  let stderrPartial = "";
  const stderrWaiters: Array<{
    test: (line: string) => boolean;
    resolve: (line: string) => void;
    reject: (err: Error) => void;
  }> = [];

  let stdoutAll = "";
  let stdoutPartial = "";
  const stdoutWaiters: Array<{
    test: (line: string) => boolean;
    resolve: (line: string) => void;
    reject: (err: Error) => void;
  }> = [];

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderrPartial += chunk;
    let idx = stderrPartial.indexOf("\n");
    while (idx !== -1) {
      const line = stderrPartial.slice(0, idx);
      stderrPartial = stderrPartial.slice(idx + 1);
      stderrLines.push(line);
      for (let i = stderrWaiters.length - 1; i >= 0; i--) {
        const waiter = stderrWaiters[i]!;
        if (waiter.test(line)) {
          stderrWaiters.splice(i, 1);
          waiter.resolve(line);
        }
      }
      idx = stderrPartial.indexOf("\n");
    }
  });

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdoutAll += chunk;
    stdoutPartial += chunk;
    let idx = stdoutPartial.indexOf("\n");
    while (idx !== -1) {
      const line = stdoutPartial.slice(0, idx);
      stdoutPartial = stdoutPartial.slice(idx + 1);
      for (let i = stdoutWaiters.length - 1; i >= 0; i--) {
        const waiter = stdoutWaiters[i]!;
        if (waiter.test(line)) {
          stdoutWaiters.splice(i, 1);
          waiter.resolve(line);
        }
      }
      idx = stdoutPartial.indexOf("\n");
    }
  });

  child.on("exit", () => {
    const err = new Error("child exited before predicate matched");
    for (const w of stderrWaiters.splice(0)) w.reject(err);
    for (const w of stdoutWaiters.splice(0)) w.reject(err);
  });

  function makeWaiter(
    queue: typeof stderrWaiters,
    bufferedLines: string[] | (() => string[]),
    predicate: RegExp | ((line: string) => boolean),
    timeoutMs: number,
  ): Promise<string> {
    const test =
      typeof predicate === "function" ? predicate : (line: string) => predicate.test(line);

    const lines = typeof bufferedLines === "function" ? bufferedLines() : bufferedLines;
    for (const line of lines) {
      if (test(line)) return Promise.resolve(line);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = queue.findIndex((w) => w.resolve === wrappedResolve);
        if (idx !== -1) queue.splice(idx, 1);
        reject(new Error(`waitFor timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const wrappedResolve = (line: string) => {
        clearTimeout(timer);
        resolve(line);
      };
      const wrappedReject = (err: Error) => {
        clearTimeout(timer);
        reject(err);
      };
      queue.push({ test, resolve: wrappedResolve, reject: wrappedReject });
    });
  }

  const api: SpawnedServer = {
    child,
    stderrLines,
    stdoutBuffer: () => stdoutAll,
    stdoutLines: () => {
      const lines = stdoutAll.split("\n");
      // Drop the trailing partial (if any) — split keeps an empty string after
      // a terminating newline, which is harmless but noisy.
      if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
      return lines;
    },
    waitForStderr(predicate, timeoutMs) {
      return makeWaiter(stderrWaiters, stderrLines, predicate, timeoutMs);
    },
    waitForStdout(predicate, timeoutMs) {
      return makeWaiter(stdoutWaiters, () => api.stdoutLines(), predicate, timeoutMs);
    },
    kill(signal: NodeJS.Signals = "SIGTERM") {
      if (child.exitCode === null && !child.killed) {
        child.kill(signal);
      }
    },
    async waitForExit(timeoutMs = 15_000) {
      if (child.exitCode !== null || child.signalCode !== null) {
        return { code: child.exitCode, signal: child.signalCode };
      }
      const timer = setTimeout(() => {
        // Force-kill so the test framework does not hang on a runaway child.
        if (child.exitCode === null) child.kill("SIGKILL");
      }, timeoutMs);
      try {
        const [code, signal] = (await once(child, "exit")) as [
          number | null,
          NodeJS.Signals | null,
        ];
        return { code, signal };
      } finally {
        clearTimeout(timer);
      }
    },
    async close() {
      api.kill("SIGTERM");
      await api.waitForExit(12_000);
    },
  };

  return api;
}
