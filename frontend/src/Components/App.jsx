import React, { useEffect, useState } from "react";

import Sidebar from "./Layout/Sidebar";
import Navbar from "./Layout/Navbar";
import ProjectManagerModal from "./Layout/ProjectManagerModal";
import DatasetView from "./Dataset/DatasetView";
import AnnotationView from "./Annotation/AnnotationView";
import AugmentationView from "./Augmentation/AugmentationView";
import TrainingView from "./Training/TrainingView";
import ExperimentsView from "./Experiments/ExperimentsView";

import useCollections from "../hooks/useCollections";
import { pickWorkspacePath, scanFolderOnBackend, scanVideoFolderOnBackend, scanDatasetFolderOnBackend, importDatasetFolder, listDatasetVersions, saveDatasetVersion, switchDatasetVersion, deleteDatasetVersion, listAugVersions, saveAugVersion, switchAugVersion, deleteAugVersion } from "../services/api";

import "../styles/App.css";

function App() {
  const {
    collections,
    isLoadingCollections,
    addCollection,
    getCollection,
    removeCollection,
    updateCollection,
    syncCollection,
    toggleFolderState,
    loadProject
  } = useCollections();
  
  const [currentCollectionId, setCurrentCollectionId] = useState(null);
  const [currentTab, setCurrentTab] = useState("dataset");
  const [showManagerModal, setShowManagerModal] = useState(false);

  const [versions, setVersions] = useState([]);
  const [currentVersionId, setCurrentVersionId] = useState(null);
  const [versionsLoading, setVersionsLoading] = useState(false);

  const [augVersions, setAugVersions] = useState([]);
  const [currentAugVersionId, setCurrentAugVersionId] = useState(null);
  const [augVersionsLoading, setAugVersionsLoading] = useState(false);

  useEffect(() => {
    if (!collections.length) {
      setCurrentCollectionId(null);
      return;
    }
    const hasCurrentCollection = collections.some(c => c.id === currentCollectionId);
    if (!hasCurrentCollection) setCurrentCollectionId(collections[0].id);
  }, [collections, currentCollectionId]);

  const currentCollection = currentCollectionId ? getCollection(currentCollectionId) : null;

  useEffect(() => {
    const workspacePath = currentCollection?.workspacePath || "";
    setVersions([]);
    setCurrentVersionId(null);
    setAugVersions([]);
    setCurrentAugVersionId(null);
    if (!currentCollection) return;

    setVersionsLoading(true);
    listDatasetVersions(workspacePath)
      .then(data => setVersions(data.versions || []))
      .catch(() => setVersions([]))
      .finally(() => setVersionsLoading(false));

    setAugVersionsLoading(true);
    listAugVersions(workspacePath)
      .then(data => setAugVersions(data.versions || []))
      .catch(() => setAugVersions([]))
      .finally(() => setAugVersionsLoading(false));
  }, [currentCollection?.id]);

  const handleProjectCreated = (name, path, id) => {
    const newId = addCollection(name, path, id);
    setCurrentCollectionId(newId || id);
    setShowManagerModal(false);
  };

  const handleProjectLoaded = async (projectData) => {
    try {
      const id = await loadProject(projectData);
      
      setCurrentCollectionId(id);
      setShowManagerModal(false);
    } catch (error) {
      alert("Ошибка при формировании проекта: " + error.message);
    }
  };
  
  async function handleCollectionClick(collectionId) {
    setCurrentCollectionId(collectionId);
  }

  function _isDuplicateFolder(absolutePath) {
    return (currentCollection?.folders || []).some(f => f.absolutePath === absolutePath);
  }

  async function handleAddPhotoFolder() {
    if (!currentCollectionId || !currentCollection) return;
    try {
      const absolutePath = await pickWorkspacePath();
      if (!absolutePath) return;
      if (_isDuplicateFolder(absolutePath)) { alert("Эта папка уже добавлена в проект!"); return; }

      const folderName = absolutePath.split(/[\\/]/).pop();
      const uniqueRootPath = `src_${Date.now()}_${folderName}`;
      const scanResult = await scanFolderOnBackend(absolutePath, uniqueRootPath);

      const rootNode = { name: folderName, path: uniqueRootPath, absolutePath, isEnabled: true, folderType: "photos", children: scanResult.tree };
      const updatedFolders = [...(currentCollection.folders || []), rootNode];
      updateCollection(currentCollectionId, { folders: updatedFolders });
      await syncCollection(currentCollectionId, updatedFolders);
    } catch (error) {
      alert("Ошибка добавления папки с фото: " + error.message);
    }
  }

  async function handleAddVideoFolder() {
    if (!currentCollectionId || !currentCollection) return;
    try {
      const absolutePath = await pickWorkspacePath();
      if (!absolutePath) return;
      if (_isDuplicateFolder(absolutePath)) { alert("Эта папка уже добавлена в проект!"); return; }

      const frameInterval = 1;

      const folderName = absolutePath.split(/[\\/]/).pop();
      const uniqueRootPath = `src_${Date.now()}_${folderName}`;
      const workspacePath = currentCollection.workspacePath || "";

      const scanResult = await scanVideoFolderOnBackend(absolutePath, uniqueRootPath, workspacePath, frameInterval);

      const rootNode = {
        name: folderName, path: uniqueRootPath, absolutePath, isEnabled: true,
        folderType: "videos", framesDir: scanResult.frames_dir, frameInterval,
        children: scanResult.tree,
      };
      const updatedFolders = [...(currentCollection.folders || []), rootNode];
      updateCollection(currentCollectionId, { folders: updatedFolders });
      await syncCollection(currentCollectionId, updatedFolders);
    } catch (error) {
      alert("Ошибка обработки видео: " + error.message);
    }
  }

  async function handleAddDatasetFolder() {
    if (!currentCollectionId || !currentCollection) return;
    try {
      const absolutePath = await pickWorkspacePath();
      if (!absolutePath) return;

      const folderName = absolutePath.split(/[\\/]/).pop();
      const workspacePath = currentCollection.workspacePath || "";

      // Копируем папку в {workspace}/datasets/{name}/ и получаем плоский список файлов
      const importResult = await importDatasetFolder(absolutePath, folderName, workspacePath);

      // Узел коллекции — указывает на импортированную папку, children пустой (не показываем train/val/test)
      const uniqueRootPath = `imported_${Date.now()}_${folderName}`;
      const rootNode = {
        name: importResult.dataset_name,
        path: uniqueRootPath,
        absolutePath: importResult.dataset_path,
        isEnabled: true,
        folderType: "imported_dataset",
        children: [],
      };

      const updatedFolders = [...(currentCollection.folders || []), rootNode];
      const updates = { folders: updatedFolders };
      if (importResult.classes && importResult.classes.length > 0) {
        const existing = currentCollection.projectClasses || [];
        const merged = [...new Set([...existing, ...importResult.classes])];
        updates.projectClasses = merged;
      }
      updateCollection(currentCollectionId, updates);
      await syncCollection(currentCollectionId, updatedFolders);
    } catch (error) {
      alert("Ошибка импорта датасета: " + error.message);
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

  async function handleCreateVersion(name) {
    if (!currentCollection) return;
    setVersionsLoading(true);
    try {
      const data = await saveDatasetVersion(currentCollection.workspacePath || "", name);
      const newVersion = data.version;
      setVersions(prev => [newVersion, ...prev]);
      setCurrentVersionId(newVersion.id);
    } catch (error) {
      alert("Ошибка сохранения версии: " + error.message);
    } finally {
      setVersionsLoading(false);
    }
  }

  async function handleSelectVersion(versionId) {
    if (!currentCollection || versionId === currentVersionId) return;
    setVersionsLoading(true);
    try {
      await switchDatasetVersion(currentCollection.workspacePath || "", versionId);
      setCurrentVersionId(versionId);
      await syncCollection(currentCollectionId);
    } catch (error) {
      alert("Ошибка переключения версии: " + error.message);
    } finally {
      setVersionsLoading(false);
    }
  }

  async function handleCreateAugVersion(name, params) {
    if (!currentCollection) return;
    setAugVersionsLoading(true);
    try {
      const data = await saveAugVersion(currentCollection.workspacePath || "", name, params);
      const newVersion = data.version;
      setAugVersions(prev => [newVersion, ...prev]);
      setCurrentAugVersionId(newVersion.id);
    } catch (error) {
      alert("Ошибка сохранения версии аугментации: " + error.message);
    } finally {
      setAugVersionsLoading(false);
    }
  }

  async function handleSelectAugVersion(versionId) {
    if (!currentCollection || versionId === currentAugVersionId) return;
    setAugVersionsLoading(true);
    try {
      await switchAugVersion(currentCollection.workspacePath || "", versionId);
      setCurrentAugVersionId(versionId);
    } catch (error) {
      alert("Ошибка переключения версии аугментации: " + error.message);
    } finally {
      setAugVersionsLoading(false);
    }
  }

  async function handleDeleteAugVersion(versionId) {
    if (!currentCollection) return;
    if (!window.confirm("Удалить эту версию аугментации?")) return;
    try {
      await deleteAugVersion(currentCollection.workspacePath || "", versionId);
      setAugVersions(prev => prev.filter(v => v.id !== versionId));
      if (currentAugVersionId === versionId) setCurrentAugVersionId(null);
    } catch (error) {
      alert("Ошибка удаления версии аугментации: " + error.message);
    }
  }

  async function handleDeleteVersion(versionId) {
    if (!currentCollection) return;
    if (!window.confirm("Удалить эту версию датасета?")) return;
    try {
      await deleteDatasetVersion(currentCollection.workspacePath || "", versionId);
      setVersions(prev => prev.filter(v => v.id !== versionId));
      if (currentVersionId === versionId) setCurrentVersionId(null);
    } catch (error) {
      alert("Ошибка удаления версии: " + error.message);
    }
  }

  function renderTabContent() {
    if (isLoadingCollections) return <div className="empty-state"><h2>Загрузка...</h2></div>;
    
    if (!currentCollection) return (
      <div className="welcome-container">
        <div className="empty-state welcome-card">
          <h2>Добро пожаловать</h2>
          <div className="welcome-buttons">
            <button className="add-collection-button" onClick={() => setShowManagerModal(true)}>
              Добавить проект
            </button>
          </div>
        </div>
      </div>
    );

    switch (currentTab) {
      case "dataset": return <DatasetView key={currentCollectionId} collection={currentCollection} versions={versions} currentVersionId={currentVersionId} versionsLoading={versionsLoading} onCreateVersion={handleCreateVersion} onSelectVersion={handleSelectVersion} onDeleteVersion={handleDeleteVersion} onUpdateSplit={()=>{}} onSync={syncCollection} />;
      case "annotation": return <AnnotationView key={currentCollectionId} collection={currentCollection} versions={versions} currentVersionId={currentVersionId} onCollectionUpdate={updateCollection} />;
      case "augmentation": return <AugmentationView key={currentCollectionId} collection={currentCollection} versions={versions} currentVersionId={currentVersionId} augVersions={augVersions} currentAugVersionId={currentAugVersionId} augVersionsLoading={augVersionsLoading} onCreateAugVersion={handleCreateAugVersion} onSelectAugVersion={handleSelectAugVersion} onDeleteAugVersion={handleDeleteAugVersion} />;
      case "training": return <TrainingView key={currentCollectionId} collection={currentCollection} currentVersionId={currentVersionId} />;
      case "experiments": return <ExperimentsView key={currentCollectionId} collection={currentCollection} />;
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
          onCollectionClick={handleCollectionClick}
          onAddCollection={() => setShowManagerModal(true)}
          onDeleteCollection={handleDeleteCollection}
          onAddPhotoFolder={handleAddPhotoFolder}
          onAddVideoFolder={handleAddVideoFolder}
          onAddDatasetFolder={handleAddDatasetFolder}
          onToggleFolder={handleToggleFolder}
        />

        <div className="content-area">
          {renderTabContent()}
        </div>
      </div>

      {showManagerModal && (
        <ProjectManagerModal 
          onClose={() => setShowManagerModal(false)}
          onProjectCreated={handleProjectCreated}
          onProjectLoaded={handleProjectLoaded}
        />
      )}
    </div>
  );
}

export default App;
