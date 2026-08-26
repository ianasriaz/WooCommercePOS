import { createPortal } from 'react-dom';
import { useAuthStore } from '../store/useAuthStore';
import { formatOrderDateTime } from '../utils/date-utils';

const currencyFormatter = new Intl.NumberFormat('en-PK', {
  style: 'currency',
  currency: 'PKR',
});

const formatPkr = (value) => currencyFormatter.format(Number.parseFloat(value) || 0);

const formatDateTime = (value) => formatOrderDateTime(value);

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
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(15,23,42,0.7)', padding: '16px'
    }} className="receipt-print-overlay">
      <div style={{
        width: '100%', maxWidth: '384px', background: '#fff',
        borderRadius: '8px', padding: '16px', color: '#000',
        fontFamily: 'monospace', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
      }} className="receipt-print-sheet">
        <div style={{ borderBottom: '1px dashed #000', paddingBottom: '8px', textAlign: 'center' }}>
          <p style={{ fontSize: '16px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.2em', margin: 0 }}>
            {storeName || 'POS STORE'}
          </p>
          {storeAddress && <p style={{ whiteSpace: 'pre-wrap', marginTop: '4px', fontSize: '10px', textTransform: 'uppercase', lineHeight: 1.2, margin: '4px 0 0' }}>{storeAddress}</p>}
          {storePhone && <p style={{ marginTop: '2px', fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold', margin: '2px 0 0' }}>TEL: {storePhone}</p>}
          <p style={{ marginTop: '8px', fontSize: '11px', borderTop: '1px solid rgba(0,0,0,0.2)', paddingTop: '4px', display: 'inline-block', textTransform: 'uppercase', margin: '8px 0 0' }}>
            POS SALES RECEIPT
          </p>
        </div>

        <div style={{ marginTop: '8px', fontSize: '12px', lineHeight: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <p style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: 0 }}>
            <span>Order #</span>
            <span style={{ fontWeight: 600 }}>{orderData?.id ?? 'N/A'}</span>
          </p>
          <p style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: 0 }}>
            <span>Date</span>
            <span style={{ fontWeight: 600 }}>{formatDateTime(orderData?.date_created || orderData?.date)}</span>
          </p>
          <p style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: 0 }}>
            <span>Payment</span>
            <span style={{ fontWeight: 600 }}>{paymentTitle}</span>
          </p>
          {customerName && (
            <p style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: 0 }}>
              <span>Customer</span>
              <span style={{ fontWeight: 600 }}>{customerName}</span>
            </p>
          )}
        </div>

        <div style={{ marginTop: '12px', borderTop: '1px dashed #000', borderBottom: '1px dashed #000', paddingTop: '8px', paddingBottom: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
            <span>Item</span>
            <span>Amount</span>
          </div>

          <div style={{ fontSize: '12px', lineHeight: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {lineItems.length === 0 && (
              <p style={{ textAlign: 'center', fontSize: '12px', color: 'rgba(0,0,0,0.6)', margin: 0 }}>No items found.</p>
            )}

            {lineItems.map((item, index) => {
              const quantity = item.quantity ?? 1;
              const itemPrice = Number.parseFloat(item.price ?? item.total ?? 0) || 0;
              const lineTotal = item.total ? Number.parseFloat(item.total) || 0 : itemPrice * quantity;
              const itemName = item.name || item.product_name || `Item ${index + 1}`;

              return (
                <div key={`${item.id ?? index}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 600, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{itemName}</p>
                    <p style={{ fontSize: '10px', color: 'rgba(0,0,0,0.7)', margin: 0 }}>
                      {quantity} x {formatPkr(itemPrice)}
                    </p>
                  </div>
                  <p style={{ fontWeight: 600, margin: 0, whiteSpace: 'nowrap' }}>{formatPkr(lineTotal)}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px dashed #000', paddingBottom: '8px', fontSize: '14px', fontWeight: 'bold' }}>
          <span>GRAND TOTAL</span>
          <span>{formatPkr(totalValue)}</span>
        </div>

        <p style={{ marginTop: '8px', textAlign: 'center', fontSize: '10px', color: 'rgba(0,0,0,0.7)', margin: '8px 0 0' }}>Thank you for shopping with us</p>

        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }} className="receipt-controls">
          <button
            type="button"
            onClick={handlePrint}
            style={{ width: '100%', borderRadius: '8px', background: '#000', padding: '12px 16px', fontSize: '14px', fontWeight: 'bold', color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            Print Receipt
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{ width: '100%', borderRadius: '8px', border: '1px solid #000', background: 'transparent', padding: '12px 16px', fontSize: '14px', fontWeight: 'bold', color: '#000', cursor: 'pointer' }}
          >
            New Sale
          </button>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          .receipt-print-overlay {
            position: static !important;
            align-items: flex-start !important;
            justify-content: flex-start !important;
            background: #fff !important;
            padding: 0 !important;
          }
          .receipt-print-sheet {
            margin: 0 auto !important;
            width: 72mm !important;
            max-width: 72mm !important;
            border-radius: 0 !important;
            padding: 0 !important;
            font-size: 10px !important;
            box-shadow: none !important;
          }
          .receipt-controls {
            display: none !important;
          }
        }
      `}} />
    </div>,
    document.body,
  );
}

export default ReceiptModal;
