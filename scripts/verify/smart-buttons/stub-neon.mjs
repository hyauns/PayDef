// Throws unless a test installs globalThis.__harnessSql = (strings, ...values) => rows
// (getPool: globalThis.__harnessPool = { connect: async () => ({ query, release }) })
const noDb = () => { throw new Error("harness: no database") }
export const getSql = () => {
  if (typeof globalThis.__harnessSql !== "function") noDb()
  return async (strings, ...values) => globalThis.__harnessSql(strings, ...values)
}
export const getPool = () => globalThis.__harnessPool ?? noDb()
