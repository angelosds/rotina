import {
  pgTable,
  text,
  boolean,
  timestamp,
  integer,
  bigint,
  date,
} from "drizzle-orm/pg-core";
const dates = () => ({
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  ...dates(),
});
export const session = pgTable("session", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  ...dates(),
});
export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  ...dates(),
});
export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...dates(),
});
export const profile = pgTable("profile", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  timezone: text("timezone").notNull().default("America/Sao_Paulo"),
  onboarded: boolean("onboarded").notNull().default(false),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
});
export const invitation = pgTable("invitation", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  tokenHash: text("token_hash").notNull().unique(),
  inviterId: text("inviter_id")
    .notNull()
    .references(() => user.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  ...dates(),
});
export const throttle = pgTable("throttle", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
export const creditCard = pgTable("credit_card", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  closingDay: integer("closing_day").notNull(),
  dueDay: integer("due_day").notNull(),
  creditLimitCents: integer("credit_limit_cents"),
  active: boolean("active").notNull().default(true),
  ...dates(),
});
export const cardPurchase = pgTable("card_purchase", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  cardId: text("card_id")
    .notNull()
    .references(() => creditCard.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  purchaseDate: date("purchase_date", { mode: "string" }).notNull(),
  totalCents: integer("total_cents").notNull(),
  installmentCount: integer("installment_count").notNull().default(1),
  firstInvoiceMonth: date("first_invoice_month", { mode: "string" }).notNull(),
  project: text("project"),
  tags: text("tags").notNull().default("[]"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  ...dates(),
});
export const invoicePayment = pgTable("invoice_payment", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  cardId: text("card_id")
    .notNull()
    .references(() => creditCard.id, { onDelete: "restrict" }),
  invoiceMonth: date("invoice_month", { mode: "string" }).notNull(),
  amountCents: integer("amount_cents").notNull(),
  paidAt: date("paid_at", { mode: "string" }).notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  ...dates(),
});
