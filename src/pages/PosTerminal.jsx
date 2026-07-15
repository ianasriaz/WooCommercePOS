import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { checkStock, createPosOrder, fetchProducts, fetchVariations } from '../api/wc-client';
import ReceiptModal from '../components/ReceiptModal';
import { usePosStore } from '../store/usePosStore';
import { useAuthStore } from '../store/useAuthStore';

/* ─── Design tokens — shared with PosDashboard ─────────────── */
const T = {
  ink: '#0f172a',
  inkSoft: '#64748b',
  inkFaint: '#94a3b8',
  line: '#e5e7eb',
  lineSoft: '#f1f5f9',
  surface: '#ffffff',
  canvas: '#fafafa',
  accent: '#16a34a',
  accentSoft: '#ecfdf5',
  warn: '#b45309',
  warnSoft: '#fffbeb',
  danger: '#b91c1c',
  dangerSoft: '#fef2f2',
  sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  mono: "'IBM Plex Mono', 'SF Mono', 'Roboto Mono', ui-monospace, monospace",
};

/* Dark cart panel — deliberate contrast zone, tuned to the same palette */
const D = {
  bg: '#0a0c10',
  panel: '#0f1216',
  line: '#1e242c',
  lineSoft: '#171b20',
  text: '#f8fafc',
  textSoft: '#8b93a1',
  textFaint: '#525a66',
};

const pkrFormatter = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 });
const formatPkr = (v) => pkrFormatter.format(Number.parseFloat(v) || 0);

const variationLabel = (attributes = []) => {
  if (!Array.isArray(attributes) || attributes.length === 0) return 'Default option';
  return attributes.map((a) => a?.option).filter(Boolean).join(' / ');
};

const isVariableProduct = (p) =>
  p?.type === 'variable' || (Array.isArray(p?.variations) && p.variations.length > 0);

const normalizeSearchText = (v) => String(v || '').toLowerCase().trim();

const extractProductSearchTokens = (product) => {
  const metaValues = Array.isArray(product?.meta_data)
    ? product.meta_data.flatMap((e) => [e?.key, e?.value])
    : [];
  return [product?.name, product?.sku, product?.global_unique_id, product?.barcode, product?.qr_code, ...metaValues]
    .filter(Boolean).map(normalizeSearchText);
};

const cartItemKey = (item) => `${item.id}-${item.variation_id ?? 'base'}`;

const BARCODE_META_KEY_HINTS = ['barcode', 'ean', 'upc', 'gtin', 'qr', 'code', 'isbn'];
const normalizeIdentifier = (v) => String(v || '').trim().toLowerCase().replace(/\s+/g, '');

const extractBarcodeCandidates = (product) => {
  const direct = [product?.sku, product?.global_unique_id, product?.barcode, product?.qr_code]
    .map(normalizeIdentifier).filter(Boolean);
  const meta = Array.isArray(product?.meta_data)
    ? product.meta_data
      .filter((e) => { const k = normalizeIdentifier(e?.key); return BARCODE_META_KEY_HINTS.some((h) => k.includes(h)); })
      .map((e) => normalizeIdentifier(e?.value)).filter(Boolean)
    : [];
  return [...direct, ...meta];
};

/* ── Inline SVG icons ─────────────────────────────── */
const Svg = ({ children, size = 16, strokeWidth = '1.6' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
    style={{ display: 'block', flexShrink: 0 }}>
    {children}
  </svg>
);
const IcoSearch = ({ s }) => <Svg size={s}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></Svg>;
const IcoX = ({ s = 14 }) => <Svg size={s}><path d="M18 6 6 18M6 6l12 12" /></Svg>;
const IcoPlus = ({ s = 14 }) => <Svg size={s} strokeWidth="2"><path d="M5 12h14M12 5v14" /></Svg>;
const IcoMinus = ({ s = 14 }) => <Svg size={s} strokeWidth="2"><path d="M5 12h14" /></Svg>;
const IcoTrash = ({ s = 14 }) => <Svg size={s}><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></Svg>;
const IcoScan = ({ s = 16 }) => <Svg size={s}><rect x="3" y="3" width="5" height="5" rx="1" /><rect x="16" y="3" width="5" height="5" rx="1" /><rect x="3" y="16" width="5" height="5" rx="1" /><path d="M21 16h-3a2 2 0 0 0-2 2v3M21 21v.01M12 7v3a2 2 0 0 1-2 2H7M3 12h.01M12 3h.01M7 17H4M17 12h.01M12 12h.01" /></Svg>;
const IcoCash = ({ s = 14 }) => <Svg size={s}><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2" /><path d="M6 12h.01M18 12h.01" /></Svg>;
const IcoBank = ({ s = 14 }) => <Svg size={s}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></Svg>;
const IcoArrowLeft = ({ s = 14 }) => <Svg size={s}><path d="M19 12H5M12 5l-7 7 7 7" /></Svg>;
const IcoCheck = ({ s = 14 }) => <Svg size={s} strokeWidth="2"><path d="M20 6 9 17l-5-5" /></Svg>;
const IcoBox = ({ s = 14 }) => <Svg size={s}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></Svg>;
const IcoExpand = ({ s = 14 }) => <Svg size={s}><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></Svg>;
const IcoCollapse = ({ s = 14 }) => <Svg size={s}><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></Svg>;

/* ── Shimmer keyframes (shared pattern with Dashboard) ────── */
const ShimmerStyle = () => (
  <style>{`
    @keyframes posShimmer { 0% { background-position: -300px 0; } 100% { background-position: 300px 0; } }
    @keyframes posSpin { to { transform: rotate(360deg); } }
    .pos-skel {
      background: linear-gradient(90deg, #f1f5f9 25%, #f8fafc 37%, #f1f5f9 63%);
      background-size: 600px 100%;
      animation: posShimmer 1.6s ease-in-out infinite;
    }
    .pos-skel-dark {
      background: linear-gradient(90deg, #171b20 25%, #1c2128 37%, #171b20 63%);
      background-size: 600px 100%;
      animation: posShimmer 1.6s ease-in-out infinite;
    }
  `}</style>
);
const Skel = ({ w = '100%', h = 14, radius = 4, dark = false, style = {} }) => (
  <div className={dark ? 'pos-skel-dark' : 'pos-skel'} style={{ width: w, height: h, borderRadius: radius, ...style }} />
);

/* ── Status dot — same pattern as Dashboard's StatusDot ──── */
const StockBadge = ({ q, manages, status }) => {
  let label = null;
  let color = T.accent;
  if (manages) {
    const n = Number.parseFloat(q);
    if (n <= 0) { label = 'Out'; color = T.danger; }
    else if (n <= 5) { label = `Low · ${n}`; color = T.warn; }
  } else if (status === 'outofstock') { label = 'Out'; color = T.danger; }
  else if (status === 'onbackorder') { label = 'Backorder'; color = T.warn; }

  if (!label) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color }} />
      {label}
    </span>
  );
};

/* ── Notice bar — neutral by default, no default blue ─────── */
const NoticeBar = ({ type, text }) => {
  const colors = {
    success: { bg: T.accentSoft, border: '#a7f3d0', color: '#047857' },
    error: { bg: T.dangerSoft, border: '#fecaca', color: T.danger },
    info: { bg: T.lineSoft, border: T.line, color: T.inkSoft },
  };
  const c = colors[type] || colors.info;
  return (
    <div style={{
      background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8,
      padding: '9px 12px', fontSize: 12.5, fontWeight: 600, color: c.color,
      display: 'flex', alignItems: 'center', gap: 7,
    }}>
      {type === 'success' && <IcoCheck s={13} />}
      {type === 'error' && <IcoX s={13} />}
      {text}
    </div>
  );
};

/* ── Product image with shimmer fallback ──────────────────── */
const ProductImage = ({ src, alt }) => {
  const [status, setStatus] = useState('loading');
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {status === 'loading' && (
        <div className="pos-skel" style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, borderRadius: 0 }} />
      )}
      {status === 'error' && (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.inkFaint, position: 'absolute', inset: 0 }}>
          <IcoBox s={32} />
        </div>
      )}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        referrerPolicy="no-referrer"
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
        style={{
          width: '100%', height: '100%', objectFit: 'contain',
          opacity: status === 'loaded' ? 1 : 0,
          transition: 'opacity 0.25s ease',
          position: 'absolute', inset: 0,
        }}
      />
    </div>
  );
};

/* ══════════════════════════════════════════════════ */
function PosTerminal() {
  const storeName = useAuthStore((s) => s.storeName);
  const products = usePosStore((s) => s.products);
  const cart = usePosStore((s) => s.cart);
  const setProducts = usePosStore((s) => s.setProducts);
  const addToCart = usePosStore((s) => s.addToCart);
  const removeFromCart = usePosStore((s) => s.removeFromCart);
  const updateQuantity = usePosStore((s) => s.updateQuantity);
  const clearCart = usePosStore((s) => s.clearCart);
  const cartTotal = usePosStore((s) => s.cartTotal());

  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));
  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      // ignore
    }
  };

  const [loadingProducts, setLoadingProducts] = useState(products.length === 0);
  const [loadError, setLoadError] = useState('');
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutStage, setCheckoutStage] = useState('');
  const [checkoutError, setCheckoutError] = useState('');
  const [completedOrder, setCompletedOrder] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentOption, setPaymentOption] = useState('cash');
  const [quantityDrafts, setQuantityDrafts] = useState({});
  const [cartWarning, setCartWarning] = useState('');
  const [scanNotice, setScanNotice] = useState({ type: '', text: '' });
  const [customerDetails, setCustomerDetails] = useState({ name: '', phone: '', email: '' });
  const [isVariationsModalOpen, setIsVariationsModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [variations, setVariations] = useState([]);
  const [loadingVariations, setLoadingVariations] = useState(false);
  const [variationsError, setVariationsError] = useState('');
  const [isCustomerOpen, setIsCustomerOpen] = useState(false);
  const [cashTendered, setCashTendered] = useState('');
  const [displayCount, setDisplayCount] = useState(40);

  const searchInputRef = useRef(null);
  const observerTargetRef = useRef(null);
  const audioContextRef = useRef(null);
  const cashTenderInputRef = useRef(null);
  const checkoutButtonRef = useRef(null);

  const playPosSound = (type) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioContextRef.current) audioContextRef.current = new AudioCtx();
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const now = ctx.currentTime;
      const seq = type === 'checkout'
        ? [{ f: 784, d: 0.08, g: 0.4 }, { f: 988, d: 0.09, g: 0.4 }, { f: 1175, d: 0.12, g: 0.4 }]
        : [{ f: 740, d: 0.06, g: 0.3 }, { f: 932, d: 0.07, g: 0.3 }];
      let offset = 0;
      seq.forEach(({ f, d, g }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine'; osc.frequency.setValueAtTime(f, now + offset);
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(g, now + offset + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + d);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now + offset); osc.stop(now + offset + d + 0.01);
        offset += d + 0.03;
      });
    } catch { /* optional */ }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      if (products.length === 0) setLoadingProducts(true);
      setLoadError('');
      try {
        const catalog = await fetchProducts();
        if (alive) setProducts(catalog);
      } catch {
        if (alive) setLoadError('Failed to load products. Check API credentials and try again.');
      } finally {
        if (alive && products.length === 0) setLoadingProducts(false);
      }
    })();
    return () => { alive = false; };
  }, [setProducts]);

  const getLocalStock = (item) => {
    if (item?.manage_stock === false && item?.stock_status === 'instock') return Number.MAX_SAFE_INTEGER;
    if (item?.stock_status === 'outofstock') return 0;
    return Number.parseInt(item?.stock_quantity ?? item?.stock ?? 0, 10) || 0;
  };

  const handleOpenVariations = async (product) => {
    setSelectedProduct(product); setIsVariationsModalOpen(true);
    setLoadingVariations(true); setVariationsError(''); setVariations([]);
    try {
      setVariations(await fetchVariations(product.id));
    } catch { setVariationsError('Failed to load product options. Please try again.'); }
    finally { setLoadingVariations(false); }
  };

  const handleCloseVariations = () => {
    setIsVariationsModalOpen(false); setSelectedProduct(null);
    setVariations([]); setVariationsError(''); setLoadingVariations(false);
  };

  const handleSelectVariation = (variation) => {
    if (!selectedProduct) return;
    addToCart(selectedProduct, variation);
    playPosSound('add');
    handleCloseVariations();
  };

  const handleQuantityChange = (item, nextQty) => {
    const safe = Number.isFinite(nextQty) ? Math.max(0, Math.floor(nextQty)) : 0;
    const key = cartItemKey(item);
    if (safe === 0) {
      removeFromCart(item.id, item.variation_id ?? null);
      setQuantityDrafts((c) => { const n = { ...c }; delete n[key]; return n; });
      setCartWarning(''); return;
    }
    const avail = getLocalStock(item);
    if (avail !== undefined && avail !== Number.MAX_SAFE_INTEGER && safe > avail) {
      updateQuantity(item.id, item.variation_id ?? null, avail);
      setQuantityDrafts((c) => ({ ...c, [key]: String(avail) }));
      setCartWarning(`Only ${avail} units available for ${item.name}.`); return;
    }
    updateQuantity(item.id, item.variation_id ?? null, safe);
    setQuantityDrafts((c) => ({ ...c, [key]: String(safe) }));
    setCartWarning('');
  };

  const handleRemoveCartItem = (item) => {
    removeFromCart(item.id, item.variation_id ?? null);
    setQuantityDrafts((c) => { const n = { ...c }; delete n[cartItemKey(item)]; return n; });
    setCartWarning('');
  };

  const commitQuantityDraft = async (item) => {
    const raw = quantityDrafts[cartItemKey(item)] ?? String(item.quantity);
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
      setQuantityDrafts((c) => ({ ...c, [cartItemKey(item)]: String(item.quantity) })); return;
    }
    await handleQuantityChange(item, parsed);
  };

  const handleCheckout = async () => {
    if (cart.length === 0 || isCheckingOut) return;
    const name = customerDetails.name?.trim() || '';
    const phone = customerDetails.phone?.trim() || '';
    if (!phone) { setCheckoutError('Customer phone is required.'); return; }

    setIsCheckingOut(true); setCheckoutStage('Verifying stock…'); setCheckoutError('');
    try {
      const stockResults = await Promise.all(
        cart.map(async (item) => ({ item, currentStock: await checkStock(item.id, item.variation_id ?? null) })),
      );
      setStockByItem((c) => {
        const n = { ...c };
        stockResults.forEach(({ item, currentStock }) => { n[cartItemKey(item)] = currentStock; });
        return n;
      });
      for (const { item, currentStock } of stockResults) {
        if (currentStock <= 0) { setCheckoutError(`Out of stock: ${item.name}. Checkout halted.`); return; }
        if (currentStock < item.quantity) {
          setCheckoutError(`Insufficient stock for ${item.name}. Available: ${currentStock}, in cart: ${item.quantity}.`); return;
        }
      }
      setCheckoutStage('Creating order…');
      const orderData = await createPosOrder(cart, { name, phone, email: '' }, paymentOption);
      setCompletedOrder(orderData);
      setIsCustomerOpen(false);
      playPosSound('checkout');
    } catch (e) {
      setCheckoutError(`Checkout failed: ${e?.message || 'Please retry.'}`);
    } finally { setIsCheckingOut(false); setCheckoutStage(''); }
  };

  const handleReceiptClose = () => {
    clearCart(); setCompletedOrder(null); setCheckoutError(''); setCashTendered('');
    setCustomerDetails({ name: '', phone: '', email: '' });
    searchInputRef.current?.focus();
  };

  const cartItemCount = cart.reduce((s, i) => s + i.quantity, 0);
  const parsedCash = Number.parseFloat(cashTendered);
  const safeCash = Number.isFinite(parsedCash) ? parsedCash : 0;
  const cashRemaining = paymentOption === 'cash' ? Math.max(0, cartTotal - safeCash) : 0;
  const cashChange = paymentOption === 'cash' ? Math.max(0, safeCash - cartTotal) : 0;
  const isCashShort = paymentOption === 'cash' && cashTendered.trim() !== '' && safeCash < cartTotal;

  const filteredProducts = products.filter((p) => {
    if (!searchTerm.trim()) return true;
    return extractProductSearchTokens(p).some((t) => t.includes(normalizeSearchText(searchTerm)));
  });

  useEffect(() => {
    setDisplayCount(40);
  }, [searchTerm]);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setDisplayCount((prev) => prev + 40);
      }
    }, { threshold: 0.1, rootMargin: '200px' });

    if (observerTargetRef.current) observer.observe(observerTargetRef.current);
    return () => observer.disconnect();
  }, []);

  const productCodeLookup = useMemo(() => {
    const map = new Map();
    products.forEach((p) => {
      extractBarcodeCandidates(p).forEach((id) => {
        if (!map.has(id)) map.set(id, []);
        map.get(id).push(p);
      });
    });
    return map;
  }, [products]);

  const handleSearchSubmit = async () => {
    const q = normalizeIdentifier(searchTerm);
    if (!q) return;
    const exact = productCodeLookup.get(q) || [];
    if (exact.length === 1) {
      const m = exact[0];
      if (isVariableProduct(m)) { await handleOpenVariations(m); setScanNotice({ type: 'info', text: `Matched ${m.name}. Select variation.` }); }
      else { addToCart(m); playPosSound('add'); setScanNotice({ type: 'success', text: `Added ${m.name} to cart.` }); }
      setSearchTerm(''); searchInputRef.current?.focus(); return;
    }
    if (exact.length > 1) { setScanNotice({ type: 'info', text: `Code matched ${exact.length} products. Select manually.` }); return; }
    if (filteredProducts.length === 1) {
      const s = filteredProducts[0];
      if (isVariableProduct(s)) { await handleOpenVariations(s); setScanNotice({ type: 'info', text: `Matched ${s.name}. Select variation.` }); }
      else { addToCart(s); playPosSound('add'); setScanNotice({ type: 'success', text: `Added ${s.name} to cart.` }); }
      setSearchTerm(''); searchInputRef.current?.focus(); return;
    }
    setScanNotice({ type: 'error', text: 'No product found for scanned code.' });
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'F2') { e.preventDefault(); setPaymentOption('cash'); setTimeout(() => cashTenderInputRef.current?.focus(), 0); return; }
      if (e.key === 'F3') { e.preventDefault(); setPaymentOption('bank_transfer'); return; }
      if (e.key === 'F9') { e.preventDefault(); if (cart.length > 0 && !isCheckingOut && !isCashShort) handleCheckout(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cart.length, handleCheckout, isCashShort, isCheckingOut]);

  /* ── shared style tokens ─────────────────────── */
  const S = {
    panel: { background: T.surface, border: `1px solid ${T.line}`, borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,0.04)' },
    input: {
      background: T.surface, border: `1px solid ${T.line}`, borderRadius: 8,
      color: T.ink, padding: '10px 14px', fontSize: 14, outline: 'none', width: '100%',
      fontFamily: T.sans, transition: 'border-color 0.15s',
    },
    label: { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.inkSoft, display: 'block', marginBottom: 6 },
    sectionHead: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '18px 24px', borderBottom: `1px solid ${T.lineSoft}`, background: T.surface,
    },
    headText: { fontSize: 14, fontWeight: 700, color: T.ink, letterSpacing: '-0.01em' },
  };

  return (
    <div style={{ minHeight: '100vh', background: T.canvas, color: T.ink, fontFamily: T.sans }}>
      <ShimmerStyle />
      <style>{`
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
        input::placeholder { color: #94a3b8 !important; }
      `}</style>

      {/* ── Topbar ─────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 30,
        background: T.surface, borderBottom: `1px solid ${T.line}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', height: 60, gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 7, background: T.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff' }}>
            <IcoScan s={16} />
          </div>
          <div>
            <span style={{ fontSize: 14.5, fontWeight: 800, color: T.ink, display: 'block', letterSpacing: '-0.01em' }}>POS Terminal</span>
            <span style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 500, color: T.inkSoft }}>
              {storeName || 'POS STORE'}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={toggleFullscreen}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36,
              background: T.surface, border: `1px solid ${T.line}`, borderRadius: 8,
              color: T.inkSoft, cursor: 'pointer',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.inkFaint; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; }}
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <IcoCollapse s={14} /> : <IcoExpand s={14} />}
          </button>
          <button
            onClick={async () => {
              setLoadError('');
              setScanNotice({ type: 'info', text: 'Syncing catalog...' });
              try {
                const catalog = await fetchProducts();
                setProducts(catalog);
                setScanNotice({ type: 'success', text: `Catalog synced (${catalog.length} items).` });
                setTimeout(() => setScanNotice({ type: '', text: '' }), 3000);
              } catch {
                setScanNotice({ type: 'error', text: 'Failed to sync catalog.' });
              }
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: T.surface, border: `1px solid ${T.line}`, borderRadius: 8,
              color: T.inkSoft, padding: '0 14px', height: 36, fontSize: 12.5, fontWeight: 600,
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.inkFaint; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; }}
          >
            <IcoSearch s={13} />
            Sync
          </button>

          <Link to="/" style={{
            display: 'flex', alignItems: 'center', gap: 7,
            background: T.ink, border: `1px solid ${T.ink}`, borderRadius: 8,
            color: '#ffffff', padding: '0 16px', height: 36, fontSize: 12.5, fontWeight: 600,
            textDecoration: 'none',
          }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#1e293b'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = T.ink; }}
          >
            <IcoArrowLeft s={13} />
            Dashboard
          </Link>
        </div>
      </header>

      {/* ── Main grid ──────────────────────────────── */}
      <div style={{ maxWidth: 1600, margin: '0 auto', padding: '20px', display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20, height: 'calc(100vh - 60px)' }}>

        {/* ══ LEFT: Product catalog ══════════════════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>

          {/* Search bar */}
          <div style={{ ...S.panel, flexShrink: 0, padding: 2 }}>
            <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ color: T.inkFaint, flexShrink: 0 }}><IcoSearch s={17} /></div>
              <input
                ref={searchInputRef}
                type="search"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); if (scanNotice.text) setScanNotice({ type: '', text: '' }); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearchSubmit(); } }}
                placeholder="Search by name, SKU or scan barcode…"
                style={{ border: 'none', background: 'transparent', padding: '9px 0', fontSize: 14.5, flex: 1, outline: 'none', color: T.ink, fontWeight: 500, fontFamily: T.sans }}
                autoFocus
              />
              {searchTerm && (
                <button type="button" onClick={() => setSearchTerm('')}
                  style={{ background: T.lineSoft, border: 'none', color: T.inkSoft, cursor: 'pointer', padding: 6, borderRadius: 20 }}>
                  <IcoX s={13} />
                </button>
              )}
              <div style={{ height: 20, width: 1, background: T.line, flexShrink: 0, margin: '0 2px' }} />
              <span style={{ fontFamily: T.mono, fontSize: 11.5, fontWeight: 500, color: T.inkSoft, whiteSpace: 'nowrap', flexShrink: 0 }}>
                {filteredProducts.length}/{products.length}
              </span>
            </div>
            {scanNotice.text && (
              <div style={{ padding: '0 14px 10px' }}>
                <NoticeBar type={scanNotice.type} text={scanNotice.text} />
              </div>
            )}
          </div>

          {/* Load states */}
          {loadingProducts && (
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14, alignContent: 'start', overflowY: 'hidden' }}>
              {[...Array(15)].map((_, i) => (
                <div key={i} style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 10, padding: 14, height: 210, display: 'flex', flexDirection: 'column' }}>
                  <Skel h={116} radius={6} style={{ marginBottom: 14 }} />
                  <Skel w="80%" h={13} style={{ marginBottom: 8 }} />
                  <Skel w="40%" h={11} />
                </div>
              ))}
            </div>
          )}
          {!loadingProducts && loadError && (
            <div style={{ ...S.panel, padding: 20 }}>
              <NoticeBar type="error" text={loadError} />
            </div>
          )}

          {/* Product grid */}
          {!loadingProducts && !loadError && (
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingRight: 4 }}>
              {filteredProducts.length === 0 ? (
                <div style={{
                  ...S.panel, padding: '56px 24px', textAlign: 'center',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                }}>
                  <div style={{ color: T.inkFaint }}><IcoSearch s={28} /></div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: T.ink, margin: '4px 0 0' }}>No products found</h3>
                  <p style={{ color: T.inkSoft, fontSize: 13, margin: 0 }}>Try a different name, SKU, or scan a barcode.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14 }}>
                  {filteredProducts.slice(0, displayCount).map((product) => {
                    const isVar = isVariableProduct(product);
                    const q = Number.parseFloat(product.stock_quantity);
                    const outOfStock = product.manage_stock ? q <= 0 : product.stock_status === 'outofstock';
                    return (
                      <div
                        key={product.id}
                        onClick={() => {
                          if (outOfStock) return;
                          if (isVar) { handleOpenVariations(product); return; }
                          addToCart(product); playPosSound('add');
                        }}
                        style={{
                          background: T.surface,
                          border: `1px solid ${outOfStock ? T.lineSoft : T.line}`,
                          borderRadius: 10,
                          overflow: 'hidden',
                          display: 'flex', flexDirection: 'column',
                          opacity: outOfStock ? 0.55 : 1,
                          cursor: outOfStock ? 'not-allowed' : 'pointer',
                          transition: 'border-color 0.12s ease',
                          boxShadow: '0 1px 2px rgba(15,23,42,0.03)',
                        }}
                        onMouseEnter={(e) => { if (!outOfStock) e.currentTarget.style.borderColor = T.inkFaint; }}
                        onMouseLeave={(e) => { if (!outOfStock) e.currentTarget.style.borderColor = T.line; }}
                      >
                        {/* Image section */}
                        <div style={{ width: '100%', aspectRatio: '4/5', background: T.canvas, position: 'relative' }}>
                          {product.images && product.images.length > 0 && product.images[0]?.src ? (
                            <ProductImage src={product.images[0].src} alt={product.name} />
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.inkFaint }}>
                              <IcoBox s={36} />
                            </div>
                          )}
                        </div>

                        {/* Content section */}
                        <div style={{ padding: '11px 14px', display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{
                              fontSize: 13, fontWeight: 600, color: T.ink, margin: 0,
                              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                              lineHeight: 1.4,
                            }}>
                              {product.name}
                            </p>
                            {product.sku && (
                              <p style={{ fontFamily: T.mono, fontSize: 10.5, color: T.inkFaint, margin: '4px 0 0 0' }}>
                                {product.sku}
                              </p>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
                            <p style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 700, color: T.ink, margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                              {formatPkr(product.price)}
                            </p>
                            <StockBadge q={product.stock_quantity} manages={product.manage_stock} status={product.stock_status} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {displayCount < filteredProducts.length && (
                    <div ref={observerTargetRef} style={{ height: 20, width: '100%', gridColumn: '1 / -1' }} />
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ══ RIGHT: Cart + checkout (dark ledger panel) ══════════════ */}
        <div style={{ background: D.bg, borderRadius: 12, border: `1px solid ${D.line}`, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>

          {/* Cart Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 22px', borderBottom: `1px solid ${D.line}` }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: D.text, letterSpacing: '-0.01em' }}>Current order</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              {cartItemCount > 0 && (
                <span style={{ fontFamily: T.mono, fontSize: 12, fontWeight: 500, color: D.textSoft }}>
                  {cartItemCount} item{cartItemCount === 1 ? '' : 's'}
                </span>
              )}
              {cart.length > 0 && (
                <button type="button" onClick={clearCart}
                  style={{ background: 'transparent', border: 'none', color: D.textFaint, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, padding: 0 }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = D.text; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = D.textFaint; }}
                >
                  <IcoTrash s={13} /> Clear
                </button>
              )}
            </div>
          </div>

          {cartWarning && (
            <div style={{ padding: '10px 22px', flexShrink: 0 }}>
              <div style={{
                background: '#241a06', border: '1px solid #4a3208', borderRadius: 8,
                padding: '9px 12px', fontSize: 12, fontWeight: 600, color: '#f0b429',
                display: 'flex', alignItems: 'center', gap: 7,
              }}>
                {cartWarning}
              </div>
            </div>
          )}

          {/* Cart items */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {cart.length === 0 ? (
              <div style={{ padding: '72px 22px', textAlign: 'center' }}>
                <div style={{ color: D.textFaint, marginBottom: 16, display: 'flex', justifyContent: 'center' }}><IcoBox s={30} /></div>
                <p style={{ color: D.text, fontSize: 14.5, fontWeight: 700, margin: 0 }}>Cart is empty</p>
                <p style={{ color: D.textFaint, fontSize: 12.5, margin: '6px 0 0' }}>Scan or select products to add</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {cart.map((item, idx) => {
                  const key = cartItemKey(item);
                  const avail = getLocalStock(item);
                  const hasLimit = Number.isFinite(avail) && avail !== Number.MAX_SAFE_INTEGER;
                  const plusDisabled = hasLimit && item.quantity >= avail;
                  const lineTotal = (Number.parseFloat(item.price) || 0) * item.quantity;

                  return (
                    <div key={key} style={{
                      padding: '16px 22px',
                      borderBottom: idx < cart.length - 1 ? `1px solid ${D.lineSoft}` : 'none',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <p style={{ fontSize: 13.5, fontWeight: 600, color: D.text, margin: 0, lineHeight: 1.4 }}>
                            {item.name}
                          </p>
                          {item.variation_id && item.attributes && (
                            <p style={{ fontSize: 12, color: D.textSoft, margin: '3px 0 0', fontWeight: 500 }}>
                              {variationLabel(item.attributes)}
                            </p>
                          )}
                        </div>
                        <button type="button" onClick={() => handleRemoveCartItem(item)}
                          style={{ background: 'transparent', border: 'none', color: D.textFaint, cursor: 'pointer', padding: 2 }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = '#f87171'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = D.textFaint; }}>
                          <IcoX s={16} />
                        </button>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: D.lineSoft, padding: 3, borderRadius: 8 }}>
                          <button type="button" onClick={() => handleQuantityChange(item, item.quantity - 1)}
                            style={{ width: 28, height: 28, borderRadius: 6, background: 'transparent', border: 'none', color: D.textSoft, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            onMouseEnter={(e) => e.currentTarget.style.background = D.line}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                            <IcoMinus s={13} />
                          </button>
                          <input
                            type="number" min="1" max={hasLimit ? avail : undefined}
                            value={quantityDrafts[key] ?? String(item.quantity)}
                            onChange={(e) => {
                              if (!/^\d*$/.test(e.target.value)) return;
                              setQuantityDrafts((c) => ({ ...c, [key]: e.target.value }));
                            }}
                            onBlur={() => commitQuantityDraft(item)}
                            onKeyDown={async (e) => { if (e.key !== 'Enter') return; e.preventDefault(); await commitQuantityDraft(item); searchInputRef.current?.focus(); }}
                            style={{ width: 36, height: 28, background: 'transparent', border: 'none', color: D.text, textAlign: 'center', fontSize: 14, fontWeight: 700, outline: 'none', padding: 0, fontFamily: T.mono }}
                          />
                          <button type="button" onClick={() => handleQuantityChange(item, item.quantity + 1)}
                            disabled={plusDisabled}
                            style={{ width: 28, height: 28, borderRadius: 6, background: 'transparent', border: 'none', color: plusDisabled ? D.textFaint : D.textSoft, cursor: plusDisabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            onMouseEnter={(e) => { if (!plusDisabled) e.currentTarget.style.background = D.line; }}
                            onMouseLeave={(e) => { if (!plusDisabled) e.currentTarget.style.background = 'transparent'; }}>
                            <IcoPlus s={13} />
                          </button>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontFamily: T.mono, fontSize: 15, fontWeight: 700, color: D.text, fontVariantNumeric: 'tabular-nums' }}>
                            {formatPkr(lineTotal)}
                          </div>
                          <div style={{ fontSize: 11, color: D.textFaint, marginTop: 2, fontWeight: 500 }}>
                            {formatPkr(item.price)} each
                          </div>
                        </div>
                      </div>

                      <p style={{ fontSize: 10.5, color: D.textFaint, marginTop: 10, fontWeight: 500 }}>
                        {avail === undefined ? 'Checking stock…' : avail === Number.MAX_SAFE_INTEGER ? 'Unlimited stock' : `Max available: ${avail}`}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Checkout controls */}
          <div style={{ borderTop: `1px solid ${D.line}`, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>

            <div style={{ display: 'flex', background: D.lineSoft, borderRadius: 9, padding: 3 }}>
              <button type="button" onClick={() => setPaymentOption('cash')}
                style={{ flex: 1, background: paymentOption === 'cash' ? T.accent : 'transparent', color: paymentOption === 'cash' ? '#ffffff' : D.textSoft, border: 'none', borderRadius: 7, padding: '10px', fontWeight: 700, cursor: 'pointer', transition: 'background 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 13 }}>
                <IcoCash s={14} /> Cash
              </button>
              <button type="button" onClick={() => setPaymentOption('bank_transfer')}
                style={{ flex: 1, background: paymentOption === 'bank_transfer' ? T.accent : 'transparent', color: paymentOption === 'bank_transfer' ? '#ffffff' : D.textSoft, border: 'none', borderRadius: 7, padding: '10px', fontWeight: 700, cursor: 'pointer', transition: 'background 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 13 }}>
                <IcoBank s={14} /> Bank transfer
              </button>
            </div>

            <div style={{ height: 1, background: D.line }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
              <div>
                <div style={{ fontSize: 10.5, color: D.textFaint, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>Total due</div>
                <div style={{ fontFamily: T.mono, fontSize: 30, fontWeight: 700, color: D.text, letterSpacing: '-0.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                  {formatPkr(cartTotal)}
                </div>
              </div>

              <button
                ref={checkoutButtonRef}
                type="button"
                onClick={() => setIsCustomerOpen(true)}
                disabled={cart.length === 0}
                style={{
                  background: cart.length === 0 ? D.lineSoft : T.accent,
                  border: 'none', borderRadius: 10, color: cart.length === 0 ? D.textFaint : '#ffffff',
                  fontSize: 15, fontWeight: 700, cursor: cart.length === 0 ? 'not-allowed' : 'pointer',
                  transition: 'background 0.15s ease', padding: '15px 26px', display: 'flex', alignItems: 'center', gap: 8,
                }}
                onMouseEnter={(e) => { if (cart.length > 0) e.currentTarget.style.background = '#15803d'; }}
                onMouseLeave={(e) => { if (cart.length > 0) e.currentTarget.style.background = T.accent; }}>
                <IcoCheck s={17} /> Pay
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Customer / Checkout Modal ──────────────── */}
      {isCustomerOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(15,23,42,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{ ...S.panel, width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px -12px rgba(15,23,42,0.25)' }}>
            <div style={S.sectionHead}>
              <span style={{ ...S.headText, fontSize: 15.5 }}>Customer details</span>
              <button type="button" onClick={() => setIsCustomerOpen(false)} disabled={isCheckingOut}
                style={{ background: 'transparent', border: 'none', color: T.inkFaint, cursor: isCheckingOut ? 'not-allowed' : 'pointer', padding: 4, borderRadius: 6 }}
                onMouseEnter={(e) => { if (!isCheckingOut) e.currentTarget.style.color = T.ink; }}
                onMouseLeave={(e) => { if (!isCheckingOut) e.currentTarget.style.color = T.inkFaint; }}>
                <IcoX s={17} />
              </button>
            </div>
            <div style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
              <label style={{ display: 'block' }}>
                <span style={S.label}>Customer name (optional)</span>
                <input type="text"
                  value={customerDetails.name} onChange={(e) => setCustomerDetails(c => ({ ...c, name: e.target.value }))}
                  placeholder="Enter name" style={S.input}
                  onFocus={(e) => e.target.style.borderColor = T.inkFaint}
                  onBlur={(e) => e.target.style.borderColor = T.line} />
              </label>
              <label style={{ display: 'block' }}>
                <span style={{ ...S.label, color: T.ink }}>Customer phone <span style={{ color: T.danger }}>*</span></span>
                <input type="tel"
                  value={customerDetails.phone} onChange={(e) => setCustomerDetails(c => ({ ...c, phone: e.target.value }))}
                  placeholder="03XXXXXXXXX" style={S.input}
                  onFocus={(e) => e.target.style.borderColor = T.inkFaint}
                  onBlur={(e) => e.target.style.borderColor = T.line} />
              </label>

              <div style={{ background: T.canvas, borderRadius: 8, padding: '14px 18px', border: `1px solid ${T.line}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: T.inkSoft, fontWeight: 600, fontSize: 13.5 }}>Total bill</span>
                  <span style={{ fontFamily: T.mono, color: T.accent, fontSize: 21, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatPkr(cartTotal)}</span>
                </div>
              </div>

              {checkoutError && <NoticeBar type="error" text={checkoutError} />}
              {isCheckingOut && checkoutStage && <NoticeBar type="info" text={checkoutStage} />}

              <button type="button" onClick={handleCheckout} disabled={isCheckingOut || !customerDetails.phone.trim()}
                style={{
                  background: (isCheckingOut || !customerDetails.phone.trim()) ? T.lineSoft : T.accent,
                  color: (isCheckingOut || !customerDetails.phone.trim()) ? T.inkFaint : '#ffffff',
                  border: 'none',
                  padding: '14px', borderRadius: 9, fontSize: 14.5, fontWeight: 700,
                  cursor: (isCheckingOut || !customerDetails.phone.trim()) ? 'not-allowed' : 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { if (!isCheckingOut && customerDetails.phone.trim()) e.currentTarget.style.background = '#15803d'; }}
                onMouseLeave={(e) => { if (!isCheckingOut && customerDetails.phone.trim()) e.currentTarget.style.background = T.accent; }}>
                {isCheckingOut ? checkoutStage || 'Processing…' : 'Confirm order & print'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Variations modal ───────────────────────── */}
      {isVariationsModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(15,23,42,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{ ...S.panel, width: '100%', maxWidth: 560, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px -12px rgba(15,23,42,0.25)' }}>
            <div style={S.sectionHead}>
              <div>
                <span style={{ ...S.headText, fontSize: 15.5 }}>Select option</span>
                {selectedProduct && (
                  <p style={{ fontSize: 13, fontWeight: 500, color: T.inkSoft, margin: '3px 0 0' }}>{selectedProduct.name}</p>
                )}
              </div>
              <button type="button" onClick={handleCloseVariations}
                style={{ background: 'transparent', border: `1px solid ${T.line}`, borderRadius: 7, color: T.inkSoft, cursor: 'pointer', padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600 }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.inkFaint; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; }}>
                <IcoX s={13} /> Close
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {loadingVariations && (
                <div style={{ padding: '48px 0', textAlign: 'center' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', border: `3px solid ${T.line}`, borderTopColor: T.ink, animation: 'posSpin 0.8s linear infinite', margin: '0 auto' }} />
                  <p style={{ color: T.inkSoft, marginTop: 14, fontSize: 13, fontWeight: 600 }}>Loading options…</p>
                </div>
              )}
              {!loadingVariations && variationsError && <NoticeBar type="error" text={variationsError} />}
              {!loadingVariations && !variationsError && variations.length === 0 && (
                <p style={{ color: T.inkSoft, fontSize: 14, textAlign: 'center', padding: '48px 0', fontWeight: 500 }}>No options available.</p>
              )}
              {!loadingVariations && !variationsError && variations.map((v) => {
                const q = Number.parseFloat(v.stock_quantity);
                const oos = v.manage_stock ? q <= 0 : v.stock_status === 'outofstock';

                let stockText = '';
                if (v.manage_stock) {
                  stockText = Number.isFinite(q) ? `Stock: ${q}` : 'Stock: N/A';
                } else {
                  stockText = v.stock_status === 'outofstock' ? 'Out of stock' : v.stock_status === 'onbackorder' ? 'On backorder' : 'In stock';
                }

                return (
                  <button key={v.id} type="button" onClick={() => handleSelectVariation(v)} disabled={oos}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: oos ? T.canvas : T.surface,
                      border: `1px solid ${oos ? T.lineSoft : T.line}`,
                      borderRadius: 9, padding: '15px 18px',
                      cursor: oos ? 'not-allowed' : 'pointer', opacity: oos ? 0.55 : 1, textAlign: 'left',
                      transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={(e) => { if (!oos) e.currentTarget.style.borderColor = T.ink; }}
                    onMouseLeave={(e) => { if (!oos) e.currentTarget.style.borderColor = T.line; }}>
                    <div>
                      <p style={{ fontSize: 14.5, fontWeight: 700, color: T.ink, margin: 0 }}>{variationLabel(v.attributes)}</p>
                      <p style={{ fontSize: 12.5, color: oos ? T.danger : T.inkSoft, margin: '4px 0 0', fontWeight: 600 }}>
                        {stockText}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontFamily: T.mono, fontSize: 16, fontWeight: 700, color: T.ink, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{formatPkr(v.price)}</p>
                      {oos && <p style={{ fontSize: 10.5, color: T.danger, margin: '4px 0 0', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Out of stock</p>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {completedOrder && <ReceiptModal orderData={completedOrder} onClose={handleReceiptClose} />}
    </div>
  );
}

export default PosTerminal;