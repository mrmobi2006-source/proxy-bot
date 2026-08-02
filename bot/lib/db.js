const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "data", "db.json");

function load() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(
      DB_PATH,
      JSON.stringify({ servers: [], users: [] }, null, 2)
    );
  }
  const data = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
  if (!data.users) data.users = []; // migrate older db.json files
  return data;
}

function save(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// ---- Servers ----

function addServer(server) {
  const data = load();
  data.servers.push(server);
  save(data);
  return server;
}

function getServersByUser(telegramUserId) {
  const data = load();
  return data.servers.filter((s) => s.telegramUserId === telegramUserId);
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

// ---- Users / premium subscriptions ----

function getUser(telegramUserId) {
  const data = load();
  let user = data.users.find((u) => u.telegramUserId === telegramUserId);
  if (!user) {
    user = { telegramUserId, premiumExpiresAt: null };
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
  let user = data.users.find((u) => u.telegramUserId === telegramUserId);
  const now = Date.now();
  const base =
    user && user.premiumExpiresAt && new Date(user.premiumExpiresAt).getTime() > now
      ? new Date(user.premiumExpiresAt).getTime()
      : now;
  const newExpiry = new Date(base + days * 24 * 60 * 60 * 1000).toISOString();

  if (user) {
    user.premiumExpiresAt = newExpiry;
  } else {
    user = { telegramUserId, premiumExpiresAt: newExpiry };
    data.users.push(user);
  }
  save(data);
  return user;
}

module.exports = {
  addServer,
  getServersByUser,
  getActiveServersByUser,
  getAllServers,
  getServer,
  removeServer,
  getExpiredServers,
  getUser,
  isPremiumActive,
  grantPremium,
};
