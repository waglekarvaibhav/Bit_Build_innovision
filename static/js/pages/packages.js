// Customer package catalogue (/packages) and package detail (/package/:id).
const PackagesPage = {
  async render() {
    if (!requireRole("customer")) return;
    const shell = mountShell("packages");
    const head = `<h1>Packages</h1><p>Bundled work from one provider (multitasking) or a specialist team.</p>`;
    const page = AppShell.page(head);
    const el = page.el;
    el.innerHTML = `<div class="skeleton"></div>`;

    let packages;
    try { packages = (await API.get("/api/packages")) || []; }
    catch (e) { showFatal(e, el); return; }
    const active = packages.filter(p => p.status !== "archived");
    if (!active.length) {
      el.innerHTML = `<div class="state-box"><div class="big">📦</div><p>No packages are available right now.</p></div>`;
      return;
    }

    const mult = active.filter(p => p.package_type === "multitasking");
    const team = active.filter(p => p.package_type === "team");

    const card = (p) => `
      <a class="card" href="/package/${p.id}" style="text-decoration:none;color:inherit;display:block">
        <div class="between">
          <span class="tag ${p.package_type}">${p.package_type === "team" ? "Team" : "Multitasking"}</span>
          <span class="xsmall muted">${esc(p.locality)}</span>
        </div>
        <h3 style="margin-top:10px">${esc(p.name)}</h3>
        <p class="small muted" style="min-height:48px">${esc(p.description).slice(0, 110)}${p.description.length > 110 ? "…" : ""}</p>
        <div class="chips-row">${p.services.slice(0, 4).map(s => `<span class="chip-inline">${esc(s)}</span>`).join("")}</div>
        <div class="between mt-2">
          <span class="price">${money(p.hourly_rate)}<small>/hr</small></span>
          ${team.length ? `<span class="xsmall muted">${p.member_count}-person crew</span>` : `<span class="xsmall muted">1 provider</span>`}
        </div>
      </a>`;

    el.innerHTML = `${mult.length ? `<h2>Multitasking packages</h2><div class="grid">${mult.map(card).join("")}</div>` : ""}
      ${team.length ? `<h2 style="margin-top:var(--space-6)">Team packages</h2><div class="grid">${team.map(card).join("")}</div>` : ""}`;
  },
};

const PackageDetail = {
  async render(params) {
    if (!requireRole("customer")) return;
    const shell = mountShell("packages");
    const head = `<a class="small" href="/packages">← All packages</a>`;
    const page = AppShell.page(head);
    const el = page.el;
    el.innerHTML = `<div class="skeleton"></div>`;

    let p;
    try { p = await API.get(`/api/packages/${params.id}`); }
    catch (e) {
      el.innerHTML = `<div class="state-box"><div class="big">📦</div><p>${esc(e.message)}</p><a class="btn sm mt-1" href="/packages">Browse packages</a></div>`;
      return;
    }
    if (p.status === "archived") {
      el.innerHTML = `<div class="state-box"><div class="big">🔒</div><p>This package is no longer available for new bookings.</p><a class="btn sm mt-1" href="/packages">Browse packages</a></div>`;
      return;
    }

    const memberCount = p.member_count;
    el.innerHTML = `
      <div class="card">
        <div class="between" style="align-items:flex-start">
          <div>
            <div class="row"><h1 style="margin:0">${esc(p.name)}</h1><span class="tag ${p.package_type}">${p.package_type === "team" ? "Team" : "Multitasking"}</span></div>
            <p class="small muted mt-1">${esc(p.locality)} · by ${esc(p.owner_name)}</p>
          </div>
          <div style="text-align:right">
            <div class="price">${money(p.hourly_rate)}<small>/hr (whole package)</small></div>
          </div>
        </div>
        <p>${esc(p.description)}</p>
        <h4>Included services (${p.service_count})</h4>
        <div class="chips-row">${p.services.map(s => `<span class="chip-inline">${esc(s)}</span>`).join("")}</div>
        <h4 style="margin-top:var(--space-4)">Crew (${memberCount})</h4>
        <ul class="crew-list">
          ${p.members.length ? p.members.map(m => `
            <li class="between"><span>${esc(m.name)}${m.is_lead ? ' <span class="badge amber">Lead</span>' : ""}</span><span class="xsmall muted">${esc(m.role || "Crew")}</span></li>`).join("")
          : `<li class="between"><span>${esc(p.owner_name)}</span><span class="xsmall muted">Solo provider</span></li>`}
        </ul>
        ${p.package_type === "team" && p.lead ? `<p class="small muted mt-1">Team lead: <strong>${esc(p.lead.name)}</strong>. The lead accepts the request and manages completion.</p>` : ""}
        <button class="btn primary lg mt-2" id="book-pkg">Book this package</button>
      </div>
    `;
    el.querySelector("#book-pkg").addEventListener("click", () => {
      location.href = "/prebook?package=" + params.id;
    });
  },
};
