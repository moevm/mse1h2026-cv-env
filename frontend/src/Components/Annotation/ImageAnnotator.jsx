import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import Canvas from "./Canvas";
import AnnotationToolbar from "./AnnotationToolbar";
import AnnotationPopup from "./AnnotationPopup";
import { isPointInRect, isPointInPolygon } from "../../utils/canvasUtils";
import { annotationToYoloLine } from "../../utils/yolo";
import { autosaveAnnotation } from "../../services/api";
import "../../styles/AnnotationView.css";

function ImageAnnotator({ imageUrl, imageId, imageName, imageAbsPath, workspacePath, onClose, annotationsManager, onSaveAnnotation }) {
  const { annotations, classes, addAnnotation, addClass, updateAnnotation, deleteAnnotation, getClassColor } = annotationsManager;

  const [isDrawing, setIsDrawing] = useState(false);
  const [currentTool, setCurrentTool] = useState(null);
  const [startPoint, setStartPoint] = useState(null);
  const [currentRect, setCurrentRect] = useState(null);
  const [currentPolygon, setCurrentPolygon] = useState([]);
  const [mousePosition, setMousePosition] = useState(null);
  const [showPopup, setShowPopup] = useState(false);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
  const [selectedAnnotation, setSelectedAnnotation] = useState(null);
  const [selectedForEdit, setSelectedForEdit] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  const currentImageAnnotations = useMemo(() => annotations.filter((a) => a.imageId === imageId), [annotations, imageId]);

  // 1. Создаем хранилище для самых свежих данных (чтобы не пересоздавать таймер)
  const latestProps = useRef({ classes, imageAbsPath, workspacePath, imageUrl, imageId, onSaveAnnotation });
  useEffect(() => {
    latestProps.current = { classes, imageAbsPath, workspacePath, imageUrl, imageId, onSaveAnnotation };
  });

  const isInitialMount = useRef(true);
  const prevAnnotationsRef = useRef(null);

  // 2. Таймер теперь реагирует ТОЛЬКО на изменение самих боксов
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      prevAnnotationsRef.current = currentImageAnnotations;
      return;
    }

    const prev = prevAnnotationsRef.current;
    const curr = currentImageAnnotations;
    let isSame = false;

    if (prev && prev.length === curr.length) {
      isSame = prev.every((ann, i) => {
        return ann.id === curr[i].id && ann.x === curr[i].x && ann.y === curr[i].y &&
               ann.width === curr[i].width && ann.height === curr[i].height &&
               ann.classId === curr[i].classId && JSON.stringify(ann.points) === JSON.stringify(curr[i].points);
      });
    }

    if (isSame) return; // Если боксы не менялись - ничего не делаем, таймер не сбрасывается!
    prevAnnotationsRef.current = currentImageAnnotations;

    const timer = setTimeout(async () => {
      try {
        // Достаем самые актуальные данные прямо перед сохранением
        const { classes: latestClasses, imageAbsPath: latestPath, workspacePath: latestWs, imageUrl: latestUrl, imageId: latestId, onSaveAnnotation: latestOnSave } = latestProps.current;
        
        if (!latestPath || !latestWs) return;

        const img = new Image();
        img.src = latestUrl;
        await new Promise((resolve) => {
          if (img.complete) resolve();
          else { img.onload = resolve; img.onerror = resolve; }
        });

        const imgW = img.naturalWidth || 1;
        const imgH = img.naturalHeight || 1;

        const yoloLines = curr.map((ann) => {
          const classIndex = latestClasses.findIndex((c) => c.id === ann.classId);
          if (classIndex === -1) return null;
          return annotationToYoloLine(ann, classIndex, imgW, imgH);
        }).filter(Boolean).join("\n");

        const allClassNames = latestClasses.map((c) => c.name);
        await autosaveAnnotation(latestPath, yoloLines, allClassNames, latestWs);

        if (latestOnSave) {
           latestOnSave(latestId, yoloLines);
        }
      } catch (error) {
        console.error("Ошибка автосохранения разметки:", error);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [currentImageAnnotations]); // УБРАЛИ ВСЕ ЛИШНИЕ ЗАВИСИМОСТИ!

  const findAnnotationAtPoint = useCallback((point) => {
      for (let i = currentImageAnnotations.length - 1; i >= 0; i--) {
        const ann = currentImageAnnotations[i];
        if (ann.type === "rectangle" && isPointInRect(point, ann)) return ann;
        else if (ann.type === "polygon" && isPointInPolygon(point, ann.points)) return ann;
      }
      return null;
    }, [currentImageAnnotations]);

  const handleMouseDown = useCallback((e, coords) => {
      if (currentTool === "rectangle") {
        setIsDrawing(true);
        setStartPoint(coords);
        setCurrentRect({ x: coords.x, y: coords.y, width: 0, height: 0 });
      } else if (selectedForEdit) {
        let isInside = false;
        if (selectedForEdit.type === "rectangle") isInside = isPointInRect(coords, selectedForEdit);
        else if (selectedForEdit.type === "polygon") isInside = isPointInPolygon(coords, selectedForEdit.points);
        if (isInside) {
          setIsDragging(true);
          if (selectedForEdit.type === "rectangle") setDragOffset({ x: coords.x - selectedForEdit.x, y: coords.y - selectedForEdit.y });
          else if (selectedForEdit.type === "polygon") setDragOffset({ x: coords.x - selectedForEdit.points[0].x, y: coords.y - selectedForEdit.points[0].y });
        }
      }
    }, [currentTool, selectedForEdit]);

  const handleMouseMove = useCallback((e, coords) => {
      setMousePosition(coords);
      if (isDragging && selectedForEdit) {
        const newX = coords.x - dragOffset.x;
        const newY = coords.y - dragOffset.y;
        if (selectedForEdit.type === "rectangle") {
          updateAnnotation(selectedForEdit.id, { x: newX, y: newY });
        } else if (selectedForEdit.type === "polygon") {
          const dx = newX - selectedForEdit.points[0].x;
          const dy = newY - selectedForEdit.points[0].y;
          const newPoints = selectedForEdit.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
          updateAnnotation(selectedForEdit.id, { points: newPoints });
          setDragOffset({ x: coords.x - newPoints[0].x, y: coords.y - newPoints[0].y });
        }
      } else if (isDrawing && currentTool === "rectangle") {
        const width = coords.x - startPoint.x;
        const height = coords.y - startPoint.y;
        setCurrentRect({ x: width > 0 ? startPoint.x : coords.x, y: height > 0 ? startPoint.y : coords.y, width: Math.abs(width), height: Math.abs(height) });
      }
    }, [isDragging, selectedForEdit, dragOffset, isDrawing, currentTool, startPoint, updateAnnotation]);

  const handleMouseUp = useCallback((e, coords) => {
      if (isDrawing && currentTool === "rectangle" && currentRect) {
        if (currentRect.width >= 10 && currentRect.height >= 10) {
          setPopupPosition({ x: e.clientX, y: e.clientY });
          setSelectedAnnotation({ type: "rectangle", ...currentRect, imageId });
          setShowPopup(true);
        }
        setIsDrawing(false);
        setCurrentRect(null);
      }
      setIsDragging(false);
    }, [isDrawing, currentTool, currentRect, imageId]);

  const handleClick = useCallback((e, coords) => {
      if (currentTool) {
        if (currentTool === "polygon") {
          const newPolygon = [...currentPolygon, coords];
          setCurrentPolygon(newPolygon);
          if (newPolygon.length >= 3) {
            const firstPoint = newPolygon[0];
            const distance = Math.hypot(coords.x - firstPoint.x, coords.y - firstPoint.y);
            if (distance < 15) {
              setPopupPosition({ x: e.clientX, y: e.clientY });
              setSelectedAnnotation({ type: "polygon", points: newPolygon, imageId });
              setShowPopup(true);
              setCurrentPolygon([]);
            }
          }
        }
      } else {
        setSelectedForEdit(findAnnotationAtPoint(coords) || null);
      }
    }, [currentTool, currentPolygon, findAnnotationAtPoint, imageId]);

  const handleDoubleClick = useCallback((e, coords) => {
      if (selectedForEdit && window.confirm("Удалить выделенную область?")) {
        deleteAnnotation(selectedForEdit.id);
        setSelectedForEdit(null);
      }
    }, [selectedForEdit, deleteAnnotation]);

  const handleContextMenu = useCallback((e, coords) => {
      e.preventDefault();
      if (currentTool === "polygon" && currentPolygon.length > 0) setCurrentPolygon((prev) => prev.slice(0, -1));
      else if (selectedForEdit) setSelectedForEdit(null);
    }, [currentTool, currentPolygon, selectedForEdit]);

  const handleMouseLeave = useCallback(() => {
    if (isDrawing && currentTool === "rectangle") { setIsDrawing(false); setCurrentRect(null); }
    setMousePosition(null);
  }, [isDrawing, currentTool]);

  useEffect(() => {
    setCurrentRect(null); setCurrentPolygon([]); setIsDrawing(false); setSelectedForEdit(null);
  }, [currentTool]);

  const handleSaveAnnotation = useCallback(async (classId, newClassName = null) => {
      try {
        let finalClassId = classId;
        if (newClassName) finalClassId = addClass(newClassName);
        if (selectedAnnotation && finalClassId) addAnnotation({ ...selectedAnnotation, classId: finalClassId });
        setShowPopup(false); setSelectedAnnotation(null);
      } catch (error) {
        console.error("Ошибка при сохранении аннотации:", error);
      }
    }, [selectedAnnotation, addClass, addAnnotation]);

  const handleCancelAnnotation = useCallback(() => { setShowPopup(false); setSelectedAnnotation(null); }, []);
  const handleZoomIn = useCallback(() => setZoom((prev) => Math.min(prev + 0.1, 3)), []);
  const handleZoomOut = useCallback(() => setZoom((prev) => Math.max(prev - 0.1, 0.5)), []);

  return (
    <div className="image-annotator">
      <div className="annotator-header"><h3>{imageName}</h3><button className="close-button" onClick={onClose}>×</button></div>
      <div className="annotator-main">
        <div className="canvas-container">
          <Canvas
            imageUrl={imageUrl} annotations={currentImageAnnotations} classes={classes} getClassColor={getClassColor}
            selectedForEdit={selectedForEdit} currentRect={currentRect} currentPolygon={currentPolygon}
            currentTool={currentTool} mousePosition={mousePosition} onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onClick={handleClick}
            onDoubleClick={handleDoubleClick} onContextMenu={handleContextMenu} onMouseLeave={handleMouseLeave} zoom={zoom}
          />
        </div>
        <AnnotationToolbar currentTool={currentTool} onToolSelect={setCurrentTool} onZooomIncr={handleZoomIn} onZoomDecr={handleZoomOut} />
      </div>
      {showPopup && <AnnotationPopup position={popupPosition} classes={classes} onSave={handleSaveAnnotation} onCancel={handleCancelAnnotation} />}
    </div>
  );
}

export default ImageAnnotator;