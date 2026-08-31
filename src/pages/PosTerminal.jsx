import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { checkStock, createPosOrder, fetchProduct, fetchProducts, fetchVariations } from '../api/wc-client';
import ReceiptModal from '../components/ReceiptModal';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { usePosStore } from '../store/usePosStore';
import { useAuthStore } from '../store/useAuthStore';
import { formatOrderDate, formatOrderTime } from '../utils/date-utils';

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
  accentDark: '#15803d',
  accentSoft: '#ecfdf5',
  warn: '#b45309',
  warnSoft: '#fffbeb',
  danger: '#b91c1c',
  dangerSoft: '#fef2f2',
  sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  mono: "'IBM Plex Mono', 'SF Mono', 'Roboto Mono', ui-monospace, monospace",
};

/* Dark cart panel — exact black contrast zone */
const D = {
  bg: '#000000',
  panel: '#0a0a0a',
  line: '#1f2022',
  lineSoft: '#121314',
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
const IcoBarcode = ({ s = 16 }) => <Svg size={s}><path d="M3 5v14M8 5v14M12 5v14M17 5v14M21 5v14"/></Svg>;
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
    @keyframes toastSlideDown {
      from { transform: translate(-50%, -20px); opacity: 0; }
      to { transform: translate(-50%, 0); opacity: 1; }
    }
    @keyframes posPulse {
      0% { transform: scale(0.95); opacity: 0.8; }
      50% { transform: scale(1.1); opacity: 1; }
      100% { transform: scale(0.95); opacity: 0.8; }
    }
    @keyframes slideUpSheet {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }

    /* Mobile responsive overrides for POS Terminal */
    @media (max-width: 768px) {
      .pos-topbar {
        padding: 0 14px !important;
        height: 56px !important;
      }
      .pos-topbar-brand-text {
        font-size: 15px !important;
      }
      .pos-topbar-desktop-only {
        display: none !important;
      }
      .pos-topbar-mobile-actions {
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
      }
      .pos-main-grid {
        display: flex !important;
        flex-direction: column !important;
        padding: 10px 10px 84px 10px !important;
        gap: 10px !important;
      }
      .pos-product-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 10px !important;
      }
      .pos-product-card-body {
        padding: 8px 10px !important;
        gap: 3px !important;
      }
      .pos-product-name {
        font-size: 12px !important;
        line-height: 1.3 !important;
      }
      .pos-product-price {
        font-size: 13px !important;
      }
      .pos-product-date {
        font-size: 9.5px !important;
      }
      .pos-desktop-cart-panel {
        display: none !important;
      }
      .pos-mobile-floating-bar {
        display: flex !important;
      }
    }
    @media (min-width: 769px) {
      .pos-topbar-mobile-actions {
        display: none !important;
      }
      .pos-mobile-floating-bar {
        display: none !important;
      }
      .pos-desktop-cart-panel {
        display: flex !important;
      }
    }
  `}</style>
);
const Skel = ({ w = '100%', h = 14, radius = 4, dark = false, style = {} }) => (
  <div className={dark ? 'pos-skel-dark' : 'pos-skel'} style={{ width: w, height: h, borderRadius: radius, ...style }} />
);

/* ── Status dot — same pattern as Dashboard's StatusDot ──── */
const StockBadge = ({ q, manages, status }) => {
  const isOOS = manages ? (Number.parseFloat(q) <= 0 || !Number.isFinite(Number.parseFloat(q))) : status === 'outofstock';
  const qty = Number.parseFloat(q);
  const isLow = manages && Number.isFinite(qty) && qty > 0 && qty <= 5;

  return (
    <span style={{
      fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 4, letterSpacing: '0.02em',
      background: isOOS ? T.dangerSoft : isLow ? T.warnSoft : T.accentSoft,
      color: isOOS ? T.danger : isLow ? T.warn : T.accent,
      border: `1px solid ${isOOS ? '#fecaca' : isLow ? '#fde68a' : '#bbf7d0'}`,
    }}>
      {isOOS ? 'OOS' : manages && Number.isFinite(qty) ? `${qty} in stock` : 'In stock'}
    </span>
  );
};

/* ── Product image with clean aspect ratio ────────────── */
const ProductImage = ({ src, alt }) => {
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState(false);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: T.canvas, overflow: 'hidden' }}>
      {!loaded && !err && <Skel w="100%" h="100%" radius={0} />}
      {!err ? (
        <img
          src={src} alt={alt}
          onLoad={() => setLoaded(true)}
          onError={() => { setErr(true); setLoaded(true); }}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
            opacity: loaded ? 1 : 0, transition: 'opacity 0.2s',
          }}
        />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.inkFaint }}>
          <IcoBox s={32} />
        </div>
      )}
    </div>
  );
};

/* ── Inline notice bar for search & scan feedback ─────────── */
const NoticeBar = ({ type = 'info', text }) => {
  const colors = {
    info: { bg: T.lineSoft, text: T.inkSoft, border: T.line },
    success: { bg: T.accentSoft, text: T.accent, border: '#bbf7d0' },
    error: { bg: T.dangerSoft, text: T.danger, border: '#fecaca' },
  }[type];

  return (
    <div style={{
      background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text,
      padding: '8px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 600,
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      {text}
    </div>
  );
};

/* ── Main PosTerminal Component ────────────────────────────── */
function PosTerminal() {
  const storeUrl = useAuthStore((s) => s.storeUrl);
  const storeName = useAuthStore((s) => s.storeName);
  const products = usePosStore((s) => s.products);
  const cart = usePosStore((s) => s.cart);
  const variationsCache = usePosStore((s) => s.variationsCache);
  const lastSyncTimestamp = usePosStore((s) => s.lastSyncTimestamp);
  const setProducts = usePosStore((s) => s.setProducts);
  const updateProducts = usePosStore((s) => s.updateProducts);
  const addToCart = usePosStore((s) => s.addToCart);
  const removeFromCart = usePosStore((s) => s.removeFromCart);
  const updateCartItemQuantity = usePosStore((s) => s.updateCartItemQuantity);
  const clearCart = usePosStore((s) => s.clearCart);
  const cacheVariations = usePosStore((s) => s.cacheVariations);
  const recordPosOrder = usePosStore((s) => s.recordPosOrder);

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
  const [isSearchFocused, setIsSearchFocused] = useState(true);
  const [paymentOption, setPaymentOption] = useState('cash');
  const [quantityDrafts, setQuantityDrafts] = useState({});
  const [cartWarning, setCartWarning] = useState('');
  const [scanNotice, setScanNotice] = useState({ type: '', text: '' });
  const [customerDetails, setCustomerDetails] = useState({ name: '', phone: '', email: '' });
  const [discountAmount, setDiscountAmount] = useState('');
  const [isVariationsModalOpen, setIsVariationsModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [variations, setVariations] = useState([]);
  const [loadingVariations, setLoadingVariations] = useState(false);
  const [variationsError, setVariationsError] = useState('');
  const [isCustomerOpen, setIsCustomerOpen] = useState(false);
  const [isRebuildModalOpen, setIsRebuildModalOpen] = useState(false);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [cashTendered, setCashTendered] = useState('');
  const [displayCount, setDisplayCount] = useState(40);

  const searchInputRef = useRef(null);
  const observerTargetRef = useRef(null);
  const audioContextRef = useRef(null);
  const cashTenderInputRef = useRef(null);
  const checkoutButtonRef = useRef(null);
  const catalogSyncInFlightRef = useRef(false);

  // Robustly auto-focus the search bar when the POS terminal mounts
  useEffect(() => {
    const timer = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

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

  const _hasHydrated = usePosStore((s) => s._hasHydrated);

  const handleBarcodeScan = async (code) => {
    if (!code) return;
    setCartWarning('');

    // 1. Check local catalog first
    let foundProduct = null;
    let foundVariation = null;

    for (const p of products) {
      if (extractBarcodeCandidates(p).includes(code)) {
        foundProduct = p;
        break;
      }
      const cachedVars = variationsCache[p.id];
      if (cachedVars) {
        const matchingVar = cachedVars.find(v => extractBarcodeCandidates(v).includes(code));
        if (matchingVar) {
          foundProduct = p;
          foundVariation = matchingVar;
          break;
        }
      }
    }

    if (foundProduct) {
      if (isVariableProduct(foundProduct) && !foundVariation) {
        handleOpenVariations(foundProduct);
      } else {
        addToCart(foundProduct, foundVariation);
        playPosSound('add');
        setScanNotice({
          type: 'success',
          text: `Scanned & Added: ${foundProduct.name}${foundVariation ? ` (${variationLabel(foundVariation.attributes)})` : ''}`,
        });
        setTimeout(() => setScanNotice({ type: '', text: '' }), 4000);
      }
      return;
    }

    // 2. Not in local catalog or variation cache: Look up remote variations
    setScanNotice({ type: 'info', text: `Searching barcode "${code}" on server...` });
    try {
      for (const p of products.filter(isVariableProduct)) {
        if (!variationsCache[p.id]) {
          const remoteVars = await fetchVariations(p.id);
          cacheVariations(p.id, remoteVars);
          const match = remoteVars.find(v => extractBarcodeCandidates(v).includes(code));
          if (match) {
            addToCart(p, match);
            playPosSound('add');
            setScanNotice({
              type: 'success',
              text: `Found & Added: ${p.name} (${variationLabel(match.attributes)})`,
            });
            setTimeout(() => setScanNotice({ type: '', text: '' }), 4000);
            return;
          }
        }
      }
    } catch {
      // ignore
    }

    setScanNotice({ type: 'error', text: `No product matches barcode "${code}".` });
  };

  useBarcodeScanner((barcode) => {
    handleBarcodeScan(barcode);
  });

  // Instant 0ms SWR hydration from IndexedDB
  useEffect(() => {
    if (_hasHydrated && products.length > 0) {
      setLoadingProducts(false);
    }
  }, [_hasHydrated, products.length]);

  // Background catalog initialization
  useEffect(() => {
    if (!_hasHydrated) return;

    if (products.length === 0) {
      setLoadingProducts(true);
      setLoadError('');
      fetchProducts(null, (batch) => {
        updateProducts(batch);
        setLoadingProducts(false);
      })
        .then((fullCatalog) => {
          setProducts(fullCatalog);
        })
        .catch((err) => {
          console.error(err);
          setLoadError('Failed to download product catalog. Please verify your connection.');
        })
        .finally(() => {
          setLoadingProducts(false);
        });
    } else {
      setLoadingProducts(false);
    }
  }, [setProducts, products.length, _hasHydrated, updateProducts]);

  // Delta synchronization
  useEffect(() => {
    if (!_hasHydrated || !lastSyncTimestamp || loadingProducts) return undefined;

    let isCancelled = false;

    const runDeltaSync = async () => {
      if (catalogSyncInFlightRef.current) return;
      catalogSyncInFlightRef.current = true;

      try {
        const deltaProducts = await fetchProducts(lastSyncTimestamp);
        if (!isCancelled && Array.isArray(deltaProducts) && deltaProducts.length > 0) {
          updateProducts(deltaProducts);
        }
      } catch (err) {
        console.error('Delta catalog sync failed', err);
      } finally {
        catalogSyncInFlightRef.current = false;
      }
    };

    runDeltaSync();
    const intervalId = setInterval(runDeltaSync, 180000);

    return () => {
      isCancelled = true;
      clearInterval(intervalId);
    };
  }, [_hasHydrated, lastSyncTimestamp, loadingProducts, updateProducts]);

  const handleSyncStock = async () => {
    if (!lastSyncTimestamp) {
      setScanNotice({ type: 'info', text: 'Please use Sync Inventory for the first load.' });
      return;
    }
    setLoadError('');
    setScanNotice({ type: 'info', text: 'Syncing stock updates...' });
    try {
      const fetchedProducts = await fetchProducts(lastSyncTimestamp);
      updateProducts(fetchedProducts);
      setScanNotice({ type: 'success', text: `Stock updated (${fetchedProducts.length} changes).` });
      setTimeout(() => setScanNotice({ type: '', text: '' }), 4000);
    } catch (err) {
      console.error('Sync error:', err);
      setScanNotice({ type: 'error', text: 'Failed to sync stock.' });
    }
  };

  const getLocalStock = useCallback((item) => {
    const targetProduct = products.find((p) => p.id === item.id);
    if (!targetProduct) return undefined;

    if (item.variation_id) {
      const cached = variationsCache[item.id]?.find((v) => v.id === item.variation_id);
      if (cached) {
        if (cached.manage_stock === false) return Number.MAX_SAFE_INTEGER;
        const q = Number.parseFloat(cached.stock_quantity);
        return Number.isFinite(q) ? q : undefined;
      }
    }

    if (targetProduct.manage_stock === false) return Number.MAX_SAFE_INTEGER;
    const q = Number.parseFloat(targetProduct.stock_quantity);
    return Number.isFinite(q) ? q : undefined;
  }, [products, variationsCache]);

  const handleQuantityChange = async (item, targetQuantity) => {
    const qty = Math.max(0, targetQuantity);
    setCartWarning('');

    if (qty === 0) {
      removeFromCart(item.id, item.variation_id);
      return;
    }

    const available = getLocalStock(item);
    if (available !== undefined && available !== Number.MAX_SAFE_INTEGER && qty > available) {
      setCartWarning(`Only ${available} unit(s) available in local stock.`);
      return;
    }

    updateCartItemQuantity(item.id, qty, item.variation_id);
  };

  const commitQuantityDraft = async (item) => {
    const key = cartItemKey(item);
    const draft = quantityDrafts[key];
    if (draft === undefined) return;

    const parsed = Number.parseInt(draft, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      removeFromCart(item.id, item.variation_id);
    } else {
      await handleQuantityChange(item, parsed);
    }

    setQuantityDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const handleRemoveCartItem = (item) => {
    removeFromCart(item.id, item.variation_id);
  };

  const handleClearCart = () => {
    clearCart();
    setDiscountAmount('');
    setCashTendered('');
    setCartWarning('');
    setIsMobileCartOpen(false);
  };

  // Product variations modal
  const handleOpenVariations = async (product) => {
    setSelectedProduct(product);
    setIsVariationsModalOpen(true);
    setVariationsError('');

    if (variationsCache[product.id] && variationsCache[product.id].length > 0) {
      setVariations(variationsCache[product.id]);
      return;
    }

    setLoadingVariations(true);
    try {
      const fetched = await fetchVariations(product.id);
      if (Array.isArray(fetched) && fetched.length > 0) {
        setVariations(fetched);
        cacheVariations(product.id, fetched);
      } else {
        setVariations([]);
        setVariationsError('No options available for this item.');
      }
    } catch (err) {
      console.error('Failed to load variations for product', product.id, err);
      setVariationsError(err?.message || 'Could not load options for this item.');
    } finally {
      setLoadingVariations(false);
    }
  };

  const handleCloseVariations = () => {
    setIsVariationsModalOpen(false);
    setSelectedProduct(null);
    setVariations([]);
  };

  const handleSelectVariation = (variation) => {
    if (!selectedProduct) return;
    addToCart(selectedProduct, variation);
    playPosSound('add');
    handleCloseVariations();
  };

  // Search filtering
  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return products;
    const tokens = searchTerm.toLowerCase().trim().split(/\s+/).filter(Boolean);

    return products.filter((product) => {
      const pTokens = extractProductSearchTokens(product);
      return tokens.every((t) => pTokens.some((pt) => pt.includes(t)));
    });
  }, [products, searchTerm]);

  // Infinite scroll
  const lastElementRef = useCallback((node) => {
    if (loadingProducts) return;
    if (observerTargetRef.current) observerTargetRef.current.disconnect();

    observerTargetRef.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && displayCount < filteredProducts.length) {
        setDisplayCount((c) => c + 30);
      }
    });

    if (node) observerTargetRef.current.observe(node);
  }, [loadingProducts, displayCount, filteredProducts.length]);

  // Cart financial computations
  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + (Number.parseFloat(item.price) || 0) * item.quantity, 0);
  }, [cart]);

  const parsedDiscount = Number.parseFloat(discountAmount) || 0;
  const finalDiscount = Math.min(Math.max(0, parsedDiscount), cartTotal);
  const finalTotal = Math.max(0, cartTotal - finalDiscount);
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const parsedCashTendered = Number.parseFloat(cashTendered) || 0;
  const changeDue = Math.max(0, parsedCashTendered - finalTotal);
  const isCashShort = paymentOption === 'cash' && cashTendered !== '' && parsedCashTendered < finalTotal;

  // Checkout process
  const handleCheckout = async () => {
    if (cart.length === 0 || isCheckingOut) return;
    setIsCheckingOut(true);
    setCheckoutError('');
    setCheckoutStage('Validating inventory…');

    try {
      setCheckoutStage('Submitting order…');
      const orderPayload = {
        status: 'completed',
        payment_method: paymentOption === 'cash' ? 'pos_cash' : 'bacs',
        payment_method_title: paymentOption === 'cash' ? 'POS Cash' : 'Bank Transfer',
        set_paid: true,
        billing: {
          first_name: customerDetails.name.trim() || 'Walk-in',
          last_name: 'Customer',
          phone: customerDetails.phone.trim() || '',
          email: customerDetails.email.trim() || '',
        },
        line_items: cart.map((item) => ({
          product_id: item.id,
          variation_id: item.variation_id || 0,
          quantity: item.quantity,
        })),
        fee_lines: finalDiscount > 0 ? [{ name: 'POS Discount', total: `-${finalDiscount}` }] : [],
        meta_data: [
          { key: '_pos_order', value: 'yes' },
          { key: '_pos_cash_tendered', value: String(parsedCashTendered || finalTotal) },
          { key: '_pos_change_due', value: String(changeDue) },
          { key: '_created_via', value: 'pos-terminal' },
        ],
      };

      const createdOrder = await createPosOrder(orderPayload);
      playPosSound('checkout');
      recordPosOrder(createdOrder);

      setCompletedOrder({
        ...createdOrder,
        cashTendered: parsedCashTendered || finalTotal,
        changeDue,
        discount: finalDiscount,
      });

      handleClearCart();
      setIsCustomerOpen(false);
      setIsMobileCartOpen(false);
    } catch (err) {
      console.error(err);
      setCheckoutError(err.message || 'Failed to complete transaction.');
    } finally {
      setIsCheckingOut(false);
      setCheckoutStage('');
    }
  };

  const handleReceiptClose = () => {
    setCompletedOrder(null);
    setCustomerDetails({ name: '', phone: '', email: '' });
  };

  const handleSearchSubmit = async () => {
    const q = searchTerm.trim();
    if (!q) return;

    if (filteredProducts.length === 1) {
      const s = filteredProducts[0];
      if (isVariableProduct(s)) {
        await handleOpenVariations(s);
        setScanNotice({ type: 'info', text: `Matched ${s.name}. Select option.` });
      } else {
        addToCart(s);
        playPosSound('add');
        setScanNotice({ type: 'success', text: `Added ${s.name} to cart.` });
      }
      setSearchTerm('');
      searchInputRef.current?.focus();
      return;
    }

    if (!q.includes(' ') && q.length >= 3) {
      await handleBarcodeScan(q);
      setSearchTerm('');
      searchInputRef.current?.focus();
      return;
    }

    setScanNotice({ type: 'error', text: 'No matching product found in database.' });
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'F1') { e.preventDefault(); searchInputRef.current?.focus(); return; }
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
      fontFamily: T.sans, transition: 'border-color 0.15s', boxSizing: 'border-box'
    },
    label: { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.inkSoft, display: 'block', marginBottom: 6 },
    sectionHead: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '18px 24px', borderBottom: `1px solid ${T.lineSoft}`, background: T.surface,
    },
    headText: { fontSize: 14, fontWeight: 700, color: T.ink, letterSpacing: '-0.01em' },
  };

  /* ── Reusable Cart Component ────────────────────────── */
  const renderCartContent = (isMobileSheet = false) => (
    <div style={{
      background: D.bg,
      borderRadius: isMobileSheet ? 0 : 12,
      border: isMobileSheet ? 'none' : `1px solid ${D.line}`,
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: 0,
      overflow: 'hidden',
    }}>
      {/* Cart Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px 20px', borderBottom: `1px solid ${D.line}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: D.text, letterSpacing: '-0.01em' }}>Current order</span>
          {cartItemCount > 0 && (
            <span style={{ fontFamily: T.mono, fontSize: 11.5, fontWeight: 600, color: '#4ade80', background: 'rgba(34,197,94,0.15)', padding: '2px 7px', borderRadius: 10 }}>
              {cartItemCount} item{cartItemCount === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {cart.length > 0 && (
            <button
              type="button"
              onClick={handleClearCart}
              style={{ background: 'transparent', border: 'none', color: D.textFaint, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, padding: 0 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = D.text; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = D.textFaint; }}
            >
              <IcoTrash s={13} /> Clear
            </button>
          )}
          {isMobileSheet && (
            <button
              type="button"
              onClick={() => setIsMobileCartOpen(false)}
              style={{ background: '#171b20', border: 'none', color: D.text, cursor: 'pointer', width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <IcoX s={14} />
            </button>
          )}
        </div>
      </div>

      {cartWarning && (
        <div style={{ padding: '8px 20px', flexShrink: 0 }}>
          <div style={{
            background: '#241a06', border: '1px solid #4a3208', borderRadius: 8,
            padding: '8px 12px', fontSize: 11.5, fontWeight: 600, color: '#f0b429',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {cartWarning}
          </div>
        </div>
      )}

      {/* Cart items */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {cart.length === 0 ? (
          <div style={{ padding: '64px 20px', textAlign: 'center' }}>
            <div style={{ color: D.textFaint, marginBottom: 14, display: 'flex', justifyContent: 'center' }}><IcoBox s={28} /></div>
            <p style={{ color: D.text, fontSize: 14, fontWeight: 700, margin: 0 }}>Cart is empty</p>
            <p style={{ color: D.textFaint, fontSize: 12, margin: '4px 0 0' }}>Scan or select products to add</p>
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
                  padding: '14px 20px',
                  borderBottom: idx < cart.length - 1 ? `1px solid ${D.lineSoft}` : 'none',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: D.text, margin: 0, lineHeight: 1.3 }}>
                          {item.name}
                        </p>
                        <span style={{ 
                          fontSize: 9.5, fontWeight: 700, padding: '1px 5px', borderRadius: 4, 
                          background: 'rgba(22, 163, 74, 0.15)', color: '#4ade80' 
                        }}>
                          {avail === undefined ? 'Checking…' : hasLimit ? `${avail} left` : 'In stock'}
                        </span>
                      </div>
                      {item.variation_id && item.attributes && (
                        <p style={{ fontSize: 11.5, color: D.textSoft, margin: '2px 0 0', fontWeight: 500 }}>
                          {variationLabel(item.attributes)}
                        </p>
                      )}
                    </div>
                    <button type="button" onClick={() => handleRemoveCartItem(item)}
                      style={{ background: 'transparent', border: 'none', color: D.textFaint, cursor: 'pointer', padding: 2 }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#f87171'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = D.textFaint; }}>
                      <IcoX s={14} />
                    </button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, background: D.lineSoft, padding: 2, borderRadius: 6 }}>
                      <button type="button" onClick={() => handleQuantityChange(item, item.quantity - 1)}
                        style={{ width: 26, height: 26, borderRadius: 5, background: 'transparent', border: 'none', color: D.textSoft, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <IcoMinus s={12} />
                      </button>
                      <input
                        type="number" min="1" max={hasLimit ? avail : undefined}
                        value={quantityDrafts[key] ?? String(item.quantity)}
                        onChange={(e) => {
                          if (!/^\d*$/.test(e.target.value)) return;
                          setQuantityDrafts((c) => ({ ...c, [key]: e.target.value }));
                        }}
                        onBlur={() => commitQuantityDraft(item)}
                        onKeyDown={async (e) => { if (e.key !== 'Enter') return; e.preventDefault(); await commitQuantityDraft(item); }}
                        style={{ width: 32, height: 26, background: 'transparent', border: 'none', color: D.text, textAlign: 'center', fontSize: 13, fontWeight: 700, outline: 'none', padding: 0, fontFamily: T.mono }}
                      />
                      <button type="button" onClick={() => handleQuantityChange(item, item.quantity + 1)}
                        disabled={plusDisabled}
                        style={{ width: 26, height: 26, borderRadius: 5, background: 'transparent', border: 'none', color: plusDisabled ? D.textFaint : D.textSoft, cursor: plusDisabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <IcoPlus s={12} />
                      </button>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 700, color: D.text, fontVariantNumeric: 'tabular-nums' }}>
                        {formatPkr(lineTotal)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Checkout controls */}
      <div style={{ borderTop: `1px solid ${D.line}`, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', background: D.lineSoft, borderRadius: 8, padding: 4, gap: 6 }}>
          <button type="button" onClick={() => setPaymentOption('cash')}
            style={{ flex: 1, background: paymentOption === 'cash' ? T.accent : 'transparent', color: paymentOption === 'cash' ? '#ffffff' : D.textSoft, border: 'none', borderRadius: 6, padding: '8px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12.5 }}>
            <IcoCash s={13} /> Cash
          </button>
          <button type="button" onClick={() => setPaymentOption('bank_transfer')}
            style={{ flex: 1, background: paymentOption === 'bank_transfer' ? T.accent : 'transparent', color: paymentOption === 'bank_transfer' ? '#ffffff' : D.textSoft, border: 'none', borderRadius: 6, padding: '8px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12.5 }}>
            <IcoBank s={13} /> Bank
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ color: D.textSoft, fontSize: 12.5, fontWeight: 600 }}>Discount</div>
          <div style={{ display: 'flex', alignItems: 'center', background: D.lineSoft, borderRadius: 6, padding: '4px 8px', width: 110 }}>
            <span style={{ color: D.textFaint, fontSize: 11, marginRight: 4, fontWeight: 600 }}>Rs</span>
            <input type="number" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} placeholder="0" min="0" step="any" style={{ background: 'transparent', border: 'none', color: D.text, width: '100%', outline: 'none', textAlign: 'right', fontSize: 13, fontWeight: 700, fontFamily: T.mono, padding: 0 }} />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: D.textFaint, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>Grand Total</div>
            <div style={{ fontFamily: T.mono, fontSize: 24, fontWeight: 800, color: D.text, letterSpacing: '-0.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {formatPkr(finalTotal)}
            </div>
          </div>

          <button
            ref={checkoutButtonRef}
            type="button"
            onClick={() => setIsCustomerOpen(true)}
            disabled={cart.length === 0}
            style={{
              background: cart.length === 0 ? D.lineSoft : T.accent,
              border: 'none', borderRadius: 8, color: cart.length === 0 ? D.textFaint : '#ffffff',
              fontSize: 14.5, fontWeight: 700, cursor: cart.length === 0 ? 'not-allowed' : 'pointer',
              padding: '12px 22px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flex: 1,
            }}
          >
            <IcoCheck s={16} /> Pay
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.canvas, color: T.ink, fontFamily: T.sans }}>
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
      <header className="pos-topbar" style={{
        position: 'sticky', top: 0, zIndex: 30,
        background: T.surface, borderBottom: `1px solid ${T.line}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', height: 60, gap: 12,
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9,
            background: 'linear-gradient(135deg, #16a34a 0%, #10b981 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff',
            boxShadow: '0 4px 10px -2px rgba(22, 163, 74, 0.4)', flexShrink: 0
          }}>
            <IcoScan s={17} />
          </div>
          <span className="pos-topbar-brand-text" style={{
            fontSize: 16, fontWeight: 800, color: T.ink,
            letterSpacing: '-0.02em', textTransform: 'uppercase', lineHeight: 1
          }}>
            {storeName || 'POS Store'}
          </span>
        </div>

        {/* Desktop actions */}
        <div className="pos-topbar-desktop-only" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: T.surface, border: `1px solid ${T.line}`, borderRadius: 8, padding: 4 }}>
            <button
              onClick={handleSyncStock}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'transparent', border: 'none', borderRadius: 6,
                color: T.inkSoft, padding: '0 10px', height: 28, fontSize: 12.5, fontWeight: 600,
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = T.lineSoft; e.currentTarget.style.color = T.ink; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.inkSoft; }}
            >
              <IcoSearch s={13} />
              Sync Stock
            </button>
            <div style={{ width: 1, height: 16, background: T.line }} />
            <button
              onClick={() => setIsRebuildModalOpen(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'transparent', border: 'none', borderRadius: 6,
                color: T.inkSoft, padding: '0 10px', height: 28, fontSize: 12.5, fontWeight: 600,
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = T.lineSoft; e.currentTarget.style.color = T.ink; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.inkSoft; }}
            >
              <IcoBox s={13} />
              Sync Inventory
            </button>
          </div>

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

        {/* Mobile topbar actions - unified and properly aligned */}
        <div className="pos-topbar-mobile-actions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {cartItemCount > 0 && (
            <button
              type="button"
              onClick={() => setIsMobileCartOpen(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: T.surface, border: `1px solid ${T.line}`, borderRadius: 8,
                color: T.ink, padding: '0 10px', height: 34, fontSize: 12.5, fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <IcoBox s={14} />
              <span style={{
                background: T.accent, color: '#ffffff', borderRadius: '50%',
                width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10.5, fontWeight: 800
              }}>
                {cartItemCount}
              </span>
            </button>
          )}
          <Link to="/" style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: T.ink, border: `1px solid ${T.ink}`, borderRadius: 8,
            color: '#ffffff', padding: '0 12px', height: 34, fontSize: 12.5, fontWeight: 600,
            textDecoration: 'none', lineHeight: 1,
          }}>
            <IcoArrowLeft s={13} />
            <span>Dashboard</span>
          </Link>
        </div>
      </header>

      {/* ── Main grid ──────────────────────────────── */}
      <div className="pos-main-grid" style={{ maxWidth: 1600, margin: '0 auto', padding: '20px', display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20, flex: 1, width: '100%', boxSizing: 'border-box', minHeight: 0 }}>

        {/* ══ LEFT: Product catalog ══════════════════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>

          {/* Search bar & Integrated Notice */}
          <div style={{
            ...S.panel, flexShrink: 0, padding: 0, display: 'flex', flexDirection: 'column',
            border: isSearchFocused ? `2px solid ${T.ink}` : `1px solid ${T.line}`,
            boxShadow: S.panel.boxShadow,
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: isSearchFocused ? 'translateY(-1px)' : 'none',
          }}>
            <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ color: isSearchFocused ? T.ink : T.inkFaint, flexShrink: 0, transition: 'color 0.2s' }}>
                <IcoSearch s={18} />
              </div>
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); if (scanNotice.text) setScanNotice({ type: '', text: '' }); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearchSubmit(); } }}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setIsSearchFocused(false)}
                placeholder="Search by Name, SKU, Barcode..."
                style={{ border: 'none', background: 'transparent', padding: '8px 0', fontSize: 14.5, flex: 1, outline: 'none', color: T.ink, fontWeight: 600, fontFamily: T.sans }}
                autoFocus
              />
              {searchTerm && (
                <button type="button" onClick={() => setSearchTerm('')}
                  style={{ background: T.lineSoft, border: 'none', color: T.inkSoft, cursor: 'pointer', padding: 5, borderRadius: 20 }}>
                  <IcoX s={13} />
                </button>
              )}
              
              <div style={{ height: 20, width: 1, background: T.line, flexShrink: 0, margin: '0 2px' }} />
              
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, background: T.lineSoft, color: T.ink, borderRadius: 6 }}>
                <div style={{ animation: 'posPulse 2s infinite', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <IcoBarcode s={14} />
                </div>
              </div>
            </div>
            
            {/* Integrated Notification Ribbon */}
            <div style={{
              height: scanNotice.text ? 'auto' : 0, opacity: scanNotice.text ? 1 : 0,
              overflow: 'hidden', transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              background: scanNotice.type === 'success' ? '#ecfdf5' : scanNotice.type === 'error' ? '#fef2f2' : '#f8fafc',
              borderTop: scanNotice.text ? `1px solid ${scanNotice.type === 'success' ? '#d1fae5' : scanNotice.type === 'error' ? '#fee2e2' : T.line}` : 'none'
            }}>
              <div style={{
                padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 12, fontWeight: 600,
                color: scanNotice.type === 'success' ? '#047857' : scanNotice.type === 'error' ? '#dc2626' : '#64748b'
              }}>
                {scanNotice.type === 'success' && <IcoCheck s={13} />}
                {scanNotice.type === 'error' && <IcoX s={13} />}
                {scanNotice.text}
              </div>
            </div>
          </div>

          {/* Load states */}
          {loadingProducts && (
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, alignContent: 'start', overflowY: 'hidden' }}>
              {[...Array(12)].map((_, i) => (
                <div key={i} style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 10, padding: 12, height: 190, display: 'flex', flexDirection: 'column' }}>
                  <Skel h={100} radius={6} style={{ marginBottom: 10 }} />
                  <Skel w="80%" h={12} style={{ marginBottom: 6 }} />
                  <Skel w="40%" h={10} />
                </div>
              ))}
            </div>
          )}
          {!loadingProducts && loadError && (
            <div style={{ ...S.panel, padding: 16 }}>
              <NoticeBar type="error" text={loadError} />
            </div>
          )}

          {/* Product grid */}
          {!loadingProducts && !loadError && (
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingRight: 2 }}>
              {filteredProducts.length === 0 ? (
                <div style={{
                  ...S.panel, padding: '48px 20px', textAlign: 'center',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                }}>
                  <div style={{ color: T.inkFaint }}><IcoSearch s={24} /></div>
                  <h3 style={{ fontSize: 14.5, fontWeight: 700, color: T.ink, margin: '2px 0 0' }}>No products found</h3>
                  <p style={{ color: T.inkSoft, fontSize: 12.5, margin: 0 }}>Try a different name, SKU, or scan barcode.</p>
                </div>
              ) : (
                <div className="pos-product-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
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
                        {/* Image section: 4/5 aspect ratio shows complete clothing item without cropping */}
                        <div style={{ width: '100%', aspectRatio: '4/5', background: T.canvas, position: 'relative' }}>
                          {product.images && product.images.length > 0 && product.images[0]?.src ? (
                            <ProductImage src={product.images[0].src} alt={product.name} />
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.inkFaint }}>
                              <IcoBox s={32} />
                            </div>
                          )}
                        </div>

                        {/* Content section */}
                        <div className="pos-product-card-body" style={{ padding: '9px 12px', display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p className="pos-product-name" style={{
                              fontSize: 12.5, fontWeight: 600, color: T.ink, margin: 0,
                              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                              lineHeight: 1.35,
                            }}>
                              {product.name}
                            </p>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', gap: 4 }}>
                            <p className="pos-product-price" style={{ fontFamily: T.mono, fontSize: 13.5, fontWeight: 700, color: T.ink, margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                              {formatPkr(product.price)}
                            </p>
                            <StockBadge q={product.stock_quantity} manages={product.manage_stock} status={product.stock_status} />
                          </div>

                          {product.date_created && (
                            <p className="pos-product-date" style={{
                              fontSize: 10,
                              color: T.inkFaint,
                              margin: 0,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              fontFamily: T.sans,
                            }}>
                              Added {formatOrderDate(product.date_created)} · {formatOrderTime(product.date_created)}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {displayCount < filteredProducts.length && (
                    <div ref={lastElementRef} style={{ height: 20, width: '100%', gridColumn: '1 / -1' }} />
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ══ RIGHT: Cart + checkout (desktop panel) ══════════════ */}
        <div className="pos-desktop-cart-panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {renderCartContent(false)}
        </div>
      </div>

      {/* ── Mobile Floating Cart Bar (<=768px) ───────── */}
      {cartItemCount > 0 && (
        <div
          className="pos-mobile-floating-bar"
          onClick={() => setIsMobileCartOpen(true)}
          style={{
            position: 'fixed', bottom: 14, left: 14, right: 14, zIndex: 45,
            background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10,
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.45)', padding: '10px 14px',
            alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              background: T.accent, color: '#ffffff', borderRadius: 6,
              padding: '3px 8px', fontSize: 12, fontWeight: 800,
            }}>
              {cartItemCount}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 14.5, fontWeight: 800, color: '#ffffff', fontFamily: T.mono }}>
                {formatPkr(finalTotal)}
              </span>
              <span style={{ fontSize: 10.5, color: '#94a3b8' }}>
                {cartItemCount} {cartItemCount === 1 ? 'item' : 'items'} in order
              </span>
            </div>
          </div>
          <button
            type="button"
            style={{
              background: T.accent, color: '#ffffff', border: 'none', borderRadius: 7,
              padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Review & Pay ➔
          </button>
        </div>
      )}

      {/* ── Mobile Cart Bottom Sheet Modal ──────────── */}
      {isMobileCartOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(3px)',
            display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
          }}
          onClick={() => setIsMobileCartOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#000000', borderTopLeftRadius: 16, borderTopRightRadius: 16,
              border: `1px solid ${D.line}`, borderBottom: 'none',
              maxHeight: '92vh', height: '88vh', display: 'flex', flexDirection: 'column',
              animation: 'slideUpSheet 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {renderCartContent(true)}
          </div>
        </div>
      )}

      {/* ── Customer / Checkout Modal ──────────────── */}
      {isCustomerOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(15,23,42,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
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
            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <label style={{ display: 'block' }}>
                <span style={{ ...S.label, color: T.ink }}>Customer name <span style={{ color: T.danger }}>*</span></span>
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

              <div style={{ background: T.canvas, borderRadius: 8, padding: '14px 16px', border: `1px solid ${T.line}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: T.inkSoft, fontWeight: 600, fontSize: 13 }}>Grand total</span>
                  <span style={{ fontFamily: T.mono, color: T.ink, fontSize: 15.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatPkr(cartTotal)}</span>
                </div>
                {finalDiscount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: T.inkSoft, fontWeight: 600, fontSize: 13 }}>Discount</span>
                    <span style={{ fontFamily: T.mono, color: '#dc2626', fontSize: 15.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>-{formatPkr(finalDiscount)}</span>
                  </div>
                )}
                <div style={{ height: 1, background: T.line, margin: '2px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: T.ink, fontWeight: 700, fontSize: 13.5 }}>Paid Amount</span>
                  <span style={{ fontFamily: T.mono, color: T.accent, fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatPkr(finalTotal)}</span>
                </div>
              </div>

              {checkoutError && <NoticeBar type="error" text={checkoutError} />}
              {isCheckingOut && checkoutStage && <NoticeBar type="info" text={checkoutStage} />}

              <button type="button" onClick={handleCheckout} disabled={isCheckingOut || !customerDetails.name.trim() || !customerDetails.phone.trim()}
                style={{
                  background: (isCheckingOut || !customerDetails.name.trim() || !customerDetails.phone.trim()) ? T.lineSoft : T.accent,
                  color: (isCheckingOut || !customerDetails.name.trim() || !customerDetails.phone.trim()) ? T.inkFaint : '#ffffff',
                  border: 'none',
                  padding: '13px', borderRadius: 8, fontSize: 14, fontWeight: 700,
                  cursor: (isCheckingOut || !customerDetails.name.trim() || !customerDetails.phone.trim()) ? 'not-allowed' : 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { if (!isCheckingOut && customerDetails.name.trim() && customerDetails.phone.trim()) e.currentTarget.style.background = '#15803d'; }}
                onMouseLeave={(e) => { if (!isCheckingOut && customerDetails.name.trim() && customerDetails.phone.trim()) e.currentTarget.style.background = T.accent; }}>
                {isCheckingOut ? checkoutStage || 'Processing…' : 'Confirm & Print Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Rebuild Catalog Modal ──────────────── */}
      {isRebuildModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div style={{ ...S.panel, width: '100%', maxWidth: 460, display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px -12px rgba(15,23,42,0.3)', border: `1px solid ${T.line}` }}>
            <div style={{ padding: '20px 24px', borderBottom: `1px solid ${T.line}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: '#f1f5f9', color: T.ink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <IcoBox s={18} />
                </div>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: T.ink, margin: 0, letterSpacing: '-0.01em' }}>Full Inventory Sync</h3>
                  <p style={{ fontSize: 12.5, color: T.inkSoft, margin: '3px 0 0', lineHeight: 1.4 }}>
                    Sync a fresh copy of all products.
                  </p>
                </div>
              </div>
            </div>
            
            <div style={{ padding: '20px 24px', background: T.canvas, borderBottomLeftRadius: 12, borderBottomRightRadius: 12 }}>
              <div style={{ display: 'flex', gap: 8, background: '#f8fafc', border: `1px solid ${T.line}`, padding: 12, borderRadius: 8, marginBottom: 20 }}>
                <div style={{ color: T.inkSoft, marginTop: 1, flexShrink: 0 }}><IcoX s={13} /></div>
                <p style={{ fontSize: 12.5, color: T.ink, margin: 0, lineHeight: 1.4, fontWeight: 500 }}>
                  Use this only if you have permanently deleted products. For price or stock updates, use <strong>Sync Stock</strong>.
                </p>
              </div>
              
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setIsRebuildModalOpen(false)}
                  style={{
                    background: 'transparent', border: `1px solid ${T.line}`, borderRadius: 7,
                    color: T.inkSoft, fontSize: 13, fontWeight: 600, padding: '9px 16px', cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    setIsRebuildModalOpen(false);
                    setLoadError('');
                    setScanNotice({ type: 'info', text: 'Rebuilding full inventory...' });
                    try {
                      const catalog = await fetchProducts(null, (batch) => {
                        updateProducts(batch); 
                      });
                      setProducts(catalog);
                      setScanNotice({ type: 'success', text: `Inventory rebuilt (${catalog.length} items).` });
                      setTimeout(() => setScanNotice({ type: '', text: '' }), 4000);
                    } catch (err) {
                      console.error('Sync error:', err);
                      setScanNotice({ type: 'error', text: 'Failed to rebuild inventory.' });
                    }
                  }}
                  style={{
                    background: T.ink, border: 'none', borderRadius: 7,
                    color: '#ffffff', fontSize: 13, fontWeight: 600, padding: '9px 16px', cursor: 'pointer',
                    boxShadow: '0 2px 5px rgba(15, 23, 42, 0.2)'
                  }}
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Variations modal ───────────────────────── */}
      {isVariationsModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(15,23,42,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div style={{ ...S.panel, width: '100%', maxWidth: 540, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px -12px rgba(15,23,42,0.25)' }}>
            <div style={S.sectionHead}>
              <div>
                <span style={{ ...S.headText, fontSize: 15 }}>Select option</span>
                {selectedProduct && (
                  <p style={{ fontSize: 12.5, fontWeight: 500, color: T.inkSoft, margin: '2px 0 0' }}>{selectedProduct.name}</p>
                )}
              </div>
              <button type="button" onClick={handleCloseVariations}
                style={{ background: 'transparent', border: `1px solid ${T.line}`, borderRadius: 6, color: T.inkSoft, cursor: 'pointer', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600 }}
              >
                <IcoX s={12} /> Close
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {loadingVariations && (
                <div style={{ padding: '40px 0', textAlign: 'center' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', border: `3px solid ${T.line}`, borderTopColor: T.ink, animation: 'posSpin 0.8s linear infinite', margin: '0 auto' }} />
                  <p style={{ color: T.inkSoft, marginTop: 12, fontSize: 12.5, fontWeight: 600 }}>Loading options…</p>
                </div>
              )}
              {!loadingVariations && variationsError && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
                  <NoticeBar type="error" text={variationsError} />
                  <button
                    type="button"
                    onClick={() => selectedProduct && handleOpenVariations(selectedProduct)}
                    style={{
                      padding: '8px 16px', borderRadius: 7, background: T.ink, color: '#ffffff',
                      border: 'none', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    Retry loading options
                  </button>
                </div>
              )}
              {!loadingVariations && !variationsError && variations.length === 0 && (
                <p style={{ color: T.inkSoft, fontSize: 13, textAlign: 'center', padding: '40px 0', fontWeight: 500 }}>No options available.</p>
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
                      borderRadius: 8, padding: '12px 16px',
                      cursor: oos ? 'not-allowed' : 'pointer', opacity: oos ? 0.55 : 1, textAlign: 'left',
                      transition: 'border-color 0.15s',
                    }}
                  >
                    <div>
                      <p style={{ fontSize: 13.5, fontWeight: 700, color: T.ink, margin: 0 }}>{variationLabel(v.attributes)}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '3px 0 0' }}>
                        <span style={{ fontSize: 11.5, color: oos ? T.danger : T.inkSoft, fontWeight: 600 }}>
                          {stockText}
                        </span>
                        <span style={{ fontFamily: T.mono, fontSize: 10.5, fontWeight: 600, background: T.lineSoft, padding: '1px 5px', borderRadius: 4, color: T.inkSoft }}>
                          SKU: {v.barcode || v.sku || 'None'}
                        </span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontFamily: T.mono, fontSize: 14.5, fontWeight: 700, color: T.ink, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{formatPkr(v.price)}</p>
                      {oos && <p style={{ fontSize: 10, color: T.danger, margin: '2px 0 0', fontWeight: 700, textTransform: 'uppercase' }}>Out of stock</p>}
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