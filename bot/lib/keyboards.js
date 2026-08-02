const { Markup } = require("telegraf");

function mainMenu(isAdmin) {
  const rows = [
    [Markup.button.callback("🆕 إنشاء سيرفر", "menu:new")],
    [Markup.button.callback("📋 سيرفراتي", "menu:my_servers")],
    [Markup.button.callback("💎 الاشتراك المميز", "menu:premium")],
  ];
  if (isAdmin) {
    rows.push([Markup.button.callback("⚙️ لوحة الإدارة", "menu:admin")]);
  }
  return Markup.inlineKeyboard(rows);
}

function backButton() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("⬅️ رجوع", "menu:main")],
  ]);
}

function protocolMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🟣 VLESS", "new:vless")],
    [Markup.button.callback("🔵 VMess", "new:vmess")],
    [Markup.button.callback("🟢 SSH", "new:ssh")],
    [Markup.button.callback("⬅️ رجوع", "menu:main")],
  ]);
}

function confirmMenu(protocol) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("✅ تأكيد الإنشاء", `confirm:${protocol}`)],
    [Markup.button.callback("❌ إلغاء", "menu:main")],
  ]);
}

function myServersMenu(servers) {
  const rows = servers.map((s) => [
    Markup.button.callback(
      `${protocolIcon(s.protocol)} #${s.id} - ${s.expiresAt.split("T")[0]}`,
      `server:${s.id}`
    ),
  ]);
  rows.push([Markup.button.callback("⬅️ رجوع", "menu:main")]);
  return Markup.inlineKeyboard(rows);
}

function serverDetailMenu(serverId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🗑️ حذف هذا السيرفر", `delete:${serverId}`)],
    [Markup.button.callback("⬅️ رجوع", "menu:my_servers")],
  ]);
}

function premiumMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("3 أيام", "premium:3")],
    [Markup.button.callback("7 أيام", "premium:7")],
    [Markup.button.callback("30 يوم", "premium:30")],
    [Markup.button.callback("⬅️ رجوع", "menu:main")],
  ]);
}

function adminMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("📊 كل السيرفرات", "admin:servers")],
    [Markup.button.callback("⬅️ رجوع", "menu:main")],
  ]);
}

function adminServerDetailMenu(serverId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🗑️ حذف", `admin_delete:${serverId}`)],
    [Markup.button.callback("⬅️ رجوع", "admin:servers")],
  ]);
}

function protocolIcon(protocol) {
  if (protocol === "vless") return "🟣";
  if (protocol === "vmess") return "🔵";
  if (protocol === "ssh") return "🟢";
  return "▪️";
}

module.exports = {
  mainMenu,
  backButton,
  protocolMenu,
  confirmMenu,
  myServersMenu,
  serverDetailMenu,
  premiumMenu,
  adminMenu,
  adminServerDetailMenu,
  protocolIcon,
};
