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
    ("legal/privacy", "Privacy"),
    ("legal/terms", "Terms"),
    ("legal/licenses", "Licenses"),
    ("legal/security", "Security"),
    ("legal/impressum", "Impressum"),
]


def shell(title: str, body: str) -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title} | KANASAKA</title>
  <link rel="stylesheet" href="/assets/css/style.css">
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
    </div>
  </section>
"""
    return shell(title, body)


def home_page() -> str:
    body = """
  <section class="hero">
    <div class="kanasaka-logo">
      <div class="logo-side"><div></div><div></div></div>
      <div class="logo-center"><span>K</span><span>S</span></div>
      <div class="logo-side"><div></div><div></div></div>
    </div>

    <h1>KANASAKA</h1>

    <p>Software, AI systems, and local-first infrastructure.</p>
  </section>

  <section class="page-section">
    <h2>Products</h2>

    <article class="product-card featured-card">
      <div class="product-info">
        <span class="section-kicker">Featured</span>
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
        <a href="/downloads/" class="button secondary">Downloads</a>
      </div>
    </article>
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

    <p>Get the latest public builds for KANASAKA products.</p>
  </section>

  <section class="page-section">
    <article class="download-card featured-download">
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
          <span>Linux</span>
          <span>Active Development</span>
        </div>
      </div>

      <div class="download-actions">
        <a class="button" href="https://github.com/AureliusDuxDeorum/KS_UNIFY/releases/download/v0.1.0/KS.Unify_0.1.0_x64-setup.exe" download>
          Download for Windows
        </a>

        <a class="button secondary" href="https://github.com/AureliusDuxDeorum/KS_UNIFY/releases/download/v0.1.0/KS.Unify_0.1.0_amd64.deb" download>
          Download for Linux .deb
        </a>
      </div>
    </article>

    <div class="download-notes">
      <h3>Notes</h3>

      <p>
        KS Unify is currently in active development. Early builds may change quickly.
      </p>

      <p>
        Windows users may see a security warning because the installer is not yet code-signed.
        This is expected for early independent builds.
      </p>
    </div>
  </section>
"""
    return shell("Downloads", body)


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
          For general inquiries, product questions, or support requests,
          use the contact details below.
        </p>

        <dl class="contact-details">
          <div class="contact-item">
            <dt>Email</dt>
            <dd><a href="mailto:contact@kanasaka.com">contact@kanasaka.com</a></dd>
          </div>

          <div class="contact-item">
            <dt>Telephone</dt>
            <dd><a href="tel:+4915223693645">+49 01522 3693645</a></dd>
            <dd class="contact-note">Available 2:00–6:00 PM on business days only.</dd>
          </div>
        </dl>
      </div>
    </article>
  </section>
"""
    return shell("Contact", body)


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
    write_page("downloads", downloads_page())
    write_page("support/contact", contact_page())

    for rel, title in COMING_SOON_PAGES:
        write_page(rel, coming_soon(title))

    print(f"Done — {3 + len(COMING_SOON_PAGES)} pages generated.")


if __name__ == "__main__":
    main()
