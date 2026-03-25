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

function polygonToBbox(annotation) {
  const xs = annotation.points.map((point) => point.x);
  const ys = annotation.points.map((point) => point.y);

  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function annotationToYoloLine(annotation, classIndex, imageWidth, imageHeight) {
  if (!imageWidth || !imageHeight || classIndex == null) {
    return null;
  }

  let bbox = null;

  if (annotation.type === "rectangle") {
    bbox = rectangleToBbox(annotation);
  } else if (annotation.type === "polygon" && annotation.points?.length >= 3) {
    bbox = polygonToBbox(annotation);
  }

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
