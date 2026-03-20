import React, { useState, useEffect } from "react";
import useObjectUrl from "../../hooks/useObjectUrl";
import { getAugmentations, saveAugmentations } from "../../services/api";
import "../../styles/AugmentationView.css";

function AugmentationView({ collection, versions, currentVersionId }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [originalImage, setOriginalImage] = useState(null);
  const [augmentedImage, setAugmentedImage] = useState(null);

  const [params, setParams] = useState({
    hsv_h: 0.015,
    hsv_s: 0.7,
    hsv_v: 0.4,
    degrees: 0.0,
    translate: 0.1,
    scale: 0.5,
    shear: 0.0,
    perspective: 0.0,
    flipud: 0.0,
    fliplr: 0.5,
    mosaic: 1.0,
    mixup: 0.0,
  });

  const currentVersion = versions.find((v) => v.id === currentVersionId);
  const images = currentVersion?.images || collection?.images || [];

  const originalUrl = useObjectUrl(originalImage?.file);
  const augmentedUrl = useObjectUrl(augmentedImage?.file);

  useEffect(() => {
    getAugmentations()
      .then(setParams)
      .catch(() => console.log("Используются дефолтные параметры"));
  }, []);

  useEffect(() => {
    setCurrentIndex(0);
  }, [collection?.id, currentVersionId]);

  useEffect(() => {
    if (images.length > 0) {
      const idx = Math.min(currentIndex, images.length - 1);
      setOriginalImage(images[idx]);
      setAugmentedImage(images[idx]); // пока без реальной аугментации
    } else {
      setOriginalImage(null);
      setAugmentedImage(null);
    }
  }, [images, currentIndex]);

  const handleChange = (key, value) => {
    setParams((prev) => ({
      ...prev,
      [key]: Number(value),
    }));
  };

const getAugmentationStyle = (params) => {
  // 1. Обработка отражений (вероятностная логика для превью)
  // В превью мы показываем эффект, если вероятность > 0.5
  const scaleX = params.fliplr > 0.5 ? -1 : 1;
  const scaleY = params.flipud > 0.5 ? -1 : 1;

  // 2. Расчет перспективы (очень упрощенно для CSS)
  const perspectiveEffect = params.perspective > 0 
    ? `perspective(500px) rotateX(${params.perspective * 10000}deg)` 
    : '';

  return {
    // Цветовые коррекции
    filter: `hue-rotate(${params.hsv_h * 360}deg) saturate(${params.hsv_s * 100}%) brightness(${params.hsv_v * 100}%)`,
    
    // Геометрия
    transform: `
      ${perspectiveEffect}
      rotate(${params.degrees}deg) 
      scale(${params.scale * scaleX}, ${params.scale * scaleY}) 
      translate(${params.translate * 50}px, ${params.translate * 50}px) 
      skew(${params.shear}deg, ${params.shear}deg)
    `,
    
    transformOrigin: 'center',
    transition: 'transform 0.2s ease-out, filter 0.2s ease-out', // добавим плавности для "вау-эффекта"
    display: 'block',
    maxWidth: '100%',
    height: 'auto'
    
  };
};

  const handleApply = async () => {
    try {
      await saveAugmentations(params);
      alert("Сохранено в YAML ");
    } catch (e) {
      console.error(e);
      alert("Ошибка");
    }
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => Math.min(prev + 1, images.length - 1));
  };

  if (images.length === 0) {
    return (
      <div className="augmentation">
        <div className="empty-state">
          <h3>No Images Available</h3>
          <p>This version doesn't have any images yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="augmentation">
      <div className="image-frame">
        <div className="image-container">
          <h3>Original Image</h3>
          {originalUrl ? (
            <img src={originalUrl} alt={originalImage?.name} />
          ) : (
            <div className="placeholder">Загрузка...</div>
          )}
        </div>
        <div className="image-container">
          <h3>Augmented Image</h3>
          {augmentedUrl ? (
            <img src={augmentedUrl} alt="Augmented" style={getAugmentationStyle(params)} />
          ) : (
            <div className="placeholder">Загрузка...</div>
          )}
        </div>
      </div>

      <div className="controls">
        <div className="left-controls">
          <div className="control-item">
            <label>Hue (hsv_h) </label>
            <input type="range" min="0" max="1" step="0.001"
              value={params.hsv_h}
              onChange={(e) => handleChange("hsv_h", e.target.value)}
            />
            <span>{params.hsv_h.toFixed(3)}</span>
          </div>

          <div className="control-item">
            <label>Saturation (hsv_s)</label>
            <input type="range" min="0" max="1" step="0.01"
              value={params.hsv_s}
              onChange={(e) => handleChange("hsv_s", e.target.value)}
            />
            <span>{params.hsv_s.toFixed(2)}</span>
          </div>

          <div className="control-item">
            <label>Brightness (hsv_v)</label>
            <input type="range" min="0" max="1" step="0.01"
              value={params.hsv_v}
              onChange={(e) => handleChange("hsv_v", e.target.value)}
            />
            <span>{params.hsv_v.toFixed(2)}</span>
          </div>

          <div className="control-item">
            <label>Rotation (degrees)</label>
            <input type="range" min="-180" max="180"
              value={params.degrees}
              onChange={(e) => handleChange("degrees", e.target.value)}
            />
            <span>{params.degrees.toFixed(0)}</span>
          </div>

          <div className="control-item">
            <label>Translate</label>
            <input type="range" min="0" max="1" step="0.01"
              value={params.translate}
              onChange={(e) => handleChange("translate", e.target.value)}
            />
            <span>{params.translate.toFixed(2)}</span>
          </div>

          <div className="control-item">
            <label>Scale</label>
            <input type="range" min="0" max="1" step="0.01"
              value={params.scale}
              onChange={(e) => handleChange("scale", e.target.value)}
            />
            <span>{params.scale.toFixed(2)}</span>
          </div>
        </div>

        <div className="right-controls">
          <div className="control-item">
            <label>Shear</label>
            <input type="range" min="-180" max="180"
              value={params.shear}
              onChange={(e) => handleChange("shear", e.target.value)}
            />
            <span>{params.shear.toFixed(0)}</span>
          </div>

          <div className="control-item">
            <label>Perspective</label>
            <input type="range" min="0" max="0.001" step="0.0001"
              value={params.perspective}
              onChange={(e) => handleChange("perspective", e.target.value)}
            />
            <span>{params.perspective.toFixed(4)}</span>
          </div>

          <div className="control-item">
            <label>Flip Vertical</label>
            <input type="range" min="0" max="1" step="0.1"
              value={params.flipud}
              onChange={(e) => handleChange("flipud", e.target.value)}
            />
            <span>{params.flipud.toFixed(1)}</span>
          </div>

          <div className="control-item">
            <label>Flip Horizontal</label>
            <input type="range" min="0" max="1" step="0.1"
              value={params.fliplr}
              onChange={(e) => handleChange("fliplr", e.target.value)}
            />
            <span>{params.fliplr.toFixed(1)}</span>
          </div>

          <div className="control-item">
            <label>Mosaic</label>
            <input type="range" min="0" max="1" step="0.1"
              value={params.mosaic}
              onChange={(e) => handleChange("mosaic", e.target.value)}
            />
            <span>{params.mosaic.toFixed(1)}</span>
          </div>

          <div className="control-item">
            <label>Mixup</label>
            <input type="range" min="0" max="1" step="0.1"
              value={params.mixup}
              onChange={(e) => handleChange("mixup", e.target.value)}
            />
            <span>{params.mixup.toFixed(1)}</span>
          </div>
        </div>
      </div>

      <div className="buttons">
        <button className="apply-all-btn" onClick={handleApply}>
          Apply to All
        </button>
        <button className="new-version-btn">Create New Version</button>
      </div>
    </div>
  );
}

export default AugmentationView;