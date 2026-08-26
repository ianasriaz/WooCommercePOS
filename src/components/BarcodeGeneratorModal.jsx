import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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
const IcoUndo = ({ s = 14 }) => <Svg size={s}><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></Svg>;
const IcoLoader = ({ s = 14 }) => <div style={{ width: s, height: s, border: '2px solid transparent', borderTopColor: 'currentColor', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }}><style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style></div>;

// Light Mode Theme (Matches POS Terminal)
const T = {
  bg: '#f1f5f9',
  surface: '#ffffff',
  surfaceHover: '#f8fafc',
  line: '#e2e8f0',
  lineSoft: '#f1f5f9',
  ink: '#0f172a',
  inkSoft: '#64748b',
  accent: '#0f172a',
  accentSoft: '#334155',
  accentGreen: '#16a34a',
  danger: '#ef4444',
  sans: 'Inter, system-ui, sans-serif',
};

const isVariableProduct = (product) => product?.type === 'variable';

export default function BarcodeGeneratorModal({ onClose }) {
  const products = usePosStore((state) => state.products);
  const printedBarcodes = usePosStore((state) => state.printedBarcodes || []);
  const markBarcodesPrinted = usePosStore((state) => state.markBarcodesPrinted);
  const unmarkBarcodesPrinted = usePosStore((state) => state.unmarkBarcodesPrinted);

  const variationsCache = usePosStore((state) => state.variationsCache || {});
  const cacheVariations = usePosStore((state) => state.cacheVariations);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCatId, setSelectedCatId] = useState(null); // null by default - user selects category
  const [activeTab, setActiveTab] = useState('missing'); // 'missing' | 'ready' | 'printed'
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 30;
  
  const [loadedVariations, setLoadedVariations] = useState({});
  const [isGeneratingBulk, setIsGeneratingBulk] = useState(false);
  const [generationProgress, setGenerationProgress] = useState('');
  const [isLoadingCategorySizes, setIsLoadingCategorySizes] = useState(false);
  
  const [selectedMissing, setSelectedMissing] = useState(new Set());
  const [selectedReady, setSelectedReady] = useState(new Set());
  const [selectedPrinted, setSelectedPrinted] = useState(new Set());
  const [printQty, setPrintQty] = useState({});

  // Sync variations from local IndexedDB cache
  useEffect(() => {
    if (variationsCache && Object.keys(variationsCache).length > 0) {
      setLoadedVariations(prev => ({ ...variationsCache, ...prev }));
    }
  }, [variationsCache]);

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

  const visibleBaseProducts = useMemo(() => {
    if (selectedCatId === null && !searchTerm.trim()) {
      return [];
    }
    let filtered = products;
    if (selectedCatId && selectedCatId !== 'all') {
      filtered = filtered.filter(p => p.categories?.some(c => c.id === selectedCatId));
    }
    if (searchTerm.trim()) {
      const term = String(searchTerm).trim().toLowerCase();
      filtered = filtered.filter(p => p.name.toLowerCase().includes(term) || (p.sku && p.sku.toLowerCase().includes(term)));
    }
    return filtered;
  }, [products, selectedCatId, searchTerm]);

  // Reset page and selections on filter change
  useEffect(() => {
    setPage(1);
    setSelectedMissing(new Set());
    setSelectedReady(new Set());
    setSelectedPrinted(new Set());
  }, [selectedCatId, searchTerm, activeTab]);

  const paginatedBaseProducts = useMemo(() => {
    return visibleBaseProducts.slice(0, page * ITEMS_PER_PAGE);
  }, [visibleBaseProducts, page]);

  // Explicit user-triggered sizes/variations loader for the active category
  const handleLoadSizesForActiveView = async () => {
    const variableProducts = paginatedBaseProducts.filter(p => isVariableProduct(p) && !loadedVariations[p.id]);
    if (variableProducts.length === 0) return;
    
    setIsLoadingCategorySizes(true);
    const CONCURRENCY = 3;
    let i = 0;
    
    try {
      while (i < variableProducts.length) {
        const chunk = variableProducts.slice(i, i + CONCURRENCY);
        const promises = chunk.map(p => fetchVariations(p.id).then(vars => {
          if (cacheVariations && Array.isArray(vars)) {
            cacheVariations(p.id, vars);
          }
          return { id: p.id, vars };
        }).catch(() => ({ id: p.id, vars: [] })));
        
        const results = await Promise.all(promises);
        setLoadedVariations(prev => {
          const next = { ...prev };
          results.forEach(r => next[r.id] = r.vars);
          return next;
        });
        i += CONCURRENCY;
      }
    } finally {
      setIsLoadingCategorySizes(false);
    }
  };

  const flattenedItems = useMemo(() => {
    const items = [];
    paginatedBaseProducts.forEach(p => {
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
  const readyItems = useMemo(() => flattenedItems.filter(i => i.hasSku && !printedBarcodes.includes(i.sku)), [flattenedItems, printedBarcodes]);
  const printedItems = useMemo(() => flattenedItems.filter(i => i.hasSku && printedBarcodes.includes(i.sku)), [flattenedItems, printedBarcodes]);

  // View data helper
  const getCurrentViewItems = () => {
    if (activeTab === 'missing') return missingItems;
    if (activeTab === 'ready') return readyItems;
    return printedItems;
  };
  
  const getCurrentSelection = () => {
    if (activeTab === 'missing') return selectedMissing;
    if (activeTab === 'ready') return selectedReady;
    return selectedPrinted;
  };

  const toggleSelect = (key) => {
    if (activeTab === 'missing') {
      const next = new Set(selectedMissing);
      if (next.has(key)) next.delete(key); else next.add(key);
      setSelectedMissing(next);
    } else if (activeTab === 'ready') {
      const next = new Set(selectedReady);
      if (next.has(key)) next.delete(key); else next.add(key);
      setSelectedReady(next);
    } else {
      const next = new Set(selectedPrinted);
      if (next.has(key)) next.delete(key); else next.add(key);
      setSelectedPrinted(next);
    }
  };
  
  const toggleSelectAll = () => {
    const items = getCurrentViewItems().filter(i => !i.isLoading);
    const selection = getCurrentSelection();
    
    let newSelection = new Set();
    if (selection.size !== items.length || items.length === 0) {
      newSelection = new Set(items.map(i => i.key));
    }

    if (activeTab === 'missing') setSelectedMissing(newSelection);
    else if (activeTab === 'ready') setSelectedReady(newSelection);
    else setSelectedPrinted(newSelection);
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

  const handlePrint = () => {
    const items = activeTab === 'ready' ? readyItems : printedItems;
    const selectedKeys = activeTab === 'ready' ? selectedReady : selectedPrinted;
    const itemsToMark = items.filter(i => selectedKeys.has(i.key)).map(i => i.sku);
    
    window.print();
    
    // Mark as printed if they were in the Ready tab
    if (activeTab === 'ready' && itemsToMark.length > 0) {
      setTimeout(() => {
        markBarcodesPrinted(itemsToMark);
        setSelectedReady(new Set());
      }, 500);
    }
  };

  const handleUnmarkPrinted = () => {
    if (selectedPrinted.size === 0) return;
    const skusToUnmark = printedItems.filter(i => selectedPrinted.has(i.key)).map(i => i.sku);
    unmarkBarcodesPrinted(skusToUnmark);
    setSelectedPrinted(new Set());
  };

  const itemsToPrint = (activeTab === 'ready' ? readyItems : printedItems).filter(i => getCurrentSelection().has(i.key)).flatMap(i => {
    const qty = printQty[i.key] || 1;
    return Array(qty).fill(i);
  });

  const Checkbox = ({ checked, onChange }) => (
    <div onClick={onChange} style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${checked ? T.accent : '#cbd5e1'}`, background: checked ? T.accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.1s', flexShrink: 0 }}>
      {checked && <IcoCheck s={13} color="#fff" />}
    </div>
  );

  return (
    <div className="barcode-modal-overlay" style={{
      position: 'fixed', inset: 0,
      background: 'rgba(15, 23, 42, 0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)',
      padding: '0',
    }}>
      <div className="no-print barcode-modal-card" style={{
        background: T.surface, width: '100%', maxWidth: 1100, height: '90vh',
        border: `1px solid ${T.line}`, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
      }}>
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: T.surface }}>
          <div>
            <h2 style={{ margin: 0, color: T.ink, fontSize: 16, fontWeight: 700 }}>Barcode Studio</h2>
            <p style={{ margin: '2px 0 0', color: T.inkSoft, fontSize: 12 }} className="desktop-only-text">Generate & print EAN-13 barcodes for your catalog.</p>
          </div>
          <button onClick={onClose} style={{ background: T.surfaceHover, border: `1px solid ${T.line}`, color: T.inkSoft, width: 34, height: 34, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'background 0.1s' }}>
            <IcoX s={16} />
          </button>
        </div>

        {/* Mobile Filter Bar (Search + Horizontal Category Pills) */}
        <div className="mobile-filter-strip" style={{ padding: '10px 14px', borderBottom: `1px solid ${T.line}`, background: T.surfaceHover, display: 'none', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: T.surface, border: `1px solid ${T.line}`, borderRadius: 8, padding: '0 10px', height: 36 }}>
            <div style={{ color: T.inkSoft }}><IcoSearch s={14} /></div>
            <input
              type="text" placeholder="Search by name or SKU..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: T.ink, outline: 'none', flex: 1, fontSize: 13 }}
            />
            {searchTerm && (
              <button type="button" onClick={() => setSearchTerm('')} style={{ background: 'transparent', border: 'none', color: T.inkSoft, cursor: 'pointer', padding: 2 }}>
                <IcoX s={12} />
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, WebkitOverflowScrolling: 'touch' }}>
            <button
              type="button"
              onClick={() => setSelectedCatId('all')}
              style={{
                whiteSpace: 'nowrap', padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                background: selectedCatId === 'all' ? T.ink : T.surface, color: selectedCatId === 'all' ? '#ffffff' : T.inkSoft,
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)', flexShrink: 0,
              }}
            >
              All ({products.length})
            </button>
            {categories.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCatId(c.id)}
                style={{
                  whiteSpace: 'nowrap', padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                  background: selectedCatId === c.id ? T.ink : T.surface, color: selectedCatId === c.id ? '#ffffff' : T.inkSoft,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)', flexShrink: 0,
                }}
              >
                {c.name} ({c.count})
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* Desktop Left Sidebar: Categories */}
          <div className="desktop-sidebar" style={{ width: 260, borderRight: `1px solid ${T.line}`, display: 'flex', flexDirection: 'column', background: T.surfaceHover }}>
            <div style={{ padding: 14, borderBottom: `1px solid ${T.line}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: T.surface, border: `1px solid ${T.line}`, borderRadius: 8, padding: '0 10px', height: 36, boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                <div style={{ color: T.inkSoft }}><IcoSearch s={14} /></div>
                <input
                  type="text" placeholder="Search products..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  style={{ background: 'transparent', border: 'none', color: T.ink, outline: 'none', flex: 1, fontSize: 13 }}
                />
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.inkSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, paddingLeft: 6 }}>Categories</div>
              <div
                onClick={() => setSelectedCatId('all')}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 7, cursor: 'pointer', background: selectedCatId === 'all' ? T.line : 'transparent', color: selectedCatId === 'all' ? T.ink : T.inkSoft, transition: 'all 0.1s' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500 }}><IcoFolder s={14} /> All Products</div>
                <div style={{ background: selectedCatId === 'all' ? '#fff' : T.line, color: T.ink, fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 10 }}>{products.length}</div>
              </div>
              {categories.map(c => (
                <div
                  key={c.id}
                  onClick={() => setSelectedCatId(c.id)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 7, cursor: 'pointer', background: selectedCatId === c.id ? T.line : 'transparent', color: selectedCatId === c.id ? T.ink : T.inkSoft, marginTop: 3, transition: 'all 0.1s' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500 }}><IcoFolder s={14} /> {c.name}</div>
                  <div style={{ background: selectedCatId === c.id ? '#fff' : T.line, color: T.ink, fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 10 }}>{c.count}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Main Area */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: T.surface, minWidth: 0 }}>
            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: `1px solid ${T.line}`, background: T.surface }}>
              <div onClick={() => setActiveTab('missing')} style={{ flex: 1, padding: '12px 6px', textAlign: 'center', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: activeTab === 'missing' ? T.ink : T.inkSoft, borderBottom: activeTab === 'missing' ? `2px solid ${T.accent}` : '2px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all 0.1s' }}>
                Needs SKU <span style={{ background: activeTab === 'missing' ? T.accent : T.line, color: activeTab === 'missing' ? '#fff' : T.ink, padding: '2px 6px', borderRadius: 10, fontSize: 11 }}>{missingItems.length}</span>
              </div>
              <div onClick={() => setActiveTab('ready')} style={{ flex: 1, padding: '12px 6px', textAlign: 'center', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: activeTab === 'ready' ? T.ink : T.inkSoft, borderBottom: activeTab === 'ready' ? `2px solid ${T.accent}` : '2px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all 0.1s' }}>
                Ready to Print <span style={{ background: activeTab === 'ready' ? T.accent : T.line, color: activeTab === 'ready' ? '#fff' : T.ink, padding: '2px 6px', borderRadius: 10, fontSize: 11 }}>{readyItems.length}</span>
              </div>
              <div onClick={() => setActiveTab('printed')} style={{ flex: 1, padding: '12px 6px', textAlign: 'center', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: activeTab === 'printed' ? T.ink : T.inkSoft, borderBottom: activeTab === 'printed' ? `2px solid ${T.accent}` : '2px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all 0.1s' }}>
                Printed <span style={{ background: activeTab === 'printed' ? T.accent : T.line, color: activeTab === 'printed' ? '#fff' : T.ink, padding: '2px 6px', borderRadius: 10, fontSize: 11 }}>{printedItems.length}</span>
              </div>
            </div>

            {/* Toolbar */}
            <div className="barcode-toolbar" style={{ padding: '12px 16px', borderBottom: `1px solid ${T.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: T.surfaceHover, gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <Checkbox checked={getCurrentViewItems().length > 0 && getCurrentSelection().size === getCurrentViewItems().filter(i => !i.isLoading).length} onChange={toggleSelectAll} />
                <span style={{ fontSize: 12.5, color: T.ink, fontWeight: 600 }}>Select All ({getCurrentSelection().size})</span>
                
                {paginatedBaseProducts.some(p => isVariableProduct(p) && !loadedVariations[p.id]) && (
                  <button
                    type="button"
                    onClick={handleLoadSizesForActiveView}
                    disabled={isLoadingCategorySizes}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px',
                      background: T.surface, border: `1px solid ${T.line}`, borderRadius: 6,
                      fontSize: 11.5, fontWeight: 600, color: T.inkSoft, cursor: 'pointer',
                    }}
                  >
                    {isLoadingCategorySizes ? <IcoLoader s={11} /> : null}
                    {isLoadingCategorySizes ? 'Loading Sizes...' : 'Load All Sizes in Category'}
                  </button>
                )}
              </div>
              
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', width: 'auto' }}>
                {activeTab === 'missing' && (
                  <button onClick={handleGenerateSelected} disabled={selectedMissing.size === 0 || isGeneratingBulk} style={{
                    display: 'flex', alignItems: 'center', gap: 6, background: selectedMissing.size > 0 ? T.accent : T.line, border: 'none', color: selectedMissing.size > 0 ? '#fff' : T.inkSoft, padding: '7px 14px', borderRadius: 7, fontSize: 12.5, cursor: selectedMissing.size > 0 ? 'pointer' : 'not-allowed', fontWeight: 600, transition: 'all 0.1s'
                  }}>
                    {isGeneratingBulk ? <IcoLoader s={13} /> : <IcoWand s={13} />} {isGeneratingBulk ? (generationProgress || 'Generating...') : 'Start Generate Selected'}
                  </button>
                )}

                {activeTab === 'printed' && (
                  <button onClick={handleUnmarkPrinted} disabled={selectedPrinted.size === 0} style={{
                    display: 'flex', alignItems: 'center', gap: 6, background: selectedPrinted.size > 0 ? '#fff' : T.surfaceHover, border: `1px solid ${T.line}`, color: selectedPrinted.size > 0 ? T.ink : T.inkSoft, padding: '7px 14px', borderRadius: 7, fontSize: 12.5, cursor: selectedPrinted.size > 0 ? 'pointer' : 'not-allowed', fontWeight: 600, transition: 'all 0.1s'
                  }}>
                    <IcoUndo s={13} /> Move to Ready
                  </button>
                )}

                {(activeTab === 'ready' || activeTab === 'printed') && (
                  <button onClick={handlePrint} disabled={getCurrentSelection().size === 0} style={{
                    display: 'flex', alignItems: 'center', gap: 6, background: getCurrentSelection().size > 0 ? T.accent : T.line, border: 'none', color: getCurrentSelection().size > 0 ? '#fff' : T.inkSoft, padding: '7px 14px', borderRadius: 7, fontSize: 12.5, cursor: getCurrentSelection().size > 0 ? 'pointer' : 'not-allowed', fontWeight: 600, transition: 'all 0.1s'
                  }}>
                    <IcoPrint s={13} /> Print {itemsToPrint.length} Labels
                  </button>
                )}
              </div>
            </div>

            {/* List Area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
              {/* Desktop Table View */}
              <div className="desktop-table-container">
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${T.line}`, color: T.inkSoft, fontSize: 12 }}>
                      <th style={{ padding: '12px 0', width: 36, position: 'sticky', top: 0, background: T.surface, zIndex: 10 }}></th>
                      <th style={{ padding: '12px 0', fontWeight: 600, position: 'sticky', top: 0, background: T.surface, zIndex: 10 }}>Product Name</th>
                      {activeTab !== 'missing' && (
                        <>
                          <th style={{ padding: '12px 0', fontWeight: 600, position: 'sticky', top: 0, background: T.surface, zIndex: 10 }}>SKU / Barcode</th>
                          <th style={{ padding: '12px 0', fontWeight: 600, width: 90, textAlign: 'center', position: 'sticky', top: 0, background: T.surface, zIndex: 10 }}>Label Qty</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {getCurrentViewItems().map(item => (
                      <tr key={item.key} style={{ borderBottom: `1px solid ${T.line}` }}>
                        <td style={{ padding: '12px 0' }}>
                          {item.isLoading ? (
                            <div style={{ color: T.inkSoft }}><IcoLoader s={14} /></div>
                          ) : (
                            <Checkbox checked={getCurrentSelection().has(item.key)} onChange={() => toggleSelect(item.key)} />
                          )}
                        </td>
                        <td style={{ padding: '12px 0', color: item.isLoading ? T.inkSoft : T.ink, fontSize: 13.5, fontWeight: 500 }}>
                          {item.name}
                        </td>
                        {activeTab !== 'missing' && (
                          <>
                            <td style={{ padding: '12px 0' }}>
                              <span style={{ fontFamily: 'monospace', background: T.surfaceHover, border: `1px solid ${T.line}`, padding: '3px 7px', borderRadius: 5, color: T.ink, fontSize: 12.5, letterSpacing: '0.05em' }}>{item.sku}</span>
                            </td>
                            <td style={{ padding: '12px 0', textAlign: 'center' }}>
                              <input type="number" min="1" value={printQty[item.key] || 1} onChange={e => updatePrintQty(item.key, e.target.value)} style={{ width: 55, background: '#fff', border: `1px solid ${T.line}`, color: T.ink, padding: '5px', borderRadius: 6, textAlign: 'center', outline: 'none', fontWeight: 500, fontSize: 13 }} />
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card List View */}
              <div className="mobile-cards-container" style={{ display: 'none', flexDirection: 'column', gap: 8 }}>
                {getCurrentViewItems().map(item => {
                  const isChecked = getCurrentSelection().has(item.key);
                  return (
                    <div
                      key={item.key}
                      style={{
                        background: isChecked ? '#f8fafc' : T.surface,
                        border: `1px solid ${isChecked ? T.ink : T.line}`,
                        borderRadius: 9,
                        padding: '10px 12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        transition: 'border-color 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ paddingTop: 2 }}>
                          {item.isLoading ? (
                            <div style={{ color: T.inkSoft }}><IcoLoader s={14} /></div>
                          ) : (
                            <Checkbox checked={isChecked} onChange={() => toggleSelect(item.key)} />
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }} onClick={() => !item.isLoading && toggleSelect(item.key)}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, lineHeight: 1.35, wordBreak: 'break-word' }}>
                            {item.name}
                          </div>
                          <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 2 }}>
                            PKR {Number(item.price || 0).toLocaleString()}
                          </div>
                        </div>
                      </div>

                      {activeTab !== 'missing' && !item.isLoading && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, borderTop: `1px solid ${T.lineSoft}`, gap: 8 }}>
                          <span style={{ fontFamily: 'monospace', background: T.surfaceHover, border: `1px solid ${T.line}`, padding: '3px 8px', borderRadius: 5, color: T.ink, fontSize: 11.5, letterSpacing: '0.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.sku}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 11.5, color: T.inkSoft, fontWeight: 500 }}>Qty:</span>
                            <input
                              type="number"
                              min="1"
                              value={printQty[item.key] || 1}
                              onChange={e => updatePrintQty(item.key, e.target.value)}
                              style={{ width: 48, height: 30, background: '#fff', border: `1px solid ${T.line}`, color: T.ink, borderRadius: 6, textAlign: 'center', outline: 'none', fontWeight: 600, fontSize: 12.5 }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {getCurrentViewItems().length === 0 && (
                <div style={{ textAlign: 'center', padding: '60px 16px', color: T.inkSoft, fontSize: 13 }}>
                  {selectedCatId === null && !searchTerm.trim() ? (
                    <div style={{ maxWidth: 360, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
                      <div style={{ width: 44, height: 44, borderRadius: '50%', background: T.lineSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.inkSoft }}>
                        <IcoFolder s={20} />
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>Select a Category</div>
                      <p style={{ margin: 0, fontSize: 12.5, color: T.inkSoft, lineHeight: 1.4 }}>
                        Choose a specific category or search for products to view items and generate barcodes efficiently without server strain.
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 6 }}>
                        <button
                          type="button"
                          onClick={() => setSelectedCatId('all')}
                          style={{ background: T.surfaceHover, border: `1px solid ${T.line}`, padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600, color: T.ink, cursor: 'pointer' }}
                        >
                          All Products ({products.length})
                        </button>
                        {categories.slice(0, 4).map(c => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setSelectedCatId(c.id)}
                            style={{ background: T.surfaceHover, border: `1px solid ${T.line}`, padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600, color: T.ink, cursor: 'pointer' }}
                          >
                            {c.name} ({c.count})
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <>
                      {activeTab === 'missing' && 'All products in this category have barcodes!'}
                      {activeTab === 'ready' && 'No barcodes ready to print for this view.'}
                      {activeTab === 'printed' && 'No barcodes have been printed yet.'}
                    </>
                  )}
                </div>
              )}
              
              {visibleBaseProducts.length > page * ITEMS_PER_PAGE && (
                <div style={{ padding: '20px 0', display: 'flex', justifyContent: 'center' }}>
                  <button onClick={() => setPage(p => p + 1)} style={{ background: '#fff', border: `1px solid ${T.line}`, color: T.ink, padding: '9px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                    Load More Products
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* The actual print layout (only visible when printing) */}
      {createPortal(
        <div className="print-only">
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
        </div>,
        document.body
      )}

      <style>{`
        @media screen {
          .print-only { display: none !important; }
        }

        @media screen and (max-width: 768px) {
          .barcode-modal-card {
            max-width: 100vw !important;
            height: 100dvh !important;
            border-radius: 0 !important;
            border: none !important;
          }
          .desktop-sidebar {
            display: none !important;
          }
          .mobile-filter-strip {
            display: flex !important;
          }
          .desktop-table-container {
            display: none !important;
          }
          .mobile-cards-container {
            display: flex !important;
          }
          .desktop-only-text {
            display: none !important;
          }
          .barcode-toolbar {
            padding: 10px 14px !important;
          }
        }

        @media print {
          @page { size: 2in 1.25in; margin: 0; }
          
          /* Hide all elements in the body EXCEPT our print portal */
          body > :not(.print-only) {
            display: none !important;
          }
          
          body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
          }

          .print-only { 
            display: block !important; 
            width: 2in !important; 
          }
        }
      `}</style>
    </div>
  );
}
