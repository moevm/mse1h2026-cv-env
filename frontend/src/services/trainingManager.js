import { getTrainingMetrics } from "./api";

class TrainingManager {
  constructor() {
    this.activeTrainings = new Map(); 
    this.metricsData = new Map();    
    this.websockets = new Map();    
    this.metricsPolls = new Map();   
    this.listeners = new Set();      
    this.logs = [];                  
    this.initFromBackend();
  }

  // --- Подписка React-компонентов ---
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    this.listeners.forEach(listener => listener());
  }

  getActiveTrainings() {
    return Array.from(this.activeTrainings.values());
  }

  getMetrics(taskId) {
    return this.metricsData.get(taskId);
  }

  addTraining(taskInfo) {
    if (this.activeTrainings.has(taskInfo.taskId)) return;
    this.activeTrainings.set(taskInfo.taskId, taskInfo);
    this._connectWebSocket(taskInfo.taskId, taskInfo);
    this._startMetricsPolling(taskInfo.taskId);
    this.notify();
  }

  removeTraining(taskId) {
    this.activeTrainings.delete(taskId);
    this.metricsData.delete(taskId);
    this._cleanup(taskId);
    this.notify();
  }

  addLog(message, type = "info") {
    const log = {
      id: Date.now() + Math.random(),
      timestamp: new Date().toLocaleTimeString(),
      message,
      type,
    };
    this.logs.push(log);
    if (this.logs.length > 500) this.logs.shift();
    this.notify();
    return log;
  }

  getLogs() {
    return [...this.logs];
  }

  clearLogs() {
    this.logs = [];
    this.notify();
  }

  // --- Восстановление активных задач с бэкенда ---
  async initFromBackend() {
    try {
      const response = await fetch("/api/training/active");
      if (!response.ok) return;
      const data = await response.json();
      for (const task of data.active_tasks) {
        if (!this.activeTrainings.has(task.task_id)) {
          const taskInfo = {
            taskId: task.task_id,
            modelIdentifier: task.model_identifier,
            datasetName: task.dataset_name,
            versionName: task.version_name,
            model: task.model,
            status: task.status,
            progress: task.progress,
            currentEpoch: task.current_epoch,
            totalEpochs: task.total_epochs,
            startedAt: new Date(task.started_at),
            loss: task.loss,
            lastUpdate: new Date(),
          };
          this.activeTrainings.set(task.task_id, taskInfo);
          this._connectWebSocket(task.task_id, taskInfo);
          this._startMetricsPolling(task.task_id);
          this._fetchMetrics(task.task_id);
        }
      }
      this.notify();
    } catch (err) {
      console.warn("Failed to restore active trainings:", err);
    }
  }

  async _fetchMetrics(taskId) {
    try {
      const metrics = await getTrainingMetrics(taskId);
      this.metricsData.set(taskId, metrics);
      this.notify();
    } catch (e) {
    }
  }

  _connectWebSocket(taskId, taskInfo) {
    if (this.websockets.has(taskId)) return;
    const ws = new WebSocket(`ws://localhost:8000/api/training/ws/${taskId}`);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const existing = this.activeTrainings.get(taskId);
        if (existing) {
          const updated = { ...existing, ...data, lastUpdate: new Date() };
          this.activeTrainings.set(taskId, updated);
          this.notify();
        }
        if (data.status === 'completed' || data.status === 'failed' || data.status === 'stopped') {
          const msg = data.status === 'completed' ? 'завершено' : (data.status === 'failed' ? 'провалилось' : 'остановлено');
          this.addLog(`Обучение "${taskInfo.modelIdentifier}" ${msg}`, data.status === 'completed' ? 'success' : 'warning');
          this.activeTrainings.delete(taskId);
          this.metricsData.delete(taskId);
          this._cleanup(taskId);
          this.notify();
        }
      } catch (e) {
        console.error("WS message error:", e);
      }
    };

    ws.onclose = () => {
      this.websockets.delete(taskId);
    };

    this.websockets.set(taskId, ws);
  }

  _startMetricsPolling(taskId) {
    if (this.metricsPolls.has(taskId)) return;
    const interval = setInterval(async () => {
      try {
        const metrics = await getTrainingMetrics(taskId);
        this.metricsData.set(taskId, metrics);
        this.notify();
      } catch (error) {
        if (error.message.includes("404")) {
          this._cleanup(taskId);
        }
      }
    }, 2000);
    this.metricsPolls.set(taskId, interval);
  }

  _cleanup(taskId) {
    if (this.websockets.has(taskId)) {
      const ws = this.websockets.get(taskId);
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
      this.websockets.delete(taskId);
    }
    if (this.metricsPolls.has(taskId)) {
      clearInterval(this.metricsPolls.get(taskId));
      this.metricsPolls.delete(taskId);
    }
  }
}

export const trainingManager = new TrainingManager();
