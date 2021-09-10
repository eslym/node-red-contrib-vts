import {Node, NodeAPI, NodeContextData, NodeMessageInFlow} from "node-red";
import {Expression} from 'jsonata';

interface AsyncContext {
    get(key: string, store?: string): Promise<unknown>;
    get(key: string[], store?: string): Promise<unknown[]>;
    set(key: string, value: unknown, store?: string): Promise<void>;
    set(key: string[], value: unknown[], store?: string): Promise<void>;
}

function standardPromiseCallback<T>(res: (value: T)=>void, rej: (reason?: any)=>void){
    return (err, val?)=>{
        if(err){
            rej(err);
        } else {
            res(val);
        }
    };
}

export function asyncContext(context: NodeContextData): AsyncContext{
    let get = (key, store)=>new Promise((res, rej)=>{
        context.get(key, store, standardPromiseCallback(res, rej));
    });
    let set = (key, value, store)=>new Promise<void>((res, rej)=>{
        context.set(key, value, store, standardPromiseCallback(res, rej));
    });
    return {get, set} as any;
}

export function asyncRED(RED: NodeAPI){
    let util = RED.util;
    function evaluateNodePropertyAsync<T>(node: Node, prop: string, type: string, msg: NodeMessageInFlow){
        return new Promise<T>((res, rej)=>{
            util.evaluateNodeProperty(prop, type, node, msg, standardPromiseCallback(res, rej));
        });
    }

    function evaluateJSONataExpressionAsync<T>(node: Node, expr: Expression, msg: NodeMessageInFlow){
        return new Promise<T>((res, rej) => {
            util.evaluateJSONataExpression(expr, msg, standardPromiseCallback(res, rej));
        });
    }

    function evaluatePropertyGetter<T>(node: Node, prop: string, type: string): (msg: NodeMessageInFlow)=>Promise<T> | T{
        switch (type){
            case 'msg':
                return (msg) => {
                    let paths = util.normalisePropertyExpression(prop).join('.');
                    return util.getMessageProperty(msg, paths);
                };
            case 'flow': case 'global': case 'env':
                return (msg) => evaluateNodePropertyAsync(node, prop, type, msg);
            case 'bool':
                let bool = /^true$/i.test(prop);
                return ()=>bool as any;
            case 'num':
                let num = Number(prop);
                return ()=>num as any;
            case 'jsonata':
                let expr = util.prepareJSONataExpression(prop, node);
                return (msg) => evaluateJSONataExpressionAsync(node, expr, msg);
            case 'date':
                return ()=>new Date() as any;
            case 'json':
                let obj = JSON.parse(prop);
                return ()=>obj;
            case 'bin':
                let bin = Buffer.from(JSON.parse(prop));
                return ()=>bin as any;
            default:
                return ()=>prop as any;
        }
    }
    return {
        evaluateNodePropertyAsync,
        evaluateJSONataExpressionAsync,
        evaluatePropertyGetter
    }
}
