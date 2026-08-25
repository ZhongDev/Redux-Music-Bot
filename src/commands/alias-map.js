/**
 * Shorthand aliases for the more commonly used commands, mapping the alias name to the real command.
 * Each alias is registered with Discord as its own slash command that shares the target's handler and
 * options, so `/p` behaves exactly like `/play`. Keep this list intentionally small — only the commands
 * people reach for constantly deserve a shortcut.
 * @type {Readonly<Record<string, string>>}
 */
export const aliasMap = Object.freeze({
    p: 'play',
    s: 'skip',
    q: 'queue',
    np: 'nowplaying',
    vol: 'volume',
    sh: 'shuffle',
    prev: 'previous',
    rm: 'remove',
    dc: 'leave',
    l: 'loop',
});
