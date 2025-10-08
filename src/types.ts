import type {
	InputMediaAudio,
	InputMediaDocument,
	InputMediaPhoto,
	InputMediaVideo,
} from "grammy/types";
import type z from "zod";
import type { Context } from "grammy";
import type { MaybePromise } from "./utils.ts";

export type InputMedia =
	| InputMediaAudio
	| InputMediaDocument
	| InputMediaPhoto
	| InputMediaVideo;

export type RouterState<ARG extends z.ZodType> = {
	path: string;
	props: z.infer<ARG>;
};

export type RouteBuilder<
	ARG extends z.ZodType,
	C extends Context
> = () => MaybePromise<RouteBuilderResult<ARG, C>>;

export type RouteOnEnterResult =
	| {
			text: string;
			markup: "plain" | "md" | "md2" | "html";
			mediaGroup?: InputMedia[];
	  }
	| string;

export type CtxAndProps<ARG extends z.ZodType, C extends Context> = {
	ctx: C;
	route: string;
	props: z.infer<ARG>;
};

export type RouteKeysTextHandler<ARG extends z.ZodType, C extends Context> = (
	arg: CtxAndProps<ARG, C>
) => MaybePromise<void>;

export type RouteBuilderResult<ARG extends z.ZodType, C extends Context> = {
	/*
	 * Navigate out of onEnter yourself, if something is not right
	 */
	onEnter: (
		arg: CtxAndProps<ARG, C>
	) => MaybePromise<RouteOnEnterResult | void>;
	keys?: (
		arg: CtxAndProps<ARG, C> & {
			text: (text: string, handler: RouteKeysTextHandler<ARG, C>) => void;
			row: () => void;
		}
	) => MaybePromise<void>;
	other?: (arg: CtxAndProps<ARG, C>) => MaybePromise<void>;
};

export type Route<ARG extends z.ZodType, C extends Context> = {
	navigate: (ctx: C, arg: z.infer<ARG>) => MaybePromise<void>;
	_match: (ctx: C) => MaybePromise<void>;
	_path: string;
};
