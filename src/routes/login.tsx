import { A, useSearchParams, useSubmission } from "@solidjs/router";
import { Show } from "solid-js";
import { CircleAlert } from "lucide-solid";
import { AuthLayout } from "~/components/auth/AuthLayout";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Field } from "~/components/ui/Field";
import { login } from "~/api";
import { useI18n } from "~/i18n/LocaleProvider";
import { Trans } from "~/i18n/Trans";

export default function LoginPage() {
  const { t } = useI18n();
  const submission = useSubmission(login);
  const [searchParams] = useSearchParams();
  const redirectTo = () => {
    const value = searchParams.redirectTo;
    return typeof value === "string" ? value : "";
  };
  const error = () => (submission.result instanceof Error ? submission.result.message : "");
  const invited = () => redirectTo().startsWith("/invite/");

  return (
    <AuthLayout
      title={t("auth.login.title")}
      subtitle={t("auth.login.subtitle")}
      notice={invited() ? t("auth.login.invited") : undefined}
      footer={
        <span>
          <Trans
            key="auth.login.newHere"
            components={{
              createAccount: (
                <A
                  href={
                    redirectTo() ? `/register?redirectTo=${encodeURIComponent(redirectTo())}` : "/register"
                  }
                  class="font-semibold text-primary underline decoration-primary/30 underline-offset-4"
                  data-testid="login-create-account"
                >
                  {t("auth.createAccount")}
                </A>
              ),
            }}
          />
        </span>
      }
    >
      <Card class="gap-0 p-5 sm:p-6">
        <form action={login} method="post" class="space-y-4">
          <input type="hidden" name="redirectTo" value={redirectTo()} />
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
              data-testid="login-email"
            />
          </Field>
          <Field label={t("auth.password")} for="password">
            <input
              id="password"
              name="password"
              type="password"
              class="input"
              placeholder={t("auth.login.passwordPlaceholder")}
              autocomplete="current-password"
              required
              data-testid="login-password"
            />
          </Field>
          <div class="-mt-2 text-right">
            <A
              href="/forgot-password"
              class="text-xs font-semibold text-primary underline decoration-primary/30 underline-offset-4"
              data-testid="login-forgot-password"
            >
              {t("auth.forgot.title")}
            </A>
          </div>
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
            data-testid="login-submit"
          >
            {submission.pending ? t("auth.login.submitting") : t("auth.signIn")}
          </Button>
        </form>
      </Card>
    </AuthLayout>
  );
}
