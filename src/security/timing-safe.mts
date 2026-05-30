const textEncoder = new TextEncoder();

/**
 * Compares two strings in a timing-resistant way.
 *
 * The implementation walks both encoded byte arrays to avoid early exits on
 * mismatches. It returns `true` only when the full byte sequences match.
 */
export const timingSafeEqual = (a: string, b: string): boolean => {
  const left = textEncoder.encode(a);
  const right = textEncoder.encode(b);

  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index++) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }

  return diff === 0;
};
