import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { idbStorage } from './idb-storage';

const findCartItemIndex = (cart, productId, variationId = null) =>
  cart.findIndex(
    (item) => item.id === productId && (item.variation_id ?? null) === (variationId ?? null),
  );

const formatVariationLabel = (attributes = []) => {
  if (!Array.isArray(attributes) || attributes.length === 0) {
    return '';
  }

  return attributes
    .map((attribute) => attribute?.option)
    .filter(Boolean)
    .join(' / ');
};

const initialState = {
  products: [],
  cart: [],
  variationsCache: {},
  printedBarcodes: [],
  posOrders: [],
  lastSyncTimestamp: null,
  _hasHydrated: false,
};

export const usePosStore = create(
  persist(
    (set, get) => ({
      ...initialState,

      setProducts: (products) => set({ products, lastSyncTimestamp: new Date().toISOString() }),
      setHasHydrated: (state) => set({ _hasHydrated: state }),

      recordPosOrder: (order) => set((state) => ({
        posOrders: [order, ...state.posOrders.filter((savedOrder) => savedOrder.id !== order.id)].slice(0, 500),
      })),

      reconcilePosOrders: (serverOrders) => set((state) => {
        const serverOrderMap = new Map(serverOrders.map((o) => [o.id, o]));
        // Keep recent local orders (past 48h) or merge updated server order
        const now = Date.now();
        const updatedPosOrders = state.posOrders.map((localOrder) => {
          if (serverOrderMap.has(localOrder.id)) {
            return { ...localOrder, ...serverOrderMap.get(localOrder.id) };
          }
          return localOrder;
        }).filter((order) => {
          const orderDate = new Date(order.date_created || order.date_created_gmt || 0).getTime();
          return (now - orderDate) < 48 * 60 * 60 * 1000;
        });

        // Add any server order marked as pos order not yet in posOrders
        serverOrders.forEach((so) => {
          const isPos = so.payment_method === 'pos_cash' ||
            so.created_via === 'pos-terminal' ||
            (Array.isArray(so.meta_data) && so.meta_data.some((m) => m.key === '_pos_order' && m.value === 'yes'));
          if (isPos && !updatedPosOrders.some((po) => po.id === so.id)) {
            updatedPosOrders.push(so);
          }
        });

        return { posOrders: updatedPosOrders.slice(0, 500) };
      }),
      
      updateProducts: (newProducts) => set((state) => {
        if (!Array.isArray(newProducts) || newProducts.length === 0) {
          return { lastSyncTimestamp: new Date().toISOString() };
        }
        const existingMap = new Map(state.products.map(p => [p.id, p]));
        
        newProducts.forEach(np => {
          if (np.status && np.status !== 'publish') {
            existingMap.delete(np.id);
          } else {
            const existing = existingMap.get(np.id);
            existingMap.set(np.id, existing ? { ...existing, ...np } : np);
          }
        });
        
        return { 
          products: Array.from(existingMap.values()),
          lastSyncTimestamp: new Date().toISOString() 
        };
      }),

      // Instant optimistic local stock decrement on checkout
      deductStockForCart: (cartItems) => set((state) => {
        const itemQuantityMap = new Map();
        const variationQuantityMap = new Map();

        cartItems.forEach((item) => {
          const pId = item.id;
          const vId = item.variation_id ?? null;
          const qty = Number.parseInt(item.quantity, 10) || 1;

          itemQuantityMap.set(pId, (itemQuantityMap.get(pId) || 0) + qty);
          if (vId) {
            variationQuantityMap.set(vId, (variationQuantityMap.get(vId) || 0) + qty);
          }
        });

        const updatedProducts = state.products.map((p) => {
          if (!itemQuantityMap.has(p.id)) return p;
          const deductQty = itemQuantityMap.get(p.id);

          if (!p.manage_stock) return p;

          const currentStock = Number.parseInt(p.stock_quantity ?? 0, 10);
          const newStock = Math.max(0, currentStock - deductQty);
          return {
            ...p,
            stock_quantity: newStock,
            stock_status: newStock === 0 ? 'outofstock' : p.stock_status,
          };
        });

        // Update variationsCache if applicable
        const updatedVariationsCache = { ...state.variationsCache };
        Object.keys(updatedVariationsCache).forEach((productId) => {
          const vars = updatedVariationsCache[productId];
          if (Array.isArray(vars)) {
            updatedVariationsCache[productId] = vars.map((v) => {
              if (!variationQuantityMap.has(v.id)) return v;
              const deductQty = variationQuantityMap.get(v.id);
              if (!v.manage_stock) return v;
              const currentStock = Number.parseInt(v.stock_quantity ?? 0, 10);
              const newStock = Math.max(0, currentStock - deductQty);
              return {
                ...v,
                stock_quantity: newStock,
                stock_status: newStock === 0 ? 'outofstock' : v.stock_status,
              };
            });
          }
        });

        return {
          products: updatedProducts,
          variationsCache: updatedVariationsCache,
        };
      }),
      
      setVariationsCache: (productId, variations) => set((state) => ({
        variationsCache: { ...state.variationsCache, [productId]: variations }
      })),

      cacheVariations: (productId, variations) => set((state) => ({
        variationsCache: { ...state.variationsCache, [productId]: variations }
      })),

      markBarcodesPrinted: (skus) => set((state) => ({
        printedBarcodes: Array.from(new Set([...state.printedBarcodes, ...skus]))
      })),

      unmarkBarcodesPrinted: (skus) => set((state) => ({
        printedBarcodes: state.printedBarcodes.filter(sku => !skus.includes(sku))
      })),

      addToCart: (product, variation = null) => {
        set((state) => {
          const variationId = variation?.id ?? null;
          const index = findCartItemIndex(state.cart, product.id, variationId);
          const variationLabel = formatVariationLabel(variation?.attributes);
          const displayName = variationLabel ? `${product.name} - ${variationLabel}` : product.name;
          const displayPrice = variation?.price ?? product.price;
          const cartLine = {
            ...product,
            name: displayName,
            price: displayPrice,
            ...(variation ? {
              manage_stock: variation.manage_stock ?? product.manage_stock,
              stock_quantity: variation.stock_quantity ?? product.stock_quantity,
              stock_status: variation.stock_status ?? product.stock_status,
            } : {}),
            variation_id: variationId,
            variation_attributes: variation?.attributes ?? null,
            quantity: 1,
          };

          if (index === -1) {
            return {
              cart: [...state.cart, cartLine],
            };
          }

          const updatedCart = [...state.cart];
          updatedCart[index] = {
            ...updatedCart[index],
            quantity: updatedCart[index].quantity + 1,
          };

          return { cart: updatedCart };
        });
      },

      removeFromCart: (productId, variationId = null) => {
        set((state) => ({
          cart: state.cart.filter(
            (item) => !(item.id === productId && (item.variation_id ?? null) === (variationId ?? null)),
          ),
        }));
      },

      updateQuantity: (productId, variationId = null, quantity) => {
        const safeQuantity = Number.isFinite(quantity)
          ? Math.max(0, Math.floor(quantity))
          : 0;

        set((state) => {
          if (safeQuantity === 0) {
            return {
              cart: state.cart.filter(
                (item) =>
                  !(item.id === productId && (item.variation_id ?? null) === (variationId ?? null)),
              ),
            };
          }

          return {
            cart: state.cart.map((item) =>
              item.id === productId && (item.variation_id ?? null) === (variationId ?? null)
                ? { ...item, quantity: safeQuantity }
                : item,
            ),
          };
        });
      },

      clearCart: () => set({ cart: [] }),

      cartTotal: () => {
        const { cart } = get();

        return cart.reduce((sum, item) => {
          const unitPrice = Number.parseFloat(item.price) || 0;
          return sum + unitPrice * item.quantity;
        }, 0);
      },
    }),
    {
      name: 'pos-store',
      storage: createJSONStorage(() => idbStorage),
      partialize: (state) => ({
        products: state.products,
        cart: state.cart,
        variationsCache: state.variationsCache,
        printedBarcodes: state.printedBarcodes,
        posOrders: state.posOrders,
        lastSyncTimestamp: state.lastSyncTimestamp,
      }),
      onRehydrateStorage: () => (state) => {
        state.setHasHydrated(true);
      },
    },
  ),
);

export default usePosStore;
