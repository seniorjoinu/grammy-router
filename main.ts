import { type RouteFlavor, Router, z } from "@joinu/grammy-router";
import { Bot, type Context, session, type SessionFlavor } from "grammy";

const TG_KEY = "8377234077:AAEpWFV95ksyvbwAm1lYkg9l0Rpg4x9dxrw";
const HANDLE = "sashas_testing_bot";

type UserSession = {};
type MyContext = RouteFlavor<z.ZodType, SessionFlavor<UserSession> & Context>;

const router = await Router.create<UserSession, MyContext>(() => ({
	onEnter: ({ ctx }) => {
		main.navigate(ctx, undefined);
	},
}));

const main = await router.on("main", z.undefined(), () => ({
	onEnter: ({ proceed }) =>
		proceed("Main route title, press button to go to another route"),
	keys: ({ text, row }) => {
		text("Button", () => console.log("Hello"));
		row();
		text("Go Next", (ctx) => second.navigate(ctx, { testProp: "test" }));
	},
	other: (ctx) => {
		console.log(ctx);
	},
}));

const second = await router.on(
	"second",
	z.object({ testProp: z.string() }),
	() => ({
		onEnter: ({ proceed }) => proceed("Second route"),
		keys: ({ text }) => {
			text("Go Back", (ctx) => main.navigate(ctx, undefined));
		},
	})
);

const BOT = new Bot<MyContext>(TG_KEY);

BOT.use(
	session({
		initial: (): UserSession => ({
			// provide default shared session ...
		}),
	})
);

BOT.use(router as any);

BOT.command("start", async (ctx) => {
	if (ctx.chat.type !== "private") {
		await ctx.reply("Access denied");
		return;
	}

	await main.navigate(ctx, undefined);
});

BOT.start({
	onStart: () => console.log(`Bot started, visit https://t.me/${HANDLE}`),
});
