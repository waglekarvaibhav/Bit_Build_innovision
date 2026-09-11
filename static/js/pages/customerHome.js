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

    const catCards = data.cats.slice(0, 6).map(c => `
      <button class="cat-card" data-svc="${esc(c.name)}" style="border:none;background:var(--bg-elevated);border:1px solid var(--border);border-radius:var(--radius);padding:var(--space-4);text-align:left;cursor:pointer;display:block;width:100%">
        <div style="font-weight:700">${esc(c.name)}</div>
        <div class="xsmall muted" style="margin-top:4px">${esc(c.services.length)} services</div>
      </button>`).join("");

    const providerCards = data.providers.filter(p => p.available).slice(0, 4).map(p => `
      <div class="card slim">
        <div class="between">
          <span style="font-weight:700">${esc(p.full_name)}</span>
          ${ratingHtml(p.rating, p.review_count)}
        </div>
        <div class="small muted" style="margin:6px 0">${esc(p.profession)} · ${esc(p.locality)}</div>
        <div class="xsmall muted">From <strong>${money(p.services[0] && p.services[0].hourly_rate)}</strong>/hr</div>
        <a class="btn sm mt-1" href="/provider/${p.user_id}">View & book</a>
      </div>`).join("");

    // Package sections separated by type.
    const mult = data.packages.filter(p => p.package_type === "multitasking" && p.status !== "archived");
    const teams = data.packages.filter(p => p.package_type === "team" && p.status !== "archived");

    const pkgCard = (p, typeLabel) => `
      <div class="card slim">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span class="tag ${p.package_type}">${typeLabel}</span>
        </div>
        <div style="font-weight:700;margin:8px 0">${esc(p.name)}</div>
        <div class="xsmall muted">${esc(p.locality)} · ${p.service_count} services${p.member_count ? " · " + p.member_count + " member crew" : " · one provider"}</div>
        <div class="small" style="margin:8px 0">${esc(p.description).slice(0, 110)}${p.description.length > 110 ? "…" : ""}</div>
        <div class="between"><span class="price">${money(p.hourly_rate)}<small>/hr</small></span>
        <a class="btn sm ghost" href="/package/${p.id}">Details</a></div>
      </div>`;

    const multHtml = mult.length ? `<h3>Multitasking packages</h3><div class="grid">${mult.map(p => pkgCard(p, "Multitasking")).join("")}</div>` : "";
    const teamHtml = teams.length ? `<h3 style="margin-top:var(--space-6)">Team packages</h3><div class="grid">${teams.map(p => pkgCard(p, "Team")).join("")}</div>` : "";

    el.innerHTML = `
      <div style="position:relative;margin-bottom:var(--space-5)">
        <label class="sr-only" for="cn-search">Search for a service</label>
        <input id="cn-search" class="input" style="padding:14px 18px;font-size:var(--fs-lg);border-radius:999px" placeholder="Search ‘deep cleaning’, ‘electrician’, ‘paint’…" />
        ${icon("search")}
      </div>
      <div class="chips-row mb-2" id="loc-chips"></div>
      <h3>Service categories</h3>
      <div class="grid">${catCards}</div>
      <h3 style="margin-top:var(--space-6)">Relevant professionals</h3>
      <div class="grid">${providerCards || `<div class="state-box">No available providers yet.</div>`}</div>
      ${multHtml}
      ${teamHtml}
    `;

    // Locality chips
    API.get("/api/localities").then(d => {
      const wrap = document.getElementById("loc-chips");
      wrap.innerHTML = d.localities.slice(0, 6).map(l =>
        `<button class="pill-btn" data-loc="${esc(l)}">${esc(l)}</button>`).join("");
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
    document.querySelectorAll(".cat-card").forEach(c => {
      c.addEventListener("click", () => location.href = `/find?q=${encodeURIComponent(c.dataset.svc)}`);
    });
  },
};
