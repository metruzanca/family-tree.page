import { Navigate, createAsync } from "@solidjs/router";
import { Show } from "solid-js";
import { getUser } from "~/api";
import { AppErrorBoundary } from "~/components/app/AppErrorBoundary";
import { LandingPage } from "~/components/landing/LandingPage";
import { LoadingScreen } from "~/components/ui/Loading";

export const route = {
  preload: () => getUser(),
};

export default function IndexPage() {
  return (
    <AppErrorBoundary
      title="We could not load this page"
      revalidateKeys={[getUser.key]}
      back={{ href: "/", label: "Retry home" }}
    >
      <IndexInner />
    </AppErrorBoundary>
  );
}

function IndexInner() {
  const user = createAsync(() => getUser());
  return (
    <Show when={user() !== undefined} fallback={<LoadingScreen />}>
      <Show when={user()} fallback={<LandingPage />}>
        <Navigate href="/trees" />
      </Show>
    </Show>
  );
}
