import React, { useMemo, useState, useEffect } from "react";
import ImageGallery from "./ImageGallery";
import ImageViewer from "./ImageViewer";

import useAnnotations from "../../hooks/useAnnotations";
import { getDisabledFolderPaths, serializeFolders} from "../../utils/fileSystem";
import { exportDataset, updateProjectOnBackend } from "../../services/api";
import { annotationToYoloLine } from "../../utils/yolo";

import "../../styles/AnnotationView.css";

const DEFAULT_TRAIN_SPLIT_PERCENT = 80;

function getImageSize(image) {
  return new Promise((resolve, reject) => {
    const previewImage = new Image();

    previewImage.onload = () => resolve({ width: previewImage.naturalWidth, height: previewImage.naturalHeight });
    previewImage.onerror = (error) => reject(error);

    previewImage.src = image.url;
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

  const annotationsManager = useAnnotations(collection?.id);

  useEffect(() => {
    setCurrentImage(null);
    setShowViewer(false);
    setSaveMessage("");
  }, [collection?.id, currentVersionId]);

  useEffect(() => {
    if (!collection || !annotationsManager.classes.length) return;

    const timeoutId = setTimeout(() => {
      const payload = {
        id: collection.id,
        name: collection.name,
        path: collection.workspacePath,
        folders: collection.folders ? serializeFolders(collection.folders) : [],
        classes: annotationsManager.classes
      };

      updateProjectOnBackend(payload).catch(console.error);
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [annotationsManager.classes, collection]);

  const currentVersion = versions.find((v) => v.id === currentVersionId);

  const ignoredPaths = useMemo(() => {
    return collection?.folders ? getDisabledFolderPaths(collection.folders) : [];
  }, [collection?.folders]);

  const images = useMemo(() => {
    const baseImages = currentVersion?.images || collection?.images || [];
    if (ignoredPaths.length === 0) return baseImages;

    return baseImages.filter(img => {
      return !ignoredPaths.some(ignoredPath => img.relativePath.startsWith(ignoredPath + '/'));
    });
  }, [collection?.images, currentVersion?.images, ignoredPaths]);

  const galleryImages = images.map((image) => ({
    ...image,
    isMarked:
      Boolean(image.annotationFile) ||
      Boolean(image.annotationText) ||
      annotationsManager.getAnnotationsByImage(image.relativePath).length > 0,
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
        const size = await getImageSize(image);
        
        const existingTxt = image.annotationFile
          ? await image.annotationFile.text()
          : image.annotationText || "";
        const drawnAnnotations = annotationsManager.getAnnotationsByImage(image.relativePath);

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
          absolutePath: image.file.absolute_path,
          relativePath: image.relativePath,
          annotationTxt: mergedLines,
        });
      }

      const maxClassId = allUsedClassIds.size > 0 ? Math.max(...allUsedClassIds) : -1;
      const classNames = [...annotationsManager.classes.map((item) => item.name)];

      for (let index = classNames.length; index <= maxClassId; index += 1) {
        classNames[index] = `class_${index}`;
      }

      const activeFolders = collection.folders ? collection.folders.filter(f => f.isEnabled) : [];
      if (activeFolders.length === 0) {
        setSaveMessage("Нет активных папок для сохранения.");
        setIsSaving(false);
        return;
      }

      let foldersSaved = 0;
      let lastResponse = null;

      for (const folder of activeFolders) {
        const folderItemsRaw = items.filter(item => 
          item.relativePath.startsWith(folder.path + '/') || item.relativePath === folder.path
        );

        if (folderItemsRaw.length === 0) continue;

        const folderItemsCleaned = folderItemsRaw.map(item => {
          let cleanPath = item.relativePath;
          
          if (cleanPath.startsWith(folder.path + '/')) {
            cleanPath = cleanPath.substring(folder.path.length + 1);
          } else if (cleanPath === folder.path) {
            cleanPath = cleanPath.split('/').pop();
          }

          return {
            ...item,
            relativePath: cleanPath
          };
        });

        lastResponse = await exportDataset({
          collectionName: collection.name,
          workspacePath: collection.workspacePath,
          subFolderName: folder.name, 
          classes: classNames,
          items: folderItemsCleaned,
          trainPercent: trainSplitPercent,
        });
        
        foldersSaved++;
      }

      if (foldersSaved > 0 && lastResponse) {
        onCollectionUpdate?.(collection.id, {
          persisted: true,
          datasetName: lastResponse.dataset_name,
          datasetYamlPath: lastResponse.dataset_yaml_path,
          trainSplitPercent: lastResponse.train_percent,
          valSplitPercent: lastResponse.val_percent,
          projectClasses: annotationsManager.classes
        });
        setSaveMessage(`Успешно! Экспортировано папок: ${foldersSaved}`);
      } else {
        setSaveMessage("Не найдено изображений для экспорта в активных папках.");
      }

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
