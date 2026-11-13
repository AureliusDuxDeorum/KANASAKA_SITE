(function () {
  var TOS_KEY = "kanasaka-tos-accepted";
  var TOS_VERSION = "6";
  var SHOW_DELAY_MS = 1000;

  var TERMS_HTML =
    '<section class="tos-section">' +
    "<h3>1. Agreement to Terms</h3>" +
    "<p>By accessing or using the KANASAKA website at kanasaka.com (the \"Site\"), creating an account, or using software or downloads made available through the Site, you agree to be bound by these Terms of Service (\"Terms\"). If you do not agree, do not use the Site or our services.</p>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>2. Description of Service</h3>" +
    "<p>KANASAKA provides an informational website, user accounts, downloads of KANASAKA software, a free public download of KS_Link (a separate messaging service described in Section 14), support and contact channels, and related online services. Features and product availability may change, be limited, or be withdrawn during active development.</p>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>3. Eligibility</h3>" +
    "<p>You must be at least 16 years old and able to form a binding contract under applicable law. By using the Site, you represent that you meet these requirements. If you use the Site on behalf of an organization, you represent that you have authority to bind that organization.</p>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>4. Accounts and Security</h3>" +
    "<p>You are responsible for maintaining the confidentiality of your login credentials and for all activity under your account. You must provide accurate registration information, keep it up to date, and notify us promptly of unauthorized access. Your KANASAKA account ID is used to identify your account for permissions and software access. Access is tied to your account, not to a specific device. We may suspend or terminate accounts that violate these Terms or pose a security risk.</p>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>5. Acceptable Use</h3>" +
    "<p>You agree not to:</p>" +
    "<ul>" +
    "<li>use the Site or downloads for unlawful, harmful, or fraudulent purposes;</li>" +
    "<li>attempt to gain unauthorized access to systems, accounts, restricted content, or data;</li>" +
    "<li>interfere with or disrupt the Site, its infrastructure, or other users;</li>" +
    "<li>reverse engineer, decompile, or redistribute software except as expressly permitted;</li>" +
    "<li>scrape, harvest, or automate access in a manner that burdens our services;</li>" +
    "<li>upload malware or submit false, misleading, or abusive content.</li>" +
    "</ul>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>6. Software Access and Downloads</h3>" +
    "<p>KS_Link is free, as described in Section 14. Software is provided for personal or internal business use under these Terms unless a separate license agreement applies. Pre-release builds may be incomplete, unstable, or change without notice. You download and use software at your own risk. Distribution, sublicensing, or commercial resale of downloads or software is prohibited unless we authorize it in writing. Certain products, including private alpha releases, may be limited to designated accounts or platforms.</p>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>7. Intellectual Property</h3>" +
    "<p>The Site, KANASAKA branding, logos, text, graphics, and software are owned by KANASAKA or its licensors and protected by intellectual property laws. These Terms do not grant you any ownership rights except the limited right to use the Site and permitted downloads or software in accordance with these Terms.</p>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>8. Privacy</h3>" +
    "<p>Our handling of personal data is described in our Privacy Policy. By using the Site, you acknowledge that we process account, security, and usage data as needed to operate the service.</p>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>9. Disclaimers</h3>" +
    "<p>The Site and all software are provided \"as is\" and \"as available\" without warranties of any kind, whether express or implied, including merchantability, fitness for a particular purpose, and non-infringement. We do not guarantee uninterrupted, secure, or error-free operation. Market, portfolio, and analysis features in KANASAKA software are provided for informational and tooling purposes only. They do not constitute investment, tax, or legal advice, and they are not a regulated financial service. You are solely responsible for your financial decisions. Software that relies on third-party services does not include those services; we do not operate them and are not responsible for their availability, accuracy, or policies.</p>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>10. Limitation of Liability</h3>" +
    "<p>To the fullest extent permitted by law, KANASAKA and its operators will not be liable for indirect, incidental, special, consequential, or punitive damages, or for loss of profits, data, or goodwill arising from your use of the Site or software. Our total liability for any claim relating to the Site or services will not exceed €100.</p>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>11. Indemnification</h3>" +
    "<p>You agree to indemnify and hold harmless KANASAKA from claims, damages, and expenses (including reasonable legal fees) arising from your misuse of the Site, violation of these Terms, or infringement of third-party rights.</p>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>12. Termination</h3>" +
    "<p>You may stop using the Site at any time. We may suspend or terminate access if you breach these Terms or if required for legal, security, or operational reasons. Upon termination, access to downloads and software that depends on your account may end immediately. Provisions that by nature should survive termination will remain in effect.</p>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>13. Changes to Terms</h3>" +
    "<p>We may update these Terms from time to time. Material changes will be indicated by updating the effective date and, where appropriate, the Terms version. Continued use after changes become effective constitutes acceptance of the revised Terms. If you do not agree to updated Terms, you must stop using the Site.</p>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>14. KS_Link</h3>" +
    "<p>KS_Link is a free, alpha-stage end-to-end encrypted messaging application distributed from this Site. A KS_Link account is a KANASAKA account: you sign in to KS_Link with your KANASAKA credentials, and you can create that account and sign in either on this Site or inside the KS_Link app, and when you do it in the app your credentials are sent to this Site, not to KS_Link&rsquo;s own servers. Your password, two-factor sign-in and other account settings are managed through your Settings on this Site. Deleting your KANASAKA account also erases your KS_Link account and the data KS_Link holds for it (other than limited records we are required or permitted to keep, described in our Privacy Policy). Changing your password or turning off two-factor sign-in on this Site also ends your KS_Link sign-ins. KS_Link operates its own separate messaging infrastructure for everything beyond account identity &mdash; conversations, message delivery, and social features &mdash; which is described for your reference in our Privacy Policy. A KS_Link account created before KANASAKA sign-in was built into the app no longer has a separate password: it is matched to a KANASAKA account by the verified email address the first time you sign in with that KANASAKA account, and an old account that is not claimed within a period we announce may be deleted.</p>" +
    "<p>KS_Link is pre-release software: it may be incomplete or unstable, may contain security issues not yet discovered, and may change materially — including in ways that are not backward compatible — without notice. It is provided \"as is\" under the disclaimers in Section 9. You must be at least 16 years old to create a KS_Link account.</p>" +
    "<p>KS_Link can keep your conversation history, including images, on your own device in encrypted form, so it is still there when you reopen the app. That copy exists only on that device: it is encrypted with a key held in the device&rsquo;s secure storage, it is never uploaded to us, and it does not transfer to your other devices. You are responsible for your device and its security. We cannot read, recover or restore saved history; it is lost if you delete it, if you turn history off, if the app&rsquo;s data or the device&rsquo;s secure storage is reset, or if the device is lost. You can turn history off, choose how long messages are kept, erase it when you sign out, or delete it at any time in the app&rsquo;s Settings. Images sent in chats are automatically resized and compressed on your device to fit within message size limits.</p>" +
    "<p>KS_Link includes a user-facing reporting mechanism for content or accounts that violate the law or KS_Link's own acceptable-use terms. Reported material and limited associated records may be retained for a period after a report (at least 90 days) to support a review process and to meet legal reporting obligations that may apply to online messaging services, including reporting apparent child sexual abuse material to the relevant authorities where required by law. We may suspend or remove access to KS_Link, or to a specific account, for violations of its acceptable-use terms, for legal compliance, or for security reasons.</p>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>15. Governing Law</h3>" +
    "<p>These Terms are governed by the laws of Germany, excluding conflict-of-law rules. Mandatory consumer protections in your country of residence remain unaffected where applicable.</p>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>16. Contact</h3>" +
    "<p>Questions about these Terms: <a href=\"mailto:contactns@kanasaka.com\">contactns@kanasaka.com</a></p>" +
    "<p class=\"tos-effective\">Effective date: 13 November 2026</p>" +
    "</section>";

  var scheduled = false;
  var visible = false;

  function isAccepted() {
    try {
      return localStorage.getItem(TOS_KEY) === TOS_VERSION;
    } catch (err) {
      return false;
    }
  }

  function isHomePage() {
    var path = window.location.pathname;
    return path === "/" || path === "/index.html";
  }

  function buildModal() {
    var overlay = document.createElement("div");
    overlay.id = "tos-overlay";
    overlay.className = "tos-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "tos-title");
    overlay.hidden = true;

    overlay.innerHTML =
      '<div class="tos-dialog">' +
      '<div class="tos-dialog-header">' +
      '<span class="coming-soon-label">Legal</span>' +
      '<h2 id="tos-title">Terms of Service</h2>' +
      "<p>Please review and accept our Terms of Service to continue using KANASAKA.</p>" +
      "</div>" +
      '<div class="tos-dialog-body" tabindex="0">' +
      TERMS_HTML +
      "</div>" +
      '<div class="tos-dialog-footer">' +
      '<label class="tos-accept-label">' +
      '<input type="checkbox" id="tos-accept-checkbox">' +
      "<span>I have read and agree to the Terms of Service</span>" +
      "</label>" +
      '<p class="tos-legal-links"><a href="/legal/terms/" target="_blank" rel="noopener">Terms of Service</a> · <a href="/legal/privacy/" target="_blank" rel="noopener">Privacy Policy</a></p>' +
      '<div class="tos-dialog-actions">' +
      '<div class="tos-email-panel" id="tos-email-panel" hidden>' +
      '<label class="tos-email-label" for="tos-email-input">Email address</label>' +
      '<div class="tos-email-row">' +
      '<input type="email" id="tos-email-input" class="tos-email-input" placeholder="you@example.com" autocomplete="email">' +
      '<button type="button" class="button secondary" id="tos-email-send">Send</button>' +
      "</div>" +
      '<p class="tos-email-status" id="tos-email-status" hidden></p>' +
      "</div>" +
      '<div class="tos-dialog-actions-row">' +
      '<button type="button" class="button secondary" id="tos-receive-button">Receive Full Terms</button>' +
      '<button type="button" class="button" id="tos-accept-button" disabled>Accept &amp; Continue</button>' +
      "</div>" +
      "</div>" +
      "</div>" +
      "</div>";

    document.body.appendChild(overlay);
    return overlay;
  }

  function bindModalActions(overlay) {
    var checkbox = overlay.querySelector("#tos-accept-checkbox");
    var acceptButton = overlay.querySelector("#tos-accept-button");
    var receiveButton = overlay.querySelector("#tos-receive-button");
    var emailPanel = overlay.querySelector("#tos-email-panel");
    var emailInput = overlay.querySelector("#tos-email-input");
    var emailSend = overlay.querySelector("#tos-email-send");
    var emailStatus = overlay.querySelector("#tos-email-status");

    function syncAcceptState() {
      acceptButton.disabled = !checkbox.checked;
    }

    function showEmailStatus(message, isError) {
      emailStatus.textContent = message;
      emailStatus.hidden = false;
      emailStatus.classList.toggle("is-error", Boolean(isError));
    }

    checkbox.addEventListener("change", syncAcceptState);

    receiveButton.addEventListener("click", function () {
      emailPanel.hidden = !emailPanel.hidden;
      receiveButton.setAttribute(
        "aria-expanded",
        emailPanel.hidden ? "false" : "true"
      );
      if (!emailPanel.hidden) {
        emailInput.focus();
      }
    });

    emailSend.addEventListener("click", async function () {
      var email = emailInput.value.trim();
      emailStatus.hidden = true;

      if (!email) {
        showEmailStatus("Enter an email address.", true);
        return;
      }

      emailSend.disabled = true;
      emailSend.textContent = "Sending...";

      try {
        var response = await fetch("/api/terms/send", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email }),
        });
        var data = await response.json();

        if (!response.ok) {
          throw new Error((data && data.error) || "Could not send email.");
        }

        showEmailStatus(
          (data && data.message) ||
            "If the address is valid, the full Terms of Service will arrive shortly.",
          false
        );
        emailInput.value = "";
      } catch (error) {
        showEmailStatus(error.message || "Could not send email.", true);
      } finally {
        emailSend.disabled = false;
        emailSend.textContent = "Send";
      }
    });

    acceptButton.addEventListener("click", function () {
      if (!checkbox.checked) {
        return;
      }

      try {
        localStorage.setItem(TOS_KEY, TOS_VERSION);
      } catch (err) {
        /* continue even if storage is blocked */
      }

      if (
        window.KanasakaAuth &&
        window.KanasakaAuth.getSession &&
        window.KanasakaAuth.getSession().authenticated
      ) {
        fetch("/api/tos/accept", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tosVersion: TOS_VERSION }),
        }).catch(function () {
          /* best effort */
        });
      }

      overlay.classList.remove("is-visible");
      overlay.hidden = true;
      document.body.classList.remove("tos-open");
      visible = false;
    });
  }

  function showModal() {
    if (visible || isAccepted()) {
      return;
    }

    var overlay = document.getElementById("tos-overlay") || buildModal();

    if (!overlay.dataset.bound) {
      bindModalActions(overlay);
      overlay.dataset.bound = "1";
    }

    overlay.hidden = false;
    window.requestAnimationFrame(function () {
      overlay.classList.add("is-visible");
      document.body.classList.add("tos-open");
      visible = true;
      overlay.querySelector(".tos-dialog-body").focus();
    });
  }

  function scheduleShow() {
    if (scheduled || isAccepted()) {
      return;
    }

    scheduled = true;
    window.setTimeout(showModal, SHOW_DELAY_MS);
  }

  function init() {
    if (isAccepted()) {
      return;
    }

    if (isHomePage()) {
      window.addEventListener("kanasaka:hero-ready", scheduleShow, { once: true });
      return;
    }

    scheduleShow();
  }

  window.KanasakaTerms = {
    init: init,
    isAccepted: isAccepted,
    TERMS_HTML: TERMS_HTML,
    TOS_VERSION: TOS_VERSION,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
