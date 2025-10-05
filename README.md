# How to

```typescript
const route = routeFactory<UserSession, MyContext>();

// obligatory
const defaultRoute = await route(DEFAULT_ROUTE, z.undefined(), () => ({
	text: () => "You are not authorized to use this bot.",
}));

const main = route("main", z.object({ testProp: z.string() }), () => ({
	text: async (ctx) =>
		"Main route title, press button 2 to go to another route",
	keys: async ({ text, row }, ctx) => {
		text("Button 1", async (ctx) =>
			doSomething(ctx.session.route.props.testProp)
		);
		row();
		text("Button 2", (ctx) => second.navigate(ctx, undefined));
	},
	other: async (ctx) => {
		processUnmatchedInput();
	},
	guard: async (ctx) => {
		throwToPreventNavigation();
	},
}));

const second = route("main", z.undefined(), () => ({
	text: async (ctx) => "Second route",
}));

const routes = [defaultRoute, main, second];
const router = createRouter(routes as any);

const BOT = new Bot<MyContext>();

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
