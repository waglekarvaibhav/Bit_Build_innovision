// Quick Hire (/quickhire) — guided multi-step booking:
// 1) choose service → 2) select professional or relevant package →
// 3) enter job details & schedule → 4) review & submit.
// Form input is preserved on recoverable errors.
const QuickHire = {
  state: { serviceId: null, providerId: null, packageId: null, billingUnit: "hourly" },

  async render() {
    if (!requireRole("customer")) return;
    const shell = mountShell("home");
    const head = `<a class="small" href="/home">← Home</a>`;
    const page = AppShell.page(head);
    const el = page.el;

    const qs = new URLSearchParams(location.search);
    this.state.providerId = qs.get("provider") || null;
    this.state.serviceId = qs.get("service") || null;
    this.state.packageId = qs.get("package") || null;
    if (this.state.packageId) {
      // Package preselect: load it and jump to details.
      el.innerHTML = `<div class="skeleton"></div>`;
      try {
        const pkg = await API.get(`/api/packages/${this.state.packageId}`);
        if (!pkg.services[0]) throw new Error("This package has no service to preselect.");
        // pick the package's first service for the item context
        this.state.serviceId = null;
        this.state._pkg = pkg;
        this.stepPackage(/* from detail */);
      } catch (e) { showFatal(e, el); }
      return;
    }
    el.innerHTML = `<div class="skeleton"></div>`;

    let cats = [], providers = [];
    try {
      const [c, p] = await Promise.all([API.get("/api/service-categories"), API.get("/api/providers")]);
      cats = c; providers = p.filter(x => x.available);
    } catch (e) { showFatal(e, el); return; }

    const services = cats.flatMap(c => c.services);
    this.stepService(services, providers, el);
  },

  stepService(services, providers, el) {
    const options = services.map(s => `<button class="svc-option" data-id="${s.id}" data-name="${esc(s.name)}">${esc(s.name)}<small>${esc(s.category || "")}</small></button>`).join("");
    el.innerHTML = `
      <div class="stepper small muted">Step 1 of 4 · Choose a service</div>
      <h2>What do you need done?</h2>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr))" id="svc-grid">
        ${options === "" ? `<p class="muted">No services configured yet.</p>` : options}
      </div>
    `;
    const sel = document.getElementById("svc-grid");
    sel.querySelectorAll(".svc-option").forEach(b => b.addEventListener("click", () => {
      this.state.serviceId = Number(b.dataset.id);
      this.stepSelect(providers);
    }));
  },

  async stepSelect(providers) {
    const shell = document.getElementById("content");
    const cats = window._cats || [];
    const svcId = this.state.serviceId;
    const svcName = this._svcName || "";
    let packages = [];
    try { packages = (await API.get("/api/packages")) || []; } catch (e) {}
    const matchingPkgs = packages.filter(p => p.services.includes(svcName) && p.status !== "archived");

    shell.innerHTML = `
      <div class="stepper small muted">Step 2 of 4 · Select ${esc(svcName)} provider or package</div>
      <h2>Choose who does the job</h2>
      <h3>Professionals</h3>
      <div id="provider-options"></div>
      ${matchingPkgs.length ? `<h3 style="margin-top:var(--space-5)">Relevant packages</h3><div id="package-options"></div>` : ""}
      <div id="selected-box" class="card mt-2" style="display:none"></div>
      <div class="between mt-2">
        <a class="btn ghost sm" href="/quickhire">Back</a>
        <button class="btn sm" id="next-btn" disabled>Continue to details</button>
      </div>
    `;

    const provWrap = document.getElementById("provider-options");
    const eligible = providers.filter(p => p.services.some(s => s.service_id == svcId));
    provWrap.innerHTML = (eligible.length ? eligible : providers).map(p => `
      <div class="list-item">
        <div class="grow">
          <div class="between"><strong>${esc(p.full_name)}</strong> ${ratingHtml(p.rating, p.review_count)}</div>
          <div class="meta">${esc(p.profession)} · ${esc(p.locality)}</div>
        </div>
        <button class="btn ghost sm pick-provider" data-id="${p.user_id}" data-name="${esc(p.full_name)}">Select</button>
      </div>`).join("");

    const matching = window._packages || [];
    const pkgWrap = document.getElementById("package-options");
    if (pkgWrap) {
      const pkgs = matchingPkgs;
      pkgWrap.innerHTML = pkgs.map(p => `
        <div class="list-item">
          <div class="grow">
            <div class="between"><strong>${esc(p.name)}</strong> <span class="tag ${p.package_type}">${p.package_type === "team" ? "Team" : "Multitasking"}</span></div>
            <div class="meta">${esc(p.locality)} · ${p.member_count ? p.member_count + " member crew" : "one provider"} · ${money(p.hourly_rate)}/hr</div>
          </div>
          <button class="btn ghost sm pick-package" data-id="${p.id}" data-name="${esc(p.name)}">Select</button>
        </div>`).join("") || `<p class="small muted">No matching packages.</p>`;
      pkgWrap.querySelectorAll(".pick-package").forEach(b => b.addEventListener("click", () => {
        this._clearPicks();
        this.state.packageId = Number(b.dataset.id);
        this.state.providerId = null;
        b.textContent = "Selected ✓"; b.className = "btn sm primary";
        document.getElementById("selected-box").style.display = "block";
        document.getElementById("selected-box").innerHTML = `Selected package: <strong>${esc(b.dataset.name)}</strong> (${esc(svcName)})`;
        document.getElementById("next-btn").disabled = false;
      }));
    }

    provWrap.querySelectorAll(".pick-provider").forEach(b => b.addEventListener("click", () => {
      this._clearPicks();
      this.state.providerId = Number(b.dataset.id);
      this.state.packageId = null;
      b.textContent = "Selected ✓"; b.className = "btn sm primary";
      document.getElementById("selected-box").style.display = "block";
      document.getElementById("selected-box").innerHTML = `Selected: <strong>${esc(b.dataset.name)}</strong> · ${esc(svcName)}`;
      document.getElementById("next-btn").disabled = false;
    }));

    document.getElementById("next-btn").addEventListener("click", () => this.stepDetails(svcName));
  },

  stepPackage() {
    // Jump straight to job details for a package that was pre-selected by
    // deep link (e.g. from package detail page). serviceId is null; backend
    // resolves scope from the package.
    const pkg = this.state._pkg;
    if (!pkg) { this.render(); return; }
    const shell = document.getElementById("content");
    shell.innerHTML = `
      <div class="stepper small muted">Booking a package · job details</div>
      <h2>Book “${esc(pkg.name)}”</h2>
      <div class="card slim">
        <div class="between">
          <span><strong>${esc(pkg.name)}</strong></span>
          <span class="tag ${pkg.package_type}">${pkg.package_type === "team" ? "Team" : "Multitasking"}</span>
        </div>
        <p class="small muted" style="margin-top:6px">${esc(pkg.locality)} · ${pkg.services.length} services · ${money(pkg.hourly_rate)}/hr</p>
        <div class="chips-row">${pkg.services.map(s => `<span class="chip-inline">${esc(s)}</span>`).join("")}</div>
      </div>
      <form id="detail-form" class="mt-2">
        <div class="field"><label for="d-item">What needs to be done?</label>
          <textarea class="input" id="d-item" required minlength="3" placeholder="Describe the scope of work for this package…"></textarea></div>
        <div class="field"><label for="d-address">Where is the job?</label>
          <input class="input" id="d-address" required minlength="3" placeholder="House/Flat, Street, Locality" /></div>
        <div class="field-row">
          <div class="field"><label for="d-date">Preferred date</label><input class="input" type="date" id="d-date" required /></div>
          <div class="field"><label for="d-time">Preferred time</label><input class="input" type="time" id="d-time" required /></div>
        </div>
        <div class="field-row">
          <div class="field"><label for="d-unit">Billing engagement</label>
            <select class="input" id="d-unit"><option value="hourly">Hourly</option><option value="daily">Daily</option><option value="monthly">Monthly</option></select></div>
          <div class="field"><label for="d-hours">Duration (hours)</label><input class="input" type="number" id="d-hours" min="0.5" step="0.5" value="2" required /></div>
        </div>
        <div class="between mt-2">
          <a class="btn ghost sm" href="/quickhire">Back</a>
          <button class="btn sm" type="submit">Review & submit</button>
        </div>
      </form>
    `;
    const d = new Date(); d.setDate(d.getDate() + 1);
    document.getElementById("d-date").value = d.toISOString().slice(0, 10);
    document.getElementById("d-time").value = "10:00";
    document.getElementById("detail-form").addEventListener("submit", e => {
      e.preventDefault();
      const item = document.getElementById("d-item").value.trim();
      const addr = document.getElementById("d-address").value.trim();
      const date = document.getElementById("d-date").value;
      const time = document.getElementById("d-time").value;
      const hours = parseFloat(document.getElementById("d-hours").value);
      this.state.billingUnit = document.getElementById("d-unit").value;
      if (!item || !addr || !date || !time || !hours) { Toast.error("Please complete all required fields."); return; }
      this.state.providerId = null;
      this.state.details = { item, addr, date, time, hours };
      this.stepReview(pkg.name);
    });
  },

  _clearPicks() {    document.querySelectorAll(".pick-provider,.pick-package").forEach(x => {
      x.className = x.classList.contains("pick-provider") ? "btn ghost sm pick-provider" : "btn ghost sm pick-package";
      x.textContent = "Select";
    });
  },

  stepDetails(svcName) {
    const shell = document.getElementById("content");
    shell.innerHTML = `
      <div class="stepper small muted">Step 3 of 4 · Job details & schedule</div>
      <h2>Tell us about the job</h2>
      <form id="detail-form">
        <div class="field"><label for="d-item">What needs to be done?</label>
          <textarea class="input" id="d-item" required minlength="3" placeholder="Describe the work, materials, access, etc."></textarea></div>
        <div class="field"><label for="d-address">Where is the job?</label>
          <input class="input" id="d-address" required minlength="3" placeholder="House/Flat, Street, Locality" /></div>
        <div class="field-row">
          <div class="field"><label for="d-date">Preferred date</label><input class="input" type="date" id="d-date" required /></div>
          <div class="field"><label for="d-time">Preferred time</label><input class="input" type="time" id="d-time" required /></div>
        </div>
        <div class="field-row">
          <div class="field"><label for="d-unit">Billing engagement</label>
            <select class="input" id="d-unit">
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="monthly">Monthly</option>
            </select></div>
          <div class="field"><label for="d-hours">Duration (hours)</label><input class="input" type="number" id="d-hours" min="0.5" step="0.5" value="2" required /></div>
        </div>
        <div id="price-hint" class="small muted"></div>
        <div class="between mt-2">
          <a class="btn ghost sm" id="back-btn">Back</a>
          <button class="btn sm" type="submit">Review & submit</button>
        </div>
      </form>
    `;

    // Set a sensible default date (tomorrow) and today's start time.
    const d = new Date(); d.setDate(d.getDate() + 1);
    document.getElementById("d-date").value = d.toISOString().slice(0, 10);
    document.getElementById("d-time").value = "10:00";

    document.getElementById("back-btn").addEventListener("click", () => this.render());
    document.getElementById("d-unit").addEventListener("change", evt => {
      this.state.billingUnit = evt.target.value;
      document.getElementById("price-hint").textContent =
        this.state.billingUnit === "hourly" ? "Billable in hours; provider's hourly rate applies."
        : this.state.billingUnit === "daily" ? "Billable per day (8 hrs = 1 day)."
        : "Billable per month. Provider must support this unit.";
    });
    document.getElementById("detail-form").addEventListener("submit", e => {
      e.preventDefault();
      const item = document.getElementById("d-item").value.trim();
      const addr = document.getElementById("d-address").value.trim();
      const date = document.getElementById("d-date").value;
      const time = document.getElementById("d-time").value;
      const hours = parseFloat(document.getElementById("d-hours").value);
      if (!item || !addr || !date || !time || !hours) { Toast.error("Please complete all required fields."); return; }
      this.state.details = { item, addr, date, time, hours };
      this.stepReview(svcName);
    });
  },

  async stepReview(svcName) {
    const shell = document.getElementById("content");
    shell.innerHTML = `<div class="state-box"><div class="spinner"></div> Preparing summary…</div>`;
    const d = this.state.details;
    let quotePreview = null;
    try {
      if (this.state.packageId) {
        const pkg = await API.get(`/api/packages/${this.state.packageId}`);
        this.state._pkg = pkg;
        quotePreview = pkg.hourly_rate * d.hours;
      } else {
        const provs = await API.get("/api/providers");
        const prov = provs.find(p => p.user_id == this.state.providerId);
        const svc = prov && prov.services.find(s => s.service_id == this.state.serviceId);
        const rate = this._rateFor(svc, d.hours);
        this.state._rate = rate;
        quotePreview = d.hours * (rate || 0);
      }
    } catch (e) { quotePreview = null; }

    // Billing unit label
    const quoteUnits = this.state.billingUnit === "hourly" ? d.hours
      : this.state.billingUnit === "daily" ? Math.max(1, Math.round(d.hours / 8))
      : Math.max(1, Math.round(d.hours / (8 * 22)));
    const unitCount = quoteUnits;

    // Preview price (server recomputes authoritatively on submit).
    let preview = null;
    if (this.state.packageId && this.state._pkg) preview = this.state._pkg.hourly_rate * quoteUnits;
    else if (this.state._rate != null) preview = this.state._rate * quoteUnits;

    shell.innerHTML = `
      <div class="stepper small muted">Step 4 of 4 · Review & submit</div>
      <h2>Review your request</h2>
      <div class="card">
        <h4>Service</h4><p>${esc(svcName)}</p>
        <h4>Selected</h4><p>${esc(this._pkgName() || "Professional")}</p>
        <h4>What needs doing</h4><p>${esc(d.item)}</p>
        <h4>Where</h4><p>${esc(d.addr)}</p>
        <h4>When</h4><p>${fmtDate(d.date)} at ${esc(d.time)}</p>
        <div class="between" style="border-top:1px solid var(--border);padding-top:var(--space-3)">
          <span class="small">Engagement</span><span class="small">${esc(this.state.billingUnit)} (${unitCount} unit${unitCount === 1 ? "" : "s"})</span>
        </div>
        <div class="between" style="padding-top:var(--space-2)">
          <span class="price">${preview != null ? money(preview) : "Computed on submit"}</span>
          <span class="small muted">final amount set by server</span>
        </div>
        <p class="xsmall muted" style="margin-top:var(--space-2)">This is a <em>request</em>. It becomes <strong>confirmed</strong> only after the provider accepts. No payment is taken.</p>
      </div>
      <div class="field error" id="submit-err"></div>
      <div class="between mt-2">
        <button class="btn ghost sm" id="back2">Back</button>
        <button class="btn primary" id="submit-btn">Submit request</button>
      </div>
    `;
    document.getElementById("back2").addEventListener("click", () => this.stepDetails(svcName));
    document.getElementById("submit-btn").addEventListener("click", async () => {
      const btn = document.getElementById("submit-btn");
      btn.disabled = true;
      const errEl = document.getElementById("submit-err");
      const payload = {
        service_id: this.state.serviceId,
        provider_id: this.state.providerId,
        package_id: this.state.packageId,
        item_description: d.item,
        address: d.addr,
        booking_date: d.date,
        booking_time: d.time,
        duration_hours: d.hours,
        billing_unit: this.state.billingUnit,
      };
      try {
        const booking = await API.post("/api/customers/bookings", payload);
        Toast.success("Booking request submitted");
        location.href = "/booking/" + booking.id;
      } catch (ex) {
        errEl.textContent = ex.message;
        errEl.style.display = "block";
        btn.disabled = false;
        // preserve form: return to step 3 with inputs intact (state kept)
        this.stepDetails(svcName);
      }
    });
  },

  _rateFor(svc, hours) {
    if (!svc) return null;
    return this.state.billingUnit === "hourly" ? svc.hourly_rate
      : this.state.billingUnit === "daily" ? svc.daily_rate
      : svc.monthly_rate;
  },
  _pkgName() { return this.state._pkg ? this.state._pkg.name : null; },
};
