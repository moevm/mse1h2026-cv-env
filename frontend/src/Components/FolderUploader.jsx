import React, { useState } from "react";
import { getAllFilesFromDirectory } from "../utils/fileSystem"; // adjust path as needed

function FolderUploader({ onFolderUpload, onCancel }) {
  const [collectionName, setCollectionName] = useState("");
  const [directoryHandle, setDirectoryHandle] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState(null);
  const [folderName, setFolderName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleFolderSelect() {
    try {
      setLoading(true);
      const handle = await window.showDirectoryPicker();
      const files = await getAllFilesFromDirectory(handle);
      const folder = handle.name;

      setDirectoryHandle(handle);
      setSelectedFiles(files);
      setFolderName(folder);
      if (!collectionName) {
        setCollectionName(folder);
      }
    } catch (err) {
      // user cancelled or error
      console.error("Folder selection failed:", err);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (selectedFiles && collectionName.trim()) {
      onFolderUpload(selectedFiles, collectionName.trim(), directoryHandle);
    }
  }

  return (
    <div className="folder-uploader">
      <form onSubmit={handleSubmit}>
        <label htmlFor="collectionName">Название коллекции:</label>
        <input
          type="text"
          id="collectionName"
          value={collectionName}
          onChange={(e) => setCollectionName(e.target.value)}
          placeholder="Введите название коллекции"
          required
        />

        <div className="form-group">
          <button
            type="button"
            onClick={handleFolderSelect}
            className="upload-button"
            disabled={loading}
          >
            {loading
              ? "Загрузка..."
              : directoryHandle
              ? "Изменить папку"
              : "Выбрать папку"}
          </button>
        </div>

        {directoryHandle && (
          <div className="selected-files-info">
            <p>
              Папка: <strong>{folderName}</strong>
            </p>
            <p>Всего файлов: {selectedFiles.length}</p>
            <p className="file-list-preview">
              {selectedFiles
                .slice(0, 3)
                .map((f) => f.name)
                .join(", ")}
              {selectedFiles.length > 3 && "..."}
            </p>
          </div>
        )}

        <div className="form-actions">
          <button
            type="submit"
            className="submit-button"
            disabled={!directoryHandle || !collectionName.trim()}
          >
            Создать коллекцию
          </button>
          <button type="button" className="cancel-button" onClick={onCancel}>
            Отмена
          </button>
        </div>
      </form>
    </div>
  );
}

export default FolderUploader;
