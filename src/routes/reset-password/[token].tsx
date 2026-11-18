import { A, createAsync, useParams, useSubmission } from "@solidjs/router";
import { Show } from "solid-js";
import { CircleAlert, Clock, LockKeyhole } from "lucide-solid";
import { AuthLayout } from "~/components/auth/AuthLayout";
import { AppErrorBoundary } from "~/components/app/AppErrorBoundary";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button, buttonVariants } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Field } from "~/components/ui/Field";
import { Skeleton } from "~/components/ui/skeleton";
import { getPasswordResetPreview, resetPassword } from "~/api";
import { useI18n } from "~/i18n/LocaleProvider";
import { Trans } from "~/i18n/Trans";

export const route = {
  preload: ({ params }: { params: { token: string } }) =>
    getPasswordResetPreview(params.token),
};

export default function ResetPasswordPage() {
  const { t } = useI18n();
  return (
    <AppErrorBoundary
      title={t("auth.error.linkCheck")}
      message={t("auth.error.linkCheck.reset")}
      revalidateKeys={[getPasswordResetPreview.key]}
      back={{ href: "/forgot-password", label: t("auth.reset.requestNew") }}
    >
      <ResetPasswordInner />
    </AppErrorBoundary>
  );
}

function ResetPasswordInner() {
  const { t } = useI18n();
  const params = useParams<{ token: string }>();
  const preview = createAsync(() => getPasswordResetPreview(params.token));
  const submission = useSubmission(resetPassword);
  const error = () => (submission.result instanceof Error ? submission.result.message : "");

  return (
    <AuthLayout
      title={t("auth.reset.title")}
      subtitle={t("auth.reset.subtitle")}
      footer={
        <span>
          <Trans
            key="auth.reset.footer"
            components={{
              requestAnother: (
                <A
                  href="/forgot-password"
                  class="font-semibold text-primary underline decoration-primary/30 underline-offset-4"
                  data-testid="reset-password-request-another"
                >
                  {t("auth.reset.requestAnother")}
                </A>
              ),
            }}
          />
        </span>
      }
    >
      <Show
        when={preview()}
        fallback={
          <Card class="gap-3 p-6">
            <Skeleton class="h-10 w-full rounded-lg" />
            <Skeleton class="h-10 w-full rounded-lg" />
            <Skeleton class="h-10 w-36 rounded-lg" />
          </Card>
        }
      >
        {state => (
          <Show
            when={state().status === "ok"}
            fallback={
              <Card class="items-center gap-0 p-7 text-center sm:p-8">
                <div class="grid size-14 place-items-center rounded-2xl bg-background text-muted-foreground">
                  <Clock size={26} />
                </div>
                <h2 class="mt-5 font-display text-2xl tracking-tight">
                  {t("auth.linkInvalid")}
                </h2>
                <p class="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  {state().status === "expired"
                    ? t("auth.reset.expired")
                    : state().status === "used"
                      ? t("auth.reset.used")
                      : t("auth.reset.invalid")}
                </p>
                <A
                  href="/forgot-password"
                  class={buttonVariants({ class: "mt-6" })}
                  data-testid="reset-password-request-new"
                >
                  {t("auth.reset.requestNew")}
                </A>
              </Card>
            }
          >
            <Card class="gap-0 p-5 sm:p-6">
              <form action={resetPassword} method="post" class="space-y-4">
                <input type="hidden" name="token" value={params.token} />
                <Field
                  label={t("auth.newPassword")}
                  for="password"
                  hint={t("auth.passwordHint")}
                >
                  <input
                    id="password"
                    name="password"
                    type="password"
                    class="input"
                    placeholder={t("auth.choosePassword")}
                    autocomplete="new-password"
                    minlength={10}
                    required
                    autofocus
                    data-testid="reset-password-new"
                  />
                </Field>
                <Field label={t("auth.confirmPassword")} for="confirmPassword">
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    class="input"
                    placeholder={t("auth.repeatPassword")}
                    autocomplete="new-password"
                    minlength={10}
                    required
                    data-testid="reset-password-confirm"
                  />
                </Field>
                <Show when={error()}>
                  <Alert variant="destructive" class="rounded-xl py-2.5">
                    <CircleAlert />
                    <AlertDescription>{error()}</AlertDescription>
                  </Alert>
                </Show>
                <Button
                  type="submit"
                  class="w-full"
                  disabled={submission.pending}
                  data-testid="reset-password-submit"
                >
                  {submission.pending ? t("auth.saving") : t("auth.reset.submit")}
                </Button>
                <p class="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
                  <LockKeyhole size={12} />
                  {t("auth.reset.signOutNote")}
                </p>
              </form>
            </Card>
          </Show>
        )}
      </Show>
    </AuthLayout>
  );
}
