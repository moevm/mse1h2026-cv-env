import React, { useState, useEffect, useCallback, useRef } from "react";
import { 
  getTrainingConfig, 
  saveTrainingConfig, 
  startTraining, 
  validateModel,
  getTrainingStatus,
  stopTraining,
  getAugmentations,
  getTrainingLogs
} from "../../services/api";
import { useWebSocket } from "../../hooks/useWebSocket"
import "../../styles/TrainingView.css";

function TrainingView({ collection, currentVersionId }) {
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [activeTrainings, setActiveTrainings] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);

  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const { status: wsStatus, isConnected: wsConnected } = useWebSocket(selectedTaskId);
  
  const [params, setParams] = useState({
    model: "yolov8n",
    modelName: "",
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

  const [augmentationParams, setAugmentationParams] = useState(null);
  
  const statusIntervals = useRef({});

  const currentVersion = collection?.versions?.find(v => v.id === currentVersionId);
  
  useEffect(() => {
    if (wsStatus && selectedTaskId) {
      setActiveTrainings(prev => prev.map(task => 
        task.taskId === selectedTaskId 
          ? { 
              ...task, 
              status: wsStatus.status,
              progress: wsStatus.progress || 0,
              currentEpoch: wsStatus.current_epoch,
              totalEpochs: wsStatus.total_epochs,
              loss: wsStatus.loss,
              lastUpdate: new Date() 
            }
          : task
      ));
      
      if (wsStatus.status === 'completed') {
        addLog(`Обучение "${selectedTaskId}" успешно завершено`, "success");
        
        setTimeout(() => {
          setSelectedTaskId(null);
          setActiveTrainings(prev => prev.filter(task => task.taskId !== selectedTaskId));
        }, 5000);
      }
      
      if (wsStatus.status === 'failed') {
        addLog(`Обучение "${selectedTaskId}" не завершено: ${wsStatus.error || 'неизвестная ошибка'}`, "error");
        
        setTimeout(() => {
          setSelectedTaskId(null);
          setActiveTrainings(prev => prev.filter(task => task.taskId !== selectedTaskId));
        }, 10000);
      }
      
      if (wsStatus.status === 'stopped') {
        addLog(`Обучение "${selectedTaskId}" остановлено`, "warning");
        
        setTimeout(() => {
          setSelectedTaskId(null);
          setActiveTrainings(prev => prev.filter(task => task.taskId !== selectedTaskId));
        }, 5000);
      }
    }
  }, [wsStatus, selectedTaskId]);

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      const trainingConfig = await getTrainingConfig();
      setParams(prev => ({ ...prev, ...trainingConfig }));
      addLog("Конфигурация обучения загружена", "success");
    } catch (error) {
      addLog(`Ошибка загрузки конфигурации обучения: ${error.message}, используются значения по умолчанию`, "warning");
    }

    try {
      const augConfig = await getAugmentations();
      setAugmentationParams(augConfig);
      addLog("Конфигурация аугментации загружена", "success");
    } catch (error) {
      addLog(`Ошибка загрузки конфигурации аугментации: ${error.message}`, "error");
    }
  };

  const addLog = (message, type = "info") => {
    const timestamp = new Date().toLocaleTimeString();
    setConsoleLogs(prev => [...prev, { 
      id: Date.now() + Math.random(), 
      timestamp, 
      message, 
      type 
    }]);
  };

  const clearLogs = () => {
    setConsoleLogs([]);
  };

  const loadTrainingLogs = async (taskId) => {
    try {
      const response = await getTrainingLogs(taskId, 50);
      if (response.logs && response.logs.length > 0) {
        response.logs.forEach(log => {
          addLog(log, "info");
        });
      }
    } catch (error) {
      console.error("Error loading logs:", error);
    }
  };

  const handleStopTraining = async (taskId, modelIdentifier) => {
    try {
      await stopTraining(taskId);
      addLog(`Обучение "${modelIdentifier}" остановлено пользователем`, "info");
      
      if (statusIntervals.current[taskId]) {
        clearInterval(statusIntervals.current[taskId]);
        delete statusIntervals.current[taskId];
      }
      
      setActiveTrainings(prev => prev.filter(task => task.taskId !== taskId));
      
    } catch (error) {
      addLog(`Ошибка остановки обучения "${modelIdentifier}": ${error.message}`, "error");
    }
  };

  const handleChange = (key, value) => {
    setParams((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const validateModelAPI = async (modelName) => {
    if (!modelName.trim()) {
      addLog("Пожалуйста, введите название модели", "warning");
      return false;
    }

    setIsValidating(true);

    try {
      const data = await validateModel(modelName);
      
      if (data.valid) {
        setModelError("");
        addLog(`Модель "${modelName}" найдена`, "success");
        return true;
      } else {
        const errorMsg = data.message || `Модель "${modelName}" не найдена`;
        addLog(`${errorMsg}`, "error");
        return false;
      }
    } catch (err) {
      const errorMsg = err.message || "Ошибка соединения с сервером";
      addLog(`Ошибка валидации: ${errorMsg}`, "error");
      return false;
    } finally {
      setIsValidating(false);
    }
  };

  const handleSaveConfig = async () => {
    try {
      setIsLoading(true);
      await saveTrainingConfig(params);
      addLog("Конфигурация обучения сохранена", "success");
      alert("Конфигурация сохранена");
    } catch (error) {
      addLog(`Ошибка сохранения конфигурации: ${error.message}`, "error");
      alert("Ошибка сохранения конфигурации");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartTraining = async () => {
    const isValid = await validateModelAPI(params.model);
    if (!isValid) return;

    const trainingData = {
      ...params,
      
      augmentations: augmentationParams || {},
      
      dataset: {
        id: collection.id,
        name: collection.name,
        versionId: currentVersionId,
        versionName: currentVersion.name || `Version ${currentVersionId}`,
        imageCount: currentVersion.images.length,
        images: currentVersion.images.map(img => img.path || img.name)
      },
      
      modelName: params.modelName.trim() || undefined,
      
      timestamp: new Date().toISOString(),
    };

    try {
      setIsLoading(true);
      
      await saveTrainingConfig(trainingData);
      
      const response = await startTraining(trainingData);
      
      const modelIdentifier = params.modelName.trim() || params.model;
      const taskInfo = {
        taskId: response.task_id,
        modelIdentifier: modelIdentifier,
        datasetName: collection.name,
        versionName: currentVersion.name || `Version ${currentVersionId}`,
        model: params.model,
        status: 'running',
        progress: 0,
        currentEpoch: 0,
        totalEpochs: params.epochs,
        startedAt: new Date(),
        lastUpdate: new Date()
      };
      
      setActiveTrainings(prev => [...prev, taskInfo]);
      
      addLog(`Запущено обучение "${modelIdentifier}"`, "success");
      addLog(`Task ID: ${response.task_id}`, "info");
      
      setSelectedTaskId(response.task_id);
      
      alert(`Обучение успешно запущено\nTask ID: ${response.task_id}`);
      
    } catch (error) {
      addLog(`Ошибка запуска обучения: ${error.message}`, "error");
      alert(`Ошибка запуска обучения: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      Object.values(statusIntervals.current).forEach(interval => clearInterval(interval));
    };
  }, []);

  return (
    <div className="training-view">
      <div className="params-section">
        <div className="params-left">
          <h3>Модель и базовые настройки</h3>
          
          <div className="param-group model-name-group">
            <label>Имя модели:</label>
            <input
              type="text"
              value={params.modelName}
              onChange={(e) => handleChange("modelName", e.target.value)}
              placeholder="Название для новой модели (опционально)"
            />
          </div>
          
          <div className="model-group">
            <label>Базовая модель:</label>
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
          <h3>Расширенные настройки</h3>
          
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
      
      <div className="active-trainings-section">
        <h3>Активные процессы обучения</h3>
        {activeTrainings.length === 0 ? (
          <div className="no-active-trainings">
            Нет активных процессов обучения
          </div>
        ) : (
          <div className="trainings-list">
            {activeTrainings.map((training) => (
              <div key={training.taskId} className="training-item">
                <div className="training-header">
                  <div className="training-info">
                    <span className="training-name">{training.modelIdentifier}</span>
                    <span className="training-dataset">
                      на {training.datasetName}
                      {training.versionName && ` / ${training.versionName}`}
                    </span>
                  </div>
                  <button 
                    className="stop-training-btn"
                    onClick={() => handleStopTraining(training.taskId, training.modelIdentifier)}
                  >
                    Остановить
                  </button>
                </div>
                <div className="training-details">
                  <div className="detail-item">
                    <span>Базовая модель: {training.model}</span>
                  </div>
                  <div className="detail-item">
                    <span>Статус: </span>
                    <span className={`status-badge status-${training.status}`}>
                      {training.status === 'running' ? 'Выполняется' : 
                       training.status === 'completed' ? 'Завершено' : 
                       training.status === 'failed' ? 'Ошибка' : training.status}
                    </span>
                  </div>
                  {training.currentEpoch > 0 && training.totalEpochs && (
                    <div className="detail-item">
                      <span>Эпоха: {training.currentEpoch}/{training.totalEpochs}</span>
                    </div>
                  )}
                  <div className="progress-bar-container">
                    <div 
                      className="progress-bar" 
                      style={{ width: `${training.progress || 0}%` }}
                    ></div>
                    <span className="progress-text">{training.progress || 0}%</span>
                  </div>
                  {training.loss && (
                    <div className="detail-item">
                      <span>Loss: {training.loss.toFixed(4)}</span>
                    </div>
                  )}
                  <div className="detail-item time-info">
                    <span>Запущено: {training.startedAt.toLocaleTimeString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      <div className="console-section">
        <div className="console-header">
          <h3>Логи</h3>
          <button className="clear-console-btn" onClick={clearLogs}>
            Очистить логи
          </button>
        </div>
        <div className="console-logs">
          {consoleLogs.length === 0 ? (
            <div className="empty-console">
              Здесь будут отображаться сообщения о процессе обучения
            </div>
          ) : (
            consoleLogs.map((log) => (
              <div key={log.id} className={`log-entry log-${log.type}`}>
                <span className="log-time">[{log.timestamp}]</span>
                <span className="log-message">{log.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
      
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
  );
}

export default TrainingView;