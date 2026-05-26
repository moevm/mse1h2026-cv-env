import React, { useEffect, useState } from "react";
import { getDatasetVersionStats } from "../../services/api";

function DatasetStats({ versionId, workspacePath }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Не делаем запрос, если нет versionId или workspacePath
    if (!versionId || !workspacePath) {
      setStats(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    getDatasetVersionStats(versionId, workspacePath)
      .then(data => setStats(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [versionId, workspacePath]);

  if (!versionId) {
  
    return(
      <div className="dataset-stats">
         <div className="stats-placeholder">Выберите версию для просмотра статистики</div>
      </div>
    )
  }
  if (loading) return <div className="stats-loading">Загрузка статистики...</div>;
  if (error) return <div className="stats-error">Ошибка: {error}</div>;
  if (!stats) return null;

  const annotatedPercent = stats.total_images > 0
    ? ((stats.annotated_images / stats.total_images) * 100).toFixed(1)
    : 0;
  const totalObjects = Object.values(stats.class_counts || {}).reduce((a, b) => a + b, 0);

  return (
    <div className="dataset-stats">
      <h3>Статистика датасета</h3>
      <div className="stats-cards">
        <div className="stat-card">
          <div className="stat-label">Размеченные изображения</div>
          <div className="stat-value">{stats.annotated_images} / {stats.total_images}</div>
          <div className="stat-progress">
            <div className="progress-bar" style={{ width: `${annotatedPercent}%` }} />
            <span className="progress-percent">{annotatedPercent}%</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Всего классов</div>
          <div className="stat-value">{stats.classes?.length || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Всего объектов</div>
          <div className="stat-value">{totalObjects}</div>
        </div>
      </div>

      {stats.classes?.length > 0 && (
        <div className="stats-classes">
          <h4>Объекты по классам</h4>
          <div className="classes-grid">
            {stats.classes.map(className => (
              <div key={className} className="class-item">
                <span className="class-name">{className}</span>
                <span className="class-count">{stats.class_counts[className]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default DatasetStats;
