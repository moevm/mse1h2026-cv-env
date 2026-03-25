import React, { useState, useEffect, useRef } from "react";
import ImageAnnotator from "./ImageAnnotator";
import { parseTxtAnnotations } from "../../utils/txtAnnotationParser";
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
  const urlsRef = useRef([]);

  useEffect(() => {
    if (!image) return;

    let isActive = true;
    const file = image.file;
    const newUrl = URL.createObjectURL(file);
    urlsRef.current.push(newUrl);
    setCurrentUrl(newUrl);

    const loadTxtAnnotations = async () => {
      if (!image.annotationFile) {
        if (isActive) {
          setTxtAnnotations([]);
        }
        return;
      }

      try {
        const [txtContent, imageSize] = await Promise.all([
          image.annotationFile.text(),
          new Promise((resolve, reject) => {
            const previewImage = new Image();
            previewImage.onload = () => {
              resolve({ width: previewImage.naturalWidth, height: previewImage.naturalHeight });
            };
            previewImage.onerror = reject;
            previewImage.src = newUrl;
          }),
        ]);

        if (!isActive) return;

        setTxtAnnotations(parseTxtAnnotations(txtContent, imageSize.width, imageSize.height));
      } catch (error) {
        console.error("Не удалось прочитать txt-разметку:", error);
        if (isActive) {
          setTxtAnnotations([]);
        }
      }
    };

    loadTxtAnnotations();

    return () => {
      isActive = false;
    };
  }, [image]);

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
