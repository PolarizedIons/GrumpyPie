'use strict';

const XRegExp = require('xregexp');

const standardPatterns = {
    nickname: /[A-Za-z0-9[\]\\`_^{}|-]+/,
    hostmask: /\S+/, // Networks allow for extended masks with $ and such, so it might not be too clever to limit this..
    channel: /#+[A-Za-z0-9]+/
};

module.exports = (bot) => {
    const commands = {};
    const dispatcher = {};
    const requireMethods = {
        operator: (user, channel) => { return bot.permissions.isAdmin(user) || bot.permissions.isOperator(user, channel); },
        admin: bot.permissions.isAdmin,
        anybody: () => { return true; }
    };

    const executeCommand = (nick, channel, command, args) => {
        const match = command.pattern.exec(args);
        if (match) {
            bot.users.get(nick)
                .then((whois) => {
                    const user = whois.user;
                    if (command.requires(user, channel)) {
                        const params = [{
                            nick: nick,
                            user: user,
                            channel: channel,
                            args: args
                        }];
                        for (let j = 1; j < match.length; j++) {
                            params.push(match[j]);
                        }
                        return command.execute.apply(null, params);
                    } else if (user === null) {
                        throw "You don't have permission to perform this command. You will need to be authed before you can try!";
                    } else {
                        throw "You don't have permission to perform this command.";
                    }
                })
                .catch((error) => {
                    bot.notify(nick, `Sorry, but I can't do that. ${error}`);
                });
            return true;
        } else {
            return false;
        }
    };

    dispatcher.addCommands = (plugin, list) => {
        for (const command in list) {
            const entries = [];
            let fallback = null;
            let usage = null;

            for (let i = 0; i < list[command].length; i++) {
                const item = list[command][i];
                const defaultMsg = `Command entry in ${command} needs to either be a usage string (1 only) or an object containing an 'execute' function and optionally 'requires' & 'pattern'.`;
                if (typeof item === 'object') {
                    if (typeof item.execute !== 'function') {
                        throw new Error(`${defaultMsg} 'execute' is required and must be a function.`);
                    }
                    if (typeof item.pattern === 'undefined') {
                        throw new Error(`${defaultMsg} 'pattern' is required and must be a regex pattern.`);
                    }
                    const requireMethod = requireMethods[item.requires || 'anybody'];
                    if (typeof requireMethod !== 'function') {
                        throw new Error(`${defaultMsg} 'requires' must one of: ${Object.keys(requireMethods).join(' / ')}`);
                    }
                    entries.push({
                        execute: item.execute,
                        pattern: XRegExp.build(item.pattern, standardPatterns),
                        requires: requireMethod
                    });
                } else if (typeof item === 'string') {
                    if (usage !== null) {
                        throw new Error(`${defaultMsg} Found multiple usage strings.`);
                    }
                    usage = item;
                } else {
                    throw new Error(`${defaultMsg} Found a ${typeof item}`);
                }
            }

            if (entries.length === 0 && fallback === null) {
                throw new Error(`Command entry ${command} contains no callbacks. What should it do?!`);
            }

            commands[command] = {
                entries: entries,
                fallback: fallback,
                usage: usage,
                plugin: plugin
            };
        }
    };

    dispatcher.runCommand = (nick, channel, message) => {
        const space = message.indexOf(' ');
        let name = message;
        let args = '';
        if (space > -1) {
            name = message.substr(0, space);
            args = message.substr(space + 1);
        }
        if (typeof commands[name] === 'object') {
            const command = commands[name];
            for (let i = 0; i < command.entries.length; i++) {
                const entry = command.entries[i];
                if (executeCommand(nick, channel, entry, args)) {
                    return;
                }
            }
            if (command.usage) {
                bot.notify(nick, command.usage);
            }
        }
    };

    return dispatcher;
};
