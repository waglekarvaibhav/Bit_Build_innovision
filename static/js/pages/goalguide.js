// Goal Guide (/guide) — improvement #2: customers describe a goal, pick
// services, and receive real, matching active packages with an actual quoted
// total. Backed by the deterministic /api/guides/suggest endpoint. Suggestions
// are editable and only ever reference real stored packages — never invented
// providers, discounts, or savings.
const GoalGuide = {
  render() {
    if (!requireRole("customer")) return;
    const shell = mountShell("guides");
    const head = `<h1>Goal Guide</h1>
      <p>Describe what you're aiming for, pick the services it involves, and get matching package suggestions with the actual stored quote. You stay in control — edit selections and book anything you like.</p>`;
    const page = AppShell.page(head);
    const el = page.el;

    el.innerHTML = `
      <form id="goal-form" class="card">
        <div class="field"><label for="g-goal">What are you trying to accomplish?</label>
          <textarea class="input" id="g-goal" rows="2" placeholder="e.g. Move into a new home and want it cleaned, painted and assembled…"></textarea></div>
        <div class="field"><label for="g-loc">Locality</label>
          <input class="input" id="g-loc" list="goal-loc-list" placeholder="e.g. Margao" />
          <datalist id="goal-loc-list"></datalist></div>
        <div class="field"><label>Required services <span class="xsmall muted">(select all that apply)</span></label>
          <div class="chips-row" id="goal-services"></div></div>
        <button class="btn" type="submit">Find matching packages</button>
      </form>
      <div id="goal-results" class="mt-2"></div>
    `;

    API.get("/api/localities").then(d => {
      document.getElementById("goal-loc-list").innerHTML = d.localities.map(l => `<option value="${esc(l)}"></option>`).join("");
    }).catch(() => {});
    API.get("/api/service-categories").then(cats => {
      const wrap = document.getElementById("goal-services");
      const svc = cats.flatMap(c => c.services);
      wrap.innerHTML = svc.map(s => `<button type="button" class="pill-btn" data-svc="${s.id}" data-name="${esc(s.name)}">${esc(s.name)}</button>`).join("");
      wrap.querySelectorAll("[data-svc]").forEach(btn => {
        btn.addEventListener("click", () => {
          const on = btn.classList.toggle("active");
          btn.setAttribute("aria-pressed", on ? "true" : "false");
        });
      });
    }).catch(() => {});

    document.getElementById("goal-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const selected = [...document.querySelectorAll("[data-svc].active")].map(b => Number(b.dataset.svc));
      const loc = document.getElementById("g-loc").value.trim();
      const out = document.getElementById("goal-results");
      if (!selected.length) { Toast.error("Select at least one required service."); return; }
      out.innerHTML = `<div class="state-box"><div class="spinner"></div> Matching against the catalogue…</div>`;
      const bp = new URLSearchParams({ service_ids: selected.join(",") });
      if (loc) bp.set("locality", loc);
      try {
        const data = await API.get("/api/guides/suggest?" + bp.toString());
        const pkgs = data.packages;
        if (!pkgs.length) {
          out.innerHTML = `<div class="state-box"><div class="big">🔍</div><p>No active package currently covers all the services you selected${loc ? ` in ${esc(loc)}` : ""}. Try fewer services or a different locality.</p></div>`;
          return;
        }
        out.innerHTML = `
          <h3>Suggested packages <span class="xsmall muted">(${pkgs.length})</span></h3>
          <p class="xsmall muted">Suggestions come from the live catalogue. Package hourly rate is the whole-package rate.</p>
          <div class="grid">${pkgs.map(p => this.card(p, selected)).join("")}</div>`;
        out.querySelectorAll(".book-pkg").forEach(b => b.addEventListener("click", () => {
          location.href = "/prebook?package=" + b.dataset.id;
        }));
      } catch (err) { out.innerHTML = `<div class="state-box">${esc(err.message)}</div>`; }
    });
  },

  card(p, selected) {
    return `
      <div class="card">
        <div class="between"><span class="tag ${p.package_type}">${p.package_type === "team" ? "Team" : "Multitasking"}</span><span class="xsmall muted">${esc(p.locality)}</span></div>
        <h3 style="margin-top:10px">${esc(p.name)}</h3>
        <div class="small muted">${esc(p.description).slice(0, 110)}${p.description.length > 110 ? "…" : ""}</div>
        <div class="chips-row" style="margin-top:8px">${p.services.map(s => `<span class="chip-inline">${esc(s)}</span>`).join("")}</div>
        <div class="between mt-2">
          <span class="xsmall muted">${p.member_count ? p.member_count + "-person crew" : "one provider"}</span>
          <span class="price">${money(p.hourly_rate)}<small>/hr</small></span>
        </div>
        <p class="xsmall muted" style="margin:8px 0 0">Included services: ${p.services.join(", ")}. Lead: ${esc(p.lead_name || p.owner_name)}.</p>
        <button class="btn sm ghost mt-1 book-pkg" data-id="${p.id}">Book this package</button>
      </div>`;
  },
};
