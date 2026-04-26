// frontend/src/hooks/useAnnotations.js
import { useEffect, useMemo, useState } from "react";
import { saveAnnotationToBackend, loadAnnotationFromBackend, loadClassesFromBackend } from "../services/api";

const DEFAULT_COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#96CEB4",
  "#FFEEAD",
  "#D4A5A5",
  "#9B59B6",
  "#3498DB",
  "#E67E22",
  "#2ECC71",
];

function buildStorageKey(scopeKey) {
  return `annotation-state:${scopeKey || "default"}`;
}

function loadPersistedState(scopeKey) {
  if (typeof window === "undefined") {
    return { annotations: [], classes: [] };
  }

  try {
    const raw = window.localStorage.getItem(buildStorageKey(scopeKey));
    if (!raw) {
      return { annotations: [], classes: [] };
    }

    const parsed = JSON.parse(raw);
    return {
      annotations: Array.isArray(parsed.annotations) ? parsed.annotations : [],
      classes: Array.isArray(parsed.classes) ? parsed.classes : [],
    };
  } catch (error) {
    console.warn("Не удалось загрузить сохранённые аннотации", error);
    return { annotations: [], classes: [] };
  }
}

const useAnnotations = (scopeKey, datasetName) => {
  const initialState = useMemo(() => loadPersistedState(scopeKey), [scopeKey]);
  const [annotations, setAnnotations] = useState(initialState.annotations);
  const [classes, setClasses] = useState(initialState.classes);
  const [isSyncing, setIsSyncing] = useState(false);

  // Загрузка классов с бэкенда при монтировании
  useEffect(() => {
    if (datasetName) {
      loadClassesFromBackend(datasetName).then((data) => {
        if (data.classes && data.classes.length > 0) {
          // Конвертируем строки в объекты классов с цветами
          const backendClasses = data.classes.map((className, index) => ({
            id: `class-${index}`,
            name: className,
            color: DEFAULT_COLORS[index % DEFAULT_COLORS.length],
          }));
          setClasses(backendClasses);
        }
      });
    }
  }, [datasetName]);

  useEffect(() => {
    const persisted = loadPersistedState(scopeKey);
    setAnnotations(persisted.annotations);
    setClasses(persisted.classes);
  }, [scopeKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      buildStorageKey(scopeKey),
      JSON.stringify({ annotations, classes }),
    );
  }, [scopeKey, annotations, classes]);

  // Функция для сохранения аннотаций конкретного изображения на бэкенд
  const syncAnnotationsToBackend = async (imageId, imageAnnotations) => {
    if (!datasetName || !imageId || isSyncing) return;
    
    // Конвертируем аннотации в YOLO-формат
    const yoloContent = convertAnnotationsToYolo(imageAnnotations);
    
    // Получаем список названий классов
    const classNames = classes.map(c => c.name);
    
    setIsSyncing(true);
    try {
      await saveAnnotationToBackend(datasetName, imageId, yoloContent, classNames);
      console.log(`Annotations saved for ${imageId}`);
    } catch (error) {
      console.error("Failed to sync annotations:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  // Конвертация аннотаций в YOLO-формат
  const convertAnnotationsToYolo = (imageAnnotations) => {
    if (!imageAnnotations || imageAnnotations.length === 0) return "";
    
    const lines = [];
    for (const ann of imageAnnotations) {
      // Находим индекс класса
      const classObj = classes.find(c => c.id === ann.classId);
      let classIndex = classes.findIndex(c => c.id === ann.classId);
      if (classIndex === -1 && classObj) {
        classIndex = classes.length;
      }
      
      if (ann.type === "rectangle") {
        // YOLO формат: class_id x_center y_center width height
        // Все координаты нормализованы от 0 до 1
        lines.push(`${classIndex} ${ann.x} ${ann.y} ${ann.width} ${ann.height}`);
      } else if (ann.type === "polygon") {
        // Для полигона: class_id x1 y1 x2 y2 ...
        const pointsStr = ann.points.map(p => `${p.x} ${p.y}`).join(" ");
        lines.push(`${classIndex} ${pointsStr}`);
      }
    }
    return lines.join("\n");
  };

  const addAnnotation = (annotation) => {
    setAnnotations((prev) => {
      const newAnnotations = [
        ...prev,
        {
          id: Date.now().toString(),
          ...annotation,
        },
      ];
      // Автоматически сохраняем на бэкенд
      if (datasetName && annotation.imageId) {
        const imageAnnotations = newAnnotations.filter(a => a.imageId === annotation.imageId);
        syncAnnotationsToBackend(annotation.imageId, imageAnnotations);
      }
      return newAnnotations;
    });
  };

  const updateAnnotation = (id, updates) => {
    setAnnotations((prev) => {
      const newAnnotations = prev.map((ann) => (ann.id === id ? { ...ann, ...updates } : ann));
      const updatedAnn = newAnnotations.find(a => a.id === id);
      if (datasetName && updatedAnn?.imageId) {
        const imageAnnotations = newAnnotations.filter(a => a.imageId === updatedAnn.imageId);
        syncAnnotationsToBackend(updatedAnn.imageId, imageAnnotations);
      }
      return newAnnotations;
    });
  };

  const deleteAnnotation = (id) => {
    setAnnotations((prev) => {
      const deletedAnn = prev.find(a => a.id === id);
      const newAnnotations = prev.filter((ann) => ann.id !== id);
      
      // Если есть datasetName и imageId удалённой аннотации, синхронизируем
      if (datasetName && deletedAnn?.imageId) {
        // Получаем все оставшиеся аннотации для этого изображения
        const remainingForImage = newAnnotations.filter(a => a.imageId === deletedAnn.imageId);
        
        // Используем setTimeout, чтобы не блокировать рендер
        setTimeout(() => {
          syncAnnotationsToBackend(deletedAnn.imageId, remainingForImage).catch(console.error);
        }, 0);
      }
      
      return newAnnotations;
    });
  };

  const addClass = (className) => {
    const normalizedName = className.trim().toLowerCase();
    const existing = classes.find(
      (item) => item.name.trim().toLowerCase() === normalizedName,
    );

    if (existing) {
      return existing.id;
    }

    const newClass = {
      id: Date.now().toString(),
      name: className.trim(),
      color: DEFAULT_COLORS[classes.length % DEFAULT_COLORS.length],
    };

    setClasses((prev) => [...prev, newClass]);
    
    // При добавлении класса синхронизируем все аннотации этого датасета
    if (datasetName) {
      
      syncAllAnnotationsToBackend();
    }
    
    return newClass.id;
  };

  // Синхронизация всех аннотаций (для каждого изображения)
  const syncAllAnnotationsToBackend = async () => {
    if (!datasetName) return;
    
    // Группируем аннотации по imageId
    const annotationsByImage = new Map();
    for (const ann of annotations) {
      if (!annotationsByImage.has(ann.imageId)) {
        annotationsByImage.set(ann.imageId, []);
      }
      annotationsByImage.get(ann.imageId).push(ann);
    }
    
    for (const [imageId, imageAnnotations] of annotationsByImage) {
      await syncAnnotationsToBackend(imageId, imageAnnotations);
    }
  };

  const updateAnnotationClass = (annotationId, classId) => {
    setAnnotations((prev) => {
      const newAnnotations = prev.map((ann) => (ann.id === annotationId ? { ...ann, classId } : ann));
      const updatedAnn = newAnnotations.find(a => a.id === annotationId);
      if (datasetName && updatedAnn?.imageId) {
        const imageAnnotations = newAnnotations.filter(a => a.imageId === updatedAnn.imageId);
        syncAnnotationsToBackend(updatedAnn.imageId, imageAnnotations);
      }
      return newAnnotations;
    });
  };

  const getAnnotationsByClass = (classId) => {
    return annotations.filter((ann) => ann.classId === classId);
  };

  const getAnnotationsByImage = (imageId) => {
    return annotations.filter((ann) => ann.imageId === imageId);
  };

  const getClassColor = (classId) => {
    const classIndex = classes.findIndex((c) => c.id === classId);
    return classIndex >= 0
      ? classes[classIndex].color || DEFAULT_COLORS[classIndex % DEFAULT_COLORS.length]
      : "#999999";
  };

  return {
    annotations,
    classes,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    addClass,
    updateAnnotationClass,
    getAnnotationsByClass,
    getAnnotationsByImage,
    getClassColor,
    syncAnnotationsToBackend,
    syncAllAnnotationsToBackend,
  };
};

export default useAnnotations;