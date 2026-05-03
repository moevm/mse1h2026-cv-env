import { useEffect, useState } from "react";
import { loadWorkspaceClasses } from "../services/api";

const DEFAULT_COLORS = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEEAD", "#D4A5A5", "#9B59B6", "#3498DB", "#E67E22", "#2ECC71"];

const useAnnotations = (workspacePath, projectClasses = []) => {
  const [annotations, setAnnotations] = useState([]);
  const [classes, setClasses] = useState([]);
  const [openedImages, setOpenedImages] = useState(new Set());
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setIsReady(false);
    if (projectClasses && projectClasses.length > 0) {
      const normalizedClasses = projectClasses.map((cls, index) => {
        if (typeof cls === "string") {
          return { id: crypto.randomUUID(), name: cls, color: DEFAULT_COLORS[index % DEFAULT_COLORS.length] };
        }
        return cls;
      });
      setClasses(normalizedClasses);
      setIsReady(true);
    } else if (workspacePath) {
      loadWorkspaceClasses(workspacePath).then((data) => {
        if (data.classes && data.classes.length > 0) {
          const backendClasses = data.classes.map((className, index) => ({
            id: crypto.randomUUID(), name: className, color: DEFAULT_COLORS[index % DEFAULT_COLORS.length],
          }));
          setClasses(backendClasses);
        }
      }).catch(console.error).finally(() => setIsReady(true));
    } else {
      setIsReady(true);
    }
  }, [workspacePath]);

  // Подхватываем новые классы из projectClasses (например после импорта датасета)
  // без сброса классов добавленных пользователем вручную
  useEffect(() => {
    if (!projectClasses || projectClasses.length === 0) return;
    setClasses(prev => {
      const existingNames = new Set(prev.map(c => c.name.trim().toLowerCase()));
      const incoming = projectClasses.map((cls, index) =>
        typeof cls === "string"
          ? { id: crypto.randomUUID(), name: cls, color: DEFAULT_COLORS[index % DEFAULT_COLORS.length] }
          : cls
      );
      const newOnes = incoming.filter(c => !existingNames.has(c.name.trim().toLowerCase()));
      return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
    });
  }, [projectClasses]);

  const setInitialAnnotations = (imageId, loadedAnns) => {
    setOpenedImages(prev => new Set(prev).add(imageId));
    setAnnotations(prev => {
      if (prev.some(a => a.imageId === imageId)) return prev; 
      const newAnns = loadedAnns.map((a) => ({ ...a, imageId, id: crypto.randomUUID() }));
      return [...prev, ...newAnns];
    });
  };

  const wasImageOpened = (imageId) => openedImages.has(imageId);

  const addAnnotation = (annotation) => setAnnotations((prev) => [...prev, { id: crypto.randomUUID(), ...annotation }]);
  const updateAnnotation = (id, updates) => setAnnotations((prev) => prev.map((ann) => (ann.id === id ? { ...ann, ...updates } : ann)));
  const deleteAnnotation = (id) => setAnnotations((prev) => prev.filter((ann) => ann.id !== id));

  const addClass = (className) => {
    const normalizedName = className.trim().toLowerCase();
    const existing = classes.find((item) => item.name.trim().toLowerCase() === normalizedName);
    if (existing) return existing.id;

    const newClass = { id: crypto.randomUUID(), name: className.trim(), color: DEFAULT_COLORS[classes.length % DEFAULT_COLORS.length] };
    setClasses((prev) => [...prev, newClass]);
    return newClass.id;
  };

  const updateAnnotationClass = (annotationId, classId) => setAnnotations((prev) => prev.map((ann) => (ann.id === annotationId ? { ...ann, classId } : ann)));
  const getAnnotationsByClass = (classId) => annotations.filter((ann) => ann.classId === classId);
  const getAnnotationsByImage = (imageId) => annotations.filter((ann) => ann.imageId === imageId);

  const getClassColor = (classId) => {
    const classIndex = classes.findIndex((c) => c.id === classId);
    return classIndex >= 0 ? classes[classIndex].color || DEFAULT_COLORS[classIndex % DEFAULT_COLORS.length] : "#999999";
  };

  return {
    annotations, classes, isReady, addAnnotation, updateAnnotation, deleteAnnotation,
    addClass, updateAnnotationClass, getAnnotationsByClass, getAnnotationsByImage, getClassColor,
    setInitialAnnotations, wasImageOpened
  };
};

export default useAnnotations;