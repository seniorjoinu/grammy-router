import { z } from "zod";
import { type Context, Keyboard, type SessionFlavor } from "grammy";
import type {
	InputMediaAudio,
	InputMediaDocument,
	InputMediaPhoto,
	InputMediaVideo,
	ParseMode,
} from "grammy/types";
import { Router as GrammyRouter } from "@grammyjs/router";
import {
	unreachable,
	type MaybePromise,
	panic,
	DEFAULT_ROUTE,
} from "./utils.ts";

export type InputMedia =
	| InputMediaAudio
	| InputMediaDocument
	| InputMediaPhoto
	| InputMediaVideo;

export type RouteFlavor<
	ARG extends z.ZodType,
	C extends SessionFlavor<unknown>
> = C & {
	session: {
		[K in keyof C["session"]]: C["session"][K];
	} & {
		route: { path: string; props: z.infer<ARG> };
	};
};

export type RouteBuilder<
	ARG extends z.ZodType,
	C extends SessionFlavor<unknown>
> = () => MaybePromise<RouteBuilderResult<ARG, C>>;

export type RouteText =
	| string
	| {
			text: string;
			markup: "plain" | "md" | "md2" | "html";
			mediaGroup?: InputMedia[];
	  };

export type RouteKeysTextHandler<
	ARG extends z.ZodType,
	C extends SessionFlavor<unknown>
> = (ctx: RouteFlavor<ARG, C>) => MaybePromise<void>;

export type RouteKeys<
	ARG extends z.ZodType,
	C extends SessionFlavor<unknown>
> = {
	text: (text: string, handler: RouteKeysTextHandler<ARG, C>) => void;
	row: () => void;
};

export type RouteBuilderResult<
	ARG extends z.ZodType,
	C extends SessionFlavor<unknown>
> = {
	guard?: (ctx: RouteFlavor<ARG, C>) => MaybePromise<void>;
	text: (ctx: RouteFlavor<ARG, C>) => MaybePromise<RouteText>;
	keys?: (
		keys: RouteKeys<ARG, C>,
		ctx: RouteFlavor<ARG, C>
	) => MaybePromise<void>;
	other?: (ctx: RouteFlavor<ARG, C>) => MaybePromise<void>;
};

export type Route<ARG extends z.ZodType, C extends SessionFlavor<unknown>> = {
	navigate: (ctx: RouteFlavor<any, C>, arg: z.infer<ARG>) => MaybePromise<void>;
	_path: string;
	_match: (ctx: RouteFlavor<ARG, C>) => MaybePromise<void>;
};

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
		const { guard, text, keys, other } = await builder();

		const textKeyHandlers: [string, RouteKeysTextHandler<ARG, CTX>][] = [];

		const _match: (ctx: RouteFlavor<ARG, CTX>) => MaybePromise<void> = async (
			ctx
		) => {
			const options = textKeyHandlers.map((it) => it[0]);

			if (ctx.message?.text && options.includes(ctx.message.text)) {
				const text = ctx.message.text;
				if (!text) return;

				const handler = textKeyHandlers.find((it) => it[0] === text);
				if (!handler) unreachable("Handler should exist");

				await handler[1](ctx);
			} else if (other) {
				await other(ctx);
			} else {
				panic(
					`Unmatched input with no 'other' handler: PATH = ${path}; options = ${options} msg = ${ctx.message?.text}`
				);
			}
		};

		const navigate = async (
			ctx: RouteFlavor<ARG, CTX>,
			props: z.infer<ARG>
		) => {
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

			if (guard) {
				try {
					await guard(ctx);
				} catch (e) {
					if (oldPath) {
						ctx.session.route = {
							props: oldProps,
							path: oldPath,
						};
					}

					if (e instanceof Error) {
						await ctx.reply(`[Error]: ${e.message}`);
						return;
					} else {
						throw new Error(
							`Guard for path ${
								ctx.session.route.path
							} panicked (props = ${JSON.stringify(
								ctx.session.route.props,
								undefined,
								2
							)})`,
							{ cause: e }
						);
					}
				}
			}

			let content: string = "",
				parseMode: ParseMode | undefined = undefined,
				mediaGroup: InputMedia[] | undefined = undefined;

			const t = await text(ctx);

			if (typeof t === "string") {
				content = t;
				parseMode = undefined;
			} else {
				content = t.text;
				switch (t.markup) {
					case "plain": {
						parseMode = undefined;
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
				mediaGroup = t.mediaGroup;
			}

			let keyboard: Keyboard | undefined = undefined;

			if (keys) {
				keyboard = new Keyboard();
				keyboard.persistent(false);
				keyboard.resized(true);

				const text: (
					text: string,
					handler: RouteKeysTextHandler<ARG, CTX>
				) => void = (text, handler) => {
					keyboard!.text(text);
					textKeyHandlers.push([text, handler]);
				};

				const row: () => void = () => {
					keyboard!.row();
				};

				await keys({ text, row }, ctx);
			}

			await ctx.reply(content, {
				parse_mode: parseMode,
				reply_markup: keyboard,
			});

			if (mediaGroup) {
				await ctx.replyWithMediaGroup(mediaGroup);
			}
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
		this.route(route._path, (ctx) => route._match(ctx as any));

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
