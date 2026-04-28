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
import { pickWorkspacePath, scanFolderOnBackend } from "../services/api";

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

  async function handleAddFolders() {
    if (!currentCollectionId || !currentCollection) return;
    
    try {
      const absolutePath = await pickWorkspacePath(); 
      if (!absolutePath) return;

      const folderName = absolutePath.split(/[\\/]/).pop();
      
      let isDuplicate = false;
      if (currentCollection.folders) {
        for (const folder of currentCollection.folders) {
          if (folder.absolutePath === absolutePath) {
            isDuplicate = true; break;
          }
        }
      }

      if (isDuplicate) {
        alert("Эта папка уже добавлена в проект!");
        return;
      }

      const rootId = `src_${Date.now()}`;
      const uniqueRootPath = `${rootId}_${folderName}`;

      const scanResult = await scanFolderOnBackend(absolutePath, uniqueRootPath);

      const rootNode = {
        name: folderName,
        path: uniqueRootPath, 
        absolutePath: absolutePath, 
        isEnabled: true,
        children: scanResult.tree
      };

      const updatedFolders = [...(currentCollection.folders || []), rootNode];

      updateCollection(currentCollectionId, { folders: updatedFolders });

      await syncCollection(currentCollectionId, updatedFolders);

    } catch (error) {
      console.log("Ошибка добавления папки:", error);
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
          onCollectionClick={handleCollectionClick}
          onAddCollection={() => setShowManagerModal(true)}
          onDeleteCollection={handleDeleteCollection}
          onAddFolders={handleAddFolders}
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