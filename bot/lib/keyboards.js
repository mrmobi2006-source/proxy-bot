const { Markup } = require("telegraf");

function s(btn, style) { return style ? { ...btn, style } : btn; }

const pIcon = p => p === "vless" ? "🟣" : p === "vmess" ? "🔵" : p === "ssh" ? "🟢" : "▪️";

function mainMenu(isAdmin) {
  const rows = [
    [s(Markup.button.callback("➕  إنشاء سيرفر جديد", "menu:new"), "success")],
    [
      s(Markup.button.callback("📋  سيرفراتي",  "menu:my_servers"), "primary"),
      s(Markup.button.callback("💎  اشتراكي",   "menu:premium"),    "primary"),
    ],
  ];
  if (isAdmin) rows.push([Markup.button.callback("⚙️  لوحة الإدارة", "menu:admin")]);
  return Markup.inlineKeyboard(rows);
}

function back(target) {
  return Markup.inlineKeyboard([[Markup.button.callback("⬅️  رجوع", target)]]);
}

function protocolMenu() {
  return Markup.inlineKeyboard([
    [s(Markup.button.callback("🟣  VLESS  (WebSocket + TLS)", "new:vless"), "primary")],
    [s(Markup.button.callback("🔵  VMess  (WebSocket + TLS)", "new:vmess"), "primary")],
    [s(Markup.button.callback("🟢  SSH  (TCP Tunnel)",         "new:ssh"),  "primary")],
    [Markup.button.callback("⬅️  رجوع", "menu:main")],
  ]);
}

function confirmCreate(protocol) {
  return Markup.inlineKeyboard([
    [s(Markup.button.callback("✅  إنشاء الآن", `confirm_create:${protocol}`), "success")],
    [s(Markup.button.callback("❌  إلغاء",       "menu:main"),                  "danger")],
  ]);
}

function serversList(servers, adminView = false, backTarget = "menu:my_servers") {
  const rows = servers.map(r => [
    Markup.button.callback(
      `${pIcon(r.protocol)}  #${r.id}  ${r.country}  —  ${r.expiresAt.split("T")[0]}`,
      adminView ? `admin_server:${r.id}` : `server:${r.id}`
    ),
  ]);
  rows.push([Markup.button.callback("⬅️  رجوع", backTarget)]);
  return Markup.inlineKeyboard(rows);
}

function serverDetail(id, protocol, canEdit, adminView) {
  const rows = [
    [
      Markup.button.callback("📋  نسخ الكونفيغ", `copy:${id}`),
      Markup.button.callback("📊  الاستهلاك",    `stats:${id}`),
    ],
  ];
  if (canEdit)   rows.push([s(Markup.button.callback("✏️  تعديل السيرفر", `edit:${id}`),   "primary")]);
  if (adminView) rows.push([s(Markup.button.callback("🗑️  حذف السيرفر",  `delete:${id}`), "danger")]);
  rows.push([Markup.button.callback("⬅️  رجوع", adminView ? "admin:all_servers" : "menu:my_servers")]);
  return Markup.inlineKeyboard(rows);
}

function confirmDelete(id) {
  return Markup.inlineKeyboard([
    [s(Markup.button.callback("🗑️  نعم، احذف نهائيًا", `confirm_delete:${id}`), "danger")],
    [Markup.button.callback("❌  إلغاء", "menu:admin")],
  ]);
}

function confirmEditXray(id) {
  return Markup.inlineKeyboard([
    [s(Markup.button.callback("🔄  تجديد UUID الآن", `confirm_edit_xray:${id}`), "primary")],
    [Markup.button.callback("❌  إلغاء", `server:${id}`)],
  ]);
}

function confirmEditSsh(id) {
  return Markup.inlineKeyboard([
    [s(Markup.button.callback("✅  تأكيد التعديل", `confirm_edit_ssh:${id}`), "success")],
    [s(Markup.button.callback("❌  إلغاء",           `server:${id}`),          "danger")],
  ]);
}

function premiumMenu(active, until) {
  const statusLine = active ? `✅  مفعّل حتى  ${until}` : "❌  غير مفعّل";
  const keyboard = Markup.inlineKeyboard([
    [s(Markup.button.callback("3  أيام",  "premium_req:3"),  "primary")],
    [s(Markup.button.callback("7  أيام",  "premium_req:7"),  "primary")],
    [s(Markup.button.callback("30  يوم",  "premium_req:30"), "success")],
    [Markup.button.callback("⬅️  رجوع", "menu:main")],
  ]);
  return { statusLine, keyboard };
}

function adminMenu(totalUsers, totalServers) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(`👥  المستخدمون  (${totalUsers})`,     "admin:users")],
    [Markup.button.callback(`📋  كل السيرفرات  (${totalServers})`, "admin:all_servers")],
    [Markup.button.callback("📊  الإحصائيات",                      "admin:stats")],
    [s(Markup.button.callback("💣  حذف كل السيرفرات",              "admin:nuke"), "danger")],
    [Markup.button.callback("⬅️  رجوع", "menu:main")],
  ]);
}

function usersList(users, page, perPage) {
  const start = page * perPage;
  const slice = users.slice(start, start + perPage);
  const rows  = slice.map(u => [
    Markup.button.callback(
      u.username ? `@${u.username}` : `ID: ${u.telegramUserId}`,
      `user_view:${u.telegramUserId}`
    ),
  ]);
  const nav = [];
  if (page > 0)                       nav.push(Markup.button.callback("◀️  السابق", `users_page:${page - 1}`));
  if (start + perPage < users.length) nav.push(Markup.button.callback("التالي  ▶️", `users_page:${page + 1}`));
  if (nav.length) rows.push(nav);
  rows.push([Markup.button.callback("⬅️  رجوع", "menu:admin")]);
  return Markup.inlineKeyboard(rows);
}

function userManage(userId, isPremium, isBanned) {
  const rows = [
    [Markup.button.callback("🖥️  سيرفراته", `user_servers:${userId}`)],
    [s(Markup.button.callback("💎  منح بريميوم", `grant_menu:${userId}`), "success")],
  ];
  if (isPremium) rows.push([s(Markup.button.callback("❌  إلغاء البريميوم", `revoke_premium:${userId}`), "danger")]);
  rows.push([
    isBanned
      ? s(Markup.button.callback("✅  رفع الحظر", `unban:${userId}`), "success")
      : s(Markup.button.callback("🚫  حظر",        `ban:${userId}`),   "danger"),
  ]);
  rows.push([Markup.button.callback("⬅️  رجوع", "admin:users")]);
  return Markup.inlineKeyboard(rows);
}

function grantDurations(userId) {
  return Markup.inlineKeyboard([
    [s(Markup.button.callback("3  أيام",  `do_grant:${userId}:3`),  "primary")],
    [s(Markup.button.callback("7  أيام",  `do_grant:${userId}:7`),  "primary")],
    [s(Markup.button.callback("30  يوم",  `do_grant:${userId}:30`), "success")],
    [s(Markup.button.callback("90  يوم",  `do_grant:${userId}:90`), "success")],
    [Markup.button.callback("⬅️  رجوع", `user_view:${userId}`)],
  ]);
}

function adminGrantButtons(userId, days) {
  return Markup.inlineKeyboard([
    [s(Markup.button.callback(`✅  منح  ${days}  أيام`, `quick_grant:${userId}:${days}`), "success")],
    [Markup.button.callback("❌  تجاهل الطلب", "menu:admin")],
  ]);
}

function confirmNuke() {
  return Markup.inlineKeyboard([
    [s(Markup.button.callback("💣  نعم، احذف كل شيء نهائيًا", "confirm_nuke"), "danger")],
    [Markup.button.callback("❌  إلغاء", "menu:admin")],
  ]);
}

module.exports = {
  mainMenu, back, protocolMenu, confirmCreate, serversList, serverDetail,
  confirmDelete, confirmEditXray, confirmEditSsh, premiumMenu, adminMenu,
  usersList, userManage, grantDurations, adminGrantButtons, confirmNuke, pIcon,
};
