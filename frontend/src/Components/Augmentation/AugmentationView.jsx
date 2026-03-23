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
      setAugmentedImage(images[idx]); // без реальной аугментации, только первью
    } else {
      setOriginalImage(null);
      setAugmentedImage(null);
    }
  }, [images, currentIndex]);

  const handleChange = (key, value) => {
    const data = Number(value);

    setParams((prev) => ({
      ...prev,
      [key]: data,
    }));
  };

  // Параметры с ограничениями из  AugmentationSchema
  const paramConfig = {
    hsv_h: { min: 0, max: 1, step: 0.001, decimals: 3 },
    hsv_s: { min: 0, max: 1, step: 0.01, decimals: 2 },
    hsv_v: { min: 0, max: 1, step: 0.01, decimals: 2 },
    degrees: { min: -180, max: 180, step: 1, decimals: 0 },
    translate: { min: 0, max: 1, step: 0.01, decimals: 2 },
    scale: { min: 0, max: 1, step: 0.01, decimals: 2 },
    shear: { min: -180, max: 180, step: 1, decimals: 0 },
    perspective: { min: 0, max: 0.001, step: 0.0001, decimals: 4 },
    flipud: { min: 0, max: 1, step: 0.1, decimals: 1 },
    fliplr: { min: 0, max: 1, step: 0.1, decimals: 1 },
    mosaic: { min: 0, max: 1, step: 0.1, decimals: 1 },
    mixup: { min: 0, max: 1, step: 0.1, decimals: 1 },
  };

  const handleNumberInputChange = (key, value) => {
    const config = paramConfig[key];
    const numValue = Number(value);
    // Валидация по минимум и максимум
    const validValue = Math.max(config.min, Math.min(config.max, numValue));
    handleChange(key, validValue);
  };

const getAugmentationStyle = (params) => {
  const persp = params.perspective > 0 ? Math.max(220, 1200 - params.perspective * 1000000) : 1200;
  const rotX = params.perspective * -40000; 
  const rotY = params.perspective * 24000; 
  const shearAngle = params.shear;

  const zoom = Math.max(0.2, Math.min(2, params.scale));
  const translate = params.translate * 30;
  const scaleX = params.fliplr > 0.5 ? -1 : 1;
  const scaleY = params.flipud > 0.5 ? -1 : 1;

  return {
    filter: `hue-rotate(${params.hsv_h*360}deg) saturate(${params.hsv_s*100}%) brightness(${params.hsv_v*100}%)`,
    transform: `
      rotate(${params.degrees}deg)
      scale(${zoom*scaleX}, ${zoom*scaleY})
      translate(${translate}px, ${translate}px)
      skew(${shearAngle}deg)
      perspective(${persp}px)
      rotateX(${rotX}deg)
      rotateY(${rotY}deg)
    `,
    transformOrigin: 'center',
    transformStyle: 'preserve-3d',
    transition: 'transform .15s ease-out, filter .15s ease-out',
    maxWidth: '100%',
    height: 'auto',
    display: 'block',
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
            <input type="number" min="0" max="1" step="0.001"
              value={params.hsv_h}
              onChange={(e) => handleNumberInputChange("hsv_h", e.target.value)}
            />
          </div>

          <div className="control-item">
            <label>Saturation (hsv_s)</label>
            <input type="range" min="0" max="1" step="0.01"
              value={params.hsv_s}
              onChange={(e) => handleChange("hsv_s", e.target.value)}
            />
            <input type="number" min="0" max="1" step="0.01"
              value={params.hsv_s}
              onChange={(e) => handleNumberInputChange("hsv_s", e.target.value)}
            />
          </div>

          <div className="control-item">
            <label>Brightness (hsv_v)</label>
            <input type="range" min="0" max="1" step="0.01"
              value={params.hsv_v}
              onChange={(e) => handleChange("hsv_v", e.target.value)}
            />
            <input type="number" min="0" max="1" step="0.01"
              value={params.hsv_v}
              onChange={(e) => handleNumberInputChange("hsv_v", e.target.value)}
            />
          </div>

          <div className="control-item">
            <label>Rotation (degrees)</label>
            <input type="range" min="-180" max="180"
              value={params.degrees}
              onChange={(e) => handleChange("degrees", e.target.value)}
            />
            <input type="number" min="-180" max="180" step="1"
              value={params.degrees}
              onChange={(e) => handleNumberInputChange("degrees", e.target.value)}
            />
          </div>

          <div className="control-item">
            <label>Translate</label>
            <input type="range" min="0" max="1" step="0.01"
              value={params.translate}
              onChange={(e) => handleChange("translate", e.target.value)}
            />
            <input type="number" min="0" max="1" step="0.01"
              value={params.translate}
              onChange={(e) => handleNumberInputChange("translate", e.target.value)}
            />
          </div>

          <div className="control-item">
            <label>Scale</label>
            <input type="range" min="0" max="1" step="0.01"
              value={params.scale}
              onChange={(e) => handleChange("scale", e.target.value)}
            />
            <input type="number" min="0" max="1" step="0.01"
              value={params.scale}
              onChange={(e) => handleNumberInputChange("scale", e.target.value)}
            />
          </div>
        </div>

        <div className="right-controls">
          <div className="control-item">
            <label>Shear</label>
            <input type="range" min="-180" max="180"
              value={params.shear}
              onChange={(e) => handleChange("shear", e.target.value)}
            />
            <input type="number" min="-180" max="180" step="1"
              value={params.shear}
              onChange={(e) => handleNumberInputChange("shear", e.target.value)}
            />
          </div>

          <div className="control-item">
            <label>Perspective</label>
            <input type="range" min="0" max="0.001" step="0.0001"
              value={params.perspective}
              onChange={(e) => handleChange("perspective", e.target.value)}
            />
            <input type="number" min="0" max="0.001" step="0.0001"
              value={params.perspective}
              onChange={(e) => handleNumberInputChange("perspective", e.target.value)}
            />
          </div>

          <div className="control-item">
            <label>Flip Vertical</label>
            <input type="range" min="0" max="1" step="0.1"
              value={params.flipud}
              onChange={(e) => handleChange("flipud", e.target.value)}
            />
            <input type="number" min="0" max="1" step="0.1"
              value={params.flipud}
              onChange={(e) => handleNumberInputChange("flipud", e.target.value)}
            />
          </div>

          <div className="control-item">
            <label>Flip Horizontal</label>
            <input type="range" min="0" max="1" step="0.1"
              value={params.fliplr}
              onChange={(e) => handleChange("fliplr", e.target.value)}
            />
            <input type="number" min="0" max="1" step="0.1"
              value={params.fliplr}
              onChange={(e) => handleNumberInputChange("fliplr", e.target.value)}
            />
          </div>

          <div className="control-item">
            <label>Mosaic</label>
            <input type="range" min="0" max="1" step="0.1"
              value={params.mosaic}
              onChange={(e) => handleChange("mosaic", e.target.value)}
            />
            <input type="number" min="0" max="1" step="0.1"
              value={params.mosaic}
              onChange={(e) => handleNumberInputChange("mosaic", e.target.value)}
            />
          </div>

          <div className="control-item">
            <label>Mixup</label>
            <input type="range" min="0" max="1" step="0.1"
              value={params.mixup}
              onChange={(e) => handleChange("mixup", e.target.value)}
            />
            <input type="number" min="0" max="1" step="0.1"
              value={params.mixup}
              onChange={(e) => handleNumberInputChange("mixup", e.target.value)}
            />
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