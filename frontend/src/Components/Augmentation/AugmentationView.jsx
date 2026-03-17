import React, { useState, useEffect } from "react";
import useObjectUrl from "../../hooks/useObjectUrl";
import "../../styles/AugmentationView.css";

const AugmentationView = ({ collection, versions, currentVersionId }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [originalImage, setOriginalImage] = useState(null);
  const [augmentedImage, setAugmentedImage] = useState(null);

  const currentVersion = versions.find((v) => v.id === currentVersionId);
  const images = currentVersion?.images || collection?.images || [];

  const originalUrl = useObjectUrl(originalImage?.file);
  const augmentedUrl = useObjectUrl(augmentedImage?.file);

  useEffect(() => {
    setCurrentIndex(0);
  }, [collection?.id, currentVersionId]);

  useEffect(() => {
    if (images.length > 0) {
      const idx = Math.min(currentIndex, images.length - 1);
      setOriginalImage(images[idx]);
      // TODO: apply augmentations here
      setAugmentedImage(images[idx]);
    } else {
      setOriginalImage(null);
      setAugmentedImage(null);
    }
  }, [images, currentIndex]);

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
            <img src={augmentedUrl} alt="Augmented" />
          ) : (
            <div className="placeholder">Загрузка...</div>
          )}
        </div>
      </div>

      <div className="controls">
        <div className="left-controls">
          <div className="control-item">
            <label>Resize</label>
            <input type="range" min="1" max="200" defaultValue="100" />
          </div>
          <div className="control-item">
            <label>Horizontal Flip</label>
            <input type="checkbox" />
          </div>
          <div className="control-item">
            <label>Vertical Flip</label>
            <input type="checkbox" />
          </div>
          <div className="control-item">
            <label>Normalization</label>
            <input type="checkbox" />
          </div>
        </div>
        <div className="right-controls">
          <div className="control-item">
            <label>Blur</label>
            <input type="range" min="0" max="10" defaultValue="0" />
          </div>
          <div className="control-item">
            <label>Noise</label>
            <input type="range" min="0" max="10" defaultValue="0" />
          </div>
          <div className="control-item">
            <label>Brightness</label>
            <input type="range" min="0" max="200" defaultValue="100" />
          </div>
          <div className="control-item">
            <label>Contrast</label>
            <input type="range" min="0" max="200" defaultValue="100" />
          </div>
        </div>
      </div>

      <div className="buttons">
        <button className="apply-all-btn">Apply to All</button>
        <button className="new-version-btn">Create New Version</button>
      </div>
    </div>
  );
};

export default AugmentationView;

