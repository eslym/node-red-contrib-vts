import APIErrorResponse = VTS.APIErrorResponse;
import {VTS} from "../types";

export class APIError extends Error {
    public code: number;
    public original: APIErrorResponse
    constructor(src: VTS.APIErrorResponse) {
        super(src.data.message);
        this.name = 'APIError';
        Object.setPrototypeOf(this, new.target.prototype);
        this.code = src.data.errorID;
        this.original = src;
    }
}
