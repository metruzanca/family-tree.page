import { Show, createEffect, createSignal } from "solid-js";
import { A, createAsync, revalidate } from "@solidjs/router";
import {
  BellRing,
  CalendarPlus,
  CircleCheck,
  Copy,
  Download,
  ExternalLink,
  HardDrive,
  KeyRound,
  Mail,
  RotateCw,
  ShieldAlert,
  Trash2,
  UserRound,
} from "lucide-solid";
import {
  changePassword,
  updateNotificationSettings,
  updateProfile,
} from "~/api/auth-server";
import {
  cancelEmailChange,
  deleteAccount,
  requestEmailChange,
} from "~/api/account-server";
import { createCalendarFeed, disableCalendarFeed } from "~/api/calendar-server";
import { getCalendarFeed, getPendingEmailChange, getUsage, getUser, requireUserPage } from "~/api";
import { AppErrorBoundary } from "~/components/app/AppErrorBoundary";
import { AppHeader } from "~/components/app/AppHeader";
import { VerifyEmailNotice } from "~/components/auth/VerifyEmailNotice";
import { Button, buttonVariants } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import { Field } from "~/components/ui/Field";
import { Modal } from "~/components/ui/Modal";
import { formatBytes, formatRelative } from "~/lib/format";
import {
  Switch,
  SwitchControl,
  SwitchDescription,
  SwitchInput,
  SwitchLabel,
  SwitchThumb,
} from "~/components/ui/switch";
import { useToast } from "~/components/ui/Toast";
import { attemptAction } from "~/lib/action-result";
import { track } from "~/lib/analytics";

export const route = {
  preload: () => {
    requireUserPage();
    getCalendarFeed();
    getPendingEmailChange();
    getUsage();
  },
};

export default function AccountSettingsPage() {
  return (
    <AppErrorBoundary
      title="We could not load your account settings"
      message="Your data is safe. Try again in a moment."
      revalidateKeys={[
        requireUserPage.key,
        getUser.key,
        getCalendarFeed.key,
        getPendingEmailChange.key,
        getUsage.key,
      ]}
      back={{ href: "/trees", label: "Back to your trees" }}
    >
      <AccountSettingsInner />
    </AppErrorBoundary>
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
  const [notifications, setNotifications] = createSignal({
    weekBefore: false,
    dayBefore: false,
    dayOf: true,
  });
  const [notificationsPending, setNotificationsPending] = createSignal(false);
  const feed = createAsync(() => getCalendarFeed());
  const usage = createAsync(() => getUsage());
  const [feedPending, setFeedPending] = createSignal(false);
  const [feedConfirm, setFeedConfirm] = createSignal<"rotate" | "disable" | null>(null);
  const pendingEmailChange = createAsync(() => getPendingEmailChange());
  const [emailFormOpen, setEmailFormOpen] = createSignal(false);
  const [newEmail, setNewEmail] = createSignal("");
  const [emailPassword, setEmailPassword] = createSignal("");
  const [emailPending, setEmailPending] = createSignal(false);
  const [deleteOpen, setDeleteOpen] = createSignal(false);
  const [deletePassword, setDeletePassword] = createSignal("");
  const [deleteConfirmation, setDeleteConfirmation] = createSignal("");
  const [deletePending, setDeletePending] = createSignal(false);

  createEffect(() => {
    const current = user();
    if (current) setDisplayName(current.displayName);
  });

  createEffect(() => {
    const current = user();
    if (!current) return;
    setNotifications({
      weekBefore: current.notifyBirthdayWeekBefore,
      dayBefore: current.notifyBirthdayDayBefore,
      dayOf: current.notifyBirthdayDayOf,
    });
  });

  async function saveProfile(event: SubmitEvent) {
    event.preventDefault();
    if (profilePending()) return;
    setProfilePending(true);
    const result = await attemptAction(() => updateProfile({ displayName: displayName() }));
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
    const result = await attemptAction(() =>
      changePassword({
        currentPassword: currentPassword(),
        newPassword: newPassword(),
      }),
    );
    setPasswordPending(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    toast.show("Password changed.", "success");
  }

  async function toggleNotification(
    key: "weekBefore" | "dayBefore" | "dayOf",
    value: boolean,
  ) {
    if (notificationsPending()) return;
    const previous = notifications();
    const next = { ...previous, [key]: value };
    setNotifications(next);
    setNotificationsPending(true);
    const result = await attemptAction(() =>
      updateNotificationSettings({
        notifyBirthdayWeekBefore: next.weekBefore,
        notifyBirthdayDayBefore: next.dayBefore,
        notifyBirthdayDayOf: next.dayOf,
      }),
    );
    setNotificationsPending(false);
    if (!result.ok) {
      setNotifications(previous);
      toast.show(result.error, "error");
      return;
    }
    await revalidate([getUser.key, requireUserPage.key]);
  }

  async function copyCalendarUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.show("Calendar link copied.", "success");
    } catch {
      window.prompt("Copy this calendar link", url);
    }
  }

  async function applyFeedChange(kind: "create" | "rotate" | "disable") {
    if (feedPending()) return;
    setFeedPending(true);
    const result = await attemptAction(() =>
      kind === "disable" ? disableCalendarFeed() : createCalendarFeed(),
    );
    setFeedPending(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    setFeedConfirm(null);
    await revalidate(getCalendarFeed.key);
    track(kind === "disable" ? "calendar_feed_disabled" : "calendar_feed_created");
    toast.show(
      kind === "disable"
        ? "Calendar link turned off."
        : kind === "rotate"
          ? "New calendar link created. The old link no longer works."
          : "Calendar link created. Copy it into your calendar app.",
      "success",
    );
  }

  async function saveEmail(event: SubmitEvent) {
    event.preventDefault();
    if (emailPending()) return;
    setEmailPending(true);
    const result = await attemptAction(() =>
      requestEmailChange({
        newEmail: newEmail(),
        currentPassword: emailPassword(),
      }),
    );
    setEmailPending(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    setEmailFormOpen(false);
    setNewEmail("");
    setEmailPassword("");
    await revalidate([
      getPendingEmailChange.key,
      getUser.key,
      requireUserPage.key,
    ]);
    toast.show(
      result.data.emailSimulated
        ? "Email is not configured here. The confirmation link is in the server console."
        : "Check your new inbox to confirm the change.",
      "success",
    );
  }

  async function cancelPendingEmail() {
    const result = await attemptAction(() => cancelEmailChange());
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    await revalidate(getPendingEmailChange.key);
    toast.show("Email change cancelled.", "success");
  }

  async function confirmDeleteAccount(event: SubmitEvent) {
    event.preventDefault();
    if (deletePending()) return;
    setDeletePending(true);
    const result = await attemptAction(() =>
      deleteAccount({
        password: deletePassword(),
        confirmation: deleteConfirmation(),
      }),
    );
    setDeletePending(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    window.location.assign("/");
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
                    <Mail size={17} />
                  </span>
                  <div>
                    <CardTitle class="font-display text-xl">Email address</CardTitle>
                    <CardDescription class="text-xs">
                      Used for sign-in, invitations, and birthday reminders.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent class="space-y-4 px-5 sm:px-6">
                <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/60 px-3.5 py-3">
                  <div class="min-w-0">
                    <p class="truncate text-sm font-medium text-foreground">{current().email}</p>
                    <p class="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Show
                        when={current().emailVerified}
                        fallback="Not confirmed yet"
                      >
                        <>
                          <CircleCheck size={13} class="text-primary" />
                          Confirmed
                        </>
                      </Show>
                    </p>
                  </div>
                  <Show when={!emailFormOpen()}>
                    <Button
                      variant="secondary"
                      size="sm"
                      type="button"
                      onClick={() => setEmailFormOpen(true)}
                    >
                      Change email
                    </Button>
                  </Show>
                </div>

                <Show when={pendingEmailChange()}>
                  {pending => (
                    <div class="rounded-xl border border-gold/40 bg-gold/10 px-3.5 py-3">
                      <p class="text-xs leading-relaxed text-foreground">
                        Waiting for{" "}
                        <span class="font-medium">{pending().newEmail}</span> to confirm the
                        change. The link expires {formatRelative(pending().expiresAt)}.
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        class="mt-1.5 -ml-2"
                        onClick={() => void cancelPendingEmail()}
                      >
                        Cancel change
                      </Button>
                    </div>
                  )}
                </Show>

                <Show when={emailFormOpen()}>
                  <form class="space-y-4" onSubmit={saveEmail}>
                    <Field
                      label="New email"
                      for="new-email"
                      hint="We send a confirmation link to this address. Your current address keeps working until you confirm."
                    >
                      <input
                        id="new-email"
                        type="email"
                        class="input"
                        autocomplete="email"
                        value={newEmail()}
                        onInput={event => setNewEmail(event.currentTarget.value)}
                        required
                      />
                    </Field>
                    <Field label="Current password" for="email-password">
                      <input
                        id="email-password"
                        type="password"
                        class="input"
                        autocomplete="current-password"
                        value={emailPassword()}
                        onInput={event => setEmailPassword(event.currentTarget.value)}
                        required
                      />
                    </Field>
                    <div class="flex flex-wrap gap-2">
                      <Button type="submit" disabled={emailPending()}>
                        {emailPending() ? "Sending…" : "Send confirmation"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setEmailFormOpen(false);
                          setNewEmail("");
                          setEmailPassword("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                </Show>

                <Show when={!current().emailVerified}>
                  <VerifyEmailNotice email={current().email} />
                </Show>
              </CardContent>
            </Card>

            <Card id="usage" class="mt-5 scroll-mt-24 gap-4 py-5 sm:py-6">
              <CardHeader class="gap-1 px-5 sm:px-6">
                <div class="flex items-center gap-3">
                  <span class="grid size-9 place-items-center rounded-xl bg-accent text-accent-foreground">
                    <HardDrive size={17} />
                  </span>
                  <div>
                    <CardTitle class="font-display text-xl">Storage and limits</CardTitle>
                    <CardDescription class="text-xs">
                      What this account is using, across every tree you belong to.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent class="px-5 sm:px-6">
                <Show
                  when={usage()}
                  fallback={
                    <p class="text-sm text-muted-foreground">Loading usage…</p>
                  }
                >
                  {currentUsage => (
                    <div class="space-y-5">
                      <div>
                        <div class="flex items-baseline justify-between gap-3 text-xs">
                          <span class="font-medium text-foreground">Media storage</span>
                          <span class="text-muted-foreground">
                            {formatBytes(currentUsage().storageBytes)} of{" "}
                            {formatBytes(currentUsage().storageQuotaBytes)}
                          </span>
                        </div>
                        <div class="mt-2 h-2 w-full overflow-hidden rounded-full bg-primary/15">
                          <div
                            class="h-full rounded-full bg-primary transition-[width]"
                            style={{
                              width: `${Math.min(
                                100,
                                Math.round(
                                  (currentUsage().storageBytes /
                                    Math.max(1, currentUsage().storageQuotaBytes)) *
                                    100,
                                ),
                              )}%`,
                            }}
                          />
                        </div>
                        <p class="mt-2 text-xs leading-relaxed text-muted-foreground">
                          Originals and thumbnails you uploaded. Deleting a file frees space again.
                          <Show when={currentUsage().pendingUploads > 0}>
                            {" "}
                            {currentUsage().pendingUploads} upload
                            {currentUsage().pendingUploads === 1 ? " is" : "s are"} in progress.
                          </Show>
                        </p>
                      </div>

                      <div class="border-t border-border pt-4">
                        <div class="flex items-baseline justify-between gap-3 text-xs">
                          <span class="font-medium text-foreground">People created</span>
                          <span class="text-muted-foreground">
                            {currentUsage().peopleCreated} of {currentUsage().peopleQuota}
                          </span>
                        </div>
                        <div class="mt-2 h-2 w-full overflow-hidden rounded-full bg-primary/15">
                          <div
                            class="h-full rounded-full bg-primary transition-[width]"
                            style={{
                              width: `${Math.min(
                                100,
                                Math.round(
                                  (currentUsage().peopleCreated /
                                    Math.max(1, currentUsage().peopleQuota)) *
                                    100,
                                ),
                              )}%`,
                            }}
                          />
                        </div>
                        <p class="mt-2 text-xs leading-relaxed text-muted-foreground">
                          A lifetime count of people you add, including people you later delete.
                          Editing or adding relationships does not use a slot.
                        </p>
                      </div>

                      <p class="rounded-xl border border-border bg-muted/35 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
                        Need more space for a large family or a genealogy project?{" "}
                        <a
                          class="font-medium text-primary underline decoration-primary/30 underline-offset-4"
                          href={`mailto:${currentUsage().supportEmail}?subject=Increase%20my%20family-tree%20limits`}
                        >
                          Email us
                        </a>{" "}
                        and tell us what you are working on.
                      </p>
                    </div>
                  )}
                </Show>
              </CardContent>
            </Card>

            <Card class="mt-5 gap-4 py-5 sm:py-6">
              <CardHeader class="gap-1 px-5 sm:px-6">
                <div class="flex items-center gap-3">
                  <span class="grid size-9 place-items-center rounded-xl bg-accent text-accent-foreground">
                    <BellRing size={17} />
                  </span>
                  <div>
                    <CardTitle class="font-display text-xl">Email notifications</CardTitle>
                    <CardDescription class="text-xs">
                      Birthday reminders for living people in your trees.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent class="px-5 sm:px-6">
                <div class="divide-y divide-border">
                  <NotificationToggle
                    label="One week before"
                    description="A heads-up seven days before the birthday."
                    checked={notifications().weekBefore}
                    disabled={!current().emailVerified || notificationsPending()}
                    onChange={value => toggleNotification("weekBefore", value)}
                  />
                  <NotificationToggle
                    label="The day before"
                    description="A reminder the day before the birthday."
                    checked={notifications().dayBefore}
                    disabled={!current().emailVerified || notificationsPending()}
                    onChange={value => toggleNotification("dayBefore", value)}
                  />
                  <NotificationToggle
                    label="On the morning of the birthday"
                    description="A reminder on the day itself. On by default."
                    checked={notifications().dayOf}
                    disabled={!current().emailVerified || notificationsPending()}
                    onChange={value => toggleNotification("dayOf", value)}
                  />
                </div>
                <Show
                  when={current().emailVerified}
                  fallback={
                    <p class="mt-4 rounded-xl border border-dashed border-border px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                      Confirm your email address before birthday reminders can be sent.
                    </p>
                  }
                >
                  <p class="mt-4 text-xs leading-relaxed text-muted-foreground">
                    Reminders are sent to <span class="font-medium text-foreground">{current().email}</span>{" "}
                    and include every tree you belong to. Changes save automatically.
                  </p>
                </Show>
              </CardContent>
            </Card>

            <Card id="calendar-subscription" class="mt-5 scroll-mt-24 gap-4 py-5 sm:py-6">
              <CardHeader class="gap-1 px-5 sm:px-6">
                <div class="flex items-center gap-3">
                  <span class="grid size-9 place-items-center rounded-xl bg-accent text-accent-foreground">
                    <CalendarPlus size={17} />
                  </span>
                  <div>
                    <CardTitle class="font-display text-xl">Calendar subscription</CardTitle>
                    <CardDescription class="text-xs">
                      Birthdays from every tree you belong to, in your own calendar.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent class="px-5 sm:px-6">
                <Show
                  when={feed()}
                  fallback={
                    <div>
                      <p class="text-sm leading-relaxed text-muted-foreground">
                        Create a private iCal link, then subscribe to it from Google Calendar,
                        Apple Calendar, or Outlook. The link includes living and deceased relatives
                        with birth dates.
                      </p>
                      <Button
                        class="mt-4"
                        variant="secondary"
                        type="button"
                        disabled={feedPending()}
                        onClick={() => void applyFeedChange("create")}
                      >
                        <CalendarPlus />
                        Create calendar link
                      </Button>
                    </div>
                  }
                >
                  {currentFeed => (
                    <div class="space-y-3">
                      <Field
                        label="Subscription URL"
                        for="calendar-feed-url"
                        hint="Treat this link like a password. Anyone who has it can see names and birthdays from your trees."
                      >
                        <div class="flex flex-col gap-2 sm:flex-row">
                          <input
                            id="calendar-feed-url"
                            class="input min-w-0 flex-1 font-mono text-xs"
                            readonly
                            value={currentFeed().url}
                            onFocus={event => event.currentTarget.select()}
                          />
                          <Button
                            variant="secondary"
                            size="sm"
                            type="button"
                            class="self-start sm:self-auto"
                            onClick={() => copyCalendarUrl(currentFeed().url)}
                          >
                            <Copy />
                            Copy
                          </Button>
                        </div>
                      </Field>

                      <div class="flex flex-wrap gap-2">
                        <a
                          href={currentFeed().webcalUrl}
                          class={buttonVariants({ variant: "secondary", size: "sm" })}
                        >
                          <ExternalLink />
                          Open in calendar
                        </a>
                        <Button
                          variant="outline"
                          size="sm"
                          type="button"
                          disabled={feedPending()}
                          onClick={() => setFeedConfirm("rotate")}
                        >
                          <RotateCw />
                          New link
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          disabled={feedPending()}
                          onClick={() => setFeedConfirm("disable")}
                        >
                          <Trash2 />
                          Turn off
                        </Button>
                      </div>

                      <div class="rounded-xl border border-border bg-muted/35 px-3.5 py-3">
                        <p class="text-xs font-semibold text-foreground">How to subscribe</p>
                        <ul class="mt-2 space-y-1 text-xs leading-relaxed text-muted-foreground">
                          <li>
                            <span class="font-medium text-foreground">Google Calendar:</span> Other
                            calendars, plus, From URL.
                          </li>
                          <li>
                            <span class="font-medium text-foreground">Apple Calendar:</span> File,
                            New Calendar Subscription.
                          </li>
                          <li>
                            <span class="font-medium text-foreground">Outlook:</span> Add calendar,
                            Subscribe from web.
                          </li>
                        </ul>
                      </div>

                      <p class="text-xs leading-relaxed text-muted-foreground">
                        Calendar apps refresh the feed on their own schedule. Creating a new link
                        immediately stops the old one.
                      </p>
                    </div>
                  )}
                </Show>
              </CardContent>
            </Card>

            <ConfirmDialog
              open={feedConfirm() !== null}
              title={feedConfirm() === "disable" ? "Turn off calendar link?" : "Create a new calendar link?"}
              message={
                feedConfirm() === "disable"
                  ? "The current URL stops working immediately. If your calendar app already subscribed to it, existing events may remain until you remove the subscription there."
                  : "The current URL stops working immediately. You will need to paste the new URL into your calendar app."
              }
              confirmLabel={feedConfirm() === "disable" ? "Turn off" : "Create new link"}
              danger={feedConfirm() === "disable"}
              pending={feedPending()}
              onClose={() => setFeedConfirm(null)}
              onConfirm={() => {
                const kind = feedConfirm();
                if (kind) void applyFeedChange(kind);
              }}
            />

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

            <Card class="mt-5 gap-4 border-destructive/30 py-5 sm:py-6">
              <CardHeader class="gap-1 px-5 sm:px-6">
                <div class="flex items-center gap-3">
                  <span class="grid size-9 place-items-center rounded-xl bg-destructive/10 text-destructive">
                    <ShieldAlert size={17} />
                  </span>
                  <div>
                    <CardTitle class="font-display text-xl">Your data</CardTitle>
                    <CardDescription class="text-xs">
                      Download a copy of your account or close it for good.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent class="space-y-3 px-5 sm:px-6">
                <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/60 px-3.5 py-3">
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-foreground">Download your data</p>
                    <p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      A zip with your profile, trees, people, relationships, and a manifest of every
                      file. Add the photos and documents with the larger export.
                    </p>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <a
                      href="/api/account/export"
                      download="family-tree-export.zip"
                      class={buttonVariants({ variant: "secondary", size: "sm" })}
                    >
                      <Download />
                      Data only
                    </a>
                    <a
                      href="/api/account/export?media=1"
                      download="family-tree-export-with-files.zip"
                      class={buttonVariants({ variant: "secondary", size: "sm" })}
                    >
                      <Download />
                      With files
                    </a>
                  </div>
                </div>

                <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-3">
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-destructive">Delete account</p>
                    <p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      This removes your account. Trees where you are the only member are deleted
                      along with their photos and documents.
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    type="button"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 />
                    Delete account
                  </Button>
                </div>
              </CardContent>
            </Card>

            <p class="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
              Forgot your password? Sign out and choose “Forgot your password?” on the sign-in page
              to get a reset link by email.
            </p>

            <p class="mt-3 text-center text-[0.7rem] leading-relaxed text-muted-foreground">
              <A href="/privacy" class="underline decoration-border underline-offset-2 hover:text-foreground">
                Privacy Policy
              </A>
              <span class="px-1.5">and</span>
              <A href="/terms" class="underline decoration-border underline-offset-2 hover:text-foreground">
                Terms of Service
              </A>
            </p>
          </main>

          <Modal
            open={deleteOpen()}
            onClose={() => setDeleteOpen(false)}
            title="Delete your account?"
            description="This cannot be undone."
          >
            <form class="space-y-4" onSubmit={confirmDeleteAccount}>
              <div class="rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
                Trees where you are the only member are deleted with all their photos and documents.
                If you are the last owner of a shared tree, promote another owner or delete that
                tree first.
              </div>
              <Field label="Your password" for="delete-password">
                <input
                  id="delete-password"
                  type="password"
                  class="input"
                  autocomplete="current-password"
                  value={deletePassword()}
                  onInput={event => setDeletePassword(event.currentTarget.value)}
                  required
                />
              </Field>
              <Field
                label="Confirm your email"
                for="delete-confirmation"
                hint={`Type ${current().email} exactly.`}
              >
                <input
                  id="delete-confirmation"
                  class="input"
                  autocomplete="off"
                  value={deleteConfirmation()}
                  onInput={event => setDeleteConfirmation(event.currentTarget.value)}
                  required
                />
              </Field>
              <div class="flex flex-wrap justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" onClick={() => setDeleteOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="destructive" disabled={deletePending()}>
                  {deletePending() ? "Deleting…" : "Delete my account"}
                </Button>
              </div>
            </form>
          </Modal>
        </div>
      )}
    </Show>
  );
}

function NotificationToggle(props: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Switch
      class="flex w-full items-start justify-between gap-4 py-3.5 first:pt-0 last:pb-0"
      checked={props.checked}
      disabled={props.disabled}
      onChange={props.onChange}
    >
      <SwitchInput />
      <div class="min-w-0">
        <SwitchLabel>{props.label}</SwitchLabel>
        <SwitchDescription class="mt-0.5">{props.description}</SwitchDescription>
      </div>
      <SwitchControl aria-label={props.label}>
        <SwitchThumb />
      </SwitchControl>
    </Switch>
  );
}
