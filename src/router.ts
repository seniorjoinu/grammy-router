import { z } from "zod";
import { type Context, Keyboard } from "grammy";
import type { ParseMode } from "grammy/types";
import { Router as GrammyRouter } from "@grammyjs/router";
import { type MaybePromise, DEFAULT_ROUTE, panic } from "./utils.ts";
import type {
	CtxAndProps,
	InputMedia,
	Route,
	RouteBuilder,
	RouteBuilderResult,
	RouteKeysTextHandler,
} from "./types.ts";
import type { IRouterStorage } from "./storage.ts";

function routeFactory<C extends Context>(): <ARG extends z.ZodType>(
	path: string,
	arg: ARG,
	builder: RouteBuilder<ARG, C>,
	storage: IRouterStorage
) => Promise<Route<ARG, C>> {
	return async function route<ARG extends z.ZodType>(
		path: string,
		arg: ARG,
		builder: RouteBuilder<ARG, C>,
		storage: IRouterStorage
	): Promise<Route<ARG, C>> {
		const { onEnter, keys, other } = await builder();

		const textKeyHandlers: Partial<
			Record<string, RouteKeysTextHandler<ARG, C>>
		> = {};

		const _match: (ctx: C) => MaybePromise<void> = async (ctx) => {
			const userId = ctx.from?.id.toString();
			if (!userId) panic("Invalid use of the router - no user id provided");

			const state = await storage.get<ARG>(userId);
			if (state.path != path)
				panic("Expected path is different from the actual");

			const ctxAndProps = { ctx, route: state.path, props: state.props };

			const keyboard = new Keyboard();
			await populateHandles(ctxAndProps, keys, textKeyHandlers, keyboard);

			const options = Object.keys(textKeyHandlers);
			const pathBefore = state.path;

			if (ctx.message?.text && options.includes(ctx.message.text)) {
				const text = ctx.message.text;
				if (!text) return;

				const handler = textKeyHandlers[text];
				if (!handler) return;

				await handler(ctxAndProps);
			} else if (other) {
				await other(ctxAndProps);
			}

			const newState = await storage.get<ARG>(userId);
			const pathAfter = newState.path;
			const newCtxAndProps = {
				ctx,
				route: newState.path,
				props: newState.props,
			};

			if (pathBefore === pathAfter) {
				await enterRoute(newCtxAndProps, onEnter, keyboard);
			}
		};

		const navigate = async (ctx: C, props: z.infer<ARG>): Promise<void> => {
			const userId = ctx.from?.id.toString();
			if (!userId) panic("Invalid use of the router - no user id provided");

			await arg.parseAsync(props);

			const ctxAndProps = { ctx, route: path, props };
			await storage.set(userId, {
				path: ctxAndProps.route,
				props: ctxAndProps.props,
			});

			const keyboard = new Keyboard();
			await populateHandles(ctxAndProps, keys, textKeyHandlers, keyboard);
			await enterRoute(ctxAndProps, onEnter, keyboard);
		};

		return { navigate, _match, _path: path };
	};
}

export class Router<C extends Context> extends GrammyRouter<C> {
	private factory = routeFactory<C>();

	static async create<C extends Context>(
		storage: IRouterStorage,
		defaultRouteBuilder: RouteBuilder<z.ZodUndefined, C>
	): Promise<Router<C>> {
		const r = new Router<C>(storage);
		await r.on(DEFAULT_ROUTE, z.undefined(), defaultRouteBuilder);

		return r;
	}

	public async on<ARG extends z.ZodType>(
		path: string,
		arg: ARG,
		builder: RouteBuilder<ARG, C>
	): Promise<(ctx: C, props: z.infer<ARG>) => MaybePromise<void>> {
		const route = await this.factory(path, arg, builder, this.storage);
		this.route(route._path, async (ctx) => await route._match(ctx as any));

		return route.navigate;
	}

	private constructor(private storage: IRouterStorage) {
		super(async (ctx) => {
			const userId = ctx.from?.id?.toString();
			if (!userId) panic("Invalid usage of the router - no user id provided");

			const { path } = await this.storage.get(userId);
			return path;
		});
	}
}

async function enterRoute<C extends Context, ARG extends z.ZodType>(
	ctxAndProps: CtxAndProps<ARG, C>,
	onEnter: RouteBuilderResult<ARG, C>["onEnter"],
	keyboard: Keyboard
) {
	let content: string = "",
		parseMode: ParseMode | undefined = undefined,
		mediaGroup: InputMedia[] | undefined = undefined;

	const r = await onEnter(ctxAndProps);

	if (!r) return;

	if (typeof r === "string") {
		content = r;
	} else {
		content = r.text;
		switch (r.markup) {
			case "plain": {
				break;
			}
			case "md": {
				parseMode = "Markdown";
				break;
			}
			case "md2": {
				parseMode = "MarkdownV2";
				break;
			}
			case "html": {
				parseMode = "HTML";
				break;
			}
		}
		mediaGroup = r.mediaGroup;
	}

	await ctxAndProps.ctx.reply(content, {
		parse_mode: parseMode,
		reply_markup: keyboard,
	});

	if (mediaGroup) {
		await ctxAndProps.ctx.replyWithMediaGroup(mediaGroup);
	}
}

async function populateHandles<ARG extends z.ZodType, C extends Context>(
	ctxAndProps: CtxAndProps<ARG, C>,
	keys: RouteBuilderResult<ARG, C>["keys"],
	handlers: Partial<Record<string, RouteKeysTextHandler<ARG, C>>>,
	keyboard: Keyboard | undefined
): Promise<void> {
	if (!keys) return;

	if (keyboard) {
		keyboard.resized(true);
		keyboard.persistent(true);
		keyboard.oneTime(true);
	}

	const text: (text: string, handler: RouteKeysTextHandler<ARG, C>) => void = (
		text,
		handler
	) => {
		if (keyboard) {
			keyboard.text(text);
		}

		handlers[text] = handler;
	};

	const row: () => void = () => {
		if (keyboard) {
			keyboard.row();
		}
	};

	await keys({ text, row, ...ctxAndProps });
}
