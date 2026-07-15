import React, { useState, useMemo, useEffect } from 'react';
import Barcode from 'react-barcode';
import { usePosStore } from '../store/usePosStore';
import { generateStoreEAN13 } from '../utils/barcodeUtils';
import { updateProductSKUs, fetchVariations } from '../api/wc-client';

const Svg = ({ children, size = 16, strokeWidth = '1.6' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', flexShrink: 0 }}>{children}</svg>
);
const IcoX = ({ s = 14 }) => <Svg size={s}><path d="M18 6 6 18M6 6l12 12" /></Svg>;
const IcoSearch = ({ s }) => <Svg size={s}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></Svg>;
const IcoWand = ({ s = 14 }) => <Svg size={s}><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/></Svg>;
const IcoPrint = ({ s = 14 }) => <Svg size={s}><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></Svg>;
const IcoFolder = ({ s = 14 }) => <Svg size={s}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></Svg>;
const IcoCheck = ({ s = 14 }) => <Svg size={s}><polyline points="20 6 9 17 4 12" /></Svg>;
const IcoLoader = ({ s = 14 }) => <div style={{ width: s, height: s, border: '2px solid transparent', borderTopColor: 'currentColor', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }}><style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style></div>;

const T = {
  bg: '#000000', surface: '#0f172a', surfaceHover: '#1e293b', line: '#334155', lineSoft: '#1e293b',
  ink: '#f8fafc', inkSoft: '#94a3b8', accent: '#10b981', accentSoft: '#047857', danger: '#ef4444', sans: 'Inter, system-ui, sans-serif',
};

const isVariableProduct = (product) => product?.type === 'variable';

export default function BarcodeGeneratorModal({ onClose }) {
  const products = usePosStore((state) => state.products);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCatId, setSelectedCatId] = useState('all');
  const [activeTab, setActiveTab] = useState('missing'); // 'missing' | 'ready'
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 30;
  
  const [loadedVariations, setLoadedVariations] = useState({});
  const [isGeneratingBulk, setIsGeneratingBulk] = useState(false);
  const [generationProgress, setGenerationProgress] = useState('');
  
  const [selectedMissing, setSelectedMissing] = useState(new Set());
  const [selectedReady, setSelectedReady] = useState(new Set());
  const [printQty, setPrintQty] = useState({});

  const categories = useMemo(() => {
    const catMap = new Map();
    products.forEach(p => {
      if (p.categories && Array.isArray(p.categories)) {
        p.categories.forEach(c => {
          if (!catMap.has(c.id)) {
            catMap.set(c.id, { id: c.id, name: c.name, count: 0 });
          }
          catMap.get(c.id).count += 1;
        });
      }
    });
    return Array.from(catMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

  const [loadingCategoryVars, setLoadingCategoryVars] = useState(false);
  
  const visibleBaseProducts = useMemo(() => {
    let filtered = products;
    if (selectedCatId !== 'all') {
      filtered = filtered.filter(p => p.categories?.some(c => c.id === selectedCatId));
    }
    if (searchTerm.trim()) {
      const term = String(searchTerm).trim().toLowerCase();
      filtered = filtered.filter(p => p.name.toLowerCase().includes(term) || (p.sku && p.sku.toLowerCase().includes(term)));
    }
    return filtered;
  }, [products, selectedCatId, searchTerm]);

  // Reset page on filter change
  useEffect(() => {
    setPage(1);
  }, [selectedCatId, searchTerm, activeTab]);

  const paginatedBaseProducts = useMemo(() => {
    return visibleBaseProducts.slice(0, page * ITEMS_PER_PAGE);
  }, [visibleBaseProducts, page]);

  useEffect(() => {
    let isMounted = true;
    const loadVars = async () => {
      const variableProducts = paginatedBaseProducts.filter(p => isVariableProduct(p) && !loadedVariations[p.id]);
      if (variableProducts.length === 0) return;
      
      setLoadingCategoryVars(true);
      const CONCURRENCY = 4;
      let i = 0;
      
      while (i < variableProducts.length) {
        if (!isMounted) break;
        const chunk = variableProducts.slice(i, i + CONCURRENCY);
        const promises = chunk.map(p => fetchVariations(p.id).then(vars => ({ id: p.id, vars })).catch(() => ({ id: p.id, vars: [] })));
        const results = await Promise.all(promises);
        
        if (isMounted) {
          setLoadedVariations(prev => {
            const next = { ...prev };
            results.forEach(r => next[r.id] = r.vars);
            return next;
          });
        }
        i += CONCURRENCY;
      }
      if (isMounted) setLoadingCategoryVars(false);
    };
    loadVars();
    return () => { isMounted = false; };
  }, [visibleBaseProducts, loadedVariations]);

  const flattenedItems = useMemo(() => {
    const items = [];
    visibleBaseProducts.forEach(p => {
      if (isVariableProduct(p)) {
        const vars = loadedVariations[p.id];
        if (vars) {
          vars.forEach(v => {
            items.push({
              key: `${p.id}-${v.id}`, product: p, variation: v,
              name: `${p.name} (${v.attributes.map(a => a.option).join(', ')})`,
              sku: v.sku || '', hasSku: !!v.sku, price: v.price || p.price
            });
          });
        } else {
          items.push({
            key: `${p.id}-loading`, product: p, variation: null,
            name: `${p.name} (Loading sizes...)`, sku: '', hasSku: false, isLoading: true
          });
        }
      } else {
        items.push({
          key: `${p.id}-base`, product: p, variation: null,
          name: p.name, sku: p.sku || '', hasSku: !!p.sku, isLoading: false, price: p.price
        });
      }
    });
    return items;
  }, [paginatedBaseProducts, loadedVariations]);

  const missingItems = useMemo(() => flattenedItems.filter(i => !i.hasSku), [flattenedItems]);
  const readyItems = useMemo(() => flattenedItems.filter(i => i.hasSku), [flattenedItems]);

  const toggleSelectMissing = (key) => {
    const next = new Set(selectedMissing);
    if (next.has(key)) next.delete(key); else next.add(key);
    setSelectedMissing(next);
  };
  
  const toggleSelectAllMissing = () => {
    if (selectedMissing.size === missingItems.filter(i => !i.isLoading).length && selectedMissing.size > 0) {
      setSelectedMissing(new Set());
    } else {
      setSelectedMissing(new Set(missingItems.filter(i => !i.isLoading).map(i => i.key)));
    }
  };

  const toggleSelectReady = (key) => {
    const next = new Set(selectedReady);
    if (next.has(key)) next.delete(key); else next.add(key);
    setSelectedReady(next);
  };

  const toggleSelectAllReady = () => {
    if (selectedReady.size === readyItems.length && selectedReady.size > 0) {
      setSelectedReady(new Set());
    } else {
      setSelectedReady(new Set(readyItems.map(i => i.key)));
    }
  };

  const updatePrintQty = (key, val) => {
    const num = parseInt(val) || 1;
    setPrintQty(prev => ({ ...prev, [key]: Math.max(1, num) }));
  };

  const handleGenerateSelected = async () => {
    if (selectedMissing.size === 0) return;
    setIsGeneratingBulk(true);
    
    const itemsToGenerate = missingItems.filter(i => selectedMissing.has(i.key));
    const updates = itemsToGenerate.map(item => ({
      productId: item.product.id,
      variationId: item.variation?.id,
      sku: generateStoreEAN13(item.product.id, item.variation?.id)
    }));

    try {
      const CHUNK = 5;
      for (let i = 0; i < updates.length; i += CHUNK) {
        setGenerationProgress(`Saving ${i+1} to ${Math.min(i+CHUNK, updates.length)} of ${updates.length}...`);
        await updateProductSKUs(updates.slice(i, i + CHUNK));
      }
      
      let updatedProducts = [...products];
      let updatedLoadedVars = { ...loadedVariations };
      
      updates.forEach(u => {
        if (u.variationId) {
          const vars = updatedLoadedVars[u.productId] || [];
          updatedLoadedVars[u.productId] = vars.map(v => v.id === u.variationId ? { ...v, sku: u.sku } : v);
        } else {
          updatedProducts = updatedProducts.map(p => p.id === u.productId ? { ...p, sku: u.sku } : p);
        }
      });
      
      usePosStore.setState({ products: updatedProducts });
      setLoadedVariations(updatedLoadedVars);
      setSelectedMissing(new Set());
    } catch (err) {
      alert('Failed to batch save SKUs. Some may have failed.');
    } finally {
      setIsGeneratingBulk(false);
      setGenerationProgress('');
    }
  };

  const handlePrint = () => window.print();

  const itemsToPrint = readyItems.filter(i => selectedReady.has(i.key)).flatMap(i => {
    const qty = printQty[i.key] || 1;
    return Array(qty).fill(i);
  });

  const Checkbox = ({ checked, onChange }) => (
    <div onClick={onChange} style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${checked ? T.accent : T.line}`, background: checked ? T.accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
      {checked && <IcoCheck s={12} />}
    </div>
  );

  return (
    <div className="barcode-modal-overlay" style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)'
    }}>
      <div className="no-print" style={{
        background: T.bg, width: '100%', maxWidth: 1000, height: '85vh', borderRadius: 16,
        border: `1px solid ${T.line}`, display: 'flex', flexDirection: 'column', overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${T.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0, color: T.ink, fontSize: 18, fontWeight: 700 }}>Barcode Studio</h2>
            <p style={{ margin: '4px 0 0', color: T.inkSoft, fontSize: 13 }}>Generate and print EAN-13 barcodes for your entire catalog efficiently.</p>
          </div>
          <button onClick={onClose} style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.inkSoft, width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <IcoX />
          </button>
        </div>

        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* Left Sidebar: Categories */}
          <div style={{ width: 280, borderRight: `1px solid ${T.line}`, display: 'flex', flexDirection: 'column', background: T.surface }}>
            <div style={{ padding: 16, borderBottom: `1px solid ${T.line}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: T.bg, border: `1px solid ${T.line}`, borderRadius: 8, padding: '0 12px' }}>
                <div style={{ color: T.inkSoft }}><IcoSearch s={14} /></div>
                <input
                  type="text" placeholder="Search products..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  style={{ background: 'transparent', border: 'none', color: T.ink, padding: '12px 0', outline: 'none', flex: 1, fontSize: 13 }}
                />
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.inkSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, paddingLeft: 8 }}>Categories</div>
              <div
                onClick={() => setSelectedCatId('all')}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 8, cursor: 'pointer', background: selectedCatId === 'all' ? T.surfaceHover : 'transparent', color: selectedCatId === 'all' ? T.ink : T.inkSoft }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 500 }}><IcoFolder s={14} /> All Products</div>
                <div style={{ background: T.lineSoft, color: T.inkSoft, fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 12 }}>{products.length}</div>
              </div>
              {categories.map(c => (
                <div
                  key={c.id}
                  onClick={() => setSelectedCatId(c.id)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 8, cursor: 'pointer', background: selectedCatId === c.id ? T.surfaceHover : 'transparent', color: selectedCatId === c.id ? T.ink : T.inkSoft, marginTop: 4 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 500 }}><IcoFolder s={14} /> {c.name}</div>
                  <div style={{ background: T.lineSoft, color: T.inkSoft, fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 12 }}>{c.count}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Main Area */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: T.bg }}>
            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: `1px solid ${T.line}`, background: T.surface }}>
              <div onClick={() => setActiveTab('missing')} style={{ flex: 1, padding: 16, textAlign: 'center', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: activeTab === 'missing' ? T.ink : T.inkSoft, borderBottom: activeTab === 'missing' ? `2px solid ${T.accent}` : '2px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                Needs Barcode <span style={{ background: T.line, padding: '2px 8px', borderRadius: 12, fontSize: 11 }}>{missingItems.length}</span>
              </div>
              <div onClick={() => setActiveTab('ready')} style={{ flex: 1, padding: 16, textAlign: 'center', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: activeTab === 'ready' ? T.ink : T.inkSoft, borderBottom: activeTab === 'ready' ? `2px solid ${T.accent}` : '2px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                Ready to Print <span style={{ background: T.line, padding: '2px 8px', borderRadius: 12, fontSize: 11 }}>{readyItems.length}</span>
              </div>
            </div>

            {/* Toolbar */}
            <div style={{ padding: '16px 24px', borderBottom: `1px solid ${T.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {activeTab === 'missing' ? (
                  <>
                    <Checkbox checked={missingItems.length > 0 && selectedMissing.size === missingItems.filter(i => !i.isLoading).length} onChange={toggleSelectAllMissing} />
                    <span style={{ fontSize: 13, color: T.inkSoft, fontWeight: 500 }}>Select All ({selectedMissing.size} selected)</span>
                    {loadingCategoryVars && <span style={{ fontSize: 12, color: T.accent, display: 'flex', alignItems: 'center', gap: 6, marginLeft: 10 }}><IcoLoader s={12}/> Loading sizes...</span>}
                  </>
                ) : (
                  <>
                    <Checkbox checked={readyItems.length > 0 && selectedReady.size === readyItems.length} onChange={toggleSelectAllReady} />
                    <span style={{ fontSize: 13, color: T.inkSoft, fontWeight: 500 }}>Select All ({selectedReady.size} selected)</span>
                  </>
                )}
              </div>
              
              <div>
                {activeTab === 'missing' ? (
                  <button onClick={handleGenerateSelected} disabled={selectedMissing.size === 0 || isGeneratingBulk} style={{
                    display: 'flex', alignItems: 'center', gap: 8, background: selectedMissing.size > 0 ? T.surfaceHover : T.surface, border: `1px solid ${T.line}`, color: selectedMissing.size > 0 ? T.ink : T.inkSoft, padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: selectedMissing.size > 0 ? 'pointer' : 'not-allowed', fontWeight: 600
                  }}>
                    {isGeneratingBulk ? <IcoLoader s={14} /> : <IcoWand />} {isGeneratingBulk ? (generationProgress || 'Generating...') : 'Auto-Generate Selected'}
                  </button>
                ) : (
                  <button onClick={handlePrint} disabled={selectedReady.size === 0} style={{
                    display: 'flex', alignItems: 'center', gap: 8, background: selectedReady.size > 0 ? T.accent : T.surface, border: 'none', color: '#fff', padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: selectedReady.size > 0 ? 'pointer' : 'not-allowed', fontWeight: 600, opacity: selectedReady.size > 0 ? 1 : 0.5
                  }}>
                    <IcoPrint /> Print {itemsToPrint.length} Labels
                  </button>
                )}
              </div>
            </div>

            {/* List Area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${T.line}`, color: T.inkSoft, fontSize: 12 }}>
                    <th style={{ padding: '0 0 12px 0', width: 40 }}></th>
                    <th style={{ padding: '0 0 12px 0', fontWeight: 500 }}>Product Name</th>
                    {activeTab === 'ready' && (
                      <>
                        <th style={{ padding: '0 0 12px 0', fontWeight: 500 }}>SKU / Barcode</th>
                        <th style={{ padding: '0 0 12px 0', fontWeight: 500, width: 100, textAlign: 'center' }}>Label Qty</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {(activeTab === 'missing' ? missingItems : readyItems).map(item => (
                    <tr key={item.key} style={{ borderBottom: `1px solid ${T.line}` }}>
                      <td style={{ padding: '16px 0' }}>
                        {item.isLoading ? (
                          <div style={{ color: T.inkSoft }}><IcoLoader s={14} /></div>
                        ) : (
                          <Checkbox 
                            checked={activeTab === 'missing' ? selectedMissing.has(item.key) : selectedReady.has(item.key)} 
                            onChange={() => activeTab === 'missing' ? toggleSelectMissing(item.key) : toggleSelectReady(item.key)} 
                          />
                        )}
                      </td>
                      <td style={{ padding: '16px 0', color: item.isLoading ? T.inkSoft : T.ink, fontSize: 14 }}>
                        {item.name}
                      </td>
                      {activeTab === 'ready' && (
                        <>
                          <td style={{ padding: '16px 0' }}>
                            <span style={{ fontFamily: 'monospace', color: T.accent, fontSize: 14, letterSpacing: '0.05em' }}>{item.sku}</span>
                          </td>
                          <td style={{ padding: '16px 0', textAlign: 'center' }}>
                            <input type="number" min="1" value={printQty[item.key] || 1} onChange={e => updatePrintQty(item.key, e.target.value)} style={{ width: 60, background: T.surface, border: `1px solid ${T.line}`, color: T.ink, padding: '6px', borderRadius: 6, textAlign: 'center', outline: 'none' }} />
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                  {(activeTab === 'missing' ? missingItems : readyItems).length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', padding: '60px 0', color: T.inkSoft }}>
                        {activeTab === 'missing' ? 'All products in this view have barcodes!' : 'No barcodes generated yet for this view.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {visibleBaseProducts.length > page * ITEMS_PER_PAGE && (
                <div style={{ padding: '20px 0', display: 'flex', justifyContent: 'center' }}>
                  <button onClick={() => setPage(p => p + 1)} style={{ background: T.surfaceHover, border: `1px solid ${T.line}`, color: T.ink, padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                    Load More Products
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* The actual print layout (only visible when printing) */}
      <div className="print-only" style={{ display: 'none' }}>
        {itemsToPrint.map((item, idx) => (
          <div key={idx} style={{ 
            width: '2in', height: '1.25in', boxSizing: 'border-box', padding: '0.1in',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            pageBreakAfter: 'always', overflow: 'hidden', background: '#fff', color: '#000'
          }}>
            <div style={{ fontSize: '10pt', fontWeight: 'bold', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', marginBottom: 4 }}>
              {item.name}
            </div>
            <Barcode value={item.sku} format="CODE128" width={1.5} height={40} fontSize={10} background="#ffffff" lineColor="#000000" margin={0} />
            <div style={{ fontSize: '10pt', fontWeight: 'bold', marginTop: 4 }}>
              PKR {Number(item.price).toLocaleString()}
            </div>
          </div>
        ))}
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
