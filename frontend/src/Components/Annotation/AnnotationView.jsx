import React, { useState, useEffect } from "react";
import ImageGallery from "./ImageGallery";
import ImageViewer from "./ImageViewer";

import useAnnotations from "../../hooks/useAnnotations";

import "../../styles/AnnotationView.css";

function AnnotationView({ collection, versions, currentVersionId }) {
  const [currentImage, setCurrentImage] = useState(null);
  const [showViewer, setShowViewer] = useState(false);

  const annotationsManager = useAnnotations();

  useEffect(() => {
    setCurrentImage(null);
    setShowViewer(false);
  }, [collection?.id, currentVersionId]);

  const currentVersion = versions.find((v) => v.id === currentVersionId);
  const images = currentVersion?.images || collection?.images || [];

  function handleImageClick(image) {
    setCurrentImage(image);
    setShowViewer(true);
  }

  function handleCloseViewer() {
    setShowViewer(false);
    setCurrentImage(null);
  }

  function handleNextImage() {
    if (currentImage && images.length > 0) {
      const currentIndex = images.findIndex(
        (img) => img.name === currentImage.name,
      );
      if (currentIndex < images.length - 1) {
        setCurrentImage(images[currentIndex + 1]);
      }
    }
  }

  function handlePrevImage() {
    if (currentImage && images.length > 0) {
      const currentIndex = images.findIndex(
        (img) => img.name === currentImage.name,
      );
      if (currentIndex > 0) {
        setCurrentImage(images[currentIndex - 1]);
      }
    }
  }

  if (!collection) {
    return (
      <div className="annotation-view empty">
        <h2>Выберите коллекцию для разметки</h2>
      </div>
    );
  }

  const currentIndex = currentImage
    ? images.findIndex((img) => img.name === currentImage.name)
    : -1;

  return (
    <div className="annotation-view">
      <div className="annotation-header">
        <h2>{collection.name}</h2>
        {currentVersion ? (
          <div className="version-info">
            Версия: {currentVersion.name} • {images.length} изображений
          </div>
        ) : (
          <div className="version-info">Всего изображений: {images.length}</div>
        )}
      </div>

      <ImageGallery images={images} onImageClick={handleImageClick} />

      {showViewer && currentImage && (
        <ImageViewer
          key={`${collection.id}-${currentImage.name}`}
          image={currentImage}
          onClose={handleCloseViewer}
          onNext={handleNextImage}
          onPrev={handlePrevImage}
          hasNext={currentIndex < images.length - 1}
          hasPrev={currentIndex > 0}
          annotationsManager={annotationsManager}
        />
      )}
    </div>
  );
}

export default AnnotationView;
