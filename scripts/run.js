const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED });
pool.query(`
      SELECT * FROM transactions WHERE id = 'e737c3da-7d92-411a-8cff-73ab063db1d7'
`).then(res => {
    console.table(res.rows);
    process.exit(0);
}).catch(console.error);
