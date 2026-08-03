const { Markup } = require("telegraf");

// Bot API 9.4+ button colors: "primary" (blue), "success" (green), "danger" (red).
// Omit style entirely for the default gray look.
function styled(button, style) {
  return style ? { ...button, style } : button;
}

function mainMenu(isAdmin) {
  const rows = [
    [styled(Markup.button.callback("🆕 creat serv", "menu:new"), "success")],
    [styled(Markup.button.callback("📋 my serv", "menu:my_servers"), "primary")],
    [styled(Markup.button.callback("💎 premium", "menu:premium"), "primary")],
  ];
  if (isAdmin) {
    rows.push([Markup.button.callback("⚙️ admin panel", "menu:admin")]);
  }
  return Markup.inlineKeyboard(rows);
}

function backButton() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("⬅️ back", "menu:main")],
  ]);
}

function protocolMenu() {
  return Markup.inlineKeyboard([
    [styled(Markup.button.callback("🔞 VLESS", "new:vless"), "primary")],
    [styled(Markup.button.callback("👁 VMess", "new:vmess"), "primary")],
    [styled(Markup.button.callback("📵 SSH", "new:ssh"), "primary")],
    [Markup.button.callback("⬅️ back", "menu:main")],
  ]);
}

function confirmMenu(protocol) {
  return Markup.inlineKeyboard([
    [styled(Markup.button.callback("✅ Confirmation", `confirm:${protocol}`), "success")],
    [styled(Markup.button.callback("❌ Cancel", "menu:main"), "danger")],
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
    [styled(Markup.button.callback("3 day", "premium:3"), "primary")],
    [styled(Markup.button.callback("7 day", "premium:7"), "primary")],
    [styled(Markup.button.callback("30 day", "premium:30"), "success")],
    [Markup.button.callback("⬅️ back", "menu:main")],
  ]);
}

function adminMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("📊 all serv", "admin:servers")],
    [Markup.button.callback("⬅️ back", "menu:main")],
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
