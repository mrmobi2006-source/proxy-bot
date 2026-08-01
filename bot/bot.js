require("dotenv").config();
const { Telegraf } = require("telegraf");
const { randomUUID, randomBytes } = require("crypto");
const cron = require("node-cron");

const { RailwayClient } = require("./lib/railway");
const { CloudflareClient } = require("./lib/cloudflare");
const db = require("./lib/db");

// ---- Config from environment ----
const {
  BOT_TOKEN,
  RAILWAY_API_TOKEN,
  RAILWAY_PROJECT_ID,
  RAILWAY_ENVIRONMENT_ID,
  XRAY_IMAGE, // e.g. ghcr.io/yourname/xray-server:latest (build from docker/xray)
  SSH_IMAGE, // e.g. ghcr.io/yourname/ssh-server:latest (build from docker/ssh)
  CLOUDFLARE_API_TOKEN, // optional
  CLOUDFLARE_ZONE_ID, // optional
  CLOUDFLARE_ROOT_DOMAIN, // optional, e.g. "mydomain.com"
  SERVER_TTL_DAYS = "30",
} = process.env;

if (!BOT_TOKEN) throw new Error("BOT_TOKEN is required in .env");
if (!RAILWAY_API_TOKEN || !RAILWAY_PROJECT_ID || !RAILWAY_ENVIRONMENT_ID) {
  throw new Error(
    "RAILWAY_API_TOKEN, RAILWAY_PROJECT_ID, RAILWAY_ENVIRONMENT_ID are required"
  );
}

const railway = new RailwayClient(
  RAILWAY_API_TOKEN,
  RAILWAY_PROJECT_ID,
  RAILWAY_ENVIRONMENT_ID
);

const cloudflare =
  CLOUDFLARE_API_TOKEN && CLOUDFLARE_ZONE_ID
    ? new CloudflareClient(CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID)
    : null;

const bot = new Telegraf(BOT_TOKEN);

// ---- Helpers ----

function shortId() {
  return randomBytes(4).toString("hex");
}

function expiresAtISO() {
  const days = parseInt(SERVER_TTL_DAYS, 10);
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/**
 * Provisions a VLESS or VMess server on Railway, optionally fronts it
 * with a branded Cloudflare subdomain.
 */
async function provisionXrayServer(telegramUserId, protocol) {
  if (!XRAY_IMAGE) {
    throw new Error("XRAY_IMAGE is not set - build & push docker/xray first");
  }

  const id = shortId();
  const uuid = randomUUID();
  const wsPath = "/" + randomBytes(6).toString("hex");
  const serviceName = `${protocol}-${id}`;

  // 1. Create the service from your pre-built Docker image
  const service = await railway.createServiceFromImage(serviceName, XRAY_IMAGE);

  // 2. Configure it via env vars (read by docker/xray/entrypoint.sh)
  await railway.setVariables(service.id, {
    XRAY_PROTOCOL: protocol,
    XRAY_UUID: uuid,
    XRAY_WSPATH: wsPath,
  });

  // 3. Deploy
  await railway.deployService(service.id);

  // 4. Expose it publicly - Railway terminates TLS on port 443 for us
  const railwayDomain = await railway.createDomain(service.id, 8080);

  // 5. Optional: front it behind your own domain via Cloudflare
  let publicDomain = railwayDomain;
  if (cloudflare && CLOUDFLARE_ROOT_DOMAIN) {
    const subdomain = `${id}.${CLOUDFLARE_ROOT_DOMAIN}`;
    await cloudflare.createProxiedCname(subdomain, railwayDomain);
    publicDomain = subdomain;
  }

  const record = {
    id,
    telegramUserId,
    protocol,
    serviceId: service.id,
    domain: publicDomain,
    uuid,
    wsPath,
    port: 443,
    createdAt: new Date().toISOString(),
    expiresAt: expiresAtISO(),
    status: "active",
  };
  db.addServer(record);
  return record;
}

async function provisionSshServer(telegramUserId) {
  if (!SSH_IMAGE) {
    throw new Error("SSH_IMAGE is not set - build & push docker/ssh first");
  }

  const id = shortId();
  const username = `u${id}`;
  const password = randomBytes(6).toString("base64url");
  const serviceName = `ssh-${id}`;

  const service = await railway.createServiceFromImage(serviceName, SSH_IMAGE);

  await railway.setVariables(service.id, {
    SSH_USERNAME: username,
    SSH_PASSWORD: password,
  });

  await railway.deployService(service.id);

  // SSH needs raw TCP, not HTTP - use Railway's TCP proxy
  const { domain, proxyPort } = await railway.createTcpProxy(service.id, 22);

  const record = {
    id,
    telegramUserId,
    protocol: "ssh",
    serviceId: service.id,
    domain,
    port: proxyPort,
    username,
    password,
    createdAt: new Date().toISOString(),
    expiresAt: expiresAtISO(),
    status: "active",
  };
  db.addServer(record);
  return record;
}

// ---- Formatting connection strings ----

function formatXrayLink(record) {
  const { protocol, uuid, domain, port, wsPath } = record;
  if (protocol === "vless") {
    return `vless://${uuid}@${domain}:${port}?encryption=none&security=tls&sni=${domain}&type=ws&host=${domain}&path=${encodeURIComponent(
      wsPath
    )}#${record.id}`;
  }
  // vmess uses a base64-encoded JSON blob
  const vmessObj = {
    v: "2",
    ps: record.id,
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
  const b64 = Buffer.from(JSON.stringify(vmessObj)).toString("base64");
  return `vmess://${b64}`;
}

function formatSshInfo(record) {
  return (
    `Host: ${record.domain}\n` +
    `Port: ${record.port}\n` +
    `Username: ${record.username}\n` +
    `Password: ${record.password}`
  );
}

// ---- Bot commands ----

bot.start((ctx) =>
  ctx.reply(
    "أهلاً بك 👋\n\n" +
      "الأوامر المتاحة:\n" +
      "/new_vless - إنشاء سيرفر VLESS جديد\n" +
      "/new_vmess - إنشاء سيرفر VMess جديد\n" +
      "/new_ssh - إنشاء حساب SSH جديد\n" +
      "/my_servers - عرض سيرفراتك الحالية"
  )
);

bot.command("new_vless", async (ctx) => {
  const msg = await ctx.reply("جارٍ إنشاء سيرفر VLESS... ⏳");
  try {
    const record = await provisionXrayServer(ctx.from.id, "vless");
    await ctx.reply(
      `✅ تم إنشاء سيرفرك\n\n` + "\`\`\`\n" + formatXrayLink(record) + "\n\`\`\`",
      { parse_mode: "MarkdownV2" }
    );
  } catch (err) {
    console.error(err);
    await ctx.reply(`❌ حدث خطأ: ${err.message}`);
  }
});

bot.command("new_vmess", async (ctx) => {
  await ctx.reply("جارٍ إنشاء سيرفر VMess... ⏳");
  try {
    const record = await provisionXrayServer(ctx.from.id, "vmess");
    await ctx.reply(`✅ تم إنشاء سيرفرك\n\n${formatXrayLink(record)}`);
  } catch (err) {
    console.error(err);
    await ctx.reply(`❌ حدث خطأ: ${err.message}`);
  }
});

bot.command("new_ssh", async (ctx) => {
  await ctx.reply("جارٍ إنشاء حساب SSH... ⏳");
  try {
    const record = await provisionSshServer(ctx.from.id);
    await ctx.reply(`✅ تم إنشاء حسابك\n\n${formatSshInfo(record)}`);
  } catch (err) {
    console.error(err);
    await ctx.reply(`❌ حدث خطأ: ${err.message}`);
  }
});

bot.command("my_servers", async (ctx) => {
  const servers = db.getServersByUser(ctx.from.id);
  if (servers.length === 0) {
    return ctx.reply("لا تملك أي سيرفرات حالياً.");
  }
  const lines = servers.map(
    (s) => `#${s.id} | ${s.protocol} | ينتهي: ${s.expiresAt.split("T")[0]}`
  );
  await ctx.reply(lines.join("\n"));
});

// ---- Expiry cleanup: runs daily, deletes servers past their TTL ----
cron.schedule("0 3 * * *", async () => {
  console.log("Running expiry cleanup...");
  const expired = db.getExpiredServers();
  for (const server of expired) {
    try {
      await railway.deleteService(server.serviceId);
      db.removeServer(server.id);
      console.log(`Deleted expired server ${server.id}`);
    } catch (err) {
      console.error(`Failed to delete ${server.id}:`, err.message);
    }
  }
});

bot.launch();
console.log("Bot started.");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
