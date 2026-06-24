import React, { useState, useEffect } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import {
  getExperiments,
  runExperiment,
  compareExperiments,
  deleteExperiment,
  updateExperiment,
  getAvailableModels,
  getStoredDatasets,
} from "../../services/api";
import NewExperimentModal from "./NewExperimentModal";
import CompareModal from "./CompareModal";
import "../../styles/ExperimentsView.css";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

const calculateCompositeScore = (exp) => {
  const map = exp.map_ || 0;
  const map50 = exp.map50 || 0;
  const precision = exp.precision || 0;
  const recall = exp.recall || 0;
  
  return (map * 0.4) + (map50 * 0.3) + (precision * 0.15) + (recall * 0.15);
};


const SORT_METRICS = [
  { value: "composite", label: "🏆 Composite Score" },
  { value: "map_", label: "mAP" },
  { value: "map50", label: "mAP50" },
  { value: "precision", label: "Precision" },
  { value: "recall", label: "Recall" },
];

const RESULT_LABELS = [
  { value: "", label: "— Не задано" },
  { value: "good", label: "👍 Good" },
  { value: "bad", label: "👎 Bad" },
  { value: "needs_retry", label: "🔁 Needs retry" },
];

// Ячейка с текстом (цель / заметка), редактируемая по клику.
const EditableCell = ({ value, placeholder, multiline = false, disabled = false, onSave }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(value || "");
  }, [value, editing]);

  const handleSave = async () => {
    if (draft === (value || "")) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } catch (err) {
      // onSave сам показывает ошибку; остаёмся в режиме редактирования
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setDraft(value || "");
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="editable-cell editing">
        {multiline ? (
          <textarea
            autoFocus
            rows={2}
            value={draft}
            disabled={saving}
            onChange={(e) => setDraft(e.target.value)}
          />
        ) : (
          <input
            type="text"
            autoFocus
            value={draft}
            disabled={saving}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") handleCancel();
            }}
          />
        )}
        <div className="editable-actions">
          <button type="button" className="cell-save-btn" onClick={handleSave} disabled={saving} title="Сохранить">💾</button>
          <button type="button" className="cell-cancel-btn" onClick={handleCancel} disabled={saving} title="Отмена">✖</button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`editable-cell${disabled ? " disabled" : ""}`}
      onClick={() => !disabled && setEditing(true)}
      title={disabled ? "" : "Нажмите, чтобы редактировать"}
    >
      {value ? (
        <span className="cell-text">{value}</span>
      ) : (
        <span className="cell-empty">{placeholder}</span>
      )}
    </div>
  );
};

const SortMetricSelect = ({ value, onChange, placeholder, disabled = false }) => {
  return (
    <select value={value} onChange={onChange} disabled={disabled}>
      {placeholder && <option value="none">— {placeholder} —</option>}
      {SORT_METRICS.map((metric) => (
        <option key={metric.value} value={metric.value}>
          {metric.label}
        </option>
      ))}
    </select>
  );
};

function ExperimentsView({ collection }) {
  const [experiments, setExperiments] = useState([]);
  const [selectedExps, setSelectedExps] = useState([]);
  const [sortPrimary, setSortPrimary] = useState("composite");
  const [sortSecondary, setSortSecondary] = useState("none");
  const [sortTertiary, setSortTertiary] = useState("none");
  const [sortOrder, setSortOrder] = useState("desc");
  const [loading, setLoading] = useState(false);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [comparisonExperiments, setComparisonExperiments] = useState([]);
  const [showNewExpModal, setShowNewExpModal] = useState(false);
  const [availableModels, setAvailableModels] = useState([]);
  const [availableDatasets, setAvailableDatasets] = useState([]);
  const [isPolling, setIsPolling] = useState(false);
  const [tooltip, setTooltip] = useState({ visible: false, text: '', x: 0, y: 0 });

  if (!collection) {
    return (
      <div className="experiments-view empty">
        <h2>Выберите проект для просмотра экспериментов</h2>
      </div>
    );
  }

  const sortExperiments = (experimentsList) => {
    const getValue = (exp, metric) => {
      if (metric === "composite") {
        return calculateCompositeScore(exp);
      }
      if (metric === "none") return null;
      return exp[metric] || 0;
    };

    const compare = (a, b, metric) => {
      if (metric === "none") return 0;
      const aVal = getValue(a, metric);
      const bVal = getValue(b, metric);
      if (aVal !== bVal) {
        return (aVal - bVal) * (sortOrder === "desc" ? -1 : 1);
      }
      return 0;
    };

    return [...experimentsList].sort((a, b) => {
      return compare(a, b, sortPrimary) || 
             compare(a, b, sortSecondary) || 
             compare(a, b, sortTertiary);
    });
  };

  const fetchExperiments = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await getExperiments(collection.workspacePath, "map50", "desc");
      setExperiments(data);
    } catch (err) {
      console.error("Failed to load experiments", err);
      if (!silent) alert("Не удалось загрузить эксперименты: " + err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchModelsAndDatasets = async () => {
    try {
      const [models, datasets] = await Promise.all([
        getAvailableModels(collection.workspacePath),
        getStoredDatasets(collection.workspacePath),
      ]);
      setAvailableModels(models);
      setAvailableDatasets(datasets.datasets || []);
    } catch (err) {
      console.error("Failed to load models/datasets", err);
    }
  };

  useEffect(() => {
    fetchExperiments();
    fetchModelsAndDatasets();
  }, []);

  const hasRunning = experiments.some(exp => exp.status === "running");

  useEffect(() => {
    let intervalId;
    if (hasRunning) {
      setIsPolling(true);
      intervalId = setInterval(() => {
        fetchExperiments(true);
      }, 4000);
    } else {
      setIsPolling(false);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [hasRunning]);

  const handleSelectExp = (expId) => {
    setSelectedExps((prev) =>
      prev.includes(expId) ? prev.filter((id) => id !== expId) : [...prev, expId]
    );
  };

  const handleCompare = async () => {
    if (selectedExps.length < 2) {
      alert("Выберите минимум 2 эксперимента для сравнения");
      return;
    }
    setLoading(true);
    try {
      const response = await compareExperiments(selectedExps, collection.workspacePath);
      const experimentsList = Object.values(response.experiments);
      setComparisonExperiments(experimentsList);
      setShowCompareModal(true);
    } catch (err) {
      console.error("Comparison failed", err);
      alert("Ошибка загрузки данных сравнения: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateExperiment = async (formData) => {
    await runExperiment(formData, collection.workspacePath);
    alert("✅ Эксперимент успешно запущен");
    fetchExperiments();
  };

  const handleUpdateExperiment = async (expId, fields) => {
    // Оптимистично обновляем строку, затем синхронизируемся с ответом сервера.
    setExperiments((prev) => prev.map((e) => (e.id === expId ? { ...e, ...fields } : e)));
    try {
      const updated = await updateExperiment(expId, fields, collection.workspacePath);
      setExperiments((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    } catch (err) {
      console.error("Failed to update experiment", err);
      alert("Ошибка сохранения: " + err.message);
      await fetchExperiments(true);
      throw err;
    }
  };

  const handleDeleteExperiment = async (expId, expName) => {
    if (!window.confirm(`Удалить эксперимент "${expName}"? Это действие нельзя отменить.`)) {
      return;
    }
    setLoading(true);
    try {
      await deleteExperiment(expId, collection.workspacePath);
      setSelectedExps((prev) => prev.filter((id) => id !== expId));
      await fetchExperiments();
    } catch (err) {
      console.error("Failed to delete experiment", err);
      alert("Ошибка удаления: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const sortedExperiments = sortExperiments(experiments);
  const bestExpId = sortedExperiments[0]?.id;

  return (
    <div className="experiments-view">
      <div className="filters">
        <div className="sort-controls">
          <div className="sort-group">
            <label>Сначала по:</label>
            <SortMetricSelect 
              value={sortPrimary} 
              onChange={(e) => setSortPrimary(e.target.value)} 
            />
          </div>
          
          <div className="sort-group">
            <label>Затем по:</label>
            <SortMetricSelect 
              value={sortSecondary} 
              onChange={(e) => setSortSecondary(e.target.value)} 
              placeholder="Не важно"
            />
          </div>
          
          <div className="sort-group">
            <label>Потом по:</label>
            <SortMetricSelect 
              value={sortTertiary} 
              onChange={(e) => setSortTertiary(e.target.value)} 
              placeholder="Не важно"
            />
          </div>
          
          <div className="sort-group">
            <label>Порядок:</label>
            <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
              <option value="desc">📉 По убыванию (лучшие сверху)</option>
              <option value="asc">📈 По возрастанию</option>
            </select>
          </div>
        </div>
        
        <div className="action-buttons">
          <button onClick={() => setShowNewExpModal(true)} disabled={loading}>
            🧪 Новый эксперимент
          </button>
          <button
            onClick={handleCompare}
            disabled={selectedExps.length < 2 || loading}
          >
            📈 Сравнить ({selectedExps.length})
          </button>
        </div>
      </div>

      <div className="experiment-table">
        <table>
          <thead>
            <tr>
              <th>Выбрать</th>
              <th>Название</th>
              <th>Цель</th>
              <th>Модель</th>
              <th>mAP50
                <span className="tooltip-icon"
                  onMouseEnter={(e) => setTooltip({ visible: true, text: 'Mean Average Precision при IoU=0.5', x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setTooltip({ visible: false })}>?</span>
              </th>
              <th>mAP
                <span className="tooltip-icon"
                  onMouseEnter={(e) => setTooltip({ visible: true, text: 'Mean Average Precision (0.5:0.95)', x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setTooltip({ visible: false })}>?</span>
              </th>
              <th>Precision
                <span className="tooltip-icon"
                  onMouseEnter={(e) => setTooltip({ visible: true, text: 'Точность: TP/(TP+FP)', x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setTooltip({ visible: false })}>?</span>
              </th>
              <th>Recall
                <span className="tooltip-icon"
                  onMouseEnter={(e) => setTooltip({ visible: true, text: 'Полнота: TP/(TP+FN)', x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setTooltip({ visible: false })}>?</span>
              </th>
              <th>🏆 Score
                <span className="tooltip-icon"
                  onMouseEnter={(e) => setTooltip({ visible: true, text: 'Сумма mAP50, mAP, Precision и Recall', x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setTooltip({ visible: false })}>?</span>
              </th>
              <th>Статус</th>
              <th>Результат</th>
              <th>Заметки</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sortedExperiments.map((exp) => {
              const isBest = exp.id === bestExpId;
              const compositeScore = calculateCompositeScore(exp);
              
              return (
                <tr key={exp.id} className={isBest ? "best-experiment" : ""}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedExps.includes(exp.id)}
                      onChange={() => handleSelectExp(exp.id)}
                      disabled={exp.status !== "completed"}
                    />
                  </td>
                  <td>{exp.name}</td>
                  <td className="goal-cell">
                    <EditableCell
                      value={exp.goal}
                      placeholder="+ Добавить цель"
                      onSave={(val) => handleUpdateExperiment(exp.id, { goal: val })}
                    />
                  </td>
                  <td className="model-path">{exp.model_path}</td>
                  <td className="metric-value">{exp.map50?.toFixed(3) || "0.000"}</td>
                  <td className="metric-value">{exp.map_?.toFixed(3) || "0.000"}</td>
                  <td className="metric-value">{exp.precision?.toFixed(3) || "0.000"}</td>
                  <td className="metric-value">{exp.recall?.toFixed(3) || "0.000"}</td>
                  <td className="metric-value composite">
                    {compositeScore.toFixed(4)}
                  </td>
                  <td className={`status-${exp.status}`}>
                    {exp.status === "completed" ? "✅ Завершён" : exp.status}
                  </td>
                  <td className="result-cell">
                    <select
                      className={`result-select result-${exp.result_label || "none"}`}
                      value={exp.result_label || ""}
                      onChange={(e) => handleUpdateExperiment(exp.id, { result_label: e.target.value })}
                      disabled={exp.status === "running"}
                    >
                      {RESULT_LABELS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="notes-cell">
                    <EditableCell
                      value={exp.notes}
                      placeholder="+ Добавить заметку"
                      multiline
                      onSave={(val) => handleUpdateExperiment(exp.id, { notes: val })}
                    />
                  </td>
                  <td>
                    <button
                      className="delete-exp-btn"
                      onClick={() => handleDeleteExperiment(exp.id, exp.name)}
                      disabled={exp.status === "running"}
                      title="Удалить эксперимент"
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        
        {loading && !isPolling && <div className="loading">Загрузка...</div>}
        {!loading && experiments.length === 0 && (
          <div className="no-data">Нет завершённых экспериментов</div>
        )}
        {isPolling && <div className="polling-hint">Автообновление статусов...</div>}
      </div>

      {showNewExpModal && (
        <NewExperimentModal
          onClose={() => setShowNewExpModal(false)}
          onSuccess={handleCreateExperiment}
          loading={loading}
          availableModels={availableModels}
          availableDatasets={availableDatasets}
          collection={collection}
        />
      )}

      {showCompareModal && comparisonExperiments.length > 0 && (
        <CompareModal
          experiments={comparisonExperiments}
          onClose={() => setShowCompareModal(false)}
          collection={collection}
        />
      )}
      {tooltip.visible && (
        <div className="tooltip" style={{ left: tooltip.x + 10, top: tooltip.y + 10 }}>
          {tooltip.text}
        </div>
      )}
    </div>
  );
}

export default ExperimentsView;
