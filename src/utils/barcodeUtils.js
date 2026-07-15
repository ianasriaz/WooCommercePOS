/**
 * Calculates the EAN-13 checksum digit for a 12-digit string.
 * @param {string} payload - A 12-digit numeric string
 * @returns {number} The checksum digit (0-9)
 */
export const calculateEAN13Checksum = (payload) => {
  if (!/^\d{12}$/.test(payload)) {
    throw new Error('EAN-13 payload must be exactly 12 digits.');
  }

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(payload[i], 10);
    // EAN-13 standard: Even indices (0, 2...) are odd positions -> multiplier 1
    // Odd indices (1, 3...) are even positions -> multiplier 3
    sum += digit * (i % 2 === 0 ? 1 : 3);
  }

  const remainder = sum % 10;
  return remainder === 0 ? 0 : 10 - remainder;
};

/**
 * Auto-generates a highly unique, globally valid EAN-13 barcode.
 * Uses '20' as the GS1 prefix (Restricted distribution / Internal store use).
 * 
 * @param {number|string} productId - The main WooCommerce product ID
 * @param {number|string} [variationId] - Optional variation ID
 * @returns {string} A valid 13-digit EAN-13 barcode
 */
export const generateStoreEAN13 = (productId, variationId = null) => {
  const prefix = '20'; // Standard prefix for internal store barcodes
  
  // Create a predictable but highly unique 10-digit middle block
  const idStr = String(productId).padStart(5, '0');
  const varStr = variationId ? String(variationId).padStart(5, '0') : String(Math.floor(Math.random() * 99999)).padStart(5, '0');
  
  // Ensure we strictly enforce 5 digits per block to maintain the 12 digit payload
  const safeIdStr = idStr.slice(-5);
  const safeVarStr = varStr.slice(-5);
  
  const payload = `${prefix}${safeIdStr}${safeVarStr}`;
  const checksum = calculateEAN13Checksum(payload);
  
  return `${payload}${checksum}`;
};

/**
 * Normalizes an unknown barcode/SKU string for robust hash-map matching.
 * Strips whitespace, forces lowercase, and removes invisible characters.
 */
export const normalizeBarcode = (code) => {
  return String(code || '').trim().toLowerCase().replace(/[\s\u200B-\u200D\uFEFF]+/g, '');
};
