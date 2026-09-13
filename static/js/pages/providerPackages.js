// Provider package management (/provider-packages) — list, create, edit,
// archive multitasking and team packages. Ownership enforced server-side.
const ProviderPackages = {
  async render() {
    if (!requireRole("provider")) return;
    const shell = mountShell("packages");
    const head = `<div class="between">
        <div><h1>My Packages</h1><p>Bundle services (multitasking) or build a team (team).</p></div>
        <button class="btn primary" id="create-pkg">${icon("plus")} New package</button>
      </div>`;
    const page = AppShell.page(head);
    const el = page.el;
    el.innerHTML = `<div class="skeleton"></div>`;

    let pkgs, svcs;
    try {
      const [p, s] = await Promise.all([
        API.get("/api/providers/me/packages"),
        API.get("/api/services"),
      ]);
      pkgs = p.packages; svcs = s;
    } catch (e) { showFatal(e, el); return; }

    el.innerHTML = `
      <div id="pkg-list">
        ${pkgs.length ? pkgs.map(p => this.card(p)).join("") : `<div class="state-box"><div class="big">📦</div><p>No packages yet.</p></div>`}
      </div>
    `;
    el.querySelectorAll("[data-archive]").forEach(b => b.addEventListener("click", e => { e.preventDefault(); this._archive(b.dataset.archive, b); }));
    el.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", e => { e.preventDefault(); const p = pkgs.find(x => x.id == b.dataset.edit); this._modal(svcs, p); }));
    document.getElementById("create-pkg").addEventListener("click", () => this._modal(svcs, null));
  },

  card(p) {
    const members = p.member_count ? `${p.member_count}-member crew` : "one provider";
    return `
      <div class="list-item">
        <div class="grow">
          <div class="between">
            <strong>${esc(p.name)}</strong>
            <span class="row"><span class="tag ${p.package_type}">${p.package_type === "team" ? "Team" : "Multitasking"}</span><span class="status-dot ${p.status}"></span></span>
          </div>
          <div class="meta">${esc(p.locality)} · ${p.service_count} services · ${members} · ${money(p.hourly_rate)}/hr</div>
          <div class="chips-row" style="margin-top:6px">${p.services.slice(0, 4).map(s => `<span class="chip-inline">${esc(s)}</span>`).join("")}</div>
          ${p.status === "archived" ? `<p class="xsmall muted mt-1">Archived — existing bookings are unchanged.</p>` : ""}
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;align-items:stretch">
          ${p.status !== "archived" ? `<button class="btn sm ghost" data-edit="${p.id}">Edit</button>` : ""}
          ${p.status !== "archived" ? `<button class="btn sm danger" data-archive="${p.id}">Archive</button>` : ""}
        </div>
      </div>`;
  },

  _modal(svcs, pkg) {
    const me = Auth.get();
    const wrap = document.createElement("div");
    wrap.className = "dialog-backdrop open"; wrap.setAttribute("role", "dialog"); wrap.setAttribute("aria-modal", "true");
    const initialType = pkg ? pkg.package_type : "multitasking";
    wrap.innerHTML = `
      <div class="dialog">
        <h2>${pkg ? "Edit package" : "Create package"}</h2>
        <form id="pkg-form" novalidate>
          <div class="field">
            <label>Package type</label>
            <div class="chips-row" id="type-tabs">
              <button type="button" class="pill-btn ${initialType === "multitasking" ? "active" : ""}" data-type="multitasking">Multitasking</button>
              <button type="button" class="pill-btn ${initialType === "team" ? "active" : ""}" data-type="team">Team</button>
            </div>
          </div>
          <div class="field"><label for="pm-name">Package name</label><input class="input" id="pm-name" value="${pkg ? esc(pkg.name) : ""}" required minlength="2" /></div>
          <div class="field"><label for="pm-desc">Description</label><textarea class="input" id="pm-desc" required minlength="2">${pkg ? esc(pkg.description) : ""}</textarea></div>
          <div class="field-row">
            <div class="field"><label for="pm-loc">Locality</label><input class="input" id="pm-loc" list="pm-loc-list" value="${pkg ? esc(pkg.locality) : ""}" required /><datalist id="pm-loc-list"></datalist></div>
            <div class="field"><label for="pm-rate">Hourly rate (whole package)</label><input class="input" id="pm-rate" type="number" min="0.01" step="0.01" value="${pkg ? pkg.hourly_rate : ""}" required /></div>
          </div>
          <div class="field"><label>Services <span class="xsmall muted">(multitasking needs 2+)</span></label><div class="chips-row" id="pm-services"></div></div>
          <div class="field" id="pm-members-field" style="${initialType === "team" ? "" : "display:none"}">
            <label>Crew members <span class="xsmall muted">(team needs 2+, one lead)</span></label>
            <div id="pm-members" class="col"></div>
          </div>
          <button class="btn block" id="pm-submit" type="submit">${pkg ? "Save changes" : "Create package"}</button>
        </form>
        <div class="dialog-actions"><button class="btn ghost sm" id="pm-close" type="button">Cancel</button></div>
      </div>`;
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.addEventListener("click", e => { if (e.target === wrap) close(); });
    wrap.querySelector("#pm-close").addEventListener("click", close);
    document.addEventListener("keydown", function esc(e) { if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); } });

    let packageType = initialType;
    const svcSet = new Set((pkg && pkg.service_ids) || []);
    const memberSet = new Set((pkg && pkg.members ? pkg.members.map(m => m.user_id) : []));
    let leadId = (pkg && pkg.lead ? pkg.lead.user_id : null);

    API.get("/api/localities").then(d => { wrap.querySelector("#pm-loc-list").innerHTML = d.localities.map(l => `<option value="${esc(l)}"></option>`).join(""); }).catch(() => {});

    // Service chips
    const svcWrap = wrap.querySelector("#pm-services");
    svcWrap.innerHTML = svcs.map(s => `<button type="button" class="pill-btn ${svcSet.has(s.id) ? "active" : ""}" data-svc="${s.id}">${esc(s.name)}</button>`).join("");
    svcWrap.querySelectorAll("[data-svc]").forEach(b => b.addEventListener("click", () => {
      const on = b.classList.toggle("active"); b.setAttribute("aria-pressed", on ? "true" : "false");
    }));

    // Type tabs
    wrap.querySelectorAll("#type-tabs [data-type]").forEach(tab => tab.addEventListener("click", () => {
      packageType = tab.dataset.type;
      wrap.querySelectorAll("#type-tabs [data-type]").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      wrap.querySelector("#pm-members-field").style.display = packageType === "team" ? "" : "none";
    }));

    // Member checkboxes (providers other than self) with lead radios.
    const memberWrap = wrap.querySelector("#pm-members");
    API.get("/api/providers").then(all => {
      const others = all.filter(p => p.user_id && p.user_id !== me.user_id);
      memberWrap.innerHTML = others.map(p => `
        <div class="between" style="border-bottom:1px solid var(--border);padding:6px 0">
          <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" class="pm-check" data-id="${p.user_id}" ${memberSet.has(p.user_id) ? "checked" : ""} /><span>${esc(p.full_name)}</span></label>
          <label class="xsmall muted"><input type="radio" name="pm-lead" value="${p.user_id}" ${leadId === p.user_id ? "checked" : ""} ${memberSet.has(p.user_id) ? "" : "disabled"} /> lead</label>
        </div>`).join("") || `<p class="xsmall muted">No other providers registered yet.</p>`;

      memberWrap.querySelectorAll(".pm-check").forEach(c => c.addEventListener("change", () => {
        const radio = memberWrap.querySelector(`input[name="pm-lead"][value="${c.dataset.id}"]`);
        radio.disabled = !c.checked;
        if (!c.checked && radio.checked) { radio.checked = false; leadId = null; }
      }));
    }).catch(() => memberWrap.innerHTML = `<p class="xsmall muted">Could not load providers.</p>`);

    wrap.querySelector("#pkg-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const svcs_ = [...svcWrap.querySelectorAll("[data-svc].active")].map(b => Number(b.dataset.svc));
      const members = memberWrap ? [...memberWrap.querySelectorAll(".pm-check:checked")].map(c => Number(c.dataset.id)) : [];
      const lead = memberWrap && memberWrap.querySelector("input[name=pm-lead]:checked") ? Number(memberWrap.querySelector("input[name=pm-lead]:checked").value) : null;
      if (packageType === "multitasking" && svcs_.length < 2) { Toast.error("Multitasking needs at least 2 services."); return; }
      if (packageType === "team") {
        if (members.length < 2) { Toast.error("Team needs at least 2 members."); return; }
        if (!lead) { Toast.error("Select a team lead."); return; }
      }
      const payload = {
        name: wrap.querySelector("#pm-name").value.trim(),
        description: wrap.querySelector("#pm-desc").value.trim(),
        locality: wrap.querySelector("#pm-loc").value.trim(),
        hourly_rate: parseFloat(wrap.querySelector("#pm-rate").value),
        package_type: packageType,
        status: "published",
        service_ids: svcs_,
        member_ids: packageType === "team" ? members : [],
        lead_member_id: packageType === "team" ? lead : null,
      };
      const btn = wrap.querySelector("#pm-submit"); btn.disabled = true;
      try {
        if (pkg) await API.put("/api/providers/me/packages/" + pkg.id, payload);
        else await API.post("/api/providers/me/packages", payload);
        Toast.success(pkg ? "Package updated" : "Package created");
        close(); this.render();
      } catch (err) { Toast.error(err.message); btn.disabled = false; }
    });
  },

  async _archive(id, btn) {
    if (!confirm("Archive this package? New bookings will be blocked; existing bookings stay unchanged.")) return;
    btn.disabled = true;
    try { await API.post("/api/providers/me/packages/" + id + "/archive", {}); Toast.success("Package archived"); this.render(); }
    catch (e) { Toast.error(e.message); btn.disabled = false; }
  },
};
