import winston from "winston";

const { createLogger, format, transports } = winston;
const { combine, timestamp, printf, colorize } = format;

const logFormat = printf(({ level, message, timestamp, ...meta }) => {
  const metaString = Object.keys(meta).length
    ? JSON.stringify(meta, null, 2)
    : "";
  return `[${timestamp}] ${level}: ${message} ${metaString}`;
});

const logger = createLogger({
  level: "info",
  format: combine(timestamp(), colorize(), logFormat),
  transports: [
    new transports.Console(),
    new transports.File({ filename: "logs/bot.log", level: "info" }),
    new transports.File({ filename: "logs/error.log", level: "error" }),
  ],
});

export default logger;
