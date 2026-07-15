import React, { useState, useMemo } from 'react';
import Barcode from 'react-barcode';
import { usePosStore } from '../store/usePosStore';
import { generateStoreEAN13 } from '../utils/barcodeUtils';
import { updateProductSKUs, fetchVariations } from '../api/wc-client';

const Svg = ({ children, size = 16, strokeWidth = '1.6' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', flexShrink: 0 }}>{children}</svg>
);
const IcoX = ({ s = 14 }) => <Svg size={s}><path d="M18 6 6 18M6 6l12 12" /></Svg>;
const IcoSearch = ({ s }) => <Svg size={s}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></Svg>;
const IcoTrash = ({ s = 14 }) => <Svg size={s}><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></Svg>;
const IcoWand = ({ s = 14 }) => <Svg size={s}><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/></Svg>;
const IcoPrint = ({ s = 14 }) => <Svg size={s}><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></Svg>;
const IcoLoader = ({ s = 14 }) => <div style={{ width: s, height: s, border: '2px solid transparent', borderTopColor: 'currentColor', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }}><style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style></div>;

const T = {
  bg: '#000000', surface: '#0f172a', surfaceHover: '#1e293b', line: '#334155',
  ink: '#f8fafc', inkSoft: '#94a3b8', accent: '#10b981', danger: '#ef4444', sans: 'Inter, system-ui, sans-serif',
};

const extractProductSearchTokens = (product) => {
  const metaValues = Array.isArray(product?.meta_data) ? product.meta_data.flatMap((e) => [e?.key, e?.value]) : [];
  return [product?.name, product?.sku, product?.global_unique_id, product?.barcode, ...metaValues]
    .filter(Boolean).map(v => String(v || '').trim().toLowerCase().replace(/\s+/g, ''));
};

const isVariableProduct = (product) => product?.type === 'variable';

export default function BarcodeGeneratorModal({ onClose }) {
  const products = usePosStore((state) => state.products);
  const [searchTerm, setSearchTerm] = useState('');
  const [queue, setQueue] = useState([]); // [{ key, product, variation, qty, sku, generating: false }]
  const [isGeneratingBulk, setIsGeneratingBulk] = useState(false);
  const [fetchingVarsId, setFetchingVarsId] = useState(null);

  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const term = String(searchTerm).trim().toLowerCase().replace(/\s+/g, '');
    return products.filter((p) => extractProductSearchTokens(p).some((t) => t.includes(term))).slice(0, 20);
  }, [products, searchTerm]);

  const addToQueue = async (product) => {
    if (isVariableProduct(product)) {
      setFetchingVarsId(product.id);
      try {
        const vars = await fetchVariations(product.id);
        const newItems = vars.map(v => {
          const key = `${product.id}-${v.id}`;
          return { key, product, variation: v, qty: 1, sku: v.sku || '' };
        }).filter(item => !queue.find(q => q.key === item.key));
        setQueue(prev => [...prev, ...newItems]);
      } catch (err) {
        alert('Failed to load variations for ' + product.name);
      } finally {
        setFetchingVarsId(null);
      }
    } else {
      const key = `${product.id}-base`;
      if (queue.find(q => q.key === key)) return;
      setQueue(prev => [...prev, { key, product, variation: null, qty: 1, sku: product.sku || '' }]);
    }
    setSearchTerm('');
  };

  const removeFromQueue = (key) => setQueue(q => q.filter(item => item.key !== key));
  const updateQty = (key, qty) => setQueue(q => q.map(item => item.key === key ? { ...item, qty: Math.max(1, qty) } : item));

  const generateSingleSKU = async (item) => {
    const newSku = generateStoreEAN13(item.product.id, item.variation?.id);
    setQueue(q => q.map(it => it.key === item.key ? { ...it, sku: newSku, generating: true } : it));
    
    try {
      await updateProductSKUs([{ productId: item.product.id, variationId: item.variation?.id, sku: newSku }]);
      
      // Optimistically update the global store cache
      const updatedProducts = products.map(p => {
        if (p.id === item.product.id && !item.variation) return { ...p, sku: newSku };
        return p;
      });
      usePosStore.setState({ products: updatedProducts });
      
      setQueue(q => q.map(it => it.key === item.key ? { ...it, generating: false } : it));
    } catch (err) {
      alert('Failed to save SKU. It will not scan correctly until fixed.');
      setQueue(q => q.map(it => it.key === item.key ? { ...it, sku: '', generating: false } : it));
    }
  };

  const generateMissingSKUs = async () => {
    const missing = queue.filter(q => !q.sku);
    if (missing.length === 0) return;
    setIsGeneratingBulk(true);

    const updates = missing.map(item => ({ ...item, newSku: generateStoreEAN13(item.product.id, item.variation?.id) }));
    setQueue(q => q.map(item => {
      const update = updates.find(u => u.key === item.key);
      return update ? { ...item, sku: update.newSku } : item;
    }));

    try {
      await updateProductSKUs(updates.map(u => ({ productId: u.product.id, variationId: u.variation?.id, sku: u.newSku })));
      
      let updatedProducts = [...products];
      updates.forEach(u => {
        updatedProducts = updatedProducts.map(p => (p.id === u.product.id && !u.variation) ? { ...p, sku: u.newSku } : p);
      });
      usePosStore.setState({ products: updatedProducts });
    } catch (err) {
      alert('Failed to bulk save SKUs. Some barcodes may not scan properly until fixed.');
    } finally {
      setIsGeneratingBulk(false);
    }
  };

  const printItems = queue.flatMap(q => Array(q.qty).fill(q));

  return (
    <div className="barcode-modal-overlay" style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)'
    }}>
      <div className="no-print" style={{
        background: T.bg, width: '100%', maxWidth: 900, height: '85vh', borderRadius: 16,
        border: `1px solid ${T.line}`, display: 'flex', flexDirection: 'column', overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${T.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0, color: T.ink, fontSize: 18, fontWeight: 700 }}>Print Barcode Labels</h2>
            <p style={{ margin: '4px 0 0', color: T.inkSoft, fontSize: 13 }}>Queue products and automatically map sizes to standard EAN-13 barcodes.</p>
          </div>
          <button onClick={onClose} style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.inkSoft, width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <IcoX />
          </button>
        </div>

        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* Left: Search */}
          <div style={{ width: 320, borderRight: `1px solid ${T.line}`, display: 'flex', flexDirection: 'column', background: T.surface }}>
            <div style={{ padding: 16, borderBottom: `1px solid ${T.line}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: T.bg, border: `1px solid ${T.line}`, borderRadius: 8, padding: '0 12px' }}>
                <div style={{ color: T.inkSoft }}><IcoSearch s={14} /></div>
                <input
                  type="text" placeholder="Search catalog..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  style={{ background: 'transparent', border: 'none', color: T.ink, padding: '12px 0', outline: 'none', flex: 1, fontSize: 14 }}
                  autoFocus
                />
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
              {filteredProducts.map(p => (
                <div key={p.id} onClick={() => fetchingVarsId !== p.id && addToQueue(p)} style={{
                  padding: 12, background: T.bg, border: `1px solid ${T.line}`, borderRadius: 8, marginBottom: 8, cursor: fetchingVarsId === p.id ? 'wait' : 'pointer'
                }}>
                  <div style={{ color: T.ink, fontSize: 14, fontWeight: 500, display: 'flex', justifyContent: 'space-between' }}>
                    {p.name}
                    {fetchingVarsId === p.id && <IcoLoader s={14} />}
                  </div>
                  <div style={{ color: T.inkSoft, fontSize: 12, marginTop: 4 }}>
                    {isVariableProduct(p) ? `Variable Product` : (p.sku || 'No SKU')}
                  </div>
                </div>
              ))}
              {searchTerm && filteredProducts.length === 0 && <div style={{ color: T.inkSoft, textAlign: 'center', padding: 20, fontSize: 13 }}>No matches found.</div>}
            </div>
          </div>

          {/* Right: Queue */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: T.bg }}>
            <div style={{ padding: '16px 24px', borderBottom: `1px solid ${T.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: T.ink, fontSize: 15, fontWeight: 600 }}>Print Queue ({queue.length})</h3>
              <div style={{ display: 'flex', gap: 10 }}>
                {queue.some(q => !q.sku) && (
                  <button onClick={generateMissingSKUs} disabled={isGeneratingBulk} style={{
                    display: 'flex', alignItems: 'center', gap: 6, background: T.surface, border: `1px solid ${T.line}`, color: T.ink, padding: '8px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 500
                  }}>
                    {isGeneratingBulk ? <IcoLoader s={14} /> : <IcoWand />} {isGeneratingBulk ? 'Generating...' : 'Auto-Generate SKUs'}
                  </button>
                )}
                <button onClick={() => window.print()} disabled={queue.length === 0 || queue.some(q => !q.sku)} style={{
                  display: 'flex', alignItems: 'center', gap: 6, background: queue.length > 0 && !queue.some(q => !q.sku) ? T.accent : T.surface, border: 'none', color: '#fff', padding: '8px 16px', borderRadius: 6, fontSize: 13, cursor: queue.length > 0 && !queue.some(q => !q.sku) ? 'pointer' : 'not-allowed', fontWeight: 600
                }}>
                  <IcoPrint /> Print {printItems.length} Labels
                </button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
              {queue.length === 0 ? (
                <div style={{ textAlign: 'center', color: T.inkSoft, marginTop: 100 }}>
                  <IcoPrint s={32} />
                  <p style={{ marginTop: 12 }}>Search and click products to add them to the print queue.</p>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${T.line}`, color: T.inkSoft, fontSize: 12 }}>
                      <th style={{ padding: '0 0 12px 0', fontWeight: 500 }}>Product Name</th>
                      <th style={{ padding: '0 0 12px 0', fontWeight: 500 }}>EAN-13 Barcode</th>
                      <th style={{ padding: '0 0 12px 0', fontWeight: 500, width: 80 }}>Labels</th>
                      <th style={{ padding: '0 0 12px 0', fontWeight: 500, width: 40 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {queue.map(q => {
                      const title = q.variation ? `${q.product.name} (${q.variation.attributes.map(a => a.option).join(', ')})` : q.product.name;
                      return (
                        <tr key={q.key} style={{ borderBottom: `1px solid ${T.line}` }}>
                          <td style={{ padding: '16px 0', color: T.ink, fontSize: 14 }}>{title}</td>
                          <td style={{ padding: '16px 0' }}>
                            {q.sku ? (
                              <span style={{ fontFamily: 'monospace', color: T.accent, fontSize: 14, letterSpacing: '0.05em' }}>{q.sku}</span>
                            ) : (
                              <button onClick={() => generateSingleSKU(q)} disabled={q.generating} style={{
                                background: T.surface, border: `1px solid ${T.line}`, color: T.ink, padding: '4px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer'
                              }}>
                                {q.generating ? '...' : 'Generate SKU'}
                              </button>
                            )}
                          </td>
                          <td style={{ padding: '16px 0' }}>
                            <input type="number" min="1" value={q.qty} onChange={e => updateQty(q.key, parseInt(e.target.value) || 1)} style={{ width: 50, background: T.surface, border: `1px solid ${T.line}`, color: T.ink, padding: '6px', borderRadius: 4, textAlign: 'center', outline: 'none' }} />
                          </td>
                          <td style={{ padding: '16px 0', textAlign: 'right' }}>
                            <button onClick={() => removeFromQueue(q.key)} style={{ background: 'transparent', border: 'none', color: T.inkSoft, cursor: 'pointer', padding: 4 }}><IcoTrash /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* The actual print layout (only visible when printing) */}
      <div className="print-only" style={{ display: 'none' }}>
        {printItems.map((item, idx) => {
          const title = item.variation ? `${item.product.name} - ${item.variation.attributes.map(a => a.option).join(', ')}` : item.product.name;
          const price = item.variation ? item.variation.price : item.product.price;
          return (
            <div key={idx} style={{ 
              width: '2in', height: '1.25in', boxSizing: 'border-box', padding: '0.1in',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              pageBreakAfter: 'always', overflow: 'hidden', background: '#fff', color: '#000'
            }}>
              <div style={{ fontSize: '10pt', fontWeight: 'bold', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', marginBottom: 4 }}>
                {title}
              </div>
              <Barcode value={item.sku} format="CODE128" width={1.5} height={40} fontSize={10} background="#ffffff" lineColor="#000000" margin={0} />
              <div style={{ fontSize: '10pt', fontWeight: 'bold', marginTop: 4 }}>
                PKR {Number(price).toLocaleString()}
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .no-print { display: none !important; }
          .print-only, .print-only * { visibility: visible; }
          .print-only { display: block !important; position: absolute; left: 0; top: 0; width: 2in; }
          @page { size: 2in 1.25in; margin: 0; }
        }
      `}</style>
    </div>
  );
}
