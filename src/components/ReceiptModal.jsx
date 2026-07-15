import { createPortal } from 'react-dom';
import { useAuthStore } from '../store/useAuthStore';
const currencyFormatter = new Intl.NumberFormat('en-PK', {
  style: 'currency',
  currency: 'PKR',
});

const formatPkr = (value) => currencyFormatter.format(Number.parseFloat(value) || 0);

const formatDateTime = (value) => {
  const date = value ? new Date(value) : new Date();
  return new Intl.DateTimeFormat('en-PK', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const getLineItems = (orderData) => orderData?.line_items || orderData?.items || [];

const getCustomerName = (orderData) => {
  const firstName = orderData?.billing?.first_name?.trim() || '';
  const lastName = orderData?.billing?.last_name?.trim() || '';
  return `${firstName} ${lastName}`.trim();
};

function ReceiptModal({ orderData, onClose }) {
  const storeName = useAuthStore((s) => s.storeName);
  const storePhone = useAuthStore((s) => s.storePhone);
  const storeAddress = useAuthStore((s) => s.storeAddress);
  const lineItems = getLineItems(orderData);
  const totalValue = orderData?.total ?? orderData?.grand_total ?? 0;
  const customerName = getCustomerName(orderData);
  const paymentTitle = orderData?.payment_method_title || 'N/A';

  const handlePrint = () => {
    window.print();
  };

  return createPortal(
    <div className="receipt-print-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 print:items-start print:justify-start print:bg-white print:p-0">
      <div className="receipt-print-sheet w-full max-w-sm rounded-lg bg-white p-4 font-mono text-black shadow-2xl print:mx-auto print:w-[72mm] print:max-w-[72mm] print:rounded-none print:p-0 print:text-[10px] print:shadow-none">
        <div className="border-b border-dashed border-black pb-2 text-center">
          <p className="text-base font-bold uppercase tracking-[0.2em]">{storeName || 'POS STORE'}</p>
          {storeAddress && <p className="mt-1 text-[10px] uppercase leading-tight">{storeAddress}</p>}
          {storePhone && <p className="mt-0.5 text-[10px] uppercase font-bold">TEL: {storePhone}</p>}
          <p className="mt-2 text-[11px] border-t border-black/20 pt-1 inline-block uppercase">POS SALES RECEIPT</p>
        </div>

        <div className="mt-2 space-y-1 text-xs leading-4">
          <p className="flex items-center justify-between gap-3">
            <span>Order #</span>
            <span className="font-semibold">{orderData?.id ?? 'N/A'}</span>
          </p>
          <p className="flex items-center justify-between gap-3">
            <span>Date</span>
            <span className="font-semibold">{formatDateTime(orderData?.date_created || orderData?.date)}</span>
          </p>
          <p className="flex items-center justify-between gap-3">
            <span>Payment</span>
            <span className="font-semibold">{paymentTitle}</span>
          </p>
          {customerName && (
            <>
              <p className="flex items-center justify-between gap-3">
                <span>Customer</span>
                <span className="font-semibold">{customerName}</span>
              </p>
            </>
          )}
        </div>

        <div className="mt-3 border-y border-dashed border-black py-2">
          <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide">
            <span>Item</span>
            <span>Amount</span>
          </div>

          <div className="space-y-1.5 text-xs leading-4">
            {lineItems.length === 0 && (
              <p className="text-center text-xs text-black/60">No items found.</p>
            )}

            {lineItems.map((item, index) => {
              const quantity = item.quantity ?? 1;
              const itemPrice = Number.parseFloat(item.price ?? item.total ?? 0) || 0;
              const lineTotal = item.total ? Number.parseFloat(item.total) || 0 : itemPrice * quantity;
              const itemName = item.name || item.product_name || `Item ${index + 1}`;

              return (
                <div key={`${item.id ?? index}-${index}`} className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{itemName}</p>
                    <p className="text-[10px] text-black/70">
                      {quantity} x {formatPkr(itemPrice)}
                    </p>
                  </div>
                  <p className="whitespace-nowrap font-semibold">{formatPkr(lineTotal)}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between border-b border-dashed border-black pb-2 text-sm font-bold">
          <span>GRAND TOTAL</span>
          <span>{formatPkr(totalValue)}</span>
        </div>

        <p className="mt-2 text-center text-[10px] text-black/70">Thank you for shopping with us</p>

        <div className="mt-3 space-y-2">
          <button
            type="button"
            onClick={handlePrint}
            className="w-full rounded-lg bg-black px-4 py-3 text-sm font-bold text-white transition hover:bg-black/80 print:hidden"
          >
            Print Receipt
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg border border-black px-4 py-3 text-sm font-bold text-black transition hover:bg-black hover:text-white print:hidden"
          >
            New Sale
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default ReceiptModal;
