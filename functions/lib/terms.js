export const TERMS_EFFECTIVE_DATE = "7 November 2026";
export const CURRENT_TOS_VERSION = "5";

export function getTermsEmailHtml() {
  return `
    <div style="font-family:Inter,Arial,sans-serif;line-height:1.65;color:#111111;max-width:680px;">
      <h1 style="font-size:24px;letter-spacing:0.08em;text-transform:uppercase;">KANASAKA Terms of Service</h1>
      <p style="color:#444444;">Effective date: ${TERMS_EFFECTIVE_DATE}</p>

      <h2 style="font-size:16px;letter-spacing:0.06em;text-transform:uppercase;">1. Agreement to Terms</h2>
      <p>By accessing or using the KANASAKA website at kanasaka.com (the "Site"), creating an account, or using software or downloads made available through the Site, you agree to be bound by these Terms of Service ("Terms"). If you do not agree, do not use the Site or our services.</p>

      <h2 style="font-size:16px;letter-spacing:0.06em;text-transform:uppercase;">2. Description of Service</h2>
      <p>KANASAKA provides an informational website, user accounts, downloads of KANASAKA software, a free public download of KS_Link (a separate messaging service described in Section 14), support and contact channels, and related online services. Features and product availability may change, be limited, or be withdrawn during active development.</p>

      <h2 style="font-size:16px;letter-spacing:0.06em;text-transform:uppercase;">3. Eligibility</h2>
      <p>You must be at least 16 years old and able to form a binding contract under applicable law. By using the Site, you represent that you meet these requirements. If you use the Site on behalf of an organization, you represent that you have authority to bind that organization.</p>

      <h2 style="font-size:16px;letter-spacing:0.06em;text-transform:uppercase;">4. Accounts and Security</h2>
      <p>You are responsible for maintaining the confidentiality of your login credentials and for all activity under your account. You must provide accurate registration information, keep it up to date, and notify us promptly of unauthorized access. Your KANASAKA account ID is used to identify your account for permissions and software access. Access is tied to your account, not to a specific device. We may suspend or terminate accounts that violate these Terms or pose a security risk.</p>

      <h2 style="font-size:16px;letter-spacing:0.06em;text-transform:uppercase;">5. Acceptable Use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>use the Site or downloads for unlawful, harmful, or fraudulent purposes;</li>
        <li>attempt to gain unauthorized access to systems, accounts, restricted content, or data;</li>
        <li>interfere with or disrupt the Site, its infrastructure, or other users;</li>
        <li>reverse engineer, decompile, or redistribute software except as expressly permitted;</li>
        <li>scrape, harvest, or automate access in a manner that burdens our services;</li>
        <li>upload malware or submit false, misleading, or abusive content.</li>
      </ul>

      <h2 style="font-size:16px;letter-spacing:0.06em;text-transform:uppercase;">6. Software Access and Downloads</h2>
      <p>KS_Link is free, as described in Section 14. Software is provided for personal or internal business use under these Terms unless a separate license agreement applies. Pre-release builds may be incomplete, unstable, or change without notice. You download and use software at your own risk. Distribution, sublicensing, or commercial resale of downloads or software is prohibited unless we authorize it in writing. Certain products, including private alpha releases, may be limited to designated accounts or platforms.</p>

      <h2 style="font-size:16px;letter-spacing:0.06em;text-transform:uppercase;">7. Intellectual Property</h2>
      <p>The Site, KANASAKA branding, logos, text, graphics, and software are owned by KANASAKA or its licensors and protected by intellectual property laws. These Terms do not grant you any ownership rights except the limited right to use the Site and permitted downloads or software in accordance with these Terms.</p>

      <h2 style="font-size:16px;letter-spacing:0.06em;text-transform:uppercase;">8. Privacy</h2>
      <p>Our handling of personal data is described in our Privacy Policy. By using the Site, you acknowledge that we process account, security, and usage data as needed to operate the service.</p>

      <h2 style="font-size:16px;letter-spacing:0.06em;text-transform:uppercase;">9. Disclaimers</h2>
      <p>The Site and all software are provided "as is" and "as available" without warranties of any kind, whether express or implied, including merchantability, fitness for a particular purpose, and non-infringement. We do not guarantee uninterrupted, secure, or error-free operation. Market, portfolio, and analysis features in KANASAKA software are provided for informational and tooling purposes only. They do not constitute investment, tax, or legal advice, and they are not a regulated financial service. You are solely responsible for your financial decisions. Software that relies on third-party services does not include those services; we do not operate them and are not responsible for their availability, accuracy, or policies.</p>

      <h2 style="font-size:16px;letter-spacing:0.06em;text-transform:uppercase;">10. Limitation of Liability</h2>
      <p>To the fullest extent permitted by law, KANASAKA and its operators will not be liable for indirect, incidental, special, consequential, or punitive damages, or for loss of profits, data, or goodwill arising from your use of the Site or software. Our total liability for any claim relating to the Site or services will not exceed €100.</p>

      <h2 style="font-size:16px;letter-spacing:0.06em;text-transform:uppercase;">11. Indemnification</h2>
      <p>You agree to indemnify and hold harmless KANASAKA from claims, damages, and expenses (including reasonable legal fees) arising from your misuse of the Site, violation of these Terms, or infringement of third-party rights.</p>

      <h2 style="font-size:16px;letter-spacing:0.06em;text-transform:uppercase;">12. Termination</h2>
      <p>You may stop using the Site at any time. We may suspend or terminate access if you breach these Terms or if required for legal, security, or operational reasons. Upon termination, access to downloads and software that depends on your account may end immediately. Provisions that by nature should survive termination will remain in effect.</p>

      <h2 style="font-size:16px;letter-spacing:0.06em;text-transform:uppercase;">13. Changes to Terms</h2>
      <p>We may update these Terms from time to time. Material changes will be indicated by updating the effective date and, where appropriate, the Terms version. Continued use after changes become effective constitutes acceptance of the revised Terms. If you do not agree to updated Terms, you must stop using the Site.</p>

      <h2 style="font-size:16px;letter-spacing:0.06em;text-transform:uppercase;">14. KS_Link</h2>
      <p>KS_Link is a free, alpha-stage end-to-end encrypted messaging application distributed from this Site. A KS_Link account is a KANASAKA account: you sign in to KS_Link with your KANASAKA credentials, and your account is created, managed, and deleted through your Settings on this Site rather than inside the app. KS_Link operates its own separate messaging infrastructure for everything beyond account identity &mdash; conversations, message delivery, and social features &mdash; which is described for your reference in our Privacy Policy. If you created a KS_Link account before this Site and KS_Link shared accounts, it continues to work with its original sign-in during a transition period and will be offered the option to link to a KANASAKA account.</p>
      <p>KS_Link is pre-release software: it may be incomplete or unstable, may contain security issues not yet discovered, and may change materially &mdash; including in ways that are not backward compatible &mdash; without notice. It is provided "as is" under the disclaimers in Section 9. You must be at least 16 years old to create a KS_Link account.</p>
      <p>KS_Link can keep your conversation history, including images, on your own device in encrypted form, so it is still there when you reopen the app. That copy exists only on that device: it is encrypted with a key held in the device&rsquo;s secure storage, it is never uploaded to us, and it does not transfer to your other devices. You are responsible for your device and its security. We cannot read, recover or restore saved history; it is lost if you delete it, if you turn history off, if the app&rsquo;s data or the device&rsquo;s secure storage is reset, or if the device is lost. You can turn history off, choose how long messages are kept, erase it when you sign out, or delete it at any time in the app&rsquo;s Settings. Images sent in chats are automatically resized and compressed on your device to fit within message size limits.</p>
      <p>KS_Link includes a user-facing reporting mechanism for content or accounts that violate the law or KS_Link's own acceptable-use terms. Reported material and limited associated records may be retained for a period after a report (at least 90 days) to support a review process and to meet legal reporting obligations that may apply to online messaging services, including reporting apparent child sexual abuse material to the relevant authorities where required by law. We may suspend or remove access to KS_Link, or to a specific account, for violations of its acceptable-use terms, for legal compliance, or for security reasons.</p>

      <h2 style="font-size:16px;letter-spacing:0.06em;text-transform:uppercase;">15. Governing Law</h2>
      <p>These Terms are governed by the laws of Germany, excluding conflict-of-law rules. Mandatory consumer protections in your country of residence remain unaffected where applicable.</p>

      <h2 style="font-size:16px;letter-spacing:0.06em;text-transform:uppercase;">16. Contact</h2>
      <p>Questions about these Terms: <a href="mailto:contactns@kanasaka.com">contactns@kanasaka.com</a></p>

      <p style="margin-top:32px;color:#666666;font-size:13px;">You requested a copy of the KANASAKA Terms of Service from kanasaka.com.</p>
    </div>
  `;
}
