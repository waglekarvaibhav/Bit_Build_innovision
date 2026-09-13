// Customer home dashboard.
const CustomerHome = {
  async render() {
    if (!requireRole("customer")) return;
    const shell = mountShell("home");
    shell.innerHTML = `<div class="skeleton"></div>`;

    // Do not block the whole mobile home screen on one slow catalogue request.
    // Each section can render independently with an empty fallback.
    const [catsResult, providersResult, packagesResult] = await Promise.allSettled([
      API.get("/api/service-categories", { retry: false }),
      API.get("/api/providers", { retry: false }),
      API.get("/api/packages", { retry: false }),
    ]);
    const data = {
      cats: catsResult.status === "fulfilled" && Array.isArray(catsResult.value) ? catsResult.value : [],
      providers: providersResult.status === "fulfilled" && Array.isArray(providersResult.value) ? providersResult.value : [],
      packages: packagesResult.status === "fulfilled" && Array.isArray(packagesResult.value) ? packagesResult.value : [],
    };

    const head = `
      <div class="page-kicker"><span></span> Home</div>
      <h1>Your JobHustle</h1>
    `;
    const page = AppShell.page(head);
    const el = page.el;
    document.querySelector(".app").classList.add("customer-home");

    const catCards = data.cats.slice(0, 6).map((c, index) => {
      const catIcon = ({ "Home & Interior": "homeInt", "Electrical & Repair": "bolt", "Gardening & Outdoor": "leaf", "Assembly & Install": "wrench", "Maintenance Plans": "sparkles", "Moving & Packing": "box" })[c.name] || "toolbox";
      return `
      <button class="mi-cat" data-svc="${esc(c.name)}">
        <span class="mi-cat-index">0${index + 1}</span>
        <span class="mi-cat-icon" aria-hidden="true">${icon(catIcon)}</span>
        <span class="mi-cat-name">${esc(c.name)}</span>
        <span class="mi-cat-count">${(c.services || []).length} services</span>
        <span class="mi-cat-arrow" aria-hidden="true">↗</span>
      </button>`;
    }).join("");

    const providerCards = data.providers.filter(p => p.available).slice(0, 4).map(p => `
      <div class="mi-provider">
        <div class="mi-provider-signal"><span></span> AVAILABLE</div>
        <div class="mi-provider-head">
          <span class="mi-avatar" aria-hidden="true">${esc(initials(p.full_name))}</span>
          <div style="min-width:0">
            <div class="mi-provider-name">${esc(p.full_name)}</div>
            <div class="mi-provider-meta">${esc(p.profession)} · ${esc(p.locality)}</div>
          </div>
          ${p.rating != null
            ? `<span class="mi-provider-rating"><span class="mi-stars">★</span>${Number(p.rating).toFixed(1)}<span class="mi-rating-count">(${p.review_count})</span></span>`
            : `<span class="mi-provider-rating mi-rating-new">New</span>`}
        </div>
        <div class="mi-provider-rate">From <strong>${money(p.services && p.services[0] && p.services[0].hourly_rate)}</strong>/hr</div>
        <a class="mi-btn mi-btn-primary mi-btn-block" href="/provider/${p.user_id}">View profile <span>↗</span></a>
      </div>`).join("");

    // Package sections separated by type.
    const mult = data.packages.filter(p => p.package_type === "multitasking" && p.status !== "archived");
    const teams = data.packages.filter(p => p.package_type === "team" && p.status !== "archived");

    const pkgIncl = (p) => (p.services || []).slice(0, 4).map(s => `<span class="mi-pkg-chip">${esc(s)}</span>`).join("");

    const pkgCard = (p, typeLabel) => `
      <a class="mi-pkg" href="/package/${p.id}" style="text-decoration:none;color:inherit">
        <span class="mi-pkg-tag ${p.package_type}">${typeLabel}</span>
        <div class="mi-pkg-name">${esc(p.name)}</div>
        <div class="mi-pkg-incl">${esc(p.locality)} · ${p.service_count} services${p.member_count ? " · " + p.member_count + " member crew" : " · one provider"}</div>
        <div class="mi-pkg-desc">${esc(p.description || "").slice(0, 110)}${(p.description || "").length > 110 ? "…" : ""}</div>
        <div class="mi-pkg-chips">${pkgIncl(p)}</div>
        <div class="mi-pkg-foot">
          <span class="mi-pkg-price">${money(p.hourly_rate)}<small>/hr whole package</small></span>
          <span class="mi-btn mi-btn-ghost">Details</span>
        </div>
      </a>`;

    const multHtml = mult.length ? `
      <div class="mi-section"><span class="mi-section-no">03</span><h2>Multi-skilled specialists</h2><span class="mi-section-note">One professional, thoughtfully bundled services</span></div>
      <div class="mi-pkgs-mult">${mult.map(p => pkgCard(p, "Multitasking")).join("")}</div>` : "";
    const teamHtml = teams.length ? `
      <div class="mi-section"><span class="mi-section-no">04</span><h2>Ready-made crews</h2><span class="mi-section-note">The right specialists, already assembled</span></div>
      <div class="mi-pkgs-team">${teams.map(p => pkgCard(p, "Team")).join("")}</div>` : "";

    el.innerHTML = `
      <div class="mi-page-pad">
        <div class="mi-hero">
          <div class="mi-hero-copy">
            <div class="mi-hero-eyebrow"><span></span> Trusted help, close to home</div>
            <h1>You tell us what’s needed.<br><em>We bring the right people.</em></h1>
            <p>From a quick repair to a full home refresh, find vetted local professionals or book an entire specialist crew in one place.</p>
            <div class="mi-hero-actions">
              <a class="mi-btn mi-btn-light" href="/quickhire"><strong>Quick Hire</strong><span>Urgent · auto-match →</span></a>
              <a class="mi-btn mi-btn-outline-light" href="/prebook"><strong>Pre-book</strong><span>Choose date & provider →</span></a>
            </div>
            <div class="mi-hero-proof">
              <span><strong>${data.providers.filter(p => p.available).length}</strong> available pros</span>
              <span><strong>${data.cats.reduce((sum, c) => sum + (c.services || []).length, 0)}</strong> services</span>
              <span><strong>${data.packages.filter(p => p.status !== "archived").length}</strong> curated packages</span>
            </div>
          </div>
          <div class="mi-hero-visual">
            <img src="/assets/crewnest-hero.png" alt="A skilled local service crew in a modern Goan home" />
            <div class="mi-hero-float"><span class="network-pulse"></span><strong>Ready when you are</strong><small>Professionals across Goa</small></div>
          </div>
        </div>

        <div class="mi-search">
          <label class="sr-only" for="cn-search">Search for a service</label>
          <span class="mi-search-label">What can we help with?</span>
          <input id="cn-search" class="input" placeholder="Try “deep cleaning” or “electrician”" />
          <span class="mi-search-icon" aria-hidden="true">${icon("search")}</span>
          <span class="mi-search-key" aria-hidden="true">↵</span>
        </div>
        <div class="mi-chips" id="loc-chips"></div>

        <div class="mi-section"><span class="mi-section-no">01</span><h2>Explore by service</h2><span class="mi-section-note">Everything your home needs, in one place</span></div>
        <div class="mi-cats">${catCards || `<div class="mi-empty">Services are temporarily unavailable. You can still use Quick Hire or Pre-book.</div>`}</div>

        <div class="mi-section"><span class="mi-section-no">02</span><h2>Recommended professionals</h2><span class="mi-section-note">Available and trusted across Goa</span></div>
        <div class="mi-providers">${providerCards || `<div class="mi-empty">Professionals are taking a little longer to load.</div>`}</div>

        ${multHtml}
        ${teamHtml}
      </div>
    `;

    // Locality chips are optional and should never block Home.
    API.get("/api/localities", { retry: false, timeoutMs: 5000 }).then(d => {
      const wrap = document.getElementById("loc-chips");
      if (!wrap || !d || !Array.isArray(d.localities)) return;
      wrap.innerHTML = d.localities.slice(0, 6).map(l =>
        `<button class="mi-chip" data-loc="${esc(l)}">${icon("map")}${esc(l)}</button>`).join("");
      wrap.querySelectorAll("[data-loc]").forEach(b => b.addEventListener("click", () => {
        location.href = `/home?loc=${encodeURIComponent(b.dataset.loc)}`;
      }));
    }).catch(() => {});

    const search = document.getElementById("cn-search");
    if (search) search.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const q = e.target.value.trim();
        location.href = q ? `/find?q=${encodeURIComponent(q)}` : "/find";
      }
    });
    document.querySelectorAll(".mi-cat").forEach(c => {
      c.addEventListener("click", () => location.href = `/find?q=${encodeURIComponent(c.dataset.svc)}`);
    });
  },
};
