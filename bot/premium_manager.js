const db = require('./lib/db');

function isAdmin(id) {
  return db.isAdmin(String(id));
}

function addAdmin(id) {
  db.addAdmin(String(id));
}

function removeAdmin(id) {
  db.removeAdmin(String(id));
}

function addPremium(id, meta = {}) {
  // grant a long-term premium (10 years) by default
  return db.importPremium([String(id)], 10, meta);
}

function removePremium(id) {
  // expire immediately
  return db.grantPremium(String(id), -1);
}

function isPremium(id) {
  return db.isPremiumActive(String(id));
}

function listPremium() {
  const data = require('fs').readFileSync(require('path').join(__dirname, '..', 'data', 'db.json'), 'utf8');
  const parsed = JSON.parse(data);
  return parsed.users || [];
}

module.exports = { isAdmin, addAdmin, removeAdmin, addPremium, removePremium, isPremium, listPremium };
