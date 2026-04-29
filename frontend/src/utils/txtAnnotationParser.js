const FALLBACK_COLORS = [
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#96CEB4',
  '#FFEEAD',
  '#D4A5A5',
  '#9B59B6',
  '#3498DB',
  '#E67E22',
  '#2ECC71',
];

function getColorByClassKey(classKey) {
  const normalized = String(classKey ?? 'unknown');
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  }
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

export function parseTxtAnnotations(txtContent, imageWidth, imageHeight) {
  if (!txtContent || !imageWidth || !imageHeight) {
    return [];
  }

  return txtContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.split(/\s+/);
      if (parts.length < 5) {
        return null;
      }

      const [rawClassId, rawA, rawB, rawC, rawD] = parts;
      const a = Number(rawA);
      const b = Number(rawB);
      const c = Number(rawC);
      const d = Number(rawD);

      if ([a, b, c, d].some((value) => Number.isNaN(value))) {
        return null;
      }

      const isNormalized =
        a >= 0 && a <= 1 &&
        b >= 0 && b <= 1 &&
        c >= 0 && c <= 1 &&
        d >= 0 && d <= 1;

      let x;
      let y;
      let width;
      let height;

      if (isNormalized) {
        width = c * imageWidth;
        height = d * imageHeight;
        x = a * imageWidth - width / 2;
        y = b * imageHeight - height / 2;
      } else {
        x = a;
        y = b;
        width = c;
        height = d;
      }

      return {
        id: `txt-${rawClassId}-${index}`,
        type: 'rectangle',
        classId: rawClassId, 
        x,
        y,
        width,
        height,
      };
    })
    .filter(Boolean);
}
