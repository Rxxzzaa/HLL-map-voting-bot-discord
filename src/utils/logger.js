const util = require('util');
const winston = require('winston');

function formatExtras(info) {
    const splat = info[Symbol.for('splat')] || [];
    if (!splat.length) {
        return '';
    }

    const extraText = splat.map((value) => {
        if (value instanceof Error) {
            return value.stack || value.message;
        }
        if (typeof value === 'string') {
            return value;
        }
        return util.inspect(value, { depth: 5, colors: false, compact: true, breakLength: 120 });
    }).join(' ');

    return extraText ? ` ${extraText}` : '';
}

const baseFormat = winston.format.combine(
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.timestamp(),
    winston.format.printf((info) => {
        const message = info.stack || info.message;
        return `${info.timestamp} [${String(info.level).toUpperCase()}]: ${message}${formatExtras(info)}`;
    })
);

const consoleFormat = winston.format.combine(
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.colorize(),
    winston.format.timestamp(),
    winston.format.printf((info) => {
        const message = info.stack || info.message;
        return `${info.timestamp} [${info.level}]: ${message}${formatExtras(info)}`;
    })
);

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: baseFormat,
    transports: [
        new winston.transports.Console({ format: consoleFormat }),
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' })
    ]
});

module.exports = logger;
