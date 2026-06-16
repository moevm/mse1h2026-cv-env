import React, { useMemo, useState, useEffect } from "react";
import ImageGallery from "./ImageGallery";
import ImageViewer from "./ImageViewer";

import useAnnotations from "../../hooks/useAnnotations";
import { getDisabledFolderPaths } from "../../utils/fileSystem";
import { getImageUrl, scanWorkspaceDatasets, resplitDataset, resplitPreview } from "../../services/api";

import "../../styles/AnnotationView.css";

const DEFAULT_TRAIN_SPLIT_PERCENT = 80;

function sanitizeDatasetName(name) {
  const cleaned = (name || "dataset").trim().replace(/[^a-zA-Zа-яА-Я0-9._-]+/gu, "_").replace(/^[._-]+|[._-]+$/gu, "");
  return cleaned || "dataset";
}

function AnnotationView({ collection, currentVersionId, onCollectionUpdate, datasetRefreshSignal }) {
  const [currentImage, setCurrentImage] = useState(null);
  const [showViewer, setShowViewer] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const [datasetImages, setDatasetImages] = useState([]);
  const [datasetLoading, setDatasetLoading] = useState(false);
  const [datasetRefreshKey, setDatasetRefreshKey] = useState(0);
  const [datasetPreview, setDatasetPreview] = useState(null);

  const [validationResults, setValidationResults] = useState({});

  const annotationsManager = useAnnotations(collection?.workspacePath, collection?.projectClasses);

  useEffect(() => {
    setCurrentImage(null); 
    setShowViewer(false); 
    setSaveMessage("");
    setValidationResults({}); 
  }, [collection?.id, currentVersionId]);

  useEffect(() => {
    if (!collection) return;
    const currentClassesStr = JSON.stringify(collection.projectClasses || []);
    const newClassesStr = JSON.stringify(annotationsManager.classes);
    if (currentClassesStr !== newClassesStr && annotationsManager.isReady) {
      onCollectionUpdate?.(collection.id, { projectClasses: annotationsManager.classes });
    }
  }, [annotationsManager.classes, collection, onCollectionUpdate, annotationsManager.isReady]);

  useEffect(() => {
    if (!collection) {
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
          url: f.absolute_path ? `${getImageUrl(f.absolute_path)}&_t=${cacheBuster}` : null,
          uuid: f.relativePath,
        })));
      })
      .catch((err) => { console.error("[datasets scan]", err); setDatasetImages([]); })
      .finally(() => setDatasetLoading(false));
  }, [collection?.id, collection?.folders?.length, currentVersionId, datasetRefreshKey, datasetRefreshSignal]);

  const ignoredPaths = useMemo(() => {
    return collection?.folders ? getDisabledFolderPaths(collection.folders) : [];
  }, [collection?.folders]);

  const folderPathByDataset = useMemo(() =>
    new Map((collection?.folders || []).map((f) => [sanitizeDatasetName(f.name), f.path])),
    [collection?.folders]
  );

  const images = useMemo(() => {
    if (ignoredPaths.length === 0) return datasetImages;
    return datasetImages.filter((img) => {
      const datasetName = (img.relativePath || "").split("/")[0];
      const folderPath = folderPathByDataset.get(datasetName);
      if (!folderPath || !img.originalPath) return true;
      const fullPath = `${folderPath}/${img.originalPath}`;
      return !ignoredPaths.some((p) => fullPath === p || fullPath.startsWith(p + "/"));
    });
  }, [datasetImages, ignoredPaths, folderPathByDataset]);

  const galleryImages = images.map((image) => ({
    ...image,
    isMarked: Boolean(image.annotationFile) || Boolean(image.annotationText) || annotationsManager.getAnnotationsByImage(image.uuid || image.relativePath || image.id).length > 0,
  }));

  const trainSplitPercent = collection?.trainSplitPercent ?? 80;
  const valSplitPercent = collection?.valSplitPercent ?? 10;
  const testSplitPercent = collection?.testSplitPercent ?? 10;

  const thumb1 = trainSplitPercent; 
  const thumb2 = trainSplitPercent + valSplitPercent;
  
  useEffect(() => {
    if (!collection) { setDatasetPreview(null); return; }
    const activeFolders = (collection.folders || []).filter((f) => f.isEnabled);
    if (activeFolders.length === 0) { setDatasetPreview(null); return; }
    const timer = setTimeout(async () => {
      try {
        const sum = { trainCount: 0, valCount: 0, testCount: 0 };
        const toPreview = [];
        for (const folder of activeFolders) {
          if (folder.folderType === "imported_dataset") {
            const dsName = sanitizeDatasetName(folder.name);
            for (const img of datasetImages) {
              if ((img.relativePath || "").split("/")[0] !== dsName) continue;
              if (img.split === "train") sum.trainCount++;
              else if (img.split === "val") sum.valCount++;
              else if (img.split === "test") sum.testCount++;
            }
          } else {
            toPreview.push(folder);
          }
        }
        const results = await Promise.all(toPreview.map((folder) =>
          resplitPreview({
            workspacePath: collection.workspacePath,
            datasetName: folder.name,
            trainPercent: trainSplitPercent,
            valPercent: valSplitPercent,
            testPercent: testSplitPercent,
          }).catch(() => null)
        ));
        for (const r of results) {
          if (!r?.split_counts) continue;
          sum.trainCount += r.split_counts.train || 0;
          sum.valCount += r.split_counts.val || 0;
          sum.testCount += r.split_counts.test || 0;
        }
        setDatasetPreview(sum);
      } catch { setDatasetPreview(null); }
    }, 300);
    return () => clearTimeout(timer);
  }, [collection?.workspacePath, collection?.folders, datasetImages, trainSplitPercent, valSplitPercent, testSplitPercent, datasetRefreshKey, datasetRefreshSignal]);

  const { trainCount, valCount, testCount } = datasetPreview || { trainCount: 0, valCount: 0, testCount: 0 };

  const handleThumbChange = (index, value) => {
    let val = Math.max(0, Math.min(100, Number(value)));
    let newThumb1 = thumb1;
    let newThumb2 = thumb2;
    if (index === 1) {
      newThumb1 = val;
      if (newThumb1 > newThumb2) newThumb2 = newThumb1;
    } else {
      newThumb2 = val;
      if (newThumb2 < newThumb1) newThumb1 = newThumb2;
    }
    onCollectionUpdate?.(collection.id, {
      trainSplitPercent: newThumb1,
      valSplitPercent: newThumb2 - newThumb1,
      testSplitPercent: 100 - newThumb2,
    });
  };

  const handleManualInput = (type, value) => {
    let numVal = Math.max(0, Math.min(100, Number(value) || 0));
    let newThumb1 = thumb1;
    let newThumb2 = thumb2;
    if (type === 'train') {
      newThumb1 = numVal;
      if (newThumb1 > newThumb2) newThumb2 = newThumb1;
    } else if (type === 'val') {
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

  async function handleResplit() {
    if (!collection) return;
    const activeFolders = (collection.folders || []).filter((f) => f.isEnabled && f.folderType !== "imported_dataset");
    if (activeFolders.length === 0) { setSaveMessage("Нет папок для пересборки (импортированные датасеты не пересобираются)."); return; }
    try {
      setIsSaving(true);
      setSaveMessage("");
      let done = 0;
      for (const folder of activeFolders) {
        try {
          await resplitDataset({
            workspacePath: collection.workspacePath,
            datasetName: folder.name,
            trainPercent: trainSplitPercent,
            valPercent: valSplitPercent,
            testPercent: testSplitPercent,
          });
          done++;
        } catch (err) {
          console.error(`Resplit "${folder.name}":`, err);
        }
      }
      setSaveMessage(done > 0 ? `Сплит пересобран: ${done}` : "Не удалось пересобрать сплит.");
      setDatasetRefreshKey((k) => k + 1);
      setCurrentImage(null);
    } finally {
      setIsSaving(false);
    }
  }

  const handleCheckAnnotations = () => {
    if (!collection) return;

    const errorsMap = {};
    const classesCount = collection.projectClasses?.length || annotationsManager.classes.length || 0;

    galleryImages.forEach((img) => {
      const imgId = img.uuid || img.relativePath || img.id;
      const errors = [];

      // 1. Проверка на разметку без изображения
      const isStrayTxt = img.isStrayTxt || (img.name && img.name.endsWith('.txt') && !img.url) || img.missingImage;
      if (isStrayTxt) {
        errors.push("Файл разметки *.txt существует, но само изображение отсутствует.");
        errorsMap[imgId] = errors;
        return; 
      }

      // 2. Проверка на изображение без разметки (нет .txt)
      const hasLabelFile = Boolean(img.hasLabelFile); 
      const hasStateAnnotations = annotationsManager.getAnnotationsByImage(imgId).length > 0;

      if (!hasLabelFile && !hasStateAnnotations) {
        errors.push("Изображение без аннотаций (отсутствует файл разметки *.txt).");
      }

      // 3. Анализ YOLO bboxes (запускается только если текст разметки не пустой)
      const txtContent = (img.annotationText || "").trim();
      if (txtContent) {
        const lines = txtContent.split("\n");
        lines.forEach((line, idx) => {
          const trimmed = line.trim();
          if (!trimmed) return; 

          const parts = trimmed.split(/\s+/);
          if (parts.length < 5) {
            errors.push(`Строка ${idx + 1}: Некорректный формат YOLO (ожидалось 5 значений).`);
            return;
          }

          const classIdx = parseInt(parts[0], 10);
          const x = parseFloat(parts[1]);
          const y = parseFloat(parts[2]);
          const w = parseFloat(parts[3]);
          const h = parseFloat(parts[4]);

          // Проверка существования класса
          if (isNaN(classIdx) || classIdx < 0 || classIdx >= classesCount) {
            errors.push(`Строка ${idx + 1}: Обнаружен неизвестный класс (индекс ${parts[0]}).`);
          }

          // Проверка нормализации координат 0..1
          if (x < 0 || x > 1 || y < 0 || y > 1 || w < 0 || w > 1 || h < 0 || h > 1) {
            errors.push(`Строка ${idx + 1}: Координаты BBox выходят за пределы диапазона 0..1.`);
          }
        });
      }

      if (errors.length > 0) {
        errorsMap[imgId] = errors;
      }
    });

    setValidationResults(errorsMap);
    const totalErrors = Object.keys(errorsMap).length;
    setSaveMessage(
      totalErrors > 0 
        ? `Проверка завершена. Найдено проблемных объектов: ${totalErrors}` 
        : "Проверка успешно пройдена! Ошибок в разметке не обнаружено."
    );
  };

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
          </div>
        </div>
        <div className="annotation-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button 
            className="action-button secondary check-annotations-btn" 
            onClick={handleCheckAnnotations} 
            disabled={images.length === 0}
            title="Проверить разметку на отсутствие аннотаций, bboxes вне диапазона 0..1 и неописанные классы"
          >
            Проверить разметку
          </button>
          <button className="action-button primary" onClick={handleResplit} disabled={isSaving || images.length === 0} title="Перераспределить данные по train/val/test под текущие проценты (разметка сохраняется)">
            {isSaving ? "Пересборка..." : "Пересобрать сплит"}
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

      <ImageGallery 
        images={galleryImages} 
        onImageClick={handleImageClick} 
        validationResults={validationResults} 
      />

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