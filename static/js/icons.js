// JobHustle icon helper — a small inline SVG icon set.
// Each name maps to a 24x24 stroke icon with accessible label via aria-hidden
// (decorative) or title (meaningful where needed).
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  book: '<path d="M4 4h13a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2Z"/><path d="M6 4a2 2 0 0 0-2 2v14"/>',
  inbox: '<path d="M4 13h5l2 3h3l2-3h5"/><path d="M4 5h16a1 1 0 0 1 1 1v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1Z"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5Z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  settings: '<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  star: '<path d="m12 2 2.9 6.3 6.9.8-5 4.6 1.4 6.8L12 17.3 5.8 20.5l1.4-6.8-5-4.6 6.9-.8Z"/>',
  map: '<path d="M9 17 3 21V7l6-4 6 4 6-4v14l-6 4-6-4Z"/><path d="M9 3v14M15 7v14"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/>',
  chat: '<path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 1 1 18 0Z"/>',
  check: '<path d="m5 13 4 4L19 7"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>',
  // Marketplace category icons (line style)
  homeInt: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/><path d="m8.5 7 1-2.2-.3-2.1M10.5 8l.6-2.4-.5-2"/>',
  bolt: '<path d="M13 3 4 14h6l-1 7 9-11h-6l1-7Z"/>',
  leaf: '<path d="M11 20A7 7 0 0 1 4 14c0-5 3-8 8-9 4-1 7 0 8 2 .4 2-.4 6-3 8-1.8 1.4-4 1-6-1-1-1.4-1-3.5 1-5"/>',
  wrench: '<path d="M14.7 6.3a4.5 4.5 0 0 0-6 5.4L3 17.4 6.6 21l5.7-5.7a4.5 4.5 0 0 0 5.4-6l-2.9 2.9-2.9-2.9 2.8-2.9Z"/>',
  droplet: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z"/>',
  sparkles: '<path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6Z"/><path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8Z"/>',
  toolbox: '<path d="M9 20V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v15"/><path d="M3 9h18v11H3z"/><path d="M13 13v2h2"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5Z"/>',
};

function icon(name, cls = "") {
  if (!ICONS[name]) return "";
  return `<svg class="ico ${cls}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}
