import { A, useSearchParams, useSubmission } from "@solidjs/router";
import { Show } from "solid-js";
import { CircleAlert } from "lucide-solid";
import { AuthLayout } from "~/components/auth/AuthLayout";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Field } from "~/components/ui/Field";
import { login } from "~/api";

export default function LoginPage() {
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
      title="Welcome back"
      subtitle="Sign in to add people, attach photos, and keep your family's stories connected."
      notice={
        invited()
          ? "You have been invited to join a family tree. Sign in or create an account to accept."
          : undefined
      }
      footer={
        <span>
          New here?{" "}
          <A
            href={redirectTo() ? `/register?redirectTo=${encodeURIComponent(redirectTo())}` : "/register"}
            class="font-semibold text-primary underline decoration-primary/30 underline-offset-4"
          >
            Create an account
          </A>
        </span>
      }
    >
      <Card class="gap-0 p-5 sm:p-6">
        <form action={login} method="post" class="space-y-4">
          <input type="hidden" name="redirectTo" value={redirectTo()} />
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
          <Field label="Password" for="password">
            <input
              id="password"
              name="password"
              type="password"
              class="input"
              placeholder="Your password"
              autocomplete="current-password"
              required
            />
          </Field>
          <div class="-mt-2 text-right">
            <A
              href="/forgot-password"
              class="text-xs font-semibold text-primary underline decoration-primary/30 underline-offset-4"
            >
              Forgot your password?
            </A>
          </div>
          <Show when={error()}>
            <Alert variant="destructive" class="rounded-xl py-2.5">
              <CircleAlert />
              <AlertDescription>{error()}</AlertDescription>
            </Alert>
          </Show>
          <Button type="submit" class="w-full" disabled={submission.pending}>
            {submission.pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Card>
    </AuthLayout>
  );
}
