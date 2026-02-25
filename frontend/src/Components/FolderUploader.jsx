import React, { useRef, useState } from "react";

function FolderUploader({ onFolderUpload, onCancel }) {
  const [collectionName, setCollectionName] = useState("");
  const [selectedFiles, setSelectedFiles] = useState(null);
  const fileInputRef = useRef(null);

  function handleFolderSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
      setSelectedFiles(files);
      if (!collectionName && files[0].webkitRelativePath) {
        const folderName = files[0].webkitRelativePath.split("/")[0];
        setCollectionName(folderName);
      }
    }
  }

  function handleButtonClick() {
    fileInputRef.current.click();
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (selectedFiles && collectionName.trim()) {
      onFolderUpload(selectedFiles, collectionName.trim());
    }
  }

  return (
    <div className="folder-uploader">
      <form onSubmit={handleSubmit}>
        <label htmlFor="collectionName">Название: </label>
        <input
          type="text"
          id="collectionName"
          value={collectionName}
          onChange={(e) => setCollectionName(e.target.value)}
          placeholder="Введите название коллекции"
          required
        />

        <div className="form-group">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFolderSelect}
            webkitdirectory=""
            directory=""
            multiple
            className="folder-input"
          />
          <button
            type="button"
            onClick={handleButtonClick}
            className="upload-button"
          >
            {selectedFiles ? "Изменить папку" : "Выбрать папку"}
          </button>
        </div>

        {selectedFiles && (
          <div className="selected-files-info">
            <p>Выбрано файлов: {selectedFiles.length}</p>
            <p className="file-list-preview">
              {Array.from(selectedFiles)
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
            disabled={!selectedFiles || !collectionName.trim()}
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
