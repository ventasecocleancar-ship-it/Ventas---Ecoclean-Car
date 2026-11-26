import bwipjs from "bwip-js/node";
import type { Order } from "@workspace/db/schema";

const DEFAULT_FROM = "EcoClean Car <ventas@ecocleancardetailing.com>";
const DEFAULT_REPLY_TO = "contacto.ecocleancar@gmail.com";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&" + "amp;")
    .replaceAll("<", "&" + "lt;")
    .replaceAll(">", "&" + "gt;")
    .replaceAll('"', "&" + "quot;")
    .replaceAll("'", "&" + "#39;");
}
function formatClp(value: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
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

async function sendEmailWithResend(params: {
  to: string;
  subject: string;
  html: string;
  barcodePng: Buffer;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("Falta configurar RESEND_API_KEY en el servidor");
  }

  const from = process.env.EMAIL_FROM || DEFAULT_FROM;
  const replyTo = process.env.EMAIL_REPLY_TO || DEFAULT_REPLY_TO;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      reply_to: replyTo,
      subject: params.subject,
      html: params.html,
      attachments: [
        {
          filename: "codigo-de-barras.png",
          content: params.barcodePng.toString("base64"),
          content_type: "image/png",
          content_id: "ecoclean-barcode",
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      `Resend rechazó el correo (HTTP ${response.status})${errorBody ? `: ${errorBody}` : ""}`,
    );
  }
}

export async function sendOrderReceipt(order: Order) {
  if (!order.customerEmail) {
    throw new Error("La orden no tiene correo del cliente");
  }

  const barcode = orderBarcode(order.id);
  const png = await createOrderBarcodePng(barcode);
  const price = formatClp(order.price);
  const subtotal = formatClp(order.subtotal ?? order.price);
  const discount = formatClp(order.discountAmount ?? 0);
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

  await sendEmailWithResend({
    to: order.customerEmail,
    subject: `Comprobante EcoClean Car - ${barcode}`,
    html,
    barcodePng: png,
  });
}

export async function sendBackupServiceCompletedNotification(
  order: Order,
  recipient: string,
) {
  const barcode = orderBarcode(order.id);
  const png = await createOrderBarcodePng(barcode);
  const subtotal = formatClp(order.subtotal ?? order.price);
  const discount = formatClp(order.discountAmount ?? 0);
  const total = formatClp(order.price);
  const discountRow =
    order.discountAmount > 0
      ? `<tr><td style="padding:9px 0;color:#2f9274">Descuento</td><td style="padding:9px 0;text-align:right;color:#2f9274">−${discount}</td></tr>`
      : "";

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

  await sendEmailWithResend({
    to: recipient,
    subject: `EcoClean Car · Servicio finalizado · ${barcode}`,
    html,
    barcodePng: png,
  });
}
