(function () {
  var TOS_KEY = "kanasaka-tos-accepted";
  var TOS_VERSION = "2";
  var SHOW_DELAY_MS = 1000;

  var TERMS_HTML =
    '<section class="tos-section">' +
    "<h3>1. Agreement to Terms</h3>" +
    "<p>By accessing or using the KANASAKA website at kanasaka.com (the \"Site\"), creating an account, purchasing a subscription, or using software or downloads made available through the Site, you agree to be bound by these Terms of Service (\"Terms\"). If you do not agree, do not use the Site or our services.</p>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>2. Description of Service</h3>" +
    "<p>KANASAKA provides an informational website, user accounts, subscription billing for KS_Package, authenticated access to entitled product downloads (including KS Unify), desktop software access (including KS Stocks where entitled), support and contact channels, and related online services. Features, pricing, and product availability may change, be limited, or be withdrawn during active development.</p>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>3. Eligibility</h3>" +
    "<p>You must be at least 16 years old and able to form a binding contract under applicable law. By using the Site or purchasing a subscription, you represent that you meet these requirements. If you purchase on behalf of an organization, you represent that you have authority to bind that organization.</p>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>4. Accounts and Security</h3>" +
    "<p>You are responsible for maintaining the confidentiality of your login credentials and for all activity under your account. You must provide accurate registration information, keep it up to date, and notify us promptly of unauthorized access. Your KANASAKA account ID is used to identify your account for permissions, billing, and software entitlement. Entitlements are tied to your account, not to a specific device. We may suspend or terminate accounts that violate these Terms or pose a security risk.</p>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>5. Acceptable Use</h3>" +
    "<p>You agree not to:</p>" +
    "<ul>" +
    "<li>use the Site, subscriptions, or downloads for unlawful, harmful, or fraudulent purposes;</li>" +
    "<li>attempt to gain unauthorized access to systems, accounts, paywalled content, or data;</li>" +
    "<li>share, resell, or pool subscription access in a manner that circumvents account-based entitlement;</li>" +
    "<li>interfere with or disrupt the Site, its infrastructure, billing systems, or other users;</li>" +
    "<li>reverse engineer, decompile, or redistribute software except as expressly permitted;</li>" +
    "<li>scrape, harvest, or automate access in a manner that burdens our services;</li>" +
    "<li>upload malware or submit false, misleading, or abusive content.</li>" +
    "</ul>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>6. Subscriptions and Billing (KS_Package)</h3>" +
    "<p><strong>6.1 Product.</strong> KS_Package is a recurring subscription that grants entitlement to KANASAKA software and downloads made available under these Terms while the subscription is active, including KS Stocks desktop access and authenticated product downloads such as KS Unify, unless a specific product page states additional restrictions.</p>" +
    "<p><strong>6.2 Pricing.</strong> Current list prices are €10.00 per month or €100.00 per year. The price shown at checkout is the price that applies to your purchase. We may change prices for future billing periods with reasonable notice where required by law.</p>" +
    "<p><strong>6.3 Payment processing.</strong> Payments are processed by Stripe. By subscribing, you also agree to Stripe's applicable terms and privacy practices for payment processing. We do not store full payment card numbers on our servers.</p>" +
    "<p><strong>6.4 Account-based entitlement.</strong> Your subscription is linked to your KANASAKA account and account ID. Entitlement applies when you sign in with that account on supported applications and the Site. It is not transferable and does not constitute a device license.</p>" +
    "<p><strong>6.5 Renewal and cancellation.</strong> Subscriptions renew automatically for the selected billing period until you cancel through the billing portal in Account Settings or as otherwise made available. You may cancel at any time. After cancellation, access generally continues until the end of the current paid billing period, unless otherwise stated at checkout or required by law.</p>" +
    "<p><strong>6.6 Failed payments.</strong> If a renewal payment fails, we may suspend or end entitlement until payment is successfully processed.</p>" +
    "<p><strong>6.7 Refunds.</strong> Except where mandatory consumer law requires otherwise, subscription fees are non-refundable, including for partial billing periods or unused time.</p>" +
    "<p><strong>6.8 EU withdrawal right.</strong> If you are a consumer in the European Union, you may have a statutory right to withdraw from a distance contract within 14 days. If you request immediate access to digital content or services and expressly consent to begin performance before the withdrawal period ends, you acknowledge that you may lose your right of withdrawal once delivery has begun, to the extent permitted by law.</p>" +
    "<p><strong>6.9 Authorized complimentary access.</strong> We may grant selected authorized accounts complimentary access to some or all entitled services without a paid subscription. Such access may be modified or revoked at any time.</p>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>7. Software Access and Downloads</h3>" +
    "<p>Access to product downloads and entitled desktop software requires a valid KS_Package subscription or authorized complimentary access, except where a product page explicitly states different requirements. Software such as KS Unify and KS Stocks is provided for personal or internal business use under these Terms unless a separate license agreement applies. Pre-release builds may be incomplete, unstable, or change without notice. You download and use software at your own risk. Distribution, sublicensing, or commercial resale of downloads or software is prohibited unless we authorize it in writing. Certain products, including private alpha releases, may be limited to designated accounts or platforms.</p>" +
    "<p><strong>KS Stocks third-party accounts.</strong> KS Stocks does not include Alpaca or Ollama accounts. You must create and maintain your own Alpaca brokerage account and Ollama access (cloud API key or local instance) to use core app features. You are responsible for those third-party accounts, their fees, and compliance with their terms.</p>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>8. Intellectual Property</h3>" +
    "<p>The Site, KANASAKA branding, logos, text, graphics, and software are owned by KANASAKA or its licensors and protected by intellectual property laws. These Terms do not grant you any ownership rights except the limited right to use the Site, your subscription entitlements, and permitted downloads or software in accordance with these Terms.</p>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>9. Privacy</h3>" +
    "<p>Our handling of personal data is described in our Privacy Policy. By using the Site or subscribing, you acknowledge that we process account, security, billing, and usage data as needed to operate the service, and that payment data is handled by our payment processor.</p>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>10. Disclaimers</h3>" +
    "<p>The Site, subscriptions, and all software are provided \"as is\" and \"as available\" without warranties of any kind, whether express or implied, including merchantability, fitness for a particular purpose, and non-infringement. We do not guarantee uninterrupted, secure, or error-free operation. KS Stocks and related market or portfolio features are provided for informational and tooling purposes only. They do not constitute investment, tax, or legal advice, and they are not a regulated financial service. You are solely responsible for your financial decisions. KS Stocks relies on third-party services including Alpaca and Ollama; we do not operate those services and are not responsible for their availability, accuracy, or policies.</p>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>11. Limitation of Liability</h3>" +
    "<p>To the fullest extent permitted by law, KANASAKA and its operators will not be liable for indirect, incidental, special, consequential, or punitive damages, or for loss of profits, data, or goodwill arising from your use of the Site, subscriptions, or software. Our total liability for any claim relating to the Site or services will not exceed the greater of €100 or the amount you paid us (if any) in the twelve months before the claim.</p>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>12. Indemnification</h3>" +
    "<p>You agree to indemnify and hold harmless KANASAKA from claims, damages, and expenses (including reasonable legal fees) arising from your misuse of the Site, violation of these Terms, or infringement of third-party rights.</p>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>13. Termination</h3>" +
    "<p>You may stop using the Site at any time. If you delete your KANASAKA account, you remain responsible for canceling any active subscription through the billing portal so that renewals do not continue. We may suspend or terminate access if you breach these Terms or if required for legal, security, or operational reasons. Upon termination or expiry of entitlement, access to downloads and entitled software may end immediately or at the end of the current billing period, as applicable. Provisions that by nature should survive termination will remain in effect.</p>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>14. Changes to Terms</h3>" +
    "<p>We may update these Terms from time to time. Material changes will be indicated by updating the effective date and, where appropriate, the Terms version. Continued use after changes become effective constitutes acceptance of the revised Terms. If you do not agree to updated Terms, you must stop using the Site and cancel any active subscription.</p>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>15. Governing Law</h3>" +
    "<p>These Terms are governed by the laws of Germany, excluding conflict-of-law rules. Mandatory consumer protections in your country of residence remain unaffected where applicable.</p>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>16. Contact</h3>" +
    "<p>Questions about these Terms: <a href=\"mailto:contactns@kanasaka.com\">contactns@kanasaka.com</a></p>" +
    "<p class=\"tos-effective\">Effective date: 21 August 2026</p>" +
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
