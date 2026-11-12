import { relations } from "drizzle-orm";
import {
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const orderStatusEnum = pgEnum("order_status", [
  "INGRESADO",
  "EN_SERVICIO",
  "LISTO",
  "PENDIENTE_DE_PAGO",
  "PAGADO",
  "ENTREGADO",
  "ANULADO",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "EFECTIVO",
  "DEBITO",
  "CREDITO",
]);

export const services = pgTable("ecoclean_services", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  category: text("category").notNull().default("GENERAL"),
  price: integer("price").notNull(),
  priceSmall: integer("price_small"),
  priceMedium: integer("price_medium"),
  priceLarge: integer("price_large"),
  active: boolean("active").notNull().default(true),
});

export const orders = pgTable("ecoclean_orders", {
  id: serial("id").primaryKey(),
  plate: text("plate").notNull(),
  customer: text("customer").notNull(),
  phone: text("phone").notNull().default(""),
  customerEmail: text("customer_email"),
  receiptEmailStatus: text("receipt_email_status").notNull().default("NO_ENVIADO"),
  receiptSentAt: timestamp("receipt_sent_at", { withTimezone: true }),
  serviceId: integer("service_id")
    .notNull()
    .references(() => services.id),
  serviceName: text("service_name").notNull(),
  vehicleSize: text("vehicle_size").notNull().default("MEDIANO"),
  subtotal: integer("subtotal"),
  discountType: text("discount_type"),
  discountValue: integer("discount_value"),
  discountAmount: integer("discount_amount").notNull().default(0),
  price: integer("price").notNull(),
  backupNotificationStatus: text("backup_notification_status").notNull().default("NO_CONFIGURADO"),
  backupNotificationEmail: text("backup_notification_email"),
  backupNotifiedAt: timestamp("backup_notified_at", { withTimezone: true }),
  status: orderStatusEnum("status").notNull().default("INGRESADO"),
  paymentMethod: paymentMethodEnum("payment_method"),
  enteredBy: text("entered_by").notNull().default("Supervisor de sucursal"),
  lastActionBy: text("last_action_by").notNull().default("Supervisor de sucursal"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notificationSettings = pgTable("ecoclean_notification_settings", {
  id: integer("id").primaryKey().default(1),
  backupEmail: text("backup_email"),
  backupNotificationsEnabled: boolean("backup_notifications_enabled").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditEvents = pgTable("ecoclean_audit_events", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(),
  description: text("description").notNull(),
  actor: text("actor").notNull(),
  severity: text("severity").notNull().default("INFO"),
  orderId: integer("order_id").references(() => orders.id),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

export const serviceInsertSchema = createInsertSchema(services).omit({ id: true });
export const orderInsertSchema = createInsertSchema(orders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const auditInsertSchema = createInsertSchema(auditEvents).omit({
  id: true,
  timestamp: true,
});

export type Service = typeof services.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];

export const servicesRelations = relations(services, ({ many }) => ({
  orders: many(orders),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  service: one(services, {
    fields: [orders.serviceId],
    references: [services.id],
  }),
  auditEvents: many(auditEvents),
}));

export const auditEventsRelations = relations(auditEvents, ({ one }) => ({
  order: one(orders, {
    fields: [auditEvents.orderId],
    references: [orders.id],
  }),
}));