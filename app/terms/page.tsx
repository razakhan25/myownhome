import type { Metadata } from "next";
import Legal from "@/components/Legal";

export const metadata: Metadata = { title: "Terms — MyOwnHome" };

export default function Terms() {
  return (
    <Legal title="Terms of use" updated="November 2, 2026">
      <p>By using MyOwnHome you agree to these terms. If you do not agree, please do not use the service.</p>

      <h2>What MyOwnHome is</h2>
      <p>MyOwnHome is a planning tool. It estimates what you might afford, what cash you might need, and when your savings could get you there, using the numbers you enter or the accounts you link, plus public market data. Estimates are for planning only.</p>

      <h2>What MyOwnHome is not</h2>
      <ul>
        <li>It is <b>not a lender</b> and does not make, arrange or broker loans. Nothing here is a loan offer, a pre-approval or a commitment to lend.</li>
        <li>It is <b>not financial, investment, tax or legal advice</b>, and the advisor is software, not a licensed professional. Check big decisions with a licensed lender, financial planner, tax professional or attorney.</li>
        <li>Market figures (home values, rates, taxes, insurance, closing costs) are averages from third-party sources with the date shown. Your actual quotes will differ.</li>
      </ul>

      <h2>Your account</h2>
      <p>You must be 18 or older and provide a working email. Keep your sign-in links private. You are responsible for the accuracy of what you enter. You may delete your account at any time from Settings.</p>

      <h2>Linked accounts</h2>
      <p>Connecting a bank is optional. You authorize Plaid to retrieve read-only data from your financial institution and share it with MyOwnHome, subject to Plaid's terms. MyOwnHome cannot initiate payments, transfers or any change to your accounts. You can unlink a bank at any time, which deletes its data from MyOwnHome and revokes our access.</p>

      <h2>Acceptable use</h2>
      <p>Do not use MyOwnHome to link accounts you are not authorized to access, to probe or disrupt the service, or to scrape it. We may suspend accounts that do.</p>

      <h2>Availability and changes</h2>
      <p>MyOwnHome is in beta. Features may change, data sources may update, and the service may be unavailable at times. We may introduce paid plans in the future; nothing you use today will be charged without your explicit agreement.</p>

      <h2>Disclaimer and limitation of liability</h2>
      <p>The service is provided “as is” without warranties of any kind. To the fullest extent permitted by law, Propmatrix is not liable for any loss arising from reliance on estimates, data errors, third-party outages or decisions you make, and our total liability for any claim is limited to the amount you paid us in the twelve months before the claim (which may be zero).</p>

      <h2>Privacy</h2>
      <p>Our <a href="/privacy">privacy policy</a> explains what we collect and how we use it, and is part of these terms.</p>

      <h2>Governing law</h2>
      <p>These terms are governed by the laws of the State of Texas, without regard to conflict-of-law rules.</p>

      <h2>Contact</h2>
      <p>Questions about these terms: reach us through <a href="https://propmatrix.ai">propmatrix.ai</a>.</p>
    </Legal>
  );
}
