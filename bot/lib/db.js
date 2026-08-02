const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "data", "db.json");

function load() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ servers: [], users: [], admins: [] }, null, 2));
  }
  const data = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
  if (!data.users) data.users = [];
  if (!data.admins) data.admins = [];
  if (!data.servers) data.servers = [];
  return data;
}

function save(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function addServer(server) {
  const data = load();
  data.servers.push(server);
  save(data);
  return server;
}

function getServersByUser(telegramUserId) {
  const data = load();
  return data.servers.filter((s) => String(s.telegramUserId) === String(telegramUserId));
}

function getActiveServersByUser(telegramUserId) {
  return getServersByUser(telegramUserId).filter((s) => s.status === "active");
}

function getAllServers() {
  return load().servers;
}

function getServer(id) {
  const data = load();
  return data.servers.find((s) => s.id === id);
}

function removeServer(id) {
  const data = load();
  data.servers = data.servers.filter((s) => s.id !== id);
  save(data);
}

function getExpiredServers() {
  const data = load();
  const now = Date.now();
  return data.servers.filter((s) => new Date(s.expiresAt).getTime() < now);
}

function getPendingServers() {
  const data = load();
  return data.servers.filter((s) => s.status && String(s.status).startsWith("pending"));
}

function setServerStatus(id, status, updates = {}) {
  const data = load();
  const s = data.servers.find((x) => x.id === id);
  if (!s) return null;
  s.status = status;
  Object.assign(s, updates);
  save(data);
  return s;
}

function getUser(telegramUserId) {
  const data = load();
  let user = data.users.find((u) => String(u.telegramUserId) === String(telegramUserId));
  if (!user) {
    user = { telegramUserId: String(telegramUserId), premiumExpiresAt: null };
    data.users.push(user);
    save(data);
  }
  return user;
}

function isPremiumActive(telegramUserId) {
  const user = getUser(telegramUserId);
  if (!user.premiumExpiresAt) return false;
  return new Date(user.premiumExpiresAt).getTime() > Date.now();
}

function grantPremium(telegramUserId, days) {
  const data = load();
  let user = data.users.find((u) => String(u.telegramUserId) === String(telegramUserId));
  const now = Date.now();
  const base =
    user && user.premiumExpiresAt && new Date(user.premiumExpiresAt).getTime() > now
      ? new Date(user.premiumExpiresAt).getTime()
      : now;
  const newExpiry = new Date(base + days * 24 * 60 * 60 * 1000).toISOString();

  if (user) {
    user.premiumExpiresAt = newExpiry;
  } else {
    user = { telegramUserId: String(telegramUserId), premiumExpiresAt: newExpiry };
    data.users.push(user);
  }
  save(data);
  return user;
}

function importPremium(ids = [], years = 10, meta = {}) {
  const data = load();
  const expiry = new Date(Date.now() + years * 365 * 24 * 60 * 60 * 1000).toISOString();
  for (const raw of ids) {
    const telegramUserId = String(raw).trim();
    let user = data.users.find((u) => String(u.telegramUserId) === telegramUserId);
    if (user) {
      user.premiumExpiresAt = expiry;
      user.imported = true;
      Object.assign(user, meta);
    } else {
      user = { telegramUserId, premiumExpiresAt: expiry, imported: true, ...meta };
      data.users.push(user);
    }
  }
  save(data);
  return ids.length;
}

function addAdmin(id) {
  const data = load();
  const sid = String(id);
  if (!data.admins.includes(sid)) data.admins.push(sid);
  save(data);
}

function removeAdmin(id) {
  const data = load();
  const sid = String(id);
  data.admins = data.admins.filter((a) => a !== sid);
  save(data);
}

function isAdmin(telegramUserId) {
  const data = load();
  return data.admins.includes(String(telegramUserId));
}

module.exports = {
  addServer,
  getServersByUser,
  getActiveServersByUser,
  getAllServers,
  getServer,
  removeServer,
  getExpiredServers,
  getPendingServers,
  setServerStatus,
  getUser,
  isPremiumActive,
  grantPremium,
  importPremium,
  addAdmin,
  removeAdmin,
  isAdmin,
};
