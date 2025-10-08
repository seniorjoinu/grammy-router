import type { RouterState, z } from "@joinu/grammy-router";
import { DEFAULT_ROUTE } from "./utils.ts";

export interface IRouterStorage {
	get<ARG extends z.ZodType>(userId: string): Promise<RouterState<ARG>>;
	set<ARG extends z.ZodType>(
		userId: string,
		state: RouterState<ARG>
	): Promise<void>;
}

export class InMemoryRouterStorage implements IRouterStorage {
	private storage: Partial<Record<string, RouterState<any>>> = {};

	constructor() {}

	get<ARG extends z.ZodType>(userId: string): Promise<RouterState<ARG>> {
		const v = this.storage[userId];
		if (!v)
			return Promise.resolve({ path: DEFAULT_ROUTE, props: undefined as any });

		return Promise.resolve(v);
	}

	set<ARG extends z.ZodType>(
		userId: string,
		state: RouterState<ARG>
	): Promise<void> {
		this.storage[userId] = state;
		return Promise.resolve();
	}
}

export class DenoKvRouterStorage implements IRouterStorage {
	constructor(
		private kv: Deno.Kv,
		private prefix: Deno.KvKey = ["grammyrouter"]
	) {}

	async get<ARG extends z.ZodType>(userId: string): Promise<RouterState<ARG>> {
		const { value } = await this.kv.get<RouterState<ARG>>([
			...this.prefix,
			userId,
		]);
		if (!value) return { path: DEFAULT_ROUTE, props: undefined as any };
		return value;
	}

	async set<ARG extends z.ZodType>(
		userId: string,
		state: RouterState<ARG>
	): Promise<void> {
		await this.kv.set([...this.prefix, userId], state);
	}
}
