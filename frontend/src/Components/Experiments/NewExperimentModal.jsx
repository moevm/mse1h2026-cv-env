import React, { useState, useEffect, useMemo } from "react";

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
  const [localLoading, setLocalLoading] = useState(false);
  const isLoading = parentLoading || localLoading;


  const formatModelLabel = (model) => {
    const path = model.value;
    const originalLabel = model.label;
    if (!path) return originalLabel;
    

    const parts = path.split(/[\\\/]/);
    if (parts.length < 2) return originalLabel;
    
    const fileName = parts[parts.length - 1];
    const parentFolder = parts[parts.length - 2];

    return `${parentFolder}/${fileName}`;
  };

  const enhancedModels = useMemo(() => {
    return availableModels.map(model => ({
      ...model,
      displayLabel: formatModelLabel(model)
    }));
  }, [availableModels]);

  useEffect(() => {
    if (availableModels.length > 0 && !form.model_path) {
      setForm(prev => ({ ...prev, model_path: availableModels[0].value }));
    }
  }, [availableModels]);

  useEffect(() => {
    if (availableDatasets.length > 0 && !form.data_yaml) {
      setForm(prev => ({ ...prev, data_yaml: availableDatasets[0].datasetYamlPath }));
    }
  }, [availableDatasets]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!form.model_path.trim()) {
      alert("Пожалуйста, выберите модель или укажите путь к .pt файлу");
      return;
    }
    if (!form.data_yaml.trim()) {
      alert("Пожалуйста, выберите датасет или укажите путь к .yaml файлу");
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

  return (
    <div className="exp-modal-overlay" onClick={onClose}>
      <div className="exp-modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>🚀 Запуск нового эксперимента</h3>
        <form onSubmit={handleSubmit} noValidate>
          
          <label>Название (опционально):
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Напр: Exp1"
            />
          </label>

          <label>Модель: <span className="required">*</span>
            <select
              value={availableModels.some(m => m.value === form.model_path) ? form.model_path : ""}
              onChange={(e) => setForm({ ...form, model_path: e.target.value })}
            >
              <option value="" disabled>Выберите из списка...</option>
              {enhancedModels.map((m) => (
                <option key={m.value} value={m.value}>{m.displayLabel}</option>
              ))}
            </select>
          </label>

          <label>Или свой путь к .pt файлу:
            <input
              type="text"
              value={form.model_path}
              onChange={(e) => setForm({ ...form, model_path: e.target.value })}
              placeholder="Напр: yolov8n.pt или путь/к/файлу"
            />
          </label>

          <hr style={{ margin: '20px 0', borderColor: '#e5e7eb' }} />

          <label>Датасет: <span className="required">*</span>
            <select
              value={availableDatasets.some(d => d.datasetYamlPath === form.data_yaml) ? form.data_yaml : ""}
              onChange={(e) => setForm({ ...form, data_yaml: e.target.value })}
            >
              <option value="" disabled>Выберите из списка...</option>
              {availableDatasets.map((d) => (
                <option key={d.id} value={d.datasetYamlPath}>{d.name}</option>
              ))}
            </select>
          </label>

          <label>Или свой путь к dataset.yaml:
            <input
              type="text"
              value={form.data_yaml}
              onChange={(e) => setForm({ ...form, data_yaml: e.target.value })}
              placeholder="Напр: coco8.yaml или путь/к/файлу"
            />
          </label>

          <div className="exp-modal-actions" style={{ marginTop: '20px' }}>
             <button className="exp-primary-btn" type="submit" disabled={isLoading}>
                {isLoading ? "Запуск..." : "Запустить"}
             </button>
             <button className="exp-cancel-btn" type="button" onClick={onClose}>Отмена</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewExperimentModal;
