import React, { useMemo } from "react";
import VersionList from "./VersionList";
import { getDisabledFolderPaths } from "../../utils/fileSystem";
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
  
  const ignoredPaths = useMemo(() => {
    return collection?.folders ? getDisabledFolderPaths(collection.folders) : [];
  }, [collection?.folders]);

  const activeImagesCount = useMemo(() => {
    if (!collection?.images) return 0;
    if (ignoredPaths.length === 0) return collection.images.length;

    return collection.images.filter(img => {
      return !ignoredPaths.some(ignoredPath => img.relativePath.startsWith(ignoredPath + '/'));
    }).length;
  }, [collection?.images, ignoredPaths]);

  return (
    <div className="dataset-view">
      <div className="dataset-header">
        <div>
          <h2>{collection.name}</h2>
          <p className="collection-info">
            Создано: {new Date(collection.date).toLocaleDateString()} • 
            Активных изображений: {activeImagesCount} (Всего загружено: {collection?.images?.length || 0})
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
            disabled={!collection.folders || collection.folders.length === 0}
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