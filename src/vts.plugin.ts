import {Node, NodeConstructor, NodeDef, NodeInitializer, NodeStatusFill, NodeStatusShape} from "node-red";
import * as path from "path";
import WebSocket = require('ws');
import Dict = NodeJS.Dict;
import {APIError} from "./error/APIError";
import {ClientError} from "./error/ClientError";
import APIData = VTS.APIData;
import {asyncContext} from "./util";
import {VTS} from "./types";

interface VTSPluginNodeDef extends NodeDef{
    endpoint: string;
    name: string;
    developer: string;
    vtsIcon: string | undefined;
    store: string;
}

export interface VTSPluginNode extends Node {
    callAPI(request: string, data?: any): Promise<APIData<string, any  | void>>;
    attachNode(node: Node);
    detachNode(node: Node);
}

interface PromiseHandler {
    res: (data?: any) => void;
    rej: (error: Error) => void;
    timeout: number;
}

const FILENAME = path.basename(__filename, path.extname(__filename));

export default module.exports = ((RED)=>{
    const VTSPluginNode: NodeConstructor<VTSPluginNode, VTSPluginNodeDef, {}> = function (config) {
        RED.nodes.createNode(this, config);
        let ws: WebSocket;
        let nodes: string[] = [];
        let handlers: Dict<PromiseHandler> = {};
        let timeouts: {c: ()=>void, t: NodeJS.Timeout}[] = [];
        function internalSetTimeout(callback: ()=>void, timeout: number){
            let dummy = ()=>{
                timeouts = timeouts.filter(t=>t.c !== dummy);
                callback();
            }
            timeouts.push({
                c: dummy,
                t: setTimeout(dummy, timeout),
            });
        }
        let updateStatus = (fill: NodeStatusFill, shape: NodeStatusShape, text: string)=>{
            nodes.map(RED.nodes.getNode)
                .forEach((n) => {
                    n.status({fill, shape, text});
                });
        };
        let tryAuth = async () => {
            updateStatus('blue', 'dot', 'authenticating');
            let context = asyncContext(this.context());
            let token = await context.get('token', config.store);
            try{
                if(token){
                    let res = await this.callAPI('AuthenticationRequest', {
                        pluginName: config.name,
                        pluginDeveloper: config.developer,
                        pluginIcon: config.vtsIcon,
                        authenticationToken: token,
                    });
                    if(res.data.authenticated){
                        updateStatus('green', 'dot', 'ready');
                    } else {
                        await context.set('token', undefined, config.store);
                        internalSetTimeout(tryAuth, 1);
                    }
                } else {
                    let res = await this.callAPI('AuthenticationTokenRequest', {
                        pluginName: config.name,
                        pluginDeveloper: config.developer,
                        pluginIcon: config.vtsIcon,
                    });
                    await context.set('token', res.data.authenticationToken, config.store);
                    internalSetTimeout(tryAuth, 1);
                }
            } catch (e){
                this.error(e);
                updateStatus('red', 'dot', 'unauthenticated');
                internalSetTimeout(tryAuth, 20000);
            }
        }
        let checkActiveState = async ()=>{
            try {
                let state = await this.callAPI('APIStateRequest');
                if(!state.data.active){
                    updateStatus('red', 'dot', 'inactive');
                    return internalSetTimeout(checkActiveState, 5000);
                }
                return tryAuth();
            } catch (e){
                this.error(e);
                updateStatus('red', 'dot', 'error');
                return internalSetTimeout(checkActiveState, 5000);
            }
        }
        let wsEvents = {
            error: (error: Error)=>{
                this.error(error);
                updateStatus('red', 'dot', 'error');
            },
            message: (data: WebSocket.Data)=>{
                try {
                    if(typeof data !== 'string'){
                        data = data.toString('utf-8');
                    }
                    let res: VTS.APIData<any, any> = JSON.parse(data);
                    if(res.apiName !== 'VTubeStudioPublicAPI'){
                        // noinspection ExceptionCaughtLocallyJS
                        throw new TypeError('Not a VtubeStudio API Message');
                    }
                    if(handlers[res.requestID]){
                        clearTimeout(handlers[res.requestID].timeout);
                        if(res.messageType === 'APIError') {
                            handlers[res.requestID].rej(new APIError(res));
                        } else {
                            handlers[res.requestID].res(res);
                        }
                        delete handlers[res.requestID];
                    }
                    if(res.messageType === 'APIError'){
                        switch (res.data.errorID){
                            case 8:
                                updateStatus('red', 'dot', 'invalidated');
                                return tryAuth();
                            case 1:
                                return checkActiveState();
                        }
                    }
                } catch (error) {
                    this.error(error);
                    ws.close();
                }
            },
            close: ()=>{
                updateStatus('red', 'dot', 'disconnected');
                let error = new ClientError('Websocket disconnected');
                for (let id in handlers) {
                    clearTimeout(handlers[id].timeout);
                    handlers[id].rej(error);
                    delete handlers[id];
                }
                for (let event in wsEvents){
                    ws.off(event, wsEvents[event]);
                }
                ws = undefined;
                internalSetTimeout(tryConnect, 5000);
            },
            open: ()=>{
                updateStatus('green', 'dot', 'connected');
                return checkActiveState();
            }
        };
        this.attachNode = (node)=>{
            if(nodes.indexOf(node.id) >= 0)
                return;
            nodes.push(node.id);
        };
        this.detachNode = (node) => {
            let i = nodes.indexOf(node.id);
            if(i < 0)
                return;
            nodes = nodes.splice(i, 1);
        }
        this.callAPI = (request, data, timeout: number = 5000) => new Promise((res, rej) => {
            if(ws === undefined || ws.readyState !== WebSocket.OPEN){
                let error = new ClientError('Client not ready');
                return rej(error);
            }
            let req: APIData<any, any> = {
                apiName: "VTubeStudioPublicAPI",
                apiVersion: '1.0',
                messageType: request,
                requestID: RED.util.generateId(),
                data: data,
            }
            let handle = {
                res, rej,
                timeout: setTimeout(()=>{
                    delete handle[req.requestID];
                    let error = new ClientError('Request timeout.');
                    rej(error);
                }, timeout)
            };
            handlers[req.requestID] = handle as any;
            ws.send(JSON.stringify(req), (err) => {
                if(err){
                    clearTimeout(handle.timeout);
                    delete handle[req.requestID];
                    let error = new ClientError('Error sending request', err);
                    rej(error);
                }
            });
        });
        let tryConnect = ()=>{
            try{
                ws = new WebSocket(config.endpoint);
                for (let event in wsEvents){
                    ws.on(event, wsEvents[event]);
                }
            } catch (e) {
                updateStatus('red', 'dot', 'invalid config');
            }
        }
        tryConnect();
        this.on('close', (removed, done)=>{
            for (let event in wsEvents){
                ws.off(event, wsEvents[event]);
            }
            let error = new ClientError('Websocket disconnected');
            for (let id in handlers) {
                clearTimeout(handlers[id].timeout);
                handlers[id].rej(error);
                delete handlers[id];
            }
            timeouts.forEach((t)=>{
                clearTimeout(t.t);
            });
            timeouts = [];
            ws.close();
            ws = undefined;
            done();
        });
    };
    RED.nodes.registerType(FILENAME, VTSPluginNode);
}) as NodeInitializer;