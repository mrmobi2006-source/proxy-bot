const validateInput = {
  username: (username) => {
    if (!username) return false;
    if (username.length < 3 || username.length > 32) return false;
    return /^[a-zA-Z0-9_-]+$/.test(username);
  },

  password: (password) => {
    if (!password) return false;
    if (password.length < 6) return false;
    return true;
  },

  remark: (remark) => {
    if (!remark || remark.length === 0) return false;
    if (remark.length < 3 || remark.length > 32) return false;
    return true;
  },

  telegramId: (id) => {
    return /^\d{5,}$/.test(String(id));
  },

  days: (days) => {
    const d = parseInt(days, 10);
    return !isNaN(d) && d > 0 && d <= 3650;
  },
};

module.exports = { validateInput };
