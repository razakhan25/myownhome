import type { Metadata } from "next";
import Legal from "@/components/Legal";

export const metadata: Metadata = { title: "Privacy — MyOwnHome" };

export default function Privacy() {
  return (
    <Legal title="Privacy policy" updated="November 2, 2026">
      <p>MyOwnHome (“we”) is a home-buying planner run by Propmatrix. This policy explains what we collect, why, and what you can do about it. The short version: we collect only what the plan needs, we read your bank data but can never touch your money, we never sell data, and you can delete everything in one click.</p>

      <h2>What we collect</h2>
      <ul>
        <li><b>Account.</b> Your email address, used to sign you in with a one-time link and to send plan updates you ask for.</li>
        <li><b>Your plan.</b> The numbers you type (income, debts, savings, rent, target price, loan choices) and the metro you pick.</li>
        <li><b>Linked bank data, only if you connect a bank.</b> Through Plaid we receive account names and masked numbers, balances, up to 24 months of transactions (date, merchant, amount, Plaid's category), recurring-payment detection, and for cards and loans the balance, minimum payment, APR and due date. Access is read-only. We never see your bank username or password; you enter those with Plaid or your bank directly.</li>
        <li><b>Advisor conversations.</b> Questions you ask the advisor are sent to Anthropic's API to generate the answer, together with the plan and account summaries the advisor's tools return. Short notes the advisor saves about your goals are stored with your account.</li>
        <li><b>Technical data.</b> Standard server logs (IP address, browser, pages requested) kept by our hosting provider for security and debugging.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To compute your plan: affordability, cash to close, savings rate and buy date.</li>
        <li>To keep the plan current by syncing linked accounts daily and when your bank reports changes.</li>
        <li>To answer your questions in the advisor.</li>
        <li>To run and secure the service.</li>
      </ul>
      <p>We do not sell personal data, do not share it with advertisers, and do not use it to train AI models. We do not share your data with lenders or agents unless you explicitly ask us to in a future feature, and we will tell you before any such feature exists.</p>

      <h2>Who else sees it</h2>
      <ul>
        <li><b>Plaid</b> connects to your bank on your behalf. Plaid's own <a href="https://plaid.com/legal/#end-user-privacy-policy">end-user privacy policy</a> applies to that connection.</li>
        <li><b>Supabase</b> hosts our database and sign-in (US East). Bank access tokens are encrypted with a key Supabase does not hold.</li>
        <li><b>Vercel</b> runs the application.</li>
        <li><b>Anthropic</b> processes advisor requests under its API terms, which do not permit training on API data.</li>
        <li>Market data (Zillow, Freddie Mac via FRED, the US Census, state insurance averages) is public and contains nothing about you.</li>
      </ul>

      <h2>How long we keep it</h2>
      <p>For as long as you have an account. Unlinking a bank deletes its accounts and transactions right away and revokes our access at Plaid. Deleting your account (Settings → Delete my account) disconnects every bank, deletes your plan, accounts, transactions, notes and sign-in, and cannot be undone. Server logs are kept for a limited time by our providers.</p>

      <h2>Security</h2>
      <p>Data moves over HTTPS. Bank access tokens are encrypted at rest with AES-256-GCM. Database access is restricted per user by row-level security. No system is perfect; if we learn of a breach affecting your data we will tell you promptly.</p>

      <h2>Your rights</h2>
      <p>You can see and change your plan at any time, unlink any bank, and delete your account yourself. If you are in a state with a consumer privacy law (such as California, Texas, Colorado or Virginia) you also have the right to request access to, correction of, or deletion of your data and to appeal a decision; the in-app controls satisfy these requests, and you can also contact us through <a href="https://propmatrix.ai">propmatrix.ai</a>.</p>

      <h2>Children</h2>
      <p>MyOwnHome is for adults. We do not knowingly collect data from anyone under 18.</p>

      <h2>Changes</h2>
      <p>If this policy changes in a way that matters, we will note the new date here and tell signed-in users.</p>
    </Legal>
  );
}
