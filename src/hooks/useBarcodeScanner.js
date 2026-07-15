import { useEffect, useRef, useCallback } from 'react';
import { normalizeBarcode } from '../utils/barcodeUtils';

/**
 * A highly robust, hardware-agnostic global listener for barcode scanners.
 * It intercepts rapid keystrokes globally, preventing the need for the user
 * to have a specific input field focused.
 * 
 * @param {Object} options
 * @param {Function} options.onScan - Callback triggered when a barcode is successfully parsed.
 * @param {number} [options.maxInterval=40] - Max milliseconds between keystrokes to be considered a scanner.
 * @param {number} [options.minLength=3] - Minimum length of a valid barcode.
 */
export const useBarcodeScanner = ({ onScan, maxInterval = 40, minLength = 3 }) => {
  const buffer = useRef('');
  const lastKeyTime = useRef(0);
  const timeoutRef = useRef(null);

  const handleKeyDown = useCallback((e) => {
    // Ignore modifier keys
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    if (e.key === 'Enter') {
      const now = performance.now();
      const timeDiff = now - lastKeyTime.current;
      
      // If Enter is pressed rapidly after the last key, it's definitely a scanner
      if (timeDiff <= maxInterval && buffer.current.length >= minLength) {
        e.preventDefault(); 
        e.stopPropagation();
        const code = normalizeBarcode(buffer.current);
        buffer.current = '';
        if (onScan) onScan(code);
      } else {
        // Normal human enter key press, or scanner buffer too short
        buffer.current = '';
      }
      return;
    }

    // Reset buffer on non-character keys (e.g. Backspace, ArrowUp, Escape)
    if (e.key.length > 1) {
      buffer.current = '';
      return;
    }

    const now = performance.now();
    const timeDiff = now - lastKeyTime.current;
    
    if (timeDiff > maxInterval) {
      // Too slow, it's a human typing. Start a new buffer.
      buffer.current = e.key;
    } else {
      // Rapid typing, append to buffer
      buffer.current += e.key;
    }
    
    lastKeyTime.current = now;

    // Clear buffer if it hangs without an Enter key
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      buffer.current = '';
    }, maxInterval * 3);

  }, [maxInterval, minLength, onScan]);

  useEffect(() => {
    // Use capture phase to intercept the Enter key before focused inputs process it
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [handleKeyDown]);
};
