import React, { useState } from "react"; // Добавили useState для управления попапом
import { Grid, AutoSizer } from "react-virtualized";
import "../../styles/AnnotationView.css";
import "../../styles/AugmentationView.css";

function ImageGallery ({ images, onImageClick, validationResults = {} }) {
  const [activeErrorPopup, setActiveErrorPopup] = useState(null);

  const COLUMN_WIDTH = 160;  
  const ROW_HEIGHT = 130; 

  if (!images || images.length === 0) {
    return (
      <div className="image-gallery">
        Нет изображений
      </div>
    );
  }

  return (
    <div className="image-gallery" style={{ position: "relative" }}>
      <AutoSizer>
        {({ height, width }) => {
          const columnCount = Math.max(1, Math.floor(width / COLUMN_WIDTH));
          const rowCount = Math.ceil(images.length / columnCount);

          function cellRenderer({ columnIndex, key, rowIndex, style }) {
            const index = rowIndex * columnCount + columnIndex;
            if (index >= images.length) return null;

            const image = images[index];
            const imgId = image.uuid || image.relativePath || image.id;
            
            // Проверяем наличие ошибок разметки
            const errors = validationResults[imgId];
            const hasErrors = errors && errors.length > 0;
            
            // Проверка, является ли файл .txt заглушкой без реальной картинки
            const isStray = image.isStrayTxt || (image.name && image.name.endsWith('.txt') && !image.url) || image.missingImage;

            return (
              <div key={key} style={style} className="grid-cell">
                <div
                  className={`gallery-item ${image.isMarked ? "marked" : ""} ${hasErrors ? "has-validation-errors" : ""} ${isStray ? "stray-txt-item" : ""}`}
                  onClick={() => onImageClick(image)}
                >
                  {image.isMarked && !hasErrors && (
                    <div className="marked-badge" title="Изображение размечено">
                      ✓
                    </div>
                  )}

                  {hasErrors && (
                    <div 
                      className="validation-badge" 
                      title="Посмотреть ошибки разметки"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveErrorPopup({ name: image.name, list: errors });
                      }}
                    >
                      ⚠️
                    </div>
                  )}

                  <div className="image-info">
                    <p className="image-name">
                      {image.name}
                    </p>
                    <p className="image-size">{(image.size / 1024).toFixed(2)} KB</p>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <Grid
              cellRenderer={cellRenderer}
              columnCount={columnCount}
              columnWidth={COLUMN_WIDTH}
              height={height}
              rowCount={rowCount}
              rowHeight={ROW_HEIGHT}
              width={width}
            />
          );
        }}
      </AutoSizer>

      {activeErrorPopup && (
        <div className="validation-modal-overlay" onClick={() => setActiveErrorPopup(null)}>
          <div className="validation-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="validation-modal-header">
              <h4>Ошибки валидации: {activeErrorPopup.name}</h4>
              <button className="validation-modal-close" onClick={() => setActiveErrorPopup(null)}>×</button>
            </div>
            <div className="validation-modal-body">
              {activeErrorPopup.list.map((errorMsg, errIdx) => (
                <div key={errIdx} className="validation-modal-error-item">
                  • {errorMsg}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageGallery;
