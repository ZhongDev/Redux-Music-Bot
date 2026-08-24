const LEVELS = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40, silent: 100 });

function timestamp() {
    return new Date().toISOString();
}

/**
 * Tiny leveled logger. Deliberately dependency-free; swap for pino/winston if you outgrow it.
 * @param {string} level
 * @param {string} [scope]
 */
export function createLogger(level = 'info', scope = '') {
    const threshold = LEVELS[level] ?? LEVELS.info;
    const prefix = scope ? `[${scope}] ` : '';

    const log = (name, writer) => (message, ...rest) => {
        if (LEVELS[name] < threshold) return;
        writer(`${timestamp()} ${name.toUpperCase().padEnd(5)} ${prefix}${message}`, ...rest);
    };

    return {
        level,
        debug: log('debug', console.debug),
        info: log('info', console.log),
        warn: log('warn', console.warn),
        error: log('error', console.error),
        child: (childScope) => createLogger(level, scope ? `${scope}:${childScope}` : childScope),
    };
}
