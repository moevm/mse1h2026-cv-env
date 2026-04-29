import React, { useState, useEffect } from "react";
import ImageAnnotator from "./ImageAnnotator";
import { parseTxtAnnotations } from "../../utils/txtAnnotationParser";
import { getImageUrl } from "../../services/api.js";
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
  const [txtAnnotations, setTxtAnnotations] = useState([]);

  useEffect(() => {
    if (!image) return;

    let isActive = true;
    
    const newUrl = image.url; 
    setCurrentUrl(newUrl);

    const loadTxtAnnotations = async () => {
      const hasInlineText = typeof image.annotationText === "string" && image.annotationText.length > 0;
      if (!hasInlineText && !image.annotationFile) {
        if (isActive) setTxtAnnotations([]);
        return;
      }

      try {
        const txtPromise = hasInlineText 
          ? Promise.resolve(image.annotationText) 
          : fetch(getImageUrl(image.annotationFile.absolute_path)).then(res => res.text());

        const sizePromise = new Promise((resolve, reject) => {
          const previewImage = new Image();
          previewImage.onload = () => resolve({ width: previewImage.naturalWidth, height: previewImage.naturalHeight });
          previewImage.onerror = reject;
          previewImage.src = newUrl;
        });

        const [txtContent, imageSize] = await Promise.all([txtPromise, sizePromise]);

        if (!isActive) return;
        setTxtAnnotations(parseTxtAnnotations(txtContent, imageSize.width, imageSize.height));
      } catch (error) {
        console.error("Не удалось прочитать txt-разметку:", error);
        if (isActive) setTxtAnnotations([]);
      }
    };

    loadTxtAnnotations();

    return () => {
      isActive = false;
    };
  }, [image]);

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
          imageId={image.relativePath}
          imageName={image.name}
          externalAnnotations={txtAnnotations}
          onClose={onClose}
          annotationsManager={annotationsManager}
        />
      </div>
    </div>
  );
}

export default ImageViewer;