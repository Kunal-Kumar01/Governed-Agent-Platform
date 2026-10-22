import { Pool } from "@neondatabase/serverless";

const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
const c = await pool.connect();

console.log("connected as:", (await c.query("select current_user")).rows[0]);
console.log("no org set:", (await c.query("select id, full_name from organisations")).rows);

await c.query("begin");
await c.query("select set_config('app.current_org_id', $1, true)", [process.argv[2]]);
console.log(`org ${process.argv[2]} set:`, (await c.query("select id, full_name from organisations")).rows);
await c.query("commit");

console.log("after commit:", (await c.query("select id, full_name from organisations")).rows);

c.release();
await pool.end();
