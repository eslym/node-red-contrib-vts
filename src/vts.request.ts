import {NodeDef, Node, NodeInitializer, NodeConstructor} from "node-red";
import * as path from "path";
import {VTSPluginNode} from "./vts.plugin";
import {asyncRED} from "./util";
import {APIError} from "./error/APIError";
import {serializeError} from "serialize-error";

interface VTSRequestNodeDef extends NodeDef{
    plugin: string;
    request: string;
    requestsrc: string;
    payload: string;
    payloadsrc: string;
}

export interface VTSRequestNode extends Node {}

const FILENAME = path.basename(__filename, path.extname(__filename));

export default module.exports = ((RED)=>{
    const aRED = asyncRED(RED);
    const VTSRequestNode: NodeConstructor<VTSRequestNode, VTSRequestNodeDef, {}> = function (config){
        RED.nodes.createNode(this, config);
        let pluginNode = RED.nodes.getNode(config.plugin) as VTSPluginNode;
        let request = aRED.evaluatePropertyGetter<string>(this, config.request, config.requestsrc);
        let payload = aRED.evaluatePropertyGetter<any>(this, config.payload, config.payloadsrc);
        pluginNode.attachNode(this);
        this.on('input', async (msg, send, done)=>{
            try{
                let result = await pluginNode.callAPI(await request(msg), await payload(msg));
                msg.topic = result.messageType;
                msg.payload = result.data;
                this.send([msg, undefined]);
                if(done) done();
            } catch (e){
                if(e instanceof APIError){
                    msg.payload = e.original.data;
                    msg.topic = e.original.messageType;
                } else {
                    msg.payload = serializeError(e);
                    msg.topic = 'ClientError';
                }
                this.send([undefined, msg]);
                if(done) done(e);
            }
        });
        this.on('close', ()=>{
            pluginNode.detachNode(this);
        });
    }

    RED.nodes.registerType(FILENAME, VTSRequestNode);
}) as NodeInitializer;