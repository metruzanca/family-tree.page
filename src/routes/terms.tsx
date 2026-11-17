import { A } from "@solidjs/router";
import { LegalList, LegalPage, LegalSection } from "~/components/legal/LegalPage";

const CONTACT_EMAIL = "samuele+family-tree@zanca.dev";
const UPDATED = "16 November 2026";

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated={UPDATED}>
      <LegalSection title="Agreement">
        <p>
          These terms govern your use of the hosted family-tree service at family-tree.page. By
          creating an account or using the service, you agree to them. If you do not agree, do not use
          the service.
        </p>
        <p>
          The{" "}
          <A href="/privacy" class="font-medium text-primary underline decoration-primary/30 underline-offset-4">
            Privacy Policy
          </A>{" "}
          explains how we handle personal data and is part of these terms.
        </p>
      </LegalSection>

      <LegalSection title="The service">
        <p>
          family-tree is a private, collaborative family tree. You can record people, relationships,
          events, photographs, and documents, and invite other people to view or edit a tree.
        </p>
        <p>
          The source code is open source under the MIT license. These terms cover the server we run,
          not your own copy of the software.
        </p>
      </LegalSection>

      <LegalSection title="Your account">
        <LegalList>
          <li>You must be at least 16 years old to create an account.</li>
          <li>Give accurate account details and keep your password and session secure.</li>
          <li>You are responsible for activity under your account.</li>
          <li>One account per person. Do not share an account to get around limits.</li>
          <li>Tell us promptly if you believe your account has been compromised.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Your content">
        <p>
          You keep ownership of the content you add. You give us permission to store it, back it up,
          and display it to the people you have invited to the tree, only to run the service. That
          permission ends when the content is deleted, apart from copies in backups that expire on
          their normal schedule.
        </p>
        <p>
          You are responsible for the content you add, including information and photographs about
          relatives who do not use the service. Only add personal data about other people when you have
          a lawful reason to do so and when sharing it with the tree's members is appropriate.
        </p>
        <p>
          Do not upload content that is unlawful, infringes someone else's rights, or that you do not
          have permission to share.
        </p>
      </LegalSection>

      <LegalSection title="Acceptable use">
        <p>Do not use the service to:</p>
        <LegalList>
          <li>Break the law, infringe rights, or harm another person.</li>
          <li>Upload malware, or files that are not part of a family tree, photo album, or document collection.</li>
          <li>Probe, scan, overload, or attempt to bypass access controls, quotas, or rate limits.</li>
          <li>Scrape other people's trees or collect data about them without permission.</li>
          <li>Create accounts or trees in bulk to evade limits or to store unrelated files.</li>
          <li>Resell the hosted service without a separate agreement.</li>
        </LegalList>
        <p>
          We may investigate suspected abuse, apply rate limits, and remove content that violates these
          terms.
        </p>
      </LegalSection>

      <LegalSection title="Limits and storage">
        <p>
          The service applies limits to how much you can store and how many records you can create.
          The current limits, and the amount you are using, are shown in account settings. Limits apply
          per account and count activity even when content is later deleted, so removing a tree does
          not reset every limit.
        </p>
        <p>
          If you need more space for a legitimate use, contact us at the address below. We may raise a
          limit at our discretion, and we may change the default limits as the service evolves. We will
          not silently delete your content to enforce a new limit.
        </p>
      </LegalSection>

      <LegalSection title="Availability and changes">
        <p>
          The service is provided as it is and as available. We do not promise uninterrupted
          availability, and we may change, pause, or discontinue features. We take backups, but you
          should keep your own copy of anything you cannot afford to lose. The export in account
          settings is there for that.
        </p>
        <p>
          If we plan to shut down the hosted service, we will give reasonable notice and a way to
          export your data.
        </p>
      </LegalSection>

      <LegalSection title="Suspension and termination">
        <p>
          You can stop using the service at any time and delete your account from account settings.
          Deleting your account requires your password and a typed confirmation, and it removes the
          data described in the Privacy Policy.
        </p>
        <p>
          We may suspend or close an account that seriously or repeatedly violates these terms, that
          creates a security or legal risk, or that abuses storage and quotas. Where it is reasonable,
          we will warn you first and give you a chance to export your data.
        </p>
      </LegalSection>

      <LegalSection title="Disclaimers">
        <p>
          The service is provided without warranties of any kind, to the extent the law allows. We do
          not warrant that it will be error-free, that data will never be lost, or that it is fit for a
          particular purpose.
        </p>
        <p>
          Nothing in these terms limits rights you have under mandatory consumer protection law,
          including in the EU or the UK.
        </p>
      </LegalSection>

      <LegalSection title="Limitation of liability">
        <p>
          To the extent the law allows, we are not liable for indirect, incidental, special, or
          consequential losses, or for lost data, profits, or goodwill, arising from your use of the
          service. Where liability cannot be excluded, our total liability is limited to the amount you
          paid us in the twelve months before the claim, which for the free service is zero.
        </p>
      </LegalSection>

      <LegalSection title="Governing law">
        <p>
          These terms are governed by the laws of the State of New Jersey, United States, without
          regard to conflict of law rules. If you are a consumer in the EU or the UK, this choice does
          not deprive you of the protection of the mandatory laws of your country of residence, and you
          may bring a claim in your local courts.
        </p>
      </LegalSection>

      <LegalSection title="Changes to these terms">
        <p>
          We may update these terms when the service changes. The date at the top shows the latest
          version. If a change materially affects your rights, we will tell you by email or in the app
          before it takes effect. Continuing to use the service after a change means you accept it.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Questions about these terms:{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            class="font-medium text-primary underline decoration-primary/30 underline-offset-4"
          >
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
