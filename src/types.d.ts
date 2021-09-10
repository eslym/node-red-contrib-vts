import {EditorRED} from "node-red";

export declare namespace VTS {
    interface APIError {
        errorID: number;
        message: string;
    }

    interface APIData<T extends String, D>{
        apiName: "VTubeStudioPublicAPI";
        apiVersion: string;
        timestamp?: number;
        requestID?: string;
        messageType: T;
        data: D;
    }

    interface APIErrorResponse extends APIData<'APIError', APIError>{}
}

declare global {
    const RED: EditorRED;
}