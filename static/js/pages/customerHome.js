// Customer home dashboard.
const CustomerHome = {
  async render() {
    if (!requireRole("customer")) return;
    const shell = mountShell("home");
    shell.innerHTML = `<div class="skeleton"></div>`;

    let data;
    try {
      const [cats, providers, packages] = await Promise.all([
        API.get("/api/service-categories"),
        API.get("/api/providers"),
        API.get("/api/packages"),
      ]);
      // Only show available, rated or not, real providers.
      data = { cats, providers, packages };
    } catch (e) { showFatal(e, shell); return; }

    const head = `
      <h1>What do you need done?</h1>
      <p>Search services or browse categories. We connect you with local crew across Goa.</p>
    `;
    const page = AppShell.page(head);
    const el = page.el;

    const catCards = data.cats.slice(0, 6).map(c => {
      const catIcon = ({ "Home & Interior": "homeInt", "Electrical & Repair": "bolt", "Gardening & Outdoor": "leaf", "Assembly & Install": "wrench", "Maintenance Plans": "sparkles", "Moving & Packing": "box" })[c.name] || "toolbox";
      return `
      <button class="mi-cat" data-svc="${esc(c.name)}">
        <span class="mi-cat-icon" aria-hidden="true">${icon(catIcon)}</span>
        <span class="mi-cat-name">${esc(c.name)}</span>
        <span class="mi-cat-count">${c.services.length} services</span>
      </button>`;
    }).join("");

    const providerCards = data.providers.filter(p => p.available).slice(0, 4).map(p => `
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

    // Package sections separated by type.
    const mult = data.packages.filter(p => p.package_type === "multitasking" && p.status !== "archived");
    const teams = data.packages.filter(p => p.package_type === "team" && p.status !== "archived");

    const pkgIncl = (p) => (p.services || []).slice(0, 4).map(s => `<span class="mi-pkg-chip">${esc(s)}</span>`).join("");

    const pkgCard = (p, typeLabel) => `
      <a class="mi-pkg" href="/package/${p.id}" style="text-decoration:none;color:inherit">
        <span class="mi-pkg-tag ${p.package_type}">${typeLabel}</span>
        <div class="mi-pkg-name">${esc(p.name)}</div>
        <div class="mi-pkg-incl">${esc(p.locality)} · ${p.service_count} services${p.member_count ? " · " + p.member_count + " member crew" : " · one provider"}</div>
        <div class="mi-pkg-desc">${esc(p.description).slice(0, 110)}${p.description.length > 110 ? "…" : ""}</div>
        <div class="mi-pkg-chips">${pkgIncl(p)}</div>
        <div class="mi-pkg-foot">
          <span class="mi-pkg-price">${money(p.hourly_rate)}<small>/hr whole package</small></span>
          <span class="mi-btn mi-btn-ghost">Details</span>
        </div>
      </a>`;

    const multHtml = mult.length ? `
      <div class="mi-section"><h2>Multitasking packages</h2><span class="mi-section-note">One pro, bundled services</span></div>
      <div class="mi-pkgs-mult">${mult.map(p => pkgCard(p, "Multitasking")).join("")}</div>` : "";
    const teamHtml = teams.length ? `
      <div class="mi-section"><h2>Team packages</h2><span class="mi-section-note">Specialists working together</span></div>
      <div class="mi-pkgs-team">${teams.map(p => pkgCard(p, "Team")).join("")}</div>` : "";

    el.innerHTML = `
      <div class="mi-page-pad">
        <div class="mi-hero">
          <div>
            <h1>Good help. Close to home.</h1>
            <p>Search services or browse local professionals and packages across Goa.</p>
          </div>
          <div class="mi-hero-mark" aria-hidden="true">${icon("homeInt")}</div>
        </div>

        <div class="mi-search">
          <label class="sr-only" for="cn-search">Search for a service</label>
          <input id="cn-search" class="input" placeholder="Search ‘deep cleaning’, ‘electrician’, ‘paint’…" />
          <span class="mi-search-icon" aria-hidden="true">${icon("search")}</span>
        </div>
        <div class="mi-chips" id="loc-chips"></div>

        <div class="mi-section"><h2>Service categories</h2></div>
        <div class="mi-cats">${catCards}</div>

        <div class="mi-section"><h2>Relevant professionals</h2></div>
        <div class="mi-providers">${providerCards || `<div class="mi-empty">No available providers yet.</div>`}</div>

        ${multHtml}
        ${teamHtml}
      </div>
    `;

    // Locality chips
    API.get("/api/localities").then(d => {
      const wrap = document.getElementById("loc-chips");
      wrap.innerHTML = d.localities.slice(0, 6).map(l =>
        `<button class="mi-chip" data-loc="${esc(l)}">${icon("map")}${esc(l)}</button>`).join("");
      wrap.querySelectorAll("[data-loc]").forEach(b => b.addEventListener("click", () => {
        location.href = `/home?loc=${encodeURIComponent(b.dataset.loc)}`;
      }));
    }).catch(() => {});

    document.getElementById("cn-search").addEventListener("keydown", (e) => {
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
