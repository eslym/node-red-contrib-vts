export class ClientError extends Error {
    public from: Error
    constructor(message: string, from?: Error) {
        super(message);
        this.name = 'ClientError';
        Object.setPrototypeOf(this, new.target.prototype);
        this.from = from;
    }
}
