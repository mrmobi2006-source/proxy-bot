const fs = require("fs");
const path = require("path");

const logsDir = path.join(__dirname, "..", "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logFile = path.join(logsDir, `bot-${new Date().toISOString().split("T")[0]}.log`);

function formatLog(level, message, data = "") {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level}] ${message} ${data}\n`;
}

function log(level, message, data) {
  const logEntry = formatLog(level, message, data);
  console.log(logEntry.trim());
  
  try {
    fs.appendFileSync(logFile, logEntry);
  } catch (err) {
    console.error("Failed to write to log file:", err.message);
  }
}

module.exports = {
  info: (msg, data) => log("INFO", msg, data),
  error: (msg, data) => log("ERROR", msg, data),
  warn: (msg, data) => log("WARN", msg, data),
  debug: (msg, data) => log("DEBUG", msg, data),
};
