require("dotenv").config();
const { Telegraf } = require("telegraf");
const { randomUUID, randomBytes } = require("crypto");
const dns  = require("dns").promises;
const cron = require("node-cron");

const { SshManagerClient }  = require("./lib/sshManager");
const { XrayManagerClient } = require("./lib/xrayManager");
const { withEmoji, withEmojiWrap } = require("./lib/premiumEmoji");
const kb = require("./lib/keyboards");
const db = require("./lib/db");

const {
  BOT_TOKEN,
  ADMIN_TELEGRAM_IDS     = "6154678499",
  ADMIN_CONTACT_USERNAME = "xtt1x",
  CHANNEL_URL            = "https://t.me/xtt10x",
  SSH_SHARED_INTERNAL_HOST, SSH_API_SECRET, SSH_PUBLIC_HOST, SSH_PUBLIC_PORT,
  XRAY_VLESS_INTERNAL_HOST, XRAY_VLESS_PUBLIC_HOST,
  XRAY_VMESS_INTERNAL_HOST, XRAY_VMESS_PUBLIC_HOST,
  XRAY_API_SECRET,
  FREE_TRIAL_DAYS = "1", ADMIN_TTL_DAYS = "3650",
  SERVER_COUNTRY  = "🇺🇸 US", USERS_PER_PAGE = "8",
} = process.env;

if (!BOT_TOKEN) throw new Error("BOT_TOKEN is required");

const adminIds = ADMIN_TELEGRAM_IDS.split(",").map(x => x.trim()).filter(Boolean);
const isAdmin  = id => adminIds.includes(String(id));

const sshManager   = SSH_SHARED_INTERNAL_HOST  && SSH_API_SECRET  ? new SshManagerClient(SSH_SHARED_INTERNAL_HOST, SSH_API_SECRET)   : null;
const vlessManager = XRAY_VLESS_INTERNAL_HOST && XRAY_API_SECRET ? new XrayManagerClient(XRAY_VLESS_INTERNAL_HOST, XRAY_API_SECRET) : null;
const vmessManager = XRAY_VMESS_INTERNAL_HOST && XRAY_API_SECRET ? new XrayManagerClient(XRAY_VMESS_INTERNAL_HOST, XRAY_API_SECRET) : null;

function getXrayManager(protocol) {
  return protocol === "vless" ? vlessManager : protocol === "vmess" ? vmessManager : null;
}

const bot = new Telegraf(BOT_TOKEN);
const sessions = new Map();
const FOOTER = `\n\n${"─".repeat(18)}\n© جميع الحقوق محفوظة\n📢 ${CHANNEL_URL}\n👤 @${ADMIN_CONTACT_USERNAME}`;

function shortId() { return randomBytes(4).toString("hex"); }
function bytes2h(b) { if (!b) return "0 B"; const u=["B","KB","MB","GB","TB"],i=Math.floor(Math.log(b)/Math.log(1024)); return (b/Math.pow(1024,i)).toFixed(2)+" "+u[i]; }
function daysUntil(i) { return Math.max(0,Math.ceil((new Date(i).getTime()-Date.now())/86400000)); }
function expireIn(d) { const x=new Date(); x.setDate(x.getDate()+d); return x.toISOString(); }
function clean(t) { return (t||"").trim().replace(/[^a-zA-Z0-9]/g,"").slice(0,32); }

function ttlDays(userId) {
  if (isAdmin(userId)) return parseInt(ADMIN_TTL_DAYS);
  if (db.isPremiumActive(String(userId))) return daysUntil(db.getUser(String(userId)).premiumExpiresAt);
  return parseInt(FREE_TRIAL_DAYS);
}

function canCreate(userId) {
  if (isAdmin(userId)) return { ok: true };
  if (db.isBanned(String(userId))) return { ok: false, reason: "🚫 حسابك محظور." };
  if (!db.canCreateToday(String(userId))) return { ok: false, reason: "⏳ تجاوزت الحد اليومي. حاول غداً." };
  return { ok: true };
}

async function resolveIpForSsh(host) {
  try { const { address } = await dns.lookup(host, { family: 4 }); return address; } catch { return host; }
}

async function eEdit(ctx, text, extra={}) { try { await ctx.editMessageText(text, extra); } catch {} }

async function doSsh(userId, username, password) {
  if (!sshManager) throw new Error("SSH غير مُعد — تحقق من SSH_SHARED_*");
  if (db.getAllServers().find(s=>s.protocol==="ssh"&&s.status==="active"&&s.username===username)) throw new Error("اسم المستخدم محجوز");
  await sshManager.createUser(username, password);
  const connectHost = await resolveIpForSsh(SSH_PUBLIC_HOST);
  const days = ttlDays(userId);
  const record = { id: shortId(), telegramUserId: String(userId), protocol: "ssh", connectHost, port: SSH_PUBLIC_PORT, username, password, country: SERVER_COUNTRY, dataUp: 0, dataDown: 0, createdAt: new Date().toISOString(), expiresAt: expireIn(days), status: "active" };
  db.addServer(record); db.recordCreatedToday(String(userId)); return record;
}

async function doXray(userId, protocol, remark) {
  const mgr = getXrayManager(protocol);
  if (!mgr) throw new Error(`سيرفر ${protocol} غير مُعد — تحقق من XRAY_${protocol.toUpperCase()}_INTERNAL_HOST`);
  const domain = protocol === "vless" ? XRAY_VLESS_PUBLIC_HOST : XRAY_VMESS_PUBLIC_HOST;
  if (!domain) throw new Error(`دومين ${protocol} غير مُعد — تحقق من XRAY_${protocol.toUpperCase()}_PUBLIC_HOST`);
  const uuid = randomUUID(); const id = shortId(); const email = `${id}@xtt1x`;
  const note = `${remark} | @${ADMIN_CONTACT_USERNAME}`.slice(0, 48);
  await mgr.createClient(protocol, uuid, note, email);
  const days = ttlDays(userId);
  const record = { id, telegramUserId: String(userId), protocol, domain, port: 443, uuid, email, wsPath: protocol==="vless"?"/vless":"/vmess", remark: note, country: SERVER_COUNTRY, dataUp: 0, dataDown: 0, createdAt: new Date().toISOString(), expiresAt: expireIn(days), status: "active" };
  db.addServer(record); db.recordCreatedToday(String(userId)); return record;
}

async function doDeprovision(r) {
  if (r.protocol === "ssh") { if (sshManager) await sshManager.deleteUser(r.username).catch(()=>{}); }
  else { const mgr = getXrayManager(r.protocol); if (mgr) await mgr.deleteClient(r.protocol, r.uuid).catch(()=>{}); }
  db.removeServer(r.id);
}

async function reproSsh(r, u, p) {
  if (!sshManager) throw new Error("SSH غير مُعد");
  if (db.getAllServers().find(s=>s.protocol==="ssh"&&s.status==="active"&&s.username===u&&s.id!==r.id)) throw new Error("اسم المستخدم محجوز");
  await sshManager.createUser(u, p);
  await sshManager.deleteUser(r.username).catch(()=>{});
  const connectHost = await resolveIpForSsh(SSH_PUBLIC_HOST);
  return db.updateServer(r.id, { connectHost, username: u, password: p });
}

async function reproXray(r) {
  const mgr = getXrayManager(r.protocol);
  if (!mgr) throw new Error("Xray غير مُعد");
  const nu = randomUUID(); const ne = `${r.id}x@xtt1x`;
  await mgr.createClient(r.protocol, nu, r.remark, ne);
  await mgr.deleteClient(r.protocol, r.uuid).catch(()=>{});
  return db.updateServer(r.id, { uuid: nu, email: ne });
}

function xrayLink(r) {
  if (r.protocol === "vless") {
    return `vless://${r.uuid}@${r.domain}:${r.port}?encryption=none&security=tls&sni=${r.domain}&type=ws&host=${r.domain}&path=${encodeURIComponent(r.wsPath)}#${encodeURIComponent(r.remark)}`;
  }
  const v = { v: "2", ps: r.remark, add: r.domain, port: String(r.port), id: r.uuid, aid: "0", net: "ws", type: "none", host: r.domain, path: r.wsPath, tls: "tls", sni: r.domain };
  return `vmess://${Buffer.from(JSON.stringify(v)).toString("base64")}`;
}

function rawConfig(r) {
  if (r.protocol === "ssh") return `Host: ${r.connectHost}\nPort: ${r.port}\nUsername: ${r.username}\nPassword: ${r.password}`;
  return xrayLink(r);
}

function card(r, showOwner=false) {
  let t = `${kb.pIcon(r.protocol)}  ${r.protocol.toUpperCase()}  —  #${r.id}\n🌍  ${r.country}\n📅  ينتهي: ${r.expiresAt.split("T")[0]}\n`;
  if (showOwner) t += `👤  المالك: ${r.telegramUserId}\n`;
  t += `📊  ↑ ${bytes2h(r.dataUp||0)}  /  ↓ ${bytes2h(r.dataDown||0)}\n\n`;
  if (r.protocol === "ssh") t += `Host: \`${r.connectHost}\`\nPort: \`${r.port}\`\nUser: \`${r.username}\`\nPass: \`${r.password}\``;
  else t += `\`\`\`\n${xrayLink(r)}\n\`\`\``;
  return t;
}

bot.start(async ctx => {
  db.touchUser(String(ctx.from.id), ctx.from.username||null);
  const { text, entities } = withEmojiWrap("أهلاً بك في بوتنا الاحترافي");
  try { await ctx.reply(`${text}\n\nإدارة سيرفرات SSH · VLESS · VMess${FOOTER}`, { entities, ...kb.mainMenu(isAdmin(ctx.from.id)) }); }
  catch { await ctx.reply(`أهلاً بك في بوتنا الاحترافي\n\nإدارة سيرفرات SSH · VLESS · VMess${FOOTER}`, kb.mainMenu(isAdmin(ctx.from.id))); }
});

bot.command("grant", async ctx => {
  if (!isAdmin(ctx.from.id)) return;
  const [,id,d] = ctx.message.text.split(" "); const days = parseInt(d);
  if (!id||!days) return ctx.reply("الاستخدام: /grant <id> <days>");
  const u = db.grantPremium(id, days);
  await ctx.reply(`✅ تم منح ${days} يوم لـ ${id} حتى ${u.premiumExpiresAt.split("T")[0]}`);
  try { await bot.telegram.sendMessage(id,`🎉 تم تفعيل اشتراكك المميز لمدة ${days} يوم!${FOOTER}`); } catch {}
});

bot.action("menu:main", async ctx => { sessions.delete(ctx.from.id); await eEdit(ctx,"القائمة الرئيسية:", kb.mainMenu(isAdmin(ctx.from.id))); });
bot.action("menu:new", async ctx => {
  db.touchUser(String(ctx.from.id), ctx.from.username||null);
  const c=canCreate(ctx.from.id); if (!c.ok) return ctx.answerCbQuery(c.reason,{show_alert:true});
  await eEdit(ctx,"اختر نوع السيرفر:", kb.protocolMenu());
});
bot.action("new:ssh", async ctx => { sessions.set(ctx.from.id,{step:"ssh_username"}); await eEdit(ctx,"✏️  أرسل اسم المستخدم (حروف وأرقام إنجليزية، 3–20 حرف):"); });
bot.action(["new:vless","new:vmess"], async ctx => { const p=ctx.match[0].split(":")[1]; sessions.set(ctx.from.id,{step:"xray_remark",protocol:p}); await eEdit(ctx,"✏️  أرسل اسمًا مميزًا لسيرفرك:"); });

bot.action("menu:my_servers", async ctx => {
  const l=db.getActiveServersByUser(String(ctx.from.id));
  if (!l.length) return eEdit(ctx,"لا تملك أي سيرفرات نشطة.", kb.back("menu:main"));
  await eEdit(ctx,"📋  سيرفراتك:", kb.serversList(l,false,"menu:main"));
});
bot.action(/^server:(.+)$/, async ctx => {
  const r=db.getServer(ctx.match[1]); if (!r) return ctx.answerCbQuery("غير موجود",{show_alert:true});
  const ce=isAdmin(ctx.from.id)||db.isPremiumActive(String(ctx.from.id));
  await eEdit(ctx, card(r), {parse_mode:"Markdown",...kb.serverDetail(r.id,r.protocol,ce,false)});
});
bot.action(/^copy:(.+)$/, async ctx => {
  const r=db.getServer(ctx.match[1]); if (!r) return ctx.answerCbQuery("غير موجود",{show_alert:true});
  await ctx.answerCbQuery("📋  تم إرسال الكونفيغ");
  await ctx.reply(`📋  #${r.id}  ·  ${r.protocol.toUpperCase()}  ·  ${r.country}\n\n\`\`\`\n${rawConfig(r)}\n\`\`\``,{parse_mode:"Markdown"});
});
bot.action(/^stats:(.+)$/, async ctx => {
  const r=db.getServer(ctx.match[1]); if (!r) return ctx.answerCbQuery("غير موجود",{show_alert:true});
  let up=r.dataUp||0, dn=r.dataDown||0;
  if (r.protocol!=="ssh"&&r.email) { const mgr=getXrayManager(r.protocol); if (mgr) { try { const st=await mgr.getStats(r.email); up=st.up; dn=st.down; db.updateServerUsage(r.id,up,dn); } catch {} } }
  await ctx.answerCbQuery(`↑ ${bytes2h(up)}  /  ↓ ${bytes2h(dn)}`,{show_alert:true});
});
bot.action(/^delete:(.+)$/, async ctx => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("فقط المشرف يستطيع الحذف",{show_alert:true});
  const r=db.getServer(ctx.match[1]); if (!r) return ctx.answerCbQuery("غير موجود",{show_alert:true});
  await eEdit(ctx,`هل تريد حذف #${r.id} (${r.protocol})؟`, kb.confirmDelete(r.id));
});
bot.action(/^confirm_delete:(.+)$/, async ctx => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("غير مسموح",{show_alert:true});
  const r=db.getServer(ctx.match[1]); if (!r) return ctx.answerCbQuery("غير موجود",{show_alert:true});
  try { await doDeprovision(r); await eEdit(ctx,`🗑️  تم حذف #${r.id}.`, kb.back("menu:admin")); try { await bot.telegram.sendMessage(r.telegramUserId,`⚠️  تم حذف سيرفرك #${r.id} (${r.protocol}) بواسطة المشرف.`); } catch {} }
  catch (e) { await ctx.answerCbQuery(`فشل: ${e.message}`,{show_alert:true}); }
});
bot.action(/^edit:(.+)$/, async ctx => {
  const uid=String(ctx.from.id); const ce=isAdmin(ctx.from.id)||db.isPremiumActive(uid);
  if (!ce) return ctx.answerCbQuery("فقط المشتركون المميزون يمكنهم التعديل",{show_alert:true});
  const r=db.getServer(ctx.match[1]); if (!r) return ctx.answerCbQuery("غير موجود",{show_alert:true});
  if (r.telegramUserId!==uid&&!isAdmin(ctx.from.id)) return ctx.answerCbQuery("غير مسموح",{show_alert:true});
  if (r.protocol==="ssh") { sessions.set(ctx.from.id,{step:"edit_ssh_username",serverId:r.id}); await eEdit(ctx,"✏️  أرسل اسم المستخدم الجديد:"); }
  else { await eEdit(ctx,`تأكيد تجديد UUID لسيرفر #${r.id}؟\n⚠️  الكونفيغ القديم سيتوقف فور التجديد.`, kb.confirmEditXray(r.id)); }
});
bot.action(/^confirm_edit_xray:(.+)$/, async ctx => {
  const r=db.getServer(ctx.match[1]); if (!r) return ctx.answerCbQuery("غير موجود",{show_alert:true});
  if (r.telegramUserId!==String(ctx.from.id)&&!isAdmin(ctx.from.id)) return ctx.answerCbQuery("غير مسموح",{show_alert:true});
  await ctx.editMessageText("جارٍ التجديد... ⏳");
  try { const u=await reproXray(r); const {text,entities}=withEmojiWrap("تم التجديد بنجاح"); await ctx.reply(`${text}\n\n${card(u)}${FOOTER}`,{parse_mode:"Markdown",entities,...kb.serverDetail(u.id,u.protocol,true,false)}); }
  catch(e) { await ctx.reply(`❌  ${e.message}`, kb.back("menu:my_servers")); }
});

bot.action("menu:premium", async ctx => {
  const uid=String(ctx.from.id), active=db.isPremiumActive(uid), until=active?db.getUser(uid).premiumExpiresAt.split("T")[0]:"";
  const {statusLine,keyboard}=kb.premiumMenu(active,until);
  await eEdit(ctx,`💎  الاشتراك المميز\n\nالحالة: ${statusLine}\n\nاختر مدة الاشتراك:`, keyboard);
});
bot.action(/^premium_req:(\d+)$/, async ctx => {
  const days=ctx.match[1], uid=String(ctx.from.id), un=ctx.from.username||"-";
  await eEdit(ctx,`📨  تم إرسال طلبك.\n\nمعرفك: \`${uid}\`\nالمدة: ${days} أيام\n\nسيتم التفعيل قريباً.${FOOTER}`,{parse_mode:"Markdown",...kb.back("menu:premium")});
  for (const aid of adminIds) { try { await bot.telegram.sendMessage(aid,`طلب اشتراك:\nID: ${uid}\n@${un}\nالمدة: ${days} أيام`, kb.adminGrantButtons(uid,days)); } catch {} }
});
bot.action(/^quick_grant:(\d+):(\d+)$/, async ctx => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("غير مسموح",{show_alert:true});
  const u=db.grantPremium(ctx.match[1],parseInt(ctx.match[2]));
  await eEdit(ctx,`✅  تم منح ${ctx.match[2]} يوم للمستخدم ${ctx.match[1]}\nينتهي: ${u.premiumExpiresAt.split("T")[0]}`);
  try { await bot.telegram.sendMessage(ctx.match[1],`🎉  تم تفعيل اشتراكك لمدة ${ctx.match[2]} يوم!${FOOTER}`); } catch {}
});

bot.action("menu:admin", async ctx => { if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("غير مسموح",{show_alert:true}); await eEdit(ctx,"⚙️  لوحة الإدارة", kb.adminMenu(db.getAllUsers().length, db.getAllServers().length)); });
bot.action("admin:users", async ctx => { if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("غير مسموح",{show_alert:true}); const u=db.getAllUsers(); if (!u.length) return eEdit(ctx,"لا يوجد مستخدمون.",kb.back("menu:admin")); await eEdit(ctx,`👥  المستخدمون (${u.length}):`, kb.usersList(u,0,parseInt(USERS_PER_PAGE))); });
bot.action(/^users_page:(\d+)$/, async ctx => { if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("غير مسموح",{show_alert:true}); const u=db.getAllUsers(); await eEdit(ctx,`👥  المستخدمون (${u.length}):`, kb.usersList(u,parseInt(ctx.match[1]),parseInt(USERS_PER_PAGE))); });
bot.action(/^user_view:(\d+)$/, async ctx => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("غير مسموح",{show_alert:true});
  const tid=ctx.match[1], u=db.getUser(tid), srv=db.getActiveServersByUser(tid), p=db.isPremiumActive(tid), b=db.isBanned(tid);
  await eEdit(ctx, `👤  ${tid}${u.username?` (@${u.username})`:""}\n💎  ${p?`✅ حتى ${u.premiumExpiresAt.split("T")[0]}`:"❌"}\n🚫  ${b?"محظور":"غير محظور"}\n🖥️  السيرفرات: ${srv.length}`, kb.userManage(tid,p,b));
});
bot.action(/^user_servers:(\d+)$/, async ctx => { if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("غير مسموح",{show_alert:true}); const l=db.getActiveServersByUser(ctx.match[1]); if (!l.length) return ctx.answerCbQuery("لا يوجد سيرفرات",{show_alert:true}); await eEdit(ctx,`🖥️  سيرفرات ${ctx.match[1]}:`, kb.serversList(l,true,`user_view:${ctx.match[1]}`)); });
bot.action(/^admin_server:(.+)$/, async ctx => { if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("غير مسموح",{show_alert:true}); const r=db.getServer(ctx.match[1]); if (!r) return ctx.answerCbQuery("غير موجود",{show_alert:true}); await eEdit(ctx, card(r,true), {parse_mode:"Markdown",...kb.serverDetail(r.id,r.protocol,true,true)}); });
bot.action(/^grant_menu:(\d+)$/, async ctx => { if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("غير مسموح",{show_alert:true}); await eEdit(ctx,`منح بريميوم للمستخدم ${ctx.match[1]}:`, kb.grantDurations(ctx.match[1])); });
bot.action(/^do_grant:(\d+):(\d+)$/, async ctx => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("غير مسموح",{show_alert:true});
  const u=db.grantPremium(ctx.match[1],parseInt(ctx.match[2]));
  await eEdit(ctx,`✅  تم منح ${ctx.match[2]} يوم للمستخدم ${ctx.match[1]}\nينتهي: ${u.premiumExpiresAt.split("T")[0]}`, kb.back(`user_view:${ctx.match[1]}`));
  try { await bot.telegram.sendMessage(ctx.match[1],`🎉  تم تفعيل اشتراكك لمدة ${ctx.match[2]} يوم!${FOOTER}`); } catch {}
});
bot.action(/^revoke_premium:(\d+)$/, async ctx => { if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("غير مسموح",{show_alert:true}); db.revokePremium(ctx.match[1]); await eEdit(ctx,`✅  تم إلغاء البريميوم للمستخدم ${ctx.match[1]}`, kb.back(`user_view:${ctx.match[1]}`)); try { await bot.telegram.sendMessage(ctx.match[1],`⚠️  تم إلغاء اشتراكك المميز.${FOOTER}`); } catch {} });
bot.action(/^ban:(\d+)$/, async ctx => { if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("غير مسموح",{show_alert:true}); db.banUser(ctx.match[1]); await eEdit(ctx,`🚫  تم حظر ${ctx.match[1]}`, kb.back(`user_view:${ctx.match[1]}`)); });
bot.action(/^unban:(\d+)$/, async ctx => { if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("غير مسموح",{show_alert:true}); db.unbanUser(ctx.match[1]); await eEdit(ctx,`✅  تم رفع الحظر عن ${ctx.match[1]}`, kb.back(`user_view:${ctx.match[1]}`)); });
bot.action("admin:all_servers", async ctx => { if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("غير مسموح",{show_alert:true}); const l=db.getAllServers(); if (!l.length) return eEdit(ctx,"لا توجد سيرفرات.",kb.back("menu:admin")); await eEdit(ctx,`📋  كل السيرفرات (${l.length}):`, kb.serversList(l,true,"menu:admin")); });
bot.action("admin:nuke", async ctx => { if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("غير مسموح",{show_alert:true}); await eEdit(ctx,`⚠️  هل أنت متأكد؟ سيتم حذف كل السيرفرات (${db.getAllServers().length}) نهائياً.`, kb.confirmNuke()); });
bot.action("confirm_nuke", async ctx => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("غير مسموح",{show_alert:true});
  const l=db.getAllServers(); let ok=0,fail=0;
  await ctx.editMessageText(`🗑️  جارٍ حذف ${l.length} سيرفر...`);
  for (const s of l) { try { await doDeprovision(s); ok++; } catch { db.removeServer(s.id); fail++; } }
  await ctx.editMessageText(`✅  تم حذف ${ok} سيرفر.${fail?`\n⚠️  فشل ${fail}.`:""}`, kb.back("menu:admin"));
});
bot.action("admin:stats", async ctx => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery("غير مسموح",{show_alert:true});
  const sv=db.getAllServers(), us=db.getAllUsers(), p=us.filter(u=>db.isPremiumActive(u.telegramUserId)).length, b=us.filter(u=>db.isBanned(u.telegramUserId)).length;
  const bp=sv.reduce((a,s)=>{a[s.protocol]=(a[s.protocol]||0)+1;return a;},{});
  await eEdit(ctx,`📊  الإحصائيات\n\n👥  المستخدمون: ${us.length}\n💎  المميزون: ${p}\n🚫  المحظورون: ${b}\n\n🖥️  السيرفرات (${sv.length}):\n🟣  VLESS: ${bp.vless||0}\n🔵  VMess: ${bp.vmess||0}\n🟢  SSH: ${bp.ssh||0}`, kb.back("menu:admin"));
});

bot.on("text", async ctx => {
  const s=sessions.get(ctx.from.id); if (!s) return;
  if (s.step==="ssh_username") { const u=clean(ctx.message.text); if (u.length<3) return ctx.reply("اسم قصير جدًا (3 أحرف):"); s.username=u; s.step="ssh_password"; return ctx.reply("🔑  كلمة المرور (6 أحرف على الأقل):"); }
  if (s.step==="ssh_password") { const p=clean(ctx.message.text); if (p.length<6) return ctx.reply("كلمة مرور قصيرة (6 أحرف):"); s.password=p; s.step="confirm"; return ctx.reply(`تأكيد SSH:\nUser: ${s.username}\nPass: ${s.password}`, kb.confirmCreate("ssh")); }
  if (s.step==="xray_remark") { s.remark=ctx.message.text.trim().slice(0,32); s.step="confirm"; return ctx.reply(`تأكيد ${s.protocol.toUpperCase()}:\nالاسم: ${s.remark}`, kb.confirmCreate(s.protocol)); }
  if (s.step==="edit_ssh_username") { const u=clean(ctx.message.text); if (u.length<3) return ctx.reply("اسم قصير (3 أحرف):"); s.username=u; s.step="edit_ssh_password"; return ctx.reply("🔑  كلمة المرور الجديدة (6 أحرف):"); }
  if (s.step==="edit_ssh_password") { const p=clean(ctx.message.text); if (p.length<6) return ctx.reply("كلمة مرور قصيرة (6 أحرف):"); s.password=p; s.step="confirm_edit"; return ctx.reply(`تأكيد التعديل:\nUser: ${s.username}\nPass: ${s.password}\n⚠️  الاتصالات ستنقطع فور التغيير.`, kb.confirmEditSsh(s.serverId)); }
});

bot.action(/^confirm_create:(ssh|vless|vmess)$/, async ctx => {
  const proto=ctx.match[1], s=sessions.get(ctx.from.id);
  if (!s) return ctx.answerCbQuery("انتهت الجلسة، ابدأ من جديد",{show_alert:true});
  const c=canCreate(ctx.from.id); if (!c.ok) { sessions.delete(ctx.from.id); return ctx.answerCbQuery(c.reason,{show_alert:true}); }
  await ctx.editMessageText("جارٍ الإنشاء... ⏳");
  try {
    const r=proto==="ssh" ? await doSsh(ctx.from.id,s.username,s.password) : await doXray(ctx.from.id,proto,s.remark);
    sessions.delete(ctx.from.id);
    const ce=isAdmin(ctx.from.id)||db.isPremiumActive(String(ctx.from.id));
    const {text,entities}=withEmojiWrap("تم إنشاء سيرفرك بنجاح");
    await ctx.reply(`${text}\n\n${card(r)}${FOOTER}`,{parse_mode:"Markdown",entities,...kb.serverDetail(r.id,r.protocol,ce,false)});
  } catch(e) { sessions.delete(ctx.from.id); await ctx.reply(`❌  خطأ: ${e.message}`, kb.back("menu:main")); }
});

bot.action(/^confirm_edit_ssh:(.+)$/, async ctx => {
  const s=sessions.get(ctx.from.id); if (!s) return ctx.answerCbQuery("انتهت الجلسة",{show_alert:true});
  const r=db.getServer(ctx.match[1]); if (!r) return ctx.answerCbQuery("غير موجود",{show_alert:true});
  await ctx.editMessageText("جارٍ التعديل... ⏳");
  try { const u=await reproSsh(r,s.username,s.password); sessions.delete(ctx.from.id); const {text,entities}=withEmojiWrap("تم التعديل بنجاح"); await ctx.reply(`${text}\n\n${card(u)}${FOOTER}`,{parse_mode:"Markdown",entities,...kb.serverDetail(u.id,"ssh",true,false)}); }
  catch(e) { sessions.delete(ctx.from.id); await ctx.reply(`❌  ${e.message}`, kb.back("menu:my_servers")); }
});

cron.schedule("0 3 * * *", async () => {
  for (const s of db.getExpiredServers()) {
    try { await doDeprovision(s); try { await bot.telegram.sendMessage(s.telegramUserId,`⌛  انتهت صلاحية سيرفرك #${s.id} (${s.protocol}).${FOOTER}`); } catch {} }
    catch(e) { console.error(`expire ${s.id}:`,e.message); }
  }
});

bot.launch();
console.log("Bot started.");
process.once("SIGINT", ()=>bot.stop("SIGINT"));
process.once("SIGTERM",()=>bot.stop("SIGTERM"));
