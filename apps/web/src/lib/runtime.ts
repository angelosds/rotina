import { readConfig } from "@rotina/config";
import { createDatabase } from "@rotina/db";
import { createAuth } from "./auth";
import { sendEmail } from "./email";
function createRuntime() {
  const config = readConfig();
  const { db } = createDatabase(config);
  const auth = createAuth(db, config, (message) => sendEmail(config, message));
  return { config, db, auth };
}
const globalRuntime = globalThis as unknown as {
  rotina?: ReturnType<typeof createRuntime>;
};
export function runtime() {
  return (globalRuntime.rotina ??= createRuntime());
}
