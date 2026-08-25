import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { fetchProducts, fetchTodaysSales, POS_ORDER_CREATED_EVENT } from '../api/wc-client';
import { usePosStore } from '../store/usePosStore';
import Layout from '../components/Layout';
import BarcodeGeneratorModal from '../components/BarcodeGeneratorModal';

/* ─── Design tokens ────────────────────────────────────────── */
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

/* ─── Shimmer keyframes ─────────────────────────────────────── */
const ShimmerStyle = () => (
  <style>{`
    @keyframes posShimmer {
      0% { background-position: -300px 0; }
      100% { background-position: 300px 0; }
    }
    .pos-skel {
      background: linear-gradient(90deg, #f1f5f9 25%, #f8fafc 37%, #f1f5f9 63%);
      background-size: 600px 100%;
      animation: posShimmer 1.6s ease-in-out infinite;
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

/* ─── Ledger strip ─────────────────────────────────────────── */
const LedgerSegment = ({ label, value, sub, tone = 'default', loading, last }) => {
  const toneColor = {
    default: T.ink,
    accent: T.accent,
    warn: T.warn,
    danger: T.danger,
  }[tone];

  return (
    <div style={{
      flex: '1 1 0',
      minWidth: 180,
      padding: '22px 28px',
      borderRight: last ? 'none' : `1px solid ${T.line}`,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <span style={{
        fontSize: 10.5, fontWeight: 700, color: T.inkSoft,
        textTransform: 'uppercase', letterSpacing: '0.09em',
      }}>
        {label}
      </span>
      {loading ? (
        <>
          <Skel w="72%" h={30} />
          <Skel w="45%" h={12} />
        </>
      ) : (
        <>
          <span style={{
            fontFamily: T.mono, fontSize: 30, fontWeight: 700, color: toneColor,
            letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums',
          }}>
            {value}
          </span>
          <span style={{ fontSize: 12.5, color: T.inkFaint, fontWeight: 500 }}>{sub}</span>
        </>
      )}
    </div>
  );
};

/* ─── Panel wrapper ────────────────────────────────────────── */
const Panel = ({ children, style = {} }) => (
  <div style={{
    background: T.surface, border: `1px solid ${T.line}`, borderRadius: 10,
    boxShadow: '0 1px 2px rgba(15,23,42,0.04)', overflow: 'hidden', ...style,
  }}>
    {children}
  </div>
);

const PanelHead = ({ title, badge, action }) => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '18px 24px', borderBottom: `1px solid ${T.lineSoft}`,
  }}>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
      <span style={{ fontSize: 14.5, fontWeight: 700, color: T.ink, letterSpacing: '-0.01em' }}>
        {title}
      </span>
      {badge != null && (
        <span style={{ fontFamily: T.mono, fontSize: 12, fontWeight: 500, color: T.inkFaint }}>
          {badge}
        </span>
      )}
    </div>
    {action}
  </div>
);

/* ─── Status dot ───────────────────────────────────────────── */
const StatusDot = ({ label }) => {
  const color = { Out: T.danger, Low: T.warn, 'In stock': T.accent }[label] || T.accent;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, color: T.ink }}>
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

/* ─── Main PosDashboard ────────────────────────────────────── */
function PosDashboard() {
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
  const confirmedOrdersRef = useRef(new Map());

  const mergeOrders = useCallback((serverOrders = []) => {
    const orderMap = new Map();

    // 1. Add server orders
    serverOrders.forEach((order) => {
      if (order?.id) orderMap.set(order.id, order);
    });

    // 2. Add local posOrders from state/IDB
    posOrders.forEach((order) => {
      if (order?.id && !orderMap.has(order.id)) {
        orderMap.set(order.id, order);
      }
    });

    // 3. Add any recently broadcasted orders in confirmedOrdersRef
    confirmedOrdersRef.current.forEach((order, orderId) => {
      if (orderId && !orderMap.has(orderId)) {
        orderMap.set(orderId, order);
      }
    });

    // Reconcile POS store with server state
    reconcilePosOrders(serverOrders);

    const now = new Date();
    const todayYear = now.getFullYear();
    const todayMonth = now.getMonth();
    const todayDate = now.getDate();

    // Filter to today's orders
    const mergedList = Array.from(orderMap.values()).filter((order) => {
      const dateStr = order.date_created || order.date_created_gmt;
      if (!dateStr) return true; // keep recently created local orders if date pending
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
        // Initial Full Sync
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
        // Delta Sync for stock/products + fresh sales
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

  // Real-time listener & adaptive heartbeat polling
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
        setTodayOrders((currentOrders) => {
          const updated = [
            order,
            ...currentOrders.filter((currentOrder) => currentOrder.id !== order.id),
          ];
          return updated;
        });
        setDashboardError('');
      }

      // Quick background sync after POS sale
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

    // Adaptive polling: 25 seconds when tab is active
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

  const summary = useMemo(() => {
    const totalSales = todayOrders.reduce((s, o) => s + (Number.parseFloat(o.total) || 0), 0);
    const inStoreOrders = todayOrders.filter((o) => getOrderChannel(o) === 'in-store');
    const onlineOrders = todayOrders.filter((o) => getOrderChannel(o) === 'online');
    const inStoreSales = inStoreOrders.reduce((s, o) => s + (Number.parseFloat(o.total) || 0), 0);
    const onlineSales = onlineOrders.reduce((s, o) => s + (Number.parseFloat(o.total) || 0), 0);
    const outOfStock = products.filter((p) =>
      p.manage_stock ? Number.parseFloat(p.stock_quantity) <= 0 : p.stock_status === 'outofstock'
    ).length;
    const lowStock = products.filter((p) => {
      const q = Number.parseFloat(p.stock_quantity);
      return p.manage_stock && Number.isFinite(q) && q > 0 && q <= 5;
    }).length;
    return {
      totalSales,
      orderCount: todayOrders.length,
      inStoreOrderCount: inStoreOrders.length,
      onlineOrderCount: onlineOrders.length,
      inStoreSales,
      onlineSales,
      outOfStock,
      lowStock,
    };
  }, [products, todayOrders]);

  const topProducts = useMemo(() => {
    return [...products]
      .sort((a, b) => new Date(b.date_created || 0) - new Date(a.date_created || 0))
      .slice(0, 24);
  }, [products]);
  const stockTone = summary.outOfStock > 0 ? 'danger' : summary.lowStock > 0 ? 'warn' : 'accent';

  return (
    <Layout>
      <ShimmerStyle />
      <div style={{ fontFamily: T.sans, background: T.canvas, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <header style={{
          padding: '28px 32px 0 32px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: T.ink, letterSpacing: '-0.02em' }}>
              Dashboard
            </h1>
            <span style={{ width: 1, height: 16, background: T.line }} />
            <LiveClock />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={() => runLoad(true)}
              disabled={refreshing}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, margin: 0,
                background: T.surface, border: `1px solid ${T.line}`, borderRadius: 8, boxSizing: 'border-box',
                color: T.inkSoft, padding: '0 16px', height: 42, fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit',
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
                color: T.inkSoft, padding: '0 16px', height: 42, fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit',
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
                padding: '0 20px', height: 42, textDecoration: 'none', fontWeight: 700, fontSize: 13.5, fontFamily: 'inherit',
                letterSpacing: '-0.005em', transition: 'background 0.12s ease',
                appearance: 'none', WebkitAppearance: 'none',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#15803d'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = T.accent; }}
            >
              <IcoPlus size={15} />
              New sale
            </Link>
          </div>
        </header>

        {/* Body */}
        <div style={{ padding: '24px 32px 32px 32px', overflowY: 'auto', flex: 1 }}>

          {dashboardError && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: T.dangerSoft, border: `1px solid #fecaca`, borderRadius: 8,
              padding: '10px 16px', fontSize: 13, color: T.danger, marginBottom: 20, fontWeight: 500,
            }}>
              {dashboardError}
            </div>
          )}

          {/* Ledger strip */}
          <div style={{
            display: 'flex', flexWrap: 'wrap',
            background: T.surface, border: `1px solid ${T.line}`, borderRadius: 10,
            boxShadow: '0 1px 2px rgba(15,23,42,0.04)', marginBottom: 24,
          }}>
            <LedgerSegment
              label="Revenue today"
              value={salesLoading ? '' : formatPkr(summary.totalSales)}
              sub={`${summary.orderCount} orders`}
              tone="default"
              loading={salesLoading}
            />
            <LedgerSegment
              label="In-store"
              value={salesLoading ? '' : formatPkr(summary.inStoreSales)}
              sub={`${summary.inStoreOrderCount} POS`}
              tone="accent"
              loading={salesLoading}
            />
            <LedgerSegment
              label="Online"
              value={salesLoading ? '' : formatPkr(summary.onlineSales)}
              sub={`${summary.onlineOrderCount} web`}
              tone="default"
              loading={salesLoading}
            />
            <LedgerSegment
              label="Stock alerts"
              value={products.length === 0 ? '' : String(summary.lowStock + summary.outOfStock)}
              sub={products.length === 0 ? '' : `${summary.outOfStock} out · ${summary.lowStock} low`}
              tone={stockTone}
              loading={products.length === 0}
              last
            />
          </div>

          {/* Data panels */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20, alignItems: 'start' }}>

            {/* Inventory */}
            <Panel>
              <PanelHead
                title="Inventory"
                badge={products.length === 0 ? null : `${products.length} items`}
                action={products.length > 0 ? <span style={{ fontSize: 12, color: T.inkSoft, fontWeight: 500 }}>Showing recent {topProducts.length}</span> : null}
              />

              <div style={{
                display: 'grid', gridTemplateColumns: '1.6fr 150px 90px 110px',
                padding: '10px 24px', borderBottom: `1px solid ${T.line}`,
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

              {products.length === 0 ? (
                <div style={{ padding: '4px 24px' }}>
                  {[...Array(6)].map((_, i) => (
                    <div key={i} style={{
                      display: 'grid', gridTemplateColumns: '1.6fr 150px 90px 110px', alignItems: 'center',
                      padding: '14px 0', borderBottom: i < 5 ? `1px solid ${T.lineSoft}` : 'none', gap: 8,
                    }}>
                      <Skel w="70%" h={13} />
                      <Skel w="60%" h={12} />
                      <Skel w={50} h={12} style={{ margin: '0 auto' }} />
                      <Skel w="60%" h={13} style={{ marginLeft: 'auto' }} />
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                  {topProducts.map((p) => {
                    const q = Number.parseFloat(p.stock_quantity);
                    const label = p.manage_stock
                      ? q <= 0 ? 'Out' : q <= 5 ? 'Low' : 'In stock'
                      : p.stock_status === 'outofstock' ? 'Out' : 'In stock';

                    return (
                      <div
                        key={p.id}
                        style={{
                          display: 'grid', gridTemplateColumns: '1.6fr 150px 90px 110px', alignItems: 'center',
                          padding: '13px 24px', borderBottom: `1px solid ${T.lineSoft}`,
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = T.canvas; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <div style={{ minWidth: 0, paddingRight: 12 }}>
                          <div style={{
                            fontSize: 13.5, fontWeight: 600, color: T.ink,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>
                            {p.name}
                          </div>
                          <div style={{ fontFamily: T.mono, fontSize: 11, color: T.inkFaint, marginTop: 2 }}>
                            {p.sku || '—'}
                          </div>
                        </div>
                        <div style={{ fontSize: 12, color: T.inkSoft, fontWeight: 500, lineHeight: 1.4 }}>
                          {p.date_created ? (
                            <>
                              <div style={{ color: T.ink }}>{fmtDate(new Date(p.date_created))}</div>
                              <div style={{ fontSize: 11, color: T.inkFaint }}>{fmtTime(new Date(p.date_created))}</div>
                            </>
                          ) : '—'}
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <StatusDot label={label} />
                        </div>
                        <div style={{
                          textAlign: 'right', fontFamily: T.mono, fontSize: 13.5, fontWeight: 700,
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

            {/* Recent orders */}
            <Panel>
              <PanelHead title="Recent In-Store Sale" badge={!salesLoading && todayOrders.length > 0 ? `${todayOrders.length} today` : null} />

              {salesLoading ? (
                <div style={{ padding: '4px 24px' }}>
                  {[...Array(5)].map((_, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '15px 0', borderBottom: i < 4 ? `1px solid ${T.lineSoft}` : 'none',
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <Skel w={90} h={13} />
                        <Skel w={60} h={11} />
                      </div>
                      <Skel w={70} h={14} />
                    </div>
                  ))}
                </div>
              ) : todayOrders.length === 0 ? (
                <div style={{ padding: '56px 24px', textAlign: 'center' }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: T.ink, margin: '0 0 4px' }}>No sales yet</p>
                  <p style={{ fontSize: 12.5, color: T.inkSoft, margin: 0 }}>New orders will appear here instantly.</p>
                </div>
              ) : (
                <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                  {todayOrders.slice(0, 10).map((order) => {
                    const channel = getOrderChannel(order);
                    const isInStore = channel === 'in-store';

                    return (
                      <div
                        key={order.id}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '13px 24px', borderLeft: `3px solid ${isInStore ? T.accent : T.line}`,
                          borderBottom: `1px solid ${T.lineSoft}`,
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = T.canvas; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <div>
                          <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>
                            Order #{order.id}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: T.inkSoft, marginTop: 2 }}>
                            <span style={{
                              textTransform: 'capitalize', fontWeight: 600,
                              color: order.status === 'completed' ? T.accent : T.warn,
                            }}>
                              {order.status}
                            </span>
                            <span style={{ color: T.inkFaint }}>·</span>
                            <span>{isInStore ? 'POS' : 'Online'}</span>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{
                            fontFamily: T.mono, fontSize: 14, fontWeight: 700, color: T.ink,
                            fontVariantNumeric: 'tabular-nums',
                          }}>
                            {formatPkr(order.total)}
                          </div>
                          {order.date_created && (
                            <div style={{ fontSize: 11, color: T.inkFaint, marginTop: 2 }}>
                              {fmtDate(new Date(order.date_created))} · {fmtTime(new Date(order.date_created))}
                            </div>
                          )}
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

      {showBarcodeModal && (
        <BarcodeGeneratorModal onClose={() => setShowBarcodeModal(false)} />
      )}
    </Layout>
  );
}

export default PosDashboard;
