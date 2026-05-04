import React from "react";

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " " + d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function VersionList({ versions, currentVersionId, versionsLoading, onSelectVersion, onDeleteVersion }) {
  if (versionsLoading && versions.length === 0) {
    return (
      <div className="version-list">
        <div className="versions-loading">Загрузка версий...</div>
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="version-list">
        <div className="no-versions">
          <p>Нет сохранённых версий</p>
          <p className="hint">Нажмите «+ Новая версия» чтобы зафиксировать текущее состояние датасета</p>
        </div>
      </div>
    );
  }

  return (
    <div className="version-list">
      {versions.map(version => {
        const isActive = version.id === currentVersionId;
        return (
          <div key={version.id} className={`version-card${isActive ? " version-card--active" : ""}`}>
            <div className="version-card__header">
              <div className="version-card__title">
                {isActive && <span className="version-badge">активная</span>}
                <span className="version-name">{version.name}</span>
              </div>
              <div className="version-card__actions">
                {!isActive && (
                  <button
                    className="version-btn version-btn--switch"
                    onClick={() => onSelectVersion(version.id)}
                    disabled={versionsLoading}
                    title="Переключиться на эту версию"
                  >
                    Активировать
                  </button>
                )}
                <button
                  className="version-btn version-btn--delete"
                  onClick={() => onDeleteVersion(version.id)}
                  disabled={versionsLoading}
                  title="Удалить версию"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="version-card__meta">
              <span className="version-meta-item">📅 {formatDate(version.created_at)}</span>
              <span className="version-meta-item">🖼 {version.image_count} изобр.</span>
              <span className="version-meta-item version-meta-item--storage">
                {version.storage_type === "dvc" ? "DVC" : "снапшот"}
              </span>
            </div>

            {version.classes && version.classes.length > 0 && (
              <div className="version-classes">
                {version.classes.slice(0, 8).map(cls => (
                  <span key={cls} className="version-class-tag">{cls}</span>
                ))}
                {version.classes.length > 8 && (
                  <span className="version-class-tag version-class-tag--more">
                    +{version.classes.length - 8}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default VersionList;
