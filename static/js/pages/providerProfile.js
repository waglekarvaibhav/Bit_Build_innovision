// Provider profile (/provider-profile) — editable profile, services & rates,
// and availability toggle. Contact details stay private; only shown to booking
// customers after authorization.
const ProviderProfilePage = {
  async render() {
    if (!requireRole("provider")) return;
    const shell = mountShell("profile");
    const head = `<h1>My profile & services</h1>`;
    const page = AppShell.page(head);
    const el = page.el;
    el.innerHTML = `<div class="skeleton"></div>`;

    let data, svcs;
    try {
      [data, svcs] = await Promise.all([
        API.get("/api/providers/me"),
        API.get("/api/services"),
      ]);
    } catch (e) { showFatal(e, el); return; }
    const prof = data.profile;
    const mine = data.services;

    el.innerHTML = `
      <div class="card">
        <div class="between" style="align-items:flex-start">
          <div class="row"><span class="avatar" style="width:56px;height:56px;border-radius:50%;background:var(--amber);color:var(--ink);display:grid;place-items:center;font-size:1.3rem;font-weight:700">${initials(data.user.full_name)}</span>
            <div><h2 style="margin:0">${esc(data.user.full_name)}</h2><div class="small muted">${esc(prof.profession)}</div></div>
          </div>
          <div style="text-align:right">
            <span class="badge ${prof.available ? "success" : "neutral"}">${prof.available ? "Available" : "Unavailable"}</span><br/>
            <small class="xsmall muted">Customers see this status</small>
          </div>
        </div>
        <form id="prof-form" class="mt-1">
          <div class="field-row">
            <div class="field"><label for="p-prof">Profession</label><input class="input" id="p-prof" value="${esc(prof.profession)}" /></div>
            <div class="field"><label for="p-loc">Locality</label><input class="input" id="p-loc" list="p-loc-list" value="${esc(prof.locality)}" /><datalist id="p-loc-list"></datalist></div>
          </div>
          <div class="field"><label for="p-bio">Bio</label><textarea class="input" id="p-bio">${esc(prof.bio || "")}</textarea></div>
          <div class="field-row">
            <div class="field"><label for="p-exp">Experience (years)</label><input class="input" id="p-exp" type="number" min="0" value="${prof.experience_years || 0}" /></div>
            <div class="field" style="justify-content:flex-end;display:flex"><button class="btn ghost sm" id="toggle-avail" type="button" style="align-self:flex-end">${prof.available ? "Set unavailable" : "Set available"}</button></div>
          </div>
          <button class="btn" type="submit">Save profile</button>
        </form>
      </div>

      <div class="card mt-1">
        <h3>Services & rates</h3>
        <p class="xsmall muted">Set hourly, daily or monthly rates per service. These drive server-side pricing.</p>
        <div id="svc-list">${mine.map(s => this._svcRow(s)).join("") || `<p class="small muted">No services added yet.</p>`}</div>
        <div class="row mt-1">
          <div class="field grow"><label for="add-svc">Add a service</label>
            <select class="input" id="add-svc">${svcs.filter(s => !mine.some(m => m.service_id === s.id)).map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join("") || `<option value="">All services added</option>`}</select></div>
          <button class="btn sm ghost" id="add-svc-btn" type="button">Add</button>
        </div>
        <div class="row mt-1">
          <input class="input" id="new-h" type="number" min="0" step="0.01" placeholder="Hourly rate" style="max-width:130px" />
          <input class="input" id="new-d" type="number" min="0" step="0.01" placeholder="Daily rate" style="max-width:130px" />
          <input class="input" id="new-m" type="number" min="0" step="0.01" placeholder="Monthly rate" style="max-width:130px" />
        </div>
      </div>
    `;

    API.get("/api/localities").then(d => { el.querySelector("#p-loc-list").innerHTML = d.localities.map(l => `<option value="${esc(l)}"></option>`).join(""); }).catch(() => {});

    el.querySelector("#prof-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await API.put("/api/providers/me", {
          profession: document.getElementById("p-prof").value.trim(),
          locality: document.getElementById("p-loc").value.trim(),
          bio: document.getElementById("p-bio").value.trim() || null,
          experience_years: parseInt(document.getElementById("p-exp").value) || 0,
        });
        Toast.success("Profile saved"); this.render();
      } catch (err) { Toast.error(err.message); }
    });
    el.querySelector("#toggle-avail").addEventListener("click", async () => {
      try { await API.put("/api/providers/me", { available: !prof.available }); Toast.success("Availability updated"); this.render(); }
      catch (err) { Toast.error(err.message); }
    });
    el.querySelector("#add-svc-btn").addEventListener("click", async () => {
      const sid = el.querySelector("#add-svc").value;
      const h = parseFloat(el.querySelector("#new-h").value) || null;
      const d = parseFloat(el.querySelector("#new-d").value) || null;
      const m = parseFloat(el.querySelector("#new-m").value) || null;
      if (!sid || (h == null && d == null && m == null)) { Toast.error("Choose a service and at least one rate."); return; }
      try { await API.post("/api/providers/me/services", { service_id: Number(sid), hourly_rate: h, daily_rate: d, monthly_rate: m }); Toast.success("Service added"); this.render(); }
      catch (err) { Toast.error(err.message); }
    });
    el.querySelectorAll(".remove-svc").forEach(b => b.addEventListener("click", async (e) => {
      e.preventDefault();
      if (!confirm("Remove this service?")) return;
      try { await API.del("/api/providers/me/services/" + b.dataset.id); Toast.success("Removed"); this.render(); }
      catch (err) { Toast.error(err.message); }
    }));
  },

  _svcRow(s) {
    return `
      <div class="between" style="border-bottom:1px solid var(--border);padding:8px 0">
        <div><strong>${esc(s.service_name)}</strong></div>
        <div class="row"><div class="chips-row">
          ${s.hourly_rate ? `<span class="chip-inline">h ${money(s.hourly_rate)}</span>` : ""}
          ${s.daily_rate ? `<span class="chip-inline">d ${money(s.daily_rate)}</span>` : ""}
          ${s.monthly_rate ? `<span class="chip-inline">m ${money(s.monthly_rate)}</span>` : ""}
        </div><button class="btn sm ghost remove-svc" data-id="${s.id}" style="display:flex" type="button" aria-label="Remove ${esc(s.service_name)}">Remove</button></div>
      </div>`;
  },
};
