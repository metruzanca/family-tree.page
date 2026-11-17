import type { ServerFunctionErrorHandler } from "@solidjs/start/server";
import { getServerFunctionMeta } from "@solidjs/start/server";
import { log } from "./logger";
import { currentRequestId } from "./request-context";

/**
 * Captures values thrown out of a server function before they reach the client.
 * Redirects and other Responses are control flow and pass through untouched.
 */
const onServerFunctionError: ServerFunctionErrorHandler = thrown => {
  if (thrown instanceof Response) return thrown;

  const meta = getServerFunctionMeta();
  log.error("server-fn.failed", {
    requestId: currentRequestId(),
    serverFnId: meta?.id,
    error: thrown,
  });

  return thrown;
};

export default onServerFunctionError;
