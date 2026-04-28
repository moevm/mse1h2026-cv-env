import React, { useEffect, useState } from "react";

import Sidebar from "./Layout/Sidebar";
import Navbar from "./Layout/Navbar";
import DatasetView from "./Dataset/DatasetView";
import AnnotationView from "./Annotation/AnnotationView";
import AugmentationView from "./Augmentation/AugmentationView";
import TrainingView from "./Training/TrainingView";
import ExperimentsView from "./Experiments/ExperimentsView";

import useCollections from "../hooks/useCollections";
import { buildFolderTree, getAllFilesFromDirectory } from "../utils/fileSystem";
import { pickWorkspacePath, initProjectOnBackend } from "../services/api";

import "../styles/App.css";

function buildImagesWithAnnotations(files) {
  const imageFiles = files.filter((file) => file.type.startsWith("image/"));
  return imageFiles.map(file => ({
    file,
    url: null,
    name: file.name,
    type: file.type,
    size: file.size,
    relativePath: file.webkitRelativePath || file.relativePath || file.name,
    split: null,
    annotationFile: null,
    annotationText: null,
  }));
}

function App() {
  const {
    collections,
    isLoadingCollections,
    addCollection,
    getCollection,
    removeCollection,
    updateCollection,
    syncCollection,
    toggleFolderState
  } = useCollections();
  
  const [currentCollectionId, setCurrentCollectionId] = useState(null);
  const [currentTab, setCurrentTab] = useState("dataset");
  
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  const versions = [];
  const currentVersionId = null;

  useEffect(() => {
    if (!collections.length) {
      setCurrentCollectionId(null);
      return;
    }
    const hasCurrentCollection = collections.some(c => c.id === currentCollectionId);
    if (!hasCurrentCollection) setCurrentCollectionId(collections[0].id);
  }, [collections, currentCollectionId]);

  const currentCollection = currentCollectionId ? getCollection(currentCollectionId) : null;

  function handleAddCollectionClick() {
    setNewProjectName("");
    setShowNewProjectModal(true);
  }

  async function handleCreateProject() {
    try {
      const absolutePath = await pickWorkspacePath();

      if (!absolutePath || typeof absolutePath !== 'string' || absolutePath.trim() === '') {
        return;
      }
    
      const folderName = absolutePath.split(/[\\/]/).pop();
      const finalProjectName = newProjectName.trim() || folderName;
      const projectId = Date.now().toString();
    
      const payload = {
        id: projectId,
        name: finalProjectName,
        path: absolutePath,
        folders: []
      };

      await initProjectOnBackend(payload);
    
      const id = addCollection(finalProjectName, absolutePath, projectId);
      
      setCurrentCollectionId(id);
      setShowNewProjectModal(false);
      setNewProjectName("");
    } catch (err) {
      alert("Ошибка: " + err.message);
    }
  }
  
  async function handleCollectionClick(collectionId) {
    const collection = getCollection(collectionId);
    
    if (collection.folders.length > 0) {
      for (const folder of collection.folders) {
        await requestFolderAccess(folder);
      }
    }
    
    setCurrentCollectionId(collectionId);
  }

  async function handleAddFolders() {
    if (!currentCollectionId || !currentCollection) return;
    
    try {
      const directoryHandle = await window.showDirectoryPicker({ mode: "read" });
      
      let isDuplicate = false;
      if (currentCollection.folders) {
        for (const folder of currentCollection.folders) {
          if (await folder.handle.isSameEntry(directoryHandle)) {
            isDuplicate = true;
            break;
          }
        }
      }

      if (isDuplicate) {
        alert(`Эта папка ("${directoryHandle.name}") уже добавлена в проект!`);
        return;
      }
      
      const rootId = `src_${Date.now()}`;
      const uniqueRootPath = `${rootId}_${directoryHandle.name}`;

      const [newFiles, childrenTree] = await Promise.all([
        getAllFilesFromDirectory(directoryHandle, uniqueRootPath),
        buildFolderTree(directoryHandle, uniqueRootPath)
      ]);

      const rootNode = {
        name: directoryHandle.name,
        path: uniqueRootPath, 
        handle: directoryHandle,
        isEnabled: true,
        children: childrenTree
      };

      const newImages = buildImagesWithAnnotations(newFiles);

      updateCollection(currentCollectionId, {
        folders: [...(currentCollection.folders || []), rootNode],
        images: [...(currentCollection.images || []), ...newImages],
        imageCount: (currentCollection.imageCount || 0) + newImages.length
      });

    } catch (error) {
      console.log("Выбор дополнительной папки отменен:", error);
    }
  }

  function handleToggleFolder(path, isEnabled) {
    if (toggleFolderState) {
      toggleFolderState(currentCollectionId, path, isEnabled);
    }
  }

  async function handleDeleteCollection(collectionId) {
    const collection = getCollection(collectionId);
    if (!collection) return;
    if (window.confirm(`Удалить проект "${collection.name}"?`)) {
      await removeCollection(collectionId);
    }
  }

  function renderTabContent() {
    if (isLoadingCollections) return <div className="empty-state"><h2>Загрузка...</h2></div>;
    if (!currentCollection) return (
      <div className="empty-state">
        <h2>Добро пожаловать</h2>
        <button className="add-collection-button" onClick={handleAddCollectionClick}>
          + Создать проект
        </button>
      </div>
    );

    switch (currentTab) {
      case "dataset": return <DatasetView key={currentCollectionId} collection={currentCollection} versions={versions} currentVersionId={currentVersionId} onCreateVersion={()=>{}} onSelectVersion={()=>{}} onUpdateSplit={()=>{}} onSync={syncCollection} />;
      case "annotation": return <AnnotationView key={currentCollectionId} collection={currentCollection} versions={versions} currentVersionId={currentVersionId} onCollectionUpdate={updateCollection} />;
      case "augmentation": return <AugmentationView key={currentCollectionId} collection={currentCollection} versions={versions} currentVersionId={currentVersionId} />;
      case "training": return <TrainingView key={currentCollectionId} collection={currentCollection} currentVersionId={currentVersionId} />;
      case "experiments": return <ExperimentsView />;
      default: return null;
    }
  }

  return (
    <div className="app">
      <Navbar currentTabId={currentTab} onTabClick={setCurrentTab} />

      <div className="main-container">
        <Sidebar
          collections={collections}
          currentCollectionId={currentCollectionId}
          onCollectionClick={setCurrentCollectionId}
          onAddCollection={handleAddCollectionClick}
          onDeleteCollection={handleDeleteCollection}
          onAddFolders={handleAddFolders}
          onToggleFolder={handleToggleFolder}
        />

        <div className="content-area">
          {renderTabContent()}
        </div>
      </div>

      {showNewProjectModal && (
        <div className="modal-overlay">
          <div className="modal-content new-project-modal">
            <h3>Создание нового проекта</h3>
            <p className="hint">Рабочая папка проекта будет использоваться для сохранения YAML файлов и конфигураций.</p>
            <div className="form-group">
              <label>Имя проекта (необязательно):</label>
              <input 
                type="text" 
                value={newProjectName} 
                onChange={e => setNewProjectName(e.target.value)} 
                placeholder="Если оставить пустым, возьмется имя папки"
                autoFocus
              />
            </div>
            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => setShowNewProjectModal(false)}>Отмена</button>
              <button className="primary-btn" onClick={handleCreateProject}>Выбрать рабочую папку</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;