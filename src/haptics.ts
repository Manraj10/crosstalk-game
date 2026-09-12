/** Vega's glass also slams. This is the thumb she can still feel. */
export function buzz(pattern: number | number[] = [90, 60, 90]) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* desktop, or a browser that refuses */
  }
}
