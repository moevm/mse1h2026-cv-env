import { useEffect, useMemo, useState } from "react";

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

const useAnnotations = (scopeKey) => {
  const initialState = useMemo(() => loadPersistedState(scopeKey), [scopeKey]);
  const [annotations, setAnnotations] = useState(initialState.annotations);
  const [classes, setClasses] = useState(initialState.classes);

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

  const getClassColor = (classId) => {
    const classIndex = classes.findIndex((c) => c.id === classId);
    return classIndex >= 0
      ? classes[classIndex].color || DEFAULT_COLORS[classIndex % DEFAULT_COLORS.length]
      : "#999999";
  };

  const addAnnotation = (annotation) => {
    setAnnotations((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        ...annotation,
      },
    ]);
  };

  const updateAnnotation = (id, updates) => {
    setAnnotations((prev) =>
      prev.map((ann) => (ann.id === id ? { ...ann, ...updates } : ann)),
    );
  };

  const deleteAnnotation = (id) => {
    setAnnotations((prev) => prev.filter((ann) => ann.id !== id));
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
    return newClass.id;
  };

  const updateAnnotationClass = (annotationId, classId) => {
    setAnnotations((prev) =>
      prev.map((ann) => (ann.id === annotationId ? { ...ann, classId } : ann)),
    );
  };

  const getAnnotationsByClass = (classId) => {
    return annotations.filter((ann) => ann.classId === classId);
  };

  const getAnnotationsByImage = (imageId) => {
    return annotations.filter((ann) => ann.imageId === imageId);
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
  };
};

export default useAnnotations;
