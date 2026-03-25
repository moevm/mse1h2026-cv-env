import React, { useMemo, useState, useEffect } from "react";
import ImageGallery from "./ImageGallery";
import ImageViewer from "./ImageViewer";

import useAnnotations from "../../hooks/useAnnotations";
import { exportDataset } from "../../services/api";
import { annotationToYoloLine } from "../../utils/yolo";

import "../../styles/AnnotationView.css";

function getImageSize(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
      URL.revokeObjectURL(url);
    };

    image.onerror = (error) => {
      URL.revokeObjectURL(url);
      reject(error);
    };

    image.src = url;
  });
}

function parseClassIdsFromTxt(txtContent) {
  if (!txtContent) {
    return [];
  }

  return txtContent
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => Number(line.split(/\s+/u)[0]))
    .filter((value) => Number.isInteger(value) && value >= 0);
}

function AnnotationView({ collection, versions, currentVersionId }) {
  const [currentImage, setCurrentImage] = useState(null);
  const [showViewer, setShowViewer] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const annotationsManager = useAnnotations(collection?.id);

  useEffect(() => {
    setCurrentImage(null);
    setShowViewer(false);
    setSaveMessage("");
  }, [collection?.id, currentVersionId]);

  const currentVersion = versions.find((v) => v.id === currentVersionId);
  const images = currentVersion?.images || collection?.images || [];
  const galleryImages = images.map((image) => ({
    ...image,
    isMarked:
      Boolean(image.annotationFile) ||
      annotationsManager.getAnnotationsByImage(image.relativePath).length > 0,
  }));

  const classesById = useMemo(
    () => new Map(annotationsManager.classes.map((item, index) => [item.id, index])),
    [annotationsManager.classes],
  );

  async function handleSaveDataset() {
    if (!collection || images.length === 0) {
      return;
    }

    try {
      setIsSaving(true);
      setSaveMessage("");

      const items = [];
      const allUsedClassIds = new Set();

      for (const image of images) {
        const { width, height } = await getImageSize(image.file);
        const existingTxt = image.annotationFile ? await image.annotationFile.text() : "";
        const drawnAnnotations = annotationsManager.getAnnotationsByImage(image.relativePath);

        const drawnLines = drawnAnnotations
          .map((annotation) => {
            const classIndex = classesById.get(annotation.classId);
            if (classIndex != null) {
              allUsedClassIds.add(classIndex);
            }
            return annotationToYoloLine(annotation, classIndex, width, height);
          })
          .filter(Boolean);

        parseClassIdsFromTxt(existingTxt).forEach((classId) => allUsedClassIds.add(classId));

        const mergedLines = [
          ...new Set([
            ...existingTxt
              .split(/\r?\n/u)
              .map((line) => line.trim())
              .filter(Boolean),
            ...drawnLines,
          ]),
        ].join("\n");

        items.push({
          file: image.file,
          relativePath: image.relativePath,
          annotationTxt: mergedLines,
        });
      }

      const maxClassId = allUsedClassIds.size > 0 ? Math.max(...allUsedClassIds) : -1;
      const classNames = [...annotationsManager.classes.map((item) => item.name)];

      for (let index = classNames.length; index <= maxClassId; index += 1) {
        classNames[index] = `class_${index}`;
      }

      const response = await exportDataset({
        collectionName: collection.name,
        classes: classNames,
        items,
      });

      setSaveMessage(`Датасет сохранён: ${response.dataset_path}`);
    } catch (error) {
      console.error(error);
      setSaveMessage(`Ошибка сохранения: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  }

  function handleImageClick(image) {
    setCurrentImage(image);
    setShowViewer(true);
  }

  function handleCloseViewer() {
    setShowViewer(false);
    setCurrentImage(null);
  }

  function handleNextImage() {
    if (currentImage && images.length > 0) {
      const currentIndex = images.findIndex(
        (img) => img.relativePath === currentImage.relativePath,
      );
      if (currentIndex < images.length - 1) {
        setCurrentImage(images[currentIndex + 1]);
      }
    }
  }

  function handlePrevImage() {
    if (currentImage && images.length > 0) {
      const currentIndex = images.findIndex(
        (img) => img.relativePath === currentImage.relativePath,
      );
      if (currentIndex > 0) {
        setCurrentImage(images[currentIndex - 1]);
      }
    }
  }

  if (!collection) {
    return (
      <div className="annotation-view empty">
        <h2>Выберите коллекцию для разметки</h2>
      </div>
    );
  }

  const currentIndex = currentImage
    ? images.findIndex((img) => img.relativePath === currentImage.relativePath)
    : -1;

  return (
    <div className="annotation-view">
      <div className="annotation-header">
        <div>
          <h2>{collection.name}</h2>
          {currentVersion ? (
            <div className="version-info">
              Версия: {currentVersion.name} • {images.length} изображений
            </div>
          ) : (
            <div className="version-info">Всего изображений: {images.length}</div>
          )}
        </div>
        <div className="annotation-actions">
          <button
            className="action-button primary"
            onClick={handleSaveDataset}
            disabled={isSaving || images.length === 0}
          >
            {isSaving ? "Сохранение..." : "Сохранить bbox в datasets"}
          </button>
        </div>
      </div>

      {saveMessage && <div className="annotation-save-message">{saveMessage}</div>}

      <ImageGallery images={galleryImages} onImageClick={handleImageClick} />

      {showViewer && currentImage && (
        <ImageViewer
          image={currentImage}
          onClose={handleCloseViewer}
          onNext={handleNextImage}
          onPrev={handlePrevImage}
          hasNext={currentIndex < images.length - 1}
          hasPrev={currentIndex > 0}
          annotationsManager={annotationsManager}
        />
      )}
    </div>
  );
}

export default AnnotationView;
