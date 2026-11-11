import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClerkProvider, Show, SignIn, SignUp } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  Activity, ArrowLeft, ArrowRight, Bell, Boxes, CarFront, Check, ChevronRight,
  CircleDollarSign, ClipboardCheck, Clock3, Droplets, ExternalLink, FileClock, Filter, Gauge,
  LayoutDashboard, Mail, Menu, MoreHorizontal, PanelLeft, Pencil, Plus, Printer, ReceiptText,
  RefreshCw, ScanLine, Search, Settings2, ShieldCheck, Sparkles, Trash2, UserPlus, WalletCards, X,
} from 'lucide-react';
import { Link, Redirect, Route, Switch, useLocation, useParams, Router as WouterRouter } from 'wouter';
import {
  AuditEventSeverity, OrderStatus, PaymentMethod, ServiceCategory, VehicleSize,
  type AuditEvent, type Dashboard, type Order, type Service,
  getGetAuditEventsQueryKey, getGetDashboardQueryKey, getGetOrderByBarcodeQueryKey, getGetOrderQueryKey, getGetOrdersQueryKey,
  getGetBootstrapStatusQueryKey, getGetServicesQueryKey, getGetUsersQueryKey, useCreateOrder, useCreateService, useDeleteService, useDeleteUser,
  useGetAuditEvents, useGetBootstrapStatus, useGetDashboard, useGetOrder, useGetOrders, useGetServices, useGetUsers,
  useGetOrderByBarcode, useInviteUser, useRecordPayment, useSendOrderReceipt, useUpdateOrder, useUpdateOrderStatus,
  useUpdateService, type UserAccount, UserRole,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#1e6b58',
    colorForeground: '#173a32',
    colorMutedForeground: '#71877e',
    colorDanger: '#a64a30',
    colorBackground: '#f8f4e9',
    colorInput: '#fbf8ef',
    colorInputForeground: '#173a32',
    colorNeutral: '#ccd9d1',
    fontFamily: 'Manrope, sans-serif',
    borderRadius: '0.75rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#f8f4e9] rounded-[24px] w-[440px] max-w-full overflow-hidden shadow-[0_24px_80px_rgba(27,73,59,.13)]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#173a32] font-bold',
    headerSubtitle: 'text-[#71877e]',
    socialButtonsBlockButtonText: 'text-[#285c4d] font-bold',
    formFieldLabel: 'text-[#355d50] font-bold',
    footerActionLink: 'text-[#2f9274] font-bold',
    footerActionText: 'text-[#71877e]',
    dividerText: 'text-[#8aa097]',
    identityPreviewEditButton: 'text-[#2f9274]',
    formFieldSuccessText: 'text-[#2d765e]',
    alertText: 'text-[#a64a30]',
    logoBox: 'mb-2',
    logoImage: 'h-10 w-10',
    socialButtonsBlockButton: 'border-[#ccd9d1] bg-[#fbf8ef]',
    formButtonPrimary: 'bg-[#1e6b58] hover:bg-[#285c4d] text-[#fbf5e8]',
    formFieldInput: 'bg-[#fbf8ef] border-[#ccd9d1] text-[#173a32]',
    footerAction: 'bg-transparent',
    dividerLine: 'bg-[#d9e0d5]',
    alert: 'bg-[#fff1eb] border-[#e8c7bc]',
    otpCodeFieldInput: 'bg-[#fbf8ef] border-[#ccd9d1]',
    formFieldRow: 'mb-4',
    main: 'px-6 py-4',
  },
};

const statusMeta: Record<string, { label: string; tone: string; dot: string }> = {
  INGRESADO: { label: 'Entrada', tone: 'bg-[#e4efe9] text-[#256b55]', dot: 'bg-[#3d9579]' },
  EN_SERVICIO: { label: 'En puente', tone: 'bg-[#fff0c9] text-[#906d19]', dot: 'bg-[#d19d2f]' },
  LISTO: { label: 'Servicio finalizado', tone: 'bg-[#dcecf3] text-[#21627a]', dot: 'bg-[#4289a3]' },
  PENDIENTE_DE_PAGO: { label: 'Pendiente de pago', tone: 'bg-[#fbe5d9] text-[#a64a30]', dot: 'bg-[#d26445]' },
  PAGADO: { label: 'Pagado', tone: 'bg-[#dfeee0] text-[#397044]', dot: 'bg-[#5d9e60]' },
  ENTREGADO: { label: 'Entregado', tone: 'bg-[#eee8df] text-[#71675a]', dot: 'bg-[#948575]' },
  ANULADO: { label: 'Anulado', tone: 'bg-[#f2e2e2] text-[#954d4d]', dot: 'bg-[#b36767]' },
};
const statusOrder = [OrderStatus.INGRESADO, OrderStatus.EN_SERVICIO, OrderStatus.LISTO, OrderStatus.PENDIENTE_DE_PAGO, OrderStatus.PAGADO, OrderStatus.ENTREGADO];
const money = (value = 0) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value);
const servicePrice = (service: Service, size: typeof VehicleSize[keyof typeof VehicleSize]) => size === VehicleSize.PEQUENO ? service.priceSmall : size === VehicleSize.GRANDE ? service.priceLarge : service.priceMedium;
const serviceCategoryLabel = (category: string) => category === ServiceCategory.LAVADO ? 'Lavados' : category === ServiceCategory.ADICIONAL ? 'Adicionales' : category === ServiceCategory.ESPECIALIZADO ? 'Especializados' : 'Otros servicios';
const vehicleSizeLabel = (size: string) => size === VehicleSize.PEQUENO ? 'Pequeño' : size === VehicleSize.GRANDE ? 'Grande' : 'Mediano';
const shortDate = (value: string) => new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
const todayLabel = new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

const demoServices: Service[] = [
  { id: 1, name: 'Lavado eco exterior', description: 'Lavado de bajo consumo con secado manual.', category: ServiceCategory.LAVADO, price: 8900, priceSmall: 8900, priceMedium: 8900, priceLarge: 8900, active: true },
  { id: 2, name: 'Interior + exterior', description: 'Limpieza profunda para volver a estrenar.', category: ServiceCategory.LAVADO, price: 14900, priceSmall: 14900, priceMedium: 14900, priceLarge: 14900, active: true },
  { id: 3, name: 'Detalle premium', description: 'Terminación fina, llantas y protección.', category: ServiceCategory.ESPECIALIZADO, price: 24900, priceSmall: 24900, priceMedium: 24900, priceLarge: 24900, active: true },
];
const demoOrders: Order[] = [
  { id: 1, number: 'EC-1048', plate: 'KJ-PD-42', customer: 'Camila Rojas', phone: '+56 9 6218 4420', customerEmail: null, receiptEmailStatus: 'NO_ENVIADO', receiptSentAt: null, serviceId: 2, serviceName: 'Interior + exterior', vehicleSize: VehicleSize.MEDIANO, price: 14900, status: OrderStatus.PENDIENTE_DE_PAGO, createdAt: new Date(Date.now() - 38 * 60000).toISOString(), updatedAt: new Date(Date.now() - 8 * 60000).toISOString(), enteredBy: 'Martina Soto', lastActionBy: 'Diego M.', paymentMethod: null, barcode: 'EC10480001' },
  { id: 2, number: 'EC-1047', plate: 'LZ-RB-81', customer: 'Rodrigo Vidal', phone: '+56 9 7964 1211', customerEmail: null, receiptEmailStatus: 'NO_ENVIADO', receiptSentAt: null, serviceId: 1, serviceName: 'Lavado eco exterior', vehicleSize: VehicleSize.MEDIANO, price: 8900, status: OrderStatus.LISTO, createdAt: new Date(Date.now() - 65 * 60000).toISOString(), updatedAt: new Date(Date.now() - 21 * 60000).toISOString(), enteredBy: 'Martina Soto', lastActionBy: 'Diego M.', paymentMethod: null, barcode: 'EC10470001' },
  { id: 3, number: 'EC-1046', plate: 'PV-TC-66', customer: 'Alonso Mena', phone: '+56 9 5620 3818', customerEmail: null, receiptEmailStatus: 'NO_ENVIADO', receiptSentAt: null, serviceId: 3, serviceName: 'Detalle premium', vehicleSize: VehicleSize.MEDIANO, price: 24900, status: OrderStatus.EN_SERVICIO, createdAt: new Date(Date.now() - 91 * 60000).toISOString(), updatedAt: new Date(Date.now() - 30 * 60000).toISOString(), enteredBy: 'Paula Díaz', lastActionBy: 'Diego M.', paymentMethod: null, barcode: 'EC10460001' },
  { id: 4, number: 'EC-1045', plate: 'HX-LK-09', customer: 'Nicolás Vera', phone: '+56 9 5112 7432', customerEmail: null, receiptEmailStatus: 'NO_ENVIADO', receiptSentAt: null, serviceId: 1, serviceName: 'Lavado eco exterior', vehicleSize: VehicleSize.MEDIANO, price: 8900, status: OrderStatus.ENTREGADO, createdAt: new Date(Date.now() - 160 * 60000).toISOString(), updatedAt: new Date(Date.now() - 22 * 60000).toISOString(), enteredBy: 'Martina Soto', lastActionBy: 'Martina Soto', paymentMethod: PaymentMethod.EFECTIVO, barcode: 'EC10450001' },
];
const demoAudit: AuditEvent[] = [
  { id: 1, action: 'ORDER_STATUS_CHANGED', description: 'EC-1048 pasó a Pendiente de pago', actor: 'Diego M.', timestamp: new Date(Date.now() - 8 * 60000).toISOString(), severity: AuditEventSeverity.INFO },
  { id: 2, action: 'PAYMENT_RECORDED', description: 'Pago en efectivo registrado para EC-1045', actor: 'Martina Soto', timestamp: new Date(Date.now() - 22 * 60000).toISOString(), severity: AuditEventSeverity.INFO },
  { id: 3, action: 'PRICE_OVERRIDE', description: 'Precio ajustado en EC-1041 · motivo requerido', actor: 'Diego M.', timestamp: new Date(Date.now() - 42 * 60000).toISOString(), severity: AuditEventSeverity.WARNING },
];
const demoDashboard: Dashboard = {
  todaySales: 326400, todayOrders: 31, pendingPayment: 4, readyVehicles: 6, deliveredToday: 24, cashExpected: 184700,
  cashByMethod: { EFECTIVO: 184700, DEBITO: 96500, CREDITO: 45200 }, statusCounts: { INGRESADO: 3, EN_SERVICIO: 8, LISTO: 6, PENDIENTE_DE_PAGO: 4, PAGADO: 2, ENTREGADO: 24 },
  recentOrders: demoOrders, recentActivity: demoAudit,
};
const demoUsers: UserAccount[] = [
  { id: 'demo-admin', email: 'admin@ecocleancar.cl', firstName: 'Jeff', lastName: 'Medina', role: UserRole.ADMIN, status: 'ACTIVO', createdAt: new Date(Date.now() - 45 * 86400000).toISOString(), invitationId: null },
  { id: 'demo-supervisor', email: 'supervisor@ecocleancar.cl', firstName: 'Supervisor', lastName: 'de sucursal', role: UserRole.SUPERVISOR, status: 'INVITADO', createdAt: new Date(Date.now() - 2 * 86400000).toISOString(), invitationId: 'demo-invitation' },
];

function Logo({ dark = false }: { dark?: boolean }) {
  return <Link href="/" data-testid="link-brand" className="flex items-center gap-3">
    <span className={`grid h-9 w-9 place-items-center rounded-xl ${dark ? 'bg-[#f4c957] text-[#173a32]' : 'bg-[#1e6b58] text-[#f8f1de]'}`}><Droplets size={19} strokeWidth={2.5} /></span>
    <span className={`display-font text-[17px] font-bold tracking-tight ${dark ? 'text-[#fbf5e8]' : 'text-[#173a32]'}`}>EcoClean<span className={dark ? 'text-[#f4c957]' : 'text-[#2f9274]'}>Car</span></span>
  </Link>;
}

function StatusBadge({ status }: { status: string }) {
  const meta = statusMeta[status] ?? statusMeta.INGRESADO;
  return <span data-testid={`status-order-${status}`} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${meta.tone}`}><span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{meta.label}</span>;
}

function PublicHome() {
  return <main className="app-grid min-h-[100dvh] overflow-hidden">
    <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 lg:px-10">
      <Logo />
      <div className="flex items-center gap-3">
        <Link href="/sign-in" data-testid="link-sign-in" className="hidden text-sm font-bold text-[#285c4d] transition-colors hover:text-[#1e6b58] sm:block">Ingresar</Link>
         <Link href="/sign-in" data-testid="link-admin-access" className="rounded-full bg-[#1e6b58] px-4 py-2.5 text-sm font-bold text-[#fbf5e8] shadow-sm transition-transform hover:-translate-y-0.5">Acceso administrador</Link>
      </div>
    </header>
    <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-16 lg:grid-cols-[1.06fr_.94fr] lg:px-10 lg:pb-28 lg:pt-24">
      <div className="page-in">
        <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#b8d3c7] bg-[#eef5ef] px-3 py-1.5 text-xs font-bold uppercase tracking-[.15em] text-[#2d765e]"><span className="h-2 w-2 rounded-full bg-[#f0bd3e]" /> Operación visible, caja controlada</div>
        <h1 data-testid="text-home-heading" className="display-font max-w-3xl text-5xl font-bold leading-[.98] tracking-[-.055em] text-[#173a32] sm:text-7xl">Que el lavado<br /><span className="text-[#2f9274]">avance limpio.</span></h1>
        <p className="mt-7 max-w-xl text-lg leading-8 text-[#55756b]">EcoClean Car conecta la fila, el servicio y la caja en una sola vista. Menos conversaciones cruzadas. Más verdad sobre cada auto.</p>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <Link href="/sign-in" data-testid="button-home-signin" className="group inline-flex items-center gap-3 rounded-full bg-[#1e6b58] px-5 py-3.5 text-sm font-bold text-[#fbf5e8] shadow-[0_10px_25px_rgba(30,107,88,.18)] transition-all hover:-translate-y-0.5">Entrar al portal <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" /></Link>
           <Link href="/dashboard?demo=1" data-testid="link-demo-preview" className="inline-flex items-center gap-2 rounded-full border border-[#c6d6cb] bg-[#f8f4e9] px-5 py-3.5 text-sm font-bold text-[#285c4d] transition-colors hover:bg-[#eef5ef]">Ver vista de demostración <ExternalLink size={15} /></Link>
        </div>
        <div className="mt-12 flex items-center gap-8 border-t border-[#d9e0d5] pt-6 text-xs text-[#668279]"><span><strong className="block text-xl text-[#285c4d]">1 vista</strong> por sucursal</span><span><strong className="block text-xl text-[#285c4d]">7 estados</strong> auditables</span><span><strong className="block text-xl text-[#285c4d]">0 cajas</strong> a ciegas</span></div>
      </div>
      <div className="relative rise-in delay-2">
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-[#f2c94c]/30 blur-3xl" />
        <div className="relative rounded-[28px] border border-[#c7d9cd] bg-[#edf4ec] p-3 shadow-[0_24px_80px_rgba(27,73,59,.13)]">
          <div className="rounded-[21px] bg-[#173a32] p-5 text-[#f8f1de]">
            <div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-[.14em] text-[#9ec6b8]">Sucursal Vitacura · hoy</span><span className="flex items-center gap-1.5 text-[11px] text-[#f4c957]"><span className="h-1.5 w-1.5 rounded-full bg-[#f4c957]" /> Live</span></div>
            <div className="mt-8 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-[#235043] p-4"><span className="text-xs text-[#a7c9bd]">Venta acumulada</span><strong className="mt-2 block text-2xl">$326.400</strong><span className="mt-1 block text-xs text-[#86c5a9]">+12,4% vs. martes</span></div><div className="rounded-2xl bg-[#f4c957] p-4 text-[#173a32]"><span className="text-xs opacity-70">Autos listos</span><strong className="mt-2 block text-3xl">06</strong><span className="mt-1 block text-xs opacity-70">2 esperando retiro</span></div></div>
            <div className="mt-3 rounded-2xl bg-[#235043] p-4"><div className="flex items-center justify-between text-xs"><span className="text-[#a7c9bd]">Flujo de la operación</span><span className="text-[#f4c957]">31 órdenes</span></div><div className="mt-4 flex h-14 items-end gap-1.5">{[35,42,31,58,49,66,73,62,83,70,88,76,95,81,90,100].map((h, i) => <span key={i} className={`flex-1 rounded-t-sm ${i > 11 ? 'bg-[#f4c957]' : 'bg-[#6fb99c]/70'}`} style={{ height: `${h}%` }} />)}</div></div>
            <div className="mt-3 flex items-center justify-between rounded-2xl border border-[#356254] px-4 py-3 text-xs"><span className="text-[#a7c9bd]">Caja esperada</span><span className="font-bold text-[#f8f1de]">$184.700 <ChevronRight className="ml-1 inline" size={14} /></span></div>
          </div>
        </div>
        <div className="absolute -bottom-5 -left-7 flex items-center gap-3 rounded-2xl border border-[#d4dfd0] bg-[#fbf7ec] px-4 py-3 shadow-lg"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#e4efe9] text-[#2f9274]"><ShieldCheck size={16} /></span><span className="text-xs font-bold text-[#285c4d]">Cada cambio deja rastro</span></div>
      </div>
    </section>
    <section className="mx-auto max-w-7xl px-5 pb-20 lg:px-10"><div className="grid gap-4 border-t border-[#d9e0d5] pt-10 md:grid-cols-3"><Feature icon={<Gauge />} title="Lectura de un vistazo" text="Lo importante arriba: demanda, autos listos y dinero esperado." /><Feature icon={<ClipboardCheck />} title="Ritmo de servicio" text="Un flujo corto para que el supervisor mueva cada auto sin perder contexto." /><Feature icon={<ShieldCheck />} title="Delegar sin soltar" text="Acciones, precios y pagos quedan asociados a una persona." /></div></section>
  </main>;
}

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="rounded-2xl border border-[#d9e0d5] bg-[#f8f4e9]/60 p-5"><div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-[#dfeee4] text-[#2f9274]">{icon}</div><h2 className="display-font text-lg font-bold text-[#1f5143]">{title}</h2><p className="mt-2 text-sm leading-6 text-[#668279]">{text}</p></div>;
}

function AuthPage({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const isSignIn = mode === 'sign-in';
  return <main className="app-grid flex min-h-[100dvh] items-center justify-center px-4 py-10"><div className="grid w-full max-w-5xl overflow-hidden rounded-[28px] border border-[#cadbd0] bg-[#f8f4e9] shadow-[0_24px_80px_rgba(27,73,59,.13)] md:grid-cols-[.9fr_1.1fr]">
    <div className="hidden bg-[#173a32] p-10 text-[#fbf5e8] md:block"><Logo dark /><div className="mt-28 max-w-xs"><div className="mb-6 grid h-12 w-12 place-items-center rounded-2xl bg-[#f4c957] text-[#173a32]"><Droplets /></div><h1 className="display-font text-4xl font-bold leading-[1.02]">La sucursal<br /><span className="text-[#f4c957]">sin zonas grises.</span></h1><p className="mt-6 text-sm leading-7 text-[#a7c9bd]">Un espacio de trabajo para atender más rápido y cerrar cada turno con números claros.</p></div><div className="mt-28 flex items-center gap-2 text-xs text-[#7eafa0]"><ShieldCheck size={15} /> Acceso seguro por Clerk</div></div>
    <div className="p-7 sm:p-12"><div className="md:hidden"><Logo /></div><div className="mx-auto mt-8 max-w-sm md:mt-10"><span className="text-xs font-bold uppercase tracking-[.16em] text-[#6c8c82]">{isSignIn ? 'Portal operativo' : 'Nuevo acceso'}</span><h1 className="display-font mt-3 text-3xl font-bold tracking-tight text-[#173a32]">{isSignIn ? 'Bienvenido de vuelta' : 'Crea tu acceso'}</h1><p className="mt-2 text-sm leading-6 text-[#6c8179]">{isSignIn ? 'Mira qué está pasando en tu sucursal.' : 'Invita claridad a cada turno de lavado.'}</p><form className="mt-8 space-y-5" onSubmit={(event) => { event.preventDefault(); setLocation('/dashboard'); }}><div><Label htmlFor="email">Correo de trabajo</Label><Input id="email" data-testid="input-auth-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@ecocleancar.cl" className="mt-2 h-11 bg-[#fbf8ef]" required /></div><div><div className="flex items-center justify-between"><Label htmlFor="password">Contraseña</Label>{isSignIn && <button type="button" data-testid="button-forgot-password" className="text-xs font-bold text-[#2f9274]">¿La olvidaste?</button>}</div><Input id="password" data-testid="input-auth-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="mt-2 h-11 bg-[#fbf8ef]" required /></div><Button type="submit" data-testid="button-auth-submit" className="h-11 w-full rounded-xl bg-[#1e6b58] font-bold text-[#fbf5e8] hover:bg-[#285c4d]">{isSignIn ? 'Ingresar al portal' : 'Crear cuenta'}</Button></form><div className="my-7 flex items-center gap-3 text-xs text-[#91a39b]"><Separator className="flex-1" /> o continúa con <Separator className="flex-1" /></div><button type="button" data-testid="button-auth-demo" onClick={() => setLocation('/dashboard')} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#cbdad0] bg-[#fbf8ef] text-sm font-bold text-[#285c4d] transition-colors hover:bg-[#eef5ef]"><Sparkles size={15} /> Ver demo de EcoClean</button><p className="mt-8 text-center text-sm text-[#71877e]">{isSignIn ? '¿Aún no tienes acceso?' : '¿Ya tienes una cuenta?'} <Link href={isSignIn ? '/sign-up' : '/sign-in'} data-testid="link-auth-switch" className="font-bold text-[#2f9274]">{isSignIn ? 'Solicitar acceso' : 'Ingresar'}</Link></p></div></div>
  </div></main>;
}

function ClerkSignInPage() {
  return <div className="app-grid flex min-h-[100dvh] items-center justify-center px-4 py-10"><SignIn routing="path" path={`${basePath}/sign-in`} /></div>;
}

function ClerkSignUpPage() {
  const bootstrap = useGetBootstrapStatus({ query: { queryKey: getGetBootstrapStatusQueryKey(), retry: false } });
  const invited = new URLSearchParams(window.location.search).has('__clerk_ticket');
  const canSignUp = invited || bootstrap.data?.allowed === true;
  if (bootstrap.isLoading) return <div className="app-grid flex min-h-[100dvh] items-center justify-center px-4 py-10"><p className="rounded-2xl bg-[#f8f4e9] px-6 py-5 text-sm font-semibold text-[#355d50]">Verificando el acceso inicial…</p></div>;
  if (!canSignUp) return <div className="app-grid flex min-h-[100dvh] items-center justify-center px-4 py-10"><div className="w-full max-w-md rounded-3xl bg-[#f8f4e9] p-8 text-center shadow-[0_24px_80px_rgba(27,73,59,.13)]"><ShieldCheck className="mx-auto h-10 w-10 text-[#1e6b58]" /><h1 className="display-font mt-4 text-2xl font-bold text-[#173a32]">Acceso por invitación</h1><p className="mt-3 text-sm leading-6 text-[#71877e]">El registro público está desactivado. Pide al administrador de EcoClean que cree tu usuario y revisa tu correo para activar el acceso.</p><Link href="/sign-in" className="mt-6 inline-flex rounded-xl bg-[#1e6b58] px-5 py-3 text-sm font-bold text-white">Volver a ingresar</Link></div></div>;
  return <div className="app-grid flex min-h-[100dvh] items-center justify-center px-4 py-10"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div>;
}

function HomeRoute() {
  if (!clerkPubKey) return <PublicHome />;
  return <><Show when="signed-in"><Redirect to="/dashboard" /></Show><Show when="signed-out"><PublicHome /></Show></>;
}

function PortalGuard({ children }: { children: ReactNode }) {
  const demoPreview = typeof window !== 'undefined' && (
    new URLSearchParams(window.location.search).get('demo') === '1' ||
    window.sessionStorage.getItem('ecoclean-demo') === '1'
  );
  if (demoPreview) {
    if (typeof window !== 'undefined') window.sessionStorage.setItem('ecoclean-demo', '1');
    return <>{children}</>;
  }
  if (!clerkPubKey) return <>{children}</>;
  return <><Show when="signed-in">{children}</Show><Show when="signed-out"><Redirect to="/" /></Show></>;
}

function AppShell({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const [mobileNav, setMobileNav] = useState(false);
  const nav = [{ href: '/dashboard', label: 'Resumen', icon: LayoutDashboard }, { href: '/orders', label: 'Órdenes', icon: CarFront }, { href: '/services', label: 'Servicios', icon: Boxes }, { href: '/audit', label: 'Auditoría', icon: FileClock }];
  return <div className="min-h-[100dvh] bg-[#f3f1e8]"><aside className={`fixed inset-y-0 left-0 z-40 flex w-[244px] flex-col bg-[#173a32] px-4 py-5 text-[#fbf5e8] transition-transform lg:translate-x-0 ${mobileNav ? 'translate-x-0' : '-translate-x-full'}`}><div className="px-2"><Logo dark /></div><div className="mt-11 px-2 text-[10px] font-bold uppercase tracking-[.18em] text-[#7eafa0]">Operación</div><nav className="mt-3 space-y-1">{nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} data-testid={`link-nav-${label.toLowerCase()}`} onClick={() => setMobileNav(false)} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold transition-colors ${location === href ? 'bg-[#f4c957] text-[#173a32]' : 'text-[#b0cdc1] hover:bg-[#244d42] hover:text-[#fbf5e8]'}`}><Icon size={18} />{label}{href === '/orders' && <span className="ml-auto rounded-md bg-[#d26445] px-1.5 py-0.5 text-[10px] text-white">4</span>}</Link>)}</nav><div className="mt-9 px-2 text-[10px] font-bold uppercase tracking-[.18em] text-[#7eafa0]">Administración</div><nav className="mt-3 space-y-1"><Link href="/settings" data-testid="link-nav-configuracion" className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold ${location === '/settings' ? 'bg-[#f4c957] text-[#173a32]' : 'text-[#b0cdc1] hover:bg-[#244d42]'}`}><Settings2 size={18} />Configuración</Link></nav><div className="mt-auto rounded-2xl border border-[#31594e] bg-[#20463c] p-3"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#f4c957] text-xs font-bold text-[#173a32]">DM</span><div><p className="text-xs font-bold">Diego Morales</p><p className="mt-0.5 text-[10px] text-[#92b8aa]">Supervisor · Vitacura</p></div><MoreHorizontal size={16} className="ml-auto text-[#92b8aa]" /></div></div></aside>{mobileNav && <button aria-label="Cerrar menú" data-testid="button-close-mobile-nav" onClick={() => setMobileNav(false)} className="fixed inset-0 z-30 bg-[#173a32]/35 lg:hidden" /> }<div className="lg:pl-[244px]"><header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-[#dfe2d8] bg-[#f3f1e8]/90 px-5 backdrop-blur-md lg:px-9"><div className="flex items-center gap-3"><button type="button" data-testid="button-open-mobile-nav" aria-label="Abrir menú" onClick={() => setMobileNav(true)} className="rounded-lg p-2 text-[#285c4d] hover:bg-[#e7e9df] lg:hidden"><Menu size={21} /></button><div className="hidden items-center gap-2 text-xs text-[#71877e] sm:flex"><span className="h-2 w-2 rounded-full bg-[#4d9d7b]" /> Sucursal Vitacura <ChevronRight size={13} /> <span className="text-[#285c4d]">En vivo</span></div></div><div className="flex items-center gap-3"><button type="button" data-testid="button-notifications" className="relative rounded-xl border border-[#d9ded5] bg-[#f8f5eb] p-2.5 text-[#486d60] hover:bg-[#eef5ef]"><Bell size={17} /><span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#d26445]" /></button><div className="hidden h-7 w-px bg-[#d9ded5] sm:block" /><button type="button" data-testid="button-user-menu" className="flex items-center gap-2 rounded-xl px-1 py-1 text-left"><span className="grid h-8 w-8 place-items-center rounded-full bg-[#c5dfcf] text-xs font-bold text-[#285c4d]">DM</span><span className="hidden text-xs font-bold text-[#285c4d] sm:block">Diego Morales</span></button></div></header><main className="mx-auto max-w-[1480px] p-5 lg:p-9">{children}</main></div></div>;
}

function PageTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.17em] text-[#668279]"><span className="h-1.5 w-1.5 rounded-full bg-[#f0bd3e]" /> {eyebrow}</div><h1 className="display-font text-3xl font-bold tracking-[-.04em] text-[#173a32] sm:text-4xl">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#71877e]">{description}</p></div>{action}</div>;
}

function MetricCard({ label, value, helper, icon, accent = 'green', testId }: { label: string; value: string | number; helper: string; icon: ReactNode; accent?: string; testId: string }) {
  const colors: Record<string, string> = { green: 'bg-[#e3f0e8] text-[#2f9274]', yellow: 'bg-[#fff0c9] text-[#9b771c]', blue: 'bg-[#deedf1] text-[#347f98]', coral: 'bg-[#f9e3d9] text-[#b8593e]' };
  return <Card data-testid={testId} className="soft-shadow border-[#dfe2d8] bg-[#faf8f0]"><CardContent className="p-5"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold text-[#71877e]">{label}</p><p className="display-font mt-2 text-[29px] font-bold tracking-[-.04em] text-[#173a32]">{value}</p><p className="mt-1 text-[11px] text-[#789087]">{helper}</p></div><span className={`grid h-10 w-10 place-items-center rounded-xl ${colors[accent]}`}>{icon}</span></div></CardContent></Card>;
}

function useDemo<T>(query: { data?: T; isLoading: boolean; isError: boolean }, fallback: T) {
  return { data: query.data ?? (query.isError ? fallback : undefined), isLoading: query.isLoading, isError: query.isError };
}

function DashboardPage() {
  const raw = useGetDashboard({ query: { queryKey: getGetDashboardQueryKey(), retry: false } });
  const { data, isLoading, isError } = useDemo(raw, demoDashboard);
  if (isLoading) return <PageSkeleton />;
  return <div className="page-in"><PageTitle eyebrow="Control de sucursal · jueves 24 de octubre" title="Buenos días, Diego." description={`${todayLabel.charAt(0).toUpperCase() + todayLabel.slice(1)} · Tu operación está en marcha.`} action={<Button asChild data-testid="button-new-order" className="rounded-xl bg-[#1e6b58] font-bold text-[#fbf5e8] hover:bg-[#285c4d]"><Link href="/orders/new"><Plus size={17} /> Nueva orden</Link></Button>} />{isError && <PreviewNotice />}{data && <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard testId="metric-sales" label="Ventas de hoy" value={money(data.todaySales)} helper={`${data.todayOrders} órdenes procesadas`} icon={<CircleDollarSign size={20} />} /><MetricCard testId="metric-pending-payment" label="Pendientes de pago" value={data.pendingPayment} helper="Revisar antes de entregar" icon={<WalletCards size={20} />} accent="coral" /><MetricCard testId="metric-ready-vehicles" label="Vehículos listos" value={String(data.readyVehicles).padStart(2, '0')} helper="Esperando retiro" icon={<CarFront size={20} />} accent="yellow" /><MetricCard testId="metric-delivered" label="Entregados hoy" value={data.deliveredToday} helper="77% del flujo cerrado" icon={<Check size={20} />} accent="blue" /></div><div className="mt-5 grid gap-5 xl:grid-cols-[1.5fr_1fr]"><Card className="border-[#dfe2d8] bg-[#faf8f0]"><CardHeader className="flex-row items-center justify-between space-y-0 border-b border-[#e7e8df] px-5 py-4"><div><CardTitle className="display-font text-lg text-[#173a32]">Pulso de la operación</CardTitle><p className="mt-1 text-xs text-[#789087]">Órdenes por estado, en tiempo real</p></div><Link href="/orders" data-testid="link-dashboard-orders" className="text-xs font-bold text-[#2f9274]">Ver cola completa <ArrowRight className="ml-1 inline" size={14} /></Link></CardHeader><CardContent className="p-5"><div className="flex h-48 items-end gap-2 border-b border-l border-[#dfe4da] px-3 pb-0 pt-5">{Object.entries(data.statusCounts).map(([status, count], i) => <div key={status} className="group flex h-full flex-1 flex-col justify-end"><div className="relative mx-auto w-full max-w-[48px] rounded-t-lg bg-[#4d9d7b] transition-all group-hover:bg-[#f0bd3e]" style={{ height: `${Math.max(12, Math.min(94, count / 24 * 100))}%` }}><span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[11px] font-bold text-[#285c4d]">{count}</span></div><span className="mt-3 truncate text-center text-[10px] font-semibold text-[#789087]">{statusMeta[status]?.label.split(' ')[0] ?? status}</span></div>)}</div><div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-[#668279]"><span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#4d9d7b]" />Flujo activo</span><span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#f0bd3e]" />Atención requerida</span></div></CardContent></Card><Card className="border-[#dfe2d8] bg-[#faf8f0]"><CardHeader className="px-5 py-4"><CardTitle className="display-font text-lg text-[#173a32]">Caja esperada</CardTitle><p className="mt-1 text-xs text-[#789087]">Cuadratura de ventas por método</p></CardHeader><CardContent className="px-5 pb-5"><div className="rounded-2xl bg-[#173a32] p-5 text-[#fbf5e8]"><span className="text-xs text-[#a7c9bd]">Total a cerrar</span><strong data-testid="text-cash-expected" className="display-font mt-1 block text-3xl">{money(data.cashExpected)}</strong><div className="mt-5 space-y-3">{Object.entries(data.cashByMethod).map(([method, amount]) => <div key={method} className="flex items-center justify-between border-t border-[#31594e] pt-3 text-xs"><span className="text-[#a7c9bd]">{methodLabel(method)}</span><span data-testid={`text-cash-${method.toLowerCase()}`} className="font-bold">{money(amount)}</span></div>)}</div></div><Link href="/audit" data-testid="link-cash-audit" className="mt-4 flex items-center justify-between text-xs font-bold text-[#2f9274]">Ver trazabilidad de caja <ArrowRight size={14} /></Link></CardContent></Card></div><div className="mt-5 grid gap-5 xl:grid-cols-[1.5fr_1fr]"><RecentOrders orders={data.recentOrders} /><ActivityPanel events={data.recentActivity} /></div></>}</div>;
}

function PreviewNotice() { return <div data-testid="status-demo-preview" className="mb-5 flex items-center gap-3 rounded-xl border border-[#e6d29b] bg-[#fff5d8] px-4 py-3 text-xs text-[#82651d]"><Sparkles size={16} /><span><strong>Vista de demostración:</strong> la API no está conectada. Las acciones de guardado siguen protegidas.</span></div>; }
function methodLabel(method: string) { return method === 'EFECTIVO' ? 'Efectivo' : method === 'DEBITO' ? 'Débito' : 'Crédito'; }
function roleLabel(role: string) { return role === 'ADMIN' ? 'Administrador' : role === 'SUPERVISOR' ? 'Supervisor' : role === 'CAJERO' ? 'Cajero' : 'Operador'; }
function RecentOrders({ orders }: { orders: Order[] }) { return <Card className="border-[#dfe2d8] bg-[#faf8f0]"><CardHeader className="flex-row items-center justify-between space-y-0 px-5 py-4"><div><CardTitle className="display-font text-lg text-[#173a32]">Actividad reciente</CardTitle><p className="mt-1 text-xs text-[#789087]">Últimas órdenes en tu sucursal</p></div><Link href="/orders" data-testid="link-recent-orders" className="rounded-lg p-2 text-[#4d7566] hover:bg-[#eef5ef]"><ArrowRight size={17} /></Link></CardHeader><CardContent className="p-0">{orders.slice(0, 4).map(order => <Link href={`/orders/${order.id}`} key={order.id} data-testid={`row-recent-order-${order.id}`} className="flex items-center gap-4 border-t border-[#e7e8df] px-5 py-4 transition-colors hover:bg-[#f4f5ed]"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e5efe8] text-[#2f9274]"><CarFront size={17} /></span><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><strong className="mono text-xs text-[#285c4d]">{order.number}</strong><span className="text-[11px] text-[#84988f]">{order.plate}</span></span><span className="mt-1 block truncate text-xs text-[#71877e]">{order.customer} · {order.serviceName}</span></span><span className="hidden sm:block"><StatusBadge status={order.status} /></span><span className="text-xs font-bold text-[#285c4d]">{money(order.price)}</span></Link>)}</CardContent></Card>; }
function ActivityPanel({ events }: { events: AuditEvent[] }) { return <Card className="border-[#dfe2d8] bg-[#faf8f0]"><CardHeader className="px-5 py-4"><CardTitle className="display-font text-lg text-[#173a32]">Últimos movimientos</CardTitle><p className="mt-1 text-xs text-[#789087]">Registro de actividad de hoy</p></CardHeader><CardContent className="space-y-4 px-5">{events.slice(0, 4).map(event => <div key={event.id} data-testid={`activity-event-${event.id}`} className="flex gap-3"><span className={`mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg ${event.severity === 'WARNING' ? 'bg-[#fff0c9] text-[#9b771c]' : 'bg-[#e4efe9] text-[#2f9274]'}`}><Activity size={14} /></span><div className="min-w-0"><p className="text-xs font-semibold leading-5 text-[#355d50]">{event.description}</p><p className="mt-1 text-[10px] text-[#8aa097]">{event.actor} · {shortDate(event.timestamp)}</p></div></div>)}</CardContent></Card>; }

function PageSkeleton() { return <div className="animate-pulse space-y-5"><div className="h-12 w-64 rounded-xl bg-[#e1e4da]" /><div className="grid gap-4 sm:grid-cols-4">{[1, 2, 3, 4].map(i => <div key={i} className="h-32 rounded-2xl bg-[#e1e4da]" />)}</div><div className="h-72 rounded-2xl bg-[#e1e4da]" /></div>; }

function OrdersPage() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [scannerInput, setScannerInput] = useState('');
  const [scanRequest, setScanRequest] = useState({ value: '', attempt: 0 });
  const [scanError, setScanError] = useState('');
  const query = useGetOrders({ search: search || undefined, status: (status || undefined) as typeof OrderStatus[keyof typeof OrderStatus] | undefined }, { query: { queryKey: getGetOrdersQueryKey({ search: search || undefined, status: (status || undefined) as typeof OrderStatus[keyof typeof OrderStatus] | undefined }), retry: false } });
  const scanQuery = useGetOrderByBarcode(scanRequest.value, { query: { queryKey: [...getGetOrderByBarcodeQueryKey(scanRequest.value), scanRequest.attempt], enabled: Boolean(scanRequest.value), retry: false } });
  const orders = query.data ?? (query.isError ? demoOrders : []);
  useEffect(() => {
    if (scanRequest.value && scanQuery.data) setLocation(`/orders/${scanQuery.data.id}`);
  }, [scanRequest.value, scanQuery.data, setLocation]);
  useEffect(() => {
    if (scanRequest.value && scanQuery.isError && !scanQuery.isFetching) {
      setScanError('No encontramos una orden con ese código. Intenta escanearlo otra vez.');
    }
  }, [scanRequest.value, scanQuery.isError, scanQuery.isFetching]);
  const submitScan = (event: FormEvent) => {
    event.preventDefault();
    const value = scannerInput.trim().toUpperCase();
    if (!value) {
      setScanError('Escanea o ingresa el código del comprobante.');
      return;
    }
    setScanError('');
    setScanRequest(current => ({ value, attempt: current.attempt + 1 }));
  };
  return <div className="page-in">
    <PageTitle eyebrow="Flujo de vehículos" title="Órdenes" description="Sigue cada vehículo desde la entrada hasta la entrega." action={<Button asChild data-testid="button-orders-new" className="rounded-xl bg-[#1e6b58] font-bold text-[#fbf5e8] hover:bg-[#285c4d]"><Link href="/orders/new"><Plus size={17} /> Nueva orden</Link></Button>} />
    {query.isError && <PreviewNotice />}
    <Card className="mb-4 border-[#dfe2d8] bg-[#faf8f0]">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#e4efe9] text-[#2f9274]"><ScanLine size={21} /></div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-[#285c4d]">Buscar una orden con el código del cliente</h2>
          <p className="mt-1 text-xs text-[#789087]">Escanea el código de barras del teléfono; la orden se abrirá para revisar el servicio y registrar el pago.</p>
        </div>
        <form onSubmit={submitScan} className="flex w-full gap-2 sm:max-w-md">
          <Input autoFocus data-testid="input-scan-order-barcode" value={scannerInput} onChange={event => setScannerInput(event.target.value)} placeholder="Escanea o escribe el código" className="h-10 min-w-0 flex-1 border-[#d7ded5] bg-[#fbf8ef]" aria-label="Código de barras de la orden" />
          <Button type="submit" data-testid="button-scan-order" disabled={scanQuery.isFetching} className="h-10 rounded-xl bg-[#1e6b58] font-bold text-white">{scanQuery.isFetching ? 'Buscando…' : 'Buscar'}</Button>
        </form>
      </CardContent>
      {scanError && <p data-testid="status-scan-error" className="px-5 pb-4 text-xs font-semibold text-[#a64a30]">{scanError}</p>}
    </Card>
    <Card className="border-[#dfe2d8] bg-[#faf8f0]">
      <CardContent className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1"><Search size={17} className="absolute left-3 top-3 text-[#789087]" /><Input data-testid="input-orders-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por patente, cliente, teléfono o servicio…" className="h-10 border-[#d7ded5] bg-[#fbf8ef] pl-10" /></div>
          <div className="flex gap-2 overflow-x-auto">{['', 'INGRESADO', 'EN_SERVICIO', 'LISTO', 'PENDIENTE_DE_PAGO', 'ENTREGADO'].map(filter => <button key={filter || 'all'} type="button" data-testid={`button-filter-${filter || 'all'}`} onClick={() => setStatus(filter)} className={`whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${status === filter ? 'border-[#1e6b58] bg-[#1e6b58] text-white' : 'border-[#d7ded5] text-[#668279] hover:bg-[#eef5ef]'}`}>{filter ? statusMeta[filter]?.label : 'Todas'}</button>)}</div>
        </div>
      </CardContent>
    </Card>
    <div className="mt-4 overflow-hidden rounded-2xl border border-[#dfe2d8] bg-[#faf8f0]">
      <div className="hidden grid-cols-[1.15fr_1.3fr_1fr_.75fr_1fr_24px] gap-4 border-b border-[#e7e8df] px-5 py-3 text-[10px] font-bold uppercase tracking-[.12em] text-[#8aa097] md:grid"><span>Orden</span><span>Cliente</span><span>Servicio</span><span>Precio</span><span>Estado</span><span /></div>
      {orders.map(order => <Link href={`/orders/${order.id}`} key={order.id} data-testid={`row-order-${order.id}`} className="grid gap-3 border-b border-[#e7e8df] px-5 py-4 transition-colors last:border-0 hover:bg-[#f4f5ed] md:grid-cols-[1.15fr_1.3fr_1fr_.75fr_1fr_24px] md:items-center md:gap-4">
        <div><div className="flex items-center gap-2"><span className="mono text-xs font-bold text-[#285c4d]">{order.number}</span><span className="mono rounded bg-[#eee9de] px-1.5 py-0.5 text-[10px] text-[#75877e]">{order.plate}</span></div><p className="mt-1 text-[11px] text-[#8aa097]">{shortDate(order.createdAt)}</p></div>
        <div><p className="text-sm font-bold text-[#355d50]">{order.customer}</p><p className="mt-1 text-xs text-[#8aa097]">{order.phone}</p></div>
        <div className="text-xs text-[#668279]">{order.serviceName}</div>
        <div className="text-sm font-bold text-[#285c4d]">{money(order.price)}</div>
        <div><StatusBadge status={order.status} /></div>
        <ChevronRight size={16} className="hidden text-[#a5b4ac] md:block" />
      </Link>)}
      {!orders.length && <div className="p-14 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#e4efe9] text-[#2f9274]"><Search /></div><h3 className="mt-4 font-bold text-[#285c4d]">No encontramos órdenes</h3><p className="mt-1 text-sm text-[#789087]">Prueba con otra búsqueda o limpia el filtro.</p><button type="button" data-testid="button-clear-order-filters" onClick={() => { setSearch(''); setStatus(''); }} className="mt-4 text-xs font-bold text-[#2f9274]">Limpiar filtros</button></div>}
    </div>
  </div>;
}

function NewOrderPage() {
  const [, setLocation] = useLocation();
  const servicesQuery = useGetServices({ query: { queryKey: getGetServicesQueryKey(), retry: false } });
  const services = servicesQuery.data ?? demoServices;
  const activeServices = services.filter(service => service.active);
  const create = useCreateOrder();
  const [form, setForm] = useState({ plate: '', customer: '', phone: '', email: '', priceOverride: '' });
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([]);
  const [vehicleSize, setVehicleSize] = useState<typeof VehicleSize[keyof typeof VehicleSize]>(VehicleSize.MEDIANO);
  const [initialServiceSelected, setInitialServiceSelected] = useState(false);
  const [serviceSearch, setServiceSearch] = useState('');
  const [error, setError] = useState('');
  const update = (key: string, value: string) => setForm(current => ({ ...current, [key]: value }));
  const searchTerm = serviceSearch.trim().toLocaleLowerCase('es-CL').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const visibleServices = activeServices.filter(service => {
    const content = `${service.name} ${service.description} ${serviceCategoryLabel(service.category)}`
      .toLocaleLowerCase('es-CL')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    return content.includes(searchTerm);
  });
  useEffect(() => {
    if (!servicesQuery.isLoading && !initialServiceSelected) {
      const firstWash = activeServices.find(service => service.category === ServiceCategory.LAVADO) ?? activeServices[0];
      if (firstWash) setSelectedServiceIds([firstWash.id]);
      setInitialServiceSelected(true);
    }
  }, [activeServices, servicesQuery.isLoading, initialServiceSelected]);
  const selectedServices = selectedServiceIds
    .map(id => activeServices.find(service => service.id === id))
    .filter((service): service is Service => Boolean(service));
  const subtotal = selectedServices.reduce((sum, service) => sum + servicePrice(service, vehicleSize), 0);
  const total = form.priceOverride ? Number(form.priceOverride) : subtotal;
  const toggleService = (id: number) => {
    setSelectedServiceIds(current => current.includes(id) ? current.filter(serviceId => serviceId !== id) : [...current, id]);
    setError('');
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.plate || !form.customer || !form.phone || selectedServices.length === 0) {
      setError('Completa los datos del cliente y selecciona al menos un servicio.');
      return;
    }
    setError('');
    create.mutate({
      data: {
        plate: form.plate.toUpperCase(),
        customer: form.customer,
        phone: form.phone,
        customerEmail: form.email.trim() || null,
        serviceIds: selectedServices.map(service => service.id),
        vehicleSize,
        priceOverride: form.priceOverride ? Number(form.priceOverride) : null,
      },
    }, {
      onSuccess: (order) => {
        queryClient.invalidateQueries({ queryKey: getGetOrdersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        setLocation(`/orders/${order.id}`);
      },
      onError: () => setError('No pudimos guardar la orden. Revisa tu conexión e inténtalo nuevamente.'),
    });
  };
  return <div className="page-in max-w-4xl">
    <Link href="/orders" data-testid="link-back-orders" className="mb-6 inline-flex items-center gap-2 text-xs font-bold text-[#668279] hover:text-[#1e6b58]"><ArrowLeft size={15} /> Volver a órdenes</Link>
    <PageTitle eyebrow="Ingreso de vehículo" title="Nueva orden" description="Registra lo esencial. El equipo completa el resto en movimiento." />
    <form onSubmit={submit} className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
      <Card className="border-[#dfe2d8] bg-[#faf8f0]">
        <CardHeader><CardTitle className="display-font text-lg text-[#173a32]">Datos del cliente</CardTitle><p className="text-xs text-[#789087]">La patente será el identificador rápido de esta visita.</p></CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div><Label htmlFor="plate">Patente</Label><Input id="plate" data-testid="input-order-plate" value={form.plate} onChange={e => update('plate', e.target.value)} placeholder="AB-CD-12" className="mt-2 h-11 bg-[#fbf8ef] uppercase" required /></div>
            <div><Label htmlFor="customer">Nombre cliente</Label><Input id="customer" data-testid="input-order-customer" value={form.customer} onChange={e => update('customer', e.target.value)} placeholder="Nombre y apellido" className="mt-2 h-11 bg-[#fbf8ef]" required /></div>
          </div>
          <div><Label htmlFor="phone">Teléfono</Label><Input id="phone" data-testid="input-order-phone" value={form.phone} onChange={e => update('phone', e.target.value)} placeholder="+56 9 0000 0000" className="mt-2 h-11 bg-[#fbf8ef]" required /></div>
          <div><Label htmlFor="customer-email">Gmail o correo <span className="font-normal text-[#8aa097]">(opcional)</span></Label><Input id="customer-email" data-testid="input-order-email" type="email" value={form.email} onChange={e => update('email', e.target.value)} placeholder="cliente@gmail.com" className="mt-2 h-11 bg-[#fbf8ef]" /><p className="mt-1 text-[10px] text-[#789087]">Enviaremos el comprobante con código de barras al registrar la orden.</p></div>
          <div><Label htmlFor="notes">Nota de ingreso <span className="font-normal text-[#8aa097]">(opcional, solo para el equipo)</span></Label><Textarea id="notes" data-testid="input-order-notes" placeholder="Ej. revisar rayón en puerta trasera…" className="mt-2 min-h-24 resize-none bg-[#fbf8ef]" /></div>
        </CardContent>
      </Card>
      <Card className="h-fit border-[#dfe2d8] bg-[#faf8f0]">
        <CardHeader><CardTitle className="display-font text-lg text-[#173a32]">Servicios</CardTitle><p className="text-xs text-[#789087]">Selecciona uno o más servicios; sus precios se suman automáticamente.</p></CardHeader>
        <CardContent className="space-y-4">
          <fieldset>
            <legend className="mb-2 text-xs font-bold text-[#355d50]">Tamaño del vehículo</legend>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: VehicleSize.PEQUENO, label: 'Pequeño' },
                { value: VehicleSize.MEDIANO, label: 'Mediano' },
                { value: VehicleSize.GRANDE, label: 'Grande' },
              ].map(size => <label key={size.value} className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-2 py-2.5 text-xs font-semibold ${vehicleSize === size.value ? 'border-[#5a9a78] bg-[#eaf3ec] text-[#285c4d]' : 'border-[#e1e5dc] text-[#789087]'}`}><input type="radio" name="vehicle-size" data-testid={`radio-vehicle-size-${size.value.toLowerCase()}`} value={size.value} checked={vehicleSize === size.value} onChange={() => setVehicleSize(size.value)} className="accent-[#1e6b58]" />{size.label}</label>)}
            </div>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-xs font-bold text-[#355d50]">Servicios disponibles</legend>
            <div className="relative mb-3">
              <Search size={16} className="absolute left-3 top-3 text-[#789087]" />
              <Input id="order-service-search" data-testid="input-order-service-search" type="search" value={serviceSearch} onChange={event => setServiceSearch(event.target.value)} placeholder="Buscar servicio por nombre…" className="h-10 border-[#d7ded5] bg-[#fbf8ef] pl-10" />
              {serviceSearch && <button type="button" data-testid="button-clear-service-search" onClick={() => setServiceSearch('')} className="absolute right-3 top-2.5 text-[11px] font-semibold text-[#2f9274]">Limpiar</button>}
            </div>
            {[ServiceCategory.LAVADO, ServiceCategory.ADICIONAL, ServiceCategory.ESPECIALIZADO, ServiceCategory.GENERAL].map(category => {
              const group = visibleServices.filter(service => service.category === category);
              if (!group.length) return null;
              return <div key={category} className="space-y-2">
                <h3 className="pt-2 text-[10px] font-bold uppercase tracking-wider text-[#8aa097]">{serviceCategoryLabel(category)}</h3>
                {group.map(service => {
                  const checked = selectedServiceIds.includes(service.id);
                  return <label key={service.id} htmlFor={`order-service-${service.id}`} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${checked ? 'border-[#7fb39a] bg-[#eaf3ec]' : 'border-[#e1e5dc] bg-[#fbf8ef] hover:border-[#b9cdc0]'}`}>
                    <input id={`order-service-${service.id}`} data-testid={`checkbox-order-service-${service.id}`} type="checkbox" checked={checked} onChange={() => toggleService(service.id)} className="mt-1 h-4 w-4 accent-[#1e6b58]" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-3"><span className="text-xs font-bold text-[#355d50]">{service.name}</span><span className="shrink-0 text-xs font-bold text-[#285c4d]">{money(servicePrice(service, vehicleSize))}</span></span>
                      {service.description && <span className="mt-1 block text-[10px] leading-4 text-[#789087]">{service.description}</span>}
                    </span>
                  </label>;
                })}
              </div>;
            })}
            {!visibleServices.length && <p data-testid="text-no-services-found" className="rounded-xl border border-dashed border-[#cbd9cf] p-5 text-center text-xs text-[#789087]">No encontramos servicios con ese nombre.</p>}
          </fieldset>
          <div className="rounded-xl border border-[#d8e5db] bg-[#eaf3ec] p-4">
            <div className="mb-3 flex items-center justify-between"><p className="text-xs font-bold text-[#355d50]">Resumen</p><span className="rounded-full bg-white/70 px-2 py-1 text-[10px] font-semibold text-[#668279]">{selectedServices.length} {selectedServices.length === 1 ? 'servicio' : 'servicios'}</span></div>
            {selectedServices.length ? <div className="space-y-2">{selectedServices.map(service => <div key={service.id} className="flex justify-between gap-3 text-xs"><span className="text-[#668279]">{service.name}</span><span className="font-semibold text-[#355d50]">{money(servicePrice(service, vehicleSize))}</span></div>)}</div> : <p className="text-xs text-[#789087]">Selecciona al menos un servicio.</p>}
            <div className="mt-3 flex items-center justify-between border-t border-[#c9ddd0] pt-3"><span className="text-xs font-bold text-[#355d50]">Subtotal</span><strong data-testid="text-order-service-subtotal" className="text-sm font-bold text-[#285c4d]">{money(subtotal)}</strong></div>
          </div>
          <div><Label htmlFor="priceOverride">Total acordado <span className="font-normal text-[#8aa097]">(opcional)</span></Label><Input id="priceOverride" data-testid="input-order-price" type="number" min="0" value={form.priceOverride} onChange={e => update('priceOverride', e.target.value)} placeholder={String(subtotal)} className="mt-2 h-11 bg-[#fbf8ef]" /></div>
          <div className="flex items-end justify-between rounded-xl bg-[#173a32] px-4 py-3 text-[#fbf5e8]"><span className="text-xs font-semibold text-[#d5e5dc]">{form.priceOverride ? 'Total acordado' : 'Total del servicio'}</span><strong data-testid="text-order-service-total" className="display-font text-2xl">{money(total)}</strong></div>
          {error && <p data-testid="status-order-error" className="rounded-lg bg-[#f9e3d9] px-3 py-2 text-xs font-semibold text-[#a64a30]">{error}</p>}
          <Button type="submit" data-testid="button-create-order" disabled={create.isPending || servicesQuery.isLoading} className="h-11 w-full rounded-xl bg-[#1e6b58] font-bold text-[#fbf5e8] hover:bg-[#285c4d]">{create.isPending ? 'Guardando…' : 'Registrar ingreso'} <ArrowRight size={16} /></Button>
          <p className="text-center text-[10px] leading-4 text-[#8aa097]">Al registrar, se crea el ticket con los servicios seleccionados y el total calculado.</p>
        </CardContent>
      </Card>
    </form>
  </div>;
}

function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const query = useGetOrder(id, { query: { queryKey: getGetOrderQueryKey(id), retry: false } });
  const order = query.data ?? (query.isError ? demoOrders.find(item => item.id === id) : undefined);
  const updateStatus = useUpdateOrderStatus();
  const recordPayment = useRecordPayment();
  const sendReceipt = useSendOrderReceipt();
  const updateOrder = useUpdateOrder();
  const [paymentMethod, setPaymentMethod] = useState<'EFECTIVO' | 'DEBITO' | 'CREDITO'>('EFECTIVO');
  const [editMode, setEditMode] = useState(false);
  const [customer, setCustomer] = useState('');
  const [phone, setPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [notice, setNotice] = useState('');
  if (query.isLoading) return <PageSkeleton />;
  if (!order) return <div className="rounded-2xl border border-[#e8c7bc] bg-[#fff1eb] p-8 text-center"><h2 className="font-bold text-[#9b4e37]">No encontramos esta orden</h2><Link href="/orders" data-testid="link-order-not-found" className="mt-3 inline-block text-sm font-bold text-[#2f9274]">Volver a órdenes</Link></div>;
  const move = (nextStatus: typeof OrderStatus[keyof typeof OrderStatus]) => {
    updateStatus.mutate({ id: order.id, data: { status: nextStatus, reason: null } }, {
      onSuccess: next => {
        queryClient.setQueryData(getGetOrderQueryKey(order.id), next);
        queryClient.invalidateQueries({ queryKey: getGetOrdersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        setNotice(`Orden actualizada a ${statusMeta[next.status]?.label}.`);
      },
      onError: () => setNotice('No pudimos actualizar el estado. La acción no se guardó.'),
    });
  };
  const pay = () => {
    recordPayment.mutate({ id: order.id, data: { method: paymentMethod, amount: order.price } }, {
      onSuccess: next => {
        queryClient.setQueryData(getGetOrderQueryKey(order.id), next);
        queryClient.invalidateQueries({ queryKey: getGetOrdersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        setNotice('Pago registrado.');
      },
      onError: () => setNotice('El pago no se registró. Intenta nuevamente.'),
    });
  };
  const saveEdit = () => {
    updateOrder.mutate({ id: order.id, data: { customer, phone, customerEmail: customerEmail.trim() || null, reason: 'Actualización de datos desde detalle' } }, {
      onSuccess: next => {
        queryClient.setQueryData(getGetOrderQueryKey(order.id), next);
        setEditMode(false);
        setNotice(next.receiptEmailStatus === 'ENVIADO' ? 'Datos guardados y comprobante enviado.' : 'Datos del cliente actualizados.');
      },
      onError: () => setNotice('No se pudo actualizar el cliente. Revisa el correo e inténtalo nuevamente.'),
    });
  };
  const retryReceipt = () => {
    sendReceipt.mutate({ id: order.id }, {
      onSuccess: next => {
        queryClient.setQueryData(getGetOrderQueryKey(order.id), next);
        setNotice(next.receiptEmailStatus === 'ENVIADO' ? `Comprobante enviado a ${next.customerEmail}.` : 'No se pudo enviar el comprobante. Puedes volver a intentarlo.');
      },
      onError: () => setNotice('No se pudo enviar el comprobante. Revisa la conexión de Gmail e inténtalo otra vez.'),
    });
  };
  const currentIndex = order.status === OrderStatus.ANULADO ? -1 : statusOrder.indexOf(order.status as Exclude<typeof OrderStatus[keyof typeof OrderStatus], 'ANULADO'>);
  const next = currentIndex >= 0 ? statusOrder[currentIndex + 1] : undefined;
  return <div className="page-in">
    <Link href="/orders" data-testid="link-detail-back" className="mb-6 inline-flex items-center gap-2 text-xs font-bold text-[#668279] hover:text-[#1e6b58]"><ArrowLeft size={15} /> Volver a órdenes</Link>
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <div className="flex items-center gap-3"><span className="mono text-sm font-bold text-[#2f9274]">{order.number}</span><StatusBadge status={order.status} /></div>
        <h1 data-testid="text-order-detail-title" className="display-font mt-3 text-4xl font-bold tracking-[-.05em] text-[#173a32]">{order.plate}</h1>
        <p className="mt-1 text-sm text-[#789087]">{order.serviceName} · {vehicleSizeLabel(order.vehicleSize)} · ingresado {shortDate(order.createdAt)}</p>
      </div>
      <div className="flex gap-2">
        <Button type="button" data-testid="button-print-ticket" variant="outline" onClick={() => window.print()} className="rounded-xl border-[#ccd9d1] bg-[#faf8f0] text-[#285c4d]"><Printer size={16} /> Imprimir ticket</Button>
        {next && <Button type="button" data-testid="button-next-status" disabled={updateStatus.isPending} onClick={() => move(next)} className="rounded-xl bg-[#1e6b58] font-bold text-[#fbf5e8] hover:bg-[#285c4d]">Marcar {statusMeta[next].label.toLowerCase()} <ArrowRight size={16} /></Button>}
      </div>
    </div>
    {notice && <div data-testid="status-order-notice" className="mt-5 flex items-center justify-between rounded-xl border border-[#bcd9c8] bg-[#e4f1e8] px-4 py-3 text-xs font-semibold text-[#2d765e]"><span className="flex items-center gap-2"><Check size={15} /> {notice}</span><button type="button" data-testid="button-dismiss-notice" onClick={() => setNotice('')}><X size={15} /></button></div>}
    <div className="mt-7 grid gap-5 xl:grid-cols-[1.4fr_.8fr]">
      <div className="space-y-5">
        <Card className="border-[#dfe2d8] bg-[#faf8f0]">
          <CardHeader><CardTitle className="display-font text-lg text-[#173a32]">Progreso del servicio</CardTitle><p className="text-xs text-[#789087]">Entrada → En puente → Servicio finalizado → Pago → Entrega</p></CardHeader>
          <CardContent><div className="relative flex justify-between before:absolute before:left-5 before:right-5 before:top-5 before:h-0.5 before:bg-[#d9e3da] sm:before:left-7 sm:before:right-7">{statusOrder.map((step, index) => { const done = index <= currentIndex; const active = step === order.status; return <div key={step} className="relative z-10 flex w-1/6 flex-col items-center gap-2 text-center"><span className={`grid h-10 w-10 place-items-center rounded-full border-4 border-[#faf8f0] text-xs font-bold ${done ? 'bg-[#2f9274] text-white' : 'bg-[#e1e8df] text-[#8aa097]'} ${active ? 'ring-4 ring-[#f4d777]/60' : ''}`}>{done ? <Check size={15} /> : index + 1}</span><span className={`text-[10px] font-bold leading-3 ${active ? 'text-[#285c4d]' : 'text-[#8aa097]'}`}>{statusMeta[step].label}</span></div>; })}</div></CardContent>
        </Card>
        <Card className="border-[#dfe2d8] bg-[#faf8f0]">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div><CardTitle className="display-font text-lg text-[#173a32]">Cliente</CardTitle><p className="mt-1 text-xs text-[#789087]">Información asociada a la orden</p></div>
            <button type="button" data-testid="button-edit-customer" onClick={() => { setEditMode(true); setCustomer(order.customer); setPhone(order.phone); setCustomerEmail(order.customerEmail ?? ''); }} className="text-xs font-bold text-[#2f9274]">{editMode ? 'Editando' : 'Editar'}</button>
          </CardHeader>
          <CardContent>
            {editMode ? <div className="grid gap-4 sm:grid-cols-2">
              <div><Label htmlFor="detail-customer">Nombre</Label><Input id="detail-customer" data-testid="input-detail-customer" value={customer} onChange={event => setCustomer(event.target.value)} className="mt-2 bg-[#fbf8ef]" /></div>
              <div><Label htmlFor="detail-phone">Teléfono</Label><Input id="detail-phone" data-testid="input-detail-phone" value={phone} onChange={event => setPhone(event.target.value)} className="mt-2 bg-[#fbf8ef]" /></div>
              <div><Label htmlFor="detail-email">Gmail o correo</Label><Input id="detail-email" data-testid="input-detail-email" type="email" value={customerEmail} onChange={event => setCustomerEmail(event.target.value)} placeholder="cliente@gmail.com" className="mt-2 bg-[#fbf8ef]" /></div>
              <div className="flex items-end gap-2"><Button type="button" data-testid="button-save-customer" disabled={updateOrder.isPending} onClick={saveEdit} className="w-fit rounded-lg bg-[#1e6b58] text-xs font-bold text-white">{updateOrder.isPending ? 'Guardando…' : 'Guardar cambios'}</Button><Button type="button" variant="outline" onClick={() => setEditMode(false)} className="rounded-lg border-[#ccd9d1] text-xs">Cancelar</Button></div>
            </div> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div><p className="text-[10px] font-bold uppercase tracking-wider text-[#8aa097]">Nombre</p><p data-testid="text-order-customer" className="mt-1 text-sm font-bold text-[#355d50]">{order.customer}</p></div>
              <div><p className="text-[10px] font-bold uppercase tracking-wider text-[#8aa097]">Teléfono</p><p data-testid="text-order-phone" className="mt-1 text-sm font-bold text-[#355d50]">{order.phone}</p></div>
              <div><p className="text-[10px] font-bold uppercase tracking-wider text-[#8aa097]">Correo</p><p data-testid="text-order-email" className="mt-1 break-all text-sm font-bold text-[#355d50]">{order.customerEmail ?? 'Sin correo'}</p></div>
              <div><p className="text-[10px] font-bold uppercase tracking-wider text-[#8aa097]">Ingresó</p><p className="mt-1 text-sm font-bold text-[#355d50]">{order.enteredBy}</p></div>
            </div>}
          </CardContent>
        </Card>
        <Card className="border-[#dfe2d8] bg-[#faf8f0]">
          <CardHeader><CardTitle className="display-font text-lg text-[#173a32]">Trazabilidad</CardTitle></CardHeader>
          <CardContent className="space-y-4"><TimelineItem title="Orden creada" detail={`Ingreso registrado por ${order.enteredBy}`} time={shortDate(order.createdAt)} /><TimelineItem title={statusMeta[order.status]?.label ?? order.status} detail={`Última acción por ${order.lastActionBy}`} time={shortDate(order.updatedAt)} current /></CardContent>
        </Card>
      </div>
      <div className="space-y-5">
        <Card className="border-[#dfe2d8] bg-[#faf8f0]">
          <CardHeader><CardTitle className="display-font text-lg text-[#173a32]">Resumen de pago</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-end justify-between border-b border-[#e7e8df] pb-4"><span className="max-w-[65%] text-xs text-[#789087]">{order.serviceName}</span><strong data-testid="text-order-price" className="display-font text-2xl text-[#285c4d]">{money(order.price)}</strong></div>
            {order.paymentMethod ? <div className="mt-4 flex items-center gap-2 rounded-xl bg-[#e4efe9] p-3 text-xs font-bold text-[#2d765e]"><Check size={15} /> Pagado con {methodLabel(order.paymentMethod)}</div> : <div className="mt-4 space-y-3"><Label htmlFor="payment-method">Registrar pago en caja</Label><select id="payment-method" data-testid="select-payment-method" value={paymentMethod} onChange={event => setPaymentMethod(event.target.value as typeof paymentMethod)} className="h-10 w-full rounded-md border border-[#d7ded5] bg-[#fbf8ef] px-3 text-sm text-[#355d50]"><option value="EFECTIVO">Efectivo</option><option value="DEBITO">Débito</option><option value="CREDITO">Crédito</option></select><Button type="button" data-testid="button-record-payment" disabled={recordPayment.isPending} onClick={pay} className="h-10 w-full rounded-xl bg-[#f0bd3e] font-bold text-[#173a32] hover:bg-[#e4ad2d]">{recordPayment.isPending ? 'Registrando…' : 'Registrar pago'} <CircleDollarSign size={15} /></Button></div>}
          </CardContent>
        </Card>
        <Card className="border-[#dfe2d8] bg-[#faf8f0]">
          <CardHeader><CardTitle className="display-font text-lg text-[#173a32]">Comprobante y código de barras</CardTitle><p className="text-xs text-[#789087]">El cliente puede mostrar este código en su teléfono.</p></CardHeader>
          <CardContent>
            <div className="rounded-xl border border-dashed border-[#cbd9cf] bg-[#f4f5ec] p-4 text-center">
              <img data-testid="img-order-barcode" src={`/api/orders/${order.id}/barcode.png`} alt={`Código de barras ${order.barcode}`} className="mx-auto block h-auto w-full max-w-[360px]" />
              <p data-testid="text-order-barcode" className="mono mt-2 text-xs tracking-[.2em] text-[#355d50]">{order.barcode}</p>
            </div>
            <div data-testid="status-receipt-email" className={`mt-3 rounded-xl p-3 text-xs ${order.receiptEmailStatus === 'ENVIADO' ? 'bg-[#e4efe9] text-[#2d765e]' : order.receiptEmailStatus === 'FALLIDO' ? 'bg-[#fff1eb] text-[#a64a30]' : 'bg-[#f4f5ec] text-[#668279]'}`}>
              {order.receiptEmailStatus === 'ENVIADO' ? `Comprobante enviado a ${order.customerEmail}${order.receiptSentAt ? ` · ${shortDate(order.receiptSentAt)}` : ''}` : order.receiptEmailStatus === 'FALLIDO' ? `No se pudo enviar a ${order.customerEmail}.` : order.receiptEmailStatus === 'ENVIANDO' ? `Enviando a ${order.customerEmail}…` : order.customerEmail ? `Se enviará a ${order.customerEmail} al registrar la orden.` : 'Agrega el correo del cliente para enviarle el comprobante.'}
            </div>
            {order.customerEmail && (order.receiptEmailStatus === 'FALLIDO' || order.receiptEmailStatus === 'NO_ENVIADO') && <Button type="button" data-testid="button-retry-receipt" disabled={sendReceipt.isPending} onClick={retryReceipt} className="mt-3 h-10 w-full rounded-xl bg-[#1e6b58] text-xs font-bold text-white">{sendReceipt.isPending ? 'Enviando…' : order.receiptEmailStatus === 'FALLIDO' ? 'Reintentar envío' : 'Enviar comprobante'} <Mail size={15} /></Button>}
            <Button type="button" data-testid="button-print-barcode" variant="outline" onClick={() => window.print()} className="mt-3 h-10 w-full rounded-xl border-[#ccd9d1] text-xs font-bold text-[#285c4d]"><Printer size={15} /> Imprimir comprobante</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>;
}

function TimelineItem({ title, detail, time, current = false }: { title: string; detail: string; time: string; current?: boolean }) { return <div className="flex gap-3"><span className={`mt-1 h-2.5 w-2.5 rounded-full ${current ? 'bg-[#f0bd3e] ring-4 ring-[#fff0c9]' : 'bg-[#4d9d7b]'}`} /><div className="flex-1"><div className="flex justify-between gap-3"><p className="text-xs font-bold text-[#355d50]">{title}</p><span className="text-[10px] text-[#8aa097]">{time}</span></div><p className="mt-1 text-xs text-[#789087]">{detail}</p></div></div>; }

function ServicesPage() {
  const query = useGetServices({ query: { queryKey: getGetServicesQueryKey(), retry: false } });
  const create = useCreateService();
  const updateService = useUpdateService();
  const removeService = useDeleteService();
  const services = query.data ?? (query.isError ? demoServices : []);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const emptyForm = () => ({
    name: '',
    description: '',
    category: ServiceCategory.LAVADO as typeof ServiceCategory[keyof typeof ServiceCategory],
    priceSmall: '',
    priceMedium: '',
    priceLarge: '',
  });
  const [form, setForm] = useState(emptyForm);
  const [notice, setNotice] = useState('');
  const closeForm = () => {
    setOpen(false);
    setEditingId(null);
    setForm(emptyForm());
  };
  const beginEdit = (service: Service) => {
    setEditingId(service.id);
    setForm({
      name: service.name,
      description: service.description,
      category: service.category,
      priceSmall: String(service.priceSmall),
      priceMedium: String(service.priceMedium),
      priceLarge: String(service.priceLarge),
    });
    setOpen(true);
  };
  const saveSuccess = (message: string) => {
    queryClient.invalidateQueries({ queryKey: getGetServicesQueryKey() });
    closeForm();
    setNotice(message);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setNotice('');
    const data = {
      name: form.name.trim(),
      description: form.description.trim(),
      category: form.category,
      priceSmall: Number(form.priceSmall),
      priceMedium: Number(form.priceMedium),
      priceLarge: Number(form.priceLarge),
    };
    if (editingId !== null) {
      updateService.mutate({ id: editingId, data }, {
        onSuccess: () => saveSuccess('Servicio y precios actualizados. Las órdenes anteriores mantienen sus valores.'),
        onError: () => setNotice('No pudimos actualizar el servicio.'),
      });
      return;
    }
    create.mutate({ data }, {
      onSuccess: () => saveSuccess('Servicio agregado al catálogo.'),
      onError: () => setNotice('No pudimos guardar el servicio.'),
    });
  };
  const remove = (service: Service) => {
    if (!window.confirm(`¿Quitar “${service.name}” del catálogo activo? No aparecerá en nuevas órdenes; las órdenes anteriores se conservan.`)) return;
    removeService.mutate({ id: service.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetServicesQueryKey() });
        setNotice('Servicio quitado del catálogo activo. El historial de órdenes se conservó.');
      },
      onError: () => setNotice('No se pudo quitar el servicio del catálogo.'),
    });
  };
  const restore = (service: Service) => {
    updateService.mutate({ id: service.id, data: { active: true } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetServicesQueryKey() });
        setNotice('Servicio reactivado en el catálogo. Revisa sus precios antes de usarlo.');
      },
      onError: () => setNotice('No se pudo reactivar el servicio.'),
    });
  };
  const saving = create.isPending || updateService.isPending;
  const categories = [ServiceCategory.LAVADO, ServiceCategory.ADICIONAL, ServiceCategory.ESPECIALIZADO, ServiceCategory.GENERAL];
  return <div className="page-in">
    <PageTitle eyebrow="Catálogo de atención" title="Servicios" description="Edita nombres y precios por tamaño, o quita servicios del menú de nuevas órdenes." action={<Button type="button" data-testid="button-open-service-form" onClick={() => { setEditingId(null); setForm(emptyForm()); setOpen(true); }} className="rounded-xl bg-[#1e6b58] font-bold text-[#fbf5e8] hover:bg-[#285c4d]"><Plus size={17} /> Nuevo servicio</Button>} />
    {query.isError && <PreviewNotice />}
    {notice && <div data-testid="status-service-notice" className="mb-5 rounded-xl border border-[#bcd9c8] bg-[#e4f1e8] px-4 py-3 text-xs font-semibold text-[#2d765e]">{notice}</div>}
    {open && <Card className="mb-5 border-[#bdd7c6] bg-[#eef6ef]">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div><CardTitle className="display-font text-lg text-[#173a32]">{editingId !== null ? 'Editar servicio' : 'Nuevo servicio'}</CardTitle><p className="text-xs text-[#668279]">Los cambios de catálogo no modifican órdenes ya registradas.</p></div>
        <button type="button" data-testid="button-close-service-form" onClick={closeForm} aria-label="Cerrar formulario"><X size={18} className="text-[#668279]" /></button>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
          <div><Label htmlFor="service-name">Nombre</Label><Input id="service-name" data-testid="input-service-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required className="mt-2 bg-[#fbf8ef]" placeholder="Lavado de motor" /></div>
          <div><Label htmlFor="service-category">Categoría</Label><select id="service-category" data-testid="select-service-category" value={form.category} onChange={e => setForm({ ...form, category: e.target.value as typeof form.category })} className="mt-2 h-10 w-full rounded-md border border-[#d7ded5] bg-[#fbf8ef] px-3 text-sm text-[#355d50]">{categories.map(category => <option key={category} value={category}>{serviceCategoryLabel(category)}</option>)}</select></div>
          <div className="md:col-span-2"><Label htmlFor="service-description">Descripción</Label><Input id="service-description" data-testid="input-service-description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="mt-2 bg-[#fbf8ef]" placeholder="Qué incluye…" /></div>
          <fieldset className="grid gap-3 sm:grid-cols-3 md:col-span-2">
            <legend className="mb-2 text-xs font-bold text-[#355d50]">Precios por tamaño de vehículo</legend>
            {[
              { key: 'priceSmall' as const, label: 'Pequeño' },
              { key: 'priceMedium' as const, label: 'Mediano' },
              { key: 'priceLarge' as const, label: 'Grande' },
            ].map(size => <div key={size.key}><Label htmlFor={`service-${size.key}`}>{size.label}</Label><Input id={`service-${size.key}`} data-testid={`input-service-${size.key}`} type="number" min="0" step="1" value={form[size.key]} onChange={e => setForm({ ...form, [size.key]: e.target.value })} required className="mt-2 bg-[#fbf8ef]" placeholder="0" /></div>)}
          </fieldset>
          <div className="flex gap-3 md:col-span-2"><Button type="submit" data-testid="button-save-service" disabled={saving} className="h-10 rounded-xl bg-[#1e6b58] font-bold text-white">{saving ? 'Guardando…' : editingId !== null ? 'Guardar cambios' : 'Agregar servicio'}</Button><Button type="button" variant="outline" onClick={closeForm} className="h-10 rounded-xl border-[#ccd9d1] font-bold text-[#285c4d]">Cancelar</Button></div>
        </form>
      </CardContent>
    </Card>}
    {categories.map(category => {
      const group = services.filter(service => service.category === category);
      if (!group.length) return null;
      return <section key={category} className="mb-8">
        <div className="mb-3 flex items-center justify-between"><div><h2 className="display-font text-xl font-bold text-[#173a32]">{serviceCategoryLabel(category)}</h2><p className="text-xs text-[#789087]">{group.filter(service => service.active).length} activos · precios en CLP</p></div></div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {group.map(service => <Card key={service.id} data-testid={`card-service-${service.id}`} className={`border-[#dfe2d8] bg-[#faf8f0] ${!service.active ? 'opacity-75' : ''}`}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e4efe9] text-[#2f9274]"><Droplets size={18} /></span><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${service.active ? 'bg-[#e4efe9] text-[#2d765e]' : 'bg-[#eee9de] text-[#897e70]'}`}>{service.active ? 'Activo' : 'Pausado'}</span></div>
              <h3 data-testid={`text-service-name-${service.id}`} className="display-font mt-5 text-lg font-bold text-[#173a32]">{service.name}</h3>
              <p className="mt-2 min-h-10 text-xs leading-5 text-[#789087]">{service.description || 'Sin descripción.'}</p>
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-[#e7e8df] pt-4">
                {[['Pequeño', service.priceSmall], ['Mediano', service.priceMedium], ['Grande', service.priceLarge]].map(([label, price]) => <div key={label} className="rounded-lg bg-[#f1f2eb] p-2"><p className="text-[9px] uppercase tracking-wide text-[#8aa097]">{label}</p><strong className="mt-1 block text-xs text-[#285c4d]">{money(Number(price))}</strong></div>)}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" data-testid={`button-edit-service-${service.id}`} onClick={() => beginEdit(service)} variant="outline" className="h-9 rounded-lg border-[#ccd9d1] px-3 text-xs font-bold text-[#285c4d]"><Pencil size={13} /> Editar</Button>
                {service.active ? <Button type="button" data-testid={`button-remove-service-${service.id}`} disabled={removeService.isPending} onClick={() => remove(service)} variant="outline" className="h-9 rounded-lg border-[#e6c9be] px-3 text-xs font-bold text-[#a64a30]"><Trash2 size={13} /> Quitar</Button> : <Button type="button" data-testid={`button-restore-service-${service.id}`} disabled={updateService.isPending} onClick={() => restore(service)} variant="outline" className="h-9 rounded-lg border-[#bcd9c8] px-3 text-xs font-bold text-[#2d765e]"><RefreshCw size={13} /> Reactivar</Button>}
              </div>
            </CardContent>
          </Card>)}
        </div>
      </section>;
    })}
  </div>;
}

function AuditPage() {
  const query = useGetAuditEvents({ query: { queryKey: getGetAuditEventsQueryKey(), retry: false } });
  const events = query.data ?? (query.isError ? demoAudit : []);
  const [severity, setSeverity] = useState('ALL');
  const filtered = events.filter(event => severity === 'ALL' || event.severity === severity);
  return <div className="page-in"><PageTitle eyebrow="Control y confianza" title="Auditoría" description="Una lectura completa de los movimientos que importan." action={<Button type="button" data-testid="button-refresh-audit" onClick={() => query.refetch()} variant="outline" className="rounded-xl border-[#ccd9d1] bg-[#faf8f0] font-bold text-[#285c4d]"><RefreshCw size={15} /> Actualizar</Button>} />{query.isError && <PreviewNotice />}<Card className="border-[#dfe2d8] bg-[#faf8f0]"><CardContent className="p-4"><div className="flex items-center gap-2 overflow-x-auto"><Filter size={15} className="text-[#789087]" />{['ALL', 'INFO', 'WARNING', 'CRITICAL'].map(item => <button type="button" key={item} data-testid={`button-audit-filter-${item.toLowerCase()}`} onClick={() => setSeverity(item)} className={`rounded-lg px-3 py-2 text-xs font-bold ${severity === item ? 'bg-[#173a32] text-white' : 'text-[#668279] hover:bg-[#eef5ef]'}`}>{item === 'ALL' ? 'Todos' : item === 'WARNING' ? 'Alertas' : item === 'CRITICAL' ? 'Críticos' : 'Informativos'}</button>)}</div></CardContent></Card><div className="mt-4 overflow-hidden rounded-2xl border border-[#dfe2d8] bg-[#faf8f0]">{filtered.map(event => <div key={event.id} data-testid={`row-audit-event-${event.id}`} className="grid gap-3 border-b border-[#e7e8df] px-5 py-5 last:border-0 md:grid-cols-[160px_1fr_160px_110px] md:items-center"><div className="flex items-center gap-2 text-[11px] text-[#8aa097]"><Clock3 size={14} />{shortDate(event.timestamp)}</div><div><p className="text-sm font-bold text-[#355d50]">{event.description}</p><p className="mono mt-1 text-[10px] text-[#8aa097]">{event.action}</p></div><div className="flex items-center gap-2 text-xs text-[#668279]"><span className="grid h-7 w-7 place-items-center rounded-full bg-[#e5efe8] text-[10px] font-bold text-[#285c4d]">{event.actor.split(' ').map(part => part[0]).join('').slice(0, 2)}</span>{event.actor}</div><span className={`w-fit rounded-full px-2.5 py-1 text-[10px] font-bold ${event.severity === 'WARNING' ? 'bg-[#fff0c9] text-[#906d19]' : event.severity === 'CRITICAL' ? 'bg-[#f9e3d9] text-[#a64a30]' : 'bg-[#e4efe9] text-[#2d765e]'}`}>{event.severity === 'WARNING' ? 'Alerta' : event.severity === 'CRITICAL' ? 'Crítico' : 'Info'}</span></div>)}</div></div>;
}

function SettingsPage() {
  const usersQuery = useGetUsers({ query: { queryKey: getGetUsersQueryKey(), retry: false } });
  const users = usersQuery.data ?? (usersQuery.isError ? demoUsers : []);
  const invite = useInviteUser();
  const remove = useDeleteUser();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ email: '', firstName: '', lastName: '', role: UserRole.SUPERVISOR });

  const submitInvite = (event: FormEvent) => {
    event.preventDefault();
    setNotice('');
    invite.mutate({ data: form }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetUsersQueryKey() });
        setForm({ email: '', firstName: '', lastName: '', role: UserRole.SUPERVISOR });
        setInviteOpen(false);
        setNotice('Invitación enviada. El colaborador podrá activar su acceso desde su correo.');
      },
      onError: () => setNotice('No se pudo crear la invitación. Revisa el correo o tus permisos de administrador.'),
    });
  };

  const deleteAccount = (account: UserAccount) => {
    if (account.status === 'INVITADO') {
      setNotice('Las invitaciones pendientes se gestionan desde Clerk antes de que el colaborador active su acceso.');
      return;
    }
    if (!window.confirm(`¿Eliminar el acceso de ${account.firstName} ${account.lastName}? Esta acción no elimina sus órdenes ni la auditoría.`)) return;
    remove.mutate({ id: account.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetUsersQueryKey() });
        setNotice('Usuario eliminado. Sus órdenes y acciones históricas se conservaron.');
      },
      onError: () => setNotice('No se pudo eliminar el usuario. Verifica que estés usando una cuenta administradora.'),
    });
  };

  return <div className="page-in">
    <PageTitle eyebrow="Control del sistema" title="Configuración" description="Solo el administrador crea y elimina accesos. Las órdenes y auditorías no se borran al retirar a una persona." action={<Button type="button" data-testid="button-invite-user" onClick={() => setInviteOpen(true)} className="rounded-xl bg-[#1e6b58] font-bold text-[#fbf5e8] hover:bg-[#285c4d]"><UserPlus size={17} /> Crear usuario</Button>} />
    {usersQuery.isError && <PreviewNotice />}
    {notice && <div data-testid="status-user-notice" className="mb-5 rounded-xl border border-[#bcd9c8] bg-[#e4f1e8] px-4 py-3 text-xs font-semibold text-[#2d765e]">{notice}</div>}
    {inviteOpen && <Card className="mb-5 border-[#bdd7c6] bg-[#eef6ef]"><CardHeader className="flex-row items-center justify-between space-y-0"><div><CardTitle className="display-font text-lg text-[#173a32]">Crear acceso de colaborador</CardTitle><p className="text-xs text-[#668279]">Se enviará una invitación. No necesitas conocer ni guardar su contraseña.</p></div><button type="button" data-testid="button-close-invite-form" onClick={() => setInviteOpen(false)}><X size={18} className="text-[#668279]" /></button></CardHeader><CardContent><form onSubmit={submitInvite} className="grid gap-4 md:grid-cols-2"><div><Label htmlFor="user-first-name">Nombre</Label><Input id="user-first-name" data-testid="input-user-first-name" value={form.firstName} onChange={event => setForm({ ...form, firstName: event.target.value })} required className="mt-2 bg-[#fbf8ef]" placeholder="Nombre" /></div><div><Label htmlFor="user-last-name">Apellido</Label><Input id="user-last-name" data-testid="input-user-last-name" value={form.lastName} onChange={event => setForm({ ...form, lastName: event.target.value })} required className="mt-2 bg-[#fbf8ef]" placeholder="Apellido" /></div><div><Label htmlFor="user-email">Correo de trabajo</Label><Input id="user-email" data-testid="input-user-email" type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} required className="mt-2 bg-[#fbf8ef]" placeholder="colaborador@ecocleancar.cl" /></div><div><Label htmlFor="user-role">Rol</Label><select id="user-role" data-testid="select-user-role" value={form.role} onChange={event => setForm({ ...form, role: event.target.value as typeof form.role })} className="mt-2 h-10 w-full rounded-md border border-[#d7ded5] bg-[#fbf8ef] px-3 text-sm text-[#355d50]"><option value={UserRole.SUPERVISOR}>Supervisor</option><option value={UserRole.CAJERO}>Cajero</option><option value={UserRole.OPERADOR}>Operador</option></select></div><div className="flex gap-3 md:col-span-2"><Button type="submit" data-testid="button-submit-user-invite" disabled={invite.isPending} className="rounded-xl bg-[#1e6b58] font-bold text-white">{invite.isPending ? 'Enviando…' : 'Enviar invitación'} <Mail size={15} /></Button><Button type="button" onClick={() => setInviteOpen(false)} variant="outline" className="rounded-xl border-[#ccd9d1] font-bold text-[#285c4d]">Cancelar</Button></div></form></CardContent></Card>}
    <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
      <Card className="border-[#dfe2d8] bg-[#faf8f0]"><CardHeader><CardTitle className="display-font text-lg text-[#173a32]">Equipo y permisos</CardTitle><p className="text-xs text-[#789087]">El colaborador activa su cuenta, pero solo tú administra sus accesos.</p></CardHeader><CardContent className="space-y-3">{users.map(account => <TeamRow key={account.id} account={account} onDelete={deleteAccount} disabled={remove.isPending} />)}{!users.length && !usersQuery.isLoading && <p className="rounded-xl border border-dashed border-[#cbd9cf] p-6 text-center text-xs text-[#789087]">No hay usuarios visibles todavía.</p>}</CardContent></Card>
      <div className="space-y-5"><Card className="border-[#dfe2d8] bg-[#faf8f0]"><CardHeader><CardTitle className="display-font text-lg text-[#173a32]">Sucursal activa</CardTitle></CardHeader><CardContent><div className="rounded-2xl bg-[#e4efe9] p-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#1e6b58] text-white"><PanelLeft size={18} /></span><div><p className="text-sm font-bold text-[#285c4d]">EcoClean Car · Vitacura</p><p className="mt-1 text-xs text-[#668279]">Av. Nueva Costanera 3900 · Santiago</p></div></div></div><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl border border-[#e1e5dc] p-3"><p className="text-[10px] uppercase tracking-wider text-[#8aa097]">Zona horaria</p><p className="mt-1 text-xs font-bold text-[#355d50]">America/Santiago</p></div><div className="rounded-xl border border-[#e1e5dc] p-3"><p className="text-[10px] uppercase tracking-wider text-[#8aa097]">Moneda</p><p className="mt-1 text-xs font-bold text-[#355d50]">Peso chileno · CLP</p></div></div></CardContent></Card><Card className="border-[#dfe2d8] bg-[#faf8f0]"><CardHeader><CardTitle className="display-font text-lg text-[#173a32]">Preparación SII</CardTitle><p className="text-xs text-[#789087]">Estado de la conexión tributaria.</p></CardHeader><CardContent><div className="flex items-center gap-3 rounded-xl border border-[#e5d9b5] bg-[#fff7df] p-4"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#f4c957] text-[#173a32]"><ReceiptText size={17} /></span><div><p className="text-xs font-bold text-[#765b17]">Pendiente de configuración</p><p className="mt-1 text-[11px] leading-4 text-[#967c38]">Conecta tu folio y certificado para emitir documentos desde la operación.</p></div></div><Button type="button" data-testid="button-configure-sii" onClick={() => alert('La configuración SII se habilitará al conectar el proveedor tributario.')} className="mt-4 w-full rounded-xl bg-[#173a32] text-xs font-bold text-white hover:bg-[#285c4d]">Revisar preparación</Button></CardContent></Card></div>
    </div>
  </div>;
}

function TeamRow({ account, onDelete, disabled }: { account: UserAccount; onDelete: (account: UserAccount) => void; disabled: boolean }) {
  const initials = `${account.firstName[0] ?? ''}${account.lastName[0] ?? ''}`.toUpperCase() || 'US';
  const tone = account.role === UserRole.ADMIN ? 'bg-[#f4c957]' : account.role === UserRole.SUPERVISOR ? 'bg-[#c5dfcf]' : 'bg-[#d9e8ef]';
  return <div data-testid={`row-team-${account.id}`} className="flex items-center gap-3 rounded-xl border border-[#e4e7df] bg-[#fbf8ef] p-3"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold text-[#285c4d] ${tone}`}>{initials}</span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-xs font-bold text-[#355d50]">{account.firstName} {account.lastName}</p><span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${account.status === 'INVITADO' ? 'bg-[#fff0c9] text-[#906d19]' : account.status === 'BLOQUEADO' ? 'bg-[#f9e3d9] text-[#a64a30]' : 'bg-[#e4efe9] text-[#2d765e]'}`}>{account.status === 'INVITADO' ? 'Invitado' : account.status === 'BLOQUEADO' ? 'Bloqueado' : 'Activo'}</span></div><p className="mt-1 flex items-center gap-1 truncate text-[10px] text-[#8aa097]"><Mail size={11} /> {account.email}</p></div><span className="hidden rounded-full bg-[#e4efe9] px-2.5 py-1 text-[10px] font-bold text-[#2d765e] sm:inline-flex">{roleLabel(account.role)}</span>{account.status !== 'INVITADO' && account.role !== UserRole.ADMIN && <button type="button" data-testid={`button-delete-user-${account.id}`} disabled={disabled} onClick={() => onDelete(account)} aria-label={`Eliminar a ${account.firstName} ${account.lastName}`} className="rounded-lg p-2 text-[#a64a30] hover:bg-[#f9e3d9] disabled:opacity-50"><Trash2 size={15} /></button>}</div>;
}

function Router() {
  return <ErrorBoundary resetKey={location.pathname}><Switch><Route path="/" component={HomeRoute} /><Route path="/sign-in/*?" component={clerkPubKey ? ClerkSignInPage : () => <AuthPage mode="sign-in" />} /><Route path="/sign-up/*?" component={clerkPubKey ? ClerkSignUpPage : () => <AuthPage mode="sign-up" />} /><Route path="/dashboard"><PortalGuard><AppShell><DashboardPage /></AppShell></PortalGuard></Route><Route path="/orders/new"><PortalGuard><AppShell><NewOrderPage /></AppShell></PortalGuard></Route><Route path="/orders/:id"><PortalGuard><AppShell><OrderDetailPage /></AppShell></PortalGuard></Route><Route path="/orders"><PortalGuard><AppShell><OrdersPage /></AppShell></PortalGuard></Route><Route path="/services"><PortalGuard><AppShell><ServicesPage /></AppShell></PortalGuard></Route><Route path="/audit"><PortalGuard><AppShell><AuditPage /></AppShell></PortalGuard></Route><Route path="/settings"><PortalGuard><AppShell><SettingsPage /></AppShell></PortalGuard></Route><Route><Redirect to="/" /></Route></Switch></ErrorBoundary>;
}

export default function App() {
  const routes = clerkPubKey ? <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} localization={{ signIn: { start: { title: 'Bienvenido de vuelta', subtitle: 'Accede al pulso de tu sucursal' } }, signUp: { start: { title: 'Crea tu acceso', subtitle: 'Empieza a operar con claridad' } } }}><Router /></ClerkProvider> : <Router />;
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={basePath}>{routes}</WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}