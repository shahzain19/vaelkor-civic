"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageShell, Section } from "@/components/shell";

export default function TermsPage() {
  const lastUpdated = "26 September 2025";

  return (
    <PageShell width="narrow">
      <div className="pt-6 pb-2">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back home
        </Link>
      </div>

      <h1 className="mt-4 text-[1.75rem] leading-[1.15] font-semibold tracking-[-0.022em] sm:text-[2rem]">
        Terms of Service
      </h1>
      <p className="mt-2 text-[0.8125rem] text-muted-foreground">
        Last updated: {lastUpdated}
      </p>

      <Section label="1. Acceptance of Terms">
        <div className="space-y-3 text-[0.9375rem] leading-relaxed text-pretty">
          <p>
            These Terms of Service (&ldquo;Terms&rdquo;) govern your access to
            and use of the Vaelkor Civic platform, including our website,
            mobile interface, and any associated services (collectively, the
            &ldquo;Platform&rdquo;).
          </p>
          <p>
            By creating an account, submitting a report, or otherwise using the
            Platform, you agree to be bound by these Terms. If you are using
            the Platform on behalf of an organisation, you represent that you
            have the authority to bind that organisation to these Terms.
          </p>
          <p>
            If you do not agree to these Terms, you must not use the Platform.
          </p>
        </div>
      </Section>

      <Section label="2. Eligibility">
        <div className="space-y-3 text-[0.9375rem] leading-relaxed text-pretty">
          <p>
            You must be at least eighteen (18) years old to create an account
            and use the Platform. By using the Platform you represent and
            warrant that you meet this requirement.
          </p>
          <p>
            You are responsible for maintaining the confidentiality of your
            account credentials and for all activity under your account.
          </p>
        </div>
      </Section>

      <Section label="3. Accounts and registration">
        <div className="space-y-3 text-[0.9375rem] leading-relaxed text-pretty">
          <p>
            Account creation is managed through Clerk, our authentication
            provider. You must provide accurate and complete information when
            registering.
          </p>
          <p>
            You may choose one of the following roles when setting up your
            account:
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              ["Citizen", "Report problems, confirm others' reports, and contribute to community funds."],
              ["Contractor", "Accept open work orders, file execution evidence, and submit completion."],
            ].map(([role, desc]) => (
              <div key={role} className="rounded-[var(--radius)] border border-border p-3">
                <p className="text-[0.875rem] font-medium">{role}</p>
                <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground">
            The administrator role is granted only by a platform operator and
            cannot be self-selected. You may change your role at any time, but
            actions taken under a previous role remain attributable to you.
          </p>
        </div>
      </Section>

      <Section label="4. Your conduct">
        <div className="space-y-3 text-[0.9375rem] leading-relaxed text-pretty">
          <p>
            You agree not to:
          </p>
          <ol className="space-y-1.5 pl-5 text-muted-foreground">
            {[
              "Submit false, misleading, or duplicate reports.",
              "Confirm a report you have not personally observed.",
              "Upload photographs that do not depict the actual condition of the reported problem.",
              "Submit fraudulent payment claims or forged proof of contribution.",
              "Harass, threaten, or intimidate other users.",
              "Attempt to access another user&apos;s account or data without authorisation.",
              "Use the Platform for any unlawful purpose.",
              "Interfere with or disrupt the Platform&apos;s operation.",
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground/50" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ol>
          <p>
            We reserve the right to suspend or terminate accounts that violate
            these Terms without prior notice.
          </p>
        </div>
      </Section>

      <Section label="5. Your content">
        <div className="space-y-3 text-[0.9375rem] leading-relaxed text-pretty">
          <p>
            You retain ownership of the content you submit to the Platform
            (reports, photographs, descriptions, and other materials,
            collectively &ldquo;Your Content&rdquo;).
          </p>
          <p>
            By submitting Your Content, you grant us a worldwide, non-exclusive,
            royalty-free licence to host, display, distribute, and store that
            Content on and in connection with the Platform. This licence
            continues after you delete your account to the extent necessary to
            preserve the public ledger and completed cases.
          </p>
          <p>
            You represent and warrant that:
          </p>
          <ul className="space-y-1.5 pl-5 text-muted-foreground">
            {[
              "You own or have the necessary rights to submit the Content.",
              "The Content does not violate any applicable law or the rights of any third party.",
              "The photographs accurately depict the condition they claim to represent.",
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground/50" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p>
            Case content (reports, evidence, confirmations, and work order
            records) is publicly visible and permanently recorded on the ledger
            as part of our commitment to transparency.
          </p>
        </div>
      </Section>

      <Section label="6. Community fund contributions">
        <div className="space-y-3 text-[0.9375rem] leading-relaxed text-pretty">
          <p>
            The Platform allows citizens to contribute funds toward the repair
            of specific infrastructure cases. Please read this section
            carefully.
          </p>
          <p>
            <strong className="text-foreground">We do not process or hold
            money.</strong> Contributions are made directly by contributors to
            the project bank account listed on each case. The Platform records
            your claim; it does not transfer funds between parties.
          </p>
          <p>
            <strong className="text-foreground">Contributions are voluntary
            and non-refundable.</strong> By making a contribution you acknowledge
            that:
          </p>
          <ul className="space-y-1.5 pl-5 text-muted-foreground">
            {[
              "You are donating to a community infrastructure project, not purchasing a financial product.",
              "There is no guarantee of return on your contribution.",
              "The Platform does not insure or guarantee that the funded work will be completed.",
              "Fund claims are reviewed by administrators at their discretion.",
              "Rejected claims are final; there is no appeals process within the Platform.",
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground/50" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p>
            Payment method details (bank account numbers, EasyPaisa and
            JazzCash numbers) are provided for demonstration purposes only and
            should be verified before use. The Platform is not responsible for
            transactions conducted outside its systems.
          </p>
        </div>
      </Section>

      <Section label="7. Contractor obligations">
        <div className="space-y-3 text-[0.9375rem] leading-relaxed text-pretty">
          <p>
            By accepting a work order, a contractor agrees to:
          </p>
          <ul className="space-y-1.5 pl-5 text-muted-foreground">
            {[
              "Perform the work described in the case scope to a reasonable standard of professionalism.",
              "Submit before and after photographs that accurately reflect the site condition.",
              "Not submit evidence that has been altered, fabricated, or does not correspond to the actual work performed.",
              "Complete the work within a reasonable timeframe after acceptance.",
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground/50" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p>
            Payment to contractors is released only upon successful inspection
            and closure of the case. The Platform does not guarantee payment;
            payout depends on successful completion and inspector approval.
          </p>
          <p className="text-muted-foreground">
            Contractors work at their own risk. The Platform does not provide
            insurance, warranties, or guarantees of any kind related to the
            work performed.
          </p>
        </div>
      </Section>

      <Section label="8. Disclaimers">
        <div className="space-y-3 text-[0.9375rem] leading-relaxed text-pretty">
          <p>
            The Platform is provided &ldquo;as is&rdquo; and &ldquo;as
            available&rdquo; without warranties of any kind, either express or
            implied.
          </p>
          <p>
            To the fullest extent permitted by applicable law, we disclaim all
            warranties including, but not limited to, warranties of
            merchantability, fitness for a particular purpose, and
            non-infringement.
          </p>
          <p>
            We do not guarantee that:
          </p>
          <ul className="space-y-1.5 pl-5 text-muted-foreground">
            {[
              "Reports will result in completed work.",
              "Cases will be resolved within any specific timeframe.",
              "The Platform will be uninterrupted, error-free, or secure.",
              "Fund contributions will result in the funded work being completed.",
              "Payment will be made to any contractor.",
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground/50" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section label="9. Limitation of liability">
        <div className="space-y-3 text-[0.9375rem] leading-relaxed text-pretty">
          <p>
            To the maximum extent permitted by law, Vaelkor and its officers,
            employees, and agents shall not be liable for any indirect,
            incidental, special, consequential, or punitive damages arising
            from or related to your use of the Platform.
          </p>
          <p>
            Our total liability to you for any claim arising out of these Terms
            or your use of the Platform shall not exceed the greater of:
          </p>
          <ul className="space-y-1.5 pl-5 text-muted-foreground">
            {[
              "One thousand Pakistani Rupees (PKR 1,000); or",
              "The amount you have paid to us in the twelve months preceding the claim.",
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground/50" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground">
            Nothing in these Terms excludes or limits liability for fraud,
            death, personal injury, or any other liability that cannot be
            legally excluded or limited under applicable law.
          </p>
        </div>
      </Section>

      <Section label="10. Intellectual property">
        <div className="space-y-3 text-[0.9375rem] leading-relaxed text-pretty">
          <p>
            The Platform, including its design, text, graphics, logos, icons,
            and software, is the property of Vaelkor and is protected by
            intellectual property laws.
          </p>
          <p>
            You may not reproduce, distribute, modify, create derivative works
            of, or otherwise exploit any portion of the Platform without our
            express written permission, except as necessary to use the Platform
            for its intended purpose.
          </p>
        </div>
      </Section>

      <Section label="11. Termination">
        <div className="space-y-3 text-[0.9375rem] leading-relaxed text-pretty">
          <p>
            You may close your account at any time through your account
            settings. Upon termination:
          </p>
          <ul className="space-y-1.5 pl-5 text-muted-foreground">
            {[
              "Your account will no longer be accessible.",
              "Your personal data will be deleted as described in our Privacy Policy.",
              "Case records you created remain on the public ledger, but your name and email are removed from them.",
              "Outstanding fund claims and work orders will be processed according to their status.",
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground/50" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p>
            We reserve the right to suspend or terminate your account at any
            time for violations of these Terms or for any other reason at our
            discretion.
          </p>
        </div>
      </Section>

      <Section label="12. Governing law and dispute resolution">
        <div className="space-y-3 text-[0.9375rem] leading-relaxed text-pretty">
          <p>
            These Terms are governed by the laws of the Islamic Republic of
            Pakistan, without regard to its conflict of law principles.
          </p>
          <p>
            Any dispute arising out of or in connection with these Terms shall
            be resolved through good-faith negotiation between the parties. If
            negotiation fails, the dispute shall be submitted to the exclusive
            jurisdiction of the courts located in Karachi, Pakistan.
          </p>
        </div>
      </Section>

      <Section label="13. Changes to these Terms">
        <div className="space-y-3 text-[0.9375rem] leading-relaxed text-pretty">
          <p>
            We may update these Terms from time to time. We will notify you of
            material changes by posting the revised Terms on this page and
            updating the &ldquo;Last updated&rdquo; date.
          </p>
          <p>
            Your continued use of the Platform after changes constitutes
            acceptance of the revised Terms. If you do not agree to the
            revised Terms, you must stop using the Platform.
          </p>
        </div>
      </Section>

      <Section label="14. Contact">
        <div className="space-y-3 text-[0.9375rem] leading-relaxed text-pretty">
          <p>
            If you have questions about these Terms, please contact us at:
          </p>
          <p>
            <span className="font-medium">Email:</span>{" "}
            <a
              href="mailto:legal@vaelkor.com"
              className="text-foreground underline underline-offset-2"
            >
              legal@vaelkor.com
            </a>
          </p>
          <p>
            <span className="font-medium">Address:</span> Karachi, Pakistan
          </p>
        </div>
      </Section>

      <div className="pb-8 pt-4 text-center text-[0.75rem] text-muted-foreground">
        <p>Vaelkor Civic &middot; Karachi, Pakistan</p>
      </div>
    </PageShell>
  );
}
