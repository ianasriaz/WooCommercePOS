import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';

const wcClient = axios.create({
  headers: {
    'Content-Type': 'application/json',
  },
});

export const POS_ORDER_CREATED_EVENT = 'pos-order-created';

const notifyPosOrderCreated = (order) => {
  const message = {
    type: POS_ORDER_CREATED_EVENT,
    orderId: order?.id ?? null,
    order,
    createdAt: Date.now(),
  };

  try {
    window.dispatchEvent(new CustomEvent(POS_ORDER_CREATED_EVENT, { detail: message }));
    window.localStorage.setItem(POS_ORDER_CREATED_EVENT, JSON.stringify(message));
    if ('BroadcastChannel' in window) {
      const channel = new BroadcastChannel(POS_ORDER_CREATED_EVENT);
      channel.postMessage(message);
      channel.close();
    }
  } catch {
    // Notifications are an optimization; polling remains the fallback.
  }
};

wcClient.interceptors.request.use((config) => {
  const { storeUrl, wcConsumerKey, wcConsumerSecret } = useAuthStore.getState();
  
  if (storeUrl && wcConsumerKey && wcConsumerSecret) {
    config.baseURL = `${storeUrl.replace(/\/$/, '')}/wp-json/`;
    const authToken = btoa(`${wcConsumerKey}:${wcConsumerSecret}`);
    config.headers.Authorization = `Basic ${authToken}`;
  }
  
  return config;
}, (error) => {
  return Promise.reject(error);
});

export const fetchProducts = async (lastSyncDate = null, onProgress = null) => {
  const perPage = 100;

  const baseParams = {
    _fields: 'id,name,sku,price,stock_quantity,stock_status,manage_stock,type,variations,global_unique_id,meta_data,images,date_created,date_modified,status,categories',
    per_page: perPage,
  };

  if (lastSyncDate) {
    baseParams.modified_after = new Date(lastSyncDate).toISOString();
    baseParams.status = 'any';
  }

  // 1. Fetch the first page to determine total pages
  const firstResponse = await wcClient.get('/wc/v3/products', {
    params: { ...baseParams, page: 1 },
  });

  let allProducts = Array.isArray(firstResponse.data) ? [...firstResponse.data] : [];
  if (onProgress) onProgress(allProducts);

  const totalPages = Number.parseInt(firstResponse.headers['x-wp-totalpages'] || '1', 10);

  // 2. Fetch remaining pages sequentially to prevent PHP-FPM OOM crashes
  if (totalPages > 1) {
    for (let p = 2; p <= totalPages; p++) {
      try {
        const res = await wcClient.get('/wc/v3/products', { params: { ...baseParams, page: p } });
        if (Array.isArray(res.data)) {
          allProducts = [...allProducts, ...res.data];
          if (onProgress) onProgress([...res.data]);
        }
      } catch (error) {
        console.error(`Failed to fetch products page ${p}`, error);
        throw error;
      }
    }
  }

  return allProducts;
};

export const fetchVariations = async (productId) => {
  const params = {
    _fields: 'id,attributes,price,stock_quantity,stock_status,manage_stock,image,sku',
    per_page: 100,
    page: 1,
  };
  const firstResponse = await wcClient.get(`/wc/v3/products/${productId}/variations`, { params });
  const variations = Array.isArray(firstResponse.data) ? [...firstResponse.data] : [];
  const totalPages = Number.parseInt(firstResponse.headers['x-wp-totalpages'] || '1', 10);

  for (let page = 2; page <= totalPages; page += 1) {
    const response = await wcClient.get(`/wc/v3/products/${productId}/variations`, {
      params: { ...params, page },
    });
    if (Array.isArray(response.data)) {
      variations.push(...response.data);
    }
  }

  return variations;
};

export const fetchProduct = async (productId) => {
  const response = await wcClient.get(`/wc/v3/products/${productId}`, {
    params: {
      _fields: 'id,name,sku,price,stock_quantity,stock_status,manage_stock,type,variations,global_unique_id,meta_data,images,date_created,date_modified,status,categories',
    },
  });

  return response.data;
};

export const checkStock = async (productId, variationId = null) => {
  const parseStock = (data) => {
    if (typeof data === 'number') {
      return data;
    }

    if (typeof data?.stock === 'number') {
      return data.stock;
    }

    if (typeof data?.stock_quantity === 'number') {
      return data.stock_quantity;
    }

    if (data?.manage_stock === false && data?.stock_status === 'instock') {
      return Number.MAX_SAFE_INTEGER;
    }

    if (data?.stock_status === 'outofstock') {
      return 0;
    }

    return Number.parseInt(data?.stock ?? data?.stock_quantity ?? 0, 10) || 0;
  };

  try {
    const response = await wcClient.get('/custom-pos/v1/check-stock', {
      params: {
        product_id: productId,
        ...(variationId ? { variation_id: variationId } : {}),
      },
    });

    return parseStock(response.data);
  } catch (error) {
    if (
      error.response?.status !== 404 &&
      error.response?.status !== 401 &&
      error.response?.status !== 403
    ) {
      throw error;
    }

    const stockRoute = variationId
      ? `/wc/v3/products/${productId}/variations/${variationId}`
      : `/wc/v3/products/${productId}`;

    const fallbackResponse = await wcClient.get(stockRoute, {
      params: {
        _fields: 'manage_stock,stock_quantity,stock_status',
      },
    });

    return parseStock(fallbackResponse.data);
  }
};

const PAYMENT_METHOD_MAP = {
  cash: {
    method: 'pos_cash',
    title: 'In-Store Cash',
  },
  bank_transfer: {
    method: 'bacs',
    title: 'Bank Transfer',
  },
};

export const createPosOrder = async (cartItems, customerDetails = {}, paymentOption = 'cash', discountAmount = 0) => {
  const line_items = cartItems.map((item) => ({
    product_id: item.id,
    variation_id: item.variation_id || undefined,
    quantity: item.quantity,
  }));

  const selectedPayment = PAYMENT_METHOD_MAP[paymentOption] || PAYMENT_METHOD_MAP.cash;

  const billing = {
    email: 'pos-checkout@store.local'
  };
  if (customerDetails.name?.trim()) billing.first_name = customerDetails.name.trim();
  if (customerDetails.email?.trim()) billing.email = customerDetails.email.trim();
  if (customerDetails.phone?.trim()) billing.phone = customerDetails.phone.trim();

  const payload = {
    status: 'completed',
    set_paid: true,
    created_via: 'pos-terminal',
    payment_method: selectedPayment.method,
    payment_method_title: selectedPayment.title,
    meta_data: [
      { key: '_pos_order', value: 'yes' },
      { key: '_pos_source', value: 'pos-terminal' },
    ],
    billing,
    line_items,
  };

  const parsedDiscount = Number.parseFloat(discountAmount);
  if (Number.isFinite(parsedDiscount) && parsedDiscount > 0) {
    payload.fee_lines = [
      {
        name: 'POS Discount',
        total: `-${parsedDiscount}`,
      },
    ];
  }

  try {
    const response = await wcClient.post('/wc/v3/orders', payload);
    notifyPosOrderCreated(response.data);
    return response.data;
  } catch (error) {
    const apiMessage =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      'Checkout request failed.';

    console.error(error.response?.data);
    const wrappedError = new Error(apiMessage);
    wrappedError.cause = error;
    throw wrappedError;
  }
};

export const fetchTodaysSales = async () => {
  // Fetch latest orders sorted newest first (per_page 100)
  // Timezone resilience: Filter on client side so WordPress server vs browser timezone mismatches never break the query.
  const params = {
    status: 'any',
    orderby: 'date',
    order: 'desc',
    per_page: 100,
    page: 1,
    _pos_refresh: Date.now(),
    _fields: 'id,total,date_created,date_created_gmt,status,line_items,payment_method,payment_method_title,created_via,meta_data,billing',
  };

  const response = await wcClient.get('/wc/v3/orders', { params });
  const allOrders = Array.isArray(response.data) ? response.data : [];

  const now = new Date();
  const todayYear = now.getFullYear();
  const todayMonth = now.getMonth();
  const todayDate = now.getDate();

  // Valid revenue-generating order statuses (excluding cancelled, refunded, failed, trash)
  const validStatuses = new Set(['completed', 'processing', 'on-hold', 'pending']);

  const filteredOrders = allOrders.filter((order) => {
    if (!validStatuses.has(order.status)) return false;

    const dateStr = order.date_created || order.date_created_gmt;
    if (!dateStr) return false;

    const orderDate = new Date(dateStr);
    if (Number.isNaN(orderDate.getTime())) return false;

    // 1. Check if same calendar day locally
    const isSameDay =
      orderDate.getFullYear() === todayYear &&
      orderDate.getMonth() === todayMonth &&
      orderDate.getDate() === todayDate;

    if (isSameDay) return true;

    // 2. Check if created within last 24h and matches date either locally or in UTC
    const timeDiffMs = now.getTime() - orderDate.getTime();
    if (timeDiffMs >= 0 && timeDiffMs <= 24 * 60 * 60 * 1000) {
      if (orderDate.getUTCDate() === now.getUTCDate() || orderDate.getDate() === todayDate) {
        return true;
      }
    }

    return false;
  });

  return filteredOrders;
};

export const fetchRecentOrders = async () => {
  const response = await wcClient.get('/wc/v3/orders', {
    params: {
      per_page: 100,
      orderby: 'date',
      order: 'desc',
      _fields: 'id,total,date_created,date_created_gmt,status,line_items,payment_method,payment_method_title,created_via,meta_data,billing',
    },
  });

  return response.data;
};

export const updateProductSKUs = async (updates) => {
  for (const update of updates) {
    try {
      if (update.variationId) {
        await wcClient.put(`/wc/v3/products/${update.productId}/variations/${update.variationId}`, {
          sku: update.sku
        });
      } else {
        await wcClient.put(`/wc/v3/products/${update.productId}`, {
          sku: update.sku
        });
      }
    } catch (error) {
      console.error(`Failed to update SKU for product ${update.productId}:`, error);
      throw new Error(`Failed to update SKU for product ${update.productId}`);
    }
  }
  return true;
};

export default wcClient;
