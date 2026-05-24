import React, { useMemo, useState, useEffect } from "react";
import ImageGallery from "./ImageGallery";
import ImageViewer from "./ImageViewer";

import useAnnotations from "../../hooks/useAnnotations";
import { getDisabledFolderPaths } from "../../utils/fileSystem";
import { getImageUrl, scanWorkspaceDatasets, resplitDataset, resplitPreview } from "../../services/api";

import "../../styles/AnnotationView.css";

const DEFAULT_TRAIN_SPLIT_PERCENT = 80;

// Зеркало backend _sanitize_dataset_name: имя папки -> имя подпапки в datasets/.
function sanitizeDatasetName(name) {
  const cleaned = (name || "dataset").trim().replace(/[^a-zA-Zа-яА-Я0-9._-]+/gu, "_").replace(/^[._-]+|[._-]+$/gu, "");
  return cleaned || "dataset";
}

// Жадное распределение целых групп по сплитам — копия серверного _build_split_plan. Группа = кадры одного видео либо одно изображение.
function planGroupsToSplits(groupSizes, trainPercent, valPercent) {
  const total = groupSizes.reduce((sum, g) => sum + g.size, 0);
  if (total === 0) return { train: 0, val: 0, test: 0 };
  if (total <= 1) return { train: total, val: 0, test: 0 };

  const groups = [...groupSizes].sort((a, b) => b.size - a.size || a.key.localeCompare(b.key));

  const targets = {
    train: total * (trainPercent / 100),
    val: total * (valPercent / 100),
    test: total * (Math.max(0, 100 - trainPercent - valPercent) / 100),
  };
  const assigned = { train: 0, val: 0, test: 0 };
  const splitOf = {};

  for (const g of groups) {
    const split = ["train", "val", "test"].reduce((best, s) =>
      (targets[s] - assigned[s]) > (targets[best] - assigned[best]) ? s : best
    );
    splitOf[g.key] = split;
    assigned[split] += g.size;
  }

  // Гарантия непустого train, затем val (val% > 0) — переносом целой группы.
  if (assigned.train === 0) {
    const donor = assigned.val >= assigned.test ? "val" : "test";
    const g = groups.find((x) => splitOf[x.key] === donor);
    if (g) { assigned[donor] -= g.size; assigned.train += g.size; splitOf[g.key] = "train"; }
  }

  if (valPercent > 0 && assigned.val === 0 && assigned.train > 0) {
    const trainGroups = groups.filter((x) => splitOf[x.key] === "train").sort((a, b) => a.key.localeCompare(b.key));
    if (trainGroups.length > 1) {
      const g = trainGroups[trainGroups.length - 1];
      assigned.train -= g.size; assigned.val += g.size; splitOf[g.key] = "val";
    }
  }

  return assigned;
}

// Группирует как экспорт: по активным корневым папкам; в папках видео кадры одного видео = одна группа, иначе каждое изображение — своя.
function getSplitPreview(images, folders, trainPercent, valPercent) {
  if (!images || images.length === 0) return { trainCount: 0, valCount: 0, testCount: 0 };

  const activeFolders = (folders || []).filter((f) => f.isEnabled);
  const matched = new Set();
  const totals = { train: 0, val: 0, test: 0 };

  const accumulate = (groupMap) => {
    const sizes = Object.entries(groupMap).map(([key, size]) => ({ key, size }));
    const res = planGroupsToSplits(sizes, trainPercent, valPercent);
    totals.train += res.train; totals.val += res.val; totals.test += res.test;
  };

  for (const folder of activeFolders) {
    const groupMap = {};
    for (const img of images) {
      const rp = img.relativePath || "";
      const underFolder = rp === folder.path || rp.startsWith(folder.path + "/");
      if (!underFolder) continue;
      matched.add(img);
      let cleanPath = rp === folder.path ? rp.split("/").pop() : rp.substring(folder.path.length + 1);
      const key = folder.folderType === "videos" ? cleanPath.split("/")[0] : cleanPath;
      groupMap[`${folder.path}|${key}`] = (groupMap[`${folder.path}|${key}`] || 0) + 1;
    }
    if (Object.keys(groupMap).length) accumulate(groupMap);
  }

  // Картинки вне активных папок (напр. источник «из datasets/») — каждая своя группа.
  const loose = images.filter((img) => !matched.has(img));
  if (loose.length) {
    const groupMap = {};
    loose.forEach((img, i) => { groupMap[img.relativePath || `loose_${i}`] = 1; });
    accumulate(groupMap);
  }

  return { trainCount: totals.train, valCount: totals.val, testCount: totals.test };
}

function AnnotationView({ collection, versions, currentVersionId, onCollectionUpdate, datasetRefreshSignal }) {
  const [currentImage, setCurrentImage] = useState(null);
  const [showViewer, setShowViewer] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const [useDatasetSource, setUseDatasetSource] = useState(true);
  const [datasetImages, setDatasetImages] = useState([]);
  const [datasetLoading, setDatasetLoading] = useState(false);
  const [datasetRefreshKey, setDatasetRefreshKey] = useState(0);
  const [datasetPreview, setDatasetPreview] = useState(null);

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
  }, [useDatasetSource, collection?.id, collection?.folders?.length, currentVersionId, datasetRefreshKey, datasetRefreshSignal]);

  const ignoredPaths = useMemo(() => {
    return collection?.folders ? getDisabledFolderPaths(collection.folders) : [];
  }, [collection?.folders]);

  // datasets/{sanitize(folder.name)} -> folder.path (для реконструкции исходного пути датасетной картинки).
  const folderPathByDataset = useMemo(() =>
    new Map((collection?.folders || []).map((f) => [sanitizeDatasetName(f.name), f.path])),
    [collection?.folders]
  );

  const images = useMemo(() => {
    if (useDatasetSource) {
      if (ignoredPaths.length === 0) return datasetImages;
      return datasetImages.filter((img) => {
        const datasetName = (img.relativePath || "").split("/")[0];
        const folderPath = folderPathByDataset.get(datasetName);
        // Реконструируем путь в дереве проекта: folder.path / originalPath, и применяем тот же фильтр, что в raw.
        if (!folderPath || !img.originalPath) return true;
        const fullPath = `${folderPath}/${img.originalPath}`;
        return !ignoredPaths.some((p) => fullPath === p || fullPath.startsWith(p + "/"));
      });
    }
    const baseImages = currentVersion?.images || collection?.images || [];
    if (ignoredPaths.length === 0) return baseImages;
    return baseImages.filter(img => !ignoredPaths.some(ignoredPath => img.relativePath.startsWith(ignoredPath + '/')));
  }, [useDatasetSource, datasetImages, collection?.images, currentVersion?.images, ignoredPaths, folderPathByDataset]);

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
  
  // Локальный предпросмотр — для источника «исходные папки».
  const localPreview = useMemo(() =>
    getSplitPreview(images, collection?.folders, trainSplitPercent, valSplitPercent),
    [images, collection?.folders, trainSplitPercent, valSplitPercent]
  );

  // В режиме «из datasets/» реальные числа считает бэк (он знает videoGroup).
  useEffect(() => {
    if (!useDatasetSource || !collection) { setDatasetPreview(null); return; }
    const activeFolders = (collection.folders || []).filter((f) => f.isEnabled);
    if (activeFolders.length === 0) { setDatasetPreview(null); return; }
    const timer = setTimeout(async () => {
      try {
        const results = await Promise.all(activeFolders.map((folder) =>
          resplitPreview({
            workspacePath: collection.workspacePath,
            datasetName: folder.name,
            trainPercent: trainSplitPercent,
            valPercent: valSplitPercent,
            testPercent: testSplitPercent,
          }).catch(() => null)
        ));
        const sum = { trainCount: 0, valCount: 0, testCount: 0 };
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
  }, [useDatasetSource, collection?.workspacePath, collection?.folders, trainSplitPercent, valSplitPercent, testSplitPercent, datasetRefreshKey, datasetRefreshSignal]);

  const { trainCount, valCount, testCount } = (useDatasetSource && datasetPreview) ? datasetPreview : localPreview;

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

  // Пересобирает сплит уже импортированных датасетов под текущие % (без потери разметки).
  async function handleResplit() {
    if (!collection) return;
    const activeFolders = (collection.folders || []).filter((f) => f.isEnabled);
    if (activeFolders.length === 0) { setSaveMessage("Нет активных папок для пересборки."); return; }
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