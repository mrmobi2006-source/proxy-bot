const fs = require("fs");
const path = require("path");
const DB_PATH = path.join(__dirname, "..", "data", "db.json");

function load() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ servers: [], users: [] }, null, 2));
  }
  const d = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
  if (!d.users) d.users = [];
  return d;
}
function save(d) { fs.writeFileSync(DB_PATH, JSON.stringify(d, null, 2)); }

function touchUser(telegramUserId, username) {
  const d = load();
  let u = d.users.find(x => x.telegramUserId === telegramUserId);
  if (!u) {
    u = { telegramUserId, username: username || null, premiumExpiresAt: null, banned: false, firstSeen: new Date().toISOString(), dailyCreated: {} };
    d.users.push(u);
  } else if (username) { u.username = username; }
  save(d); return u;
}
function getAllUsers() { return load().users; }
function getUser(telegramUserId) {
  const d = load();
  let u = d.users.find(x => x.telegramUserId === telegramUserId);
  if (!u) { u = { telegramUserId, username: null, premiumExpiresAt: null, banned: false, firstSeen: new Date().toISOString(), dailyCreated: {} }; d.users.push(u); save(d); }
  return u;
}
function isPremiumActive(id) {
  const u = getUser(id);
  return !!u.premiumExpiresAt && new Date(u.premiumExpiresAt).getTime() > Date.now();
}
function grantPremium(id, days) {
  const d = load();
  let u = d.users.find(x => x.telegramUserId === id);
  const now = Date.now();
  const base = u?.premiumExpiresAt && new Date(u.premiumExpiresAt).getTime() > now
    ? new Date(u.premiumExpiresAt).getTime() : now;
  const exp = new Date(base + days * 86400000).toISOString();
  if (u) { u.premiumExpiresAt = exp; }
  else { u = { telegramUserId: id, username: null, premiumExpiresAt: exp, banned: false, firstSeen: new Date().toISOString(), dailyCreated: {} }; d.users.push(u); }
  save(d); return u;
}
function revokePremium(id) {
  const d = load();
  const u = d.users.find(x => x.telegramUserId === id);
  if (u) { u.premiumExpiresAt = null; save(d); }
}
function isBanned(id) { return !!getUser(id).banned; }
function banUser(id) {
  const d = load();
  let u = d.users.find(x => x.telegramUserId === id);
  if (!u) { u = { telegramUserId: id, username: null, premiumExpiresAt: null, banned: true, firstSeen: new Date().toISOString(), dailyCreated: {} }; d.users.push(u); }
  else { u.banned = true; }
  save(d);
}
function unbanUser(id) {
  const d = load(); const u = d.users.find(x => x.telegramUserId === id);
  if (u) { u.banned = false; save(d); }
}
function canCreateToday(id) {
  const u = getUser(id);
  const today = new Date().toISOString().split("T")[0];
  return (u.dailyCreated?.[today] || 0) < 1;
}
function recordCreatedToday(id) {
  const d = load(); const u = d.users.find(x => x.telegramUserId === id);
  if (!u) return;
  const today = new Date().toISOString().split("T")[0];
  if (!u.dailyCreated) u.dailyCreated = {};
  u.dailyCreated[today] = (u.dailyCreated[today] || 0) + 1;
  save(d);
}
function addServer(s) { const d = load(); d.servers.push(s); save(d); return s; }
function getAllServers() { return load().servers; }
function getServer(id) { return load().servers.find(s => s.id === id); }
function getServersByUser(uid) { return load().servers.filter(s => s.telegramUserId === uid); }
function getActiveServersByUser(uid) { return getServersByUser(uid).filter(s => s.status === "active"); }
function removeServer(id) { const d = load(); d.servers = d.servers.filter(s => s.id !== id); save(d); }
function getExpiredServers() {
  const n = Date.now();
  return load().servers.filter(s => s.status === "active" && new Date(s.expiresAt).getTime() < n);
}
function updateServer(id, changes) {
  const d = load(); const s = d.servers.find(x => x.id === id);
  if (s) { Object.assign(s, changes); save(d); }
  return getServer(id);
}
function updateServerUsage(id, dataUp, dataDown) { updateServer(id, { dataUp, dataDown }); }

module.exports = {
  touchUser, getAllUsers, getUser, isPremiumActive, grantPremium, revokePremium,
  isBanned, banUser, unbanUser, canCreateToday, recordCreatedToday,
  addServer, getAllServers, getServer, getServersByUser, getActiveServersByUser,
  removeServer, getExpiredServers, updateServer, updateServerUsage,
};
