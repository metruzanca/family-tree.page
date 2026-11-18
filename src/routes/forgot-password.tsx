import { A, useSubmission } from "@solidjs/router";
import { Show } from "solid-js";
import { CircleAlert, MailCheck } from "lucide-solid";
import { AuthLayout } from "~/components/auth/AuthLayout";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Field } from "~/components/ui/Field";
import { requestPasswordReset } from "~/api";
import { useI18n } from "~/i18n/LocaleProvider";
import { Trans } from "~/i18n/Trans";

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const submission = useSubmission(requestPasswordReset);
  const error = () => (submission.result instanceof Error ? submission.result.message : "");
  const sent = () => Boolean(submission.result) && !(submission.result instanceof Error);

  return (
    <AuthLayout
      title={sent() ? t("auth.forgot.sentTitle") : t("auth.forgot.title")}
      subtitle={sent() ? t("auth.forgot.sentSubtitle") : t("auth.forgot.subtitle")}
      footer={
        <span>
          <Trans
            key="auth.forgot.footer"
            components={{
              backToSignIn: (
                <A
                  href="/login"
                  class="font-semibold text-primary underline decoration-primary/30 underline-offset-4"
                  data-testid="forgot-password-back-to-sign-in"
                >
                  {t("auth.backToSignIn")}
                </A>
              ),
            }}
          />
        </span>
      }
    >
      <Show
        when={!sent()}
        fallback={
          <Card class="items-center gap-0 p-7 text-center sm:p-8">
            <div class="grid size-14 place-items-center rounded-2xl bg-accent text-primary">
              <MailCheck size={26} />
            </div>
            <p class="mt-5 text-sm leading-relaxed text-muted-foreground">
              {t("auth.forgot.sentBody")}
            </p>
          </Card>
        }
      >
        <Card class="gap-0 p-5 sm:p-6">
          <form action={requestPasswordReset} method="post" class="space-y-4">
            <Field label={t("auth.email")} for="email">
              <input
                id="email"
                name="email"
                type="email"
                class="input"
                placeholder="you@example.com"
                autocomplete="email"
                required
                autofocus
                data-testid="forgot-password-email"
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
              data-testid="forgot-password-submit"
            >
              {submission.pending ? t("auth.sending") : t("auth.forgot.submit")}
            </Button>
            <p class="text-center text-xs leading-relaxed text-muted-foreground">
              {t("auth.forgot.privacyNote")}
            </p>
          </form>
        </Card>
      </Show>
    </AuthLayout>
  );
}
