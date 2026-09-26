"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageShell, Section } from "@/components/shell";

export default function PrivacyPage() {
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
        Privacy Policy
      </h1>
      <p className="mt-2 text-[0.8125rem] text-muted-foreground">
        Last updated: {lastUpdated}
      </p>

      <Section label="1. Introduction">
        <div className="space-y-3 text-[0.9375rem] leading-relaxed text-pretty">
          <p>
            Vaelkor Civic (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;the
            Platform&rdquo;) is a civic infrastructure coordination platform
            operated by Vaelkor. This Privacy Policy explains what personal data
            we collect, why we collect it, how we use it, and what rights you
            have over your data.
          </p>
          <p>
            By using the Platform you agree to the practices described in this
            Policy. If you do not agree, please do not use the Platform.
          </p>
          <p>
            We take your privacy seriously. This Policy is written in plain
            language because legal documents should be readable by the people
            they protect.
          </p>
        </div>
      </Section>

      <Section label="2. What data we collect">
        <div className="space-y-5 text-[0.9375rem] leading-relaxed">
          <div>
            <h3 className="text-[0.875rem] font-medium">
              Account information
            </h3>
            <p className="mt-1 text-muted-foreground">
              When you sign up, we receive your name and email address from
              Clerk, our authentication provider. We also store a unique
              internal user ID. This information is used only to identify your
              account and attribute actions (reports, confirmations, claims) to
              you.
            </p>
          </div>

          <div>
            <h3 className="text-[0.875rem] font-medium">
              Location data
            </h3>
            <p className="mt-1 text-muted-foreground">
              When you file a report or confirm a case, your device&apos;s
              GPS coordinates are read in the browser. Your exact, raw
              coordinates are <strong>never stored or transmitted to our
              servers</strong>. Instead, the location pin shown on the case is
              randomly shifted by up to 250 metres before it is saved. This
              means the public record identifies the general area of a problem
              without revealing your home or exact position.
            </p>
            <p className="mt-1.5 text-muted-foreground">
              When you browse the ledger or map, your approximate location is
              also shifted before any query is sent to our servers. The
              distances you see are calculated locally on your device.
            </p>
          </div>

          <div>
            <h3 className="text-[0.875rem] font-medium">
              Report content
            </h3>
            <p className="mt-1 text-muted-foreground">
              When you submit a report you provide: a description of the
              problem, a category (road, drainage, garbage, or streetlight), a
              severity level, a street address or landmark, and at least one
              photograph. This content is stored and made publicly visible on
              the case file and ledger.
            </p>
          </div>

          <div>
            <h3 className="text-[0.875rem] font-medium">
              Evidence photographs
            </h3>
            <p className="mt-1 text-muted-foreground">
              Photographs uploaded as evidence (reports, before/after/during
              shots, inspection photos) are stored on Convex&apos;s secure
              storage. They are accessible to anyone viewing the relevant case.
              We do not analyse, scan, or process the visual content of your
              photos beyond what is necessary to display them.
            </p>
          </div>

          <div>
            <h3 className="text-[0.875rem] font-medium">
              Payment and fund claim data
            </h3>
            <p className="mt-1 text-muted-foreground">
              When you contribute to a community repair fund you submit a claim
              including the amount you sent, the payment method used (bank
              transfer, EasyPaisa, or JazzCash), and a screenshot of your
              payment confirmation. This screenshot is stored securely and is
              visible only to administrators during review. We do not store
              bank account numbers, PINs, or any other financial credentials.
            </p>
            <p className="mt-1.5 text-muted-foreground">
              <strong>Important:</strong> Vaelkor Civic does not process or
              hold money. Contributions are made directly by individuals to a
              project bank account. The Platform records the claim; it does not
              transfer funds.
            </p>
          </div>

          <div>
            <h3 className="text-[0.875rem] font-medium">
              Activity and notifications
            </h3>
            <p className="mt-1 text-muted-foreground">
              We record when you confirm a case, accept a work order, submit
              evidence, or make a fund claim. These events generate
              notifications so you can track the progress of cases you
              care about. Notification history is stored to deliver them to
              you and is retained for as long as your account is active plus
              ninety days.
            </p>
          </div>
        </div>
      </Section>

      <Section label="3. How we use your data">
        <div className="space-y-2 text-[0.9375rem] leading-relaxed">
          {[
            "To create and manage your account.",
            "To publish your report on the public ledger and case file.",
            "To attribute confirmations, evidence, and claims to your account.",
            "To notify you about activity on cases you have engaged with.",
            "To review and approve fund claims submitted by contributors.",
            "To maintain the integrity and security of the Platform.",
            "To comply with legal obligations where required.",
          ].map((item) => (
            <div key={item} className="flex gap-2.5">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground/50" aria-hidden />
              <span className="text-muted-foreground">{item}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section label="4. Who we share data with">
        <div className="space-y-4 text-[0.9375rem] leading-relaxed">
          <p>
            We do not sell your personal data. We share information only in the
            circumstances described below.
          </p>
          <div>
            <p className="font-medium">Clerk</p>
            <p className="text-muted-foreground">
              Our authentication provider. We receive your name and email from
              Clerk when you sign in. Clerk&apos;s own privacy policy governs
              how they process that data.
            </p>
          </div>
          <div>
            <p className="font-medium">Convex</p>
            <p className="text-muted-foreground">
              Our backend and database provider. All case data, user records,
              and stored evidence are hosted on Convex&apos;s infrastructure.
              Convex&apos;s privacy policy governs their processing.
            </p>
          </div>
          <div>
            <p className="font-medium">Public visibility</p>
            <p className="text-muted-foreground">
              Case reports, descriptions, addresses, and evidence photographs
              are publicly visible. Anyone can view them without creating an
              account. Your username (as displayed on the case) is also
              public alongside actions you take.
            </p>
          </div>
          <div>
            <p className="font-medium">Legal requirement</p>
            <p className="text-muted-foreground">
              We may disclose data if required to do so by law, court order, or
              government request. We will notify you of any such disclosure
              unless we are legally prohibited from doing so.
            </p>
          </div>
        </div>
      </Section>

      <Section label="5. Data retention">
        <div className="space-y-3 text-[0.9375rem] leading-relaxed">
          <p>
            We retain your data for as long as your account is active and for
            ninety days after deletion, to allow for recovery from accidental
            deletion and to preserve the integrity of the public ledger.
          </p>
          <p>
            Case records (reports, confirmations, evidence, work orders) remain
            on the public ledger permanently even after your account is
            deleted. This is intentional: the ledger is a public record, and
            removing individual entries would compromise its integrity. However,
            your personal identifiers (name, email) are removed from those
            records upon account deletion.
          </p>
          <p>
            Payment screenshots are retained only for the period necessary to
            review and approve the associated claim, after which they are
            deleted from storage.
          </p>
        </div>
      </Section>

      <Section label="6. Your rights">
        <div className="space-y-3 text-[0.9375rem] leading-relaxed">
          <p>
            Depending on your jurisdiction, you may have the following rights
            regarding your personal data:
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              ["Access", "Request a copy of the personal data we hold about you."],
              ["Correction", "Ask us to correct inaccurate or incomplete data."],
              ["Deletion", "Request deletion of your account and associated personal data."],
              ["Portability", "Receive your data in a structured, machine-readable format."],
              ["Objection", "Object to processing based on legitimate interests."],
              ["Withdrawal", "Withdraw consent where processing is based on consent."],
            ].map(([title, desc]) => (
              <div key={title} className="rounded-[var(--radius)] border border-border p-3">
                <p className="text-[0.875rem] font-medium">{title}</p>
                <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
          <p className="text-[0.875rem] text-muted-foreground">
            To exercise any of these rights, email us at{" "}
            <a
              href="mailto:privacy@vaelkor.com"
              className="font-medium text-foreground underline underline-offset-2"
            >
              privacy@vaelkor.com
            </a>
            . We will respond within thirty days.
          </p>
        </div>
      </Section>

      <Section label="7. Children's privacy">
        <div className="space-y-2 text-[0.9375rem] leading-relaxed">
          <p>
            The Platform is not intended for children under the age of thirteen
            (13). We do not knowingly collect personal data from children. If
            you are a parent or guardian and believe your child has provided us
            with personal data, please contact us immediately and we will
            delete it.
          </p>
        </div>
      </Section>

      <Section label="8. International data transfers">
        <div className="space-y-2 text-[0.9375rem] leading-relaxed">
          <p>
            Vaelkor Civic is operated from Karachi, Pakistan. Your data may be
            processed by our service providers (Clerk, Convex) whose servers
            are located outside Pakistan, including in the United States and
            elsewhere. By using the Platform you consent to this transfer.
          </p>
          <p>
            We take reasonable steps to ensure your data is treated securely
            regardless of where it is processed.
          </p>
        </div>
      </Section>

      <Section label="9. Security">
        <div className="space-y-2 text-[0.9375rem] leading-relaxed">
          <p>
            We implement technical and organisational measures to protect your
            data against unauthorised access, alteration, disclosure, or
            destruction. These include encryption in transit, access controls,
            rate limiting, and secure storage of uploaded files.
          </p>
          <p className="text-muted-foreground">
            No system is completely secure. We encourage you to use a strong,
            unique password and to enable two-factor authentication on your
            account.
          </p>
        </div>
      </Section>

      <Section label="10. Changes to this Policy">
        <div className="space-y-2 text-[0.9375rem] leading-relaxed">
          <p>
            We may update this Privacy Policy from time to time. We will
            notify you of material changes by posting the revised Policy on
            this page and updating the &ldquo;Last updated&rdquo; date.
          </p>
          <p>
            Continued use of the Platform after changes constitutes your
            acceptance of the revised Policy.
          </p>
        </div>
      </Section>

      <Section label="11. Contact">
        <div className="space-y-2 text-[0.9375rem] leading-relaxed">
          <p>
            If you have questions about this Privacy Policy or how we handle
            your data, please contact us at:
          </p>
          <p>
            <span className="font-medium">Email:</span>{" "}
            <a
              href="mailto:privacy@vaelkor.com"
              className="text-foreground underline underline-offset-2"
            >
              privacy@vaelkor.com
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
