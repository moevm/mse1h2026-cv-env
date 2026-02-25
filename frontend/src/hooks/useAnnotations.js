import { useState } from "react";

const useAnnotations = () => {
  const [annotations, setAnnotations] = useState([]);
  const [classes, setClasses] = useState([]);

  const colors = [
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

  const getClassColor = (classId) => {
    const classIndex = classes.findIndex((c) => c.id === classId);
    return classIndex >= 0 ? colors[classIndex % colors.length] : "#999999";
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
    const newClass = {
      id: Date.now().toString(),
      name: className,
      color: colors[classes.length % colors.length],
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
