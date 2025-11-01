export default {
	async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
		return new Response("Not found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;
