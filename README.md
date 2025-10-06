# How to

```typescript
import { type RouteFlavor, Router, z } from "@joinu/grammy-router";
import { Bot, type Context, session, type SessionFlavor } from "grammy";

type UserSession = {};
type MyContext = RouteFlavor<z.ZodType, SessionFlavor<UserSession> & Context>;

const router = await Router.create<UserSession, MyContext>(() => ({
	text: () => "Default route",
}));

const main = await router.on(
	"main",
	z.object({ testProp: z.string() }),
	() => ({
		onEnter: async (ctx, { proceed }) =>
			proceed("Main route title, press button 2 to go to another route"),
		keys: async ({ text, row }, ctx) => {
			text("Do Something", async (ctx) =>
				doSomething(ctx.session.route.props.testProp)
			);
			row();
			text("Go Next", (ctx) => second.navigate(ctx, undefined));
		},
		other: async (ctx) => {
			processUnmatchedInput();
		},
	})
);

const second = await router.on("second", z.undefined(), () => ({
	onEnter: (ctx, { abort }) => abort("Second route"),
	keys: ({ text }) => {
		text("Go Back", (ctx) => main.navigate(ctx, { testProp: "test" }));
	},
}));

const BOT = new Bot<MyContext>("API_KEY");

BOT.use(
	session({
		initial: (): UserSession => ({
			// provide default shared session ...
		}),
	})
);

BOT.use(router as any);
// done
```
