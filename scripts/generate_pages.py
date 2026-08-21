#!/usr/bin/env python3
"""Generate KANASAKA site skeleton pages."""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

COMING_SOON_PAGES = [
    ("products/robotics", "Robotics"),
    ("research/artificial-intelligence", "Artificial Intelligence"),
    ("research/robotics", "Robotics"),
    ("research/publications", "Publications"),
    ("research/future-projects", "Future Projects"),
    ("company/about", "About KANASAKA"),
    ("company/vision", "Vision"),
    ("company/leadership", "Leadership"),
    ("company/news", "News"),
    ("company/careers", "Careers"),
    ("support/documentation", "Documentation"),
    ("support/faq", "FAQ"),
    ("support/system-status", "System Status"),
    ("developers/api", "API"),
    ("developers/sdk", "SDK"),
    ("developers/github", "GitHub"),
    ("developers/documentation", "Documentation"),
    ("media/press-kit", "Press Kit"),
    ("media/brand-assets", "Brand Assets"),
    ("media/gallery", "Gallery"),
    ("media/videos", "Videos"),
    ("legal/licenses", "Licenses"),
    ("legal/security", "Security"),
]


def auth_page_open(settings: bool = False) -> str:
    page_class = "auth-page settings-page" if settings else "auth-page"
    return f"""
  <section class="{page_class}">
    <div class="auth-page-backdrop" aria-hidden="true"></div>
"""


def auth_page_close() -> str:
    return """
  </section>
"""


def auth_card_open(elevated: bool = True) -> str:
    classes = "auth-card auth-card--modern"
    if elevated:
        classes += " auth-card-elevated"
    return f"""    <div class="{classes}">
      <div class="auth-card-accent" aria-hidden="true"></div>
      <div class="auth-card-body">
"""


def auth_card_close() -> str:
    return """      </div>
    </div>
"""


def shell(title: str, body: str) -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title} | KANASAKA</title>
  <meta name="theme-color" content="#000000">
  <link rel="manifest" href="/site.webmanifest">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="shortcut icon" href="/favicon.ico">
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/icons/favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="/assets/icons/favicon-16x16.png">
  <link rel="icon" type="image/png" sizes="192x192" href="/assets/icons/icon-192.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/assets/icons/apple-touch-icon.png">
  <link rel="preload" href="/assets/fonts/Tektur-SemiBold.ttf" as="font" type="font/ttf" crossorigin>
  <link rel="stylesheet" href="/assets/css/style.css?v=64">
  <link rel="stylesheet" href="/assets/css/redesign.css?v=64">
  <script defer src="/assets/js/password-policy.js"></script>
  <script defer src="/assets/js/auth.js"></script>
  <script defer src="/assets/js/main.js"></script>
</head>
<body>

<div id="site-header"></div>

<main>
{body}
</main>

<div id="site-footer"></div>

</body>
</html>
"""


def coming_soon(title: str) -> str:
    body = f"""
  <section class="coming-soon">
    <div class="coming-soon-box">
      <span class="coming-soon-label">Coming Soon</span>
      <h1>{title}</h1>
      <p>This section is under development. Check back for updates.</p>
      <a href="/" class="button secondary coming-soon-back">Back to Home</a>
    </div>
  </section>
"""
    return shell(title, body)


def home_page() -> str:
    body = """
  <section class="hero">
    <div class="kanasaka-logo kanasaka-logo--hero">
      <svg class="kanasaka-logo-svg" viewBox="0 0 480 110" role="img" aria-label="Kanasaka">
        <title>Kanasaka</title>
        <defs>
          <linearGradient id="logo-band-gradient" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#ffffff" stop-opacity="0"></stop>
            <stop offset="30%" stop-color="#ffffff" stop-opacity="0.35"></stop>
            <stop offset="50%" stop-color="#ffffff" stop-opacity="1"></stop>
            <stop offset="70%" stop-color="#ffffff" stop-opacity="0.35"></stop>
            <stop offset="100%" stop-color="#ffffff" stop-opacity="0"></stop>
          </linearGradient>
          <mask id="logo-band-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="480" height="110">
            <rect x="0" y="0" width="480" height="110" fill="black"></rect>
            <rect class="logo-shimmer-band" x="-140" y="0" width="220" height="110" fill="url(#logo-band-gradient)"></rect>
          </mask>
        </defs>
        <g class="logo-base">
          <g class="logo-side logo-side-left">
            <path class="logo-line" d="M 80 40 H 108 L 120 52 H 188"></path>
            <text class="logo-tag" x="76" y="44" text-anchor="end">Software</text>
            <path class="logo-line" d="M 80 70 H 108 L 120 58 H 188"></path>
            <text class="logo-tag" x="76" y="74" text-anchor="end">AI</text>
          </g>
          <g class="logo-letters">
            <text class="logo-letter logo-letter-k" x="240" y="46" text-anchor="middle" font-family="Tektur, sans-serif" font-size="50" font-weight="600">K</text>
            <text class="logo-letter logo-letter-s" x="240" y="100" text-anchor="middle" font-family="Tektur, sans-serif" font-size="50" font-weight="600">S</text>
          </g>
          <g class="logo-side logo-side-right">
            <path class="logo-line" d="M 400 40 H 372 L 360 52 H 292"></path>
            <text class="logo-tag" x="404" y="44" text-anchor="start">Robotics</text>
            <path class="logo-line" d="M 400 70 H 372 L 360 58 H 292"></path>
            <text class="logo-tag" x="404" y="74" text-anchor="start">Biotech</text>
          </g>
        </g>
        <g class="logo-shimmer-highlight" mask="url(#logo-band-mask)" aria-hidden="true">
          <g class="logo-side logo-side-left">
            <path class="logo-line" d="M 80 40 H 108 L 120 52 H 188"></path>
            <text class="logo-tag" x="76" y="44" text-anchor="end">Software</text>
            <path class="logo-line" d="M 80 70 H 108 L 120 58 H 188"></path>
            <text class="logo-tag" x="76" y="74" text-anchor="end">AI</text>
          </g>
          <g class="logo-letters">
            <text class="logo-letter logo-letter-k" x="240" y="46" text-anchor="middle" font-family="Tektur, sans-serif" font-size="50" font-weight="600">K</text>
            <text class="logo-letter logo-letter-s" x="240" y="100" text-anchor="middle" font-family="Tektur, sans-serif" font-size="50" font-weight="600">S</text>
          </g>
          <g class="logo-side logo-side-right">
            <path class="logo-line" d="M 400 40 H 372 L 360 52 H 292"></path>
            <text class="logo-tag" x="404" y="44" text-anchor="start">Robotics</text>
            <path class="logo-line" d="M 400 70 H 372 L 360 58 H 292"></path>
            <text class="logo-tag" x="404" y="74" text-anchor="start">Biotech</text>
          </g>
        </g>
      </svg>
    </div>

    <h1 class="visually-hidden">KANASAKA</h1>

    <p class="hero-lead">Software · AI · Robotics · Biotech</p>
  </section>

  <section class="page-section">
    <h2>Products</h2>

    <div class="product-grid">
      <article class="product-card featured-card">
        <div class="product-info">
          <span class="section-kicker">Desktop</span>
          <h3>KS Unify</h3>

          <p>
            A local AI control layer for provider management,
            routing, streaming, history, LAN access,
            and API integration.
          </p>

          <div class="meta">
            <span>Desktop App</span>
            <span>Local API</span>
            <span>Active Development</span>
          </div>
        </div>

        <div class="actions">
          <a href="/products/ks-unify/" class="button">Learn More</a>
          <a href="/downloads/#ks-unify" class="button secondary">Downloads</a>
        </div>
      </article>

      <article class="product-card featured-card">
        <div class="product-info">
          <span class="section-kicker">Desktop</span>
          <h3>KS Stocks</h3>

          <p>
            Market analytics and portfolio tooling for KANASAKA accounts.
            Subscribe with KS_Package for full access.
          </p>

          <div class="meta">
            <span>Desktop App</span>
            <span>€10 / month</span>
            <span>€100 / year</span>
          </div>
        </div>

        <div class="actions">
          <a href="/products/ks-stocks/" class="button">Learn More</a>
          <a href="/account/settings/?section=billing" class="button secondary">Subscribe</a>
        </div>
      </article>

      <article class="product-card featured-card" data-visible-account-id="ks_dev" hidden>
        <div class="product-info">
          <span class="section-kicker">Mobile</span>
          <h3>KS-K Mobile</h3>

          <p>
            Mobile companion for KANASAKA systems — remote monitoring,
            quick controls, and secure sync with your KS stack.
          </p>

          <div class="meta">
            <span>iOS</span>
            <span>Android</span>
            <span>Private Alpha</span>
          </div>
        </div>

        <div class="actions">
          <a href="/products/ks-k-mobile/" class="button">Learn More</a>
          <a href="/downloads/#ks-k-mobile" class="button secondary">Downloads</a>
        </div>
      </article>
    </div>
  </section>
"""
    return shell("Home", body).replace("<title>Home | KANASAKA</title>", "<title>KANASAKA</title>")


def ks_unify_page() -> str:
    body = """
  <section class="hero compact">
    <div class="kanasaka-logo small">
      <div class="logo-side"><div></div><div></div></div>
      <div class="logo-center"><span>K</span><span>S</span></div>
      <div class="logo-side"><div></div><div></div></div>
    </div>

    <h1>KS Unify</h1>

    <p>
      A unified local AI control layer for provider management,
      routing, streaming, history, LAN access, and API integration.
    </p>
  </section>

  <section class="page-section">
    <article class="content-card featured-card">
      <div class="product-info">
        <span class="section-kicker">Desktop Application</span>
        <h2>Unified AI Control Layer</h2>

        <p>
          KS Unify is a Tauri desktop application that gives you a single
          interface to manage AI providers, route requests, stream responses,
          and maintain local history — all running on your machine with
          optional LAN access and API integration.
        </p>

        <div class="meta">
          <span>Version 0.1.0</span>
          <span>Windows</span>
          <span>macOS</span>
          <span>Linux</span>
          <span>Active Development</span>
        </div>
      </div>

      <div class="actions">
        <a href="/downloads/" class="button">Download</a>
        <a href="/support/documentation/" class="button secondary">Documentation</a>
      </div>
    </article>
  </section>

  <section class="page-section">
    <h2>Capabilities</h2>

    <div class="feature-grid">
      <article>
        <h3>Provider Management</h3>
        <p>Configure and switch between AI providers from one control layer.</p>
      </article>
      <article>
        <h3>Routing &amp; Streaming</h3>
        <p>Route requests intelligently with real-time streamed responses.</p>
      </article>
      <article>
        <h3>Local History</h3>
        <p>Keep conversation and session history stored locally on your device.</p>
      </article>
      <article>
        <h3>LAN Access</h3>
        <p>Expose capabilities across your local network when needed.</p>
      </article>
      <article>
        <h3>API Integration</h3>
        <p>Connect external tools and workflows through a local API surface.</p>
      </article>
      <article>
        <h3>Local-First</h3>
        <p>Built for privacy and control — your infrastructure, your rules.</p>
      </article>
    </div>
  </section>
"""
    return shell("KS Unify", body)


def downloads_page() -> str:
    body = """
  <section class="hero compact">
    <div class="kanasaka-logo small">
      <div class="logo-side"><div></div><div></div></div>
      <div class="logo-center"><span>K</span><span>S</span></div>
      <div class="logo-side"><div></div><div></div></div>
    </div>

    <h1>Downloads</h1>

    <p>Sign in to download the latest KANASAKA product builds.</p>
  </section>

  <section class="page-section">
    <div class="download-stack">
      <article id="ks-unify" class="download-card featured-download download-card-wide">
        <div class="download-info">
          <span class="download-kicker">KS Unify</span>

          <h2>Unified AI Control Layer</h2>

          <p>
            Desktop application for managing AI providers, routing,
            streaming responses, API access, LAN support, and local history.
          </p>

          <div class="meta">
            <span>Version 0.1.0</span>
            <span>Windows</span>
            <span>macOS</span>
            <span>Linux</span>
            <span>Active Development</span>
          </div>
        </div>

        <div id="download-actions-unify" class="download-actions" hidden></div>
      </article>

      <article id="ks-k-mobile" class="download-card featured-download download-card-wide" data-visible-account-id="ks_dev" hidden>
        <div class="download-info">
          <span class="download-kicker">KS-K Mobile</span>

          <h2>Mobile Companion</h2>

          <p>
            Private alpha builds for the KS-K Mobile app — remote monitoring,
            quick controls, and secure sync with your KANASAKA stack.
          </p>

          <div class="meta">
            <span>Private Alpha</span>
            <span>iOS</span>
            <span>Android</span>
            <span>@ks_dev access</span>
          </div>
        </div>

        <div id="download-actions-ks-k-mobile" class="download-actions" hidden></div>
      </article>
    </div>

    <div id="auth-gate-downloads" class="auth-gate" hidden></div>

    <div class="download-notes">
      <h3>Install notes</h3>

      <p>
        KS Unify is currently in active development. Early builds may change quickly.
      </p>

      <ul class="download-notes-list">
        <li><strong>Windows</strong> — You may see a SmartScreen warning because the installer is not yet code-signed. Choose “More info”, then “Run anyway”.</li>
        <li><strong>macOS</strong> — This build is for Apple Silicon (M1/M2/M3). After opening the DMG, if macOS blocks the app, go to System Settings → Privacy &amp; Security → Open Anyway.</li>
        <li><strong>Linux</strong> — Install with <code>sudo dpkg -i KS.Unify_0.1.0_amd64.deb</code>. Requires WebKitGTK 4.1.</li>
        <li><strong>Android (KS-K Mobile)</strong> — Debug APK for authorized accounts. Enable sideloading or install via ADB; Android may warn because the build is unsigned.</li>
      </ul>
    </div>
  </section>
"""
    return shell("Downloads", body)


def ks_k_mobile_page() -> str:
    body = """
  <div id="ks-k-mobile-content" data-visible-account-id="ks_dev" hidden>
  <section class="hero compact">
    <div class="kanasaka-logo small">
      <div class="logo-side"><div></div><div></div></div>
      <div class="logo-center"><span>K</span><span>S</span></div>
      <div class="logo-side"><div></div><div></div></div>
    </div>

    <h1>KS-K Mobile</h1>

    <p>
      Mobile companion for KANASAKA systems — remote monitoring,
      quick controls, and secure sync with your KS stack.
    </p>
  </section>

  <section class="page-section">
    <article class="content-card featured-card">
      <div class="product-info">
        <span class="section-kicker">Mobile Application</span>
        <h2>KS-K Mobile</h2>

        <p>
          KS-K Mobile extends your KANASAKA workspace to iOS and Android with
          secure session sync, lightweight controls, and private alpha builds
          for internal testing.
        </p>

        <div class="meta">
          <span>Private Alpha</span>
          <span>iOS</span>
          <span>Android</span>
          <span>Internal Testing</span>
        </div>
      </div>

      <div class="actions">
        <a href="/downloads/#ks-k-mobile" class="button">Downloads</a>
        <a href="/support/contact/" class="button secondary">Contact</a>
      </div>
    </article>
  </section>
  </div>

  <section id="ks-k-mobile-gate" class="page-section" hidden>
    <div class="auth-gate-box">
      <h2>Restricted Product</h2>
      <p>KS-K Mobile is only visible to authorized internal accounts.</p>
      <div class="auth-gate-actions">
        <a href="/" class="button secondary">Back to Home</a>
        <a href="/login/" class="button">Log In</a>
      </div>
    </div>
  </section>
"""
    return shell("KS-K Mobile", body)


def contact_page() -> str:
    body = """
  <section class="hero compact">
    <div class="kanasaka-logo small">
      <div class="logo-side"><div></div><div></div></div>
      <div class="logo-center"><span>K</span><span>S</span></div>
      <div class="logo-side"><div></div><div></div></div>
    </div>

    <h1>Contact</h1>

    <p>Reach the KANASAKA team for product, support, and partnership inquiries.</p>
  </section>

  <section class="page-section">
    <article class="content-card featured-card">
      <div class="product-info">
        <span class="section-kicker">Support</span>
        <h2>Get in Touch</h2>

        <p>
          Sign in to view our contact email for product, support, and partnership inquiries.
        </p>

        <div id="contact-details" class="contact-details" hidden></div>
      </div>
    </article>

    <div id="auth-gate-contact" class="auth-gate" hidden></div>
  </section>
"""
    return shell("Contact", body)


TERMS_BODY = """
  <section class="hero compact">
    <div class="kanasaka-logo small">
      <div class="logo-side"><div></div><div></div></div>
      <div class="logo-center"><span>K</span><span>S</span></div>
      <div class="logo-side"><div></div><div></div></div>
    </div>

    <h1>Terms of Service</h1>

    <p>Effective date: 1 August 2026</p>
  </section>

  <section class="page-section legal-document">
    <article class="content-card legal-card">
      <section class="tos-section">
        <h2>1. Agreement to Terms</h2>
        <p>By accessing or using the KANASAKA website at kanasaka.com (the &ldquo;Site&rdquo;), creating an account, or downloading software made available through the Site, you agree to be bound by these Terms of Service (&ldquo;Terms&rdquo;). If you do not agree, do not use the Site or our services.</p>
      </section>

      <section class="tos-section">
        <h2>2. Description of Service</h2>
        <p>KANASAKA provides an informational website, user accounts, authenticated access to product downloads (including KS Unify), support and contact channels, and related online services. Features may change, be limited, or be withdrawn during active development.</p>
      </section>

      <section class="tos-section">
        <h2>3. Eligibility</h2>
        <p>You must be at least 16 years old and able to form a binding contract under applicable law. By using the Site, you represent that you meet these requirements.</p>
      </section>

      <section class="tos-section">
        <h2>4. Accounts and Security</h2>
        <p>You are responsible for maintaining the confidentiality of your login credentials and for all activity under your account. You must provide accurate registration information, keep it up to date, and notify us promptly of unauthorized access. We may suspend or terminate accounts that violate these Terms or pose a security risk.</p>
      </section>

      <section class="tos-section">
        <h2>5. Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>use the Site or downloads for unlawful, harmful, or fraudulent purposes;</li>
          <li>attempt to gain unauthorized access to systems, accounts, or data;</li>
          <li>interfere with or disrupt the Site, its infrastructure, or other users;</li>
          <li>reverse engineer, decompile, or redistribute software except as expressly permitted;</li>
          <li>scrape, harvest, or automate access in a manner that burdens our services;</li>
          <li>upload malware or submit false, misleading, or abusive content.</li>
        </ul>
      </section>

      <section class="tos-section">
        <h2>6. Software Downloads</h2>
        <p>Software such as KS Unify is provided for personal or internal business use under these Terms unless a separate license agreement applies. Pre-release builds may be incomplete, unstable, or change without notice. You download and use software at your own risk. Distribution, sublicensing, or commercial resale of downloads is prohibited unless we authorize it in writing.</p>
      </section>

      <section class="tos-section">
        <h2>7. Intellectual Property</h2>
        <p>The Site, KANASAKA branding, logos, text, graphics, and software are owned by KANASAKA or its licensors and protected by intellectual property laws. These Terms do not grant you any ownership rights except the limited right to use the Site and permitted downloads in accordance with these Terms.</p>
      </section>

      <section class="tos-section">
        <h2>8. Privacy</h2>
        <p>Our handling of personal data is described in our Privacy Policy. By using the Site, you acknowledge that we process account, security, and usage data as needed to operate the service.</p>
      </section>

      <section class="tos-section">
        <h2>9. Disclaimers</h2>
        <p>The Site and all software are provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties of any kind, whether express or implied, including merchantability, fitness for a particular purpose, and non-infringement. We do not guarantee uninterrupted, secure, or error-free operation.</p>
      </section>

      <section class="tos-section">
        <h2>10. Limitation of Liability</h2>
        <p>To the fullest extent permitted by law, KANASAKA and its operators will not be liable for indirect, incidental, special, consequential, or punitive damages, or for loss of profits, data, or goodwill arising from your use of the Site or downloaded software. Our total liability for any claim relating to the Site or services will not exceed the greater of &euro;100 or the amount you paid us (if any) in the twelve months before the claim.</p>
      </section>

      <section class="tos-section">
        <h2>11. Indemnification</h2>
        <p>You agree to indemnify and hold harmless KANASAKA from claims, damages, and expenses (including reasonable legal fees) arising from your misuse of the Site, violation of these Terms, or infringement of third-party rights.</p>
      </section>

      <section class="tos-section">
        <h2>12. Termination</h2>
        <p>You may stop using the Site at any time. We may suspend or terminate access if you breach these Terms or if required for legal, security, or operational reasons. Provisions that by nature should survive termination will remain in effect.</p>
      </section>

      <section class="tos-section">
        <h2>13. Changes to Terms</h2>
        <p>We may update these Terms from time to time. Material changes will be indicated by updating the effective date above. Continued use after changes become effective constitutes acceptance of the revised Terms.</p>
      </section>

      <section class="tos-section">
        <h2>14. Governing Law</h2>
        <p>These Terms are governed by the laws of Germany, excluding conflict-of-law rules. Mandatory consumer protections in your country of residence remain unaffected where applicable.</p>
      </section>

      <section class="tos-section">
        <h2>15. Contact</h2>
        <p>Questions about these Terms: <a href="mailto:contactns@kanasaka.com">contactns@kanasaka.com</a></p>
      </section>
    </article>
  </section>
"""


def terms_page() -> str:
    return shell("Terms of Service", TERMS_BODY)


PRIVACY_BODY = """
  <section class="hero compact">
    <div class="kanasaka-logo small">
      <div class="logo-side"><div></div><div></div></div>
      <div class="logo-center"><span>K</span><span>S</span></div>
      <div class="logo-side"><div></div><div></div></div>
    </div>

    <h1>Privacy Policy</h1>

    <p>Effective date: 1 August 2026</p>
  </section>

  <section class="page-section legal-document">
    <article class="content-card legal-card">
      <section class="tos-section">
        <h2>1. Overview</h2>
        <p>This Privacy Policy explains how KANASAKA (&ldquo;we&rdquo;, &ldquo;us&rdquo;) processes personal data when you use kanasaka.com, create an account, download software, or contact us. We process data in accordance with applicable data protection laws, including the GDPR where it applies.</p>
      </section>

      <section class="tos-section">
        <h2>2. Data Controller</h2>
        <p>Controller: KANASAKA<br>Email: <a href="mailto:contactns@kanasaka.com">contactns@kanasaka.com</a><br>Website: <a href="https://kanasaka.com">https://kanasaka.com</a></p>
      </section>

      <section class="tos-section">
        <h2>3. Data We Collect</h2>
        <ul>
          <li><strong>Account data:</strong> email address, password hash, optional display name, profile avatar, email verification status.</li>
          <li><strong>Security data:</strong> session identifiers, authentication events, optional two-factor phone number if you enable SMS 2FA.</li>
          <li><strong>Usage data:</strong> IP address, browser/device information, and request metadata processed by our hosting provider for security and delivery.</li>
          <li><strong>Communications:</strong> messages you send us and email delivery metadata when we send account or legal notices.</li>
        </ul>
      </section>

      <section class="tos-section">
        <h2>4. Purposes and Legal Bases</h2>
        <ul>
          <li><strong>Provide the service</strong> (account creation, login, downloads, contact access) — contract performance and legitimate interests.</li>
          <li><strong>Security and fraud prevention</strong> — legitimate interests and legal obligations.</li>
          <li><strong>Transactional email</strong> (verification, password reset, requested legal documents) — contract performance and consent where required.</li>
          <li><strong>Legal compliance</strong> — legal obligation.</li>
        </ul>
      </section>

      <section class="tos-section">
        <h2>5. Processors and Hosting</h2>
        <p>We use trusted infrastructure providers to operate the Site, including Cloudflare (hosting, security, database, object storage), Resend (transactional email), and Twilio (SMS verification when 2FA is enabled). These providers process data on our behalf under appropriate contractual safeguards.</p>
      </section>

      <section class="tos-section">
        <h2>6. Cookies and Local Storage</h2>
        <p>We use a strictly necessary session cookie for authenticated access. Your browser may store local preferences such as theme selection and Terms acceptance state. We do not use third-party advertising cookies on the Site at this time.</p>
      </section>

      <section class="tos-section">
        <h2>7. Retention</h2>
        <p>We retain account data while your account is active and for a reasonable period afterward for security, backup, and legal purposes. Security logs are retained for a limited period. You may request account deletion through your account settings.</p>
      </section>

      <section class="tos-section">
        <h2>8. Your Rights</h2>
        <p>Depending on your location, you may have the right to access, rectify, erase, restrict, or object to processing of your personal data, and to data portability. You may also lodge a complaint with a supervisory authority. Contact us at <a href="mailto:contactns@kanasaka.com">contactns@kanasaka.com</a> to exercise your rights.</p>
      </section>

      <section class="tos-section">
        <h2>9. International Transfers</h2>
        <p>Our providers may process data in countries outside your own. Where required, we rely on appropriate safeguards such as standard contractual clauses or equivalent mechanisms.</p>
      </section>

      <section class="tos-section">
        <h2>10. Children</h2>
        <p>The Site is not directed to children under 16. We do not knowingly collect personal data from children under 16.</p>
      </section>

      <section class="tos-section">
        <h2>11. Changes</h2>
        <p>We may update this Privacy Policy from time to time. Material changes will be reflected by updating the effective date above.</p>
      </section>

      <section class="tos-section">
        <h2>12. Contact</h2>
        <p>Privacy inquiries: <a href="mailto:contactns@kanasaka.com">contactns@kanasaka.com</a></p>
      </section>
    </article>
  </section>
"""


IMPRESSUM_BODY = """
  <section class="hero compact">
    <div class="kanasaka-logo small">
      <div class="logo-side"><div></div><div></div></div>
      <div class="logo-center"><span>K</span><span>S</span></div>
      <div class="logo-side"><div></div><div></div></div>
    </div>

    <h1>Impressum</h1>

    <p>Legal notice pursuant to &sect; 5 TMG</p>
  </section>

  <section class="page-section legal-document">
    <article class="content-card legal-card">
      <section class="tos-section">
        <h2>Service Provider</h2>
        <p>
          KANASAKA<br>
          Germany
        </p>
      </section>

      <section class="tos-section">
        <h2>Contact</h2>
        <p>
          Email: <a href="mailto:contactns@kanasaka.com">contactns@kanasaka.com</a><br>
          Website: <a href="https://kanasaka.com">https://kanasaka.com</a>
        </p>
      </section>

      <section class="tos-section">
        <h2>Responsible for Content (&sect; 55 Abs. 2 RStV)</h2>
        <p>KANASAKA<br>contactns@kanasaka.com</p>
      </section>

      <section class="tos-section">
        <h2>Dispute Resolution</h2>
        <p>The European Commission provides a platform for online dispute resolution (ODR): <a href="https://ec.europa.eu/consumers/odr/" rel="noopener noreferrer" target="_blank">https://ec.europa.eu/consumers/odr/</a>. We are not obliged or willing to participate in dispute resolution proceedings before a consumer arbitration board unless required by law.</p>
      </section>

      <section class="tos-section">
        <h2>Liability for Content and Links</h2>
        <p>We make reasonable efforts to keep Site content accurate and current but cannot guarantee completeness or correctness. We are responsible for our own content under general law. External links are provided for convenience; we are not responsible for third-party content.</p>
      </section>

      <section class="tos-section">
        <h2>Copyright</h2>
        <p>Content and works on this Site are subject to copyright. Reproduction, editing, or distribution beyond what is permitted by law requires prior written consent.</p>
      </section>
    </article>
  </section>
"""


def privacy_page() -> str:
    return shell("Privacy Policy", PRIVACY_BODY)


def impressum_page() -> str:
    return shell("Impressum", IMPRESSUM_BODY)


def login_page() -> str:
    body = f"""{auth_page_open()}
{auth_card_open()}
      <p class="auth-eyebrow">Account</p>
      <h1>Log In</h1>
      <p class="auth-lead">Sign in with your email and password. Account ID is not required here.</p>

      <form id="login-form" class="auth-form">
        <div class="auth-field">
          <label for="login-email">Email</label>
          <input id="login-email" name="email" type="email" autocomplete="email" required>
        </div>

        <div class="auth-field">
          <label for="login-password">Password</label>
          <input id="login-password" name="password" type="password" autocomplete="current-password" required>
        </div>

        <button class="button auth-submit" type="submit">Log In</button>
      </form>

      <div class="auth-footer">
        <p class="auth-switch"><a href="/forgot-password/">Forgot password?</a></p>
        <p class="auth-switch">No account yet? <a href="/register/">Register</a></p>
      </div>
{auth_card_close()}
{auth_page_close()}
"""
    return shell("Log In", body)


def register_page() -> str:
    body = f"""{auth_page_open()}
{auth_card_open()}
      <p class="auth-eyebrow">Account</p>
      <h1>Register</h1>
      <p class="auth-lead">Create a free account to download KS Unify and view contact details.</p>

      <form id="register-form" class="auth-form">
        <div class="auth-field">
          <label for="register-account-id">Account ID</label>
          <input id="register-account-id" name="accountId" type="text" minlength="3" maxlength="32" autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="username">
          <p class="auth-field-hint">Optional now — set or change anytime in Account Settings (once every 6 months after first set).</p>
          <p id="register-account-id-status" class="auth-field-status" hidden></p>
        </div>

        <div class="auth-field">
          <label for="register-email">Email</label>
          <input id="register-email" name="email" type="email" autocomplete="email" required>
        </div>

        <div class="auth-field">
          <label for="register-password">Password</label>
          <input id="register-password" name="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required>
          <ul id="register-password-policy" class="password-policy" aria-live="polite"></ul>
        </div>

        <label class="auth-legal-consent">
          <input id="register-tos" name="tosAccepted" type="checkbox" value="1" required>
          <span>I agree to the <a href="/legal/terms/" target="_blank" rel="noopener">Terms of Service</a> and <a href="/legal/privacy/" target="_blank" rel="noopener">Privacy Policy</a>.</span>
        </label>

        <button class="button auth-submit" type="submit">Create Account</button>
      </form>

      <div class="auth-footer">
        <p class="auth-switch">Already registered? <a href="/login/">Log in</a></p>
      </div>
{auth_card_close()}
{auth_page_close()}
"""
    return shell("Register", body)


def verify_page() -> str:
    body = f"""{auth_page_open()}
{auth_card_open(elevated=False)}
      <p class="auth-eyebrow">Account</p>
      <h1>Verify Email</h1>
      <p id="verify-status" class="auth-lead">Preparing verification...</p>
{auth_card_close()}
{auth_page_close()}
"""
    return shell("Verify Email", body)


def forgot_password_page() -> str:
    body = f"""{auth_page_open()}
{auth_card_open(elevated=False)}
      <p class="auth-eyebrow">Account</p>
      <h1>Forgot Password</h1>
      <p class="auth-lead">Enter your email address and we will send you a reset link.</p>

      <form id="forgot-password-form" class="auth-form">
        <div class="auth-field">
          <label for="forgot-email">Email</label>
          <input id="forgot-email" name="email" type="email" autocomplete="email" required>
        </div>

        <button class="button auth-submit" type="submit">Send Reset Link</button>
      </form>

      <div class="auth-footer">
        <p class="auth-switch"><a href="/login/">Back to log in</a></p>
      </div>
{auth_card_close()}
{auth_page_close()}
"""
    return shell("Forgot Password", body)


def reset_password_page() -> str:
    body = f"""{auth_page_open()}
{auth_card_open(elevated=False)}
      <p class="auth-eyebrow">Account</p>
      <h1>Reset Password</h1>
      <p class="auth-lead">Choose a new password for your KANASAKA account.</p>

      <form id="reset-password-form" class="auth-form">
        <div class="auth-field">
          <label for="reset-password">New Password</label>
          <input id="reset-password" name="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required>
          <ul id="reset-password-policy" class="password-policy" aria-live="polite"></ul>
        </div>

        <button class="button auth-submit" type="submit">Update Password</button>
      </form>

      <div class="auth-footer">
        <p class="auth-switch"><a href="/login/">Back to log in</a></p>
      </div>
{auth_card_close()}
{auth_page_close()}
"""
    return shell("Reset Password", body)


def settings_page() -> str:
    body = f"""{auth_page_open(settings=True)}
    <div class="settings-layout">
      <aside class="settings-sidebar settings-sidebar-card">
        <div class="settings-sidebar-head">
          <p class="auth-eyebrow">Account</p>
          <h1>Settings</h1>
          <p>Manage your profile, appearance, and account.</p>
        </div>
        <nav id="settings-nav" class="settings-nav" aria-label="Account settings sections">
          <button type="button" class="settings-nav-item is-active" data-settings-panel="personal">
            <span class="settings-nav-label">Personal Information</span>
          </button>
          <button type="button" class="settings-nav-item" data-settings-panel="customization">
            <span class="settings-nav-label">Customization</span>
          </button>
          <button type="button" class="settings-nav-item" data-settings-panel="account">
            <span class="settings-nav-label">Account Management</span>
          </button>
          <button type="button" class="settings-nav-item" data-settings-panel="billing">
            <span class="settings-nav-label">Billing</span>
          </button>
        </nav>
      </aside>

      <div class="settings-main auth-card settings-card settings-card-elevated auth-card--modern">
        <div class="auth-card-accent" aria-hidden="true"></div>
        <div class="auth-card-body settings-card-body">
        <div id="settings-gate" class="auth-gate" hidden></div>

        <div id="settings-content" class="settings-panels-wrap" hidden>
          <section id="settings-panel-personal" class="settings-panel is-active">
            <h2>Personal Information</h2>
            <p class="settings-panel-intro">Update your profile picture and display name.</p>

            <div class="settings-profile settings-profile-card">
              <div id="settings-avatar" class="settings-avatar" aria-hidden="true"></div>
              <div class="settings-profile-actions">
                <label class="button secondary settings-upload-label" for="settings-avatar-input">
                  Upload Photo
                </label>
                <input id="settings-avatar-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden>
                <button id="settings-avatar-remove" class="auth-link secondary" type="button" hidden>
                  Remove Photo
                </button>
              </div>
            </div>

            <form id="settings-profile-form" class="auth-form settings-form">
              <div class="auth-field">
                <label for="settings-account-id">Account ID</label>
                <input id="settings-account-id" name="accountId" type="text" minlength="3" maxlength="32" autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="username">
                <p id="settings-account-id-hint" class="auth-field-hint">Choose a unique ID for permissions and lookup. You can change it once every 6 months after it is set.</p>
                <p id="settings-account-id-status" class="auth-field-status" hidden></p>
              </div>

              <div class="auth-field">
                <label for="settings-display-name">Display Name</label>
                <input id="settings-display-name" name="displayName" type="text" maxlength="40" autocomplete="nickname">
              </div>

              <div class="auth-field">
                <label for="settings-email">Email</label>
                <input id="settings-email" name="email" type="email" disabled>
              </div>

              <button class="button" type="submit">Save Profile</button>
            </form>
          </section>

          <section id="settings-panel-customization" class="settings-panel" hidden>
            <h2>Customization</h2>
            <p class="settings-panel-intro">Choose how KANASAKA looks on your device.</p>

            <div class="theme-picker" role="group" aria-label="Theme selection">
              <button type="button" class="theme-option" data-theme-option="dark">
                <span class="theme-option-label">Dark Mode</span>
                <span class="theme-option-preview theme-preview-dark"></span>
              </button>
              <button type="button" class="theme-option" data-theme-option="light">
                <span class="theme-option-label">Light Mode</span>
                <span class="theme-option-preview theme-preview-light"></span>
              </button>
              <button type="button" class="theme-option" data-theme-option="accent">
                <span class="theme-option-label">Accent Mode</span>
                <span class="theme-option-preview theme-preview-accent"></span>
              </button>
            </div>
          </section>

          <section id="settings-panel-account" class="settings-panel" hidden>
            <h2>Account Management</h2>
            <p class="settings-panel-intro">Update your password or permanently delete your account.</p>

            <div class="settings-section">
              <h3 class="settings-subsection-title">Change Password</h3>
              <form id="settings-password-form" class="auth-form settings-form">
                <div class="auth-field">
                  <label for="settings-current-password">Current Password</label>
                  <input id="settings-current-password" name="currentPassword" type="password" autocomplete="current-password">
                </div>

                <div class="auth-field">
                  <label for="settings-new-password">New Password</label>
                  <input id="settings-new-password" name="newPassword" type="password" autocomplete="new-password" minlength="12" maxlength="128">
                  <ul id="settings-new-password-policy" class="password-policy" aria-live="polite"></ul>
                </div>

                <button class="button secondary" type="submit">Update Password</button>
              </form>
            </div>

            <form id="settings-delete-form" class="auth-form settings-form settings-danger-zone settings-section settings-section-danger">
              <h3 class="settings-subsection-title">Delete Account</h3>
              <p class="settings-danger-copy">
                This permanently removes your account, profile picture, and access to downloads.
              </p>

              <div class="auth-field">
                <label for="settings-delete-password">Password</label>
                <input id="settings-delete-password" name="password" type="password" autocomplete="current-password">
              </div>

              <div class="auth-field">
                <label for="settings-delete-confirm">Type DELETE to confirm</label>
                <input id="settings-delete-confirm" name="confirmation" type="text" autocomplete="off">
              </div>

              <button class="button settings-delete-button" type="submit">Delete Account</button>
            </form>
          </section>

          <section id="settings-panel-billing" class="settings-panel" hidden>
            <h2>Billing</h2>

            <p id="billing-status-message" class="billing-status-message" hidden></p>

            <div id="billing-unconfigured" class="settings-billing-callout" hidden>
              <p>Live billing is not configured yet. Check back soon.</p>
            </div>

            <div id="billing-developer" class="settings-billing-callout settings-billing-developer" hidden>
              <span class="billing-badge billing-badge-active">Developer</span>
              <p>Your @ks_dev account includes permanent KS Stocks access.</p>
            </div>

            <div id="billing-active" class="settings-billing-card" hidden>
              <div class="settings-billing-header">
                <div>
                  <span class="section-kicker">Subscription</span>
                  <h3 class="settings-subsection-title">KS_Package</h3>
                </div>
                <span id="billing-status-badge" class="billing-badge">Active</span>
              </div>

              <p id="billing-active-copy" class="settings-billing-copy">
                Your account is entitled to KS Stocks while this subscription stays active.
              </p>
              <p id="billing-renews" class="settings-billing-meta" hidden></p>

              <div class="settings-billing-actions">
                <button id="billing-portal-button" class="button secondary" type="button">
                  Manage billing
                </button>
                <a href="/products/ks-stocks/" class="button">KS Stocks</a>
              </div>
            </div>

            <div id="billing-subscribe" class="settings-billing-card" hidden>
              <div class="settings-billing-header">
                <div>
                  <span class="section-kicker">Subscription</span>
                  <h3 class="settings-subsection-title">KS_Package</h3>
                </div>
              </div>

              <p class="settings-billing-copy">
                Unlock KS Stocks on your KANASAKA account. Billing is tied to your account ID.
              </p>

              <div class="billing-plan-grid">
                <article class="billing-plan-card">
                  <h4>Monthly</h4>
                  <p class="billing-plan-price">€10<span>/month</span></p>
                  <button class="button" type="button" data-billing-plan="monthly">Subscribe monthly</button>
                </article>
                <article class="billing-plan-card billing-plan-card-featured">
                  <h4>Annual</h4>
                  <p class="billing-plan-price">€100<span>/year</span></p>
                  <button class="button" type="button" data-billing-plan="annual">Subscribe annually</button>
                </article>
              </div>
            </div>
          </section>
        </div>
        </div>
      </div>
    </div>
{auth_page_close()}
"""
    return shell("Account Settings", body)


def ks_stocks_page() -> str:
    body = """
  <section class="hero compact">
    <div class="kanasaka-logo small">
      <div class="logo-side"><div></div><div></div></div>
      <div class="logo-center"><span>K</span><span>S</span></div>
      <div class="logo-side"><div></div><div></div></div>
    </div>

    <h1>KS Stocks</h1>

    <p>
      Desktop market analytics and portfolio tooling for KANASAKA accounts.
      Access is granted while your KS_Package subscription is active.
    </p>
  </section>

  <section class="page-section">
    <article class="content-card featured-card">
      <div class="product-info">
        <span class="section-kicker">Desktop Application</span>
        <h2>KS_Package</h2>

        <p>
          Subscribe once per KANASAKA account ID. While your subscription is active
          or trialing, KS Stocks unlocks on every device where you sign in.
        </p>

        <div class="meta">
          <span>€10 / month</span>
          <span>€100 / year</span>
          <span>Account-based access</span>
        </div>
      </div>

      <div class="actions">
        <a href="/account/settings/?section=billing" class="button">Subscribe</a>
        <a href="/downloads/" class="button secondary">Downloads</a>
      </div>
    </article>
  </section>

  <section class="page-section">
    <h2>Included</h2>

    <div class="feature-grid">
      <article>
        <h3>Live entitlement</h3>
        <p>Your KANASAKA session reflects subscription status in real time.</p>
      </article>
      <article>
        <h3>Account ID keyed</h3>
        <p>Access follows your account ID, not a single machine license.</p>
      </article>
      <article>
        <h3>Self-serve billing</h3>
        <p>Upgrade, cancel, or update payment details from Account Settings.</p>
      </article>
    </div>
  </section>
"""
    return shell("KS Stocks", body)


def write_page(rel_path: str, content: str) -> None:
    if rel_path == "index.html":
        path = ROOT / "index.html"
    else:
        path = ROOT / rel_path / "index.html"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    print(f"  wrote {path.relative_to(ROOT)}")


def main() -> None:
    print("Generating pages...")
    write_page("index.html", home_page())
    write_page("products/ks-unify", ks_unify_page())
    write_page("products/ks-stocks", ks_stocks_page())
    write_page("products/ks-k-mobile", ks_k_mobile_page())
    write_page("downloads", downloads_page())
    write_page("support/contact", contact_page())
    write_page("legal/terms", terms_page())
    write_page("legal/privacy", privacy_page())
    write_page("legal/impressum", impressum_page())
    write_page("login", login_page())
    write_page("register", register_page())
    write_page("verify", verify_page())
    write_page("forgot-password", forgot_password_page())
    write_page("reset-password", reset_password_page())
    write_page("account/settings", settings_page())

    for rel, title in COMING_SOON_PAGES:
        write_page(rel, coming_soon(title))

    print(f"Done — {12 + len(COMING_SOON_PAGES)} pages generated.")


if __name__ == "__main__":
    main()
