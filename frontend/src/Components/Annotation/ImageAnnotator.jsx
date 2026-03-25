import React, { useState, useCallback, useEffect } from "react";
import Canvas from "./Canvas";
import AnnotationToolbar from "./AnnotationToolbar";
import AnnotationPopup from "./AnnotationPopup";
import { isPointInRect, isPointInPolygon } from "../../utils/canvasUtils";
import "../../styles/AnnotationView.css";

function ImageAnnotator({ imageUrl, imageId, imageName, externalAnnotations = [], onClose, annotationsManager }) {
  const {
    annotations,
    classes,
    addAnnotation,
    addClass,
    updateAnnotation,
    deleteAnnotation,
    getClassColor,
  } = annotationsManager;

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

  const currentImageAnnotations = annotations.filter((a) => a.imageId === imageId);
  const displayedAnnotations = [...externalAnnotations, ...currentImageAnnotations];

  const findAnnotationAtPoint = useCallback(
    (point) => {
      for (let i = currentImageAnnotations.length - 1; i >= 0; i--) {
        const ann = currentImageAnnotations[i];
        if (ann.type === "rectangle" && isPointInRect(point, ann)) {
          return ann;
        } else if (ann.type === "polygon" && isPointInPolygon(point, ann.points)) {
          return ann;
        }
      }
      return null;
    },
    [currentImageAnnotations],
  );

  const handleMouseDown = useCallback(
    (e, coords) => {
      if (currentTool === "rectangle") {
        setIsDrawing(true);
        setStartPoint(coords);
        setCurrentRect({ x: coords.x, y: coords.y, width: 0, height: 0 });
      } else if (selectedForEdit) {
        let isInside = false;
        if (selectedForEdit.type === "rectangle") {
          isInside = isPointInRect(coords, selectedForEdit);
        } else if (selectedForEdit.type === "polygon") {
          isInside = isPointInPolygon(coords, selectedForEdit.points);
        }
        if (isInside) {
          setIsDragging(true);
          if (selectedForEdit.type === "rectangle") {
            setDragOffset({
              x: coords.x - selectedForEdit.x,
              y: coords.y - selectedForEdit.y,
            });
          } else if (selectedForEdit.type === "polygon") {
            setDragOffset({
              x: coords.x - selectedForEdit.points[0].x,
              y: coords.y - selectedForEdit.points[0].y,
            });
          }
        }
      }
    },
    [currentTool, selectedForEdit],
  );

  const handleMouseMove = useCallback(
    (e, coords) => {
      setMousePosition(coords);

      if (isDragging && selectedForEdit) {
        const newX = coords.x - dragOffset.x;
        const newY = coords.y - dragOffset.y;

        if (selectedForEdit.type === "rectangle") {
          updateAnnotation(selectedForEdit.id, { x: newX, y: newY });
        } else if (selectedForEdit.type === "polygon") {
          const dx = newX - selectedForEdit.points[0].x;
          const dy = newY - selectedForEdit.points[0].y;
          const newPoints = selectedForEdit.points.map((p) => ({
            x: p.x + dx,
            y: p.y + dy,
          }));
          updateAnnotation(selectedForEdit.id, { points: newPoints });
          setDragOffset({
            x: coords.x - newPoints[0].x,
            y: coords.y - newPoints[0].y,
          });
        }
      } else if (isDrawing && currentTool === "rectangle") {
        const width = coords.x - startPoint.x;
        const height = coords.y - startPoint.y;
        setCurrentRect({
          x: width > 0 ? startPoint.x : coords.x,
          y: height > 0 ? startPoint.y : coords.y,
          width: Math.abs(width),
          height: Math.abs(height),
        });
      }
    },
    [
      isDragging,
      selectedForEdit,
      dragOffset,
      isDrawing,
      currentTool,
      startPoint,
      updateAnnotation,
    ],
  );

  const handleMouseUp = useCallback(
    (e, coords) => {
      if (isDrawing && currentTool === "rectangle" && currentRect) {
        if (currentRect.width >= 10 && currentRect.height >= 10) {
          setPopupPosition({ x: e.clientX, y: e.clientY });
          setSelectedAnnotation({
            type: "rectangle",
            ...currentRect,
            imageId,
          });
          setShowPopup(true);
        }
        setIsDrawing(false);
        setCurrentRect(null);
      }
      setIsDragging(false);
    },
    [isDrawing, currentTool, currentRect, imageId],
  );

  const handleClick = useCallback(
    (e, coords) => {
      if (currentTool) {
        if (currentTool === "polygon") {
          const newPolygon = [...currentPolygon, coords];
          setCurrentPolygon(newPolygon);

          if (newPolygon.length >= 3) {
            const firstPoint = newPolygon[0];
            const distance = Math.hypot(coords.x - firstPoint.x, coords.y - firstPoint.y);
            if (distance < 15) {
              setPopupPosition({ x: e.clientX, y: e.clientY });
              setSelectedAnnotation({
                type: "polygon",
                points: newPolygon,
                imageId,
              });
              setShowPopup(true);
              setCurrentPolygon([]);
            }
          }
        }
      } else {
        const annotation = findAnnotationAtPoint(coords);
        setSelectedForEdit(annotation || null);
      }
    },
    [currentTool, currentPolygon, findAnnotationAtPoint, imageId],
  );

  const handleDoubleClick = useCallback(
    (e, coords) => {
      if (selectedForEdit && window.confirm("Удалить выделенную область?")) {
        deleteAnnotation(selectedForEdit.id);
        setSelectedForEdit(null);
      }
    },
    [selectedForEdit, deleteAnnotation],
  );

  const handleContextMenu = useCallback(
    (e, coords) => {
      e.preventDefault();
      if (currentTool === "polygon" && currentPolygon.length > 0) {
        setCurrentPolygon((prev) => prev.slice(0, -1));
      } else if (selectedForEdit) {
        setSelectedForEdit(null);
      }
    },
    [currentTool, currentPolygon, selectedForEdit],
  );

  const handleMouseLeave = useCallback(() => {
    if (isDrawing && currentTool === "rectangle") {
      setIsDrawing(false);
      setCurrentRect(null);
    }
    setMousePosition(null);
  }, [isDrawing, currentTool]);

  useEffect(() => {
    setCurrentRect(null);
    setCurrentPolygon([]);
    setIsDrawing(false);
    setSelectedForEdit(null);
  }, [currentTool]);

  const handleSaveAnnotation = useCallback(
    (classId, newClassName = null) => {
      let finalClassId = classId;
      if (newClassName) {
        finalClassId = addClass(newClassName);
      }
      if (selectedAnnotation && finalClassId) {
        addAnnotation({
          ...selectedAnnotation,
          classId: finalClassId,
        });
      }
      setShowPopup(false);
      setSelectedAnnotation(null);
    },
    [selectedAnnotation, addClass, addAnnotation],
  );

  const handleCancelAnnotation = useCallback(() => {
    setShowPopup(false);
    setSelectedAnnotation(null);
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 0.1, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - 0.1, 0.5));
  }, []);

  return (
    <div className="image-annotator">
      <div className="annotator-header">
        <h3>{imageName}</h3>
        <button className="close-button" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="annotator-main">
        <div className="canvas-container">
          <Canvas
            imageUrl={imageUrl}
            annotations={displayedAnnotations}
            classes={classes}
            getClassColor={getClassColor}
            selectedForEdit={selectedForEdit}
            currentRect={currentRect}
            currentPolygon={currentPolygon}
            currentTool={currentTool}
            mousePosition={mousePosition}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            onContextMenu={handleContextMenu}
            onMouseLeave={handleMouseLeave}
            zoom={zoom}
          />
        </div>
        <AnnotationToolbar
          currentTool={currentTool}
          onToolSelect={setCurrentTool}
          onZooomIncr={handleZoomIn}
          onZoomDecr={handleZoomOut}
        />
      </div>
      {showPopup && (
        <AnnotationPopup
          position={popupPosition}
          classes={classes}
          onSave={handleSaveAnnotation}
          onCancel={handleCancelAnnotation}
        />
      )}
    </div>
  );
}

export default ImageAnnotator;
