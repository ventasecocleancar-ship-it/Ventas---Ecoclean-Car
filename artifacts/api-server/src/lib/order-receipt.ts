import bwipjs from "bwip-js/node";
import { ReplitConnectors } from "@replit/connectors-sdk";
import type { Order } from "@workspace/db/schema";

const connectors = new ReplitConnectors();

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function orderBarcode(orderId: number) {
  return `EC${orderId.toString().padStart(6, "0")}`;
}

export async function createOrderBarcodePng(barcode: string) {
  return bwipjs.toBuffer({
    bcid: "code128",
    text: barcode,
    scale: 3,
    height: 16,
    includetext: true,
    textxalign: "center",
  });
}

export async function sendOrderReceipt(order: Order) {
  if (!order.customerEmail) {
    throw new Error("La orden no tiene correo del cliente");
  }

  const barcode = orderBarcode(order.id);
  const png = await createOrderBarcodePng(barcode);
  const boundary = `ecoclean-${order.id}-${Date.now().toString(36)}`;
  const price = new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(order.price);
  const subtotal = new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(order.subtotal ?? order.price);
  const discount = new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(order.discountAmount ?? 0);
  const payment = order.paymentMethod
    ? `Pagado con ${order.paymentMethod.toLowerCase()}`
    : "Pago pendiente";
  const html = `<!doctype html>
<html lang="es">
  <body style="margin:0;background:#f4f5ec;color:#173a32;font-family:Arial,sans-serif">
    <main style="max-width:560px;margin:24px auto;padding:28px;background:#fffdf7;border:1px solid #dfe2d8;border-radius:18px">
      <p style="margin:0;color:#2f9274;font-weight:bold;letter-spacing:.08em;text-transform:uppercase">EcoClean Car</p>
      <h1 style="margin:12px 0 6px;font-size:24px">Comprobante de servicio</h1>
      <p style="margin:0 0 22px;color:#668279">Hola ${escapeHtml(order.customer)}, guardamos los datos de tu servicio.</p>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:9px 0;color:#668279">Orden</td><td style="padding:9px 0;text-align:right;font-weight:bold">${barcode}</td></tr>
        <tr><td style="padding:9px 0;color:#668279">Patente</td><td style="padding:9px 0;text-align:right;font-weight:bold">${escapeHtml(order.plate)}</td></tr>
        <tr><td style="padding:9px 0;color:#668279">Servicio</td><td style="padding:9px 0;text-align:right">${escapeHtml(order.serviceName)}</td></tr>
        <tr><td style="padding:9px 0;color:#668279">Subtotal</td><td style="padding:9px 0;text-align:right">${subtotal}</td></tr>
        ${order.discountAmount > 0 ? `<tr><td style="padding:9px 0;color:#2f9274">Descuento</td><td style="padding:9px 0;text-align:right;color:#2f9274">−${discount}</td></tr>` : ""}
        <tr><td style="padding:9px 0;color:#668279">Total</td><td style="padding:9px 0;text-align:right;font-size:20px;font-weight:bold">${price}</td></tr>
        <tr><td style="padding:9px 0;color:#668279">Pago</td><td style="padding:9px 0;text-align:right">${payment}</td></tr>
      </table>
      <div style="margin-top:24px;padding:18px;text-align:center;background:#f4f5ec;border:1px dashed #cbd9cf;border-radius:12px">
        <img src="cid:ecoclean-barcode" alt="Código de barras ${barcode}" style="display:block;width:100%;max-width:360px;height:auto;margin:0 auto" />
        <p style="margin:12px 0 0;font-family:monospace;letter-spacing:.18em">${barcode}</p>
      </div>
      <p style="margin:20px 0 0;color:#789087;font-size:12px">Presenta este código al llegar para que el equipo encuentre tu orden.</p>
    </main>
  </body>
</html>`;
  const rawMessage = [
    `To: ${order.customerEmail}`,
    `Subject: Comprobante EcoClean Car - ${barcode}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/related; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(html, "utf8").toString("base64"),
    `--${boundary}`,
    'Content-Type: image/png; name="codigo-de-barras.png"',
    "Content-Transfer-Encoding: base64",
    "Content-ID: <ecoclean-barcode>",
    'Content-Disposition: inline; filename="codigo-de-barras.png"',
    "",
    png.toString("base64"),
    `--${boundary}--`,
    "",
  ].join("\r\n");
  const response = await connectors.proxy(
    "google-mail",
    "/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw: Buffer.from(rawMessage, "utf8").toString("base64url") }),
    },
  );
  if (!response.ok) {
    throw new Error(`Gmail rechazó el comprobante (HTTP ${response.status})`);
  }
}

export async function sendBackupServiceCompletedNotification(
  order: Order,
  recipient: string,
) {
  const barcode = orderBarcode(order.id);
  const png = await createOrderBarcodePng(barcode);
  const formatClp = (value: number) =>
    new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      maximumFractionDigits: 0,
    }).format(value);
  const subtotal = formatClp(order.subtotal ?? order.price);
  const discount = formatClp(order.discountAmount ?? 0);
  const total = formatClp(order.price);
  const discountRow = order.discountAmount > 0
    ? `<tr><td style="padding:9px 0;color:#2f9274">Descuento</td><td style="padding:9px 0;text-align:right;color:#2f9274">−${discount}</td></tr>`
    : "";
  const boundary = `ecoclean-finalizado-${order.id}-${Date.now().toString(36)}`;
  const html = `<!doctype html>
<html lang="es">
  <body style="margin:0;background:#f4f5ec;color:#173a32;font-family:Arial,sans-serif">
    <main style="max-width:560px;margin:24px auto;padding:28px;background:#fffdf7;border:1px solid #dfe2d8;border-radius:18px">
      <p style="margin:0;color:#2f9274;font-weight:bold;letter-spacing:.08em;text-transform:uppercase">EcoClean Car · Aviso operativo</p>
      <h1 style="margin:12px 0 6px;font-size:24px">Servicio finalizado</h1>
      <p style="margin:0 0 22px;color:#668279">La orden ${barcode} terminó su etapa de servicio.</p>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:9px 0;color:#668279">Cliente</td><td style="padding:9px 0;text-align:right;font-weight:bold">${escapeHtml(order.customer)}</td></tr>
        <tr><td style="padding:9px 0;color:#668279">Patente</td><td style="padding:9px 0;text-align:right;font-weight:bold">${escapeHtml(order.plate)}</td></tr>
        <tr><td style="padding:9px 0;color:#668279">Servicio</td><td style="padding:9px 0;text-align:right">${escapeHtml(order.serviceName)}</td></tr>
        <tr><td style="padding:9px 0;color:#668279">Subtotal</td><td style="padding:9px 0;text-align:right">${subtotal}</td></tr>
        ${discountRow}
        <tr><td style="padding:9px 0;color:#668279">Total final</td><td style="padding:9px 0;text-align:right;font-size:20px;font-weight:bold">${total}</td></tr>
      </table>
      <div style="margin-top:24px;padding:18px;text-align:center;background:#f4f5ec;border:1px dashed #cbd9cf;border-radius:12px">
        <img src="cid:ecoclean-barcode" alt="Código de barras ${barcode}" style="display:block;width:100%;max-width:360px;height:auto;margin:0 auto" />
        <p style="margin:12px 0 0;font-family:monospace;letter-spacing:.18em">${barcode}</p>
      </div>
      <p style="margin:20px 0 0;color:#789087;font-size:12px">Aviso automático enviado al finalizar el servicio.</p>
    </main>
  </body>
</html>`;
  const rawMessage = [
    `To: ${recipient}`,
    `Subject: EcoClean Car · Servicio finalizado · ${barcode}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/related; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(html, "utf8").toString("base64"),
    `--${boundary}`,
    'Content-Type: image/png; name="codigo-de-barras.png"',
    "Content-Transfer-Encoding: base64",
    "Content-ID: <ecoclean-barcode>",
    'Content-Disposition: inline; filename="codigo-de-barras.png"',
    "",
    png.toString("base64"),
    `--${boundary}--`,
    "",
  ].join("\r\n");
  const response = await connectors.proxy(
    "google-mail",
    "/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw: Buffer.from(rawMessage, "utf8").toString("base64url") }),
    },
  );
  if (!response.ok) {
    throw new Error(`Gmail rechazó la notificación de servicio (HTTP ${response.status})`);
  }
}
