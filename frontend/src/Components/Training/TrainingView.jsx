import React, { useState, useEffect } from "react";
import { getTrainingConfig, saveTrainingConfig, startTraining, validateModel } from "../../services/api";
import "../../styles/TrainingView.css";

function TrainingView() {
  const [taskQueue, setTaskQueue] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);

  const [params, setParams] = useState({
    model: "yolov8n",
    epochs: 100,
    batch: 16,
    imgsz: 640,
    device: "auto",
    workers: 8,
    patience: 50,
    save: true,
    save_period: -1,
    cache: false,
    optimizer: "SGD",
    lr0: 0.01,
    lrf: 0.01,
    momentum: 0.937,
    weight_decay: 0.0005,
    warmup_epochs: 3,
    warmup_momentum: 0.8,
    warmup_bias_lr: 0.1,
  });

  const [modelError, setModelError] = useState("");

  useEffect(() => {
    getTrainingConfig()
      .then((config) => {
        setParams((prev) => ({ ...prev, ...config }));
      })
      .catch(() => {
        console.log("Используются дефолтные параметры");
      });
  }, []);

  const handleChange = (key, value) => {
    setParams((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  // Валидация модели на бэкенде
  const validateModelAPI = async (modelName) => {
    if (!modelName.trim()) {
      setModelError("Пожалуйста, введите название модели");
      return false;
    }

    setIsValidating(true);
    setModelError("");

    try {
      const data = await validateModel(modelName);
      
      if (data.valid) {
        setModelError("");
        return true;
      } else {
        setModelError(data.message || `Модель "${modelName}" не найдена`);
        return false;
      }
    } catch (err) {
      setModelError(err.message || "Ошибка соединения с сервером");
      return false;
    } finally {
      setIsValidating(false);
    }
  };

  const handleSaveConfig = async () => {
    try {
      setIsLoading(true);
      await saveTrainingConfig(params);
      setTaskQueue([...taskQueue, "Конфигурация сохранена"]);
      alert("Конфигурация сохранена");
    } catch (error) {
      console.error("Ошибка сохранения конфига:", error);
      setTaskQueue([...taskQueue, "Ошибка сохранения конфигурации"]);
      alert("Ошибка сохранения конфигурации");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartTraining = async () => {
    const isValid = await validateModelAPI(params.model);
    
    if (!isValid) {
      setTaskQueue([...taskQueue, `Ошибка: модель "${params.model}" не найдена`]);
      return;
    }

    try {
      setIsLoading(true);
      await saveTrainingConfig(params);
      
      const response = await startTraining(params);
      
      setTaskQueue([...taskQueue, `Обучение запущено с моделью: ${params.model}`]);
      alert(`Обучение успешно запущено! Task ID: ${response.task_id || "unknown"}`);
    } catch (error) {
      console.error("Ошибка запуска обучения:", error);
      setTaskQueue([...taskQueue, `Ошибка запуска обучения: ${error.message}`]);
      alert(`Ошибка запуска обучения: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="training-view">
      <div className="params-section">
        <div className="params-left">
          <h3>Model & Basic Settings</h3>
          
          <div className="model-group">
            <label>Model:</label>
            <div style={{ flex: 1 }}>
              <input
                type="text"
                value={params.model}
                onChange={(e) => handleChange("model", e.target.value)}
                placeholder="Например: yolov8n, yolov5s, yolov11x"
                disabled={isValidating}
              />
            </div>
          </div>
          {isValidating && (
            <div className="validation-indicator">
              <span className="validation-spinner"></span>
              <span className="validation-text">Проверка модели...</span>
            </div>
          )}
          {modelError && (
            <div className="error-text">
              {modelError}
            </div>
          )}
          
          <div className="param-group">
            <label>epochs:</label>
            <input
              type="number"
              value={params.epochs}
              onChange={(e) => handleChange("epochs", e.target.value)}
            />
          </div>
          
          <div className="param-group">
            <label>batch:</label>
            <input
              type="number"
              value={params.batch}
              onChange={(e) => handleChange("batch", e.target.value)}
            />
          </div>
          
          <div className="param-group">
            <label>imgsz:</label>
            <input
              type="number"
              value={params.imgsz}
              onChange={(e) => handleChange("imgsz", e.target.value)}
            />
          </div>
          
          <div className="param-group">
            <label>device:</label>
            <select
              value={params.device}
              onChange={(e) => handleChange("device", e.target.value)}
            >
              <option value="auto">auto</option>
              <option value="cpu">CPU</option>
              <option value="0">GPU 0</option>
              <option value="1">GPU 1</option>
              <option value="-1">Auto-select most idle GPU</option>
            </select>
          </div>
          
          <div className="param-group">
            <label>workers:</label>
            <input
              type="number"
              value={params.workers}
              onChange={(e) => handleChange("workers", e.target.value)}
            />
          </div>
          
          <div className="param-group">
            <label>patience:</label>
            <input
              type="number"
              value={params.patience}
              onChange={(e) => handleChange("patience", e.target.value)}
            />
          </div>
        </div>
        
        <div className="params-right">
          <h3>Optimization & Advanced</h3>
          
          <div className="param-group checkbox-group">
            <label>save:</label>
            <input
              type="checkbox"
              checked={params.save}
              onChange={(e) => handleChange("save", e.target.checked)}
            />
          </div>
          
          <div className="param-group">
            <label>save_period:</label>
            <input
              type="number"
              value={params.save_period}
              onChange={(e) => handleChange("save_period", e.target.value)}
            />
          </div>
          
          <div className="param-group checkbox-group">
            <label>cache:</label>
            <input
              type="checkbox"
              checked={params.cache}
              onChange={(e) => handleChange("cache", e.target.checked)}
            />
          </div>
          
          <div className="param-group">
            <label>optimizer:</label>
            <select
              value={params.optimizer}
              onChange={(e) => handleChange("optimizer", e.target.value)}
            >
              <option value="auto">auto</option>
              <option value="SGD">SGD</option>
              <option value="MuSGD">MuSGD</option>
              <option value="Adam">Adam</option>
              <option value="Adamax">Adamax</option>
              <option value="AdamW">AdamW</option>
              <option value="NAdam">NAdam</option>
              <option value="RAdam">RAdam</option>
              <option value="RMSProp">RMSProp</option>
            </select>
          </div>
          
          <div className="param-group">
            <label>lr0:</label>
            <input
              type="number"
              step="0.001"
              value={params.lr0}
              onChange={(e) => handleChange("lr0", e.target.value)}
            />
          </div>
          
          <div className="param-group">
            <label>lrf:</label>
            <input
              type="number"
              step="0.001"
              value={params.lrf}
              onChange={(e) => handleChange("lrf", e.target.value)}
            />
          </div>
          
          <div className="param-group">
            <label>momentum:</label>
            <input
              type="number"
              step="0.001"
              value={params.momentum}
              onChange={(e) => handleChange("momentum", e.target.value)}
            />
          </div>
          
          <div className="param-group">
            <label>weight_decay:</label>
            <input
              type="number"
              step="0.0001"
              value={params.weight_decay}
              onChange={(e) => handleChange("weight_decay", e.target.value)}
            />
          </div>
          
          <div className="param-group">
            <label>warmup_epochs:</label>
            <input
              type="number"
              value={params.warmup_epochs}
              onChange={(e) => handleChange("warmup_epochs", e.target.value)}
            />
          </div>
          
          <div className="param-group">
            <label>warmup_momentum:</label>
            <input
              type="number"
              step="0.01"
              value={params.warmup_momentum}
              onChange={(e) => handleChange("warmup_momentum", e.target.value)}
            />
          </div>
          
          <div className="param-group">
            <label>warmup_bias_lr:</label>
            <input
              type="number"
              step="0.01"
              value={params.warmup_bias_lr}
              onChange={(e) => handleChange("warmup_bias_lr", e.target.value)}
            />
          </div>
        </div>
      </div>
        
      <div className="status">
        <h3>Task Queue:</h3>
        <ul className="task-list">
          {taskQueue.map((task, index) => (
            <li key={index} className={
              task.includes("Ошибка") ? "error" : 
              task.includes("успешно") ? "success" : ""
            }>
              {task}
            </li>
          ))}
        </ul>
        <div className="buttons">
          <button 
            className="save-config-btn"
            onClick={handleSaveConfig} 
            disabled={isLoading}
          >
            Save Configuration
          </button>
          <button 
            className="start-training-btn"
            onClick={handleStartTraining} 
            disabled={isLoading || isValidating}
          >
            Start Training
          </button>
        </div>
      </div>
    </div>
  );
}

export default TrainingView;