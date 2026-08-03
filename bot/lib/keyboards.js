const { Markup } = require("telegraf");

function styled(button, style) {
  return style ? { ...button, style } : button;
}

function mainMenu(isAdmin) {
  const rows = [
    [styled(Markup.button.callback("🆕 إنشاء سيرفر", "menu:new"), "success")],
    [styled(Markup.button.callback("📋 سيرفراتي", "menu:my_servers"), "primary")],
    [styled(Markup.button.callback("💎 البريميوم", "menu:premium"), "primary")],
  ];
  if (isAdmin) {
    rows.push([styled(Markup.button.callback("⚙️ التحكم", "menu:admin"), "danger")]);
  }
  return Markup.inlineKeyboard(rows);
}

function backButton() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("⬅️ عودة", "menu:main")],
  ]);
}

function protocolMenu() {
  return Markup.inlineKeyboard([
    [styled(Markup.button.callback("🔞 VLESS", "new:vless"), "primary")],
    [styled(Markup.button.callback("👁 VMess", "new:vmess"), "primary")],
    [styled(Markup.button.callback("📵 SSH", "new:ssh"), "primary")],
    [Markup.button.callback("⬅️ عودة", "menu:main")],
  ]);
}

function confirmMenu(protocol) {
  return Markup.inlineKeyboard([
    [styled(Markup.button.callback("✅ تأكيد", `confirm:${protocol}`), "success")],
    [styled(Markup.button.callback("❌ إلغاء", "menu:main"), "danger")],
  ]);
}

function myServersMenu(servers) {
  const rows = servers.map((s) => [
    Markup.button.callback(
      `${protocolIcon(s.protocol)} #${s.id} | ⏰ ${s.expiresAt.split("T")[0]}`,
      `server:${s.id}`
    ),
  ]);
  rows.push([Markup.button.callback("⬅️ عودة", "menu:main")]);
  return Markup.inlineKeyboard(rows);
}

function serverDetailMenu(serverId) {
  return Markup.inlineKeyboard([
    [styled(Markup.button.callback("📋 نسخ", `copy:${serverId}`), "primary")],
    [styled(Markup.button.callback("🗑️ حذف", `delete:${serverId}`), "danger")],
    [Markup.button.callback("⬅️ عودة", "menu:my_servers")],
  ]);
}

function premiumMenu() {
  return Markup.inlineKeyboard([
    [styled(Markup.button.callback("3️⃣ 3 أيام", "premium:3"), "primary")],
    [styled(Markup.button.callback("7️⃣ 7 أيام", "premium:7"), "primary")],
    [styled(Markup.button.callback("3️⃣0️⃣ 30 يوم", "premium:30"), "success")],
    [Markup.button.callback("⬅️ عودة", "menu:main")],
  ]);
}

function adminMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("📊 جميع السيرفرات", "admin:servers")],
    [Markup.button.callback("⬅️ عودة", "menu:main")],
  ]);
}

function adminServerDetailMenu(serverId) {
  return Markup.inlineKeyboard([
    [styled(Markup.button.callback("🗑️ حذف", `admin_delete:${serverId}`), "danger")],
    [Markup.button.callback("⬅️ عودة", "admin:servers")],
  ]);
}

function protocolIcon(protocol) {
  const icons = {
    vless: "🔞",
    vmess: "👁",
    ssh: "📵",
  };
  return icons[protocol] || "▪️";
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
