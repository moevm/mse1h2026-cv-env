import React, { useState, useEffect, useRef } from "react";
import ImageAnnotator from "./ImageAnnotator";
import "../../styles/AnnotationView.css";

function ImageViewer({
  image,
  onClose,
  onNext,
  onPrev,
  hasNext,
  hasPrev,
  annotationsManager,
}) {
  const [currentUrl, setCurrentUrl] = useState(null);
  const urlsRef = useRef([]); // храним все созданные URL

  useEffect(() => {
    if (!image) return;

    const file = image.file;
    const newUrl = URL.createObjectURL(file);
    urlsRef.current.push(newUrl);
    setCurrentUrl(newUrl);
  }, [image]);

  // При размонтировании отзываем все созданные URL
  useEffect(() => {
    return () => {
      urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      urlsRef.current = [];
    };
  }, []);

  if (!image) return null;

  return (
    <div className="image-viewer-overlay">
      <div className="image-viewer">
        <div className="viewer-navigation">
          {hasPrev && (
            <button className="nav-button prev" onClick={onPrev}>
              ‹
            </button>
          )}
          {hasNext && (
            <button className="nav-button next" onClick={onNext}>
              ›
            </button>
          )}
        </div>
        <ImageAnnotator
          imageUrl={currentUrl}
          imageName={image.name}
          onClose={onClose}
          annotationsManager={annotationsManager}
        />
      </div>
    </div>
  );
}

export default ImageViewer;
