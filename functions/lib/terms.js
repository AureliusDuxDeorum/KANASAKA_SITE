export const TERMS_EFFECTIVE_DATE = "21 August 2026";
export const CURRENT_TOS_VERSION = "2";

export function getTermsEmailHtml() {
  return `
    <div style="font-family:Inter,Arial,sans-serif;line-height:1.65;color:#111111;max-width:680px;">
      <h1 style="font-size:24px;letter-spacing:0.08em;text-transform:uppercase;">KANASAKA Terms of Service</h1>
      <p style="color:#444444;">Effective date: ${TERMS_EFFECTIVE_DATE}</p>

      <h2 style="font-size:16px;letter-spacing:0.06em;text-transform:uppercase;">1. Agreement to Terms</h2>
      <p>By accessing or using the KANASAKA website at kanasaka.com (the "Site"), creating an account, purchasing a subscription, or using software or downloads made available through the Site, you agree to be bound by these Terms of Service ("Terms"). If you do not agree, do not use the Site or our services.</p>

      <h2 style="font-size:16px;letter-spacing:0.06em;text-transform:uppercase;">2. Description of Service</h2>
      <p>KANASAKA provides an informational website, user accounts, subscription billing for KS_Package, authenticated access to entitled product downloads (including KS Unify), desktop software access (including KS Stocks where entitled), support and contact channels, and related online services. Features, pricing, and product availability may change, be limited, or be withdrawn during active development.</p>

      <h2 style="font-size:16px;letter-spacing:0.06em;text-transform:uppercase;">3. Eligibility</h2>
      <p>You must be at least 16 years old and able to form a binding contract under applicable law. By using the Site or purchasing a subscription, you represent that you meet these requirements. If you purchase on behalf of an organization, you represent that you have authority to bind that organization.</p>

      <h2 style="font-size:16px;letter-spacing:0.06em;text-transform:uppercase;">4. Accounts and Security</h2>
      <p>You are responsible for maintaining the confidentiality of your login credentials and for all activity under your account. You must provide accurate registration information, keep it up to date, and notify us promptly of unauthorized access. Your KANASAKA account ID is used to identify your account for permissions, billing, and software entitlement. Entitlements are tied to your account, not to a specific device. We may suspend or terminate accounts that violate these Terms or pose a security risk.</p>

      <h2 style="font-size:16px;letter-spacing:0.06em;text-transform:uppercase;">5. Acceptable Use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>use the Site, subscriptions, or downloads for unlawful, harmful, or fraudulent purposes;</li>
        <li>attempt to gain unauthorized access to systems, accounts, paywalled content, or data;</li>
        <li>share, resell, or pool subscription access in a manner that circumvents account-based entitlement;</li>
        <li>interfere with or disrupt the Site, its infrastructure, billing systems, or other users;</li>
        <li>reverse engineer, decompile, or redistribute software except as expressly permitted;</li>
        <li>scrape, harvest, or automate access in a manner that burdens our services;</li>
        <li>upload malware or submit false, misleading, or abusive content.</li>
      </ul>

      <h2 style="font-size:16px;letter-spacing:0.06em;text-transform:uppercase;">6. Subscriptions and Billing (KS_Package)</h2>
      <p><strong>6.1 Product.</strong> KS_Package is a recurring subscription that grants entitlement to KANASAKA software and downloads made available under these Terms while the subscription is active, including KS Stocks desktop access and authenticated product downloads such as KS Unify, unless a specific product page states additional restrictions.</p>
      <p><strong>6.2 Pricing.</strong> Current list prices are €10.00 per month or €100.00 per year. The price shown at checkout is the price that applies to your purchase. We may change prices for future billing periods with reasonable notice where required by law.</p>
      <p><strong>6.3 Payment processing.</strong> Payments are processed by Stripe. By subscribing, you also agree to Stripe's applicable terms and privacy practices for payment processing. We do not store full payment card numbers on our servers.</p>
      <p><strong>6.4 Account-based entitlement.</strong> Your subscription is linked to your KANASAKA account and account ID. Entitlement applies when you sign in with that account on supported applications and the Site. It is not transferable and does not constitute a device license.</p>
      <p><strong>6.5 Renewal and cancellation.</strong> Subscriptions renew automatically for the selected billing period until you cancel through the billing portal in Account Settings or as otherwise made available. You may cancel at any time. After cancellation, access generally continues until the end of the current paid billing period, unless otherwise stated at checkout or required by law.</p>
      <p><strong>6.6 Failed payments.</strong> If a renewal payment fails, we may suspend or end entitlement until payment is successfully processed.</p>
      <p><strong>6.7 Refunds.</strong> Except where mandatory consumer law requires otherwise, subscription fees are non-refundable, including for partial billing periods or unused time.</p>
      <p><strong>6.8 EU withdrawal right.</strong> If you are a consumer in the European Union, you may have a statutory right to withdraw from a distance contract within 14 days. If you request immediate access to digital content or services and expressly consent to begin performance before the withdrawal period ends, you acknowledge that you may lose your right of withdrawal once delivery has begun, to the extent permitted by law.</p>
      <p><strong>6.9 Authorized complimentary access.</strong> We may grant selected authorized accounts complimentary access to some or all entitled services without a paid subscription. Such access may be modified or revoked at any time.</p>

      <h2 style="font-size:16px;letter-spacing:0.06em;text-transform:uppercase;">7. Software Access and Downloads</h2>
      <p>Access to product downloads and entitled desktop software requires a valid KS_Package subscription or authorized complimentary access, except where a product page explicitly states different requirements. Software such as KS Unify and KS Stocks is provided for personal or internal business use under these Terms unless a separate license agreement applies. Pre-release builds may be incomplete, unstable, or change without notice. You download and use software at your own risk. Distribution, sublicensing, or commercial resale of downloads or software is prohibited unless we authorize it in writing. Certain products, including private alpha releases, may be limited to designated accounts or platforms.</p>
      <p><strong>KS Stocks third-party accounts.</strong> KS Stocks does not include Alpaca or Ollama accounts. You must create and maintain your own Alpaca brokerage account and Ollama access (cloud API key or local instance) to use core app features. You are responsible for those third-party accounts, their fees, and compliance with their terms.</p>

      <h2 style="font-size:16px;letter-spacing:0.06em;text-transform:uppercase;">8. Intellectual Property</h2>
      <p>The Site, KANASAKA branding, logos, text, graphics, and software are owned by KANASAKA or its licensors and protected by intellectual property laws. These Terms do not grant you any ownership rights except the limited right to use the Site, your subscription entitlements, and permitted downloads or software in accordance with these Terms.</p>

      <h2 style="font-size:16px;letter-spacing:0.06em;text-transform:uppercase;">9. Privacy</h2>
      <p>Our handling of personal data is described in our Privacy Policy. By using the Site or subscribing, you acknowledge that we process account, security, billing, and usage data as needed to operate the service, and that payment data is handled by our payment processor.</p>

      <h2 style="font-size:16px;letter-spacing:0.06em;text-transform:uppercase;">10. Disclaimers</h2>
      <p>The Site, subscriptions, and all software are provided "as is" and "as available" without warranties of any kind, whether express or implied, including merchantability, fitness for a particular purpose, and non-infringement. We do not guarantee uninterrupted, secure, or error-free operation. KS Stocks and related market or portfolio features are provided for informational and tooling purposes only. They do not constitute investment, tax, or legal advice, and they are not a regulated financial service. You are solely responsible for your financial decisions. KS Stocks relies on third-party services including Alpaca and Ollama; we do not operate those services and are not responsible for their availability, accuracy, or policies.</p>

      <h2 style="font-size:16px;letter-spacing:0.06em;text-transform:uppercase;">11. Limitation of Liability</h2>
      <p>To the fullest extent permitted by law, KANASAKA and its operators will not be liable for indirect, incidental, special, consequential, or punitive damages, or for loss of profits, data, or goodwill arising from your use of the Site, subscriptions, or software. Our total liability for any claim relating to the Site or services will not exceed the greater of €100 or the amount you paid us (if any) in the twelve months before the claim.</p>

      <h2 style="font-size:16px;letter-spacing:0.06em;text-transform:uppercase;">12. Indemnification</h2>
      <p>You agree to indemnify and hold harmless KANASAKA from claims, damages, and expenses (including reasonable legal fees) arising from your misuse of the Site, violation of these Terms, or infringement of third-party rights.</p>

      <h2 style="font-size:16px;letter-spacing:0.06em;text-transform:uppercase;">13. Termination</h2>
      <p>You may stop using the Site at any time. If you delete your KANASAKA account, you remain responsible for canceling any active subscription through the billing portal so that renewals do not continue. We may suspend or terminate access if you breach these Terms or if required for legal, security, or operational reasons. Upon termination or expiry of entitlement, access to downloads and entitled software may end immediately or at the end of the current billing period, as applicable. Provisions that by nature should survive termination will remain in effect.</p>

      <h2 style="font-size:16px;letter-spacing:0.06em;text-transform:uppercase;">14. Changes to Terms</h2>
      <p>We may update these Terms from time to time. Material changes will be indicated by updating the effective date and, where appropriate, the Terms version. Continued use after changes become effective constitutes acceptance of the revised Terms. If you do not agree to updated Terms, you must stop using the Site and cancel any active subscription.</p>

      <h2 style="font-size:16px;letter-spacing:0.06em;text-transform:uppercase;">15. Governing Law</h2>
      <p>These Terms are governed by the laws of Germany, excluding conflict-of-law rules. Mandatory consumer protections in your country of residence remain unaffected where applicable.</p>

      <h2 style="font-size:16px;letter-spacing:0.06em;text-transform:uppercase;">16. Contact</h2>
      <p>Questions about these Terms: <a href="mailto:contactns@kanasaka.com">contactns@kanasaka.com</a></p>

      <p style="margin-top:32px;color:#666666;font-size:13px;">You requested a copy of the KANASAKA Terms of Service from kanasaka.com.</p>
    </div>
  `;
}
