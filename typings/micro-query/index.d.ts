/// <reference types="node" />

import { IncomingMessage } from "http";

interface QueryParams {
	[key: string]: string[] | string;
}

export default function query(req: IncomingMessage): QueryParams;
