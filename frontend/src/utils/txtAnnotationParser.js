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

      const rawClassId = parts[0];
      const coords = parts.slice(1).map(Number);
      if (coords.some((value) => Number.isNaN(value))) {
        return null;
      }

      // Полигон (YOLO-segmentation): class x1 y1 ... xn yn — чётное число координат >= 6.
      if (coords.length >= 6 && coords.length % 2 === 0) {
        const allNormalized = coords.every((value) => value >= 0 && value <= 1);
        const points = [];
        for (let i = 0; i < coords.length; i += 2) {
          points.push({
            x: allNormalized ? coords[i] * imageWidth : coords[i],
            y: allNormalized ? coords[i + 1] * imageHeight : coords[i + 1],
          });
        }
        return {
          id: `txt-${rawClassId}-${index}`,
          type: 'polygon',
          classId: rawClassId,
          points,
        };
      }

      // Прямоугольник (YOLO-detection): class cx cy w h.
      const [a, b, c, d] = coords;
      const isNormalized =
        a >= 0 && a <= 1 && b >= 0 && b <= 1 && c >= 0 && c <= 1 && d >= 0 && d <= 1;

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
