import { IncomingMessage, ServerResponse } from "http";

export interface File {}

export interface IncomingMessageFile extends IncomingMessage {
	files: Array<File>;
}

type FileRequestHandler = (
	req: IncomingMessageFile,
	res: ServerResponse
) => any;
type RequestHandler = (req: IncomingMessage, res: ServerResponse) => any;

export function upload(f: FileRequestHandler): RequestHandler;
export function move(f: File, path: string): undefined;
