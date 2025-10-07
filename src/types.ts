import type {
	InputMediaAudio,
	InputMediaDocument,
	InputMediaPhoto,
	InputMediaVideo,
} from "grammy/types";
import type z from "zod";
import type { SessionFlavor } from "grammy";
import type { MaybePromise } from "./utils.ts";

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
			text: string;
			markup: "plain" | "md" | "md2" | "html";
			mediaGroup?: InputMedia[];
	  }
	| string;

export function proceed(
	arg:
		| {
				text: string;
				markup: "plain" | "md" | "md2" | "html";
				mediaGroup?: InputMedia[];
		  }
		| string
): RouteOnEnterResult {
	return arg;
}

export type RouteKeysTextHandler<
	ARG extends z.ZodType,
	C extends SessionFlavor<unknown>
> = (ctx: RouteFlavor<ARG, C>) => MaybePromise<void>;

export type RouteBuilderResult<
	ARG extends z.ZodType,
	C extends SessionFlavor<unknown>
> = {
	/*
	 * Navigate out of here yourself, if something is not right
	 */
	onEnter: (arg: {
		proceed: typeof proceed;
		ctx: RouteFlavor<ARG, C>;
	}) => MaybePromise<RouteOnEnterResult | void>;
	keys?: (arg: {
		text: (text: string, handler: RouteKeysTextHandler<ARG, C>) => void;
		row: () => void;
		ctx: RouteFlavor<ARG, C>;
	}) => MaybePromise<void>;
	other?: (arg: { ctx: RouteFlavor<ARG, C> }) => MaybePromise<void>;
};

export type Route<ARG extends z.ZodType, C extends SessionFlavor<unknown>> = {
	navigate: (ctx: RouteFlavor<any, C>, arg: z.infer<ARG>) => MaybePromise<void>;
	_path: string;
	_match: (ctx: RouteFlavor<ARG, C>) => MaybePromise<void>;
};
