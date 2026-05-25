import React, { useRef, useEffect } from "react";
import "../../styles/AnnotationView.css";
import "../../styles/AugmentationView.css";

function Canvas({
  imageUrl,
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
}) {
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const imageUrlRef = useRef(imageUrl);

  useEffect(() => {
    imageUrlRef.current = imageUrl;
  }, [imageUrl]);

  useEffect(() => {
    if (!imageUrl) return;

    const img = new Image();
    let isCurrent = true;

    img.onload = () => {
      if (isCurrent && imageUrlRef.current === imageUrl) {
        imageRef.current = img;
        updateCanvasDimensions();
      }
    };

    img.onerror = () => {
      if (isCurrent) {
        console.warn("Failed to load image (maybe revoked):", imageUrl);
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext("2d");
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
    };

    img.src = imageUrl;

    return () => {
      isCurrent = false;
      img.onload = null;
      img.onerror = null;
    };
  }, [imageUrl]);

  useEffect(() => {
    redraw();
  }, [zoom]);

  const updateCanvasDimensions = () => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    // Внутренний размер холста ВСЕГДА равен оригинальному разрешению картинки
    canvas.width = img.width;
    canvas.height = img.height;

    redraw();
  };

  const redraw = () => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Рисуем картинку в оригинальном размере 1:1 (масштабирование сделает CSS)
    ctx.drawImage(img, 0, 0, img.width, img.height);

    annotations.forEach((annotation) => {
      const color = annotation.color || getClassColor(annotation.classId);
      const isSelected = selectedForEdit?.id === annotation.id;

      ctx.strokeStyle = color;
      // Корректируем толщину линии под зум, чтобы она оставалась тонкой на экране
      ctx.lineWidth = isSelected ? 5 / zoom : 3 / zoom; 
      ctx.fillStyle = color + "33";

      if (annotation.type === "rectangle") {
        ctx.strokeRect(
          annotation.x,
          annotation.y,
          annotation.width,
          annotation.height,
        );

        // Метка класса
        const classObj = classes.find((c) => c.id === annotation.classId);
        const className = annotation.className || (classObj ? classObj.name : "Unknown");
        ctx.fillStyle = color;
        ctx.font = `bold ${14 / zoom}px Arial`; 
        const textWidth = ctx.measureText(className).width;
        ctx.fillRect(annotation.x, annotation.y - 25 / zoom, textWidth + 10 / zoom, 20 / zoom);
        ctx.fillStyle = "white";
        ctx.fillText(className, annotation.x + 5 / zoom, annotation.y - 10 / zoom);
      } else if (annotation.type === "polygon") {
        ctx.beginPath();
        ctx.moveTo(annotation.points[0].x, annotation.points[0].y);
        for (let i = 1; i < annotation.points.length; i++) {
          ctx.lineTo(annotation.points[i].x, annotation.points[i].y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.fill();

        // Метка класса для полигона
        const classObj = classes.find((c) => c.id === annotation.classId);
        const className = annotation.className || (classObj ? classObj.name : "Unknown");
        const center = annotation.points.reduce(
          (acc, p) => ({
            x: acc.x + p.x / annotation.points.length,
            y: acc.y + p.y / annotation.points.length,
          }),
          { x: 0, y: 0 },
        );
        ctx.fillStyle = color;
        ctx.font = `bold ${14 / zoom}px Arial`;
        const textWidth = ctx.measureText(className).width;
        ctx.fillRect(
          center.x - textWidth / 2 - 5 / zoom,
          center.y - 25 / zoom,
          textWidth + 10 / zoom,
          20 / zoom,
        );
        ctx.fillStyle = "white";
        ctx.fillText(className, center.x - textWidth / 2, center.y - 10 / zoom);
      }
    });

    // Отрисовка прямоугольника в процессе создания
    if (currentRect && currentTool === "rectangle") {
      ctx.strokeStyle = "#3498db";
      ctx.lineWidth = 2 / zoom;
      ctx.setLineDash([5 / zoom, 5 / zoom]);
      ctx.strokeRect(
        currentRect.x,
        currentRect.y,
        currentRect.width,
        currentRect.height,
      );
      ctx.setLineDash([]);
    }

    // Отрисовка полигона в процессе создания
    if (currentPolygon.length > 0 && currentTool === "polygon") {
      ctx.strokeStyle = "#3498db";
      ctx.lineWidth = 2 / zoom;
      ctx.setLineDash([5 / zoom, 5 / zoom]);

      if (currentPolygon.length > 1) {
        ctx.beginPath();
        ctx.moveTo(currentPolygon[0].x, currentPolygon[0].y);
        for (let i = 1; i < currentPolygon.length; i++) {
          ctx.lineTo(currentPolygon[i].x, currentPolygon[i].y);
        }
        ctx.stroke();
      }

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
        ctx.arc(point.x, point.y, 4 / zoom, 0, 2 * Math.PI);
        ctx.fill();
      });

      if (currentPolygon.length >= 3) {
        ctx.fillStyle = "#27ae60";
        ctx.beginPath();
        ctx.arc(currentPolygon[0].x, currentPolygon[0].y, 6 / zoom, 0, 2 * Math.PI);
        ctx.fill();
      }

      ctx.setLineDash([]);
    }
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
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    
    // Переводит экранные координаты мыши строго в пиксели оригинального разрешения картинки
    const canvasX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const canvasY = (e.clientY - rect.top) * (canvas.height / rect.height);
    
    return { x: canvasX, y: canvasY };
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
    if (currentTool === "zoom") return "zoom-in";
    if (currentTool) return "crosshair";
    if (selectedForEdit) return "move";
    return "default";
  };

  const displayWidth = imageRef.current ? imageRef.current.width * zoom : "auto";
  const displayHeight = imageRef.current ? imageRef.current.height * zoom : "auto";

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
        width: displayWidth,
        height: displayHeight,
        maxWidth: "none",    
        maxHeight: "none",   
        margin: "auto"       
      }}
    />
  );
}

export default Canvas;