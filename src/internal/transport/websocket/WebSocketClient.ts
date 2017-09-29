import * as exitHook from "async-exit-hook";
import axios from "axios";
import * as promiseRetry from "promise-retry";
import * as WebSocket from "ws";
import { HandlerResult } from "../../../HandlerResult";
import { logger } from "../../util/logger";
import { CommandIncoming, EventIncoming, isCommandIncoming, isEventIncoming } from "../TransportEventHandler";
import { sendMessage } from "./WebSocketMessageClient";
import { RegistrationConfirmation, WebSocketTransportEventHandler } from "./WebSocketTransportEventHandler";

export class WebSocketClient {

    constructor(private registrationCallback: () => any,
                private options: WebSocketClientOptions,
                private handler: WebSocketTransportEventHandler) {

        const retryOptions = {
            retries: 5,
            factor: 3,
            minTimeout: 1 * 1000,
            maxTimeout: 60 * 1000,
            randomize: true,
        };

        promiseRetry(retryOptions, (retry, retryCount) => {
            if (retryCount > 1) {
                logger.warn("Retrying registration due to previous error");
            }
            return register(this.registrationCallback, options, handler)
                .then(registration =>
                    connect(this.registrationCallback, registration, this.options, this.handler))
                .catch(retry);
        });
    }
}

let reconnect = true;

function connect(registrationCallback: () => any, registration: RegistrationConfirmation,
                 options: WebSocketClientOptions, handler: WebSocketTransportEventHandler): Promise<WebSocket> {

    // Functions are inline to avoid "this" peculiarities
    function invokeCommandHandler(chr: CommandIncoming):
        Promise<HandlerResult> {
        return handler.onCommand(chr);
    }

    function invokeEventHandler(e: EventIncoming):
        Promise<HandlerResult[]> {
        return handler.onEvent(e);
    }

    return new Promise<WebSocket>(resolve => {
        logger.info(`Opening WebSocket connection`);
        const ws = new WebSocket(registration.url);

        ws.on("open", function open() {
            handler.onConnection(this);
            resolve(ws);
        });

        ws.on("message", function incoming(data: WebSocket.Data) {
            const request = JSON.parse(data as string);

            if (isPing(request)) {
                sendMessage({ pong: request.ping }, this, false);
            } else {

                if (isCommandIncoming(request)) {
                    return invokeCommandHandler(request);
                } else if (isEventIncoming(request)) {
                    return invokeEventHandler(request);
                } else {
                    throw new Error(`Don't know how to handle '${data}'`);
                }
            }
        });

        // On close this websocket is meant to reconnect
        ws.on("close", function close(code: number, message: string) {
            if (code) {
                logger.warn(`WebSocket connection closed with ${code}: ${message}`);
            } else {
                logger.warn(`WebSocket connection closed`);
            }
            // Only attempt to reconnect if we aren't shutting down
            if (reconnect) {
                register(registrationCallback, options, handler)
                    .then(reg => connect(registrationCallback, reg, options, handler));
            }
        });

        exitHook(() => {
            reconnect = false;
            ws.close();
            logger.info("Closing WebSocket connection");
        });
    });
}

function register(registrationCallback: () => any, options: WebSocketClientOptions,
                  handler: WebSocketTransportEventHandler): Promise<RegistrationConfirmation> {
    const registrationPayload = registrationCallback();

    logger.info(`Registering ${registrationPayload.name}@${registrationPayload.version} ` +
        `with Atomist at '${options.registrationUrl}': ${JSON.stringify(registrationPayload)}`);

    return axios.post(options.registrationUrl, registrationPayload,
        { headers: { Authorization: `token ${options.token}` } })
        .then(result => {
            const registration = result.data as RegistrationConfirmation;

            registration.name = registrationPayload.name;
            registration.version = registrationPayload.version;

            handler.onRegistration(registration);
            return registration;
        })
        .catch(error => {
            if (error.response && error.response.status === 409) {
                logger.error(`Registration failed because a session for ${registrationPayload.name}` +
                    `@${registrationPayload.version} is already active`);
            } else if (error.response && error.response.status === 400) {
                logger.error(`Registration payload for for ${registrationPayload.name}` +
                    `@${registrationPayload.version} was invalid`);
                process.exit(1);
            } else {
                logger.error("Registration failed with '%s'", error);
            }
            throw error;
        });
}

export interface WebSocketClientOptions {
    registrationUrl: string;
    graphUrl: string;
    token: string;
}

function isPing(a: any): a is Ping {
    return a.ping != null;
}

interface Ping {
    ping: string;
}
