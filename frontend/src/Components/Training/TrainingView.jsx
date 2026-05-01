import React, { useState, useEffect, useCallback, useRef } from "react";
import { 
  getTrainingConfig, 
  saveTrainingConfig, 
  startTraining, 
  validateModel,
  stopTraining,
  getAugmentations,
  getTrainingLogs,
  getTrainingMetrics
} from "../../services/api";
import "../../styles/TrainingView.css";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

function TrainingView({ collection, currentVersionId }) {
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [activeTrainings, setActiveTrainings] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const completedTasksRef = useRef(new Set());
  const websocketsRef = useRef({});
   const metricsPollsRef = useRef({}); // для хранения таймеров опроса метрик

  // Словарь для хранения метрик по каждому активному обучению
  const [metricsData, setMetricsData] = useState({});
  const [metricsPanelOpen, setMetricsPanelOpen] = useState({});
  const [metricsHistoryOpen, setMetricsHistoryOpen] = useState({});
  
  const [params, setParams] = useState({
    model: "yolov8n",
    modelName: "",
    use_coco8: false,
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

  const currentVersion = collection?.versions?.find(v => v.id === currentVersionId);

  const addLog = useCallback((message, type = "info") => {
    const timestamp = new Date().toLocaleTimeString();
    setConsoleLogs(prev => [...prev, { 
      id: Date.now() + Math.random(), 
      timestamp, 
      message, 
      type 
    }]);
  }, []);

  const toggleMetricsPanel = useCallback((taskId) => {
    setMetricsPanelOpen(prev => ({
      ...prev,
      [taskId]: !prev[taskId]
    }));
  }, []);

  const toggleMetricsHistory = useCallback((taskId) => {
    setMetricsHistoryOpen(prev => ({
      ...prev,
      [taskId]: !prev[taskId]
    }));
  }, []);

  const createWebSocket = useCallback((taskId, taskInfo) => {
    if (websocketsRef.current[taskId]) {
      return;
    }
    
    console.log(`[WS] Creating connection for task ${taskId}`);
    const ws = new WebSocket(`ws://localhost:8000/api/training/ws/${taskId}`);
    
    ws.onopen = () => {
      console.log(`[WS] Connected for task ${taskId}`);
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log(`[WS] Status for ${taskId}: epoch=${data.current_epoch}, progress=${data.progress}%, status=${data.status}`);
        
        setActiveTrainings(prev => prev.map(task => 
          task.taskId === taskId 
            ? { 
                ...task, 
                status: data.status,
                progress: Math.round(data.progress || 0),
                currentEpoch: data.current_epoch,
                totalEpochs: data.total_epochs,
                loss: data.loss,
                lastUpdate: new Date() 
              }
            : task
        ));
        
        if (data.status === 'completed') {
          stopMetricsPolling(taskId);
          addLog(`Обучение "${taskInfo.modelIdentifier}" успешно завершено`, "success");
          completedTasksRef.current.add(taskId);
          
          if (websocketsRef.current[taskId]) {
            websocketsRef.current[taskId].close();
            delete websocketsRef.current[taskId];
          }
          
          setTimeout(() => {
            setActiveTrainings(prev => prev.filter(task => task.taskId !== taskId));
          }, 5000);
        }
        
        if (data.status === 'failed') {
          stopMetricsPolling(taskId);

          addLog(`Обучение "${taskInfo.modelIdentifier}" не завершено: ${data.error || 'неизвестная ошибка'}`, "error");
          completedTasksRef.current.add(taskId);
          
          if (websocketsRef.current[taskId]) {
            websocketsRef.current[taskId].close();
            delete websocketsRef.current[taskId];
          }
          
          setTimeout(() => {
            setActiveTrainings(prev => prev.filter(task => task.taskId !== taskId));
          }, 10000);
        }
        
        if (data.status === 'stopped') {
          stopMetricsPolling(taskId);

          addLog(`Обучение "${taskInfo.modelIdentifier}" остановлено`, "warning");
          completedTasksRef.current.add(taskId);
          
          if (websocketsRef.current[taskId]) {
            websocketsRef.current[taskId].close();
            delete websocketsRef.current[taskId];
          }
          
          setTimeout(() => {
            setActiveTrainings(prev => prev.filter(task => task.taskId !== taskId));
          }, 5000);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };
    
    ws.onerror = (error) => {
      console.error(`[WS] Error for task ${taskId}:`, error);
    };
    
    ws.onclose = (event) => {
      console.log(`[WS] Closed for task ${taskId}, code=${event.code}`);
      if (websocketsRef.current[taskId]) {
        delete websocketsRef.current[taskId];
      }
    };
    
    websocketsRef.current[taskId] = ws;
  }, [addLog]);
  
  const startMetricsPolling = useCallback((taskId, taskInfo) => {
    if (metricsPollsRef.current[taskId]) clearInterval(metricsPollsRef.current[taskId]);
    
    const poll = setInterval(async () => {
      try {
        const data = await getTrainingMetrics(taskId);
        setMetricsData(prev => ({
          ...prev,
          [taskId]: data
        }));
        // Обновляем также в activeTrainings (если нужно)
        setActiveTrainings(prev => prev.map(t => 
          t.taskId === taskId ? { ...t, metrics: data.latest } : t
        ));
      } catch (error) {
        // Если обучение завершено и metrics уже нет – остановим опрос
        if (error.message.includes("404")) {
          if (metricsPollsRef.current[taskId]) clearInterval(metricsPollsRef.current[taskId]);
          delete metricsPollsRef.current[taskId];
        }
      }
    }, 2000);
    metricsPollsRef.current[taskId] = poll;
  }, []);



  useEffect(() => {
    return () => {
      Object.values(websocketsRef.current).forEach(ws => {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      });
      websocketsRef.current = {};
    };
  }, []);

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      const trainingConfig = await getTrainingConfig(collection.workspacePath);
      setParams(prev => ({ 
        ...prev, 
        ...trainingConfig,
        modelName: trainingConfig.modelName || ""
      }));
      addLog("Конфигурация обучения загружена", "success");
    } catch (error) {
      addLog(`Ошибка загрузки конфигурации обучения: ${error.message}, используются значения по умолчанию`, "warning");
    }

    try {
      const augConfig = await getAugmentations(collection.workspacePath);
      setAugmentationParams(augConfig);
      addLog("Конфигурация аугментации загружена", "success");
    } catch (error) {
      addLog(`Ошибка загрузки конфигурации аугментации: ${error.message}`, "error");
    }
  };

  const clearLogs = () => {
    setConsoleLogs([]);
  };

  const formatDuration = (ms) => {
    if (ms == null || ms < 0) return "—";
    const totalSeconds = Math.round(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}ч ${minutes}м`;
    if (minutes > 0) return `${minutes}м ${seconds}с`;
    return `${seconds}s`;
  };

  const getEstimatedRemaining = (training) => {
    try {
      const { startedAt, currentEpoch, totalEpochs, progress } = training;
      if (!startedAt) return null;
      const started = new Date(startedAt);
      const elapsed = Date.now() - started.getTime();
      if (currentEpoch > 0 && totalEpochs > currentEpoch) {
        const avgPerEpoch = elapsed / currentEpoch;
        return avgPerEpoch * (totalEpochs - currentEpoch);
      }
      if (progress > 0) {
        const remaining = elapsed / (progress / 100) - elapsed;
        return remaining > 0 ? remaining : 0;
      }
      return null;
    } catch (e) {
      return null;
    }
  };

  const getKeyMetric = (training) => {
    const metrics = metricsData[training.taskId];
    if (!metrics || !metrics.latest) return null;
    const latest = metrics.latest;
    if (latest.mAP50 != null) {
      return { label: 'mAP50', value: latest.mAP50.toFixed(4) };
    }
    if (latest.precision != null) {
      return { label: 'Precision', value: latest.precision.toFixed(4) };
    }
    if (latest.recall != null) {
      return { label: 'Recall', value: latest.recall.toFixed(4) };
    }
    if (training.loss != null) {
      return { label: 'Loss', value: training.loss.toFixed(4) };
    }
    return null;
  };

  const prepareChartData = (history) => {
    if (!history || history.length === 0) return [];
    return history.map(row => ({
      epoch: row.epoch,
      mAP50: row.mAP50,
      mAP50_95: row['mAP50-95'],
      precision: row.precision,
      recall: row.recall,
      f1: row.precision && row.recall && (row.precision + row.recall) > 0 
          ? 2 * (row.precision * row.recall) / (row.precision + row.recall) 
          : null,
      train_box_loss: row['train/box_loss'],
      train_cls_loss: row['train/cls_loss'],
      val_box_loss: row['val/box_loss'],
      val_cls_loss: row['val/cls_loss']
    }));
  };

  const renderMetricsPanel = (training, metrics) => {
    const history = metrics.history || [];
    const chartData = prepareChartData(history);
    const latest = metrics.latest || {};
    const best = metrics.best || {};
    const historyOpen = metricsHistoryOpen[training.taskId] ?? true;

    return (
      <div className="metrics-panel">
        <div className="metrics-panel-accordion-header">
          <div>
            <strong>Метрики обучения</strong>
            <div className="metrics-panel-accordion-description">Графики и история доступны в раскрывающемся разделе</div>
          </div>
          <div className="metrics-panel-accordion-meta">
            {getKeyMetric(training) && (
              <span className="metrics-panel-meta-item">
                {getKeyMetric(training).label}: {getKeyMetric(training).value}
              </span>
            )}
            {getEstimatedRemaining(training) != null && (
              <span className="metrics-panel-meta-item">
                Осталось: {formatDuration(getEstimatedRemaining(training))}
              </span>
            )}
          </div>
        </div>

        <div className="metrics-panel-content">
          <div className="metrics-summary-row">
            <div className="metrics-chart-card">
            <div className="metrics-chart-header">Loss / Epoch</div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8eaed" />
                <XAxis dataKey="epoch" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} width={36} />
                <Tooltip />
                <Legend verticalAlign="top" height={36} />
                <Line type="monotone" dataKey="train_box_loss" stroke="#ff6b6b" dot={false} name="Train box loss" />
                <Line type="monotone" dataKey="val_box_loss" stroke="#1f78b4" dot={false} name="Val box loss" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="metrics-chart-card">
            <div className="metrics-chart-header">mAP / Epoch</div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8eaed" />
                <XAxis dataKey="epoch" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} width={36} />
                <Tooltip />
                <Legend verticalAlign="top" height={36} />
                <Line type="monotone" dataKey="mAP50" stroke="#2ecc71" dot={false} name="mAP50" />
                <Line type="monotone" dataKey="mAP50_95" stroke="#9b59b6" dot={false} name="mAP50-95" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="metrics-chart-card">
            <div className="metrics-chart-header">Precision & Recall / Epoch</div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8eaed" />
                <XAxis dataKey="epoch" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} width={36} />
                <Tooltip />
                <Legend verticalAlign="top" height={36} />
                <Line type="monotone" dataKey="precision" stroke="#f39c12" dot={false} name="Precision" />
                <Line type="monotone" dataKey="recall" stroke="#16a085" dot={false} name="Recall" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="metrics-table-wrapper">
          
          <div className="metrics-table-actions">
            
            {best.mAP50 && (
              <div className="metrics-best-card">
                <span>Лучший mAP50: <strong>{best.mAP50.toFixed(4)}</strong> эпоха {best.epoch}</span>
              </div>
            )}
            <button
              className="metrics-history-toggle-btn"
              onClick={() => toggleMetricsHistory(training.taskId)}
            >
              {historyOpen ? 'Свернуть историю' : 'Показать историю'}
            </button>

          </div>
          {historyOpen ? (
            <div className="table-scroll compact">
              <table className="metrics-table-full">
                <thead>
                  <tr>
                    <th>Эпоха</th>
                    <th>Train box</th>
                    <th>Train cls</th>
                    <th>Val box</th>
                    <th>Val cls</th>
                    <th>Precision</th>
                    <th>Recall</th>
                    <th>mAP50</th>
                    <th>mAP50-95</th>
                    <th>F1</th>
                    <th>LR</th>
                  </tr>
                </thead>
                <tbody>
                  {history.length === 0 ? (
                    <tr><td colSpan="11" style={{ textAlign: 'center' }}>Нет данных</td></tr>
                  ) : history.map((row, idx) => {
                    const f1 = row.precision && row.recall && (row.precision + row.recall) > 0
                      ? 2 * (row.precision * row.recall) / (row.precision + row.recall)
                      : null;
                    return (
                      <tr key={idx} className={row.epoch === latest.epoch ? 'current-epoch' : ''}>
                        <td>{row.epoch}</td>
                        <td>{row['train/box_loss']?.toFixed(4) ?? '—'}</td>
                        <td>{row['train/cls_loss']?.toFixed(4) ?? '—'}</td>
                        <td>{row['val/box_loss']?.toFixed(4) ?? '—'}</td>
                        <td>{row['val/cls_loss']?.toFixed(4) ?? '—'}</td>
                        <td>{row.precision?.toFixed(4) ?? '—'}</td>
                        <td>{row.recall?.toFixed(4) ?? '—'}</td>
                        <td>{row.mAP50?.toFixed(4) ?? '—'}</td>
                        <td>{row['mAP50-95']?.toFixed(4) ?? '—'}</td>
                        <td>{f1?.toFixed(4) ?? '—'}</td>
                        <td>{row.lr?.toExponential(2) ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div>
            </div>
          )}
          </div>
        </div>
      </div>
    );
  };

  const handleStopTraining = async (taskId, modelIdentifier) => {
    try {
      await stopTraining(taskId);
      stopMetricsPolling(taskId);

      addLog(`Обучение "${modelIdentifier}" остановлено пользователем`, "info");
      
      completedTasksRef.current.add(taskId);
      
      if (websocketsRef.current[taskId]) {
        websocketsRef.current[taskId].close();
        delete websocketsRef.current[taskId];
      }
      
      setActiveTrainings(prev => prev.filter(task => task.taskId !== taskId));
      
    } catch (error) {
      addLog(`Ошибка остановки обучения "${modelIdentifier}": ${error.message}`, "error");
    }
  };
  useEffect(() => {
    return () => {
      Object.values(metricsPollsRef.current).forEach(clearInterval);
    };
  }, []);

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
      await saveTrainingConfig(params, collection.workspacePath);
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

    const { modelName, ...paramsWithoutModelName } = params;

    const activeFolderNames = collection.folders
      ? collection.folders.filter(f => f.isEnabled).map(f => f.name)
      : [];

    if (activeFolderNames.length === 0 && !params.use_coco8) {
      addLog("Нет активных папок для обучения. Отметьте папки галочками.", "warning");
      alert("Выберите хотя бы одну папку для обучения в меню слева.");
      return;
    }

    const trainingData = {
      ...paramsWithoutModelName,
      augmentations: augmentationParams || {},
      dataset: {
        id: collection.id,
        name: collection.name,
        versionId: currentVersionId || "",
        versionName: currentVersion?.name || `Version ${currentVersionId || "unknown"}`,
        workspace_path: collection.workspacePath,
        active_folders: activeFolderNames,
        classes: [],
        use_coco8: params.use_coco8
      },
      modelName: params.modelName && typeof params.modelName === 'string' 
        ? params.modelName
        : "",
      timestamp: new Date().toISOString(),
    };

    try {
      setIsLoading(true);

      await saveTrainingConfig(trainingData, collection.workspacePath);

      const response = await startTraining(trainingData);
      const taskId = response.task_id;

      const modelIdentifier = params.modelName.trim() || params.model;
      const taskInfo = {
        taskId: taskId,
        modelIdentifier: modelIdentifier,
        datasetName: collection.name,
        versionName: currentVersion?.name || `Version ${currentVersionId || "unknown"}`,
        model: params.model,
        status: 'pending',
        progress: 0,
        currentEpoch: 0,
        totalEpochs: params.epochs,
        startedAt: new Date(),
        lastUpdate: new Date()
      };

      setActiveTrainings(prev => [...prev, taskInfo]);
      
      createWebSocket(taskId, taskInfo);
      startMetricsPolling(taskId, taskInfo);

      addLog(`Запущено обучение "${modelIdentifier}"`, "success");
      addLog(`Task ID: ${taskId}`, "info");

      alert(`Обучение успешно запущено\nTask ID: ${taskId}`);

    } catch (error) {
      addLog(`Ошибка запуска обучения: ${error.message}`, "error");
      alert(`Ошибка запуска обучения: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

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

          <div className="param-group checkbox-group" style={{ marginTop: '10px', background: 'rgba(52, 152, 219, 0.1)', padding: '8px', borderRadius: '4px' }}>
            <label style={{ color: '#3498db', fontWeight: 'bold' }}>COCO8:</label>
            <input
              type="checkbox"
              checked={params.use_coco8}
              onChange={(e) => handleChange("use_coco8", e.target.checked)}
            />
          </div>
          
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
        <h3>Активные процессы обучения ({activeTrainings.length})</h3>
        {activeTrainings.length === 0 ? (
          <div className="no-active-trainings">
            Нет активных процессов обучения
          </div>
        ) : (
          <div className="trainings-list">
            {activeTrainings.map((training) => (
              <div key={training.taskId} className={`training-item ${metricsPanelOpen[training.taskId] ? 'open' : ''}`}>
                <div className="training-header">
                  <div className="training-info">
                    <span className="training-name">{training.modelIdentifier}</span>
                    <span className="training-dataset">
                      на {training.datasetName}
                      {training.versionName && ` / ${training.versionName}`}
                    </span>
                  </div>
                  <div className="training-actions">
                    <button
                      className="metrics-toggle-btn"
                      onClick={() => toggleMetricsPanel(training.taskId)}
                    >
                      {metricsPanelOpen[training.taskId] ? 'Скрыть метрики' : 'Показать метрики'}
                    </button>
                    <button 
                      className="stop-training-btn"
                      onClick={() => handleStopTraining(training.taskId, training.modelIdentifier)}
                    >
                      Остановить
                    </button>
                  </div>
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
                       training.status === 'failed' ? 'Ошибка' : 
                       training.status === 'stopped' ? 'Остановлено' : training.status}
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
                  {getKeyMetric(training) && (
                    <div className="detail-item">
                      <strong>{getKeyMetric(training).label}</strong>  {getKeyMetric(training).value}
                    </div>
                  )}
                  {getEstimatedRemaining(training) != null && (
                    <div className="detail-item">
                      <strong>Осталось:</strong> {formatDuration(getEstimatedRemaining(training))}
                    </div>
                  )}
                  <div className="detail-item time-info">
                    <span>Запущено: {training.startedAt.toLocaleTimeString()}</span>
                  </div>
                </div>
                {metricsPanelOpen[training.taskId] && metricsData[training.taskId] && (
                  <div className="metrics-panel-container">
                    {renderMetricsPanel(training, metricsData[training.taskId])}
                  </div>
                )}
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