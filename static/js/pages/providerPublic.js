// Public provider profile (/provider/:id) shown to CUSTOMERS — services, rates,
// locality, reviews, and a "Book" button that hands off to Quick Hire with the
// provider pre-selected. Contact details are never shown here (private).
const ProviderPublic = {
  async render(params) {
    if (!requireRole("customer")) return;
    const shell = mountShell("home");
    const head = `<a class="small" href="/find">← Back to search</a>`;
    const page = AppShell.page(head);
    const el = page.el;
    el.innerHTML = `<div class="skeleton"></div>`;
    let p;
    try { p = await API.get("/api/providers/" + params.id); }
    catch (e) {
      el.innerHTML = `<div class="state-box">${esc(e.message)}</div>`; return;
    }
    let reviews = [];
    try { reviews = (await API.get("/api/providers/" + params.id + "/reviews")) || []; }
    catch (e) {}

    el.innerHTML = `
      <div class="card">
        <div class="between" style="align-items:flex-start">
          <div>
            <div style="display:flex;align-items:center;gap:14px">
              <span class="avatar" style="width:56px;height:56px;border-radius:50%;background:var(--teal);color:#fff;display:grid;place-items:center;font-size:1.3rem;font-weight:700">${initials(p.full_name)}</span>
              <div>
                <h1 style="margin:0">${esc(p.full_name)}</h1>
                <div class="meta">${esc(p.profession)} · ${esc(p.locality)}</div>
                <div>${ratingHtml(p.rating, p.review_count)}</div>
              </div>
            </div>
          </div>
          <div style="text-align:right">
            <div class="${p.available ? "badge success" : "badge neutral"}">${p.available ? "Available" : "Unavailable"}</div>
            <div class="xsmall muted" style="margin-top:4px">${p.experience_years ? p.experience_years + " yr experience" : "New"}</div>
          </div>
        </div>
        ${p.bio ? `<p class="small" style="margin-top:var(--space-3)">${esc(p.bio)}</p>` : ""}
        ${p.available
          ? `<button class="btn primary mt-2" id="book-now">Book ${esc(p.full_name)}</button>`
          : `<button class="btn mt-2" type="button" disabled>Currently unavailable</button>`}
      </div>

      <div class="card mt-1">
        <h3>Services & rates</h3>
        ${p.services.length ? p.services.map(s => `
          <div class="between" style="padding:10px 0;border-bottom:1px solid var(--border)">
            <strong>${esc(s.service_name)}</strong>
            <div class="chips-row">
              ${s.hourly_rate ? `<span class="chip-inline">hourly ${money(s.hourly_rate)}</span>` : ""}
              ${s.daily_rate ? `<span class="chip-inline">daily ${money(s.daily_rate)}</span>` : ""}
              ${s.monthly_rate ? `<span class="chip-inline">monthly ${money(s.monthly_rate)}</span>` : ""}
            </div>
          </div>`).join("") : `<p class="small muted">No services are currently listed.</p>`}
      </div>

      <div class="card mt-1">
        <h3>Reviews</h3>
        ${reviews.length ? reviews.map(r => `
          <div style="padding:10px 0;border-bottom:1px solid var(--border)">
            <div class="between"><span class="stars">${"★".repeat(Math.max(1, Math.round(r.rating)))}</span><span class="xsmall muted">${esc(r.customer_name)}</span></div>
            <p class="small" style="margin:4px 0 0">${esc(r.comment || "")}</p>
          </div>`).join("") : `<p class="small muted">No reviews yet — this professional is marked <strong>New</strong>.</p>`}
      </div>
    `;

    const bookBtn = document.getElementById("book-now");
    if (bookBtn) {
      bookBtn.addEventListener("click", () => {
        const firstSvc = p.services[0];
        const qs = new URLSearchParams({ provider: params.id });
        if (firstSvc) qs.set("service", firstSvc.service_id);
        location.href = "/quickhire?" + qs.toString();
      });
    }
  },
};
