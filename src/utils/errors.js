/**
 * An error whose message is safe (and intended) to show to the user who ran a command.
 */
export class UserError extends Error {
    constructor(message) {
        super(message);
        this.name = 'UserError';
    }
}

/**
 * Raised when an audio stream could not be created for a track.
 */
export class StreamError extends Error {
    constructor(message, { cause } = {}) {
        super(message, { cause });
        this.name = 'StreamError';
    }
}
