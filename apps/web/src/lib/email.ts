import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Resend } from "resend";
import type { Config } from "@rotina/config";
export type Email = { to: string; subject: string; text: string };
export async function sendEmail(config: Config, message: Email) {
  if (config.APP_ENV === "local") {
    const dir = resolve(config.LOCAL_DB_PATH, "..", "mail");
    await mkdir(dir, { recursive: true });
    await writeFile(
      resolve(dir, randomUUID() + ".json"),
      JSON.stringify(message),
      { mode: 0o600 },
    );
    return;
  }
  if (
    config.APP_ENV !== "production" &&
    !config.TEST_EMAIL_ALLOWLIST.split(",")
      .map((e) => e.trim().toLowerCase())
      .includes(message.to.toLowerCase())
  )
    throw Error("Recipient is not allowed in this environment");
  const result = await new Resend(config.RESEND_API_KEY).emails.send({
    from: config.EMAIL_FROM!,
    to: message.to,
    subject: message.subject,
    text: message.text,
  });
  if (result.error) throw Error("Email delivery failed");
}
