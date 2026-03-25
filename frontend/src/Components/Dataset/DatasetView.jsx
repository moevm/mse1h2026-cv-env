import React from "react";
import VersionList from "./VersionList";
import "../../styles/DatasetView.css";

function DatasetView({
  collection,
  versions,
  currentVersionId,
  onCreateVersion,
  onSelectVersion,
  onUpdateSplit,
  onSync
}) {
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
            onClick={() => onSync(collection.id)}
            disabled={!collection.directoryHandle}
          >
            🔄 Синхронизировать
          </button>
        </div>
      </div>

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
