import { Show, createEffect, createSignal } from "solid-js";
import { createAsync, revalidate } from "@solidjs/router";
import { CircleCheck, KeyRound, UserRound } from "lucide-solid";
import { changePassword, updateProfile } from "~/api/auth-server";
import { getUser, requireUserPage } from "~/api";
import { AppHeader } from "~/components/app/AppHeader";
import { VerifyEmailNotice } from "~/components/auth/VerifyEmailNotice";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Field } from "~/components/ui/Field";
import { LoadingScreen } from "~/components/ui/Loading";
import { useToast } from "~/components/ui/Toast";

export const route = {
  preload: () => requireUserPage(),
};

export default function AccountSettingsPage() {
  return (
    <Show when={true} fallback={<LoadingScreen />}>
      <AccountSettingsInner />
    </Show>
  );
}

function AccountSettingsInner() {
  const user = createAsync(() => requireUserPage());
  const toast = useToast();
  const [displayName, setDisplayName] = createSignal("");
  const [profilePending, setProfilePending] = createSignal(false);
  const [currentPassword, setCurrentPassword] = createSignal("");
  const [newPassword, setNewPassword] = createSignal("");
  const [passwordPending, setPasswordPending] = createSignal(false);

  createEffect(() => {
    const current = user();
    if (current) setDisplayName(current.displayName);
  });

  async function saveProfile(event: SubmitEvent) {
    event.preventDefault();
    if (profilePending()) return;
    setProfilePending(true);
    const result = await updateProfile({ displayName: displayName() });
    setProfilePending(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    await revalidate([getUser.key, requireUserPage.key]);
    toast.show("Profile updated.", "success");
  }

  async function savePassword(event: SubmitEvent) {
    event.preventDefault();
    if (passwordPending()) return;
    setPasswordPending(true);
    const result = await changePassword({
      currentPassword: currentPassword(),
      newPassword: newPassword(),
    });
    setPasswordPending(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    toast.show("Password changed.", "success");
  }

  return (
    <Show when={user()}>
      {current => (
        <div class="page-shell min-h-[100dvh]">
          <AppHeader user={current()} back={{ href: "/trees", label: "Back to trees" }} />
          <main class="mx-auto max-w-2xl px-4 pb-20 pt-10 sm:px-6">
            <p class="eyebrow mb-2">Account</p>
            <h1 class="font-display text-4xl tracking-tight">Your details</h1>
            <p class="mt-2 text-sm text-muted-foreground">
              Signed in as <span class="font-medium text-foreground">{current().email}</span>
            </p>

            <Card class="mt-8 gap-4 py-5 sm:py-6">
              <CardHeader class="gap-1 px-5 sm:px-6">
                <div class="flex items-center gap-3">
                  <span class="grid size-9 place-items-center rounded-xl bg-accent text-accent-foreground">
                    <UserRound size={17} />
                  </span>
                  <div>
                    <CardTitle class="font-display text-xl">Profile</CardTitle>
                    <CardDescription class="text-xs">
                      The name shown to people you share a tree with.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent class="px-5 sm:px-6">
                <form class="space-y-4" onSubmit={saveProfile}>
                  <Field label="Display name" for="account-name">
                    <input
                      id="account-name"
                      class="input"
                      value={displayName()}
                      onInput={event => setDisplayName(event.currentTarget.value)}
                      maxlength={80}
                      required
                    />
                  </Field>
                  <Field
                    label="Email"
                    for="account-email"
                    hint="Email changes are not available in this version."
                  >
                    <input id="account-email" class="input" value={current().email} disabled />
                  </Field>
                  <Show
                    when={!current().emailVerified}
                    fallback={
                      <p class="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CircleCheck size={14} class="text-primary" />
                        Your email address is confirmed.
                      </p>
                    }
                  >
                    <VerifyEmailNotice email={current().email} />
                  </Show>
                  <Button type="submit" disabled={profilePending()}>
                    {profilePending() ? "Saving…" : "Save profile"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card class="mt-5 gap-4 py-5 sm:py-6">
              <CardHeader class="gap-1 px-5 sm:px-6">
                <div class="flex items-center gap-3">
                  <span class="grid size-9 place-items-center rounded-xl bg-accent text-accent-foreground">
                    <KeyRound size={17} />
                  </span>
                  <div>
                    <CardTitle class="font-display text-xl">Password</CardTitle>
                    <CardDescription class="text-xs">At least 10 characters.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent class="px-5 sm:px-6">
                <form class="space-y-4" onSubmit={savePassword}>
                  <Field label="Current password" for="current-password">
                    <input
                      id="current-password"
                      type="password"
                      class="input"
                      autocomplete="current-password"
                      value={currentPassword()}
                      onInput={event => setCurrentPassword(event.currentTarget.value)}
                      required
                    />
                  </Field>
                  <Field label="New password" for="new-password">
                    <input
                      id="new-password"
                      type="password"
                      class="input"
                      autocomplete="new-password"
                      minlength={10}
                      value={newPassword()}
                      onInput={event => setNewPassword(event.currentTarget.value)}
                      required
                    />
                  </Field>
                  <Button type="submit" disabled={passwordPending()}>
                    {passwordPending() ? "Changing…" : "Change password"}
                  </Button>
                  <p class="text-xs leading-relaxed text-muted-foreground">
                    Changing your password signs out every other device.
                  </p>
                </form>
              </CardContent>
            </Card>

            <p class="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
              Forgot your password? Sign out and choose “Forgot your password?” on the sign-in page
              to get a reset link by email.
            </p>
          </main>
        </div>
      )}
    </Show>
  );
}
