import { and, asc, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { Router, type IRouter, type Request } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import {
  CreateOrderBody,
  CreateServiceBody,
  GetOrdersQueryParams,
  InviteUserBody,
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
const userRoles = ["ADMIN", "SUPERVISOR", "CAJERO", "OPERADOR"] as const;
type UserRole = (typeof userRoles)[number];

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

function userRole(metadata: Record<string, unknown> | null | undefined): UserRole {
  const role = metadata?.role;
  return typeof role === "string" && userRoles.includes(role as UserRole)
    ? (role as UserRole)
    : "SUPERVISOR";
}

function primaryEmail(user: { primaryEmailAddressId: string | null; emailAddresses: Array<{ id: string; emailAddress: string }> }) {
  return (
    user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId)?.emailAddress ??
    user.emailAddresses[0]?.emailAddress ??
    ""
  );
}

function serializeUser(user: {
  id: string;
  firstName: string | null;
  lastName: string | null;
  primaryEmailAddressId: string | null;
  emailAddresses: Array<{ id: string; emailAddress: string }>;
  publicMetadata: Record<string, unknown>;
  banned: boolean;
  createdAt: number;
}) {
  return {
    id: user.id,
    email: primaryEmail(user),
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    role: userRole(user.publicMetadata),
    status: user.banned ? "BLOQUEADO" as const : "ACTIVO" as const,
    createdAt: new Date(user.createdAt).toISOString(),
    invitationId: null,
  };
}

async function requireAdmin(
  req: Request,
  res: Parameters<Parameters<IRouter["get"]>[1]>[1],
) {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Debes iniciar sesión para administrar usuarios" });
    return null;
  }

  try {
    const user = await clerkClient.users.getUser(userId);
    if (userRole(user.publicMetadata) === "ADMIN") {
      return { userId, user };
    }

    // The first Clerk account bootstraps the owner as administrator.
    const users = await clerkClient.users.getUserList({ limit: 1 });
    if (users.totalCount === 1 && users.data[0]?.id === userId) {
      await clerkClient.users.updateUserMetadata(userId, {
        publicMetadata: { ...user.publicMetadata, role: "ADMIN" },
      });
      return { userId, user };
    }
  } catch {
    res.status(503).json({ error: "No se pudo consultar el servicio de usuarios de Clerk" });
    return null;
  }

  res.status(403).json({ error: "Solo un administrador puede administrar usuarios" });
  return null;
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
  const requestedIds = [...new Set(input.serviceIds)];
  if (requestedIds.length !== input.serviceIds.length) {
    res.status(400).json({ error: "No puedes agregar el mismo servicio más de una vez" });
    return;
  }
  const availableServices = await db
    .select()
    .from(services)
    .where(and(inArray(services.id, requestedIds), eq(services.active, true)));
  const servicesById = new Map(availableServices.map((service) => [service.id, service]));
  if (servicesById.size !== requestedIds.length) {
    res.status(400).json({ error: "Uno o más servicios seleccionados no están disponibles" });
    return;
  }
  const selectedServices = requestedIds.map((id) => servicesById.get(id)!);
  const primaryService = selectedServices[0];
  if (!primaryService) {
    res.status(400).json({ error: "Selecciona al menos un servicio" });
    return;
  }
  const serviceName = selectedServices.map((service) => service.name).join(" + ");
  const subtotal = selectedServices.reduce((sum, service) => sum + service.price, 0);
  const price = input.priceOverride ?? subtotal;
  const [created] = await db
    .insert(orders)
    .values({
      plate: input.plate.trim().toUpperCase(),
      customer: input.customer.trim(),
      phone: input.phone.trim(),
      serviceId: primaryService.id,
      serviceName,
      price,
      enteredBy: actor,
      lastActionBy: actor,
    })
    .returning();
  if (!created) {
    res.status(500).json({ error: "No se pudo crear la orden" });
    return;
  }
  await addAudit(
    actor,
    "ORDEN_CREADA",
    `Orden ${orderNumber(created.id)} ingresada para ${created.plate} con ${serviceName}; total $${price.toLocaleString("es-CL")}`,
    created.id,
  );
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

router.get("/bootstrap", async (_req, res) => {
  try {
    const users = await clerkClient.users.getUserList({ limit: 1 });
    res.json({ allowed: users.totalCount === 0 });
  } catch {
    res.status(503).json({ error: "No se pudo verificar el estado inicial de Clerk" });
  }
});

router.get("/users", async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    const [users, invitations] = await Promise.all([
      clerkClient.users.getUserList({ limit: 100, orderBy: "-created_at" }),
      clerkClient.invitations.getInvitationList({ limit: 100, status: "pending", orderBy: "-created_at" }),
    ]);
    const accounts = users.data.map(serializeUser);
    const knownEmails = new Set(accounts.map((account) => account.email.toLowerCase()));
    const pending = invitations.data
      .filter((invitation) => !knownEmails.has(invitation.emailAddress.toLowerCase()))
      .map((invitation) => ({
        id: invitation.id,
        email: invitation.emailAddress,
        firstName: typeof invitation.publicMetadata?.firstName === "string" ? invitation.publicMetadata.firstName : "",
        lastName: typeof invitation.publicMetadata?.lastName === "string" ? invitation.publicMetadata.lastName : "",
        role: userRole(invitation.publicMetadata),
        status: "INVITADO" as const,
        createdAt: new Date(invitation.createdAt).toISOString(),
        invitationId: invitation.id,
      }));
    res.json([...accounts, ...pending]);
  } catch {
    res.status(503).json({ error: "No se pudo cargar el equipo desde Clerk" });
  }
});

router.post("/users", async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const input = InviteUserBody.parse(req.body);

  try {
    const invitation = await clerkClient.invitations.createInvitation({
      emailAddress: input.email.toLowerCase().trim(),
      notify: true,
      publicMetadata: {
        role: input.role,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
      },
    });
    await addAudit(
      admin.userId,
      "USUARIO_INVITADO",
      `Invitación creada para ${input.email} con rol ${input.role}`,
      undefined,
      "INFO",
    );
    res.status(201).json({
      id: invitation.id,
      email: invitation.emailAddress,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      role: input.role,
      status: "INVITADO",
      createdAt: new Date(invitation.createdAt).toISOString(),
      invitationId: invitation.id,
    });
  } catch {
    res.status(400).json({ error: "No se pudo crear la invitación. Verifica que el correo no esté registrado." });
  }
});

router.delete("/users/:id", async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const userId = req.params.id;
  if (userId === admin.userId) {
    res.status(400).json({ error: "No puedes eliminar tu propio acceso de administrador" });
    return;
  }

  try {
    await clerkClient.users.deleteUser(userId);
    await addAudit(admin.userId, "USUARIO_ELIMINADO", `Acceso ${userId} eliminado por el administrador`, undefined, "WARNING");
    res.status(204).send();
  } catch {
    res.status(404).json({ error: "Usuario no encontrado o ya eliminado" });
  }
});

export default router;