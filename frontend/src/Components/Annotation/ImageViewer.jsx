import React, { useState, useEffect } from "react";
import ImageAnnotator from "./ImageAnnotator";
import { parseTxtAnnotations } from "../../utils/txtAnnotationParser";
import { readTextFileSafe } from "../../services/api.js";
import "../../styles/AnnotationView.css";

function ImageViewer({ image, collection, onClose, onNext, onPrev, hasNext, hasPrev, annotationsManager, onSaveAnnotation }) {
  const [currentUrl, setCurrentUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const [currentTool, setCurrentTool] = useState(null);

  const convertIndexToClassId = (classIndex, classes) => {
    if (classIndex >= 0 && classIndex < classes.length) return classes[classIndex].id;
    return null;
  };

  const convertAnnotationsIndicesToIds = (annotations, classes) => {
    const converted = [];
    for (const ann of annotations) {
      const classId = convertIndexToClassId(ann.classId, classes);
      if (classId) converted.push({ ...ann, classId: classId });
    }
    return converted;
  };

  useEffect(() => {
    if (!image || !annotationsManager.isReady) return;
    let isActive = true;
    setCurrentUrl(image.url);

    const loadTxtAnnotations = async () => {
      setIsLoading(true);
      try {
        const imageSize = await new Promise((resolve, reject) => {
          const previewImage = new Image();
          previewImage.onload = () => resolve({ width: previewImage.naturalWidth, height: previewImage.naturalHeight });
          previewImage.onerror = reject;
          previewImage.src = image.url;
        });

        let txtContent = image.annotationText || "";
        if (!txtContent && image.annotationFile) {
          const filePath = image.annotationFile.absolute_path || image.annotationFile.absolutePath;
          if (filePath) txtContent = await readTextFileSafe(filePath);
        }

        if (isActive) {
          const parsed = txtContent ? parseTxtAnnotations(txtContent, imageSize.width, imageSize.height) : [];
          const withIds = convertAnnotationsIndicesToIds(parsed, annotationsManager.classes);
          annotationsManager.setInitialAnnotations(image.uuid || image.relativePath || image.id, withIds);
        }
      } catch (error) {
        console.error("Не удалось прочитать txt-разметку:", error);
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    loadTxtAnnotations();
    return () => { isActive = false; };
  }, [image, annotationsManager.isReady]); 

  if (!image) return null;

  return (
    <div className="image-viewer-overlay">
      <div className="image-viewer">
        <div className="viewer-navigation">
          {hasPrev && <button className="nav-button prev" onClick={onPrev}>‹</button>}
          {hasNext && <button className="nav-button next" onClick={onNext}>›</button>}
        </div>
        {isLoading || !annotationsManager.isReady ? (
          <div className="viewer-loading">
            <div className="spinner"></div><p>Загрузка разметки...</p>
          </div>
        ) : (
          <ImageAnnotator
            imageUrl={currentUrl}
            imageId={image.uuid || image.relativePath || image.id}
            imageName={image.name || image.originalName}
            imageAbsPath={image.absolutePath || image.file?.absolute_path}
            imageRelativePath={image.relativePath}
            datasetName={collection?.name}
            workspacePath={collection?.workspacePath}
            onClose={onClose}
            annotationsManager={annotationsManager}
            onSaveAnnotation={onSaveAnnotation}
            currentTool={currentTool}
            setCurrentTool={setCurrentTool}
          />
        )}
      </div>
    </div>
  );
}

export default ImageViewer;