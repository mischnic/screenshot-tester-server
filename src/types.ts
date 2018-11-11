import { Binary } from "mongodb";

export interface MapType<T> {
	[key: string]: T;
}

export interface DataDocument {
	files: FileList;
	data: DataList;
	id: string;
	failed: FailedList;
	comment_url: string;
}

export interface FileList {
	[platform: string]: MapType<Binary>;
}

export interface DataList {
	[platform: string]: FileDescription[];
}

export interface FileDescription {
	name: string;
	path: string;
	type: FileDescriptionType;
}

export enum FileDescriptionType {
	ref,
	res,
	diff
}
export interface FailedList {
	[platform: string]: string[];
}
