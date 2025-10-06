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

export type RouteOnEnterResult =
	| {
			proceed:
				| {
						text: string;
						markup: "plain" | "md" | "md2" | "html";
						mediaGroup?: InputMedia[];
				  }
				| string;
	  }
	| {
			abort: string | null;
	  };

function proceed(
	arg:
		| {
				text: string;
				markup: "plain" | "md" | "md2" | "html";
				mediaGroup?: InputMedia[];
		  }
		| string
) {
	return { proceed: arg };
}

function abort(msg?: string) {
	return { abort: msg ?? null };
}

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
	onEnter: (
		ctx: RouteFlavor<ARG, C>,
		more: { proceed: typeof proceed; abort: typeof abort }
	) => MaybePromise<RouteOnEnterResult>;
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
		const { onEnter, keys, other } = await builder();

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

			const r = await onEnter(ctx, { proceed, abort });

			if ("abort" in r) {
				if (oldPath) {
					ctx.session.route = {
						props: oldProps,
						path: oldPath,
					};
				}

				if (typeof r.abort === "string") {
					await ctx.reply(r.abort);
				}

				return;
			}

			let content: string = "",
				parseMode: ParseMode | undefined = undefined,
				mediaGroup: InputMedia[] | undefined = undefined;

			if (typeof r.proceed === "string") {
				content = r.proceed;
				parseMode = undefined;
			} else {
				content = r.proceed.text;
				switch (r.proceed.markup) {
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
				mediaGroup = r.proceed.mediaGroup;
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
