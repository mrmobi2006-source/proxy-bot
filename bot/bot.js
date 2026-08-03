require("dotenv").config();
const { Telegraf } = require("telegraf");
const { randomUUID, randomBytes } = require("crypto");
const dns = require("dns").promises;
const cron = require("node-cron");

const { SshManagerClient } = require("./lib/sshManager");
const { XrayManagerClient } = require("./lib/xrayManager");
const { withPremiumEmoji } = require("./lib/premiumEmoji");
const kb = require("./lib/keyboards");
const db = require("./lib/db");
const logger = require("./lib/logger");
const { validateInput } = require("./lib/validator");

const {
  BOT_TOKEN,
  ADMIN_TELEGRAM_IDS = "6154678499",
  ADMIN_CONTACT_USERNAME = "xtt1x",
  CHANNEL_URL = "https://t.me/xtt10x",
  SSH_SHARED_INTERNAL_HOST,
  SSH_API_SECRET,
  SSH_PUBLIC_HOST,
  SSH_PUBLIC_PORT,
  XRAY_SHARED_INTERNAL_HOST,
  XRAY_API_SECRET,
  XRAY_VLESS_PUBLIC_HOST,
  XRAY_VMESS_PUBLIC_HOST,
  FREE_TRIAL_DAYS = "1",
  MAX_SERVERS_FREE = "1",
  MAX_SERVERS_PREMIUM = "10",
} = process.env;

if (!BOT_TOKEN) throw new Error("BOT_TOKEN is required in .env");

const adminIds = ADMIN_TELEGRAM_IDS.split(",").map((s) => s.trim()).filter(Boolean);
const isAdmin = (id) => adminIds.includes(String(id));

const sshManager =
  SSH_SHARED_INTERNAL_HOST && SSH_API_SECRET
    ? new SshManagerClient(SSH_SHARED_INTERNAL_HOST, SSH_API_SECRET)
    : null;

const xrayManager =
  XRAY_SHARED_INTERNAL_HOST && XRAY_API_SECRET
    ? new XrayManagerClient(XRAY_SHARED_INTERNAL_HOST, XRAY_API_SECRET)
    : null;

const bot = new Telegraf(BOT_TOKEN);
const sessions = new Map();

// ✅ تحسين العلامة التجارية
const BRAND_FOOTER =
  "\n\n➖➖➖➖➖➖➖➖➖➖\n" +
  "© MUSLIM BOT 2026 | v2.0\n" +
  `📢 القناة: ${CHANNEL_URL}\n` +
  `👤 المشرف: @${ADMIN_CONTACT_USERNAME}`;

function shortId() {
  return randomBytes(4).toString("hex");
}

function daysUntil(iso) {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
}

function computeTtlDays(telegramUserId) {
  const user = db.getUser(telegramUserId);
  if (db.isPremiumActive(telegramUserId)) {
    return daysUntil(user.premiumExpiresAt);
  }
  return parseInt(FREE_TRIAL_DAYS, 10);
}

function expiresAtFromDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

// ✅ تحسين الحد الأقصى للسيرفرات
function canCreateServer(telegramUserId) {
  const premium = db.isPremiumActive(telegramUserId);
  const maxServers = premium ? parseInt(MAX_SERVERS_PREMIUM, 10) : parseInt(MAX_SERVERS_FREE, 10);
  
  const active = db.getActiveServersByUser(telegramUserId);
  if (active.length >= maxServers) {
    const msg = premium
      ? `وصلت للحد الأقصى من السيرفرات (${maxServers}).`
      : `الخطة المجانية تسمح بـ ${MAX_SERVERS_FREE} سيرفر فقط. ترقّ للبريميوم للمزيد.`;
    return { ok: false, reason: msg };
  }
  return { ok: true };
}

function sanitizeHandle(text) {
  return (text || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
}

async function resolveIp(hostname) {
  try {
    const { address } = await dns.lookup(hostname, { family: 4 });
    return address;
  } catch (err) {
    logger.error(`DNS lookup failed for ${hostname}:`, err.message);
    return hostname;
  }
}

// ✅ تحسين معالجة الأخطاء
async function provisionSsh(telegramUserId, username, password) {
  if (!sshManager) throw new Error("❌ خدمة SSH غير مُعدة من طرف المشرف");

  const existing = db
    .getAllServers()
    .find((s) => s.protocol === "ssh" && s.status === "active" && s.username === username);
  if (existing) throw new Error("❌ اسم المستخدم هذا محجوز فعلاً");

  try {
    await sshManager.createUser(username, password);
  } catch (err) {
    throw new Error(`❌ خطأ في إنشاء حساب SSH: ${err.message}`);
  }

  const ip = await resolveIp(SSH_PUBLIC_HOST);
  const days = computeTtlDays(telegramUserId);
  const record = {
    id: shortId(),
    telegramUserId,
    protocol: "ssh",
    connectHost: ip,
    port: SSH_PUBLIC_PORT,
    username,
    password,
    createdAt: new Date().toISOString(),
    expiresAt: expiresAtFromDays(days),
    status: "active",
  };
  db.addServer(record);
  logger.info(`SSH server created: ${record.id} for user ${telegramUserId}`);
  return record;
}

// ✅ تحسين معالجة الأخطاء
async function provisionXray(telegramUserId, protocol, remark) {
  if (!xrayManager) throw new Error(`❌ خدمة ${protocol.toUpperCase()} غير مُعدة من طرف المشرف`);

  const domain = protocol === "vless" ? XRAY_VLESS_PUBLIC_HOST : XRAY_VMESS_PUBLIC_HOST;
  if (!domain) throw new Error(`❌ دومين ${protocol.toUpperCase()} غير مُعد من طرف المشرف`);

  const uuid = randomUUID();
  const finalRemark = `${remark} | @${ADMIN_CONTACT_USERNAME}`.slice(0, 48);
  
  try {
    await xrayManager.createClient(protocol, uuid, finalRemark);
  } catch (err) {
    throw new Error(`❌ خطأ في إنشاء ${protocol.toUpperCase()}: ${err.message}`);
  }

  const ip = await resolveIp(domain);
  const days = computeTtlDays(telegramUserId);
  const record = {
    id: shortId(),
    telegramUserId,
    protocol,
    connectHost: ip,
    sniHost: domain,
    port: 443,
    uuid,
    wsPath: protocol === "vless" ? "/vless" : "/vmess",
    remark: finalRemark,
    createdAt: new Date().toISOString(),
    expiresAt: expiresAtFromDays(days),
    status: "active",
  };
  db.addServer(record);
  logger.info(`${protocol.toUpperCase()} server created: ${record.id} for user ${telegramUserId}`);
  return record;
}

async function deprovision(record) {
  try {
    if (record.protocol === "ssh") {
      if (sshManager) await sshManager.deleteUser(record.username);
    } else {
      if (xrayManager) await xrayManager.deleteClient(record.protocol, record.uuid);
    }
    db.removeServer(record.id);
    logger.info(`Server ${record.id} deprovisioned successfully`);
  } catch (err) {
    logger.error(`Failed to deprovision server ${record.id}:`, err.message);
    throw err;
  }
}

function formatXrayLink(record) {
  const { protocol, uuid, connectHost, sniHost, port, wsPath, remark } = record;
  if (protocol === "vless") {
    return `vless://${uuid}@${connectHost}:${port}?encryption=none&security=tls&sni=${sniHost}&type=ws&host=${sniHost}&path=${encodeURIComponent(wsPath)}#${encodeURIComponent(remark)}`;
  }
  const vmessObj = {
    v: "2",
    ps: remark,
    add: connectHost,
    port: String(port),
    id: uuid,
    aid: "0",
    net: "ws",
    type: "none",
    host: sniHost,
    path: wsPath,
    tls: "tls",
    sni: sniHost,
  };
  return `vmess://${Buffer.from(JSON.stringify(vmessObj)).toString("base64")}`;
}

function formatServerDetail(record) {
  const expires = record.expiresAt.split("T")[0];
  const remaining = daysUntil(record.expiresAt);
  
  if (record.protocol === "ssh") {
    return (
      `${kb.protocolIcon("ssh")} **SSH - #${record.id}**\n\n` +
      `🔹 المضيف: \`${record.connectHost}\`\n` +
      `🔹 المنفذ: \`${record.port}\`\n` +
      `🔹 المستخدم: \`${record.username}\`\n` +
      `🔹 كلمة المرور: \`${record.password}\`\n\n` +
      `⏰ ينتهي: ${expires} (${remaining} أيام متبقية)`
    );
  }
  return (
    `${kb.protocolIcon(record.protocol)} **${record.protocol.toUpperCase()} - #${record.id}**\n\n` +
    "```\n" + formatXrayLink(record) + "\n```\n\n" +
    `⏰ ينتهي: ${expires} (${remaining} أيام متبقية)`
  );
}

// ✅ معالج البدء المحسّن
bot.start(async (ctx) => {
  const user = db.getUser(ctx.from.id);
  logger.info(`User started: ${ctx.from.id} (@${ctx.from.username})`);
  
  const { text, entities } = withPremiumEmoji("👋 مرحباً بك في البوت!");
  const status = db.isPremiumActive(ctx.from.id) ? "✅ برميوم" : "🆓 مجاني";
  
  await ctx.reply(
    `${text}\n\n📊 حالتك: ${status}\n\nاختر من الخيارات أدناه:${BRAND_FOOTER}`,
    { entities, parse_mode: "Markdown", ...kb.mainMenu(isAdmin(ctx.from.id)) }
  );
});

bot.action("menu:main", async (ctx) => {
  sessions.delete(ctx.from.id);
  const { text, entities } = withPremiumEmoji("القائمة الرئيسية");
  await ctx.editMessageText(
    `${text}${BRAND_FOOTER}`,
    { entities, parse_mode: "Markdown", ...kb.mainMenu(isAdmin(ctx.from.id)) }
  );
});

bot.action("menu:new", async (ctx) => {
  const check = canCreateServer(ctx.from.id);
  if (!check.ok) {
    return ctx.answerCbQuery(check.reason, { show_alert: true });
  }
  await ctx.editMessageText("🖥️ **اختر البروتوكول:**", { 
    parse_mode: "Markdown",
    ...kb.protocolMenu() 
  });
});

bot.action("new:ssh", async (ctx) => {
  sessions.set(ctx.from.id, { step: "ssh_username" });
  await ctx.editMessageText(
    "📝 أرسل اسم المستخدم (أحرف وأرقام إنجليزية، بدون مسافات):"
  );
});

bot.action(["new:vless", "new:vmess"], async (ctx) => {
  const protocol = ctx.match[0].split(":")[1];
  sessions.set(ctx.from.id, { step: "xray_remark", protocol });
  await ctx.editMessageText(
    `💬 أرسل اسمًا مميزًا للسيرفر (مثال: My ${protocol.toUpperCase()}):`
  );
});

bot.on("text", async (ctx) => {
  const session = sessions.get(ctx.from.id);
  if (!session) return;

  try {
    if (session.step === "ssh_username") {
      const username = sanitizeHandle(ctx.message.text);
      if (!validateInput.username(username)) {
        return ctx.reply("❌ اسم مستخدم غير صالح. استخدم أحرف وأرقام فقط (3-32 حرف)");
      }
      session.username = username;
      session.step = "ssh_password";
      return ctx.reply("🔐 الآن أرسل كلمة المرور (6 أحرف على الأقل):");
    }

    if (session.step === "ssh_password") {
      const password = ctx.message.text;
      if (!validateInput.password(password)) {
        return ctx.reply("❌ كلمة مرور ضعيفة. استخدم 6 أحرف على الأقل");
      }
      session.password = password;
      session.step = "confirm";
      return ctx.reply(
        `✅ **تأكيد إنشاء SSH:**\n\n` +
        `👤 المستخدم: \`${session.username}\`\n` +
        `🔐 كلمة المرور: \`${session.password}\``,
        { parse_mode: "Markdown", ...kb.confirmMenu("ssh") }
      );
    }

    if (session.step === "xray_remark") {
      const remark = ctx.message.text.trim().slice(0, 32);
      if (!validateInput.remark(remark)) {
        return ctx.reply("❌ الاسم غير صالح. استخدم 3-32 حرف");
      }
      session.remark = remark;
      session.step = "confirm";
      return ctx.reply(
        `✅ **تأكيد إنشاء ${session.protocol.toUpperCase()}:**\n\n` +
        `📝 الاسم: ${session.remark}`,
        { parse_mode: "Markdown", ...kb.confirmMenu(session.protocol) }
      );
    }
  } catch (err) {
    logger.error("Text handler error:", err);
    await ctx.reply(`❌ حدث خطأ: ${err.message}`, kb.backButton());
  }
});

bot.action(/^confirm:(ssh|vless|vmess)$/, async (ctx) => {
  const protocol = ctx.match[1];
  const session = sessions.get(ctx.from.id);
  if (!session) {
    return ctx.answerCbQuery("⏱️ انتهت الجلسة. ابدأ من جديد", { show_alert: true });
  }

  const check = canCreateServer(ctx.from.id);
  if (!check.ok) {
    sessions.delete(ctx.from.id);
    return ctx.answerCbQuery(check.reason, { show_alert: true });
  }

  await ctx.editMessageText("⏳ جارٍ الإنشاء...");
  try {
    let record;
    if (protocol === "ssh") {
      record = await provisionSsh(ctx.from.id, session.username, session.password);
    } else {
      record = await provisionXray(ctx.from.id, protocol, session.remark);
    }
    sessions.delete(ctx.from.id);
    const { text, entities } = withPremiumEmoji("✅ تم الإنشاء بنجاح!");
    await ctx.reply(
      `${text}\n\n${formatServerDetail(record)}${BRAND_FOOTER}`,
      { parse_mode: "Markdown", entities, ...kb.serverDetailMenu(record.id) }
    );
  } catch (err) {
    logger.error("Server creation error:", err);
    await ctx.reply(`❌ خطأ: ${err.message}`, kb.backButton());
  }
});

bot.action("menu:my_servers", async (ctx) => {
  const servers = db.getActiveServersByUser(ctx.from.id);
  if (servers.length === 0) {
    return ctx.editMessageText(
      "📭 لا تملك أي سيرفرات حالياً.\n\n🖥️ اضغط على \"إنشاء سيرفر\" لتبدأ",
      kb.backButton()
    );
  }
  const { text, entities } = withPremiumEmoji(`سيرفراتك (${servers.length})`);
  await ctx.editMessageText(
    `${text}${BRAND_FOOTER}`,
    { entities, parse_mode: "Markdown", ...kb.myServersMenu(servers) }
  );
});

bot.action(/^server:(.+)$/, async (ctx) => {
  const record = db.getServer(ctx.match[1]);
  if (!record) return ctx.answerCbQuery("❌ السيرفر غير موجود", { show_alert: true });
  await ctx.editMessageText(
    formatServerDetail(record) + BRAND_FOOTER,
    { parse_mode: "Markdown", ...kb.serverDetailMenu(record.id) }
  );
});

bot.action(/^delete:(.+)$/, async (ctx) => {
  const record = db.getServer(ctx.match[1]);
  if (!record || record.telegramUserId !== ctx.from.id) {
    return ctx.answerCbQuery("❌ غير مسموح", { show_alert: true });
  }
  await ctx.editMessageText("⏳ جارٍ الحذف...");
  try {
    await deprovision(record);
    await ctx.editMessageText("🗑️ ✅ تم حذف السيرفر بنجاح", kb.backButton());
  } catch (err) {
    logger.error("Server deletion error:", err);
    await ctx.answerCbQuery(`❌ خطأ: ${err.message}`, { show_alert: true });
  }
});

// ✅ تحسين نظام البريميوم
bot.action("menu:premium", async (ctx) => {
  const user = db.getUser(ctx.from.id);
  const isPremium = db.isPremiumActive(ctx.from.id);
  
  if (isPremium) {
    const remaining = daysUntil(user.premiumExpiresAt);
    const message = `💎 **نظام البريميوم**\n\n✅ اشتراكك مفعّل\n⏰ متبقي: ${remaining} أيام\n📅 ينتهي: ${user.premiumExpiresAt.split("T")[0]}`;
    await ctx.editMessageText(message, { parse_mode: "Markdown", ...kb.backButton() });
  } else {
    const { text, entities } = withPremiumEmoji("💎 نظام البريميوم");
    await ctx.editMessageText(
      `${text}\n\n🆓 أنت حالياً على الخطة المجانية\n\n⭐ **مميزات البريميوم:**\n• إنشاء حتى ${MAX_SERVERS_PREMIUM} سيرفرات\n• دعم أولوي\n• وقت أطول للسيرفرات\n\n📲 اختر مدة الاشتراك:`,
      { entities, parse_mode: "Markdown", ...kb.premiumMenu() }
    );
  }
});

bot.action(/^premium:(3|7|30)$/, async (ctx) => {
  const days = ctx.match[1];
  const { text, entities } = withPremiumEmoji("تم إرسال الطلب");
  
  await ctx.editMessageText(
    `${text}\n\n📝 للتفعيل تواصل مع:\n@${ADMIN_CONTACT_USERNAME}\n\n🆔 معرفك: \`${ctx.from.id}\`\n📅 المدة المطلوبة: ${days} أيام${BRAND_FOOTER}`,
    { parse_mode: "Markdown", ...kb.backButton() }
  );

  for (const adminId of adminIds) {
    try {
      await bot.telegram.sendMessage(
        adminId,
        `🔔 **طلب اشتراك جديد**\n\n` +
        `👤 المستخدم: ${ctx.from.id}\n` +
        `📱 اليوزرنيم: @${ctx.from.username || "-"}\n` +
        `📅 المدة: ${days} أيام\n\n` +
        `⚡ للتفعيل:\n/grant ${ctx.from.id} ${days}`,
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      logger.error(`Failed to notify admin ${adminId}:`, err.message);
    }
  }
});

bot.command("grant", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.reply("❌ ليس لديك الصلاحيات");
  
  const parts = ctx.message.text.split(" ").filter(Boolean);
  const targetId = parts[1];
  const days = parseInt(parts[2], 10);
  
  if (!targetId || !days || days <= 0) {
    return ctx.reply("❌ الاستخدام: /grant <telegram_id> <days>\n\nمثال: /grant 123456789 30");
  }

  try {
    const user = db.grantPremium(targetId, days);
    await ctx.reply(`✅ **تم التفعيل بنجاح**\n\n👤 المستخدم: ${targetId}\n⏰ ينتهي: ${user.premiumExpiresAt.split("T")[0]}`, { parse_mode: "Markdown" });
    
    try {
      await bot.telegram.sendMessage(
        targetId,
        `🎉 **مبروك!**\n\nتم تفعيل اشتراك البريميوم لمدة ${days} يوم! 🎊\n\n✨ الآن يمكنك الاستمتاع بجميع المميزات${BRAND_FOOTER}`,
        { parse_mode: "Markdown" }
      );
    } catch (_) {}
  } catch (err) {
    logger.error("Grant premium error:", err);
    await ctx.reply(`❌ خطأ: ${err.message}`);
  }
});

// ✅ لوحة التحكم الإدارية المحسّنة
bot.action("menu:admin", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("❌ غير مسموح", { show_alert: true });
  const { text, entities } = withPremiumEmoji("⚙️ لوحة التحكم");
  await ctx.editMessageText(
    `${text}${BRAND_FOOTER}`,
    { entities, parse_mode: "Markdown", ...kb.adminMenu() }
  );
});

bot.action("admin:servers", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("❌ غير مسموح", { show_alert: true });
  const servers = db.getAllServers();
  if (servers.length === 0) {
    return ctx.editMessageText("📭 لا توجد سيرفرات", kb.backButton());
  }
  const rows = servers.map((s) => [
    {
      text: `${kb.protocolIcon(s.protocol)} #${s.id} | 👤 ${s.telegramUserId}`,
      callback_data: `admin_view:${s.id}`,
    },
  ]);
  rows.push([{ text: "⬅️ عودة", callback_data: "menu:admin" }]);
  const { text, entities } = withPremiumEmoji(`جميع السيرفرات (${servers.length})`);
  await ctx.editMessageText(
    `${text}${BRAND_FOOTER}`,
    { entities, parse_mode: "Markdown", reply_markup: { inline_keyboard: rows } }
  );
});

bot.action(/^admin_view:(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("❌ غير مسموح", { show_alert: true });
  const record = db.getServer(ctx.match[1]);
  if (!record) return ctx.answerCbQuery("❌ غير موجود", { show_alert: true });
  await ctx.editMessageText(
    `${formatServerDetail(record)}\n\n👤 المالك: \`${record.telegramUserId}\`${BRAND_FOOTER}`,
    { parse_mode: "Markdown", ...kb.adminServerDetailMenu(record.id) }
  );
});

bot.action(/^admin_delete:(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("❌ غير مسموح", { show_alert: true });
  const record = db.getServer(ctx.match[1]);
  if (!record) return ctx.answerCbQuery("❌ غير موجود", { show_alert: true });
  
  await ctx.editMessageText("⏳ جارٍ الحذف...");
  try {
    await deprovision(record);
    await ctx.editMessageText("🗑️ ✅ تم حذف السيرفر بنجاح", kb.backButton());
  } catch (err) {
    logger.error("Admin delete error:", err);
    await ctx.answerCbQuery(`❌ خطأ: ${err.message}`, { show_alert: true });
  }
});

// ✅ تنظيف تلقائي محسّن
cron.schedule("0 3 * * *", async () => {
  logger.info("Starting expiry cleanup...");
  const expired = db.getExpiredServers();
  
  for (const server of expired) {
    try {
      await deprovision(server);
      logger.info(`Expired server deleted: ${server.id}`);
      
      try {
        await bot.telegram.sendMessage(
          server.telegramUserId,
          `⌛ **انتهت الصلاحية**\n\nللأسف انتهت صلاحية سيرفرك #${server.id} وتم حذفه تلقائياً.\n\n🔄 يمكنك إنشاء سيرفر جديد من القائمة الرئيسية${BRAND_FOOTER}`,
          { parse_mode: "Markdown" }
        );
      } catch (_) {}
    } catch (err) {
      logger.error(`Failed to delete expired server ${server.id}:`, err.message);
    }
  }
  
  logger.info(`Cleanup completed: ${expired.length} servers removed`);
});

// ✅ معالجة الأخطاء العامة
bot.catch((err) => {
  logger.error("Bot error:", err);
});

bot.launch();
logger.info("✅ Bot started successfully - v2.0");

process.once("SIGINT", () => {
  logger.info("Bot stopping (SIGINT)...");
  bot.stop("SIGINT");
});
process.once("SIGTERM", () => {
  logger.info("Bot stopping (SIGTERM)...");
  bot.stop("SIGTERM");
});
