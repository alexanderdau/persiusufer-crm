// Debug endpoint disabled after MCP setup smoketest. Delete this function in the Supabase dashboard.
Deno.serve(() => new Response('410 Gone', { status: 410 }));
