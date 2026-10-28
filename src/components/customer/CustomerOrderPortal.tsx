'use client';

import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ClipboardList,
  Grid2X2,
  List,
  LoaderCircle,
  LogOut,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Store,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';

type CustomerAccount = {
  workspaceId: string;
  clientId: string;
  clientName: string;
  clientNameAr: string;
  city: string;
  fullName: string;
};

type CustomerProduct = {
  sizeId: string;
  categoryId: string | null;
  name: string;
  nameAr: string;
  sizeG: number;
  sku: string;
  priceMad: number;
};

type ProductCategory = {
  id: string;
  name: string;
  name_ar: string;
};

type CustomerOrder = {
  id: string;
  document_number: string;
  status: string;
  created_at: string;
  erp_sales_order_lines: {
    id: string;
    sku_snapshot: string;
    name_snapshot: string;
    quantity: number;
    unit_price_mad: number;
  }[];
};

type PortalLocale = 'ar' | 'en';
type PortalView = 'catalog' | 'review' | 'orders' | 'confirmation';

const copy = {
  en: {
    brand: 'Elbaraka Epices',
    tagline: 'A better way to restock',
    title: 'Order for your store',
    intro: 'Enter the invitation your Elbaraka contact shared with you.',
    loginTitle: 'Sign in to your store account',
    loginIntro: 'Use your email and password, or request a one-time email code.',
    storeCode: 'Store invitation code',
    email: 'Your email address',
    emailRequired: 'Enter your email address first.',
    fullName: 'Your name',
    newPassword: 'Create a password (at least 8 characters)',
    loginPassword: 'Password',
    signIn: 'Sign in',
    emailCodeLogin: 'Email me a sign-in code',
    alreadyAccount: 'Already have an account? Sign in',
    newCustomer: 'New customer? Use an invitation',
    backToSignIn: 'Back to sign in',
    loginFailed: 'We could not sign you in. Check your email and password.',
    requestCode: 'Send me a sign-in code',
    otpIntro: 'Enter the email code we sent to',
    otp: 'Email code',
    verify: 'Verify and open catalog',
    verifying: 'Verifying…',
    sending: 'Sending…',
    inviteHelp: 'Ask your Elbaraka contact for a store invitation code.',
    inviteError: 'The invitation is invalid, expired, or linked to another email.',
    authError: 'We could not verify this email code. Check it and try again.',
    signOutError: 'We could not sign out. Try again.',
    staff: 'Staff sign in',
    chooseStore: 'Store account',
    newOrder: 'New order',
    orderHistory: 'Order history',
    search: 'Search products',
    allCategories: 'All products',
    grid: 'Grid view',
    list: 'List view',
    add: 'Add',
    removeOne: 'Remove one',
    addOne: 'Add one',
    added: 'in order',
    emptyCatalog: 'The store catalog is being prepared.',
    emptyCatalogHelp: 'Your Elbaraka contact will let you know when products are ready to order.',
    noMatches: 'No products match this search.',
    items: 'items',
    review: 'Review order',
    backToCatalog: 'Keep browsing',
    reviewTitle: 'Check your order',
    addAnother: 'Add another product',
    chooseProduct: 'Search and select a product',
    addProduct: 'Add product',
    quantity: 'Quantity',
    total: 'Order total',
    confirm: 'Place order request',
    confirming: 'Sending request…',
    requestNote: 'Your request will be reviewed by Elbaraka before stock is confirmed.',
    confirmation: 'Order request received',
    confirmationHelp: 'Elbaraka will review availability and confirm your order.',
    reference: 'Request reference',
    awaiting: 'Awaiting confirmation',
    continue: 'Continue ordering',
    noOrders: 'No orders yet.',
    noOrdersHelp: 'Your submitted order requests will appear here.',
    confirmed: 'Confirmed',
    part_delivered: 'Partially delivered',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
    draft: 'Awaiting confirmation',
    loading: 'Loading your store…',
    loadError: 'We could not load your store right now.',
    retry: 'Try again',
    signOut: 'Sign out',
    requestError: 'We could not send your order. Your items are still here; try again.',
    categoryOther: 'Other products',
    invalidOrder: 'Add at least one product before reviewing.',
  },
  ar: {
    brand: 'البركة للتوابل',
    tagline: 'طلب أسهل لمتجرك',
    title: 'اطلب لمتجرك',
    intro: 'أدخل رمز الدعوة الذي أرسله لك مسؤول البركة.',
    loginTitle: 'تسجيل الدخول إلى حساب متجرك',
    loginIntro: 'استخدم بريدك وكلمة المرور أو اطلب رمز دخول لمرة واحدة.',
    storeCode: 'رمز دعوة المتجر',
    email: 'بريدك الإلكتروني',
    emailRequired: 'أدخل بريدك الإلكتروني أولا.',
    fullName: 'اسمك',
    newPassword: 'إنشاء كلمة مرور (٨ أحرف على الأقل)',
    loginPassword: 'كلمة المرور',
    signIn: 'تسجيل الدخول',
    emailCodeLogin: 'أرسل رمز دخول إلى بريدي',
    alreadyAccount: 'لديك حساب؟ سجل الدخول',
    newCustomer: 'عميل جديد؟ استخدم دعوة',
    backToSignIn: 'العودة لتسجيل الدخول',
    loginFailed: 'تعذر تسجيل الدخول. تحقق من البريد الإلكتروني وكلمة المرور.',
    requestCode: 'أرسل رمز الدخول',
    otpIntro: 'أدخل الرمز الذي أرسلناه إلى',
    otp: 'رمز البريد الإلكتروني',
    verify: 'تحقق وافتح المنتجات',
    verifying: 'جار التحقق…',
    sending: 'جار الإرسال…',
    inviteHelp: 'اطلب رمز دعوة للمتجر من مسؤول البركة.',
    inviteError: 'الدعوة غير صالحة أو منتهية أو مرتبطة ببريد آخر.',
    authError: 'تعذر التحقق من الرمز. تحقق منه وحاول مجددا.',
    signOutError: 'تعذر تسجيل الخروج. حاول مجددا.',
    staff: 'دخول الموظفين',
    chooseStore: 'حساب المتجر',
    newOrder: 'طلب جديد',
    orderHistory: 'سجل الطلبات',
    search: 'ابحث عن المنتجات',
    allCategories: 'كل المنتجات',
    grid: 'عرض شبكي',
    list: 'عرض قائمة',
    add: 'إضافة',
    removeOne: 'إنقاص الكمية',
    addOne: 'زيادة الكمية',
    added: 'في الطلب',
    emptyCatalog: 'يجري إعداد قائمة منتجات المتجر.',
    emptyCatalogHelp: 'سيخبرك مسؤول البركة عند جاهزية المنتجات للطلب.',
    noMatches: 'لا توجد منتجات مطابقة للبحث.',
    items: 'منتجات',
    review: 'مراجعة الطلب',
    backToCatalog: 'متابعة التصفح',
    reviewTitle: 'راجع طلبك',
    addAnother: 'أضف منتجا آخر',
    chooseProduct: 'ابحث واختر منتجا',
    addProduct: 'إضافة المنتج',
    quantity: 'الكمية',
    total: 'إجمالي الطلب',
    confirm: 'إرسال طلب الشراء',
    confirming: 'جار إرسال الطلب…',
    requestNote: 'سيراجع فريق البركة الطلب قبل تأكيد توفر المخزون.',
    confirmation: 'تم استلام طلبك',
    confirmationHelp: 'سيراجع فريق البركة التوفر ويؤكد طلبك.',
    reference: 'رقم الطلب',
    awaiting: 'بانتظار التأكيد',
    continue: 'متابعة الطلب',
    noOrders: 'لا توجد طلبات بعد.',
    noOrdersHelp: 'ستظهر طلباتك المرسلة هنا.',
    confirmed: 'مؤكد',
    part_delivered: 'تم تسليم جزء',
    delivered: 'تم التسليم',
    cancelled: 'ملغى',
    draft: 'بانتظار التأكيد',
    loading: 'جار تحميل حساب المتجر…',
    loadError: 'تعذر تحميل المتجر حاليا.',
    retry: 'إعادة المحاولة',
    signOut: 'تسجيل الخروج',
    requestError: 'تعذر إرسال الطلب. بقيت المنتجات في طلبك؛ حاول مجددا.',
    categoryOther: 'منتجات أخرى',
    invalidOrder: 'أضف منتجا واحدا على الأقل قبل المراجعة.',
  },
} as const;

function money(value: number, locale: PortalLocale) {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-MA' : 'en-MA', {
    style: 'currency',
    currency: 'MAD',
    maximumFractionDigits: 2,
  }).format(value);
}

function formattedSize(sizeG: number, locale: PortalLocale) {
  return sizeG >= 1000
    ? `${sizeG / 1000} kg`
    : `${new Intl.NumberFormat(locale === 'ar' ? 'ar-MA' : 'en-MA').format(sizeG)} g`;
}

function QuantityControl({
  quantity,
  product,
  onChange,
  text,
}: {
  quantity: number;
  product: CustomerProduct;
  onChange: (product: CustomerProduct, quantity: number) => void;
  text: (typeof copy)[PortalLocale];
}) {
  return <div className="inline-flex items-center rounded-md border bg-background" aria-label={`${text.quantity}: ${quantity}`}>
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-8"
      onClick={() => onChange(product, Math.max(0, quantity - 1))}
      aria-label={`${text.removeOne}: ${product.nameAr}`}
    >
      <Minus aria-hidden="true" />
    </Button>
    <span className="min-w-8 text-center text-sm font-bold tabular-nums">{quantity}</span>
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-8"
      onClick={() => onChange(product, quantity + 1)}
      aria-label={`${text.addOne}: ${product.nameAr}`}
    >
      <Plus aria-hidden="true" />
    </Button>
  </div>;
}

export function CustomerOrderPortal() {
  const [locale, setLocale] = useState<PortalLocale>('ar');
  const [view, setView] = useState<PortalView>('catalog');
  const [stage, setStage] = useState<'invite' | 'verify' | 'account'>('invite');
  const [authMode, setAuthMode] = useState<'invite' | 'login' | 'login-code'>('invite');
  const [accounts, setAccounts] = useState<CustomerAccount[]>([]);
  const [account, setAccount] = useState<CustomerAccount | null>(null);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [products, setProducts] = useState<CustomerProduct[]>([]);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [listView, setListView] = useState(false);
  const [extraSearch, setExtraSearch] = useState('');
  const [extraProduct, setExtraProduct] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [completedOrder, setCompletedOrder] = useState<{ documentNumber: string; status: string } | null>(null);
  const orderKeyRef = useRef('');
  const text = copy[locale];

  useEffect(() => {
    const savedLocale = window.localStorage.getItem('elbaraka-locale-v1');
    if (savedLocale === 'en' || savedLocale === 'ar') setLocale(savedLocale);
    const url = new URL(window.location.href);
    const customerError = url.searchParams.get('customerError');
    if (customerError) setError(customerError === 'invitation' ? copy.ar.inviteError : copy.ar.authError);
    const code = url.searchParams.get('inviteCode');
    if (code && /^[A-Za-z0-9_-]{32}$/.test(code)) {
      setInviteCode(code);
      setAuthMode('invite');
      const invitedEmail = url.searchParams.get('inviteEmail') ?? '';
      const invitedName = url.searchParams.get('inviteName') ?? '';
      if (invitedEmail.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitedEmail)) setEmail(invitedEmail);
      setFullName(invitedName.slice(0, 120));
      url.searchParams.delete('inviteCode');
      url.searchParams.delete('inviteEmail');
      url.searchParams.delete('inviteName');
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);

  const loadAccountData = useCallback(async (selected: CustomerAccount) => {
    setLoading(true);
    setError('');
    try {
      const [catalogResponse, ordersResponse] = await Promise.all([
        fetch(`/api/customer/catalog?clientId=${encodeURIComponent(selected.clientId)}`, { cache: 'no-store' }),
        fetch(`/api/customer/orders?clientId=${encodeURIComponent(selected.clientId)}`, { cache: 'no-store' }),
      ]);
      const [catalogResult, ordersResult] = await Promise.all([catalogResponse.json(), ordersResponse.json()]);
      if (!catalogResponse.ok) throw new Error(catalogResult.error || text.loadError);
      if (!ordersResponse.ok) throw new Error(ordersResult.error || text.loadError);
      setCategories(catalogResult.categories ?? []);
      setProducts(catalogResult.products ?? []);
      setOrders(ordersResult.orders ?? []);
      setAccount(selected);
      setStage('account');
      setView('catalog');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : text.loadError);
    } finally {
      setLoading(false);
    }
  }, [text.loadError]);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/customer/profile', { cache: 'no-store' });
      if (response.status === 401) return;
      const result = await response.json() as { accounts?: CustomerAccount[]; error?: string };
      if (!response.ok) throw new Error(result.error || text.loadError);
      const availableAccounts = result.accounts ?? [];
      setAccounts(availableAccounts);
      if (availableAccounts.length) await loadAccountData(availableAccounts[0]);
      else setLoading(false);
    } catch (profileError) {
      setError(profileError instanceof Error ? profileError.message : text.loadError);
    } finally {
      setLoading(false);
    }
  }, [loadAccountData, text.loadError]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const cartCount = useMemo(() => Object.values(cart).reduce((sum, quantity) => sum + quantity, 0), [cart]);
  const cartProducts = useMemo(
    () => products.filter((product) => (cart[product.sizeId] ?? 0) > 0),
    [cart, products],
  );
  const total = useMemo(
    () => cartProducts.reduce((sum, product) => sum + product.priceMad * cart[product.sizeId], 0),
    [cart, cartProducts],
  );

  const updateQuantity = (product: CustomerProduct, quantity: number) => {
    orderKeyRef.current = '';
    setCart((current) => {
      const next = { ...current };
      if (quantity < 1) delete next[product.sizeId];
      else next[product.sizeId] = Math.min(quantity, 10_000);
      return next;
    });
  };

  const requestEmailCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const validation = await fetch('/api/customer/invites/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: inviteCode.trim(), email: email.trim(), fullName: fullName.trim() }),
      });
      const validationResult = await validation.json() as { error?: string };
      if (!validation.ok) throw new Error(validationResult.error || text.inviteError);

      const supabase = getSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/auth/customer-confirm?inviteCode=${encodeURIComponent(inviteCode.trim())}`,
        },
      });
      if (authError) throw new Error(text.authError);
      setStage('verify');
      setNotice(`${text.otpIntro} ${email.trim()}.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : text.authError);
    } finally {
      setBusy(false);
    }
  };

  const verifyEmailCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: otp.trim(),
        type: 'email',
      });
      if (verifyError) throw new Error(text.authError);

      const { error: passwordError } = await supabase.auth.updateUser({ password: signupPassword });
      if (passwordError) throw new Error(text.authError);

      const response = await fetch('/api/customer/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: inviteCode.trim(), fullName: fullName.trim() }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || text.inviteError);
      setInviteCode('');
      setSignupPassword('');
      setStage('account');
      await loadProfile();
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : text.authError);
    } finally {
      setBusy(false);
    }
  };

  const signInWithPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: loginPassword,
      });
      if (signInError) throw new Error(text.loginFailed);
      setLoginPassword('');
      await loadProfile();
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : text.loginFailed);
    } finally {
      setBusy(false);
    }
  };

  const requestLoginCode = async () => {
    if (!email.trim()) {
      setError(text.emailRequired);
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { shouldCreateUser: false },
      });
      if (otpError) throw new Error(text.loginFailed);
      setAuthMode('login-code');
      setNotice(`${text.otpIntro} ${email.trim()}.`);
    } catch (otpError) {
      setError(otpError instanceof Error ? otpError.message : text.loginFailed);
    } finally {
      setBusy(false);
    }
  };

  const verifyLoginCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: otp.trim(),
        type: 'email',
      });
      if (verifyError) throw new Error(text.loginFailed);
      setOtp('');
      await loadProfile();
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : text.loginFailed);
    } finally {
      setBusy(false);
    }
  };

  const placeOrder = async () => {
    if (!account || !cartProducts.length) {
      setError(text.invalidOrder);
      return;
    }
    if (!orderKeyRef.current) orderKeyRef.current = crypto.randomUUID();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/customer/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: account.clientId,
          idempotencyKey: orderKeyRef.current,
          lines: cartProducts.map((product) => ({ sizeId: product.sizeId, quantity: cart[product.sizeId] })),
        }),
      });
      const result = await response.json() as { order?: { documentNumber: string; status: string }; error?: string };
      if (!response.ok || !result.order) throw new Error(result.error || text.requestError);
      setCompletedOrder(result.order);
      setCart({});
      orderKeyRef.current = '';
      setView('confirmation');

      const ordersResponse = await fetch(`/api/customer/orders?clientId=${encodeURIComponent(account.clientId)}`, { cache: 'no-store' });
      if (ordersResponse.ok) {
        const orderResult = await ordersResponse.json() as { orders?: CustomerOrder[] };
        setOrders(orderResult.orders ?? []);
      }
    } catch (orderError) {
      setError(orderError instanceof Error ? orderError.message : text.requestError);
    } finally {
      setBusy(false);
    }
  };

  const filteredProducts = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase(locale === 'ar' ? 'ar-MA' : 'en');
    if (!normalized) return products;
    return products.filter((product) => `${product.nameAr} ${product.name} ${product.sku}`
      .toLocaleLowerCase(locale === 'ar' ? 'ar-MA' : 'en').includes(normalized));
  }, [locale, products, search]);

  const groupedProducts = useMemo(() => {
    const groups = categories.map((category) => ({
      id: category.id,
      name: locale === 'ar' ? category.name_ar || category.name : category.name || category.name_ar,
      products: filteredProducts.filter((product) => product.categoryId === category.id),
    })).filter((group) => group.products.length > 0);
    const uncategorized = filteredProducts.filter((product) => !product.categoryId);
    if (uncategorized.length) groups.push({ id: 'other', name: text.categoryOther, products: uncategorized });
    return groups;
  }, [categories, filteredProducts, locale, text.categoryOther]);

  const selectableProducts = useMemo(() => {
    const normalized = extraSearch.trim().toLocaleLowerCase(locale === 'ar' ? 'ar-MA' : 'en');
    return products.filter((product) => `${product.nameAr} ${product.name} ${product.sku}`
      .toLocaleLowerCase(locale === 'ar' ? 'ar-MA' : 'en').includes(normalized));
  }, [extraSearch, locale, products]);

  const addSearchProduct = () => {
    const product = products.find((candidate) => candidate.sizeId === extraProduct);
    if (!product) return;
    updateQuantity(product, (cart[product.sizeId] ?? 0) + 1);
    setExtraProduct('');
    setExtraSearch('');
  };

  const signOut = async () => {
    try {
      const { error: signOutError } = await getSupabaseBrowserClient().auth.signOut();
      if (signOutError) throw signOutError;
      setAccounts([]);
      setAccount(null);
      setCart({});
      setError('');
      setView('catalog');
      setStage('invite');
      setAuthMode('login');
    } catch {
      setError(text.signOutError);
    }
  };

  const accountName = account
    ? locale === 'ar' ? account.clientNameAr || account.clientName : account.clientName
    : '';

  return <main className="min-h-screen text-foreground" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
    <header className="mx-auto flex min-h-20 w-full max-w-6xl items-center justify-between gap-4 border-b border-border px-4 sm:px-7">
      <Link href="/" className="flex items-center gap-3 text-inherit no-underline" aria-label={text.brand}>
        <span className="relative flex size-[30px] shrink-0 items-center justify-center gap-0.5 overflow-hidden rounded-[9px_9px_9px_3px] bg-primary -rotate-[5deg] [&>span]:h-[13px] [&>span]:w-1 [&>span]:rotate-[24deg] [&>span]:rounded-full [&>span]:bg-accent-border [&>span:nth-child(2)]:h-[18px] [&>span:nth-child(2)]:bg-accent [&>span:nth-child(3)]:h-[11px] [&>span:nth-child(3)]:bg-saffron" aria-hidden="true"><span /><span /><span /></span>
        <span className="grid gap-0.5"><strong className="text-sm font-extrabold text-foreground">{text.brand}</strong><small className="text-label text-muted-foreground">{text.tagline}</small></span>
      </Link>
      <div className="flex items-center gap-2">
        {account && <Button variant="ghost" type="button" onClick={() => setView(view === 'orders' ? 'catalog' : 'orders')}>
          <ClipboardList />{view === 'orders' ? text.newOrder : text.orderHistory}
        </Button>}
        {account && accounts.length > 1 && <Select value={account.clientId} onValueChange={(clientId) => {
          const next = accounts.find((entry) => entry.clientId === clientId);
          if (next) {
            setCart({});
            orderKeyRef.current = '';
            void loadAccountData(next);
          }
        }}>
          <SelectTrigger className="max-w-44" aria-label={text.chooseStore}><SelectValue /></SelectTrigger>
          <SelectContent>{accounts.map((entry) => <SelectItem key={entry.clientId} value={entry.clientId}>
            {locale === 'ar' ? entry.clientNameAr || entry.clientName : entry.clientName}
          </SelectItem>)}</SelectContent>
        </Select>}
        <Button variant="outline" type="button" className="px-2.5" onClick={() => {
          const next = locale === 'ar' ? 'en' : 'ar';
          setLocale(next);
          window.localStorage.setItem('elbaraka-locale-v1', next);
        }}>{locale === 'ar' ? 'English' : 'العربية'}</Button>
        <ThemeToggle />
        {account && <Button variant="outline" size="icon" type="button" onClick={() => void signOut()} aria-label={text.signOut}><LogOut /></Button>}
      </div>
    </header>

    {stage !== 'account' && <Card className="mx-auto my-6 grid w-[calc(100%-2rem)] max-w-5xl overflow-hidden border-border bg-card md:my-10 md:min-h-[560px] md:grid-cols-2">
      <div className="relative min-h-48 overflow-hidden bg-hero md:order-2 md:min-h-full">
        <div className="absolute -left-8 top-8 size-44 rounded-full border border-white/20 bg-saffron inset-ring-12 inset-ring-white/10 sm:left-12 sm:top-16 sm:size-52" />
        <div className="absolute -bottom-12 -right-4 size-52 rounded-full border border-white/20 bg-destructive inset-ring-15 inset-ring-white/10 sm:bottom-8 sm:right-8 sm:size-64" />
        <div className="absolute right-1/3 top-1/3 size-32 rounded-full border border-white/20 bg-subtle inset-ring-10 inset-ring-white/10 sm:right-[30%] sm:size-40" />
        <span className="absolute bottom-4 end-5 text-sm tracking-widest text-hero-foreground/75">البركة</span>
      </div>
      <CardContent className="flex flex-col justify-center p-6 sm:p-10 md:order-1 md:p-12">
        <span className="grid size-12 place-items-center rounded-full bg-secondary text-primary-deep"><Store aria-hidden="true" /></span>
        <p className="mb-2 mt-6 text-sm font-bold text-primary-deep">{text.brand}</p>
        <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">{authMode === 'invite' ? text.title : text.loginTitle}</h1>
        <CardDescription className="mt-3 max-w-sm text-sm leading-7">{authMode === 'invite' ? text.intro : text.loginIntro}</CardDescription>
        {authMode === 'invite' && stage === 'invite' ? <form className="mt-6 grid max-w-sm gap-4" onSubmit={(event) => void requestEmailCode(event)}>
          <Label htmlFor="store-code" className="grid gap-2 text-xs font-bold text-primary">
            {text.storeCode}
            <Input id="store-code" autoComplete="one-time-code" value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} required maxLength={64} />
          </Label>
          <Label htmlFor="customer-name" className="grid gap-2 text-xs font-bold text-primary">
            {text.fullName}
            <Input id="customer-name" autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} required maxLength={120} />
          </Label>
          <Label htmlFor="customer-email" className="grid gap-2 text-xs font-bold text-primary">
            {text.email}
            <Input id="customer-email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} dir="ltr" />
          </Label>
          <Label htmlFor="customer-password" className="grid gap-2 text-xs font-bold text-primary">
            {text.newPassword}
            <Input id="customer-password" type="password" autoComplete="new-password" value={signupPassword} onChange={(event) => setSignupPassword(event.target.value)} required minLength={8} maxLength={72} />
          </Label>
          {error && <p className="text-xs leading-5 text-destructive" role="alert">{error}</p>}
          {notice && <p className="text-xs leading-5 text-primary" role="status">{notice}</p>}
          <Button variant="primary" size="lg" type="submit" disabled={busy}>{busy && <LoaderCircle className="animate-spin" />}{busy ? text.sending : text.requestCode}</Button>
          <small className="text-label leading-5 text-muted-foreground">{text.inviteHelp}</small>
          <Button variant="ghost" type="button" onClick={() => { setAuthMode('login'); setError(''); setNotice(''); }}>{text.alreadyAccount}</Button>
        </form> : authMode === 'invite' && stage === 'verify' ? <form className="mt-6 grid max-w-sm gap-4" onSubmit={(event) => void verifyEmailCode(event)}>
          <p className="text-sm leading-6 text-muted-foreground">{text.otpIntro} <strong dir="ltr" className="text-foreground">{email}</strong>.</p>
          <Label htmlFor="customer-otp" className="grid gap-2 text-xs font-bold text-primary">
            {text.otp}
            <Input id="customer-otp" type="text" inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(event) => setOtp(event.target.value)} required maxLength={12} dir="ltr" />
          </Label>
          {error && <p className="text-xs leading-5 text-destructive" role="alert">{error}</p>}
          <Button variant="primary" size="lg" type="submit" disabled={busy}>{busy && <LoaderCircle className="animate-spin" />}{busy ? text.verifying : text.verify}</Button>
          <Button variant="ghost" type="button" onClick={() => { setStage('invite'); setError(''); setNotice(''); }}>{text.backToCatalog}</Button>
        </form> : authMode === 'login-code' ? <form className="mt-6 grid max-w-sm gap-4" onSubmit={(event) => void verifyLoginCode(event)}>
          <p className="text-sm leading-6 text-muted-foreground">{text.otpIntro} <strong dir="ltr" className="text-foreground">{email}</strong>.</p>
          <Label htmlFor="login-otp" className="grid gap-2 text-xs font-bold text-primary">
            {text.otp}
            <Input id="login-otp" type="text" inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(event) => setOtp(event.target.value)} required maxLength={12} dir="ltr" />
          </Label>
          {error && <p className="text-xs leading-5 text-destructive" role="alert">{error}</p>}
          <Button variant="primary" size="lg" type="submit" disabled={busy}>{busy && <LoaderCircle className="animate-spin" />}{busy ? text.verifying : text.verify}</Button>
          <Button variant="ghost" type="button" onClick={() => { setAuthMode('login'); setError(''); setNotice(''); setOtp(''); }}>{text.backToSignIn}</Button>
        </form> : <form className="mt-6 grid max-w-sm gap-4" onSubmit={(event) => void signInWithPassword(event)}>
          <Label htmlFor="customer-login-email" className="grid gap-2 text-xs font-bold text-primary">
            {text.email}
            <Input id="customer-login-email" type="email" autoComplete="username" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} dir="ltr" />
          </Label>
          <Label htmlFor="customer-login-password" className="grid gap-2 text-xs font-bold text-primary">
            {text.loginPassword}
            <Input id="customer-login-password" type="password" autoComplete="current-password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} required />
          </Label>
          {error && <p className="text-xs leading-5 text-destructive" role="alert">{error}</p>}
          {notice && <p className="text-xs leading-5 text-primary" role="status">{notice}</p>}
          <Button variant="primary" size="lg" type="submit" disabled={busy}>{busy && <LoaderCircle className="animate-spin" />}{busy ? text.sending : text.signIn}</Button>
          <Button variant="outline" type="button" disabled={busy} onClick={() => void requestLoginCode()}>{text.emailCodeLogin}</Button>
          <Button variant="ghost" type="button" onClick={() => { setAuthMode('invite'); setStage('invite'); setError(''); setNotice(''); }}>{text.newCustomer}</Button>
        </form>}
        <Link className="mt-6 w-fit text-xs text-subtle underline underline-offset-4" href="/login">{text.staff}</Link>
      </CardContent>
    </Card>}

    {stage === 'account' && <div className="mx-auto min-h-[calc(100vh-10rem)] w-full max-w-6xl px-4 py-6 pb-28 sm:px-7">
      {loading && <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-muted-foreground"><LoaderCircle className="animate-spin" />{text.loading}</div>}
      {!loading && !account && <Card className="mx-auto mt-10 max-w-xl">
        <CardHeader><CardTitle>{text.title}</CardTitle><CardDescription>{text.inviteHelp}</CardDescription></CardHeader>
        <CardContent className="grid gap-4">{error && <p className="text-sm text-destructive" role="alert">{error}</p>}<Button variant="primary" onClick={() => setStage('invite')}>{text.requestCode}</Button></CardContent>
      </Card>}

      {!loading && account && <>
        <Card className="mb-6 border-0 bg-hero text-hero-foreground">
          <CardContent className="flex items-center justify-between gap-4 p-6 sm:p-8">
            <div><p className="mb-2 text-xs text-primary-foreground/70">{text.brand}</p><h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{accountName}</h1><p className="mb-0 mt-2 text-sm text-primary-foreground/80">{account.city}</p></div>
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-card/10 text-saffron"><Store aria-hidden="true" /></span>
          </CardContent>
        </Card>

        {view === 'catalog' && <>
          <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
            <Label className="flex min-h-10 w-full max-w-md items-center gap-2 rounded-md border bg-background px-3 text-muted-foreground">
              <Search size={17} aria-hidden="true" />
              <Input className="h-9 border-0 bg-transparent p-0 text-sm focus-visible:ring-0" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={text.search} />
            </Label>
            <div className="flex items-center gap-1 rounded-md border bg-muted p-1" role="group" aria-label={text.allCategories}>
              <Button variant={listView ? 'ghost' : 'outline'} size="icon" type="button" aria-label={text.grid} aria-pressed={!listView} onClick={() => setListView(false)}><Grid2X2 /></Button>
              <Button variant={listView ? 'outline' : 'ghost'} size="icon" type="button" aria-label={text.list} aria-pressed={listView} onClick={() => setListView(true)}><List /></Button>
            </div>
          </div>
          {error && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
            <span>{error}</span><Button variant="outline" size="sm" onClick={() => void loadAccountData(account)}>{text.retry}</Button>
          </div>}
          {products.length === 0 && !error ? <Card className="grid min-h-64 place-items-center border-dashed bg-card/70 text-center">
            <CardContent className="grid justify-items-center gap-3 p-8">
              <span className="grid size-12 place-items-center rounded-full bg-secondary text-primary-deep"><ShoppingBag /></span>
              <CardTitle className="text-lg text-foreground">{text.emptyCatalog}</CardTitle>
              <CardDescription className="max-w-md leading-6">{text.emptyCatalogHelp}</CardDescription>
            </CardContent>
          </Card> : groupedProducts.length === 0 ? <p className="py-8 text-sm text-muted-foreground">{text.noMatches}</p> : <div className="grid gap-8">
            {groupedProducts.map((group) => <section key={group.id}>
              <h2 className="mb-3 border-s-4 border-saffron ps-3 text-lg font-extrabold text-foreground">{group.name}</h2>
              <div className={listView ? 'grid gap-2' : 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3'}>
                {group.products.map((product) => {
                  const quantity = cart[product.sizeId] ?? 0;
                  return <Card key={product.sizeId} className="border-border bg-card">
                    <CardContent className="flex min-w-0 items-center gap-3 p-3 sm:p-4">
                      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-accent text-caption font-bold text-accent-foreground">{formattedSize(product.sizeG, locale)}</span>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-bold text-foreground">{locale === 'ar' ? product.nameAr : product.name || product.nameAr}</h3>
                        <p className="mb-0 mt-1 text-label text-muted-foreground">{product.sku} · {formattedSize(product.sizeG, locale)}</p>
                        <strong className="mt-2 block text-sm font-extrabold text-primary">{money(product.priceMad, locale)}</strong>
                      </div>
                      {quantity > 0
                        ? <div className="grid justify-items-end gap-1"><QuantityControl quantity={quantity} product={product} onChange={updateQuantity} text={text} /><small className="text-caption text-muted-foreground">{text.added}</small></div>
                        : <Button variant="outline" size="sm" type="button" onClick={() => updateQuantity(product, 1)}><Plus />{text.add}</Button>}
                    </CardContent>
                  </Card>;
                })}
              </div>
            </section>)}
          </div>}
          {cartCount > 0 && <div className="fixed inset-x-3 bottom-3 z-50 mx-auto flex min-h-16 w-[calc(100%-1.5rem)] max-w-3xl items-center gap-3 rounded-lg border border-border bg-hero p-2 ps-4 text-hero-foreground shadow-xl sm:inset-x-5 sm:bottom-5 sm:w-[calc(100%-2.5rem)] sm:gap-5">
            <span className="flex min-w-0 flex-1 items-center gap-2"><ShoppingBag size={18} /><strong className="tabular-nums">{cartCount}</strong><small className="truncate text-xs text-hero-foreground/75">{text.items}</small></span>
            <strong className="whitespace-nowrap text-xs sm:text-sm">{money(total, locale)}</strong>
            <Button className="bg-accent text-accent-foreground hover:bg-accent/80" type="button" onClick={() => { setView('review'); setError(''); }}>{text.review}</Button>
          </div>}
        </>}

        {view === 'review' && <>
          <div className="mb-4 flex flex-wrap items-center gap-4">
            <Button variant="ghost" type="button" onClick={() => setView('catalog')}><ArrowLeft />{text.backToCatalog}</Button>
            <h2 className="m-0 text-2xl font-extrabold text-foreground">{text.reviewTitle}</h2>
          </div>
          <Card className="mx-auto max-w-4xl bg-card">
            <CardContent className="grid gap-5 p-4 sm:p-6">
              {cartProducts.map((product) => <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b pb-4 sm:grid-cols-[minmax(0,1fr)_auto_auto]" key={product.sizeId}>
                <div><h3 className="m-0 text-sm font-bold">{locale === 'ar' ? product.nameAr : product.name || product.nameAr}</h3><span className="text-xs text-muted-foreground">{formattedSize(product.sizeG, locale)} · {money(product.priceMad, locale)}</span></div>
                <QuantityControl quantity={cart[product.sizeId]} product={product} onChange={updateQuantity} text={text} />
                <strong className="col-span-2 text-sm text-primary sm:col-span-1">{money(product.priceMad * cart[product.sizeId], locale)}</strong>
              </div>)}

              <div className="grid gap-3 border-b pb-5">
                <h3 className="m-0 text-sm font-bold text-primary">{text.addAnother}</h3>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_auto]">
                  <Input type="search" value={extraSearch} onChange={(event) => { setExtraSearch(event.target.value); setExtraProduct(''); }} placeholder={text.search} aria-label={text.search} />
                  <Select value={extraProduct || 'unselected'} onValueChange={(value) => setExtraProduct(value === 'unselected' ? '' : value)}>
                    <SelectTrigger aria-label={text.chooseProduct}><SelectValue placeholder={text.chooseProduct} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unselected">{text.chooseProduct}</SelectItem>
                      {selectableProducts.map((product) => <SelectItem key={product.sizeId} value={product.sizeId}>
                        {locale === 'ar' ? product.nameAr : product.name || product.nameAr} · {formattedSize(product.sizeG, locale)}
                      </SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" type="button" onClick={addSearchProduct} disabled={!extraProduct}><Plus />{text.addProduct}</Button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4"><span className="text-sm font-bold text-muted-foreground">{text.total}</span><strong className="text-lg font-extrabold text-foreground">{money(total, locale)}</strong></div>
              <p className="m-0 text-xs leading-5 text-muted-foreground">{text.requestNote}</p>
              {error && <p className="m-0 text-sm text-destructive" role="alert">{error}</p>}
              <Button variant="primary" size="lg" type="button" onClick={() => void placeOrder()} disabled={busy || !cartProducts.length}>
                {busy ? <LoaderCircle className="animate-spin" /> : <Check />}{busy ? text.confirming : text.confirm}
              </Button>
            </CardContent>
          </Card>
        </>}

        {view === 'confirmation' && completedOrder && <Card className="mx-auto mt-8 max-w-xl bg-card text-center">
          <CardContent className="grid justify-items-center gap-4 p-7 sm:p-10">
            <span className="grid size-16 place-items-center rounded-full bg-secondary text-primary-deep"><CheckCircle2 size={30} /></span>
            <CardTitle className="text-2xl text-foreground">{text.confirmation}</CardTitle>
            <CardDescription className="max-w-sm leading-6">{text.confirmationHelp}</CardDescription>
            <div className="flex w-full items-center justify-between gap-4 border-y py-4 text-sm">
              <span className="text-muted-foreground">{text.reference}</span><strong dir="ltr">{completedOrder.documentNumber}</strong>
            </div>
            <span className="rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-accent-foreground">{text.awaiting}</span>
            <Button variant="primary" className="w-full" type="button" onClick={() => { setView('catalog'); setCompletedOrder(null); }}>{text.continue}</Button>
          </CardContent>
        </Card>}

        {view === 'orders' && <section className="mx-auto grid max-w-4xl gap-3">
          <h2 className="text-2xl font-extrabold text-foreground">{text.orderHistory}</h2>
          {orders.length === 0 ? <Card className="grid min-h-56 place-items-center border-dashed bg-card/70 text-center">
            <CardContent className="grid justify-items-center gap-3 p-8">
              <span className="grid size-12 place-items-center rounded-full bg-secondary text-primary-deep"><ClipboardList /></span>
              <CardTitle className="text-lg text-foreground">{text.noOrders}</CardTitle>
              <CardDescription>{text.noOrdersHelp}</CardDescription>
            </CardContent>
          </Card> : orders.map((order) => {
            const orderTotal = order.erp_sales_order_lines.reduce(
              (sum, line) => sum + line.quantity * Number(line.unit_price_mad),
              0,
            );
            const statusText = text[order.status as keyof typeof text] ?? text.awaiting;
            return <Card className="bg-card" key={order.id}>
              <CardContent className="grid gap-3 p-4 sm:p-5">
                <div className="flex items-center justify-between gap-4 border-b pb-3">
                  <div><strong dir="ltr" className="text-sm text-foreground">{order.document_number}</strong><p className="mb-0 mt-1 text-label text-muted-foreground">{new Date(order.created_at).toLocaleDateString(locale === 'ar' ? 'ar-MA' : 'en-MA')}</p></div>
                  <span className="rounded-full bg-accent px-3 py-1.5 text-label font-bold text-accent-foreground">{statusText}</span>
                </div>
                <div className="grid gap-2">{order.erp_sales_order_lines.map((line) => <div className="flex justify-between gap-4 text-xs" key={line.id}>
                  <span>{line.name_snapshot} × {line.quantity}</span><strong>{money(line.quantity * Number(line.unit_price_mad), locale)}</strong>
                </div>)}</div>
                <div className="flex justify-between gap-4 border-t pt-3 text-sm"><span>{text.total}</span><strong className="text-foreground">{money(orderTotal, locale)}</strong></div>
              </CardContent>
            </Card>;
          })}
        </section>}
      </>}
    </div>}

    <footer className="mx-auto flex w-full max-w-6xl justify-between gap-4 border-t border-border px-4 py-4 text-label text-muted-foreground sm:px-7">
      <span>{text.brand}</span><Link href="/login" className="text-primary-deep underline underline-offset-4">{text.staff}</Link>
    </footer>
  </main>;
}
