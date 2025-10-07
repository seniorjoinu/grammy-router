import { z } from "zod";
import { type Context, Keyboard, type SessionFlavor } from "grammy";
import type { ParseMode } from "grammy/types";
import { Router as GrammyRouter } from "@grammyjs/router";
import { type MaybePromise, DEFAULT_ROUTE } from "./utils.ts";
import {
	proceed,
	type InputMedia,
	type Route,
	type RouteBuilder,
	type RouteBuilderResult,
	type RouteFlavor,
	type RouteKeysTextHandler,
} from "./types.ts";

function routeFactory<
	S extends unknown,
	CTX extends Context & SessionFlavor<S>
>(): <ARG extends z.ZodType>(
	path: string,
	arg: ARG,
	builder: RouteBuilder<ARG, CTX>
) => Promise<Route<ARG, CTX>> {
	return async function route<ARG extends z.ZodType>(
		path: string,
		arg: ARG,
		builder: RouteBuilder<ARG, CTX>
	): Promise<Route<ARG, CTX>> {
		const { onEnter, keys, other } = await builder();

		const textKeyHandlers: Partial<
			Record<string, RouteKeysTextHandler<ARG, CTX>>
		> = {};

		const _match: (ctx: RouteFlavor<ARG, CTX>) => MaybePromise<void> = async (
			ctx
		) => {
			const keyboard = new Keyboard();
			await populateHandles(ctx, keys, textKeyHandlers, keyboard);

			const options = Object.keys(textKeyHandlers);
			const { path: pathBefore } = ctx.session.route ?? { path: undefined };

			if (ctx.message?.text && options.includes(ctx.message.text)) {
				const text = ctx.message.text;
				if (!text) return;

				const handler = textKeyHandlers[text];
				if (!handler) return;

				await handler(ctx);
			} else if (other) {
				await other({ ctx });
			}

			const { path: pathAfter } = ctx.session.route ?? { path: undefined };

			if (pathBefore === pathAfter) {
				await enterRoute(ctx, onEnter, keyboard);
			}
		};

		const navigate = async (
			ctx: RouteFlavor<ARG, CTX>,
			props: z.infer<ARG>
		): Promise<void> => {
			const oldProps = ctx.session.route?.props;
			const oldPath = ctx.session.route?.path;

			ctx.session.route = {
				props,
				path,
			};

			try {
				await arg.parseAsync(ctx.session.route.props);
			} catch (e) {
				if (oldPath) {
					ctx.session.route = {
						props: oldProps,
						path: oldPath,
					};
				}

				throw new Error(
					`Invalid props for path ${ctx.session.route.path}: ${JSON.stringify(
						ctx.session.route.props,
						undefined,
						2
					)}`,
					{ cause: e }
				);
			}

			const keyboard = new Keyboard();
			await populateHandles(ctx, keys, textKeyHandlers, keyboard);
			await enterRoute(ctx, onEnter, keyboard);
		};

		return { navigate, _match, _path: path };
	};
}

export class Router<
	S extends unknown,
	C extends RouteFlavor<z.ZodType, Context & SessionFlavor<S>>
> extends GrammyRouter<C> {
	private factory = routeFactory<S, C>();

	static async create<
		S extends unknown,
		C extends RouteFlavor<z.ZodType, Context & SessionFlavor<S>>
	>(
		defaultRouteBuilder: RouteBuilder<z.ZodUndefined, C>
	): Promise<Router<S, C>> {
		const r = new Router<S, C>();
		await r.on(DEFAULT_ROUTE, z.undefined(), defaultRouteBuilder);

		return r;
	}

	public async on<ARG extends z.ZodType>(
		path: string,
		arg: ARG,
		builder: RouteBuilder<ARG, C>
	): Promise<Route<ARG, C>> {
		const route = await this.factory(path, arg, builder);
		this.route(route._path, async (ctx) => await route._match(ctx as any));

		return route;
	}

	private constructor() {
		super((ctx) => {
			const path = ctx.session.route?.path;

			if (path === undefined) return DEFAULT_ROUTE;

			return path;
		});
	}
}

async function enterRoute<
	S extends unknown,
	CTX extends Context & SessionFlavor<S>,
	ARG extends z.ZodType
>(
	ctx: RouteFlavor<ARG, CTX>,
	onEnter: RouteBuilderResult<ARG, CTX>["onEnter"],
	keyboard: Keyboard
) {
	let content: string = "",
		parseMode: ParseMode | undefined = undefined,
		mediaGroup: InputMedia[] | undefined = undefined;

	const r = await onEnter({ ctx, proceed });

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

	await ctx.reply(content, {
		parse_mode: parseMode,
		reply_markup: keyboard,
	});

	if (mediaGroup) {
		await ctx.replyWithMediaGroup(mediaGroup);
	}
}

async function populateHandles<
	S extends unknown,
	ARG extends z.ZodType,
	CTX extends Context & SessionFlavor<S>
>(
	ctx: RouteFlavor<ARG, CTX>,
	keys: RouteBuilderResult<ARG, CTX>["keys"],
	handlers: Partial<Record<string, RouteKeysTextHandler<ARG, CTX>>>,
	keyboard: Keyboard | undefined
): Promise<void> {
	if (!keys) return;

	if (keyboard) {
		keyboard.resized(true);
		keyboard.persistent(true);
		keyboard.oneTime(true);
	}

	const text: (
		text: string,
		handler: RouteKeysTextHandler<ARG, CTX>
	) => void = (text, handler) => {
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

	await keys({ text, row, ctx });
}
