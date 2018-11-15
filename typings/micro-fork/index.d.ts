/// <reference types="node" />

import { IncomingMessage, ServerResponse } from "http";

export interface MapType<T> {
	[key: string]: T;
}

type RequestHandler = (req: IncomingMessage, res: ServerResponse) => any;

export interface IncomingMessageFork extends IncomingMessage {
	params: MapType<string>;
	query: MapType<string | string[]>;
}

type RequestHandlerFork = (
	req: IncomingMessageFork,
	res: ServerResponse
) => any;

interface Route {}

export function get(
	path: String,
	handler: RequestHandlerFork,
	store?: any
): Route;
export function post(
	path: String,
	handler: RequestHandlerFork,
	store?: any
): Route;
export function put(
	path: String,
	handler: RequestHandlerFork,
	store?: any
): Route;
export function patch(
	path: String,
	handler: RequestHandlerFork,
	store?: any
): Route;
export function del(
	path: String,
	handler: RequestHandlerFork,
	store?: any
): Route;
export function head(
	path: String,
	handler: RequestHandlerFork,
	store?: any
): Route;
export function options(
	path: String,
	handler: RequestHandlerFork,
	store?: any
): Route;

export function router(options?: any): (...routes: Route[]) => RequestHandler;
