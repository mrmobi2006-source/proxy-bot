require("dotenv").config();
const { Telegraf } = require("telegraf");
const { randomUUID, randomBytes } = require("crypto");
const cron = require("node-cron");

const { SshManagerClient } = require("./lib/sshManager");
const { XrayManagerClient } = require("./lib/xrayManager");
const { withPremiumEmoji } = require("./lib/premiumEmoji");
const kb = require("./lib/keyboards");
const db = require("./lib/db");

// ---- Config ----
const {
  BOT_TOKEN,
  ADMIN_TELEGRAM_IDS = "",
  ADMIN_CONTACT_USERNAME = "admin",

  SSH_SHARED_INTERNAL_HOST,
  SSH_API_SECRET,
  SSH_PUBLIC_HOST,
  SSH_PUBLIC_PORT,

  XRAY_SHARED_INTERNAL_HOST,
  XRAY_API_SECRET,
  XRAY_VLESS_PUBLIC_HOST,
  XRAY_VMESS_PUBLIC_HOST,

  FREE_TRIAL_DAYS = "1",
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

// In-memory conversation state per telegram user id.
// Resets if the bot restarts - acceptable for short multi-step forms.
const sessions = new Map();

// ---- Helpers ----

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

function canCreateServer(telegramUserId) {
  const premium = db.isPremiumActive(telegramUserId);
  if (premium) return { ok: true };

  const active = db.getActiveServersByUser(telegramUserId);
  if (active.length >= 1) {
    return {
      ok: false,
      reason:
        "الخطة المجانية تسمح بسيرفر واحد فقط لمدة يوم. ترقّ للبريميوم للمزيد.",
    };
  }
  return { ok: true };
}

function sanitizeHandle(text) {
  return (text || "").trim().replace(/[^a-zA-Z0-9]/g, "").slice(0, 32);
}

// ---- Provisioning ----

async function provisionSsh(telegramUserId, username, password) {
  if (!sshManager) throw new Error("خدمة SSH غير مُعدة بعد من طرف المشرف");

  const existing = db
    .getAllServers()
    .find((s) => s.protocol === "ssh" && s.status === "active" && s.username === username);
  if (existing) throw new Error("اسم المستخدم هذا محجوز، اختر اسمًا آخر");

  await sshManager.createUser(username, password);

  const days = computeTtlDays(telegramUserId);
  const record = {
    id: shortId(),
    telegramUserId,
    protocol: "ssh",
    domain: SSH_PUBLIC_HOST,
    port: SSH_PUBLIC_PORT,
    username,
    password,
    createdAt: new Date().toISOString(),
    expiresAt: expiresAtFromDays(days),
    status: "active",
  };
  db.addServer(record);
  return record;
}

async function provisionXray(telegramUserId, protocol, remark) {
  if (!xrayManager) throw new Error("خدمة Xray غير مُعدة بعد من طرف المشرف");

  const domain =
    protocol === "vless" ? XRAY_VLESS_PUBLIC_HOST : XRAY_VMESS_PUBLIC_HOST;
  if (!domain) throw new Error(`دومين ${protocol} غير مُعد من طرف المشرف`);

  const uuid = randomUUID();
  await xrayManager.createClient(protocol, uuid, remark);

  const days = computeTtlDays(telegramUserId);
  const record = {
    id: shortId(),
    telegramUserId,
    protocol,
    domain,
    port: 443,
    uuid,
    wsPath: protocol === "vless" ? "/vless" : "/vmess",
    remark: remark || protocol,
    createdAt: new Date().toISOString(),
    expiresAt: expiresAtFromDays(days),
    status: "active",
  };
  db.addServer(record);
  return record;
}

async function deprovision(record) {
  if (record.protocol === "ssh") {
    if (sshManager) await sshManager.deleteUser(record.username);
  } else {
    if (xrayManager) await xrayManager.deleteClient(record.protocol, record.uuid);
  }
  db.removeServer(record.id);
}

// ---- Formatting ----

function formatXrayLink(record) {
  const { protocol, uuid, domain, port, wsPath, remark } = record;
  if (protocol === "vless") {
    return `vless://${uuid}@${domain}:${port}?encryption=none&security=tls&sni=${domain}&type=ws&host=${domain}&path=${encodeURIComponent(wsPath)}#${encodeURIComponent(remark)}`;
  }
  const vmessObj = {
    v: "2",
    ps: remark,
    add: domain,
    port: String(port),
    id: uuid,
    aid: "0",
    net: "ws",
    type: "none",
    host: domain,
    path: wsPath,
    tls: "tls",
    sni: domain,
  };
  return `vmess://${Buffer.from(JSON.stringify(vmessObj)).toString("base64")}`;
}

function formatServerDetail(record) {
  const expires = record.expiresAt.split("T")[0];
  if (record.protocol === "ssh") {
    return (
      `${kb.protocolIcon("ssh")} SSH — #${record.id}\n\n` +
      `Host: \`${record.domain}\`\n` +
      `Port: \`${record.port}\`\n` +
      `Username: \`${record.username}\`\n` +
      `Password: \`${record.password}\`\n\n` +
      `ينتهي: ${expires}`
    );
  }
  return (
    `${kb.protocolIcon(record.protocol)} ${record.protocol.toUpperCase()} — #${record.id}\n\n` +
    "```\n" + formatXrayLink(record) + "\n```\n\n" +
    `ينتهي: ${expires}`
  );
}

// ---- Bot flow ----

bot.start(async (ctx) => {
  const { text, entities } = withPremiumEmoji(
    "أهلاً بك في بوت السيرفرات الاحترافي!\n\nاختر من القائمة:"
  );
  await ctx.reply(text, { entities, ...kb.mainMenu(isAdmin(ctx.from.id)) });
});

bot.action("menu:main", async (ctx) => {
  sessions.delete(ctx.from.id);
  await ctx.editMessageText("القائمة الرئيسية:", kb.mainMenu(isAdmin(ctx.from.id)));
});

bot.action("menu:new", async (ctx) => {
  const check = canCreateServer(ctx.from.id);
  if (!check.ok) {
    return ctx.answerCbQuery(check.reason, { show_alert: true });
  }
  await ctx.editMessageText("اختر نوع السيرفر:", kb.protocolMenu());
});

bot.action("new:ssh", async (ctx) => {
  sessions.set(ctx.from.id, { step: "ssh_username" });
  await ctx.editMessageText(
    "أرسل اسم المستخدم الذي تريده (أحرف وأرقام إنجليزية فقط، بدون مسافات):"
  );
});

bot.action(["new:vless", "new:vmess"], async (ctx) => {
  const protocol = ctx.match[0].split(":")[1];
  sessions.set(ctx.from.id, { step: "xray_remark", protocol });
  await ctx.editMessageText("أرسل اسمًا مميزًا لسيرفرك (مثال: My Server):");
});

bot.on("text", async (ctx) => {
  const session = sessions.get(ctx.from.id);
  if (!session) return; // not in a flow - ignore free text

  if (session.step === "ssh_username") {
    const username = sanitizeHandle(ctx.message.text);
    if (username.length < 3) {
      return ctx.reply("اسم مستخدم قصير جدًا، حاول مرة أخرى (3 أحرف على الأقل):");
    }
    session.username = username;
    session.step = "ssh_password";
    return ctx.reply("الآن أرسل كلمة المرور (6 أحرف على الأقل):");
  }

  if (session.step === "ssh_password") {
    const password = sanitizeHandle(ctx.message.text);
    if (password.length < 6) {
      return ctx.reply("كلمة مرور قصيرة جدًا، حاول مرة أخرى (6 أحرف على الأقل):");
    }
    session.password = password;
    session.step = "confirm";
    return ctx.reply(
      `تأكيد إنشاء حساب SSH:\nUsername: ${session.username}\nPassword: ${session.password}`,
      kb.confirmMenu("ssh")
    );
  }

  if (session.step === "xray_remark") {
    session.remark = ctx.message.text.trim().slice(0, 32);
    session.step = "confirm";
    return ctx.reply(
      `تأكيد إنشاء سيرفر ${session.protocol.toUpperCase()}:\nالاسم: ${session.remark}`,
      kb.confirmMenu(session.protocol)
    );
  }
});

bot.action(/^confirm:(ssh|vless|vmess)$/, async (ctx) => {
  const protocol = ctx.match[1];
  const session = sessions.get(ctx.from.id);
  if (!session) return ctx.answerCbQuery("انتهت الجلسة، ابدأ من جديد", { show_alert: true });

  const check = canCreateServer(ctx.from.id);
  if (!check.ok) {
    sessions.delete(ctx.from.id);
    return ctx.answerCbQuery(check.reason, { show_alert: true });
  }

  await ctx.editMessageText("جارٍ الإنشاء... ⏳");
  try {
    let record;
    if (protocol === "ssh") {
      record = await provisionSsh(ctx.from.id, session.username, session.password);
    } else {
      record = await provisionXray(ctx.from.id, protocol, session.remark);
    }
    sessions.delete(ctx.from.id);
    await ctx.reply(
      `✅ تم الإنشاء بنجاح\n\n${formatServerDetail(record)}`,
      { parse_mode: "Markdown", ...kb.serverDetailMenu(record.id) }
    );
  } catch (err) {
    await ctx.reply(`❌ خطأ: ${err.message}`, kb.backButton());
  }
});

bot.action("menu:my_servers", async (ctx) => {
  const servers = db.getActiveServersByUser(ctx.from.id);
  if (servers.length === 0) {
    return ctx.editMessageText("لا تملك أي سيرفرات حالياً.", kb.backButton());
  }
  await ctx.editMessageText("سيرفراتك:", kb.myServersMenu(servers));
});

bot.action(/^server:(.+)$/, async (ctx) => {
  const record = db.getServer(ctx.match[1]);
  if (!record) return ctx.answerCbQuery("السيرفر غير موجود", { show_alert: true });
  await ctx.editMessageText(formatServerDetail(record), {
    parse_mode: "Markdown",
    ...kb.serverDetailMenu(record.id),
  });
});

bot.action(/^delete:(.+)$/, async (ctx) => {
  const record = db.getServer(ctx.match[1]);
  if (!record || record.telegramUserId !== ctx.from.id) {
    return ctx.answerCbQuery("غير مسموح", { show_alert: true });
  }
  try {
    await deprovision(record);
    await ctx.editMessageText("🗑️ تم الحذف بنجاح", kb.backButton());
  } catch (err) {
    await ctx.answerCbQuery(`فشل الحذف: ${err.message}`, { show_alert: true });
  }
});

bot.action("menu:premium", async (ctx) => {
  const user = db.getUser(ctx.from.id);
  const status = db.isPremiumActive(ctx.from.id)
    ? `مفعّل حتى ${user.premiumExpiresAt.split("T")[0]}`
    : "غير مفعّل";
  await ctx.editMessageText(
    `💎 الاشتراك المميز\nالحالة الحالية: ${status}\n\nاختر مدة الاشتراك:`,
    kb.premiumMenu()
  );
});

bot.action(/^premium:(3|7|30)$/, async (ctx) => {
  const days = ctx.match[1];
  await ctx.editMessageText(
    `للتفعيل، تواصل مع @${ADMIN_CONTACT_USERNAME} وأرسل له معرفك:\n\n` +
      `\`${ctx.from.id}\`\n\nمع تحديد مدة الاشتراك: ${days} أيام`,
    { parse_mode: "Markdown", ...kb.backButton() }
  );
  for (const adminId of adminIds) {
    try {
      await bot.telegram.sendMessage(
        adminId,
        `طلب اشتراك جديد:\nUser ID: ${ctx.from.id}\nUsername: @${ctx.from.username || "-"}\nالمدة: ${days} أيام\n\nللتفعيل: /grant ${ctx.from.id} ${days}`
      );
    } catch (_) {}
  }
});

// ---- Admin ----

bot.command("grant", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const parts = ctx.message.text.split(" ").filter(Boolean);
  const targetId = parts[1];
  const days = parseInt(parts[2], 10);
  if (!targetId || !days) {
    return ctx.reply("الاستخدام: /grant <telegram_id> <days>");
  }
  const user = db.grantPremium(targetId, days);
  await ctx.reply(`✅ تم تفعيل البريميوم لـ ${targetId} حتى ${user.premiumExpiresAt.split("T")[0]}`);
  try {
    await bot.telegram.sendMessage(targetId, `🎉 تم تفعيل اشتراكك المميز لمدة ${days} يوم!`);
  } catch (_) {}
});

bot.action("menu:admin", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("غير مسموح", { show_alert: true });
  await ctx.editMessageText("⚙️ لوحة الإدارة", kb.adminMenu());
});

bot.action("admin:servers", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("غير مسموح", { show_alert: true });
  const servers = db.getAllServers();
  if (servers.length === 0) {
    return ctx.editMessageText("لا توجد سيرفرات.", kb.backButton());
  }
  const rows = servers.map((s) => [
    { text: `${kb.protocolIcon(s.protocol)} #${s.id} - ${s.telegramUserId}`, callback_data: `admin_view:${s.id}` },
  ]);
  rows.push([{ text: "⬅️ رجوع", callback_data: "menu:admin" }]);
  await ctx.editMessageText("كل السيرفرات:", { reply_markup: { inline_keyboard: rows } });
});

bot.action(/^admin_view:(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("غير مسموح", { show_alert: true });
  const record = db.getServer(ctx.match[1]);
  if (!record) return ctx.answerCbQuery("غير موجود", { show_alert: true });
  await ctx.editMessageText(
    `${formatServerDetail(record)}\n\nالمالك: ${record.telegramUserId}`,
    { parse_mode: "Markdown", ...kb.adminServerDetailMenu(record.id) }
  );
});

bot.action(/^admin_delete:(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("غير مسموح", { show_alert: true });
  const record = db.getServer(ctx.match[1]);
  if (!record) return ctx.answerCbQuery("غير موجود", { show_alert: true });
  try {
    await deprovision(record);
    await ctx.editMessageText("🗑️ تم الحذف", kb.backButton());
  } catch (err) {
    await ctx.answerCbQuery(`فشل: ${err.message}`, { show_alert: true });
  }
});

// ---- Expiry cleanup ----
cron.schedule("0 3 * * *", async () => {
  console.log("Running expiry cleanup...");
  for (const server of db.getExpiredServers()) {
    try {
      await deprovision(server);
      console.log(`Deleted expired server ${server.id}`);
      try {
        await bot.telegram.sendMessage(
          server.telegramUserId,
          `⌛ انتهت صلاحية سيرفرك #${server.id} وتم حذفه.`
        );
      } catch (_) {}
    } catch (err) {
      console.error(`Failed to delete ${server.id}:`, err.message);
    }
  }
});

bot.launch();
console.log("Bot started.");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
