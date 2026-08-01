(function () {
  var TOS_KEY = "kanasaka-tos-accepted";
  var TOS_VERSION = "1";
  var SHOW_DELAY_MS = 1000;

  var TERMS_HTML =
    '<section class="tos-section">' +
    "<h3>1. Agreement to Terms</h3>" +
    "<p>By accessing or using the KANASAKA website at kanasaka.com (the \"Site\"), creating an account, or downloading software made available through the Site, you agree to be bound by these Terms of Service (\"Terms\"). If you do not agree, do not use the Site or our services.</p>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>2. Description of Service</h3>" +
    "<p>KANASAKA provides an informational website, user accounts, authenticated access to product downloads (including KS Unify), support and contact channels, and related online services. Features may change, be limited, or be withdrawn during active development.</p>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>3. Eligibility</h3>" +
    "<p>You must be at least 16 years old and able to form a binding contract under applicable law. By using the Site, you represent that you meet these requirements.</p>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>4. Accounts and Security</h3>" +
    "<p>You are responsible for maintaining the confidentiality of your login credentials and for all activity under your account. You must provide accurate registration information, keep it up to date, and notify us promptly of unauthorized access. We may suspend or terminate accounts that violate these Terms or pose a security risk.</p>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>5. Acceptable Use</h3>" +
    "<p>You agree not to:</p>" +
    "<ul>" +
    "<li>use the Site or downloads for unlawful, harmful, or fraudulent purposes;</li>" +
    "<li>attempt to gain unauthorized access to systems, accounts, or data;</li>" +
    "<li>interfere with or disrupt the Site, its infrastructure, or other users;</li>" +
    "<li>reverse engineer, decompile, or redistribute software except as expressly permitted;</li>" +
    "<li>scrape, harvest, or automate access in a manner that burdens our services;</li>" +
    "<li>upload malware or submit false, misleading, or abusive content.</li>" +
    "</ul>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>6. Software Downloads</h3>" +
    "<p>Software such as KS Unify is provided for personal or internal business use under these Terms unless a separate license agreement applies. Pre-release builds may be incomplete, unstable, or change without notice. You download and use software at your own risk. Distribution, sublicensing, or commercial resale of downloads is prohibited unless we authorize it in writing.</p>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>7. Intellectual Property</h3>" +
    "<p>The Site, KANASAKA branding, logos, text, graphics, and software are owned by KANASAKA or its licensors and protected by intellectual property laws. These Terms do not grant you any ownership rights except the limited right to use the Site and permitted downloads in accordance with these Terms.</p>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>8. Privacy</h3>" +
    "<p>Our handling of personal data is described in our Privacy Policy. By using the Site, you acknowledge that we process account, security, and usage data as needed to operate the service.</p>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>9. Disclaimers</h3>" +
    "<p>The Site and all software are provided \"as is\" and \"as available\" without warranties of any kind, whether express or implied, including merchantability, fitness for a particular purpose, and non-infringement. We do not guarantee uninterrupted, secure, or error-free operation.</p>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>10. Limitation of Liability</h3>" +
    "<p>To the fullest extent permitted by law, KANASAKA and its operators will not be liable for indirect, incidental, special, consequential, or punitive damages, or for loss of profits, data, or goodwill arising from your use of the Site or downloaded software. Our total liability for any claim relating to the Site or services will not exceed the greater of €100 or the amount you paid us (if any) in the twelve months before the claim.</p>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>11. Indemnification</h3>" +
    "<p>You agree to indemnify and hold harmless KANASAKA from claims, damages, and expenses (including reasonable legal fees) arising from your misuse of the Site, violation of these Terms, or infringement of third-party rights.</p>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>12. Termination</h3>" +
    "<p>You may stop using the Site at any time. We may suspend or terminate access if you breach these Terms or if required for legal, security, or operational reasons. Provisions that by nature should survive termination will remain in effect.</p>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>13. Changes to Terms</h3>" +
    "<p>We may update these Terms from time to time. Material changes will be indicated by updating the effective date below. Continued use after changes become effective constitutes acceptance of the revised Terms.</p>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>14. Governing Law</h3>" +
    "<p>These Terms are governed by the laws of Germany, excluding conflict-of-law rules. Mandatory consumer protections in your country of residence remain unaffected where applicable.</p>" +
    "</section>" +
    '<section class="tos-section">' +
    "<h3>15. Contact</h3>" +
    "<p>Questions about these Terms: <a href=\"mailto:contactns@kanasaka.com\">contactns@kanasaka.com</a></p>" +
    "<p class=\"tos-effective\">Effective date: 1 August 2026</p>" +
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
      '<div class="tos-dialog-actions">' +
      '<a href="/legal/terms/" class="button secondary" target="_blank" rel="noopener">View Full Terms</a>' +
      '<button type="button" class="button" id="tos-accept-button" disabled>Accept &amp; Continue</button>' +
      "</div>" +
      "</div>" +
      "</div>";

    document.body.appendChild(overlay);
    return overlay;
  }

  function showModal() {
    if (visible || isAccepted()) {
      return;
    }

    var overlay = document.getElementById("tos-overlay") || buildModal();
    var checkbox = overlay.querySelector("#tos-accept-checkbox");
    var acceptButton = overlay.querySelector("#tos-accept-button");

    function syncAcceptState() {
      acceptButton.disabled = !checkbox.checked;
    }

    checkbox.addEventListener("change", syncAcceptState);

    acceptButton.addEventListener("click", function () {
      if (!checkbox.checked) {
        return;
      }

      try {
        localStorage.setItem(TOS_KEY, TOS_VERSION);
      } catch (err) {
        /* continue even if storage is blocked */
      }

      overlay.classList.remove("is-visible");
      overlay.hidden = true;
      document.body.classList.remove("tos-open");
      visible = false;
    });

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
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
