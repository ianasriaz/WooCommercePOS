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
};

export const usePosStore = create(
  persist(
    (set, get) => ({
      ...initialState,

      setProducts: (products) => set({ products }),

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
      }),
    },
  ),
);

export default usePosStore;

