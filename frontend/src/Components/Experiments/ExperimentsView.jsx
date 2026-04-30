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

function ExperimentsView({ collection }) {
  const [experiments, setExperiments] = useState([]);
  const [selectedExps, setSelectedExps] = useState([]);
  const [sortBy, setSortBy] = useState("map50");
  const [sortOrder, setSortOrder] = useState("desc");
  const [loading, setLoading] = useState(false);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [comparisonExperiments, setComparisonExperiments] = useState([]);
  const [showNewExpModal, setShowNewExpModal] = useState(false);
  const [availableModels, setAvailableModels] = useState([]);
  const [availableDatasets, setAvailableDatasets] = useState([]);

  if (!collection) {
    return (
      <div className="experiments-view empty">
        <h2>Выберите проект для просмотра экспериментов</h2>
      </div>
    );
  }

  const fetchExperiments = async () => {
    setLoading(true);
    try {
      const data = await getExperiments(collection.workspacePath, sortBy, sortOrder);
      setExperiments(data);
    } catch (err) {
      console.error("Failed to load experiments", err);
      alert("Не удалось загрузить эксперименты: " + err.message);
    } finally {
      setLoading(false);
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
  }, [sortBy, sortOrder]);

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

  const handleDeleteExperiment = async (expId, expName) => {
    if (!window.confirm(`Удалить эксперимент "${expName}"? Это действие нельзя отменить.`)) {
      return;
    }
    setLoading(true);
    try {
      await deleteExperiment(expId, collection.workspacePath);
      setSelectedExps((prev) => prev.filter((id) => id !== expId));
      await fetchExperiments();
      alert("Эксперимент удалён");
    } catch (err) {
      console.error("Failed to delete experiment", err);
      alert("Ошибка удаления: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="experiments-view">
      <div className="filters">
        <div className="sort-controls">
          <label>Сортировать по:</label>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="map50">mAP50</option>
            <option value="precision">Precision</option>
            <option value="recall">Recall</option>
            <option value="f1">F1 Score</option>
          </select>
          <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
            <option value="desc">По убыванию</option>
            <option value="asc">По возрастанию</option>
          </select>
        </div>
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

      <div className="experiment-table">
        <table>
          <thead>
            <tr>
              <th>Выбрать</th>
              <th>Название</th>
              <th>Модель</th>
              <th>mAP50</th>
              <th>Precision</th>
              <th>Recall</th>
              <th>F1</th>
              <th>Статус</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {experiments.map((exp) => (
              <tr key={exp.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedExps.includes(exp.id)}
                    onChange={() => handleSelectExp(exp.id)}
                    disabled={exp.status !== "completed"}
                  />
                </td>
                <td>{exp.name}</td>
                <td className="model-path">{exp.model_path}</td>
                <td className="metric-value">{exp.map50?.toFixed(3) || "0.000"}</td>
                <td className="metric-value">{exp.precision?.toFixed(3) || "0.000"}</td>
                <td className="metric-value">{exp.recall?.toFixed(3) || "0.000"}</td>
                <td className="metric-value">{exp.f1?.toFixed(3) || "0.000"}</td>
                <td className={`status-${exp.status}`}>
                  {exp.status === "completed" ? "✅ Завершён" : exp.status}
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
            ))}
          </tbody>
        </table>
        {loading && <div className="loading">Загрузка...</div>}
        {!loading && experiments.length === 0 && (
          <div className="no-data">Нет завершённых экспериментов</div>
        )}
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
    </div>
  );
}

export default ExperimentsView;
