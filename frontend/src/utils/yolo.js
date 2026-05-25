function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function rectangleToBbox(annotation) {
  return {
    x: annotation.x,
    y: annotation.y,
    width: annotation.width,
    height: annotation.height,
  };
}

export function annotationToYoloLine(annotation, classIndex, imageWidth, imageHeight) {
  if (!imageWidth || !imageHeight || classIndex == null) {
    return null;
  }

  // Полигон -> YOLO-segmentation: class x1 y1 x2 y2 ... xn yn (нормализованные точки контура).
  if (annotation.type === "polygon") {
    if (!annotation.points || annotation.points.length < 3) {
      return null;
    }
    const coords = [];
    for (const point of annotation.points) {
      coords.push(clamp(point.x / imageWidth, 0, 1));
      coords.push(clamp(point.y / imageHeight, 0, 1));
    }
    return [String(classIndex), ...coords.map((value) => Number(value).toFixed(6))].join(" ");
  }

  // Прямоугольник -> YOLO-detection: class cx cy w h.
  if (annotation.type !== "rectangle") {
    return null;
  }
  const bbox = rectangleToBbox(annotation);
  if (!bbox || bbox.width <= 0 || bbox.height <= 0) {
    return null;
  }

  const centerX = clamp((bbox.x + bbox.width / 2) / imageWidth, 0, 1);
  const centerY = clamp((bbox.y + bbox.height / 2) / imageHeight, 0, 1);
  const width = clamp(bbox.width / imageWidth, 0, 1);
  const height = clamp(bbox.height / imageHeight, 0, 1);

  return [classIndex, centerX, centerY, width, height]
    .map((value, index) => (index === 0 ? String(value) : Number(value).toFixed(6)))
    .join(" ");
}
