/**
 * Minimal JSON-file datastore. Good enough to start; swap for
 * Postgres/SQLite once you have real volume (Railway offers a
 * managed Postgres plugin you can add with one click).
 *
 * Shape:
 * {
 *   "servers": [
 *     {
 *       id, telegramUserId, protocol, serviceId, domain,
 *       uuid, wsPath, port, createdAt, expiresAt, status
 *     }
 *   ]
 * }
 */

const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "data", "db.json");

function load() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ servers: [] }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
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
  return data.servers.filter((s) => s.telegramUserId === telegramUserId);
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

module.exports = {
  addServer,
  getServersByUser,
  getServer,
  removeServer,
  getExpiredServers,
};
