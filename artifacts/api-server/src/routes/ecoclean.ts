import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";
import { Router, type IRouter, type Request } from "express";
import { getAuth } from "@clerk/express";
import {
  CreateOrderBody,
  CreateServiceBody,
  GetOrdersQueryParams,
  RecordPaymentBody,
  UpdateOrderBody,
  UpdateOrderStatusBody,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import {
  auditEvents,
  orders,
  services,
  type AuditEvent,
  type Order,
} from "@workspace/db/schema";

const router: IRouter = Router();

const statuses = [
  "INGRESADO",
  "EN_SERVICIO",
  "LISTO",
  "PENDIENTE_DE_PAGO",
  "PAGADO",
  "ENTREGADO",
  "ANULADO",
] as const;

const paymentMethods = ["EFECTIVO", "DEBITO", "CREDITO"] as const;
type PaymentMethod = (typeof paymentMethods)[number];
type OrderStatus = (typeof statuses)[number];

function actorFor(req: Request) {
  const userId = getAuth(req).userId;
  if (userId) return userId;
  if (process.env.NODE_ENV === "development") return "Supervisor de sucursal (demo)";
  return null;
}

function requireActor(req: Request, res: Parameters<Parameters<IRouter["get"]>[1]>[1]) {
  const actor = actorFor(req);
  if (!actor) {
    res.status(401).json({ error: "Debes iniciar sesión para operar EcoClean Car" });
    return null;
  }
  return actor;
}

function orderNumber(id: number) {
  return `EC${id.toString().padStart(6, "0")}`;
}

function serializeOrder(order: Order) {
  return {
    id: order.id,
    number: orderNumber(order.id),
    plate: order.plate,
    customer: order.customer,
    phone: order.phone,
    serviceId: order.serviceId,
    serviceName: order.serviceName,
    price: order.price,
    status: order.status as OrderStatus,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    enteredBy: order.enteredBy,
    lastActionBy: order.lastActionBy,
    paymentMethod: order.paymentMethod as PaymentMethod | null,
    barcode: orderNumber(order.id),
  };
}

function serializeAudit(event: AuditEvent) {
  return {
    id: event.id,
    action: event.action,
    description: event.description,
    actor: event.actor,
    timestamp: event.timestamp.toISOString(),
    severity: event.severity as "INFO" | "WARNING" | "CRITICAL",
  };
}

async function addAudit(
  actor: string,
  action: string,
  description: string,
  orderId?: number,
  severity: "INFO" | "WARNING" | "CRITICAL" = "INFO",
) {
  await db.insert(auditEvents).values({
    actor,
    action,
    description,
    orderId,
    severity,
  });
}

let seedPromise: Promise<void> | null = null;
async function ensureSeeded() {
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    const existingServices = await db.select({ id: services.id }).from(services).limit(1);
    if (existingServices.length === 0) {
      await db.insert(services).values([
        {
          name: "Lavado Premium",
          description: "Lavado exterior, interior y protección ecológica",
          price: 18000,
        },
        {
          name: "Lavado Express",
          description: "Lavado exterior eficiente con productos biodegradables",
          price: 12000,
        },
        {
          name: "Interior Profundo",
          description: "Limpieza detallada de tapiz, tablero y piso",
          price: 25000,
        },
      ]);
    }

    const existingOrders = await db.select({ id: orders.id }).from(orders).limit(1);
    if (existingOrders.length === 0) {
      const catalog = await db.select().from(services).orderBy(asc(services.id));
      if (catalog[0]) {
        const [created] = await db
          .insert(orders)
          .values({
            plate: "AB-CD-12",
            customer: "Camila Rojas",
            phone: "+56 9 4455 1290",
            serviceId: catalog[0].id,
            serviceName: catalog[0].name,
            price: catalog[0].price,
            status: "LISTO",
            enteredBy: "Supervisor de sucursal",
            lastActionBy: "Supervisor de sucursal",
          })
          .returning();
        if (created) {
          await addAudit(
            "Sistema",
            "ORDEN_CREADA",
            `Orden ${orderNumber(created.id)} creada para ${created.plate}`,
            created.id,
          );
          await addAudit(
            "Sistema",
            "ESTADO_ACTUALIZADO",
            `Orden ${orderNumber(created.id)} marcada como lista`,
            created.id,
          );
        }
      }
    }
  })();
  return seedPromise;
}

router.use(async (_req, _res, next) => {
  await ensureSeeded();
  next();
});

router.get("/dashboard", async (req, res) => {
  if (!requireActor(req, res)) return;
  const allOrders = await db.select().from(orders).orderBy(desc(orders.updatedAt));
  const allEvents = await db
    .select()
    .from(auditEvents)
    .orderBy(desc(auditEvents.timestamp))
    .limit(8);
  const paid = allOrders.filter((order) => order.status === "PAGADO" || order.status === "ENTREGADO");
  const statusCounts = statuses.reduce<Record<string, number>>((counts, status) => {
    counts[status] = allOrders.filter((order) => order.status === status).length;
    return counts;
  }, {});
  const cashByMethod = {
    EFECTIVO: paid.filter((order) => order.paymentMethod === "EFECTIVO").reduce((sum, order) => sum + order.price, 0),
    DEBITO: paid.filter((order) => order.paymentMethod === "DEBITO").reduce((sum, order) => sum + order.price, 0),
    CREDITO: paid.filter((order) => order.paymentMethod === "CREDITO").reduce((sum, order) => sum + order.price, 0),
  };
  res.json({
    todaySales: paid.reduce((sum, order) => sum + order.price, 0),
    todayOrders: allOrders.length,
    pendingPayment: allOrders.filter((order) => order.status === "PENDIENTE_DE_PAGO").length,
    readyVehicles: allOrders.filter((order) => order.status === "LISTO").length,
    deliveredToday: allOrders.filter((order) => order.status === "ENTREGADO").length,
    cashExpected: cashByMethod.EFECTIVO + cashByMethod.DEBITO + cashByMethod.CREDITO,
    cashByMethod,
    statusCounts,
    recentOrders: allOrders.slice(0, 6).map(serializeOrder),
    recentActivity: allEvents.map(serializeAudit),
  });
});

router.get("/services", async (req, res) => {
  if (!requireActor(req, res)) return;
  const rows = await db.select().from(services).where(eq(services.active, true)).orderBy(asc(services.id));
  res.json(rows);
});

router.post("/services", async (req, res) => {
  const actor = requireActor(req, res);
  if (!actor) return;
  const input = CreateServiceBody.parse(req.body);
  const [created] = await db.insert(services).values(input).returning();
  if (!created) {
    res.status(500).json({ error: "No se pudo crear el servicio" });
    return;
  }
  await addAudit(actor, "SERVICIO_CREADO", `Servicio ${created.name} agregado al catálogo`);
  res.status(201).json(created);
});

router.get("/orders", async (req, res) => {
  if (!requireActor(req, res)) return;
  const query = GetOrdersQueryParams.parse(req.query);
  const filters = [];
  if (query.status) filters.push(eq(orders.status, query.status));
  if (query.search) {
    filters.push(
      sql`(${ilike(orders.plate, `%${query.search}%`)} OR ${ilike(orders.customer, `%${query.search}%`)})`,
    );
  }
  const rows = await db
    .select()
    .from(orders)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(orders.updatedAt));
  res.json(rows.map(serializeOrder));
});

router.post("/orders", async (req, res) => {
  const actor = requireActor(req, res);
  if (!actor) return;
  const input = CreateOrderBody.parse(req.body);
  const [service] = await db.select().from(services).where(eq(services.id, input.serviceId)).limit(1);
  if (!service || !service.active) {
    res.status(400).json({ error: "El servicio seleccionado no está disponible" });
    return;
  }
  const price = input.priceOverride ?? service.price;
  const [created] = await db
    .insert(orders)
    .values({
      plate: input.plate.trim().toUpperCase(),
      customer: input.customer.trim(),
      phone: input.phone.trim(),
      serviceId: service.id,
      serviceName: service.name,
      price,
      enteredBy: actor,
      lastActionBy: actor,
    })
    .returning();
  if (!created) {
    res.status(500).json({ error: "No se pudo crear la orden" });
    return;
  }
  await addAudit(actor, "ORDEN_CREADA", `Orden ${orderNumber(created.id)} ingresada para ${created.plate}`, created.id);
  if (input.priceOverride !== null && input.priceOverride !== undefined) {
    await addAudit(
      actor,
      "CAMBIO_DE_PRECIO",
      `Precio de la orden ${orderNumber(created.id)} ajustado a $${price.toLocaleString("es-CL")}`,
      created.id,
      "WARNING",
    );
  }
  res.status(201).json(serializeOrder(created));
});

router.get("/orders/:id", async (req, res) => {
  if (!requireActor(req, res)) return;
  const id = Number(req.params.id);
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) {
    res.status(404).json({ error: "Orden no encontrada" });
    return;
  }
  res.json(serializeOrder(order));
});

router.patch("/orders/:id", async (req, res) => {
  const actor = requireActor(req, res);
  if (!actor) return;
  const id = Number(req.params.id);
  const input = UpdateOrderBody.parse(req.body);
  const [existing] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "Orden no encontrada" });
    return;
  }
  const [updated] = await db
    .update(orders)
    .set({
      customer: input.customer ?? existing.customer,
      phone: input.phone ?? existing.phone,
      price: input.priceOverride ?? existing.price,
      lastActionBy: actor,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, id))
    .returning();
  if (input.priceOverride !== undefined && input.priceOverride !== existing.price) {
    await addAudit(
      actor,
      "CAMBIO_DE_PRECIO",
      `Precio de la orden ${orderNumber(id)} actualizado`,
      id,
      "WARNING",
    );
  }
  if (input.reason) {
    await addAudit(actor, "ORDEN_EDITADA", input.reason, id);
  }
  res.json(serializeOrder(updated!));
});

router.post("/orders/:id/status", async (req, res) => {
  const actor = requireActor(req, res);
  if (!actor) return;
  const id = Number(req.params.id);
  const input = UpdateOrderStatusBody.parse(req.body);
  const [existing] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "Orden no encontrada" });
    return;
  }
  const status = input.status as OrderStatus;
  const [updated] = await db
    .update(orders)
    .set({ status, lastActionBy: actor, updatedAt: new Date() })
    .where(eq(orders.id, id))
    .returning();
  await addAudit(
    actor,
    status === "ANULADO" ? "ORDEN_ANULADA" : "ESTADO_ACTUALIZADO",
    input.reason ?? `Orden ${orderNumber(id)} pasó de ${existing.status} a ${status}`,
    id,
    status === "ANULADO" ? "CRITICAL" : "INFO",
  );
  res.json(serializeOrder(updated!));
});

router.post("/orders/:id/payment", async (req, res) => {
  const actor = requireActor(req, res);
  if (!actor) return;
  const id = Number(req.params.id);
  const input = RecordPaymentBody.parse(req.body);
  const method = input.method as PaymentMethod;
  const [existing] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "Orden no encontrada" });
    return;
  }
  if (input.amount !== null && input.amount !== undefined && input.amount !== existing.price) {
    res.status(400).json({ error: "El monto recibido debe coincidir con el total de la orden" });
    return;
  }
  const [updated] = await db
    .update(orders)
    .set({
      status: "PAGADO",
      paymentMethod: method,
      lastActionBy: actor,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, id))
    .returning();
  await addAudit(
    actor,
    "PAGO_REGISTRADO",
    `Pago de $${existing.price.toLocaleString("es-CL")} registrado con ${method.toLowerCase()}`,
    id,
  );
  res.json(serializeOrder(updated!));
});

router.get("/audit", async (req, res) => {
  if (!requireActor(req, res)) return;
  const rows = await db.select().from(auditEvents).orderBy(desc(auditEvents.timestamp)).limit(100);
  res.json(rows.map(serializeAudit));
});

export default router;