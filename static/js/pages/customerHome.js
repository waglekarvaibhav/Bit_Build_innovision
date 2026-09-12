// Customer home dashboard — premium reference-inspired redesign.
const CustomerHome = {
  async render() {
    if (!requireRole("customer")) return;
    const me = Auth.user();
    const shell = mountShell("home");
    shell.innerHTML = `<div class="skeleton"></div>`;

    let data;
    try {
      const [cats, providers, packages, localities] = await Promise.all([
        API.get("/api/service-categories"),
        API.get("/api/providers"),
        API.get("/api/packages"),
        API.get("/api/localities").catch(() => ({ localities: [] })),
      ]);
      data = { cats, providers, packages, localities: localities.localities || [] };
    } catch (e) { showFatal(e, shell); return; }

    const page = AppShell.page("");
    const el = page.el;
    const availableProviders = data.providers.filter(p => p.available);
    const activePackages = data.packages.filter(p => p.status !== "archived");
    const firstName = (me.full_name || "there").split(" ")[0];

    const catCards = data.cats.slice(0, 6).map(c => {
      const catIcon = ({
        "Home & Interior": "homeInt",
        "Electrical & Repair": "bolt",
        "Gardening & Outdoor": "leaf",
        "Assembly & Install": "wrench",
        "Maintenance Plans": "sparkles",
        "Moving & Packing": "box"
      })[c.name] || "toolbox";
      return `
        <button class="mi-cat" data-svc="${esc(c.name)}">
          <span class="mi-cat-icon" aria-hidden="true">${icon(catIcon)}</span>
          <span class="mi-cat-name">${esc(c.name)}</span>
          <span class="mi-cat-count">${c.services.length} services</span>
        </button>`;
    }).join("");

    const providerCards = availableProviders.slice(0, 4).map(p => `
      <div class="mi-provider">
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
        <div class="mi-provider-rate">From <strong>${money(p.services[0] && p.services[0].hourly_rate)}</strong>/hr</div>
        <a class="mi-btn mi-btn-primary mi-btn-block" href="/provider/${p.user_id}">View & book</a>
      </div>`).join("");

    const pkgIncl = p => (p.services || []).slice(0, 3).map(s => `<span class="mi-pkg-chip">${esc(s)}</span>`).join("");
    const pkgCard = (p, label) => `
      <a class="mi-pkg" href="/package/${p.id}" style="text-decoration:none;color:inherit">
        <span class="mi-pkg-tag ${p.package_type}">${label}</span>
        <div class="mi-pkg-name">${esc(p.name)}</div>
        <div class="mi-pkg-incl">${esc(p.locality)} · ${p.service_count} services${p.member_count ? " · " + p.member_count + " member crew" : ""}</div>
        <div class="mi-pkg-desc">${esc(p.description || "").slice(0, 90)}${(p.description || "").length > 90 ? "…" : ""}</div>
        <div class="mi-pkg-chips">${pkgIncl(p)}</div>
        <div class="mi-pkg-foot">
          <span class="mi-pkg-price">${money(p.hourly_rate)}<small>/hr</small></span>
          <span class="mi-btn mi-btn-ghost">Details</span>
        </div>
      </a>`;

    const featuredPackages = activePackages.slice(0, 3);

    el.innerHTML = `
      <div class="cn-home">
        <section class="cn-home-hero">
          <div class="cn-mobile-topbar">
            <div class="cn-mini-brand"><span>CN</span><strong>CrewNest</strong></div>
            <div class="cn-mini-location">${icon("map")} Goa</div>
            <a class="cn-mini-avatar" href="/profile">${esc(initials(me.full_name))}</a>
          </div>
          <div class="cn-hero-copy">
            <span class="cn-kicker">${icon("sparkles")} Local help, without the hassle</span>
            <h1>Point. Speak. <span class="accent">Sorted.</span></h1>
            <p>Tell us what needs doing. CrewNest helps you find the right professional or team across Goa.</p>
            <div class="cn-hero-actions">
              <a class="cn-hero-btn primary" href="/quickhire">${icon("bolt")} Quick Hire</a>
              <a class="cn-hero-btn secondary" href="/find">${icon("search")} Explore pros</a>
            </div>
            <div class="cn-market-stats" aria-label="Marketplace stats">
              <div class="cn-market-stat"><strong>${availableProviders.length}</strong><span>available pros</span></div>
              <div class="cn-market-stat"><strong>${data.cats.length}</strong><span>service categories</span></div>
              <div class="cn-market-stat"><strong>${activePackages.length}</strong><span>ready packages</span></div>
            </div>
          </div>
        </section>

        <div class="cn-search-panel">
          <form class="cn-search-box" id="cn-home-search">
            <div class="cn-search-input-wrap">${icon("search")}<input id="cn-search" autocomplete="off" placeholder="What needs fixing, cleaning or moving?" aria-label="Search services" /></div>
            <button class="cn-search-submit" type="submit">Find help</button>
          </form>
          <div class="cn-localities" id="cn-localities">
            ${data.localities.slice(0, 7).map(l => `<button class="cn-locality" data-loc="${esc(l)}">${icon("map")} ${esc(l)}</button>`).join("")}
          </div>
        </div>

        <section class="cn-section">
          <div class="cn-section-head">
            <div><h2>What do you need, ${esc(firstName)}?</h2><p>Tap a category and get straight to relevant professionals.</p></div>
            <a class="cn-section-link" href="/find">See all</a>
          </div>
          <div class="mi-cats">${catCards}</div>
        </section>

        <section class="cn-section">
          <div class="cn-section-head">
            <div><h2>Top professionals near you</h2><p>Available providers you can view and book now.</p></div>
            <a class="cn-section-link" href="/find">Explore all</a>
          </div>
          <div class="mi-providers">${providerCards || `<div class="state-box">No available providers right now.</div>`}</div>
        </section>

        ${featuredPackages.length ? `
        <section class="cn-section">
          <div class="cn-section-head">
            <div><h2>Built for bigger jobs</h2><p>Book bundled services or an entire specialist crew.</p></div>
            <a class="cn-section-link" href="/packages">All packages</a>
          </div>
          <div class="mi-pkgs-team">${featuredPackages.map(p => pkgCard(p, p.package_type === "team" ? "Team" : "Multitasking")).join("")}</div>
        </section>` : ""}
      </div>`;

    document.getElementById("cn-home-search").addEventListener("submit", e => {
      e.preventDefault();
      const q = document.getElementById("cn-search").value.trim();
      location.href = q ? `/find?q=${encodeURIComponent(q)}` : "/find";
    });

    el.querySelectorAll("[data-loc]").forEach(b => b.addEventListener("click", () => {
      location.href = `/find?loc=${encodeURIComponent(b.dataset.loc)}`;
    }));
    el.querySelectorAll(".mi-cat").forEach(c => c.addEventListener("click", () => {
      location.href = `/find?q=${encodeURIComponent(c.dataset.svc)}`;
    }));
  },
};
