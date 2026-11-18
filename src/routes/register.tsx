import { A, useSearchParams, useSubmission } from "@solidjs/router";
import { Show } from "solid-js";
import { CircleAlert } from "lucide-solid";
import { AuthLayout } from "~/components/auth/AuthLayout";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Field } from "~/components/ui/Field";
import { register } from "~/api";
import { useI18n } from "~/i18n/LocaleProvider";
import { Trans } from "~/i18n/Trans";

export default function RegisterPage() {
  const { t } = useI18n();
  const submission = useSubmission(register);
  const [searchParams] = useSearchParams();
  const redirectTo = () => {
    const value = searchParams.redirectTo;
    return typeof value === "string" ? value : "";
  };
  const error = () => (submission.result instanceof Error ? submission.result.message : "");
  const invited = () => redirectTo().startsWith("/invite/");

  return (
    <AuthLayout
      title={t("auth.register.title")}
      subtitle={t("auth.register.subtitle")}
      notice={invited() ? t("auth.register.invited") : undefined}
      footer={
        <span>
          <Trans
            key="auth.register.haveAccount"
            components={{
              signIn: (
                <A
                  href={redirectTo() ? `/login?redirectTo=${encodeURIComponent(redirectTo())}` : "/login"}
                  class="font-semibold text-primary underline decoration-primary/30 underline-offset-4"
                  data-testid="register-sign-in"
                >
                  {t("auth.signIn")}
                </A>
              ),
            }}
          />
        </span>
      }
    >
      <Card class="gap-0 p-5 sm:p-6">
        <form action={register} method="post" class="space-y-4">
          <input type="hidden" name="redirectTo" value={redirectTo()} />
          <Field label={t("auth.name")} for="displayName">
            <input
              id="displayName"
              name="displayName"
              class="input"
              placeholder="Bart Simpson"
              autocomplete="name"
              required
              autofocus
              data-testid="register-name"
            />
          </Field>
          <Field label={t("auth.email")} for="email">
            <input
              id="email"
              name="email"
              type="email"
              class="input"
              placeholder="you@example.com"
              autocomplete="email"
              required
              data-testid="register-email"
            />
          </Field>
          <Field label={t("auth.password")} for="password" hint={t("auth.passwordHint")}>
            <input
              id="password"
              name="password"
              type="password"
              class="input"
              placeholder={t("auth.choosePassword")}
              autocomplete="new-password"
              minlength={10}
              required
              data-testid="register-password"
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
            data-testid="register-submit"
          >
            {submission.pending ? t("auth.register.submitting") : t("auth.register.submit")}
          </Button>
          <p class="text-center text-xs leading-relaxed text-muted-foreground">
            {t("auth.register.confirmation")}
          </p>
          <p class="text-center text-[0.7rem] leading-relaxed text-muted-foreground">
            <Trans
              key="auth.register.legal"
              components={{
                terms: (
                  <A href="/terms" class="underline decoration-border underline-offset-2 hover:text-foreground">
                    {t("auth.layout.terms")}
                  </A>
                ),
                privacy: (
                  <A href="/privacy" class="underline decoration-border underline-offset-2 hover:text-foreground">
                    {t("auth.layout.privacyPolicy")}
                  </A>
                ),
              }}
            />
          </p>
        </form>
      </Card>
    </AuthLayout>
  );
}
