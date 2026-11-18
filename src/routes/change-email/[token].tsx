import { A, createAsync, revalidate, useParams } from "@solidjs/router";
import { Match, Show, Switch, createSignal } from "solid-js";
import { CircleAlert, Clock, MailCheck, ShieldCheck } from "lucide-solid";
import { getEmailChangePreview, getUser, getPendingEmailChange, logout } from "~/api";
import { confirmEmailChange } from "~/api/account-server";
import { AppErrorBoundary } from "~/components/app/AppErrorBoundary";
import { BrandMark } from "~/components/app/AppHeader";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button, buttonVariants } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { attemptAction } from "~/lib/action-result";
import { useI18n } from "~/i18n/LocaleProvider";
import { Trans } from "~/i18n/Trans";

export const route = {
  preload: ({ params }: { params: { token: string } }) =>
    getEmailChangePreview(params.token),
};

export default function ChangeEmailPage() {
  const { t } = useI18n();
  return (
    <AppErrorBoundary
      title={t("auth.error.linkCheck")}
      message={t("auth.error.linkCheck.email")}
      revalidateKeys={[getEmailChangePreview.key, getUser.key]}
      back={{ href: "/settings", label: t("header.accountSettings") }}
    >
      <ChangeEmailInner />
    </AppErrorBoundary>
  );
}

function ChangeEmailInner() {
  const { t } = useI18n();
  const params = useParams<{ token: string }>();
  const preview = createAsync(() => getEmailChangePreview(params.token));
  const user = createAsync(() => getUser());
  const valid = () => {
    const value = preview();
    return value?.status === "valid" ? value : null;
  };
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal("");
  const [changedTo, setChangedTo] = createSignal<string | null>(null);

  async function confirm() {
    if (pending()) return;
    setPending(true);
    setError("");
    const result = await attemptAction(() => confirmEmailChange(params.token));
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setChangedTo(result.data.email);
    await revalidate([
      getUser.key,
      getPendingEmailChange.key,
      getEmailChangePreview.key,
    ]);
  }

  return (
    <main class="page-shell flex min-h-[100dvh] flex-col">
      <div class="flex items-center justify-between px-5 py-5 sm:px-8">
        <BrandMark />
        <Show when={user()}>
          <A
            href="/settings"
            class={buttonVariants({ variant: "ghost", size: "sm" })}
            data-testid="change-email-account-settings"
          >
            {t("header.accountSettings")}
          </A>
        </Show>
      </div>
      <div class="flex flex-1 items-center justify-center px-4 pb-16">
        <Card class="w-full max-w-lg items-center gap-0 p-7 text-center sm:p-10">
          <Show
            when={preview()}
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
                <Match when={changedTo()}>
                  <div class="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-accent text-primary">
                    <MailCheck size={30} />
                  </div>
                  <p class="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                    {t("auth.changeEmail.changed")}
                  </p>
                  <h1 class="mt-2 font-display text-4xl tracking-tight">{t("auth.allSet")}</h1>
                  <p class="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                    <Trans
                      key="auth.changeEmail.changedBody"
                      components={{
                        email: (
                          <span class="font-medium text-foreground">{changedTo()}</span>
                        ),
                      }}
                    />
                  </p>
                  <A
                    href="/settings"
                    class={buttonVariants({ class: "mt-7" })}
                    data-testid="change-email-back-to-settings"
                  >
                    {t("auth.changeEmail.backToSettings")}
                  </A>
                </Match>

                <Match when={state().status === "valid"}>
                  <Show
                    when={valid()?.matchesUser}
                    fallback={
                      <Show
                        when={valid()?.signedIn}
                        fallback={
                          <>
                            <div class="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-accent text-primary">
                              <ShieldCheck size={30} />
                            </div>
                            <h1 class="mt-6 font-display text-3xl tracking-tight">
                              {t("auth.changeEmail.signInTitle")}
                            </h1>
                            <p class="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                              {t("auth.changeEmail.signInBody")}
                            </p>
                            <A
                              href={`/login?redirectTo=${encodeURIComponent(`/change-email/${params.token}`)}`}
                              class={buttonVariants({ class: "mt-7" })}
                              data-testid="change-email-sign-in"
                            >
                              {t("auth.signIn")}
                            </A>
                          </>
                        }
                      >
                        <>
                          <div class="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-background text-muted-foreground">
                            <CircleAlert size={30} />
                          </div>
                          <h1 class="mt-6 font-display text-3xl tracking-tight">
                            {t("auth.changeEmail.wrongAccount")}
                          </h1>
                          <p class="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                            {t("auth.changeEmail.wrongAccountBody")}
                          </p>
                          <form action={logout} method="post" class="mt-7">
                            <Button
                              type="submit"
                              variant="secondary"
                              data-testid="change-email-sign-out"
                            >
                              {t("auth.signOut")}
                            </Button>
                          </form>
                        </>
                      </Show>
                    }
                  >
                    <>
                      <div class="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-accent text-primary">
                        <MailCheck size={30} />
                      </div>
                      <p class="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                        {t("auth.changeEmail.confirmEyebrow")}
                      </p>
                      <h1 class="mt-2 font-display text-4xl tracking-tight">
                        {t("auth.changeEmail.confirmTitle")}
                      </h1>
                      <p class="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                        <Trans
                          key="auth.changeEmail.confirmBody"
                          components={{
                            email: (
                              <span class="font-medium text-foreground">{valid()?.newEmail}</span>
                            ),
                          }}
                        />
                      </p>
                      <Show when={error()}>
                        <Alert variant="destructive" class="mt-5 w-full rounded-xl py-2.5 text-left">
                          <CircleAlert />
                          <AlertDescription>{error()}</AlertDescription>
                        </Alert>
                      </Show>
                      <div class="mt-7 flex flex-wrap items-center justify-center gap-2">
                        <Button
                          type="button"
                          disabled={pending()}
                          onClick={confirm}
                          data-testid="change-email-confirm"
                        >
                          {pending() ? t("auth.changeEmail.confirming") : t("auth.changeEmail.confirm")}
                        </Button>
                        <A
                          href="/settings"
                          class={buttonVariants({ variant: "ghost" })}
                          data-testid="change-email-cancel"
                        >
                          {t("common.cancel")}
                        </A>
                      </div>
                    </>
                  </Show>
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
                      ? t("auth.changeEmail.expired")
                      : state().status === "used"
                        ? t("auth.changeEmail.used")
                        : t("auth.changeEmail.invalid")}
                  </p>
                  <A
                    href={user() ? "/settings" : "/login"}
                    class={buttonVariants({ variant: "secondary", class: "mt-7" })}
                    data-testid="change-email-open-settings"
                  >
                    {user() ? t("auth.changeEmail.openSettings") : t("auth.signIn")}
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
