import { Navigate, createAsync } from "@solidjs/router";
import { Show } from "solid-js";
import { getUser } from "~/api";
import { AppErrorBoundary } from "~/components/app/AppErrorBoundary";
import { LandingPage } from "~/components/landing/LandingPage";
import { LoadingScreen } from "~/components/ui/Loading";
import { useI18n } from "~/i18n/LocaleProvider";

export const route = {
  preload: () => getUser(),
};

export default function IndexPage() {
  const { t } = useI18n();
  return (
    <AppErrorBoundary
      title={t("home.error.title")}
      revalidateKeys={[getUser.key]}
      back={{ href: "/", label: t("home.error.back") }}
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
