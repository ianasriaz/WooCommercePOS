import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { fetchProducts, fetchTodaysSales, POS_ORDER_CREATED_EVENT } from '../api/wc-client';
import { usePosStore } from '../store/usePosStore';
import { useAuthStore } from '../store/useAuthStore';
import Layout from '../components/Layout';
import BarcodeGeneratorModal from '../components/BarcodeGeneratorModal';
import ReceiptModal from '../components/ReceiptModal';

/* ─── Design tokens ────────────────────────────────────────── */
const T = {
  ink: '#0f172a',
  inkSoft: '#64748b',
  inkFaint: '#94a3b8',
  line: '#e2e8f0',
  lineSoft: '#f1f5f9',
  surface: '#ffffff',
  canvas: '#f8fafc',
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

const pkrFormatter = new Intl.NumberFormat('en-PK', {
  style: 'currency',
  currency: 'PKR',
  maximumFractionDigits: 0,
});
const formatPkr = (v) => pkrFormatter.format(Number.parseFloat(v) || 0);

const fmtDate = (d) =>
  d.toLocaleDateString('en-PK', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });

const fmtTime = (d) =>
  d.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' });

/* ─── Inline SVG icons ─────────────────────────────────────── */
const Svg = ({ children, size = 16, strokeWidth = '1.6' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
    style={{ display: 'block', flexShrink: 0 }}>
    {children}
  </svg>
);
const IcoRefresh = ({ size }) => <Svg size={size}><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></Svg>;
const IcoPlus = ({ size = 16 }) => <Svg size={size} strokeWidth="2"><path d="M12 5v14" /><path d="M5 12h14" /></Svg>;
const IcoBarcode = ({ size = 14 }) => <Svg size={size}><path d="M3 5v14M7 5v14M10 5v14M14 5v14M17 5v14M21 5v14" /></Svg>;
const IcoSearch = ({ size = 14 }) => <Svg size={size}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></Svg>;
const IcoPrinter = ({ size = 14 }) => <Svg size={size}><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></Svg>;
const IcoExternal = ({ size = 13 }) => <Svg size={size}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></Svg>;
const IcoClose = ({ size = 16 }) => <Svg size={size} strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></Svg>;
const IcoCheck = ({ size = 14 }) => <Svg size={size} strokeWidth="2"><polyline points="20 6 9 17 4 12" /></Svg>;
const IcoUser = ({ size = 14 }) => <Svg size={size}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></Svg>;
const IcoPhone = ({ size = 13 }) => <Svg size={size}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></Svg>;
const IcoChevronRight = ({ size = 14 }) => <Svg size={size} strokeWidth="2"><polyline points="9 18 15 12 9 6" /></Svg>;
const IcoBox = ({ size = 14 }) => <Svg size={size}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></Svg>;

/* ─── Shimmer keyframes ─────────────────────────────────────── */
const ShimmerStyle = () => (
  <style>{`
    @keyframes posShimmer {
      0% { background-position: -300px 0; }
      100% { background-position: 300px 0; }
    }
    @keyframes pulseGreen {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.25); opacity: 0.7; }
    }
    @keyframes slideInRight {
      from { transform: translateX(100%); }
      to { transform: translateX(0); }
    }
    .pos-skel {
      background: linear-gradient(90deg, #f1f5f9 25%, #f8fafc 37%, #f1f5f9 63%);
      background-size: 600px 100%;
      animation: posShimmer 1.6s ease-in-out infinite;
    }
    .live-pulse-dot {
      animation: pulseGreen 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }
  `}</style>
);

const Skel = ({ w = '100%', h = 14, radius = 4, style = {} }) => (
  <div className="pos-skel" style={{ width: w, height: h, borderRadius: radius, ...style }} />
);

/* ─── Live clock ───────────────────────────────────────────── */
function LiveClock() {
  const [t, setT] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span style={{ fontFamily: T.mono, fontSize: 12.5, fontWeight: 500, color: T.inkSoft, letterSpacing: '0.01em' }}>
      {fmtDate(t)} · {fmtTime(t)}
    </span>
  );
}

/* ─── Product Thumbnail Avatar ─────────────────────────────── */
const ProductAvatar = ({ src, alt, name }) => {
  const [hasError, setHasError] = useState(!src);
  return (
    <div style={{
      width: 36, height: 36, borderRadius: 8, background: '#f1f5f9',
      border: '1px solid #e2e8f0', overflow: 'hidden', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {!hasError && src ? (
        <img
          src={src}
          alt={alt || name}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setHasError(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <span style={{ fontSize: 12, fontWeight: 700, color: T.inkSoft }}>
          {name ? name.charAt(0).toUpperCase() : <IcoBox size={16} />}
        </span>
      )}
    </div>
  );
};

/* ─── Ledger strip segment ─────────────────────────────────── */
const LedgerSegment = ({ label, value, sub, tone = 'default', loading, last, onClick, active }) => {
  const toneColor = {
    default: T.ink,
    accent: T.accent,
    warn: T.warn,
    danger: T.danger,
  }[tone];

  return (
    <div
      onClick={onClick}
      style={{
        flex: '1 1 0',
        minWidth: 180,
        padding: '20px 24px',
        borderRight: last ? 'none' : `1px solid ${T.line}`,
        display: 'flex', flexDirection: 'column', gap: 8,
        cursor: onClick ? 'pointer' : 'default',
        background: active ? '#f0fdf4' : 'transparent',
        transition: 'background 0.15s ease',
      }}
    >
      <span style={{
        fontSize: 10.5, fontWeight: 700, color: T.inkSoft,
        textTransform: 'uppercase', letterSpacing: '0.09em',
      }}>
        {label}
      </span>
      {loading ? (
        <>
          <Skel w="72%" h={28} />
          <Skel w="45%" h={12} />
        </>
      ) : (
        <>
          <span style={{
            fontFamily: T.mono, fontSize: 28, fontWeight: 700, color: toneColor,
            letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums',
          }}>
            {value}
          </span>
          <span style={{ fontSize: 12, color: T.inkFaint, fontWeight: 500 }}>{sub}</span>
        </>
      )}
    </div>
  );
};

/* ─── Panel wrapper ────────────────────────────────────────── */
const Panel = ({ children, style = {} }) => (
  <div style={{
    background: T.surface, border: `1px solid ${T.line}`, borderRadius: 10,
    boxShadow: '0 1px 3px rgba(15,23,42,0.04)', overflow: 'hidden', ...style,
  }}>
    {children}
  </div>
);

/* ─── Status dot ───────────────────────────────────────────── */
const StatusDot = ({ label }) => {
  const color = { Out: T.danger, Low: T.warn, 'In stock': T.accent }[label] || T.accent;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: T.ink }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      {label}
    </div>
  );
};

const getOrderChannel = (order) => {
  const method = String(order?.payment_method || '').toLowerCase();
  const title = String(order?.payment_method_title || '').toLowerCase();
  const createdVia = String(order?.created_via || '').toLowerCase();
  const posMeta = Array.isArray(order?.meta_data)
    ? order.meta_data.find((meta) => meta?.key === '_pos_order')?.value
    : null;

  if (posMeta === 'yes' || method === 'pos_cash' || title.includes('in-store') || title.includes('in store') || createdVia === 'pos-terminal') {
    return 'in-store';
  }
  return 'online';
};

/* ─── Main PosDashboard Component ─────────────────────────── */
function PosDashboard() {
  const storeUrl = useAuthStore((s) => s.storeUrl);
  const products = usePosStore((s) => s.products);
  const posOrders = usePosStore((s) => s.posOrders);
  const hasHydrated = usePosStore((s) => s._hasHydrated);
  const reconcilePosOrders = usePosStore((s) => s.reconcilePosOrders);
  const setProducts = usePosStore((s) => s.setProducts);
  const updateProducts = usePosStore((s) => s.updateProducts);
  const lastSyncTimestamp = usePosStore((s) => s.lastSyncTimestamp);

  const [loading, setLoading] = useState(products.length === 0);
  const [salesLoading, setSalesLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState('');
  const [todayOrders, setTodayOrders] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showBarcodeModal, setShowBarcodeModal] = useState(false);

  // Enhancements State
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [receiptOrder, setReceiptOrder] = useState(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryFilter, setInventoryFilter] = useState('all'); // 'all', 'instock', 'low', 'out'
  const [ordersFilter, setOrdersFilter] = useState('all'); // 'all', 'in-store', 'online'

  const confirmedOrdersRef = useRef(new Map());

  const mergeOrders = useCallback((serverOrders = []) => {
    const orderMap = new Map();

    serverOrders.forEach((order) => {
      if (order?.id) orderMap.set(order.id, order);
    });

    posOrders.forEach((order) => {
      if (order?.id && !orderMap.has(order.id)) {
        orderMap.set(order.id, order);
      }
    });

    confirmedOrdersRef.current.forEach((order, orderId) => {
      if (orderId && !orderMap.has(orderId)) {
        orderMap.set(orderId, order);
      }
    });

    reconcilePosOrders(serverOrders);

    const now = new Date();
    const todayYear = now.getFullYear();
    const todayMonth = now.getMonth();
    const todayDate = now.getDate();

    const mergedList = Array.from(orderMap.values()).filter((order) => {
      const dateStr = order.date_created || order.date_created_gmt;
      if (!dateStr) return true;
      const orderDate = new Date(dateStr);
      if (Number.isNaN(orderDate.getTime())) return true;

      const isSameDay =
        orderDate.getFullYear() === todayYear &&
        orderDate.getMonth() === todayMonth &&
        orderDate.getDate() === todayDate;

      if (isSameDay) return true;

      const timeDiffMs = now.getTime() - orderDate.getTime();
      return timeDiffMs >= 0 && timeDiffMs <= 24 * 60 * 60 * 1000;
    });

    return mergedList.sort((a, b) => {
      const dateA = new Date(a.date_created || a.date_created_gmt || 0).getTime();
      const dateB = new Date(b.date_created || b.date_created_gmt || 0).getTime();
      return dateB - dateA;
    });
  }, [posOrders, reconcilePosOrders]);

  const runLoad = async (manual = false) => {
    if (manual) setRefreshing(true);
    else setLoading(true);
    setSalesLoading(true);
    setDashboardError('');
    try {
      if (products.length === 0) {
        const [catalog, sales] = await Promise.all([
          fetchProducts(null, (batch) => {
            updateProducts(batch);
            setLoading(false);
          }),
          fetchTodaysSales(),
        ]);
        setProducts(catalog);
        setTodayOrders(mergeOrders(sales));
      } else {
        const [deltaCatalog, sales] = await Promise.all([
          fetchProducts(lastSyncTimestamp),
          fetchTodaysSales()
        ]);
        if (Array.isArray(deltaCatalog) && deltaCatalog.length > 0) {
          updateProducts(deltaCatalog);
        }
        setTodayOrders(mergeOrders(sales));
      }
    } catch {
      setDashboardError('Failed to load dashboard data. Please check your connection.');
    } finally {
      setLoading(false);
      setSalesLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let alive = true;
    if (!hasHydrated) return () => { alive = false; };
    (async () => {
      const needsFullSync = products.length === 0 || products.some(p => p.categories === undefined);
      if (products.length === 0) setLoading(true);

      const catalogPromise = needsFullSync
        ? fetchProducts(null, (batch) => {
          if (!alive) return;
          updateProducts(batch);
          setLoading(false);
        })
        : (lastSyncTimestamp ? fetchProducts(lastSyncTimestamp) : Promise.resolve([]));
      
      const salesPromise = fetchTodaysSales();

      try {
        const [catalog, sales] = await Promise.all([catalogPromise, salesPromise]);
        if (!alive) return;
        if (needsFullSync) {
          setProducts(catalog);
        } else if (Array.isArray(catalog) && catalog.length > 0) {
          updateProducts(catalog);
        }
        setTodayOrders(mergeOrders(sales));
      } catch {
        if (alive) setDashboardError('Failed to load dashboard data. Please try again.');
      } finally {
        if (alive) {
          setLoading(false);
          setSalesLoading(false);
        }
      }
    })();
    return () => { alive = false; };
  }, [hasHydrated]);

  useEffect(() => {
    let alive = true;
    
    const fetchSalesAndDelta = async () => {
      try {
        const [sales, deltaProducts] = await Promise.all([
          fetchTodaysSales(),
          lastSyncTimestamp ? fetchProducts(lastSyncTimestamp) : Promise.resolve([]),
        ]);
        if (alive) {
          setTodayOrders(mergeOrders(sales));
          if (Array.isArray(deltaProducts) && deltaProducts.length > 0) {
            updateProducts(deltaProducts);
          }
        }
      } catch (error) {
        if (alive) {
          const status = error?.response?.status;
          if (status === 401 || status === 403) {
            setDashboardError('WooCommerce rejected order access. Verify API key permissions.');
          }
        }
      }
    };

    const handlePosOrderCreated = (event) => {
      const message = event?.detail || event?.data || null;
      const order = message?.order;

      if (order?.id) {
        confirmedOrdersRef.current.set(order.id, order);
        setTodayOrders((currentOrders) => [
          order,
          ...currentOrders.filter((currentOrder) => currentOrder.id !== order.id),
        ]);
        setDashboardError('');
      }

      setTimeout(() => {
        if (alive) fetchSalesAndDelta();
      }, 1000);
    };

    const handleStorage = (event) => {
      if (event.key === POS_ORDER_CREATED_EVENT && event.newValue) {
        try {
          handlePosOrderCreated({ data: JSON.parse(event.newValue) });
        } catch {
          // fallback
        }
      }
    };

    const orderChannel = 'BroadcastChannel' in window
      ? new BroadcastChannel(POS_ORDER_CREATED_EVENT)
      : null;
    orderChannel?.addEventListener('message', handlePosOrderCreated);
    window.addEventListener(POS_ORDER_CREATED_EVENT, handlePosOrderCreated);
    window.addEventListener('storage', handleStorage);

    try {
      const storedMessage = window.localStorage.getItem(POS_ORDER_CREATED_EVENT);
      if (storedMessage) handleStorage({ key: POS_ORDER_CREATED_EVENT, newValue: storedMessage });
    } catch {
      // fallback
    }

    let interval = null;
    const startPolling = () => {
      if (!interval) {
        interval = setInterval(() => {
          if (document.visibilityState === 'visible') {
            fetchSalesAndDelta();
          }
        }, 25000);
      }
    };

    const stopPolling = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    startPolling();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchSalesAndDelta();
        startPolling();
      } else {
        stopPolling();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => { 
      alive = false; 
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      orderChannel?.close();
      window.removeEventListener(POS_ORDER_CREATED_EVENT, handlePosOrderCreated);
      window.removeEventListener('storage', handleStorage);
    };
  }, [lastSyncTimestamp, mergeOrders, updateProducts]);

  // Analytics & Shift Calculations
  const summary = useMemo(() => {
    const totalSales = todayOrders.reduce((s, o) => s + (Number.parseFloat(o.total) || 0), 0);
    const inStoreOrders = todayOrders.filter((o) => getOrderChannel(o) === 'in-store');
    const onlineOrders = todayOrders.filter((o) => getOrderChannel(o) === 'online');
    const inStoreSales = inStoreOrders.reduce((s, o) => s + (Number.parseFloat(o.total) || 0), 0);
    const onlineSales = onlineOrders.reduce((s, o) => s + (Number.parseFloat(o.total) || 0), 0);

    // Payment Method Breakdown
    const cashOrders = inStoreOrders.filter((o) => String(o?.payment_method || '').toLowerCase() === 'pos_cash' || String(o?.payment_method_title || '').toLowerCase().includes('cash'));
    const cashTotal = cashOrders.reduce((s, o) => s + (Number.parseFloat(o.total) || 0), 0);
    const bankTransferOrders = inStoreOrders.filter((o) => String(o?.payment_method || '').toLowerCase() === 'bacs' || String(o?.payment_method_title || '').toLowerCase().includes('bank'));
    const bankTotal = bankTransferOrders.reduce((s, o) => s + (Number.parseFloat(o.total) || 0), 0);

    const outOfStock = products.filter((p) =>
      p.manage_stock ? Number.parseFloat(p.stock_quantity) <= 0 : p.stock_status === 'outofstock'
    ).length;
    const lowStock = products.filter((p) => {
      const q = Number.parseFloat(p.stock_quantity);
      return p.manage_stock && Number.isFinite(q) && q > 0 && q <= 5;
    }).length;

    const avgBasket = todayOrders.length > 0 ? Math.round(totalSales / todayOrders.length) : 0;

    return {
      totalSales,
      orderCount: todayOrders.length,
      inStoreOrderCount: inStoreOrders.length,
      onlineOrderCount: onlineOrders.length,
      inStoreSales,
      onlineSales,
      cashTotal,
      bankTotal,
      avgBasket,
      outOfStock,
      lowStock,
    };
  }, [products, todayOrders]);

  // Filtered Inventory List
  const filteredProducts = useMemo(() => {
    let result = products;

    if (inventorySearch.trim()) {
      const q = inventorySearch.toLowerCase().trim();
      result = result.filter((p) => {
        const name = (p.name || '').toLowerCase();
        const sku = (p.sku || '').toLowerCase();
        const id = String(p.id);
        return name.includes(q) || sku.includes(q) || id.includes(q);
      });
    }

    if (inventoryFilter === 'out') {
      result = result.filter((p) =>
        p.manage_stock ? Number.parseFloat(p.stock_quantity) <= 0 : p.stock_status === 'outofstock'
      );
    } else if (inventoryFilter === 'low') {
      result = result.filter((p) => {
        const q = Number.parseFloat(p.stock_quantity);
        return p.manage_stock && Number.isFinite(q) && q > 0 && q <= 5;
      });
    } else if (inventoryFilter === 'instock') {
      result = result.filter((p) =>
        p.manage_stock ? Number.parseFloat(p.stock_quantity) > 5 : p.stock_status === 'instock'
      );
    }

    return result
      .sort((a, b) => new Date(b.date_created || 0) - new Date(a.date_created || 0))
      .slice(0, 40);
  }, [products, inventorySearch, inventoryFilter]);

  // Filtered Orders List
  const displayOrders = useMemo(() => {
    if (ordersFilter === 'in-store') return todayOrders.filter((o) => getOrderChannel(o) === 'in-store');
    if (ordersFilter === 'online') return todayOrders.filter((o) => getOrderChannel(o) === 'online');
    return todayOrders;
  }, [todayOrders, ordersFilter]);

  const stockTone = summary.outOfStock > 0 ? 'danger' : summary.lowStock > 0 ? 'warn' : 'accent';

  return (
    <Layout>
      <ShimmerStyle />
      <div style={{ fontFamily: T.sans, background: T.canvas, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>

        {/* ── Top Header ────────────────────────────────────────── */}
        <header style={{
          padding: '24px 32px 0 32px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: T.ink, letterSpacing: '-0.02em' }}>
              Dashboard
            </h1>
            <span style={{ width: 1, height: 16, background: T.line }} />
            <LiveClock />
            
            {/* Live Sync Status Indicator (#5) */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, padding: '4px 10px',
              borderRadius: 20, background: refreshing ? '#fef3c7' : '#ecfdf5',
              border: `1px solid ${refreshing ? '#fde68a' : '#a7f3d0'}`,
              fontSize: 12, fontWeight: 600, color: refreshing ? '#92400e' : '#065f46'
            }}>
              <span className={refreshing ? '' : 'live-pulse-dot'} style={{
                width: 6, height: 6, borderRadius: '50%',
                background: refreshing ? '#d97706' : '#10b981'
              }} />
              <span>
                {refreshing ? 'Syncing delta...' : `Live Sync Connected (${products.length.toLocaleString()} items)`}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={() => runLoad(true)}
              disabled={refreshing}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, margin: 0,
                background: T.surface, border: `1px solid ${T.line}`, borderRadius: 8, boxSizing: 'border-box',
                color: T.inkSoft, padding: '0 16px', height: 40, fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit',
                cursor: refreshing ? 'wait' : 'pointer', opacity: refreshing ? 0.6 : 1,
                appearance: 'none', WebkitAppearance: 'none',
              }}
              onMouseEnter={(e) => { if (!refreshing) e.currentTarget.style.borderColor = T.inkFaint; }}
              onMouseLeave={(e) => { if (!refreshing) e.currentTarget.style.borderColor = T.line; }}
            >
              <IcoRefresh size={13} />
              {refreshing ? 'Syncing' : 'Sync data'}
            </button>

            <button
              type="button"
              onClick={() => setShowBarcodeModal(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, margin: 0,
                background: T.surface, border: `1px solid ${T.line}`, borderRadius: 8, boxSizing: 'border-box',
                color: T.inkSoft, padding: '0 16px', height: 40, fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit',
                cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.inkFaint; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; }}
            >
              <IcoBarcode size={14} />
              Print Barcodes
            </button>

            {/* Standard + New sale button (No shortcut hint per prompt) */}
            <Link
              to="/sale"
              style={{
                display: 'flex', alignItems: 'center', gap: 8, margin: 0,
                background: T.accent, border: `1px solid ${T.accent}`, color: '#ffffff', borderRadius: 8, boxSizing: 'border-box',
                padding: '0 20px', height: 40, textDecoration: 'none', fontWeight: 700, fontSize: 13.5, fontFamily: 'inherit',
                letterSpacing: '-0.005em', transition: 'background 0.12s ease',
                appearance: 'none', WebkitAppearance: 'none',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = T.accentDark; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = T.accent; }}
            >
              <IcoPlus size={15} />
              New sale
            </Link>
          </div>
        </header>

        {/* ── Body ────────────────────────────────────────────── */}
        <div style={{ padding: '20px 32px 32px 32px', overflowY: 'auto', flex: 1 }}>

          {dashboardError && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: T.dangerSoft, border: '1px solid #fecaca', borderRadius: 8,
              padding: '10px 16px', fontSize: 13, color: T.danger, marginBottom: 16, fontWeight: 500,
            }}>
              {dashboardError}
            </div>
          )}

          {/* ── Ledger KPI Strip ──────────────────────────────── */}
          <div style={{
            background: T.surface, border: `1px solid ${T.line}`, borderRadius: 10,
            boxShadow: '0 1px 3px rgba(15,23,42,0.04)', marginBottom: 20, overflow: 'hidden'
          }}>
            <div style={{ display: 'flex', flexWrap: 'wrap' }}>
              <LedgerSegment
                label="Revenue today"
                value={salesLoading ? '' : formatPkr(summary.totalSales)}
                sub={`${summary.orderCount} orders · Avg ${formatPkr(summary.avgBasket)}`}
                tone="default"
                loading={salesLoading}
              />
              <LedgerSegment
                label="In-store POS"
                value={salesLoading ? '' : formatPkr(summary.inStoreSales)}
                sub={`${summary.inStoreOrderCount} sales · Cash: ${formatPkr(summary.cashTotal)}`}
                tone="accent"
                loading={salesLoading}
              />
              <LedgerSegment
                label="Online store"
                value={salesLoading ? '' : formatPkr(summary.onlineSales)}
                sub={`${summary.onlineOrderCount} web checkouts`}
                tone="default"
                loading={salesLoading}
              />
              <LedgerSegment
                label="Stock alerts"
                value={products.length === 0 ? '' : String(summary.lowStock + summary.outOfStock)}
                sub={products.length === 0 ? '' : `${summary.outOfStock} out · ${summary.lowStock} low (click to view)`}
                tone={stockTone}
                loading={products.length === 0}
                active={inventoryFilter === 'out' || inventoryFilter === 'low'}
                onClick={() => setInventoryFilter(inventoryFilter === 'out' ? 'all' : 'out')}
                last
              />
            </div>

            {/* Shift & Payment Method Breakdown Strip (#4) */}
            <div style={{
              padding: '10px 24px', background: '#fafbfc', borderTop: `1px solid ${T.lineSoft}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
              fontSize: 12.5, color: T.inkSoft, fontWeight: 500
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{ fontWeight: 700, color: T.ink }}>Register #1 Active</span>
                <span>•</span>
                <span>Expected Cash Float: <strong style={{ color: T.accent, fontFamily: T.mono }}>{formatPkr(summary.cashTotal)}</strong></span>
                <span>•</span>
                <span>Bank/Transfer: <strong style={{ color: T.ink, fontFamily: T.mono }}>{formatPkr(summary.bankTotal)}</strong></span>
              </div>
              <div style={{ fontSize: 11.5, color: T.inkFaint }}>
                Shift Started: Today · Cashier: In-Store POS
              </div>
            </div>
          </div>

          {/* ── Main Data Panels (Grid) ───────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20, alignItems: 'start' }}>

            {/* ── INVENTORY PANEL (#3) ────────────────────────── */}
            <Panel>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px 20px', borderBottom: `1px solid ${T.lineSoft}`, gap: 12, flexWrap: 'wrap'
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>Inventory</span>
                  <span style={{ fontFamily: T.mono, fontSize: 12, color: T.inkFaint }}>
                    {products.length.toLocaleString()} items
                  </span>
                </div>

                {/* Quick Instant Search */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, maxWidth: 280 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6, background: '#f8fafc',
                    border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 10px', width: '100%'
                  }}>
                    <IcoSearch size={13} />
                    <input
                      type="text"
                      placeholder="Search name, SKU, ID..."
                      value={inventorySearch}
                      onChange={(e) => setInventorySearch(e.target.value)}
                      style={{
                        border: 'none', background: 'transparent', outline: 'none',
                        fontSize: 12.5, width: '100%', color: T.ink, fontFamily: 'inherit'
                      }}
                    />
                    {inventorySearch && (
                      <button
                        type="button"
                        onClick={() => setInventorySearch('')}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, color: T.inkFaint }}
                      >
                        <IcoClose size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Filter Pills */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'instock', label: 'In Stock' },
                    { id: 'low', label: 'Low' },
                    { id: 'out', label: 'Out' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setInventoryFilter(f.id)}
                      style={{
                        padding: '4px 9px', borderRadius: 5, border: 'none',
                        fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                        background: inventoryFilter === f.id ? T.ink : '#f1f5f9',
                        color: inventoryFilter === f.id ? '#ffffff' : T.inkSoft,
                        transition: 'all 0.12s'
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Table Header */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1.8fr 120px 85px 100px',
                padding: '10px 20px', borderBottom: `1px solid ${T.line}`, background: '#fafbfc'
              }}>
                {['Product', 'Added', 'Status', 'Price'].map((h, i) => (
                  <span key={h} style={{
                    fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: T.inkFaint, textAlign: i === 3 ? 'right' : i === 2 ? 'center' : 'left',
                  }}>
                    {h}
                  </span>
                ))}
              </div>

              {/* Table Rows */}
              {products.length === 0 ? (
                <div style={{ padding: '20px' }}>
                  {[...Array(6)].map((_, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.8fr 120px 85px 100px', padding: '12px 0', gap: 8 }}>
                      <Skel w="80%" h={14} />
                      <Skel w="60%" h={12} />
                      <Skel w={45} h={12} style={{ margin: '0 auto' }} />
                      <Skel w="60%" h={14} style={{ marginLeft: 'auto' }} />
                    </div>
                  ))}
                </div>
              ) : filteredProducts.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                  <p style={{ fontSize: 13.5, color: T.inkSoft, margin: 0, fontWeight: 500 }}>
                    No matching products found.
                  </p>
                </div>
              ) : (
                <div style={{ maxHeight: 460, overflowY: 'auto' }}>
                  {filteredProducts.map((p) => {
                    const q = Number.parseFloat(p.stock_quantity);
                    const label = p.manage_stock
                      ? q <= 0 ? 'Out' : q <= 5 ? 'Low' : 'In stock'
                      : p.stock_status === 'outofstock' ? 'Out' : 'In stock';

                    const primaryImg = p.images?.[0]?.src || null;

                    return (
                      <div
                        key={p.id}
                        style={{
                          display: 'grid', gridTemplateColumns: '1.8fr 120px 85px 100px', alignItems: 'center',
                          padding: '11px 20px', borderBottom: `1px solid ${T.lineSoft}`,
                          transition: 'background 0.12s',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        {/* Product info with 36px Thumbnail Avatar */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, paddingRight: 10 }}>
                          <ProductAvatar src={primaryImg} alt={p.name} name={p.name} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{
                              fontSize: 13, fontWeight: 600, color: T.ink,
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            }}>
                              {p.name}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                              <span style={{
                                fontFamily: T.mono, fontSize: 10.5, color: T.inkFaint,
                                background: '#f1f5f9', padding: '1px 5px', borderRadius: 3
                              }}>
                                {p.sku || `ID:${p.id}`}
                              </span>
                              {p.categories?.[0]?.name && (
                                <span style={{ fontSize: 11, color: T.inkSoft }}>
                                  {p.categories[0].name}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Date Added */}
                        <div style={{ fontSize: 11.5, color: T.inkSoft, fontWeight: 500, lineHeight: 1.3 }}>
                          {p.date_created ? (
                            <>
                              <div>{fmtDate(new Date(p.date_created))}</div>
                              <div style={{ fontSize: 10.5, color: T.inkFaint }}>{fmtTime(new Date(p.date_created))}</div>
                            </>
                          ) : '—'}
                        </div>

                        {/* Stock Status */}
                        <div style={{ textAlign: 'center' }}>
                          <StatusDot label={label} />
                        </div>

                        {/* Price */}
                        <div style={{
                          textAlign: 'right', fontFamily: T.mono, fontSize: 13, fontWeight: 700,
                          color: T.ink, fontVariantNumeric: 'tabular-nums',
                        }}>
                          {formatPkr(p.price)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>

            {/* ── RECENT ORDERS PANEL (Clickable) ─────────────── */}
            <Panel>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px 20px', borderBottom: `1px solid ${T.lineSoft}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>Recent Sales</span>
                  <span style={{ fontFamily: T.mono, fontSize: 12, color: T.inkFaint }}>
                    {!salesLoading ? `${todayOrders.length} today` : ''}
                  </span>
                </div>

                {/* Orders Filter Tabs */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'in-store', label: 'POS' },
                    { id: 'online', label: 'Web' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setOrdersFilter(tab.id)}
                      style={{
                        padding: '3px 8px', borderRadius: 5, border: 'none',
                        fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        background: ordersFilter === tab.id ? T.ink : '#f1f5f9',
                        color: ordersFilter === tab.id ? '#ffffff' : T.inkSoft,
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {salesLoading ? (
                <div style={{ padding: '20px' }}>
                  {[...Array(5)].map((_, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <Skel w={100} h={14} />
                      <Skel w={70} h={14} />
                    </div>
                  ))}
                </div>
              ) : displayOrders.length === 0 ? (
                <div style={{ padding: '48px 20px', textAlign: 'center' }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: T.ink, margin: '0 0 4px' }}>No sales recorded</p>
                  <p style={{ fontSize: 12, color: T.inkSoft, margin: 0 }}>Completed orders will appear here in real-time.</p>
                </div>
              ) : (
                <div style={{ maxHeight: 460, overflowY: 'auto' }}>
                  {displayOrders.slice(0, 15).map((order) => {
                    const channel = getOrderChannel(order);
                    const isInStore = channel === 'in-store';
                    const isSelected = selectedOrder?.id === order.id;

                    return (
                      <div
                        key={order.id}
                        onClick={() => setSelectedOrder(order)}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '12px 20px', borderLeft: `3px solid ${isInStore ? T.accent : '#3b82f6'}`,
                          borderBottom: `1px solid ${T.lineSoft}`,
                          background: isSelected ? '#f0fdf4' : 'transparent',
                          cursor: 'pointer', transition: 'background 0.15s ease',
                        }}
                        onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#f8fafc'; }}
                        onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>
                              #{order.id}
                            </span>
                            <span style={{
                              fontSize: 10.5, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                              background: isInStore ? '#ecfdf5' : '#eff6ff',
                              color: isInStore ? '#065f46' : '#1e40af', textTransform: 'uppercase'
                            }}>
                              {isInStore ? 'POS' : 'Web'}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: T.inkSoft }}>
                            <span style={{
                              textTransform: 'capitalize', fontWeight: 600,
                              color: order.status === 'completed' ? T.accent : T.warn,
                            }}>
                              {order.status}
                            </span>
                            <span>•</span>
                            <span>{order.payment_method_title || order.payment_method || 'Cash'}</span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{
                              fontFamily: T.mono, fontSize: 13.5, fontWeight: 700, color: T.ink,
                              fontVariantNumeric: 'tabular-nums',
                            }}>
                              {formatPkr(order.total)}
                            </div>
                            {order.date_created && (
                              <div style={{ fontSize: 10.5, color: T.inkFaint, marginTop: 1 }}>
                                {fmtTime(new Date(order.date_created))}
                              </div>
                            )}
                          </div>
                          <IcoChevronRight size={14} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          </div>
        </div>
      </div>

      {/* ── Interactive Order Slide-Over Drawer (#1) ────────── */}
      {selectedOrder && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(2px)',
          display: 'flex', justifyContent: 'flex-end',
        }} onClick={() => setSelectedOrder(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 440, background: '#ffffff', height: '100%',
              boxShadow: '-10px 0 25px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column',
              animation: 'slideInRight 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {/* Drawer Header */}
            <div style={{
              padding: '20px 24px', borderBottom: '1px solid #e2e8f0',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 800, color: T.ink, margin: 0 }}>
                    Order #{selectedOrder.id}
                  </h3>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                    background: getOrderChannel(selectedOrder) === 'in-store' ? '#ecfdf5' : '#eff6ff',
                    color: getOrderChannel(selectedOrder) === 'in-store' ? '#065f46' : '#1e40af',
                  }}>
                    {getOrderChannel(selectedOrder) === 'in-store' ? 'POS Terminal' : 'Online Store'}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 4 }}>
                  {selectedOrder.date_created ? fmtDate(new Date(selectedOrder.date_created)) + ' at ' + fmtTime(new Date(selectedOrder.date_created)) : '—'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                style={{ border: 'none', background: '#f1f5f9', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.inkSoft }}
              >
                <IcoClose size={16} />
              </button>
            </div>

            {/* Drawer Body */}
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
              
              {/* Customer Info Card */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '14px 16px' }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: T.inkFaint, letterSpacing: '0.05em' }}>
                  Customer Details
                </span>
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: T.ink }}>
                    <IcoUser size={14} />
                    <span>{selectedOrder.billing?.first_name || selectedOrder.billing?.last_name ? `${selectedOrder.billing?.first_name || ''} ${selectedOrder.billing?.last_name || ''}`.trim() : 'Walk-in Customer'}</span>
                  </div>
                  {selectedOrder.billing?.phone && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: T.inkSoft }}>
                      <IcoPhone size={13} />
                      <span>{selectedOrder.billing.phone}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Items Purchased */}
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: T.inkFaint, letterSpacing: '0.05em' }}>
                  Line Items ({selectedOrder.line_items?.length || 0})
                </span>
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(selectedOrder.line_items || []).map((item, idx) => (
                    <div key={item.id || idx} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 12px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 6
                    }}>
                      <div style={{ minWidth: 0, paddingRight: 10 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.name}
                        </div>
                        <div style={{ fontSize: 11, color: T.inkFaint, marginTop: 2 }}>
                          {item.quantity} × {formatPkr(item.price || item.total)}
                        </div>
                      </div>
                      <div style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 700, color: T.ink }}>
                        {formatPkr(item.total)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Financial Breakdown */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: T.inkSoft }}>
                  <span>Payment Method</span>
                  <span style={{ fontWeight: 600, color: T.ink }}>{selectedOrder.payment_method_title || selectedOrder.payment_method || 'Cash'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: T.inkSoft }}>
                  <span>Order Status</span>
                  <span style={{ fontWeight: 600, textTransform: 'capitalize', color: selectedOrder.status === 'completed' ? T.accent : T.warn }}>
                    {selectedOrder.status}
                  </span>
                </div>
                <div style={{ height: 1, background: '#e2e8f0', margin: '4px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 800, color: T.ink }}>
                  <span>Total Amount</span>
                  <span style={{ fontFamily: T.mono, color: T.accent }}>{formatPkr(selectedOrder.total)}</span>
                </div>
              </div>
            </div>

            {/* Drawer Actions */}
            <div style={{
              padding: '16px 24px', borderTop: '1px solid #e2e8f0', background: '#fafbfc',
              display: 'flex', gap: 10,
            }}>
              <button
                type="button"
                onClick={() => {
                  setReceiptOrder(selectedOrder);
                  setIsReceiptOpen(true);
                }}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  background: T.ink, color: '#ffffff', border: 'none', borderRadius: 8,
                  padding: '11px 16px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
                }}
              >
                <IcoPrinter size={15} />
                Print Receipt
              </button>

              {storeUrl && (
                <a
                  href={`${storeUrl.replace(/\/$/, '')}/wp-admin/post.php?post=${selectedOrder.id}&action=edit`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    background: '#ffffff', color: T.inkSoft, border: '1px solid #cbd5e1', borderRadius: 8,
                    padding: '11px 16px', fontSize: 13, fontWeight: 600, textDecoration: 'none',
                  }}
                >
                  <IcoExternal size={14} />
                  WP Admin
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Receipt Modal ───────────────────────────────────── */}
      {isReceiptOpen && receiptOrder && (
        <ReceiptModal
          orderData={receiptOrder}
          onClose={() => {
            setIsReceiptOpen(false);
            setReceiptOrder(null);
          }}
        />
      )}

      {/* ── Barcode Generator Modal ─────────────────────────── */}
      {showBarcodeModal && (
        <BarcodeGeneratorModal onClose={() => setShowBarcodeModal(false)} />
      )}
    </Layout>
  );
}

export default PosDashboard;
