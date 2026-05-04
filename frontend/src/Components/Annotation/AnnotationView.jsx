import React, { useMemo, useState, useEffect } from "react";
import ImageGallery from "./ImageGallery";
import ImageViewer from "./ImageViewer";

import useAnnotations from "../../hooks/useAnnotations";
import { getDisabledFolderPaths } from "../../utils/fileSystem";
import { exportDataset, getImageUrl, readTextFileSafe, scanWorkspaceDatasets } from "../../services/api";
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
  if (!txtContent) return [];
  return txtContent.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean).map((line) => Number(line.split(/\s+/u)[0])).filter((value) => Number.isInteger(value) && value >= 0);
}

function getSplitPreview(images, trainPercent, valPercent) {
  const imageCount = images.length;
  if (imageCount === 0) return { trainCount: 0, valCount: 0, testCount: 0 };

  let remaining = imageCount;

  // Приоритет 1: Train
  let trainCount = Math.round(imageCount * (trainPercent / 100));
  // Если задан %, но при округлении вышел 0 — берем минимум 1
  if (trainPercent > 0 && trainCount === 0 && remaining > 0) trainCount = 1;
  trainCount = Math.min(trainCount, remaining);
  remaining -= trainCount;

  // Приоритет 2: Val
  let valCount = Math.round(imageCount * (valPercent / 100));
  if (valPercent > 0 && valCount === 0 && remaining > 0) valCount = 1;
  valCount = Math.min(valCount, remaining);
  remaining -= valCount;

  // Приоритет 3: Test (забирает всё, что осталось)
  let testCount = remaining;

  return { trainCount, valCount, testCount };
}

function AnnotationView({ collection, versions, currentVersionId, onCollectionUpdate }) {
  const [currentImage, setCurrentImage] = useState(null);
  const [showViewer, setShowViewer] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const [useDatasetSource, setUseDatasetSource] = useState(false);
  const [datasetImages, setDatasetImages] = useState([]);
  const [datasetLoading, setDatasetLoading] = useState(false);
  const [datasetRefreshKey, setDatasetRefreshKey] = useState(0);

  const annotationsManager = useAnnotations(collection?.workspacePath, collection?.projectClasses);

  useEffect(() => {
    setCurrentImage(null); setShowViewer(false); setSaveMessage("");
  }, [collection?.id, currentVersionId]);

  useEffect(() => {
    if (!collection) return;
    const currentClassesStr = JSON.stringify(collection.projectClasses || []);
    const newClassesStr = JSON.stringify(annotationsManager.classes);
    if (currentClassesStr !== newClassesStr && annotationsManager.isReady) {
      onCollectionUpdate?.(collection.id, { projectClasses: annotationsManager.classes });
    }
  }, [annotationsManager.classes, collection, onCollectionUpdate, annotationsManager.isReady]);

  const currentVersion = versions.find((v) => v.id === currentVersionId);

  // Загружаем файлы из datasets/ при включении режима или смене версии
  useEffect(() => {
    if (!useDatasetSource || !collection) {
      setDatasetImages([]);
      return;
    }
    setDatasetLoading(true);
    const cacheBuster = Date.now();
    scanWorkspaceDatasets(collection.workspacePath || "")
      .then(result => {
        const files = result.files || [];
        setDatasetImages(files.map(f => ({
          ...f,
          absolutePath: f.absolute_path,
          url: `${getImageUrl(f.absolute_path)}&_t=${cacheBuster}`,
          uuid: f.relativePath,
        })));
      })
      .catch((err) => { console.error("[datasets scan]", err); setDatasetImages([]); })
      .finally(() => setDatasetLoading(false));
  }, [useDatasetSource, collection?.id, currentVersionId, datasetRefreshKey]);

  const ignoredPaths = useMemo(() => {
    return collection?.folders ? getDisabledFolderPaths(collection.folders) : [];
  }, [collection?.folders]);

  const images = useMemo(() => {
    if (useDatasetSource) return datasetImages;
    const baseImages = currentVersion?.images || collection?.images || [];
    if (ignoredPaths.length === 0) return baseImages;
    return baseImages.filter(img => !ignoredPaths.some(ignoredPath => img.relativePath.startsWith(ignoredPath + '/')));
  }, [useDatasetSource, datasetImages, collection?.images, currentVersion?.images, ignoredPaths]);

  const galleryImages = images.map((image) => ({
    ...image,
    isMarked: Boolean(image.annotationFile) || Boolean(image.annotationText) || annotationsManager.getAnnotationsByImage(image.uuid || image.relativePath || image.id).length > 0,
  }));

  const trainSplitPercent = collection?.trainSplitPercent ?? 80;
  const valSplitPercent = collection?.valSplitPercent ?? 10;
  const testSplitPercent = collection?.testSplitPercent ?? 10;

  // Рассчитываем позиции ползунков (границы)
  const thumb1 = trainSplitPercent; 
  const thumb2 = trainSplitPercent + valSplitPercent;
  
  const { trainCount, valCount, testCount } = useMemo(() => 
    getSplitPreview(images, trainSplitPercent, valSplitPercent), 
    [images, trainSplitPercent, valSplitPercent]
  );

  // Обработка движения ползунков с "проталкиванием"
  const handleThumbChange = (index, value) => {
    let val = Math.max(0, Math.min(100, Number(value)));
    let newThumb1 = thumb1;
    let newThumb2 = thumb2;

    if (index === 1) {
      newThumb1 = val;
      // Если левый ползунок заходит за правый — толкаем правый вперед
      if (newThumb1 > newThumb2) newThumb2 = newThumb1;
    } else {
      newThumb2 = val;
      // Если правый ползунок заходит за левый — тянем левый назад
      if (newThumb2 < newThumb1) newThumb1 = newThumb2;
    }

    onCollectionUpdate?.(collection.id, {
      trainSplitPercent: newThumb1,
      valSplitPercent: newThumb2 - newThumb1,
      testSplitPercent: 100 - newThumb2,
    });
  };

  // Обработка ручного ввода (аналогичное проталкивание границ)
  const handleManualInput = (type, value) => {
    let numVal = Math.max(0, Math.min(100, Number(value) || 0));
    let newThumb1 = thumb1;
    let newThumb2 = thumb2;

    if (type === 'train') {
      newThumb1 = numVal;
      if (newThumb1 > newThumb2) newThumb2 = newThumb1;
    } else if (type === 'val') {
      // При изменении VAL мы фиксируем левую границу и двигаем только правую
      newThumb2 = Math.min(100, newThumb1 + numVal);
    } else if (type === 'test') {
      newThumb2 = 100 - numVal;
      if (newThumb1 > newThumb2) newThumb1 = newThumb2;
    }

    onCollectionUpdate?.(collection.id, {
      trainSplitPercent: newThumb1,
      valSplitPercent: newThumb2 - newThumb1,
      testSplitPercent: 100 - newThumb2,
    });
  };

  const classesById = useMemo(() => new Map(annotationsManager.classes.map((item, index) => [item.id, index])), [annotationsManager.classes]);

  async function handleSaveDataset(splitMode = "split") {
    if (!collection || images.length === 0) return;

    try {
      setIsSaving(true);
      setSaveMessage("");
      const items = [];
      const allUsedClassIds = new Set();

      for (const image of images) {
        const imageId = image.uuid || image.relativePath || image.id;
        let finalYoloLines = "";

        const drawnAnnotations = annotationsManager.getAnnotationsByImage(imageId);
        
        if (drawnAnnotations.length > 0 || annotationsManager.wasImageOpened(imageId)) {
          const size = await getImageSize(image);
          finalYoloLines = drawnAnnotations.map(ann => {
            const classIndex = classesById.get(ann.classId);
            if (classIndex != null) allUsedClassIds.add(classIndex);
            return annotationToYoloLine(ann, classIndex, size.width, size.height);
          }).filter(Boolean).join("\n");
        } else {
          let existingTxt = image.annotationText || "";
          if (image.annotationFile) {
            const filePath = image.annotationFile.absolute_path || image.annotationFile.absolutePath;
            if (filePath) {
              const fromFile = await readTextFileSafe(filePath);
              existingTxt = fromFile || image.annotationText || "";
            }
          }
          finalYoloLines = existingTxt;
          parseClassIdsFromTxt(existingTxt).forEach(id => allUsedClassIds.add(id));
        }

        items.push({
          absolutePath: image.absolutePath || image.file?.absolute_path,
          relativePath: image.relativePath,
          annotationTxt: finalYoloLines,
        });
      }

      const classNames = [...annotationsManager.classes.map((item) => item.name)];
      const activeFolders = collection.folders ? collection.folders.filter(f => f.isEnabled) : [];
      
      if (activeFolders.length === 0) {
        setSaveMessage("Нет активных папок для сохранения.");
        setIsSaving(false);
        return;
      }

      let foldersSaved = 0;
      let lastResponse = null;

      for (const folder of activeFolders) {
        const folderItemsRaw = items.filter(item => item.relativePath.startsWith(folder.path + '/') || item.relativePath === folder.path);
        if (folderItemsRaw.length === 0) continue;

        const folderItemsCleaned = folderItemsRaw.map(item => {
          let cleanPath = item.relativePath;
          if (cleanPath.startsWith(folder.path + '/')) cleanPath = cleanPath.substring(folder.path.length + 1);
          else if (cleanPath === folder.path) cleanPath = cleanPath.split('/').pop();
          return { ...item, relativePath: cleanPath };
        });

        lastResponse = await exportDataset({
          collectionName: collection.name,
          workspacePath: collection.workspacePath,
          subFolderName: folder.name, 
          classes: classNames,
          items: folderItemsCleaned,
          trainPercent: trainSplitPercent,
          valPercent: valSplitPercent,    // Добавлено
          testPercent: testSplitPercent,  // Добавлено
          splitMode: splitMode
        });
        foldersSaved++;
      }

      if (foldersSaved > 0 && lastResponse) {
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

  const handleImageClick = (image) => { setCurrentImage(image); setShowViewer(true); };
  const handleCloseViewer = () => { setShowViewer(false); setCurrentImage(null); };

  const handleSaveAnnotationToState = (imageId, text) => {
    if (!collection) return;
    const newImages = [...collection.images];
    const idx = newImages.findIndex(img => (img.uuid || img.relativePath || img.id) === imageId);
    if (idx >= 0 && newImages[idx].annotationText !== text) {
      newImages[idx] = { ...newImages[idx], annotationText: text };
      onCollectionUpdate?.(collection.id, { images: newImages });
    }
  };

  const handleNextImage = () => {
    if (currentImage && images.length > 0) {
      const currentIndex = images.findIndex((img) => (img.uuid || img.relativePath) === (currentImage.uuid || currentImage.relativePath));
      if (currentIndex < images.length - 1) setCurrentImage(images[currentIndex + 1]);
    }
  };

  const handlePrevImage = () => {
    if (currentImage && images.length > 0) {
      const currentIndex = images.findIndex((img) => (img.uuid || img.relativePath) === (currentImage.uuid || currentImage.relativePath));
      if (currentIndex > 0) setCurrentImage(images[currentIndex - 1]);
    }
  };

  if (!collection) return <div className="annotation-view empty"><h2>Выберите коллекцию для разметки</h2></div>;

  const currentIndex = currentImage ? images.findIndex((img) => (img.uuid || img.relativePath) === (currentImage.uuid || currentImage.relativePath)) : -1;

  return (
    <div className="annotation-view">
      <div className="annotation-header">
        <div>
          <h2>{collection.name}</h2>
          <div className="version-info">
            Всего изображений: {datasetLoading ? "..." : images.length}
            {useDatasetSource && !datasetLoading && (
              <span className="source-badge">из datasets/</span>
            )}
          </div>
        </div>
        <div className="annotation-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label className="dataset-source-toggle" title="Показывать файлы из папки datasets/ вместо исходных файлов проекта">
            <input
              type="checkbox"
              checked={useDatasetSource}
              onChange={e => { setUseDatasetSource(e.target.checked); setCurrentImage(null); }}
            />
            <span>Из datasets/</span>
          </label>
          {useDatasetSource && (
            <button
              className="action-button secondary"
              onClick={() => { setDatasetRefreshKey(k => k + 1); setCurrentImage(null); }}
              disabled={datasetLoading}
              title="Обновить список файлов из datasets/"
            >
              {datasetLoading ? "..." : "↻"}
            </button>
          )}
          <button className="action-button secondary" onClick={() => handleSaveDataset("flat")} disabled={isSaving || images.length === 0}>
            {isSaving ? "Сохранение..." : "Сохранить (Без сплита)"}
          </button>
          <button className="action-button primary" onClick={() => handleSaveDataset("split")} disabled={isSaving || images.length === 0}>
            {isSaving ? "Сохранение..." : "Сохранить"}
          </button>
        </div>
      </div>

      <div className="annotation-split-card">
        <div className="annotation-split-header">
          <div>
            <h3>Train / Val / Test split</h3>
            <p>Настройте распределение данных. Тяните ползунки или введите точные значения.</p>
          </div>
        </div>

        <div className="split-inputs-container">
          <div className="split-input-group">
            <label>Train (%)</label>
            <input type="number" min="0" max="100" value={trainSplitPercent} onChange={(e) => handleManualInput('train', e.target.value)} />
            <span className="split-count">{trainCount} img</span>
          </div>
          <div className="split-input-group">
            <label>Val (%)</label>
            <input type="number" min="0" max="100" value={valSplitPercent} onChange={(e) => handleManualInput('val', e.target.value)} />
            <span className="split-count">{valCount} img</span>
          </div>
          <div className="split-input-group">
            <label>Test (%)</label>
            <input type="number" min="0" max="100" value={testSplitPercent} onChange={(e) => handleManualInput('test', e.target.value)} />
            <span className="split-count">{testCount} img</span>
          </div>
        </div>

        <div className="dual-slider-wrapper">
          <input 
            type="range" min="0" max="100" value={thumb1} 
            onChange={(e) => handleThumbChange(1, e.target.value)} 
            className="thumb thumb-left" 
            style={{ zIndex: thumb1 > 95 ? 4 : 5 }} 
          />
          <input 
            type="range" min="0" max="100" value={thumb2} 
            onChange={(e) => handleThumbChange(2, e.target.value)} 
            className="thumb thumb-right" 
          />
          
          <div className="slider-track-custom">
            <div className="track-segment train-segment" style={{ width: `${trainSplitPercent}%` }}></div>
            <div className="track-segment val-segment" style={{ width: `${valSplitPercent}%` }}></div>
            <div className="track-segment test-segment" style={{ width: `${testSplitPercent}%` }}></div>
          </div>
        </div>
      </div>

      {saveMessage && <div className="annotation-save-message">{saveMessage}</div>}

      <ImageGallery images={galleryImages} onImageClick={handleImageClick} />

      {showViewer && currentImage && (
        <ImageViewer
          image={currentImage} collection={collection} onClose={handleCloseViewer}
          onNext={handleNextImage} onPrev={handlePrevImage} hasNext={currentIndex < images.length - 1}
          hasPrev={currentIndex > 0} annotationsManager={annotationsManager}
          onSaveAnnotation={handleSaveAnnotationToState}
        />
      )}
    </div>
  );
}

export default AnnotationView;