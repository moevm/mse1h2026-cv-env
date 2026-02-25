import React, { useState, useEffect } from "react";

import "../../styles/AugmentationView.css";

const AugmentationView = ({ collection, versions, currentVersionId }) => {
  const [originalImage, setOriginalImage] = useState(null);
  const [augmentedImage, setAugmentedImage] = useState(null);

  const currentVersion = versions.find((v) => v.id === currentVersionId);
  const images = currentVersion?.images || collection?.images || [];

  useEffect(() => {
    if (images.length > 0) {
      setOriginalImage(images[0]);
      // TODO: apply augmentations here
      setAugmentedImage(images[0]);
    } else {
      setOriginalImage(null);
      setAugmentedImage(null);
    }
  }, [images, currentVersionId]);

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
          {originalImage && (
            <img src={originalImage.url || originalImage} alt="Original" />
          )}
        </div>
        <div className="image-container">
          <h3>Augmented Image</h3>
          {augmentedImage && (
            <img src={augmentedImage.url || augmentedImage} alt="Augmented" />
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
