import React, { useMemo, useState, useEffect } from "react";
import ImageGallery from "./ImageGallery";
import ImageViewer from "./ImageViewer";

import useAnnotations from "../../hooks/useAnnotations";
import { exportDataset } from "../../services/api";
import { annotationToYoloLine } from "../../utils/yolo";

import "../../styles/AnnotationView.css";

const DEFAULT_TRAIN_SPLIT_PERCENT = 80;


function getImageSize(image) {
  return new Promise((resolve, reject) => {
    const sourceUrl = image.url || URL.createObjectURL(image.file);
    const shouldRevoke = !image.url;
    const previewImage = new Image();

    previewImage.onload = () => {
      resolve({ width: previewImage.naturalWidth, height: previewImage.naturalHeight });
      if (shouldRevoke) {
        URL.revokeObjectURL(sourceUrl);
      }
    };

    previewImage.onerror = (error) => {
      if (shouldRevoke) {
        URL.revokeObjectURL(sourceUrl);
      }
      reject(error);
    };

    previewImage.src = sourceUrl;
  });
}

async function ensureImageFile(image) {
  if (image.file instanceof File) {
    return image.file;
  }

  if (!image.url) {
    throw new Error(`Не найден источник изображения ${image.uuid}`);
  }

  const response = await fetch(image.url);
  if (!response.ok) {
    throw new Error(`Не удалось загрузить изображение ${image.uuid}`);
  }

  const blob = await response.blob();
  return new File([blob], image.uuid, {
    type: blob.type || image.type || "application/octet-stream",
    lastModified: Date.now(),
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

function getSplitPreview(images, trainPercent) {
  const imageCount = images.length;
  if (imageCount === 0) {
    return { trainCount: 0, valCount: 0 };
  }

  if (imageCount === 1) {
    return { trainCount: 1, valCount: 0 };
  }

  const rawTrainCount = Math.round(imageCount * (trainPercent / 100));
  const trainCount = Math.max(1, Math.min(imageCount - 1, rawTrainCount));
  return {
    trainCount,
    valCount: imageCount - trainCount,
  };
}

function AnnotationView({ collection, versions, currentVersionId, onCollectionUpdate }) {
  const [currentImage, setCurrentImage] = useState(null);
  const [showViewer, setShowViewer] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const annotationsManager = useAnnotations(collection?.id, collection?.name);

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
      Boolean(image.annotationText) ||
      annotationsManager.getAnnotationsByImage(image.uuid).length > 0,
  }));

  const trainSplitPercent = collection?.trainSplitPercent ?? DEFAULT_TRAIN_SPLIT_PERCENT;
  const valSplitPercent = 100 - trainSplitPercent;
  const { trainCount, valCount } = useMemo(
    () => getSplitPreview(images, trainSplitPercent),
    [images, trainSplitPercent],
  );

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
        const [size, imageFile] = await Promise.all([getImageSize(image), ensureImageFile(image)]);
        const existingTxt = image.annotationFile
          ? await image.annotationFile.text()
          : image.annotationText || "";
        const drawnAnnotations = annotationsManager.getAnnotationsByImage(image.uuid);

        const drawnLines = drawnAnnotations
          .map((annotation) => {
            const classIndex = classesById.get(annotation.classId);
            if (classIndex != null) {
              allUsedClassIds.add(classIndex);
            }
            return annotationToYoloLine(annotation, classIndex, size.width, size.height);
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
          file: imageFile,
          relativePath: image.uuid,
          annotationTxt: mergedLines,
        });
      }

      const maxClassId = allUsedClassIds.size > 0 ? Math.max(...allUsedClassIds) : -1;
      const classNames = [...annotationsManager.classes.map((item) => item.name)];



      const response = await exportDataset({
        collectionName: collection.name,
        classes: classNames,
        items,
        trainPercent: trainSplitPercent,
      });

      onCollectionUpdate?.(collection.id, {
        persisted: true,
        datasetName: response.dataset_name,
        datasetYamlPath: response.dataset_yaml_path,
        trainSplitPercent: response.train_percent,
        valSplitPercent: response.val_percent,
      });

      setSaveMessage(
        `Датасет сохранён: ${response.dataset_path}. Train: ${response.split_counts.train}, Val: ${response.split_counts.val}`,
      );
    } catch (error) {
      console.error(error);
      setSaveMessage(`Ошибка сохранения: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  }

  function handleTrainSplitChange(event) {
    const nextTrainPercent = Number(event.target.value);
    onCollectionUpdate?.(collection.id, {
      trainSplitPercent: nextTrainPercent,
      valSplitPercent: 100 - nextTrainPercent,
    });
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
        (img) => img.relativePath === currentImage.uuid,
      );
      if (currentIndex < images.length - 1) {
        setCurrentImage(images[currentIndex + 1]);
      }
    }
  }

  function handlePrevImage() {
    if (currentImage && images.length > 0) {
      const currentIndex = images.findIndex(
        (img) => img.relativePath === currentImage.uuid,
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
    ? images.findIndex((img) => img.relativePath === currentImage.uuid)
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

      <div className="annotation-split-card">
        <div className="annotation-split-header">
          <div>
            <h3>Train / Val split</h3>
            <p>
              Этот параметр используется при экспорте датасета и попадает в структуру,
              совместимую с YOLO.
            </p>
          </div>
          <div className="annotation-split-percentages">
            <span>Train: {trainSplitPercent}%</span>
            <span>Val: {valSplitPercent}%</span>
          </div>
        </div>
        <input
          className="split-slider"
          type="range"
          min="50"
          max="95"
          step="5"
          value={trainSplitPercent}
          onChange={handleTrainSplitChange}
        />
        <div className="annotation-split-summary">
          <span>В train попадёт: {trainCount}</span>
          <span>В val попадёт: {valCount}</span>
        </div>
      </div>

      {saveMessage && <div className="annotation-save-message">{saveMessage}</div>}

      <ImageGallery images={galleryImages} onImageClick={handleImageClick} />

      {showViewer && currentImage && (
        <ImageViewer
          image={currentImage}
          collection={collection} 
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
