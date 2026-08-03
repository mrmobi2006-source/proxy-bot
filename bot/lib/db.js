const fs = require("fs");
const path = require("path");
const logger = require("./logger");

const DB_PATH = path.join(__dirname, "..", "data", "db.json");
const BACKUP_DIR = path.join(__dirname, "..", "data", "backups");

// إنشاء المجلدات المطلوبة
[path.dirname(DB_PATH), BACKUP_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger.info(`Created directory: ${dir}`);
  }
});

function load() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      const initialData = { servers: [], users: [], stats: { totalServers: 0, totalUsers: 0 } };
      fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2));
      logger.info("Created new database file");
      return initialData;
    }
    const data = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
    if (!data.users) data.users = [];
    if (!data.stats) data.stats = { totalServers: 0, totalUsers: 0 };
    return data;
  } catch (err) {
    logger.error("Database load error:", err.message);
    throw err;
  }
}

function save(data) {
  try {
    // إنشاء نسخة احتياطية
    if (fs.existsSync(DB_PATH)) {
      const backup = path.join(
        BACKUP_DIR,
        `db-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
      );
      fs.copyFileSync(DB_PATH, backup);
      
      // تنظيف النسخ القديمة (أكثر من 30 يوم)
      const backups = fs.readdirSync(BACKUP_DIR).sort().reverse();
      if (backups.length > 30) {
        fs.unlinkSync(path.join(BACKUP_DIR, backups[30]));
      }
    }
    
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    logger.error("Database save error:", err.message);
    throw err;
  }
}

function addServer(server) {
  const data = load();
  data.servers.push(server);
  data.stats.totalServers = data.servers.length;
  save(data);
  logger.info(`Server added: ${server.id}`);
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
  data.stats.totalServers = data.servers.length;
  save(data);
  logger.info(`Server removed: ${id}`);
}

function getExpiredServers() {
  const data = load();
  const now = Date.now();
  return data.servers.filter((s) => new Date(s.expiresAt).getTime() < now && s.status === "active");
}

function getUser(telegramUserId) {
  const data = load();
  let user = data.users.find((u) => u.telegramUserId === telegramUserId);
  if (!user) {
    user = {
      telegramUserId,
      premiumExpiresAt: null,
      createdAt: new Date().toISOString(),
      stats: { serversCreated: 0, totalSpent: 0 },
    };
    data.users.push(user);
    data.stats.totalUsers = data.users.length;
    save(data);
    logger.info(`New user registered: ${telegramUserId}`);
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
    user = {
      telegramUserId,
      premiumExpiresAt: newExpiry,
      createdAt: new Date().toISOString(),
      stats: { serversCreated: 0, totalSpent: 0 },
    };
    data.users.push(user);
    data.stats.totalUsers = data.users.length;
  }
  
  save(data);
  logger.info(`Premium granted to ${telegramUserId}: ${days} days until ${newExpiry}`);
  return user;
}

function getStats() {
  const data = load();
  return {
    totalServers: data.servers.length,
    totalUsers: data.users.length,
    activeServers: data.servers.filter((s) => s.status === "active").length,
    premiumUsers: data.users.filter((u) => u.premiumExpiresAt && new Date(u.premiumExpiresAt).getTime() > Date.now()).length,
  };
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
  getStats,
};
