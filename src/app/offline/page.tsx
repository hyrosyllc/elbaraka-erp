export const dynamic = 'force-static';

export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="grid max-w-sm gap-3">
        <h1 className="m-0 text-xl font-bold">You are offline · لا يوجد اتصال</h1>
        <p className="m-0 text-sm text-muted-foreground">Elbaraka needs a connection to load live stock, orders and invoices. Reconnect and try again.</p>
        <p className="m-0 text-sm text-muted-foreground" dir="rtl">يحتاج التطبيق إلى اتصال لعرض المخزون والطلبات والفواتير. أعد الاتصال وحاول مجددًا.</p>
        {/* A full reload is intended here: client navigation cannot recover from offline. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className="mx-auto mt-2 inline-flex min-h-11 items-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground no-underline">Retry · إعادة المحاولة</a>
      </div>
    </main>
  );
}
