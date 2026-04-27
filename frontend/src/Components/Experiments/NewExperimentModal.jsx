// components/NewExperimentModal.jsx
import React, { useState, useEffect } from "react";

const NewExperimentModal = ({ 
  onClose, 
  onSuccess, 
  loading: parentLoading,
  availableModels = [],
  availableDatasets = [],
}) => {
  const [form, setForm] = useState({
    name: "",
    model_path: "",
    data_yaml: "",
    conf_threshold: 0.25,
    iou_threshold: 0.45,
  });
  const [isCustomPath, setIsCustomPath] = useState(false);
  const [localLoading, setLocalLoading] = useState(false);
  const isLoading = parentLoading || localLoading;

  // Когда загрузятся модели – выбираем первую, если ещё не выбрана и не кастомный путь
  useEffect(() => {
    if (availableModels.length > 0 && !form.model_path && !isCustomPath) {
      const firstModel = availableModels[0];
      if (firstModel.value !== "__custom__") {
        setForm(prev => ({ ...prev, model_path: firstModel.value }));
      }
    }
  }, [availableModels, isCustomPath]);

  // Когда загрузятся датасеты – выбираем первый, если ещё не выбран
  useEffect(() => {
    if (availableDatasets.length > 0 && !form.data_yaml) {
      setForm(prev => ({ ...prev, data_yaml: availableDatasets[0].datasetYamlPath }));
    }
  }, [availableDatasets]);

  const handleModelChange = (value) => {
    if (value === "__custom__") {
      setIsCustomPath(true);
      setForm({ ...form, model_path: "" });
    } else {
      setIsCustomPath(false);
      setForm({ ...form, model_path: value });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.model_path || !form.data_yaml) {
      alert("Заполните все обязательные поля");
      return;
    }

    setLocalLoading(true);
    try {
      await onSuccess(form);
      onClose();
    } catch (err) {
      console.error("Failed to start experiment", err);
      alert("Ошибка запуска эксперимента: " + err.message);
    } finally {
      setLocalLoading(false);
    }
  };

  // Пока данные загружаются – показываем лоадер внутри модалки
  if (!availableModels.length || !availableDatasets.length) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <h3>🚀 Запуск нового эксперимента</h3>
          <div className="loading">Загрузка списка моделей и датасетов...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>🚀 Запуск нового эксперимента</h3>
        <form onSubmit={handleSubmit}>
          <label>
            Название (опционально):
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="например: Baseline v1"
            />
          </label>

          <label>
            Обученная модель: <span className="required">*</span>
            <select
              required
              value={isCustomPath ? "__custom__" : (form.model_path || "")}
              onChange={(e) => handleModelChange(e.target.value)}
            >
              {availableModels.map((model) => (
                <option key={model.value} value={model.value}>
                  {model.label}
                </option>
              ))}
            </select>
          </label>

          {isCustomPath && (
            <label>
              Путь к .pt файлу:
              <input
                type="text"
                required
                value={form.model_path}
                onChange={(e) => setForm({ ...form, model_path: e.target.value })}
                placeholder="/path/to/your/model.pt"
              />
            </label>
          )}

          <label>
            Датасет: <span className="required">*</span>
            <select
              required
              value={form.data_yaml}
              onChange={(e) => setForm({ ...form, data_yaml: e.target.value })}
            >
              {availableDatasets.map((dataset) => (
                <option key={dataset.id} value={dataset.datasetYamlPath}>
                  {dataset.name} ({dataset.imageCount} изображений)
                </option>
              ))}
            </select>
          </label>

          <label>
            Или свой путь к dataset.yaml:
            <input
              type="text"
              value={form.data_yaml}
              onChange={(e) => setForm({ ...form, data_yaml: e.target.value })}
              placeholder="/path/to/dataset.yaml"
            />
          </label>

          <label>
            Confidence Threshold:
            <input
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={form.conf_threshold}
              onChange={(e) =>
                setForm({ ...form, conf_threshold: parseFloat(e.target.value) || 0 })
              }
            />
          </label>

          <label>
            IoU Threshold:
            <input
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={form.iou_threshold}
              onChange={(e) =>
                setForm({ ...form, iou_threshold: parseFloat(e.target.value) || 0 })
              }
            />
          </label>

          <div className="modal-buttons">
            <button type="submit" disabled={isLoading}>
              {isLoading ? "Запуск..." : "Запустить"}
            </button>
            <button type="button" onClick={onClose}>
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewExperimentModal;
