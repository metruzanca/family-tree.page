import { A, useSearchParams, useSubmission } from "@solidjs/router";
import { Show } from "solid-js";
import { AuthLayout } from "~/components/auth/AuthLayout";
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
      notice={invited() ? "You have been invited to join a family tree. Sign in or create an account to accept." : undefined}
      footer={
        <span>
          New here?{" "}
          <A
            href={redirectTo() ? `/register?redirectTo=${encodeURIComponent(redirectTo())}` : "/register"}
            class="font-semibold text-moss underline decoration-moss/30 underline-offset-4"
          >
            Create an account
          </A>
        </span>
      }
    >
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
        <Show when={error()}>
          <p class="rounded-xl border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
            {error()}
          </p>
        </Show>
        <button type="submit" class="btn btn-primary w-full" disabled={submission.pending}>
          {submission.pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthLayout>
  );
}
