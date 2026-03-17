import React from "react";
import { Grid, AutoSizer } from "react-virtualized";
import "../../styles/AnnotationView.css";
import "../../styles/AugmentationView.css";

function ImageGallery ({ images, onImageClick }) {

  const COLUMN_WIDTH = 160;  
  const ROW_HEIGHT = 120;   

  if (!images || images.length === 0) {
    return (
      <div className="image-gallery">
        Нет изображений
      </div>
    );
  }

  return (
    <div className="image-gallery">
      <AutoSizer>
        {({ height, width }) => {
          const columnCount = Math.max(1, Math.floor(width / COLUMN_WIDTH));
          const rowCount = Math.ceil(images.length / columnCount);

          function cellRenderer({ columnIndex, key, rowIndex, style }) {
            const index = rowIndex * columnCount + columnIndex;
            if (index >= images.length) return null;

            const image = images[index];
            return (
              <div key={key} style={style} className="grid-cell">
                <div
                  className={`gallery-item ${image.isMarked ? "marked" : ""}`}
                  onClick={() => onImageClick(image)}
                >

                  {image.isMarked && (
                    <div className="marked-badge" title="Изображение размечено">
                      ✓
                    </div>
                  )}
                  <div className="image-info">
                    <p className="image-name">{image.name}</p>
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
    </div>
  );
};

export default ImageGallery;
