const { Markup } = require("telegraf");

// Bot API 9.4+ button colors: some implementations accept style names (primary, success, danger).
// We'll use 'purple' and 'danger' where available (Telegram 2026 supports more colors). Fallback to emoji labels.
function styled(button, style) {
  // If style is falsy, return the button as-is.
  if (!style) return button;
  // Some Telegraf implementations accept an object with style; attach if possible.
  try {
    return { ...button, style };
  } catch (e) {
    return button;
  }
}

function mainMenu(isAdmin) {
  const rows = [
    [styled(Markup.button.callback("🆕 إنشاء سيرفر", "menu:new"), "purple")],
    [styled(Markup.button.callback("📋 سيرفراتي", "menu:my_servers"), "purple")],
    [styled(Markup.button.callback("💎 الاشتراك المميز", "menu:premium"), "purple")],
  ];
  if (isAdmin) {
    rows.push([Markup.button.callback("⚙️ لوحة الإدارة", "menu:admin")]);
  }
  return Markup.inlineKeyboard(rows);
}

function backButton() {
  return Markup.inlineKeyboard([[Markup.button.callback("⬅️ رجوع", "menu:main")]]);
}

function protocolMenu() {
  return Markup.inlineKeyboard([
    [styled(Markup.button.callback("🟣 VLESS", "new:vless"), "purple")],
    [styled(Markup.button.callback("🔵 VMess", "new:vmess"), "purple")],
    [styled(Markup.button.callback("🟢 SSH", "new:ssh"), "purple")],
    [Markup.button.callback("⬅️ رجوع", "menu:main")],
  ]);
}

function confirmMenu(protocol) {
  return Markup.inlineKeyboard([
    [styled(Markup.button.callback("✅ تأكيد الإنشاء", `confirm:${protocol}`), "purple")],
    [styled(Markup.button.callback("❌ إلغاء", "menu:main"), "danger")],
  ]);
}

function myServersMenu(servers) {
  const rows = servers.map((s) => [
    Markup.button.callback(`${protocolIcon(s.protocol)} #${s.id} - ${s.expiresAt.split("T")[0]}`, `server:${s.id}`),
  ]);
  rows.push([Markup.button.callback("⬅️ رجوع", "menu:main")]);
  return Markup.inlineKeyboard(rows);
}

function serverDetailMenu(serverId) {
  return Markup.inlineKeyboard([
    [styled(Markup.button.callback("🗑️ حذف هذا السيرفر", `delete:${serverId}`), "danger")],
    [Markup.button.callback("⬅️ رجوع", "menu:my_servers")],
  ]);
}

function premiumMenu() {
  return Markup.inlineKeyboard([
    [styled(Markup.button.callback("3 أيام", "premium:3"), "purple")],
    [styled(Markup.button.callback("7 أيام", "premium:7"), "purple")],
    [styled(Markup.button.callback("30 يوم", "premium:30"), "purple")],
    [Markup.button.callback("⬅️ رجوع", "menu:main")],
  ]);
}

function adminMenu() {
  return Markup.inlineKeyboard([[Markup.button.callback("📊 كل السيرفرات", "admin:servers")], [Markup.button.callback("⬅️ رجوع", "menu:main")]]);
}

function adminServerDetailMenu(serverId) {
  return Markup.inlineKeyboard([
    [styled(Markup.button.callback("🗑️ حذف", `admin_delete:${serverId}`), "danger")],
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
