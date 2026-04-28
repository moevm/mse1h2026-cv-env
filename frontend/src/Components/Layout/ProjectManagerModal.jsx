import React, { useState } from "react";
import { pickWorkspacePath, initProjectOnBackend, loadProjectFromBackend } from "../../services/api";

function ProjectManagerModal({ onClose, onProjectCreated, onProjectLoaded }) {
  const [step, setStep] = useState("select");
  const [newProjectName, setNewProjectName] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleCreateProject = async () => {
    try {
      setIsLoading(true);
      const absolutePath = await pickWorkspacePath();
      if (!absolutePath) return;

      const folderName = absolutePath.split(/[\\/]/).pop();
      const finalProjectName = newProjectName.trim() || folderName;
      const projectId = Date.now().toString();

      const payload = {
        id: projectId,
        name: finalProjectName,
        path: absolutePath,
        folders: [],
        classes: [],
      };

      await initProjectOnBackend(payload);
      onProjectCreated(finalProjectName, absolutePath, projectId);
    } catch (err) {
      alert("Ошибка создания: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenProject = async () => {
    try {
      setIsLoading(true);
      const absolutePath = await pickWorkspacePath();
      if (!absolutePath) return;

      const projectData = await loadProjectFromBackend(absolutePath);
      onProjectLoaded(projectData);
    } catch (err) {
      alert("Ошибка при открытии проекта: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content new-project-modal">
        
        {/* Заголовок с синей полоской и крестиком */}
        <div className="modal-header">
          <h3>{step === "select" ? "Управление проектами" : "Создание нового проекта"}</h3>
          <button className="popup-close" onClick={onClose} disabled={isLoading}>×</button>
        </div>

        {/* Экран выбора (2 большие кнопки) */}
        {step === "select" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <button className="modal-menu-btn" onClick={() => setStep("new")} disabled={isLoading}>
              Создать новый проект
            </button>
            <button className="modal-menu-btn" onClick={handleOpenProject} disabled={isLoading}>
              {isLoading ? "Загрузка..." : "Открыть существующий проект"}
            </button>
          </div>
        )}

        {/* Экран создания нового */}
        {step === "new" && (
          <>
            <p className="hint">Рабочая папка проекта будет использоваться для сохранения YAML файлов и конфигураций.</p>
            <div className="form-group">
              <label>Имя проекта (необязательно):</label>
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Если оставить пустым, возьмется имя папки"
                autoFocus
              />
            </div>
            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => setStep("select")} disabled={isLoading}>
                Отмена
              </button>
              <button className="primary-btn" onClick={handleCreateProject} disabled={isLoading}>
                {isLoading ? "Создание..." : "Выбрать рабочую папку"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default ProjectManagerModal;