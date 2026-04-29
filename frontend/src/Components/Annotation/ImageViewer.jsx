import React, { useState, useEffect } from "react";
import ImageAnnotator from "./ImageAnnotator";
import { parseTxtAnnotations } from "../../utils/txtAnnotationParser";
import { getImageUrl } from "../../services/api.js";
import "../../styles/AnnotationView.css";

function ImageViewer({
  image,
  collection,
  onClose,
  onNext,
  onPrev,
  hasNext,
  hasPrev,
  annotationsManager,
}) {
  const [currentUrl, setCurrentUrl] = useState(null);
  const [txtAnnotations, setTxtAnnotations] = useState([]);

  // Функция для преобразования индексов классов в ID
  const convertIndexToClassId = (classIndex, classes) => {
    // Если индекс существует в массиве классов
    if (classIndex >= 0 && classIndex < classes.length) {
      return classes[classIndex].id;
    }
    return null;
  };

  // Функция для преобразования всех аннотаций
  const convertAnnotationsIndicesToIds = (annotations, classes) => {
    const converted = [];
    for (const ann of annotations) {
      const classId = convertIndexToClassId(ann.classId, classes);
      if (classId) {
        converted.push({
          ...ann,
          classId: classId,
        });
      } else {
        console.warn(`Класс с индексом ${ann.classId} не найден, аннотация пропущена`);
      }
    }
    return converted;
  };

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
          previewImage.src = imageUrl;
        });
        
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
  }, [image, collection, annotationsManager.classes]);

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
        {isLoading ? (
          <div className="viewer-loading">
            <div className="spinner"></div>
            <p>Загрузка разметки...</p>
          </div>
        ) : (
          <ImageAnnotator
            imageUrl={currentUrl}
            imageId={image.uuid || image.relativePath || image.id}
            imageName={image.name || image.originalName}
            datasetName={collection?.name}
            externalAnnotations={txtAnnotations}
            onClose={onClose}
            annotationsManager={annotationsManager}
          />
        )}
      </div>
    </div>
  );
}

export default ImageViewer;