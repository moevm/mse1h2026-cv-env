import React from "react";

import "../../styles/AnnotationView.css";
import "../../styles/AugmentationView.css";

function ImageGallery({ images, onImageClick }) {
  return (
    <div className="image-gallery">
      <div className="gallery-grid">
        {images.map((image, index) => (
          <div
            key={index}
            className={`gallery-item ${image.isMarked ? "marked" : ""}`}
            onClick={() => onImageClick(image)}
          >
            <div className="image-container">
              <img src={image.url} alt={image.name} className="gallery-image" />
              {image.isMarked && (
                <div className="marked-badge" title="Изображение размечено">
                  ✓
                </div>
              )}
            </div>
            <div className="image-info">
              <p className="image-name">{image.name}</p>
              <p className="image-size">{(image.size / 1024).toFixed(2)} KB</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ImageGallery;
