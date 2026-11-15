import { Navigate, createAsync } from "@solidjs/router";
import { Show } from "solid-js";
import { getUser } from "~/api";
import { LoadingScreen } from "~/components/ui/Loading";

export const route = {
  preload: () => getUser(),
};

export default function IndexPage() {
  const user = createAsync(() => getUser());
  return (
    <Show when={user() !== undefined} fallback={<LoadingScreen />}>
      <Show when={user()} fallback={<Navigate href="/login" />}>
        <Navigate href="/trees" />
      </Show>
    </Show>
  );
}
