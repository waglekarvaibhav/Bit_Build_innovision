// JobHustle API client. All business data comes from the backend; the browser
// never persists bookings/packages itself. A 401 clears the session token.
const API = {
  base: "",

  async request(method, path, body, opts = {}) {
    const headers = { "Content-Type": "application/json" };
    headers["Accept"] = "application/json";
    const tok = Auth.token();
    if (tok) headers["Authorization"] = `Bearer ${tok}`;

    const init = { method, headers };
    if (body !== undefined && method !== "GET") init.body = JSON.stringify(body);

    // Keep retries short. By the time the SPA is running Render has already
    // started serving the app, so mobile pages should never sit on skeletons
    // for a minute waiting on one API call.
    const retryable = method === "GET" && opts.retry !== false;
    const retryDelays = opts.retryDelays || [700, 1500];
    const retryStatuses = new Set([502, 503, 504]);
    const timeoutMs = opts.timeoutMs || 7000;
    let res = null;

    for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
      const attemptInit = controller ? { ...init, signal: controller.signal } : init;

      try {
        res = await fetch(this.base + path, attemptInit);
      } catch (e) {
        if (retryable && attempt < retryDelays.length) {
          await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
          continue;
        }
        throw new Error("JobHustle could not connect to the server. Please try again.");
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }

      if (retryable && retryStatuses.has(res.status) && attempt < retryDelays.length) {
        await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
        continue;
      }
      break;
    }

    if (!res) {
      throw new Error("JobHustle could not connect to the server. Please try again.");
    }

    if (res.status === 401) {
      Auth.clear();
      if (!location.pathname.includes("/login")) {
        location.href = "/login";
      }
      throw new Error("Session expired. Please sign in again.");
    }
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    if (!res.ok) {
      const msg =
        (data && data.detail) ||
        (data && Array.isArray(data.detail) && data.detail[0] && data.detail[0].msg) ||
        `Request failed (${res.status})`;
      const err = new Error(typeof msg === "string" ? msg : String(msg));
      err.status = res.status;
      throw err;
    }
    return data;
  },

  get(path, opts) { return this.request("GET", path, undefined, opts); },
  post(path, body, opts) { return this.request("POST", path, body, opts); },
  put(path, body, opts) { return this.request("PUT", path, body, opts); },
  del(path, opts) { return this.request("DELETE", path, undefined, opts); },

  async upload(path, photoType, file) {
    const fd = new FormData();
    fd.append("photo_type", photoType);
    fd.append("file", file);
    const headers = {};
    const tok = Auth.token();
    if (tok) headers["Authorization"] = `Bearer ${tok}`;
    const res = await fetch(this.base + path, { method: "POST", headers, body: fd });
    if (res.status === 401) { Auth.clear(); location.href = "/login"; }
    let data = null; try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error((data && (data.detail || (Array.isArray(data.detail) && data.detail[0] && data.detail[0].msg))) || "Upload failed");
    return data;
  },
};

// Auth storage helper. The token is kept in localStorage for this demo app.
const Auth = {
  _KEY: "crewneat.auth",
  save(user) {
    localStorage.setItem(this._KEY, JSON.stringify(user));
  },
  get() {
    try {
      const u = JSON.parse(localStorage.getItem(this._KEY)) || null;
      if (u && u.user_id && u.id === undefined) u.id = u.user_id;
      return u;
    } catch (e) { return null; }
  },
  token() { const u = this.get(); return u ? u.access_token : null; },
  user() { return this.get(); },
  clear() { localStorage.removeItem(this._KEY); },
  isAuthenticated() { return !!this.token(); },
  role() { const u = this.get(); return u ? u.role : null; },
};

// Notifications
const Toast = {
  _region: null,
  region() {
    if (!this._region) {
      this._region = document.createElement("div");
      this._region.className = "toast-region";
      this._region.setAttribute("role", "status");
      this._region.setAttribute("aria-live", "polite");
      document.body.appendChild(this._region);
    }
    return this._region;
  },
  show(message, type = "info", ms = 3200) {
    const t = document.createElement("div");
    t.className = `toast ${type}`;
    t.textContent = message;
    t.setAttribute("role", type === "error" ? "alert" : "status");
    this.region().appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .2s"; setTimeout(() => t.remove(), 220); }, ms);
  },
  success(m) { this.show(m, "success"); },
  error(m) { this.show(m, "error", 4600); },
  info(m) { this.show(m, "info"); },
  event(title, message, href) {
    const t = document.createElement("div");
    t.className = "toast notification-toast";
    t.setAttribute("role", "status");
    const mark = document.createElement("span");
    mark.className = "toast-event-mark";
    mark.textContent = "✓";
    const copy = document.createElement("span");
    copy.className = "toast-event-copy";
    const strong = document.createElement("strong");
    strong.textContent = title;
    const small = document.createElement("small");
    small.textContent = message;
    copy.append(strong, small);
    t.append(mark, copy);
    if (href) {
      t.tabIndex = 0;
      t.addEventListener("click", () => { location.href = href; });
      t.addEventListener("keydown", e => { if (e.key === "Enter") location.href = href; });
    }
    this.region().appendChild(t);
    setTimeout(() => {
      t.style.opacity = "0";
      t.style.transform = "translateY(-8px)";
      setTimeout(() => t.remove(), 240);
    }, 6500);
  },
};

// Persistent, two-sided in-app notifications. A short poll keeps open customer
// and provider sessions in sync without requiring a page refresh.
const NotificationCenter = {
  _timer: null,
  _lastTopId: null,
  _disabled: false,
  _data: { unread_count: 0, notifications: [] },

  mount() {
    if (this._disabled) return;
    document.querySelector(".cn-notification-shell")?.remove();
    if (this._timer) clearInterval(this._timer);
    const shell = document.createElement("div");
    shell.className = "cn-notification-shell";
    shell.innerHTML = `
      <button class="cn-notification-bell" type="button" aria-label="Notifications" aria-expanded="false">
        ${icon("inbox")}
        <span class="cn-notification-count" hidden>0</span>
      </button>
      <section class="cn-notification-panel" aria-label="Notifications" hidden>
        <div class="cn-notification-head">
          <div><span class="page-kicker"><span></span> Live updates</span><h2>Notifications</h2></div>
          <button class="cn-notification-close" type="button" aria-label="Close notifications">×</button>
        </div>
        <button class="cn-mark-all" type="button">Mark all as read</button>
        <div class="cn-notification-list"><div class="cn-notification-empty">Checking for updates…</div></div>
      </section>`;
    document.body.appendChild(shell);

    const bell = shell.querySelector(".cn-notification-bell");
    const panel = shell.querySelector(".cn-notification-panel");
    const close = () => {
      panel.hidden = true;
      bell.setAttribute("aria-expanded", "false");
    };
    bell.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      bell.setAttribute("aria-expanded", panel.hidden ? "false" : "true");
      if (!panel.hidden) this.refresh(true);
    });
    shell.querySelector(".cn-notification-close").addEventListener("click", close);
    shell.querySelector(".cn-mark-all").addEventListener("click", async () => {
      try {
        await API.put("/api/notifications/read-all", {});
        await this.refresh(true);
      } catch (e) { Toast.error(e.message); }
    });

    this.refresh(true);
    this._timer = setInterval(() => this.refresh(false), 4500);
  },

  async refresh(silent = false) {
    if (this._disabled) return;
    try {
      const data = await API.get("/api/notifications", { retry: false });
      const latest = data.notifications[0];
      const isNew = this._lastTopId != null && latest && latest.id !== this._lastTopId && !latest.is_read;
      this._data = data;
      this.render();
      if (isNew && !silent) {
        Toast.event(latest.title, latest.message, this.href(latest));
        this.chime();
      }
      this._lastTopId = latest ? latest.id : null;
    } catch (e) {
      // If this deployment does not expose notification routes, stop polling
      // instead of hammering the server with a 404 every few seconds.
      if (e.status === 404) {
        this._disabled = true;
        if (this._timer) clearInterval(this._timer);
        this._timer = null;
        document.querySelector(".cn-notification-shell")?.remove();
      }
      // Notifications are an enhancement; the core booking flow remains usable.
    }
  },

  render() {
    const shell = document.querySelector(".cn-notification-shell");
    if (!shell) return;
    const badge = shell.querySelector(".cn-notification-count");
    badge.textContent = this._data.unread_count > 9 ? "9+" : String(this._data.unread_count);
    badge.hidden = this._data.unread_count === 0;
    const list = shell.querySelector(".cn-notification-list");
    if (!this._data.notifications.length) {
      list.innerHTML = `<div class="cn-notification-empty">You're all caught up.<small>Booking updates will appear here automatically.</small></div>`;
      return;
    }
    list.innerHTML = this._data.notifications.map(n => `
      <button type="button" class="cn-notification-item ${n.is_read ? "" : "unread"}" data-notification-id="${n.id}">
        <span class="cn-notification-icon">${this.symbol(n.kind)}</span>
        <span class="cn-notification-copy"><strong>${esc(n.title)}</strong><span>${esc(n.message)}</span><small>${this.timeAgo(n.created_at)}</small></span>
        ${n.is_read ? "" : `<i aria-label="Unread"></i>`}
      </button>`).join("");
    list.querySelectorAll("[data-notification-id]").forEach(button => {
      button.addEventListener("click", async () => {
        const n = this._data.notifications.find(row => row.id == button.dataset.notificationId);
        if (!n) return;
        if (!n.is_read) {
          try { await API.put(`/api/notifications/${n.id}/read`, {}); } catch (e) {}
        }
        const href = this.href(n);
        if (href) location.href = href;
      });
    });
  },

  href(notification) {
    if (!notification.booking_id) return null;
    return `/booking/${notification.booking_id}`;
  },

  symbol(kind) {
    if (kind === "new_request") return "+";
    if (kind.includes("accepted") || kind.includes("completed")) return "✓";
    if (kind.includes("cancel") || kind.includes("reject")) return "!";
    if (kind.includes("review")) return "★";
    return "↗";
  },

  timeAgo(value) {
    const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
    if (seconds < 60) return "Just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  },

  chime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const gain = ctx.createGain();
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(720, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(980, ctx.currentTime + .12);
      gain.gain.setValueAtTime(.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(.055, ctx.currentTime + .02);
      gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + .22);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + .23);
      setTimeout(() => ctx.close(), 350);
    } catch (e) {}
  },
};

// Role-based redirect helper.
function requireRole(...roles) {
  if (!Auth.isAuthenticated()) { location.href = "/login"; return false; }
  if (!roles.includes(Auth.role())) { location.href = roleHome(Auth.role()); return false; }
  return true;
}

function roleHome(role) {
  return role === "provider" ? "/provider-home" : "/home";
}

function initials(name) {
  if (!name) return "?";
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
}
