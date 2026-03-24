import React, { useState } from "react";

import Sidebar from "./Layout/Sidebar";
import Navbar from "./Layout/Navbar";
import FolderUploader from "./FolderUploader";
import DatasetView from "./Dataset/DatasetView";
import AnnotationView from "./Annotation/AnnotationView";
import AugmentationView from "./Augmentation/AugmentationView";
import TrainingView from "./Training/TrainingView";
import ExperimentsView from "./Experiments/ExperimentsView";

import useCollections from "../hooks/useCollections";

import "../styles/App.css";

function App() {
  const { collections, addCollection, getCollection, removeCollection, syncCollection } =
    useCollections();
  const [currentCollectionId, setCurrentCollectionId] = useState(null);
  const [currentTab, setCurrentTab] = useState("dataset");
  const [showUploader, setShowUploader] = useState(false);

  const versions = [];
  const currentVersionId = null;

  const currentCollection = currentCollectionId
    ? getCollection(currentCollectionId)
    : null;

  // functions for sidebar
  function handleCollectionClick(collectionId) {
    setCurrentCollectionId(collectionId);
  }

  function handleAddCollection() {
    setShowUploader(true);
  }

  function handleDeleteCollection() {}

  // functions for file uploader
  async function handleFolderUpload(files, collectionName, directoryHandle) {
    const collectionId = addCollection(files, collectionName, directoryHandle);
    setCurrentCollectionId(collectionId);
    setShowUploader(false);
  }

  function handleCancelUpload() {
    setShowUploader(false);
  }

  // functions for version control - to be done
  function handleCreateVersion() {}

  function handleSelectVersion() {}

  function handleUpdateSplit() {}

  // sync function
  async function handleSyncCollection(collectionId) {
    try {
      await syncCollection(collectionId);
    } catch (err) {
      console.error("Sync failed:", err);
      // optionally show error message to user
    }
  }

  // rendering main content
  function renderTabContent() {
    if (!currentCollection) {
      return (
        <div className="empty-state">
          <h2>Добро пожаловать в Image Labeling Platform</h2>
          <p>Выберите проект слева или создайте новый</p>
          <button
            className="add-collection-button"
            onClick={handleAddCollection}
          >
            + Создать проект
          </button>
        </div>
      );
    }

    switch (currentTab) {
      case "dataset":
        return (
          <DatasetView
            key={currentCollectionId}
            collection={currentCollection}
            versions={versions}
            currentVersionId={currentVersionId}
            onCreateVersion={handleCreateVersion}
            onSelectVersion={handleSelectVersion}
            onUpdateSplit={handleUpdateSplit}
            onSync={handleSyncCollection}
          />
        );
      case "annotation": // pass same props to all components
        return (
          <AnnotationView
            key={currentCollectionId}
            collection={currentCollection}
            versions={versions}
            currentVersionId={currentVersionId}
          />
        );
      case "augmentation":
        return (
          <AugmentationView
            key={currentCollectionId}
            collection={currentCollection}
            versions={versions}
            currentVersionId={currentVersionId}
          />
        );
      case "training":
        return (
          <TrainingView
            key={currentCollectionId}
            collection={currentCollection}
            currentVersionId={currentVersionId}
          />
        );
      case "experiments": // idk what to pass to this one - will find out later
        return <ExperimentsView />;
      default:
        return null;
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
          onAddCollection={handleAddCollection}
          onDeleteCollection={handleDeleteCollection}
        />

        <div className="content-area">
          {showUploader ? (
            <div className="uploader-container">
              <h2>Новая коллекция</h2>
              <FolderUploader
                onFolderUpload={handleFolderUpload}
                onCancel={handleCancelUpload}
              />
            </div>
          ) : (
            renderTabContent()
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
