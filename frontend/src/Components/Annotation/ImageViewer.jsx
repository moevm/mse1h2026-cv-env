import React from "react";
import ImageAnnotator from "./ImageAnnotator";

import "../../styles/AnnotationView.css";

function ImageViewer({
  image,
  onClose,
  onNext,
  onPrev,
  hasNext,
  hasPrev,
  annotationsManager,
}) {
  return (
    <div className="image-viewer-overlay">
      <div className="image-viewer">
        <button className="close-button" onClick={onClose}>
          {" "}
        </button>

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

        <ImageAnnotator
          image={image}
          onClose={onClose}
          annotationsManager={annotationsManager}
        />
      </div>
    </div>
  );
}

export default ImageViewer;
