export function unreachable(msg?: string): never {
	throw new Error(msg ? "Unreachable: " + msg : "Unreachable");
}

export function panic(msg?: string): never {
	throw new Error(msg ? "Panic: " + msg : "Panic");
}

export type MaybePromise<T> = Promise<T> | T;

export const DEFAULT_ROUTE = "default";
