import { A, useSubmission } from "@solidjs/router";
import { Show } from "solid-js";
import { CircleAlert, MailCheck } from "lucide-solid";
import { AuthLayout } from "~/components/auth/AuthLayout";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Field } from "~/components/ui/Field";
import { requestPasswordReset } from "~/api";

export default function ForgotPasswordPage() {
  const submission = useSubmission(requestPasswordReset);
  const error = () => (submission.result instanceof Error ? submission.result.message : "");
  const sent = () => Boolean(submission.result) && !(submission.result instanceof Error);

  return (
    <AuthLayout
      title={sent() ? "Check your inbox" : "Forgot your password?"}
      subtitle={
        sent()
          ? "If that address belongs to an account, a reset link is on its way."
          : "Enter the email address on your account and we will send a link to choose a new password."
      }
      footer={
        <span>
          Remembered it?{" "}
          <A
            href="/login"
            class="font-semibold text-primary underline decoration-primary/30 underline-offset-4"
          >
            Back to sign in
          </A>
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
              The link expires in one hour and works once. If it does not arrive, check your spam
              folder, then try again in a few minutes.
            </p>
          </Card>
        }
      >
        <Card class="gap-0 p-5 sm:p-6">
          <form action={requestPasswordReset} method="post" class="space-y-4">
            <Field label="Email" for="email">
              <input
                id="email"
                name="email"
                type="email"
                class="input"
                placeholder="you@example.com"
                autocomplete="email"
                required
                autofocus
              />
            </Field>
            <Show when={error()}>
              <Alert variant="destructive" class="rounded-xl py-2.5">
                <CircleAlert />
                <AlertDescription>{error()}</AlertDescription>
              </Alert>
            </Show>
            <Button type="submit" class="w-full" disabled={submission.pending}>
              {submission.pending ? "Sending…" : "Send reset link"}
            </Button>
            <p class="text-center text-xs leading-relaxed text-muted-foreground">
              For your privacy, we show the same message whether or not that address has an account.
            </p>
          </form>
        </Card>
      </Show>
    </AuthLayout>
  );
}
