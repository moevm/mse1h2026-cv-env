import React, { useState, useEffect } from "react";
import VersionList from "./VersionList";

import "../../styles/DatasetView.css";

function DatasetView({
  collection,
  versions,
  currentVersionId,
  onCreateVersion,
  onSelectVersion,
  onUpdateSplit,
}) {
  const [showAugmenter, setShowAugmenter] = useState(false);

  return (
    <div className="dataset-view">
      <div className="dataset-header">
        <div>
          <h2>{collection.name}</h2>
          <p className="collection-info">
            Создано: {new Date(collection.date).toLocaleDateString()} • Всего
            изображений в коллекции: {collection.images.length}
          </p>
        </div>
        <div className="dataset-actions">
          <button
            className="action-button primary"
            onClick={() => onCreateVersion(`Версия ${versions.length + 1}`)}
          >
            + Новая версия
          </button>
          <button
            className="action-button"
            onClick={() => setShowAugmenter(true)}
            disabled={!currentVersionId}
          >
            📁 Дополнить датасет
          </button>
        </div>
      </div>

      {showAugmenter && (
        <div className="augmenter-modal">
          <div className="modal-content">
            <h3>Дополнить датасет "{collection.name}"</h3>
            <p>Текущая версия: {currentVersion?.name}</p>
            <FolderUploader
              onFolderUpload={handleAugment}
              onCancel={() => setShowAugmenter(false)}
              buttonText="Выбрать папку с новыми изображениями"
            />
          </div>
        </div>
      )}

      <div className="dataset-content">
        <div className="versions-section">
          <h3>Версии датасета</h3>
          <VersionList
            versions={versions}
            currentVersionId={currentVersionId}
            onSelectVersion={onSelectVersion}
            collectionName={collection.name}
          />
        </div>
      </div>
    </div>
  );
}

export default DatasetView;
