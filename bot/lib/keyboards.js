const { Markup } = require("telegraf");

// Bot API 9.4+ button colors: "primary" (blue), "success" (green), "danger" (red).
// Omit style entirely for the default gray look.
function styled(button, style) {
  return style ? { ...button, style } : button;
}

function mainMenu(isAdmin) {
  const rows = [
    [styled(Markup.button.callback("🆕 إنشاء سيرفر", "menu:new"), "success")],
    [styled(Markup.button.callback("📋 سيرفراتي", "menu:my_servers"), "primary")],
    [styled(Markup.button.callback("💎 الاشتراك المميز", "menu:premium"), "primary")],
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
    [styled(Markup.button.callback("🟣 VLESS", "new:vless"), "primary")],
    [styled(Markup.button.callback("🔵 VMess", "new:vmess"), "primary")],
    [styled(Markup.button.callback("🟢 SSH", "new:ssh"), "primary")],
    [Markup.button.callback("⬅️ رجوع", "menu:main")],
  ]);
}

function confirmMenu(protocol) {
  return Markup.inlineKeyboard([
    [styled(Markup.button.callback("✅ تأكيد الإنشاء", `confirm:${protocol}`), "success")],
    [styled(Markup.button.callback("❌ إلغاء", "menu:main"), "danger")],
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
    [styled(Markup.button.callback("🗑️ حذف هذا السيرفر", `delete:${serverId}`), "danger")],
    [Markup.button.callback("⬅️ رجوع", "menu:my_servers")],
  ]);
}

function premiumMenu() {
  return Markup.inlineKeyboard([
    [styled(Markup.button.callback("3 أيام", "premium:3"), "primary")],
    [styled(Markup.button.callback("7 أيام", "premium:7"), "primary")],
    [styled(Markup.button.callback("30 يوم", "premium:30"), "success")],
    [Markup.button.callback("⬅️ رجوع", "menu:main")],
  ]);
}

function adminMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("📊 all serv", "admin:servers")],
    [Markup.button.callback("⬅️ ", "menu:main")],
  ]);
}

function adminServerDetailMenu(serverId) {
  return Markup.inlineKeyboard([
    [styled(Markup.button.callback("🗑️ dlt", `admin_delete:${serverId}`), "danger")],
    [Markup.button.callback("⬅️ back", "admin:servers")],
  ]);
}

function protocolIcon(protocol) {
  if (protocol === "vless") return "🔞";
  if (protocol === "vmess") return "👁";
  if (protocol === "ssh") return "📵";
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
