import React, { useState, useEffect, useRef } from "react";
import ImageAnnotator from "./ImageAnnotator";
import { parseTxtAnnotations } from "../../utils/txtAnnotationParser";
import { loadAnnotationFromBackend } from "../../services/api";
import "../../styles/AnnotationView.css";

function ImageViewer({
  image,
  collection,
  onClose,
  onNext,
  onPrev,
  hasNext,
  hasPrev,
  annotationsManager,
}) {
  const [currentUrl, setCurrentUrl] = useState(null);
  const [txtAnnotations, setTxtAnnotations] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const urlsRef = useRef([]);

  // Функция для преобразования индексов классов в ID
  const convertIndexToClassId = (classIndex, classes) => {
    // Если индекс существует в массиве классов
    if (classIndex >= 0 && classIndex < classes.length) {
      return classes[classIndex].id;
    }
    return null;
  };

  // Функция для преобразования всех аннотаций
  const convertAnnotationsIndicesToIds = (annotations, classes) => {
    const converted = [];
    for (const ann of annotations) {
      const classId = convertIndexToClassId(ann.classId, classes);
      if (classId) {
        converted.push({
          ...ann,
          classId: classId,
        });
      } else {
        console.warn(`Класс с индексом ${ann.classId} не найден, аннотация пропущена`);
      }
    }
    return converted;
  };

  useEffect(() => {
    if (!image) return;

    let isActive = true;
    
    // Получаем URL изображения
    let imageUrl = null;
    if (image.url) {
      imageUrl = image.url.startsWith('http') ? image.url : `http://localhost:8000${image.url}`;
    } else if (image.file) {
      imageUrl = URL.createObjectURL(image.file);
      urlsRef.current.push(imageUrl);
    } else if (collection?.name && image.uuid) {
      imageUrl = `http://localhost:8000/api/datasets/${collection.name}/files/images/${image.uuid}.jpg`;
    }
    
    setCurrentUrl(imageUrl);

    const loadTxtAnnotations = async () => {
      setIsLoading(true);
      
      try {
        // Получаем текущие классы из annotationsManager
        const currentClasses = annotationsManager.classes;
        
        // 1. Сначала пробуем загрузить с бэкенда
        let backendContent = null;
        if (collection?.name && image.uuid) {
          try {
            const backendData = await loadAnnotationFromBackend(collection.name, image.uuid);
            if (backendData.content && backendData.content.trim()) {
              backendContent = backendData.content;
            }
          } catch (error) {
            console.error("Failed to load annotation from backend:", error);
          }
        }
        
        // Получаем размеры изображения для нормализации координат
        const imageSize = await new Promise((resolve, reject) => {
          const previewImage = new Image();
          previewImage.onload = () => {
            resolve({ width: previewImage.naturalWidth, height: previewImage.naturalHeight });
          };
          previewImage.onerror = reject;
          previewImage.src = imageUrl;
        });
        
        if (!isActive) return;
        
        let parsedAnnotations = [];
        let contentSource = null;
        
        // 2. Если есть на бэкенде - используем его
        if (backendContent) {
          parsedAnnotations = parseTxtAnnotations(backendContent, imageSize.width, imageSize.height);
          contentSource = "backend";
        }
        // 3. Иначе пробуем загрузить из inline annotationText
        else if (image.annotationText && image.annotationText.trim()) {
          parsedAnnotations = parseTxtAnnotations(image.annotationText, imageSize.width, imageSize.height);
          contentSource = "annotationText";
        }
        // 4. Иначе пробуем загрузить из annotationFile (для локальной загрузки)
        else if (image.annotationFile) {
          const txtContent = await image.annotationFile.text();
          if (txtContent && txtContent.trim()) {
            parsedAnnotations = parseTxtAnnotations(txtContent, imageSize.width, imageSize.height);
            contentSource = "annotationFile";
          }
        }
        
        if (parsedAnnotations.length > 0) {
          // Преобразуем индексы классов в ID
          const convertedAnnotations = convertAnnotationsIndicesToIds(parsedAnnotations, currentClasses);
          console.log(`Загружено ${convertedAnnotations.length} аннотаций из ${contentSource}`);
          setTxtAnnotations(convertedAnnotations);
        } else {
          setTxtAnnotations([]);
        }
      } catch (error) {
        console.error("Не удалось прочитать txt-разметку:", error);
        if (isActive) {
          setTxtAnnotations([]);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    loadTxtAnnotations();

    return () => {
      isActive = false;
    };
  }, [image, collection, annotationsManager.classes]);

  // Очистка URL-объектов при размонтировании
  useEffect(() => {
    return () => {
      urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      urlsRef.current = [];
    };
  }, []);

  if (!image) return null;

  return (
    <div className="image-viewer-overlay">
      <div className="image-viewer">
        <div className="viewer-navigation">
          {hasPrev && (
            <button className="nav-button prev" onClick={onPrev}>
              ‹
            </button>
          )}
          {hasNext && (
            <button className="nav-button next" onClick={onNext}>
              ›
            </button>
          )}
        </div>
        {isLoading ? (
          <div className="viewer-loading">
            <div className="spinner"></div>
            <p>Загрузка разметки...</p>
          </div>
        ) : (
          <ImageAnnotator
            imageUrl={currentUrl}
            imageId={image.uuid || image.relativePath || image.id}
            imageName={image.name || image.originalName}
            datasetName={collection?.name}
            externalAnnotations={txtAnnotations}
            onClose={onClose}
            annotationsManager={annotationsManager}
          />
        )}
      </div>
    </div>
  );
}

export default ImageViewer;