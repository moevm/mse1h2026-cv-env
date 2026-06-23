import React, { useEffect, useState } from "react";
import { getDatasetVersionStats } from "../../services/api";
import "../../styles/DatasetView.css";

function DatasetStats({ versionId, workspacePath, isOpen, onClose }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    if (!versionId || !workspacePath) {
      setStats(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    getDatasetVersionStats(versionId, workspacePath)
      .then((data) => setStats(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [versionId, workspacePath, isOpen]);

  if (!isOpen) return null;

  const handleClose = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleExportJSON = () => {
    if (!stats) return;
    const data = {
      total_images: stats.total_images ?? 0,
      annotated_images: stats.annotated_images ?? 0,
      classes: stats.classes ?? [],
      class_counts: stats.class_counts ?? {},
      split_stats: stats.split_stats ?? {},
      total_objects: Object.values(stats.class_counts || {}).reduce((a, b) => a + b, 0),
      avg_bbox_per_image: stats.total_images > 0
        ? (Object.values(stats.class_counts || {}).reduce((a, b) => a + b, 0) / stats.total_images).toFixed(2)
        : "0.00",
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dataset_stats_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const totalImages = stats?.total_images ?? 0;
  const annotatedImages = stats?.annotated_images ?? 0;
  const annotatedPercent =
    totalImages > 0 ? ((annotatedImages / totalImages) * 100).toFixed(1) : 0;

  const classCounts = stats?.class_counts ?? {};
  const classes = stats?.classes?.length
    ? stats.classes
    : Object.keys(classCounts);

  const totalObjects = Object.values(classCounts).reduce((a, b) => a + b, 0);
  const avgBboxPerImage =
    totalImages > 0 ? (totalObjects / totalImages).toFixed(2) : "0.00";

  const splitData = stats?.split_stats ?? null;
  const totalSplitImages = splitData
    ? Object.values(splitData).reduce((a, b) => a + b, 0)
    : 0;
  const hasSplitData = splitData && totalSplitImages > 0;

  const classColors = [
    "#4c9aff", "#ff6b6b", "#ffd93d", "#6bcb77",
    "#a29bfe", "#fd79a8", "#00b894", "#fdcb6e",
    "#e17055", "#74b9ff", "#55efc4", "#ffeaa7",
    "#dfe6e9", "#b2bec3", "#636e72", "#2d3436",
  ];

  const splitLabels = {
    train: "Train",
    val: "Val",
    test: "Test",
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content dataset-stats-modal">
        <div className="modal-header">
          <h2>📊 Статистика датасета</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {loading && <div className="stats-loading">⏳ Загрузка статистики...</div>}
        {error && <div className="stats-error">❌ Ошибка: {error}</div>}

        {!loading && !error && !stats && (
          <div className="stats-placeholder">
            {!versionId
              ? "Выберите версию для просмотра статистики"
              : "Статистика не найдена"}
          </div>
        )}

        {!loading && !error && stats && (
          <>
            <div className="stats-content">
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-icon">🖼️</div>
                  <div className="stat-label">Всего изображений</div>
                  <div className="stat-value">{totalImages}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">✅</div>
                  <div className="stat-label">Размеченные</div>
                  <div className="stat-value">{annotatedImages}</div>
                  <div className="stat-sub">{annotatedPercent}% от всех</div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">⏳</div>
                  <div className="stat-label">Неразмеченные</div>
                  <div className="stat-value">{totalImages - annotatedImages}</div>
                  <div className="stat-sub">{(100 - annotatedPercent).toFixed(1)}% от всех</div>
                </div>
              </div>

              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-icon">🏷️</div>
                  <div className="stat-label">Всего классов</div>
                  <div className="stat-value">{classes.length}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">📦</div>
                  <div className="stat-label">Всего объектов</div>
                  <div className="stat-value">{totalObjects}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">📐</div>
                  <div className="stat-label">Среднее bbox на изображение</div>
                  <div className="stat-value">{avgBboxPerImage}</div>
                </div>
              </div>

              <div className="stats-progress-section">
                <h3>Прогресс разметки</h3>
                <div className="stats-progress">
                  <div
                    className="progress-bar"
                    style={{ width: `${Math.min(annotatedPercent, 100)}%` }}
                  />
                  <span className="progress-percent">{annotatedPercent}%</span>
                </div>
                <div className="progress-labels">
                  <span>✅ Размечено: {annotatedImages}</span>
                  <span>⏳ Осталось: {totalImages - annotatedImages}</span>
                </div>
              </div>

              {hasSplitData ? (
                <div className="stats-split-section">
                  <h3>Распределение по сплитам</h3>
                  <div className="split-grid">
                    {Object.entries(splitData).map(([split, count]) => {
                      const percent =
                        totalSplitImages > 0
                          ? ((count / totalSplitImages) * 100).toFixed(1)
                          : 0;
                      const label = splitLabels[split] || split;
                      return (
                        <div key={split} className="split-item">
                          <div className="split-label">{label}</div>
                          <div className="split-bar">
                            <div
                              className="split-bar-fill"
                              style={{ width: `${Math.min(percent, 100)}%` }}
                            />
                          </div>
                          <div className="split-stats">
                            <span className="split-count">{count}</span>
                            <span className="split-percent">{percent}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="stats-split-section">
                  <h3>Распределение по сплитам</h3>
                  <p className="stats-placeholder" style={{ padding: "16px", textAlign: "center" }}>
                    Информация о сплитах для этой версии пока не доступна.
                  </p>
                </div>
              )}

              {classes.length > 0 && (
                <div className="stats-classes-section">
                  <h3>Объекты по классам</h3>
                  <div className="classes-grid">
                    {classes.map((className, index) => {
                      const count = classCounts[className] || 0;
                      const percent =
                        totalObjects > 0 ? ((count / totalObjects) * 100).toFixed(1) : 0;
                      const color = classColors[index % classColors.length];
                      return (
                        <div key={className} className="class-item">
                          <div className="class-info">
                            <span className="class-dot" style={{ backgroundColor: color }} />
                            <span className="class-name">{className}</span>
                          </div>
                          <div className="class-bar">
                            <div
                              className="class-bar-fill"
                              style={{
                                width: `${Math.min(percent, 100)}%`,
                                backgroundColor: color,
                              }}
                            />
                          </div>
                          <div className="class-stats">
                            <span className="class-count">{count}</span>
                            <span className="class-percent">{percent}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="action-button secondary" onClick={handleExportJSON}>
                📥 Экспорт JSON
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default DatasetStats;
