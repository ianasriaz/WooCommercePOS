import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { fetchProducts, fetchTodaysSales, POS_ORDER_CREATED_EVENT } from '../api/wc-client';
import { usePosStore } from '../store/usePosStore';
import { useAuthStore } from '../store/useAuthStore';
import {
  parseOrderDate,
  isOrderFromToday,
  formatOrderDate,
  formatOrderTime,
  formatOrderDateTime,
  formatTimeAgo,
} from '../utils/date-utils';
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

const fmtDate = (d) => formatOrderDate(d);
const fmtTime = (d) => formatOrderTime(d);

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
const IcoReceipt = ({ size = 14 }) => <Svg size={size}><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z" /><path d="M16 8h-8" /><path d="M16 12h-8" /><path d="M11 16H8" /></Svg>;

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

/* ─── Ledger strip segment ─────────────────────────────────── */
const MetricCard = ({ label, value, sub, tone = 'default', loading, last, onClick, active }) => {
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
        minWidth: 200,
        padding: '20px 24px',
        borderRight: last ? 'none' : `1px solid ${T.line}`,
        display: 'flex', flexDirection: 'column', gap: 8,
        cursor: onClick ? 'pointer' : 'default',
        background: active ? '#f0fdf4' : 'transparent',
        transition: 'background 0.15s ease',
      }}
    >
      <span style={{
        fontSize: 11, fontWeight: 700, color: T.inkSoft,
        textTransform: 'uppercase', letterSpacing: '0.08em',
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
            fontFamily: T.mono, fontSize: 26, fontWeight: 700, color: toneColor,
            letterSpacing: '-0.02em', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {value}
          </span>
          <span style={{ fontSize: 12, color: T.inkFaint, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {sub}
          </span>
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
  const reconcilePosOrders = usePosStore((s) => s.reconcilePosOrders);
  const setProducts = usePosStore((s) => s.setProducts);
  const updateProducts = usePosStore((s) => s.updateProducts);
  const lastSyncTimestamp = usePosStore((s) => s.lastSyncTimestamp);

  const [loading, setLoading] = useState(products.length === 0);
  const [salesLoading, setSalesLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState('');
  const [todayOrders, setTodayOrders] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [receiptOrder, setReceiptOrder] = useState(null);
  const [showBarcodeModal, setShowBarcodeModal] = useState(false);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [ordersSearch, setOrdersSearch] = useState('');
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

    const mergedList = Array.from(orderMap.values()).filter((order) => {
      return isOrderFromToday(order);
    });

    return mergedList.sort((a, b) => {
      const dateA = parseOrderDate(a)?.getTime() || 0;
      const dateB = parseOrderDate(b)?.getTime() || 0;
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
    runLoad();
  }, []);

  // Real-Time Polling & Instant Cross-Tab Event Listeners
  useEffect(() => {
    let alive = true;
    let pollInterval = null;

    const fetchSalesAndDelta = async () => {
      try {
        const [sales, deltaProducts] = await Promise.all([
          fetchTodaysSales(),
          lastSyncTimestamp ? fetchProducts(lastSyncTimestamp) : Promise.resolve(null),
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
        if (isOrderFromToday(order)) {
          setTodayOrders((currentOrders) => [
            order,
            ...currentOrders.filter((currentOrder) => currentOrder.id !== order.id),
          ]);
        }
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
      fetchSalesAndDelta();
    } catch {
      // background
    }

    const startPolling = () => {
      if (!pollInterval) {
        pollInterval = setInterval(() => {
          if (document.visibilityState === 'visible') {
            fetchSalesAndDelta();
          }
        }, 15000);
      }
    };

    const stopPolling = () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
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

  // Analytics & Revenue Calculations (Row 1)
  const summary = useMemo(() => {
    const totalSales = todayOrders.reduce((s, o) => s + (Number.parseFloat(o.total) || 0), 0);
    const inStoreOrders = todayOrders.filter((o) => getOrderChannel(o) === 'in-store');
    const onlineOrders = todayOrders.filter((o) => getOrderChannel(o) === 'online');
    const inStoreSales = inStoreOrders.reduce((s, o) => s + (Number.parseFloat(o.total) || 0), 0);
    const onlineSales = onlineOrders.reduce((s, o) => s + (Number.parseFloat(o.total) || 0), 0);

    // Payment Method Breakdown
    const cashOrders = inStoreOrders.filter((o) => {
      const method = String(o?.payment_method || '').toLowerCase();
      const title = String(o?.payment_method_title || '').toLowerCase();
      return method === 'pos_cash' || title.includes('cash');
    });
    const cashTotal = cashOrders.reduce((s, o) => s + (Number.parseFloat(o.total) || 0), 0);

    const bankTransferOrders = inStoreOrders.filter((o) => {
      const method = String(o?.payment_method || '').toLowerCase();
      const title = String(o?.payment_method_title || '').toLowerCase();
      return method === 'bacs' || title.includes('bank') || title.includes('card') || title.includes('pos_card');
    });
    const bankTotal = bankTransferOrders.reduce((s, o) => s + (Number.parseFloat(o.total) || 0), 0);

    return {
      totalSales,
      orderCount: todayOrders.length,
      inStoreOrderCount: inStoreOrders.length,
      onlineOrderCount: onlineOrders.length,
      inStoreSales,
      onlineSales,
      cashTotal,
      bankTotal,
    };
  }, [todayOrders]);

  // Catalog & Inventory Calculations (Row 2)
  const catalogStats = useMemo(() => {
    if (!products || products.length === 0) {
      return {
        totalCount: 0,
        inStockCount: 0,
        outOfStockCount: 0,
        lowStockCount: 0,
        lastUpdatedDate: null,
      };
    }

    let inStock = 0;
    let outOfStock = 0;
    let lowStock = 0;
    let newestModifiedTime = lastSyncTimestamp ? new Date(lastSyncTimestamp).getTime() : -1;

    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      const q = Number.parseFloat(p.stock_quantity);

      if (p.manage_stock) {
        if (Number.isFinite(q)) {
          if (q <= 0) outOfStock++;
          else if (q <= 5) {
            lowStock++;
            inStock++;
          } else {
            inStock++;
          }
        } else if (p.stock_status === 'outofstock') {
          outOfStock++;
        } else {
          inStock++;
        }
      } else {
        if (p.stock_status === 'outofstock') outOfStock++;
        else inStock++;
      }

      const modTime = p.date_modified
        ? new Date(p.date_modified).getTime()
        : p.date_created
        ? new Date(p.date_created).getTime()
        : -1;
      if (modTime > newestModifiedTime) {
        newestModifiedTime = modTime;
      }
    }

    const lastUpdatedDate =
      newestModifiedTime > 0
        ? new Date(newestModifiedTime)
        : lastSyncTimestamp
        ? new Date(lastSyncTimestamp)
        : new Date();

    return {
      totalCount: products.length,
      inStockCount: inStock,
      outOfStockCount: outOfStock,
      lowStockCount: lowStock,
      lastUpdatedDate,
    };
  }, [products, lastSyncTimestamp]);

  // Filtered & Searched Orders List
  const displayOrders = useMemo(() => {
    let list = todayOrders;

    if (ordersFilter === 'in-store') {
      list = list.filter((o) => getOrderChannel(o) === 'in-store');
    } else if (ordersFilter === 'online') {
      list = list.filter((o) => getOrderChannel(o) === 'online');
    }

    if (ordersSearch.trim()) {
      const q = ordersSearch.toLowerCase().trim();
      list = list.filter((o) => {
        const id = String(o.id || '');
        const name = `${o.billing?.first_name || ''} ${o.billing?.last_name || ''}`.toLowerCase();
        const phone = String(o.billing?.phone || '').toLowerCase();
        const payment = String(o.payment_method_title || o.payment_method || '').toLowerCase();
        return id.includes(q) || name.includes(q) || phone.includes(q) || payment.includes(q);
      });
    }

    return list;
  }, [todayOrders, ordersFilter, ordersSearch]);

  const stockTone = catalogStats.outOfStockCount > 0 ? 'danger' : catalogStats.lowStockCount > 0 ? 'warn' : 'accent';

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
            
            {/* Clean minimal live dot matching day/date typography */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 500, color: T.inkSoft }}>
              <span className={refreshing ? '' : 'live-pulse-dot'} style={{
                width: 6, height: 6, borderRadius: '50%',
                background: refreshing ? '#d97706' : '#16a34a',
                display: 'inline-block'
              }} />
              <span>{refreshing ? 'Syncing...' : 'Live'}</span>
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

          {/* ── ROW 1: SALES & REVENUE KPI STRIP (3 CARDS) ────── */}
          <div style={{
            background: T.surface, border: `1px solid ${T.line}`, borderRadius: 10,
            boxShadow: '0 1px 3px rgba(15,23,42,0.04)', marginBottom: 16, overflow: 'hidden'
          }}>
            <div style={{ display: 'flex', flexWrap: 'wrap' }}>
              <MetricCard
                label="Today Sales"
                value={salesLoading ? '' : formatPkr(summary.totalSales)}
                sub={`${summary.orderCount} orders today`}
                tone="default"
                loading={salesLoading}
              />
              <MetricCard
                label="In-Store Sales"
                value={salesLoading ? '' : formatPkr(summary.inStoreSales)}
                sub={`Cash: ${formatPkr(summary.cashTotal)} · Bank: ${formatPkr(summary.bankTotal)}`}
                tone="accent"
                loading={salesLoading}
              />
              <MetricCard
                label="Online Sales"
                value={salesLoading ? '' : formatPkr(summary.onlineSales)}
                sub={`${summary.onlineOrderCount} orders`}
                tone="default"
                loading={salesLoading}
                last
              />
            </div>
          </div>

          {/* ── ROW 2: INVENTORY & CATALOG KPI STRIP (3 CARDS) ── */}
          <div style={{
            background: T.surface, border: `1px solid ${T.line}`, borderRadius: 10,
            boxShadow: '0 1px 3px rgba(15,23,42,0.04)', marginBottom: 20, overflow: 'hidden'
          }}>
            <div style={{ display: 'flex', flexWrap: 'wrap' }}>
              <MetricCard
                label="Total Catalog"
                value={loading ? '' : `${catalogStats.totalCount.toLocaleString()} items`}
                sub={loading ? '' : `${catalogStats.inStockCount.toLocaleString()} in stock`}
                tone="default"
                loading={loading}
              />
              <MetricCard
                label="Stock Alerts"
                value={loading ? '' : `${catalogStats.outOfStockCount} out of stock`}
                sub={loading ? '' : `${catalogStats.lowStockCount} low stock (quick visual warning)`}
                tone={stockTone}
                loading={loading}
              />
              <MetricCard
                label="Last Inventory Update"
                value={loading ? '' : formatTimeAgo(catalogStats.lastUpdatedDate)}
                sub={loading ? '' : (catalogStats.lastUpdatedDate ? `Synced ${fmtDate(catalogStats.lastUpdatedDate)} · ${fmtTime(catalogStats.lastUpdatedDate)}` : 'Catalog up-to-date')}
                tone="default"
                loading={loading}
                last
              />
            </div>
          </div>

          {/* ── RECENT IN-STORE INVOICES TABLE SECTION ─────────── */}
          <Panel>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', borderBottom: `1px solid ${T.lineSoft}`, gap: 12, flexWrap: 'wrap'
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: T.ink, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <IcoReceipt size={16} />
                  Recent In-Store Invoices
                </span>
                <span style={{ fontFamily: T.mono, fontSize: 12, color: T.inkFaint }}>
                  {!salesLoading ? `${displayOrders.length} today` : ''}
                </span>
              </div>

              {/* Instant Search Box */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, maxWidth: 360 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6, background: '#f8fafc',
                  border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 10px', width: '100%'
                }}>
                  <IcoSearch size={13} />
                  <input
                    type="text"
                    placeholder="Search invoice #, customer, phone..."
                    value={ordersSearch}
                    onChange={(e) => setOrdersSearch(e.target.value)}
                    style={{
                      border: 'none', background: 'transparent', outline: 'none',
                      fontSize: 12.5, width: '100%', color: T.ink, fontFamily: 'inherit'
                    }}
                  />
                  {ordersSearch && (
                    <button
                      type="button"
                      onClick={() => setOrdersSearch('')}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, color: T.inkFaint }}
                    >
                      <IcoClose size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* Orders Filter Tabs */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {[
                  { id: 'all', label: 'All Invoices' },
                  { id: 'in-store', label: 'POS Terminal' },
                  { id: 'online', label: 'Online Store' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setOrdersFilter(tab.id)}
                    style={{
                      padding: '5px 10px', borderRadius: 6, border: 'none',
                      fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                      background: ordersFilter === tab.id ? T.ink : '#f1f5f9',
                      color: ordersFilter === tab.id ? '#ffffff' : T.inkSoft,
                      transition: 'all 0.12s ease',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Invoices List Content */}
            {salesLoading ? (
              <div style={{ padding: '24px 20px' }}>
                {[...Array(5)].map((_, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <Skel w={140} h={16} />
                    <Skel w={100} h={14} />
                    <Skel w={80} h={16} />
                  </div>
                ))}
              </div>
            ) : displayOrders.length === 0 ? (
              <div style={{ padding: '56px 20px', textAlign: 'center' }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%', background: '#f1f5f9',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: T.inkSoft
                }}>
                  <IcoReceipt size={22} />
                </div>
                <p style={{ fontSize: 15, fontWeight: 700, color: T.ink, margin: '0 0 6px' }}>No invoices recorded today</p>
                <p style={{ fontSize: 13, color: T.inkSoft, margin: '0 0 16px' }}>Completed POS sales and web orders will appear here automatically.</p>
                <Link
                  to="/sale"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: T.accent, color: '#ffffff', padding: '8px 16px', borderRadius: 6,
                    textDecoration: 'none', fontSize: 13, fontWeight: 700
                  }}
                >
                  <IcoPlus size={14} />
                  Open POS Terminal
                </Link>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#fafbfc', borderBottom: `1px solid ${T.line}` }}>
                      <th style={{ padding: '10px 20px', fontSize: 11, fontWeight: 700, color: T.inkFaint, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Invoice #</th>
                      <th style={{ padding: '10px 20px', fontSize: 11, fontWeight: 700, color: T.inkFaint, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Customer</th>
                      <th style={{ padding: '10px 20px', fontSize: 11, fontWeight: 700, color: T.inkFaint, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Items</th>
                      <th style={{ padding: '10px 20px', fontSize: 11, fontWeight: 700, color: T.inkFaint, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Payment & Status</th>
                      <th style={{ padding: '10px 20px', fontSize: 11, fontWeight: 700, color: T.inkFaint, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Time</th>
                      <th style={{ padding: '10px 20px', fontSize: 11, fontWeight: 700, color: T.inkFaint, letterSpacing: '0.05em', textTransform: 'uppercase', textAlign: 'right' }}>Total</th>
                      <th style={{ padding: '10px 20px', fontSize: 11, fontWeight: 700, color: T.inkFaint, letterSpacing: '0.05em', textTransform: 'uppercase', textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayOrders.map((order) => {
                      const channel = getOrderChannel(order);
                      const isInStore = channel === 'in-store';
                      const isSelected = selectedOrder?.id === order.id;
                      const customerName = `${order.billing?.first_name || ''} ${order.billing?.last_name || ''}`.trim() || 'Walk-in Customer';
                      const itemsCount = (order.line_items || []).reduce((acc, item) => acc + (item.quantity || 1), 0);

                      return (
                        <tr
                          key={order.id}
                          onClick={() => setSelectedOrder(order)}
                          style={{
                            borderBottom: `1px solid ${T.lineSoft}`,
                            background: isSelected ? '#f0fdf4' : 'transparent',
                            cursor: 'pointer',
                            transition: 'background 0.12s ease',
                          }}
                          onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#f8fafc'; }}
                          onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                        >
                          {/* Invoice # & Channel */}
                          <td style={{ padding: '14px 20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>
                                #{order.id}
                              </span>
                              <span style={{
                                fontSize: 10.5, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                                background: isInStore ? '#ecfdf5' : '#eff6ff',
                                color: isInStore ? '#065f46' : '#1e40af', textTransform: 'uppercase'
                              }}>
                                {isInStore ? 'POS' : 'Web'}
                              </span>
                            </div>
                          </td>

                          {/* Customer Name & Phone */}
                          <td style={{ padding: '14px 20px' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>
                              {customerName}
                            </div>
                            {order.billing?.phone && (
                              <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 2 }}>
                                {order.billing.phone}
                              </div>
                            )}
                          </td>

                          {/* Line items summary */}
                          <td style={{ padding: '14px 20px' }}>
                            <span style={{
                              fontSize: 12, fontWeight: 600, color: T.inkSoft,
                              background: '#f1f5f9', padding: '3px 7px', borderRadius: 4
                            }}>
                              {itemsCount} {itemsCount === 1 ? 'item' : 'items'}
                            </span>
                          </td>

                          {/* Payment method & Status */}
                          <td style={{ padding: '14px 20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{
                                width: 6, height: 6, borderRadius: '50%',
                                background: order.status === 'completed' ? T.accent : T.warn
                              }} />
                              <span style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>
                                {order.payment_method_title || order.payment_method || 'Cash'}
                              </span>
                              <span style={{
                                fontSize: 11, color: T.inkFaint, textTransform: 'capitalize'
                              }}>
                                ({order.status})
                              </span>
                            </div>
                          </td>

                          {/* Timestamp */}
                          <td style={{ padding: '14px 20px', fontSize: 12, color: T.inkSoft }}>
                            {order.date_created || order.date_created_gmt ? fmtTime(order) : '—'}
                          </td>

                          {/* Total */}
                          <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                            <span style={{
                              fontFamily: T.mono, fontSize: 14.5, fontWeight: 700, color: T.ink,
                              fontVariantNumeric: 'tabular-nums'
                            }}>
                              {formatPkr(order.total)}
                            </span>
                          </td>

                          {/* Action */}
                          <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setReceiptOrder(order);
                                setIsReceiptOpen(true);
                              }}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 6,
                                padding: '5px 10px', fontSize: 11.5, fontWeight: 600, color: T.ink,
                                cursor: 'pointer'
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = '#e2e8f0'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = '#f1f5f9'; }}
                            >
                              <IcoPrinter size={12} />
                              Receipt
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      </div>

      {/* ── Interactive Order Slide-Over Drawer ──────────────── */}
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
                  {selectedOrder.date_created || selectedOrder.date_created_gmt ? `${fmtDate(selectedOrder)} at ${fmtTime(selectedOrder)}` : '—'}
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
