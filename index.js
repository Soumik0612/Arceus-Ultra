const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore
} = require("@whiskeysockets/baileys");
const P = require("pino");
const fs = require("fs-extra");
const qrcode = require("qrcode-terminal");
const config = require("./config");

const state = {
  startTime: Date.now(),
  mode: config.MODE,
  prefix: config.PREFIX,
  botName: config.BOT_NAME,
  ownerName: config.OWNER_NAME,
  ownerNumber: config.OWNER_NUMBER,
  sudo: new Set(config.SUDO_NUMBERS || []),
  warnings: new Map(),
  settings: new Map()
};

const COMMANDS = {
  general: [
    "alive","apk","attp","botinfo","botstatus","checkwa","circlesticker","crop","delpp",
    "fancy","getpp","getsettings","google","image2","define","news2","groupinfo","groupstats",
    "help","img","inviteinfo","lid","menu","myactivity","owner","pair","ping","poll","qr",
    "reshare","setprofile","simage","ssweb","sticker","take","telegramsticker","time","tts",
    "uptime","write"
  ],
  ai: ["ai","chatgpt","gpt4o","claude","gemini","mistral","copilot","metaai","aiLlama","blackbox","bard","perplexity","venice","o3"],
  admin: [
    "add","all","antiall","antiaudio","antibadword","antibot","anticontact","antidemote",
    "antiforward","antigif","antigroupmention","antiimage","antikickall","antilink",
    "antipromote","antispam","antisticker","antitag","antitagadmins","antivideo","antiviewonce",
    "approve","autosticker","chatbot","clean","demote","demoteall","disp","antiforeign",
    "getgroupdesc","getgroupprofile","goodbye","grouplink","hidetag","join","kick","kickactive",
    "kickinactive","killgc","listoffline","listonline","mute","promote","reject","resetwarn",
    "revokelink","setgdesc","setgname","setgoodbye","setgroupprofile","setsticker","setwelcome",
    "staff","tagall","unmute","vcf","warn","welcome"
  ],
  owner: [
    "addsudo","alwaysonline","antibug","anticall","anticallmsg","antidelete","antideletestatus",
    "antiedit","autodownloadstatus","autoreact","autoread","autorecording","autorecordtype",
    "autostatusemoji","autostatusreact","autostatusview","autotyping","block","broadcast",
    "calllink","cat","creategc","delete","dgns","forward","getjid","getsession","groupstatus",
    "invite","leave","mode","mygroups","newsletter","pinger","readreceipts","removesudo",
    "resetbot","restart","savestatus","setbotname","setbotpp","setfont","setmaxwarn","setmenu",
    "setmenuimage","setnewsletter","setownername","setownernumber","setpack","setprefix",
    "settimezone","shutdown","stealth","sudolist","disable","enable","tostatus","unblock","viewonce"
  ]
};

function uptime() {
  const s = Math.floor((Date.now() - state.startTime) / 1000);
  const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600);
  const m = Math.floor(s % 3600 / 60), sec = s % 60;
  return `${d}d ${h}h ${m}m ${sec}s`;
}

function menu() {
  const section = (title, arr) =>
    `┏━━❐◈  \`${title}\` ◈\n` +
    arr.map(x => `┃◈${x}`).join("\n") + "\n┗━━━━━━━━━━━━━━━\n";

  return [
    `╭━━━〔 ${state.botName} 〕━━━╮`,
    `┃ Prefix: ${state.prefix}`,
    `┃ Owner: ${state.ownerName}`,
    `┃ Mode: ${state.mode}`,
    `┃ Platform: WhatsApp`,
    `┃ Uptime: ${uptime()}`,
    `╰━━━━━━━━━━━━━━━━╯`,
    "",
    section("GEN-CMD", COMMANDS.general),
    section("AI-CMD", COMMANDS.ai),
    section("ADM-CMD", COMMANDS.admin),
    section("OWN-CMD", COMMANDS.owner)
  ].join("\n");
}

function normalizeJid(number) {
  const digits = String(number || "").replace(/\D/g, "");
  return digits ? `${digits}@s.whatsapp.net` : "";
}

function isOwner(sender) {
  const n = sender.split("@")[0];
  return n === state.ownerNumber || state.sudo.has(n);
}

async function startBot() {
  await fs.ensureDir(config.AUTH_DIR);
  const { state: authState, saveCreds } = await useMultiFileAuthState(config.AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: {
      creds: authState.creds,
      keys: makeCacheableSignalKeyStore(authState.keys, P({ level: "silent" }))
    },
    logger: P({ level: "silent" }),
    browser: [state.botName, "Chrome", "1.0.0"],
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: false
  });

  sock.ev.on("creds.update", saveCreds);

  if (!sock.authState?.creds?.registered) {
    console.log(`\n${state.botName} — WhatsApp pairing mode`);
    const phone = String(config.PAIRING_NUMBER || "").replace(/\D/g, "");
    if (phone) {
      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(phone);
          console.log(`Pairing code: ${code}`);
          console.log("WhatsApp → Linked devices → Link a device → Link with phone number instead.");
        } catch (e) {
          console.error("Pairing error:", e.message);
        }
      }, 3000);
    } else {
      console.log("Set PAIRING_NUMBER in config.js, then restart.");
    }
  }

  sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) qrcode.generate(qr, { small: true });
    if (connection === "open") {
      console.log(`${state.botName} connected.`);
    }
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      console.log(`Connection closed${loggedOut ? " (logged out)" : ""}.`);
      if (!loggedOut) setTimeout(startBot, 5000);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg?.message || msg.key.fromMe) return;

    const jid = msg.key.remoteJid;
    if (!jid || jid === "status@broadcast") return;

    const body =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.videoMessage?.caption ||
      "";

    if (!body.startsWith(state.prefix)) return;

    const parts = body.slice(state.prefix.length).trim().split(/\s+/);
    const command = (parts.shift() || "").toLowerCase();
    const args = parts;

    const all = new Set(Object.values(COMMANDS).flat().map(x => x.toLowerCase()));
    if (!all.has(command)) {
      await sock.sendMessage(jid, { text: `Unknown command. Use ${state.prefix}menu` });
      return;
    }

    const ownerOnly = COMMANDS.owner.map(x => x.toLowerCase()).includes(command);
    if (ownerOnly && !isOwner(msg.key.participant || msg.key.remoteJid)) {
      await sock.sendMessage(jid, { text: "Owner only command." });
      return;
    }

    try {
      await handleCommand(sock, msg, command, args);
    } catch (err) {
      console.error(command, err);
      await sock.sendMessage(jid, { text: `Command error: ${err.message}` });
    }
  });
}

async function handleCommand(sock, msg, command, args) {
  const jid = msg.key.remoteJid;
  const sender = msg.key.participant || jid;

  if (command === "menu" || command === "help") return sock.sendMessage(jid, { text: menu() });
  if (command === "alive") return sock.sendMessage(jid, { text: `╭─〔 ${state.botName} 〕─╮\n┃ Online ✅\n┃ Uptime: ${uptime()}\n┃ Prefix: ${state.prefix}\n╰────────────────╯` });
  if (command === "ping") return sock.sendMessage(jid, { text: "Pong! 🏓" });
  if (command === "uptime") return sock.sendMessage(jid, { text: `Uptime: ${uptime()}` });
  if (command === "botstatus" || command === "botinfo") {
    return sock.sendMessage(jid, { text: `${state.botName}\nOwner: ${state.ownerName}\nPrefix: ${state.prefix}\nMode: ${state.mode}\nUptime: ${uptime()}` });
  }
  if (command === "owner") return sock.sendMessage(jid, { text: `Owner: ${state.ownerName}\nNumber: ${state.ownerNumber}` });
  if (command === "time") return sock.sendMessage(jid, { text: new Date().toLocaleString(config.TIMEZONE) });

  if (command === "setprefix") {
    const p = args[0];
    if (!p || p.length > 3) return sock.sendMessage(jid, { text: `Usage: ${state.prefix}setprefix !` });
    state.prefix = p;
    return sock.sendMessage(jid, { text: `Prefix changed to: ${p}` });
  }
  if (command === "setbotname") {
    state.botName = args.join(" ") || state.botName;
    return sock.sendMessage(jid, { text: `Bot name: ${state.botName}` });
  }
  if (command === "setownername") {
    state.ownerName = args.join(" ") || state.ownerName;
    return sock.sendMessage(jid, { text: `Owner name updated.` });
  }
  if (command === "mode") {
    const m = (args[0] || "").toLowerCase();
    if (!["public", "private"].includes(m)) return sock.sendMessage(jid, { text: "Usage: .mode public|private" });
    state.mode = m;
    return sock.sendMessage(jid, { text: `Mode: ${m}` });
  }
  if (command === "sudolist") return sock.sendMessage(jid, { text: `Sudo:\n${[...state.sudo].map(x => `• ${x}`).join("\n") || "None"}` });
  if (command === "addsudо".toLowerCase()) {
    const n = (args[0] || "").replace(/\D/g, "");
    if (!n) return sock.sendMessage(jid, { text: "Usage: .addsudo 8801XXXXXXXXX" });
    state.sudo.add(n);
    return sock.sendMessage(jid, { text: `Added sudo: ${n}` });
  }
  if (command === "removesudo") {
    const n = (args[0] || "").replace(/\D/g, "");
    state.sudo.delete(n);
    return sock.sendMessage(jid, { text: `Removed sudo: ${n}` });
  }
  if (command === "disable") return sock.sendMessage(jid, { text: "Command acknowledged. Add your preferred disable logic here." });
  if (command === "enable") return sock.sendMessage(jid, { text: "Bot features enabled." });
  if (command === "resetbot") return sock.sendMessage(jid, { text: "Reset requested. Restart the Node.js process to fully reset runtime state." });
  if (command === "restart") {
    await sock.sendMessage(jid, { text: "Restarting..." });
    setTimeout(() => process.exit(0), 1000);
    return;
  }
  if (command === "shutdown") {
    await sock.sendMessage(jid, { text: "Shutting down..." });
    setTimeout(() => process.exit(0), 1000);
    return;
  }

  // Safe starter responses for the remaining command registry.
  const implemented = ["sticker","apk","attp","google","image2","define","news2","groupinfo","groupstats",
    "img","inviteinfo","lid","poll","qr","reshare","setprofile","simage","ssweb","take","telegramsticker",
    "tts","write","ai","chatgpt","gpt4o","claude","gemini","mistral","copilot","metaai","aiLlama","blackbox",
    "bard","perplexity","venice","o3"];
  if (implemented.map(x => x.toLowerCase()).includes(command)) {
    return sock.sendMessage(jid, { text: `${command}: command registered. Connect your API/feature handler in handlers/ to enable the full function.` });
  }

  return sock.sendMessage(jid, { text: `${command}: command registered in ARCEUS XD.` });
}

process.on("unhandledRejection", err => console.error("Unhandled:", err));
process.on("uncaughtException", err => console.error("Uncaught:", err));

startBot().catch(err => {
  console.error(err);
  process.exit(1);
});
