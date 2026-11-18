import { A, createAsync, useParams } from "@solidjs/router";
import { Match, Switch, Show } from "solid-js";
import { CircleCheck, Clock } from "lucide-solid";
import { getUser, verifyEmail } from "~/api";
import { AppErrorBoundary } from "~/components/app/AppErrorBoundary";
import { BrandMark } from "~/components/app/AppHeader";
import { buttonVariants } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { useI18n } from "~/i18n/LocaleProvider";

export const route = {
  preload: ({ params }: { params: { token: string } }) => verifyEmail(params.token),
};

export default function VerifyEmailPage() {
  const { t } = useI18n();
  return (
    <AppErrorBoundary
      title={t("auth.error.linkCheck")}
      message={t("auth.error.linkCheck.verify")}
      revalidateKeys={[verifyEmail.key, getUser.key]}
      back={{ href: "/login", label: t("auth.backToSignIn") }}
    >
      <VerifyEmailInner />
    </AppErrorBoundary>
  );
}

function VerifyEmailInner() {
  const { t } = useI18n();
  const params = useParams<{ token: string }>();
  const result = createAsync(() => verifyEmail(params.token));
  const user = createAsync(() => getUser());

  return (
    <main class="page-shell flex min-h-[100dvh] flex-col">
      <div class="flex items-center justify-between px-5 py-5 sm:px-8">
        <BrandMark />
        <Show when={user()}>
          <A
            href="/trees"
            class={buttonVariants({ variant: "ghost", size: "sm" })}
            data-testid="verify-email-your-trees"
          >
            {t("auth.yourTrees")}
          </A>
        </Show>
      </div>
      <div class="flex flex-1 items-center justify-center px-4 pb-16">
        <Card class="w-full max-w-lg items-center gap-0 p-7 text-center sm:p-10">
          <Show
            when={result()}
            fallback={
              <>
                <Skeleton class="mx-auto size-16 rounded-3xl" />
                <Skeleton class="mx-auto mt-6 h-8 w-56 rounded-lg" />
                <Skeleton class="mx-auto mt-3 h-4 w-72 rounded-md" />
              </>
            }
          >
            {state => (
              <Switch>
                <Match when={state().status === "verified" || state().status === "already"}>
                  <div class="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-accent text-primary">
                    <CircleCheck size={30} />
                  </div>
                  <p class="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                    {t("auth.verify.emailConfirmed")}
                  </p>
                  <h1 class="mt-2 font-display text-4xl tracking-tight">
                    {state().status === "already"
                      ? t("auth.verify.alreadyTitle")
                      : t("auth.allSet")}
                  </h1>
                  <p class="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                    <Show
                      when={user()}
                      fallback={t("auth.verify.signedOutBody")}
                    >
                      {t("auth.verify.signedInBody")}
                    </Show>
                  </p>
                  <A
                    href={user() ? "/trees" : "/login"}
                    class={buttonVariants({ class: "mt-7" })}
                    data-testid="verify-email-continue"
                  >
                    {user() ? t("auth.verify.goToTrees") : t("auth.signIn")}
                  </A>
                </Match>
                <Match when={true}>
                  <div class="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-background text-muted-foreground">
                    <Clock size={28} />
                  </div>
                  <h1 class="mt-6 font-display text-3xl tracking-tight">
                    {t("auth.linkInvalid")}
                  </h1>
                  <p class="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                    {state().status === "expired"
                      ? t("auth.verify.expired")
                      : t("auth.verify.invalid")}
                  </p>
                  <A
                    href={user() ? "/settings" : "/login"}
                    class={buttonVariants({ variant: "secondary", class: "mt-7" })}
                    data-testid="verify-email-resend"
                  >
                    {user() ? t("auth.verify.resend") : t("auth.signIn")}
                  </A>
                </Match>
              </Switch>
            )}
          </Show>
        </Card>
      </div>
    </main>
  );
}
