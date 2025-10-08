import { InMemoryRouterStorage, Router, z } from "@joinu/grammy-router";
import { Bot, type Context } from "grammy";

const TG_KEY = "8377234077:AAEpWFV95ksyvbwAm1lYkg9l0Rpg4x9dxrw";
const HANDLE = "sashas_testing_bot";

const router = await Router.create<Context>(
	new InMemoryRouterStorage(),
	() => ({
		onEnter: async ({ ctx }) => {
			await firstRoute(ctx, undefined);
		},
	})
);

const firstRoute = await router.on("main", z.undefined(), () => ({
	onEnter: () => "Main route title, press button to go to another route",
	keys: ({ text, row }) => {
		text("Button", () => console.log("Hello"));
		row();
		text("Go Next", ({ ctx }) => secondRoute(ctx, { testProp: "test" }));
	},
	other: (ctx) => {
		console.log(ctx);
	},
}));

const secondRoute = await router.on(
	"second",
	z.object({ testProp: z.string() }),
	() => ({
		onEnter: () => "Second route",
		keys: ({ text }) => {
			text("Go Back", ({ ctx }) => firstRoute(ctx, undefined));
		},
	})
);

const BOT = new Bot(TG_KEY);

BOT.use(router as any);

BOT.command("start", async (ctx) => {
	if (ctx.chat.type !== "private") {
		await ctx.reply("Access denied");
		return;
	}

	await firstRoute(ctx, undefined);
});

BOT.start({
	onStart: () => console.log(`Bot started, visit https://t.me/${HANDLE}`),
});
