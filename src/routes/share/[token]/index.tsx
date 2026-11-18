import { A, createAsync, useParams } from "@solidjs/router";
import { Eye, Lock, Sprout } from "lucide-solid";
import { getSharedTree } from "~/api";
import { AppErrorBoundary } from "~/components/app/AppErrorBoundary";
import { BrandMark } from "~/components/app/AppHeader";
import { SharedTreeView } from "~/components/trees/SharedTreeView";
import { buttonVariants } from "~/components/ui/button";
import { LoadingScreen } from "~/components/ui/Loading";
import { useI18n } from "~/i18n/LocaleProvider";
import { LocaleSwitcher } from "~/i18n/LocaleSwitcher";

export const route = {
  preload: ({ params }: { params: { token: string } }) => getSharedTree(params.token),
};

export default function SharePage() {
  const { t } = useI18n();
  return (
    <AppErrorBoundary
      title={t("share.error.title")}
      message={t("share.error.message")}
      revalidateKeys={[getSharedTree.key]}
      back={{ href: "/", label: t("share.error.back") }}
    >
      <ShareInner />
    </AppErrorBoundary>
  );
}

function ShareInner() {
  const params = useParams<{ token: string }>();
  const { t } = useI18n();
  const shared = createAsync(() => getSharedTree(params.token));

  if (shared() === undefined) return <LoadingScreen />;

  const data = shared();
  if (!data) {
    return (
      <main class="page-shell flex min-h-[100dvh] flex-col" data-testid="share-unavailable">
        <div class="flex items-center justify-between px-5 py-5 sm:px-8">
          <BrandMark />
          <LocaleSwitcher variant="text" />
        </div>
        <div class="flex flex-1 items-center justify-center px-4 pb-20">
          <div class="w-full max-w-md rounded-3xl border border-border bg-card/60 p-8 text-center">
            <div class="mx-auto grid h-14 w-14 place-items-center rounded-3xl bg-muted text-muted-foreground">
              <Lock size={24} />
            </div>
            <h1 class="mt-5 font-display text-2xl tracking-tight">
              {t("share.unavailable.title")}
            </h1>
            <p class="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
              {t("share.unavailable.body")}
            </p>
            <A href="/" class={buttonVariants({ class: "mt-6" })} data-testid="share-unavailable-home">
              <Sprout size={15} />
              {t("landing.cta.startTree")}
            </A>
          </div>
        </div>
      </main>
    );
  }

  const livingNote =
    data.share.livingVisibility === "hidden"
      ? t("share.banner.livingHidden")
      : data.share.livingVisibility === "name"
        ? t("share.banner.livingNames")
        : t("share.banner.livingFull");

  return (
    <div class="relative" data-testid="share-page">
      <SharedTreeView
        graph={data.graph}
        backHref="/"
        backLabel={t("common.home")}
        badgeLabel={t("share.badge")}
        allowDownload={false}
        thumbUrlFor={fileId => `/share/${params.token}/files/${fileId}/thumb`}
        fileUrlFor={file => file.thumbUrl ?? ""}
      />
      <div class="pointer-events-none absolute inset-x-0 top-16 z-30 flex flex-wrap items-center justify-center gap-2 px-3">
        <div
          class="pointer-events-auto inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full border border-white/10 bg-black/55 px-4 py-1.5 text-[0.7rem] text-white/70 shadow-lg backdrop-blur"
          data-testid="share-banner"
        >
          <Eye size={13} class="text-gold" />
          <span class="font-semibold text-white">{t("share.banner.readOnly")}</span>
          <span aria-hidden="true">·</span>
          <span>{livingNote}</span>
        </div>
        <LocaleSwitcher
          variant="text"
          class="pointer-events-auto border border-white/10 bg-black/55 text-white/70 shadow-lg backdrop-blur hover:bg-black/70 hover:text-white"
        />
      </div>
    </div>
  );
}
