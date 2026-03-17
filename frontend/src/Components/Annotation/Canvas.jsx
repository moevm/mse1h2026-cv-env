import React, { useRef, useEffect } from "react";

import "../../styles/AnnotationView.css";
import "../../styles/AugmentationView.css";

const Canvas = ({
  image,
  annotations,
  classes,
  getClassColor,
  selectedForEdit,
  currentRect,
  currentPolygon,
  currentTool,
  mousePosition,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onClick,
  onDoubleClick,
  onContextMenu,
  onMouseLeave,
  zoom,
}) => {
  const canvasRef = useRef(null);
  const imageRef = useRef(null); // store loaded image to avoid reloading on zoom

  useEffect(() => {
    const img = new Image();
    img.src = image.url;
    img.onload = () => {
      imageRef.current = img;
      updateCanvasDimensions();
    };
  }, [image.url]);

  // update canvas dimensions and redraw when zoom changes
  useEffect(() => {
    updateCanvasDimensions();
  }, [zoom]);

  const updateCanvasDimensions = () => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    canvas.width = img.width * zoom;
    canvas.height = img.height * zoom;

    redraw();
  };

  const redraw = () => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();

    ctx.scale(zoom, zoom);

    ctx.drawImage(img, 0, 0, img.width, img.height);

    annotations.forEach((annotation) => {
      const color = getClassColor(annotation.classId);
      const isSelected = selectedForEdit?.id === annotation.id;

      ctx.strokeStyle = color;
      ctx.lineWidth = isSelected ? 5 : 3;
      ctx.fillStyle = color + "33";

      if (annotation.type === "rectangle") {
        // Rectangle
        ctx.strokeRect(
          annotation.x,
          annotation.y,
          annotation.width,
          annotation.height,
        );

        // Label
        const classObj = classes.find((c) => c.id === annotation.classId);
        const className = classObj ? classObj.name : "Unknown";
        ctx.fillStyle = color;
        ctx.font = "bold 14px Arial";
        const textWidth = ctx.measureText(className).width;
        ctx.fillRect(annotation.x, annotation.y - 25, textWidth + 10, 20);
        ctx.fillStyle = "white";
        ctx.fillText(className, annotation.x + 5, annotation.y - 10);
      } else if (annotation.type === "polygon") {
        // Polygon
        ctx.beginPath();
        ctx.moveTo(annotation.points[0].x, annotation.points[0].y);
        for (let i = 1; i < annotation.points.length; i++) {
          ctx.lineTo(annotation.points[i].x, annotation.points[i].y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.fill();

        // Label
        const classObj = classes.find((c) => c.id === annotation.classId);
        const className = classObj ? classObj.name : "Unknown";
        const center = annotation.points.reduce(
          (acc, p) => ({
            x: acc.x + p.x / annotation.points.length,
            y: acc.y + p.y / annotation.points.length,
          }),
          { x: 0, y: 0 },
        );
        ctx.fillStyle = color;
        ctx.font = "bold 14px Arial";
        const textWidth = ctx.measureText(className).width;
        ctx.fillRect(
          center.x - textWidth / 2 - 5,
          center.y - 25,
          textWidth + 10,
          20,
        );
        ctx.fillStyle = "white";
        ctx.fillText(className, center.x - textWidth / 2, center.y - 10);
      }
    });

    // drawing rectangle in process
    if (currentRect && currentTool === "rectangle") {
      ctx.strokeStyle = "#3498db";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(
        currentRect.x,
        currentRect.y,
        currentRect.width,
        currentRect.height,
      );
      ctx.setLineDash([]);
    }

    // drawing polygon in process
    if (currentPolygon.length > 0 && currentTool === "polygon") {
      ctx.strokeStyle = "#3498db";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);

      if (currentPolygon.length > 1) {
        ctx.beginPath();
        ctx.moveTo(currentPolygon[0].x, currentPolygon[0].y);
        for (let i = 1; i < currentPolygon.length; i++) {
          ctx.lineTo(currentPolygon[i].x, currentPolygon[i].y);
        }
        ctx.stroke();
      }

      // draw line to cursosr
      if (mousePosition && currentPolygon.length > 0) {
        ctx.beginPath();
        ctx.moveTo(
          currentPolygon[currentPolygon.length - 1].x,
          currentPolygon[currentPolygon.length - 1].y,
        );
        ctx.lineTo(mousePosition.x, mousePosition.y);
        ctx.strokeStyle = "#e67e22";
        ctx.stroke();
      }

      ctx.fillStyle = "#3498db";
      currentPolygon.forEach((point) => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI);
        ctx.fill();
      });

      if (currentPolygon.length >= 3) {
        ctx.fillStyle = "#27ae60";
        ctx.beginPath();
        ctx.arc(currentPolygon[0].x, currentPolygon[0].y, 6, 0, 2 * Math.PI);
        ctx.fill();
      }

      ctx.setLineDash([]);
    }

    ctx.restore();
  };

  useEffect(() => {
    redraw();
  }, [
    annotations,
    classes,
    selectedForEdit,
    currentRect,
    currentPolygon,
    currentTool,
    mousePosition,
  ]);

  const getCanvasCoordinates = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const canvasY = (e.clientY - rect.top) * (canvas.height / rect.height);
    return {
      x: canvasX / zoom,
      y: canvasY / zoom,
    };
  };

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    onMouseDown(e, getCanvasCoordinates(e));
  };

  const handleMouseMove = (e) => {
    onMouseMove(e, getCanvasCoordinates(e));
  };

  const handleMouseUp = (e) => {
    onMouseUp(e, getCanvasCoordinates(e));
  };

  const handleClick = (e) => {
    if (e.button !== 0) return;
    onClick(e, getCanvasCoordinates(e));
  };

  const handleDoubleClick = (e) => {
    onDoubleClick(e, getCanvasCoordinates(e));
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    onContextMenu(e, getCanvasCoordinates(e));
  };

  const handleMouseLeave = (e) => {
    onMouseLeave(e);
  };

  const getCursor = () => {
    if (currentTool) return "crosshair";
    if (selectedForEdit) return "move";
    return "default";
  };

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      onMouseLeave={handleMouseLeave}
      style={{
        display: "block",
        cursor: getCursor(),
      }}
    />
  );
};

export default Canvas;
