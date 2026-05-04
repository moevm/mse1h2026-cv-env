import React, { useMemo, useState } from "react";
import VersionList from "./VersionList";
import { getDisabledFolderPaths } from "../../utils/fileSystem";
import "../../styles/DatasetView.css";

function DatasetView({
  collection,
  versions,
  currentVersionId,
  versionsLoading,
  onCreateVersion,
  onSelectVersion,
  onDeleteVersion,
  onUpdateSplit,
  onSync,
}) {
  const [showNameInput, setShowNameInput] = useState(false);
  const [versionName, setVersionName] = useState("");

  const ignoredPaths = useMemo(() => {
    return collection?.folders ? getDisabledFolderPaths(collection.folders) : [];
  }, [collection?.folders]);

  const activeImagesCount = useMemo(() => {
    if (!collection?.images) return 0;
    if (ignoredPaths.length === 0) return collection.images.length;
    return collection.images.filter(img =>
      !ignoredPaths.some(p => img.relativePath.startsWith(p + "/"))
    ).length;
  }, [collection?.images, ignoredPaths]);

  function handleNewVersionClick() {
    setVersionName(`Версия ${versions.length + 1}`);
    setShowNameInput(true);
  }

  function handleCancel() {
    setShowNameInput(false);
    setVersionName("");
  }

  async function handleSave() {
    const trimmed = versionName.trim();
    if (!trimmed) return;
    setShowNameInput(false);
    setVersionName("");
    await onCreateVersion(trimmed);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") handleCancel();
  }

  return (
    <div className="dataset-view">
      <div className="dataset-header">
        <div>
          <h2>{collection.name}</h2>
          <p className="collection-info">
            Создано: {new Date(collection.date).toLocaleDateString()} •{" "}
            Активных изображений: {activeImagesCount} (Всего: {collection?.images?.length || 0})
          </p>
        </div>
        <div className="dataset-actions">
          {!showNameInput ? (
            <button
              className="action-button primary"
              onClick={handleNewVersionClick}
              disabled={versionsLoading}
            >
              {versionsLoading ? "Сохранение..." : "+ Новая версия"}
            </button>
          ) : (
            <div className="version-name-form">
              <input
                className="version-name-input"
                type="text"
                value={versionName}
                onChange={e => setVersionName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Название версии"
                autoFocus
                maxLength={80}
              />
              <button className="action-button primary" onClick={handleSave} disabled={!versionName.trim()}>
                Сохранить
              </button>
              <button className="action-button" onClick={handleCancel}>
                Отмена
              </button>
            </div>
          )}
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
            versionsLoading={versionsLoading}
            onSelectVersion={onSelectVersion}
            onDeleteVersion={onDeleteVersion}
          />
        </div>
      </div>
    </div>
  );
}

export default DatasetView;
