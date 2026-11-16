import { ErrorBoundary, createSignal, type JSX } from "solid-js";
import { revalidate } from "@solidjs/router";
import {
  ErrorState,
  type ErrorStateVariant,
} from "~/components/ui/ErrorState";
import { friendlyMessage } from "~/lib/action-result";
import { track } from "~/lib/analytics";

type AppErrorBoundaryProps = {
  children: JSX.Element;
  title?: string;
  message?: string;
  variant?: ErrorStateVariant;
  back?: { href: string; label: string };
  /** Query keys to refetch before retrying. Omit to revalidate everything. */
  revalidateKeys?: string[];
};

/**
 * Route-level failure boundary. Keeps router-driven failures inside a styled
 * route fallback instead of letting them reach the framework's full-screen
 * "Uncaught Client Exception" page.
 */
export function AppErrorBoundary(props: AppErrorBoundaryProps) {
  return (
    <ErrorBoundary
      fallback={(error, reset) => {
        const [retrying, setRetrying] = createSignal(false);

        console.error("[app] route error", error);
        track("client_error", {
          name: error instanceof Error ? error.name : typeof error,
        });

        async function retry() {
          if (retrying()) return;
          setRetrying(true);
          try {
            await revalidate(
              props.revalidateKeys && props.revalidateKeys.length
                ? props.revalidateKeys
                : undefined,
            );
          } finally {
            setRetrying(false);
            reset();
          }
        }

        return (
          <ErrorState
            variant={props.variant}
            title={props.title}
            message={props.message ?? friendlyMessage(error)}
            retrying={retrying()}
            onRetry={retry}
            back={props.back}
          />
        );
      }}
    >
      {props.children}
    </ErrorBoundary>
  );
}
