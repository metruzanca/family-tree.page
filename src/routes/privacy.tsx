import { A } from "@solidjs/router";
import { LegalList, LegalPage, LegalSection } from "~/components/legal/LegalPage";

const CONTACT_EMAIL = "samuele+family-tree@zanca.dev";
const UPDATED = "16 November 2026";

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated={UPDATED}>
      <LegalSection title="The short version">
        <p>
          family-tree is a private family tree. You add people, relationships, photographs, and
          documents, and you choose who can see them. We do not sell your data, we do not run ads, and
          we do not build advertising profiles.
        </p>
        <p>
          We use a self-hosted, cookieless analytics tool for aggregate product statistics. It does
          not receive your name, email address, or account id, and page paths are reduced so invite
          and password reset links never reach it.
        </p>
        <p>
          You can download a copy of your data or delete your account from{" "}
          <A href="/settings" class="font-medium text-primary underline decoration-primary/30 underline-offset-4">
            account settings
          </A>
          .
        </p>
      </LegalSection>

      <LegalSection title="Who is responsible for your data">
        <p>
          family-tree is operated by Samuele Zanca, an individual based in Jersey City, New Jersey,
          United States. For the purposes of the EU and UK General Data Protection Regulation, that
          person is the data controller for the service at family-tree.page.
        </p>
        <p>
          Contact:{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            class="font-medium text-primary underline decoration-primary/30 underline-offset-4"
          >
            {CONTACT_EMAIL}
          </a>
          . We answer privacy requests within one month, and sooner when we can.
        </p>
      </LegalSection>

      <LegalSection title="What we collect">
        <p>
          <span class="font-medium text-foreground">Account data.</span> Your name, email address,
          password hash, email verification status, notification preferences, and account timestamps.
          Passwords are hashed with scrypt and are never stored or logged in plain text.
        </p>
        <p>
          <span class="font-medium text-foreground">Tree content.</span> Names, maiden and nicknames,
          birth, death, and event dates (including partial or approximate dates), places, biographies,
          relationships, photographs, documents, albums, tags, and the dates you attach to media. Photos
          may carry EXIF metadata such as the date taken, camera model, and, if the camera recorded it,
          GPS coordinates. Originals are stored as uploaded, so that metadata stays with the file and is
          visible to people who can see the tree.
        </p>
        <p>
          <span class="font-medium text-foreground">Collaboration data.</span> Tree memberships and
          roles, invitations you create, the email address of an invitee, and whether an invite was
          accepted or revoked. Invitations can be sent as a link or by email.
        </p>
        <p>
          <span class="font-medium text-foreground">Presence data.</span> When a tree is open, the
          server keeps an in-memory list of who is connected and which person, file, or album they are
          looking at. This is shown to other members of the same tree, is not written to the database,
          and disappears when the tab closes.
        </p>
        <p>
          <span class="font-medium text-foreground">Email delivery data.</span> We send verification,
          password reset, email change, invitation, and optional birthday reminder emails through
          Resend. We keep a log that a birthday reminder was sent to you for a given date, so you do
          not receive it twice.
        </p>
        <p>
          <span class="font-medium text-foreground">Analytics data.</span> When analytics is enabled,
          we run a self-hosted Umami instance. It records the page path (reduced to a generic label),
          referrer, browser, operating system, device type, browser language, and an approximate
          location derived from the request IP. It does not use cookies or local storage on your
          device, we do not set a distinct user id, and the session salt rotates regularly. We record
          product events such as "tree created" or "media uploaded" with counts and coarse size
          buckets, never file names, person names, email addresses, or file contents. Invite, password
          reset, email verification, and calendar links are never sent.
        </p>
        <p>
          <span class="font-medium text-foreground">Security and abuse data.</span> We keep short-lived
          rate limit counters in memory, which can include an IP address and an email address for a few
          minutes. We keep per-account counts of uploads, stored bytes, files, trees, and people,
          rejected uploads, and quota errors, so we can enforce limits and spot abuse. These records
          contain numbers and timestamps, not file contents or file names. Our hosting provider also
          keeps standard server logs for operations and security.
        </p>
        <p>
          <span class="font-medium text-foreground">Error reports.</span> If error tracking is enabled,
          we use Sentry to receive crash reports. We configure it to scrub request bodies, cookies,
          email addresses, and similar personal data before an event is sent. Error reports are used
          only to find and fix bugs.
        </p>
        <p>
          <span class="font-medium text-foreground">Backups.</span> We back up the database and media
          to a second private storage bucket so the service can be restored after a failure.
        </p>
      </LegalSection>

      <LegalSection title="People in your tree who are not users">
        <p>
          Most people in a family tree never create an account. If you add a relative, you are adding
          personal data about them, and you are responsible for having a lawful reason to do so and
          for keeping it accurate. We process that data to provide the service you asked for, to store
          it privately for the tree's members, and to secure the service.
        </p>
        <p>
          A person whose data appears in a tree can contact us at the address above. We will help them
          exercise their rights, and we may need to refer the request to the tree owner who added the
          data.
        </p>
      </LegalSection>

      <LegalSection title="Why we process your data">
        <div class="overflow-x-auto">
          <table class="min-w-full border-collapse text-left text-xs">
            <thead>
              <tr class="border-b border-border text-foreground">
                <th class="py-2 pr-4 font-semibold">Purpose</th>
                <th class="py-2 font-semibold">Legal basis</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr>
                <td class="py-2 pr-4">Creating and running your account and trees</td>
                <td class="py-2">Performance of a contract</td>
              </tr>
              <tr>
                <td class="py-2 pr-4">Storing and sharing tree content with people you invite</td>
                <td class="py-2">Performance of a contract</td>
              </tr>
              <tr>
                <td class="py-2 pr-4">Security, rate limiting, quotas, and abuse prevention</td>
                <td class="py-2">Legitimate interests</td>
              </tr>
              <tr>
                <td class="py-2 pr-4">Aggregate, cookieless product analytics</td>
                <td class="py-2">Legitimate interests</td>
              </tr>
              <tr>
                <td class="py-2 pr-4">Birthday reminder emails and calendar subscriptions</td>
                <td class="py-2">Consent, or your explicit request</td>
              </tr>
              <tr>
                <td class="py-2 pr-4">Backups, legal claims, and legal obligations</td>
                <td class="py-2">Legitimate interests or legal obligation</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Where we rely on legitimate interests, we keep the data minimal and give you a way to
          object. We do not use your data for automated decisions that have legal or significant
          effects.
        </p>
      </LegalSection>

      <LegalSection title="Cookies and local storage">
        <p>
          We set one cookie, <code class="rounded bg-muted px-1 py-0.5 text-[0.72rem]">family_tree_session</code>,
          which keeps you signed in. It is encrypted, HTTP-only, and lasts 30 days. It is strictly
          necessary, so it does not need consent.
        </p>
        <p>
          Your theme choice is stored in your browser's local storage. The analytics tracker sets no
          cookies and we do not use advertising or cross-site tracking technologies. Because there is
          no non-essential storage, the service does not show a cookie banner.
        </p>
      </LegalSection>

      <LegalSection title="Who we share data with">
        <p>
          We use a small number of service providers. They process data on our instructions and only
          for the purposes below. We do not sell personal data.
        </p>
        <div class="overflow-x-auto">
          <table class="min-w-full border-collapse text-left text-xs">
            <thead>
              <tr class="border-b border-border text-foreground">
                <th class="py-2 pr-4 font-semibold">Provider</th>
                <th class="py-2 pr-4 font-semibold">Purpose</th>
                <th class="py-2 font-semibold">Location</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr>
                <td class="py-2 pr-4">Railway</td>
                <td class="py-2 pr-4">Application hosting, PostgreSQL, object storage, backups</td>
                <td class="py-2">United States</td>
              </tr>
              <tr>
                <td class="py-2 pr-4">Resend</td>
                <td class="py-2 pr-4">Transactional email delivery</td>
                <td class="py-2">United States</td>
              </tr>
              <tr>
                <td class="py-2 pr-4">Umami (self-hosted)</td>
                <td class="py-2 pr-4">Aggregate product analytics</td>
                <td class="py-2">United States</td>
              </tr>
              <tr>
                <td class="py-2 pr-4">Sentry</td>
                <td class="py-2 pr-4">Error reports, only when enabled and scrubbed</td>
                <td class="py-2">United States or EU, depending on configuration</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Calendar subscriptions are fetched directly by your calendar app from our server, so Google,
          Apple, or Microsoft may see the names and birthdays in the feed you choose to subscribe to.
        </p>
        <p>
          We may disclose data if the law requires it, or to protect the service and its users. If the
          service is ever transferred, data may move to the new operator under this policy.
        </p>
      </LegalSection>

      <LegalSection title="Where data is stored and international transfers">
        <p>
          The service and its data are hosted in the United States. If you are in the European
          Economic Area, the United Kingdom, or Switzerland, your data is processed outside your
          country. Where the law requires it, we rely on appropriate safeguards with our providers,
          such as standard contractual clauses or an applicable adequacy decision. You can ask us for
          more detail about those safeguards.
        </p>
      </LegalSection>

      <LegalSection title="How long we keep data">
        <div class="overflow-x-auto">
          <table class="min-w-full border-collapse text-left text-xs">
            <thead>
              <tr class="border-b border-border text-foreground">
                <th class="py-2 pr-4 font-semibold">Data</th>
                <th class="py-2 font-semibold">Retention</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr>
                <td class="py-2 pr-4">Account and tree content</td>
                <td class="py-2">Until you delete it or your account</td>
              </tr>
              <tr>
                <td class="py-2 pr-4">Session cookie</td>
                <td class="py-2">30 days, or until you sign out</td>
              </tr>
              <tr>
                <td class="py-2 pr-4">Verification, reset, and email change tokens</td>
                <td class="py-2">1 hour to 24 hours, and removed after use</td>
              </tr>
              <tr>
                <td class="py-2 pr-4">Invitations</td>
                <td class="py-2">Expire after 1 to 30 days, removed within 90 days after that</td>
              </tr>
              <tr>
                <td class="py-2 pr-4">Birthday reminder log</td>
                <td class="py-2">12 months</td>
              </tr>
              <tr>
                <td class="py-2 pr-4">Usage and abuse counters</td>
                <td class="py-2">90 days</td>
              </tr>
              <tr>
                <td class="py-2 pr-4">Analytics events</td>
                <td class="py-2">Up to 12 months</td>
              </tr>
              <tr>
                <td class="py-2 pr-4">Error reports</td>
                <td class="py-2">Normally 30 days</td>
              </tr>
              <tr>
                <td class="py-2 pr-4">Backups</td>
                <td class="py-2">30 daily copies, plus the first copy of each month for 12 months</td>
              </tr>
              <tr>
                <td class="py-2 pr-4">Server logs</td>
                <td class="py-2">A short operational period set by our hosting provider</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          When you delete your account, live data is removed immediately. Copies can remain in backups
          until the backup retention period ends, and are then overwritten.
        </p>
      </LegalSection>

      <LegalSection title="Your rights">
        <p>If you are in the EEA, the UK, or Switzerland, you have the right to:</p>
        <LegalList>
          <li>Access the personal data we hold about you.</li>
          <li>Correct data that is wrong or incomplete.</li>
          <li>Delete your data, subject to legal exceptions.</li>
          <li>Restrict or object to some processing.</li>
          <li>Receive a portable copy of data you provided.</li>
          <li>Withdraw consent at any time, without affecting past processing.</li>
          <li>Complain to your local data protection authority.</li>
        </LegalList>
        <p>
          You can do several of these yourself. Account settings has a data export that produces a zip
          with a JSON manifest and every original photo and document, links to change your email
          address, and a delete account flow. Birthday reminders can be switched off, and a calendar
          subscription can be revoked at any time.
        </p>
        <p>
          Deleting your account requires your password and a typed confirmation. Trees where you are
          the only member are deleted. If you are the last owner of a shared tree, transfer ownership
          or delete that tree first. Files you uploaded into someone else's tree stay in that tree,
          because they belong to its members, and your account reference is removed.
        </p>
        <p>
          For anything else, email us. We may ask you to verify your identity before acting on a
          request.
        </p>
      </LegalSection>

      <LegalSection title="Security">
        <p>
          Traffic is encrypted in transit. Passwords are hashed with scrypt. Files live in a private
          bucket and are served through short-lived signed URLs after an authorization check. Access to
          a tree is checked on the server for every action. We keep backups and apply rate limits to
          sensitive actions.
        </p>
        <p>
          No service is perfectly secure. If you think an account or a tree has been compromised,
          contact us immediately.
        </p>
      </LegalSection>

      <LegalSection title="Children">
        <p>
          family-tree is not intended for children under 16. We do not knowingly create accounts for
          children. If you believe a child has given us personal data, contact us and we will remove it.
        </p>
      </LegalSection>

      <LegalSection title="Changes to this policy">
        <p>
          We may update this policy when the service changes. The date at the top shows the latest
          version. If a change materially affects your rights, we will tell you by email or in the app
          before it takes effect.
        </p>
      </LegalSection>

      <LegalSection title="Contact and complaints">
        <p>
          Questions about this policy, or a request about your data:{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            class="font-medium text-primary underline decoration-primary/30 underline-offset-4"
          >
            {CONTACT_EMAIL}
          </a>
          .
        </p>
        <p>
          If you are in the EEA, the UK, or Switzerland and are not satisfied with our answer, you can
          complain to your national data protection authority. We would appreciate the chance to fix
          the issue first.
        </p>
        <p>
          This policy covers the hosted service at family-tree.page. If you run the open source code
          yourself, you are the controller for your own instance and this policy does not apply to it.
        </p>
      </LegalSection>

      <p class="text-xs text-muted-foreground">
        See also the{" "}
        <A href="/terms" class="font-medium text-primary underline decoration-primary/30 underline-offset-4">
          Terms of Service
        </A>
        .
      </p>
    </LegalPage>
  );
}
