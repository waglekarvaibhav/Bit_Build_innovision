// /find — search providers with filtering, plus the explainable rule-based
// shortlist ("Best match" panel) powered by the backend /api/shortlist.
const FindPage = {
  async render() {
    if (!requireRole("customer")) return;
    const shell = mountShell("home");
    const params = new URLSearchParams(location.search);
    const q = (params.get("q") || "").trim();
    const requestedLocality = (params.get("loc") || "").trim();

    const head = `<h1>Find a professional</h1>
      <p>Search by service or keyword and refine by locality and budget. The <strong>Best match</strong> panel ranks eligible providers using real, stored data.</p>`;
    const page = AppShell.page(head);
    const el = page.el;
    el.innerHTML = `<div class="skeleton"></div>`;

    // Load catalog + providers for filter options.
    let cats = [], providers = [], localities = [];
    try {
      const [c, p, l] = await Promise.all([
        API.get("/api/service-categories"), API.get("/api/providers"), API.get("/api/localities"),
      ]);
      cats = c; providers = p; localities = l.localities;
    } catch (e) { showFatal(e, el); return; }

    // Selected service from query match (best-effort category/service name search).
    // An empty query means "show all", not "pick the first service".
    let selectedService = null;
    if (q) {
      const ql = q.toLowerCase();
      for (const cat of cats) {
        for (const s of cat.services) {
          if (s.name.toLowerCase().includes(ql) || cat.name.toLowerCase().includes(ql)) {
            selectedService = s.id;
            this._svcName = s.name;
            break;
          }
        }
        if (selectedService) break;
      }
    }

    const serviceOptions = cats.flatMap(c => c.services).map(s =>
      `<option value="${s.id}" ${selectedService == s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("");
    const locOptions = localities.map(l =>
      `<option value="${esc(l)}" ${requestedLocality.toLowerCase() === String(l).toLowerCase() ? "selected" : ""}>${esc(l)}</option>`
    ).join("");

    el.innerHTML = `
      <form id="filter-form" class="card mb-2">
        <div class="field-row">
          <div class="field span-2"><label for="f-svc">Service</label>
            <select id="f-svc" class="input"><option value="">Any service</option>${serviceOptions}</select></div>
          <div class="field"><label for="f-loc">Locality</label>
            <select id="f-loc" class="input"><option value="">Any locality</option>${locOptions}</select></div>
          <div class="field"><label for="f-budget">Max hourly budget</label>
            <input id="f-budget" class="input" type="number" min="0" placeholder="e.g. 300" /></div>
        </div>
        <div class="between">
          <span class="xsmall muted">We filter by required service, locality and budget, then rank with a documented rule.</span>
          <button class="btn" type="submit">Search</button>
        </div>
      </form>
      <h2 class="mt-2">Results</h2>
      <div id="results"><div class="state-box"><div class="spinner"></div> Loading…</div></div>
      <h2 class="mt-2">Best match (rule-based)</h2>
      <div id="shortlist"></div>
    `;

    const serviceSel = document.getElementById("f-svc");
    const localitySel = document.getElementById("f-loc");
    const applySearch = (svcId) => {
      if (svcId) serviceSel.value = String(svcId);
      if (requestedLocality) {
        const matchingOption = Array.from(localitySel.options).find(
          o => o.value.toLowerCase() === requestedLocality.toLowerCase()
        );
        if (matchingOption) localitySel.value = matchingOption.value;
      }
      runResults();
      runShortlist();
    };
    document.getElementById("filter-form").addEventListener("submit", e => {
      e.preventDefault();
      runResults();
      runShortlist();
    });

    async function runResults() {
      const svc = serviceSel.value || null;
      const loc = localitySel.value || null;
      const budgetRaw = document.getElementById("f-budget").value.trim();
      const budget = budgetRaw === "" ? null : parseFloat(budgetRaw);
      let arr = providers.filter(p => p.available !== false);
      if (loc) arr = arr.filter(p => (p.locality || "").toLowerCase() === loc.toLowerCase());
      if (svc) arr = arr.filter(p => p.services.some(s => s.service_id == svc));
      if (budget != null && !Number.isNaN(budget)) {
        arr = arr.filter(p => p.services.some(s => s.hourly_rate != null && s.hourly_rate <= budget));
      }
      arr.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      renderResults(arr);
    }

    async function runShortlist() {
      const svc = serviceSel.value || null;
      const loc = localitySel.value || null;
      const budgetRaw = document.getElementById("f-budget").value.trim();
      const budget = budgetRaw === "" ? null : parseFloat(budgetRaw);
      const bp = [];
      if (svc) bp.push("service_id=" + svc);
      if (loc) bp.push("locality=" + encodeURIComponent(loc));
      if (budget != null && !Number.isNaN(budget)) bp.push("max_budget=" + budget);
      const wrap = document.getElementById("shortlist");
      wrap.innerHTML = `<div class="state-box"><div class="spinner"></div> Scoring…</div>`;
      try {
        const rows = await API.get("/api/shortlist" + (bp.length ? "?" + bp.join("&") : ""));
        if (!rows.length) { wrap.innerHTML = `<div class="state-box">No providers scored for these filters.</div>`; return; }
        wrap.innerHTML = rows.slice(0, 6).map(r => `
          <div class="list-item">
            <div class="grow">
              <div class="between">
                <strong>${esc(r.full_name)}</strong> ${ratingHtml(r.rating, r.review_count)}
              </div>
              <div class="meta">${esc(r.profession)} · ${esc(r.locality)} · from <strong>${money(r.min_rate)}</strong>/hr</div>
              <div class="chips-row" style="margin-top:8px">${r.reasons.map(x => `<span class="chip-inline">${esc(x)}</span>`).join("") || `<span class="chip-inline">Basic availability</span>`}</div>
            </div>
            <a class="btn sm" href="/provider/${r.user_id}">View</a>
          </div>`).join("");
      } catch (e) { wrap.innerHTML = `<div class="state-box small">${esc(e.message)}</div>`; }
    }

    function renderResults(arr) {
      const box = document.getElementById("results");
      if (!arr.length) {
        box.innerHTML = `<div class="state-box"><div class="big">🔍</div>No professionals match your filters. Try widening locality or budget.</div>`;
        return;
      }
      const selectedId = serviceSel.value || null;
      box.innerHTML = arr.map(p => {
        const pricedService = selectedId
          ? p.services.find(s => s.service_id == selectedId)
          : p.services.find(s => s.hourly_rate != null) || p.services[0];
        const rate = pricedService && pricedService.hourly_rate;
        return `
        <div class="list-item">
          <div class="grow">
            <div class="between"><strong>${esc(p.full_name)}</strong> ${ratingHtml(p.rating, p.review_count)}</div>
            <div class="meta">${esc(p.profession)} · ${esc(p.locality)}</div>
            <div class="chips-row" style="margin-top:6px">${p.services.slice(0, 3).map(s => `<span class="chip-inline">${esc(s.service_name)}</span>`).join("")}</div>
          </div>
          <div style="text-align:right"><div class="price">${rate != null ? money(rate) : "Rate on request"}${rate != null ? "<small>/hr</small>" : ""}</div>
          <a class="btn sm ghost mt-1" href="/provider/${p.user_id}">Profile</a></div>
        </div>`;
      }).join("");
    }

    applySearch(selectedService);
  },
};
