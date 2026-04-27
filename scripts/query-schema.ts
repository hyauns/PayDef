import { getSql } from "../lib/neon"

async function main() {
  const sql = getSql()
  try {
    const result = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `
    console.log(result.map((r: any) => r.table_name))
  } catch (err) {
    console.error(err)
  }
}
main()
