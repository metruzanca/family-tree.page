import { A } from "@solidjs/router";
import { Sprout } from "lucide-solid";
import { buttonVariants } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { useI18n } from "~/i18n/LocaleProvider";

export default function NotFound() {
  const { t } = useI18n();
  return (
    <main class="page-shell grid min-h-[100dvh] place-items-center px-6">
      <Card class="max-w-md items-center gap-0 p-8 text-center">
        <div class="mx-auto grid h-14 w-14 place-items-center rounded-3xl bg-accent text-primary">
          <Sprout size={26} />
        </div>
        <h1 class="mt-5 font-display text-3xl tracking-tight">{t("notFound.title")}</h1>
        <p class="mt-2 text-sm leading-relaxed text-muted-foreground">
          {t("notFound.message")}
        </p>
        <A href="/trees" class={buttonVariants({ class: "mt-6" })}>
          {t("notFound.back")}
        </A>
      </Card>
    </main>
  );
}
