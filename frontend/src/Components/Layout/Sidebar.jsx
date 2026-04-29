import React from "react";
import "../../styles/Layout.css";

const FolderTree = ({ nodes, onToggle }) => {
  if (!nodes || nodes.length === 0) return null;

  const checkAllEnabled = (node) => {
    if (!node.isEnabled) return false;
    if (!node.children || node.children.length === 0) return true;
    return node.children.every(child => checkAllEnabled(child));
  };

  return (
    <ul className="folder-tree-list">
      {nodes.map((node) => {
        const isAllEnabled = checkAllEnabled(node);
        const isIndeterminate = node.isEnabled && !isAllEnabled;
        const isChecked = isAllEnabled;

        return (
          <li key={node.path} className="folder-tree-item">
            <div className="folder-tree-row">
              <input
                type="checkbox"
                ref={el => {
                  if (el) {
                    el.checked = isChecked;
                    el.indeterminate = isIndeterminate;
                  }
                }}
                onChange={() => {
                  if (isIndeterminate || !isChecked) {
                    onToggle(node.path, true);
                  } else {
                    onToggle(node.path, false);
                  }
                }}
              />
              <span className="folder-icon">{node.isEnabled ? "📂" : "📁"}</span>
              <span className={`folder-name ${!node.isEnabled ? "disabled" : ""}`}>
                {node.name}
              </span>
            </div>
            {node.children && node.children.length > 0 && (
              <FolderTree nodes={node.children} onToggle={onToggle} />
            )}
          </li>
        );
      })}
    </ul>
  );
};

function Sidebar({
  collections,
  currentCollectionId,
  onCollectionClick,
  onAddCollection,
  onDeleteCollection,
  onAddFolders,
  onToggleFolder
}) {
  const activeCollection = collections.find(c => c.id === currentCollectionId);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>Проекты</h2>
      </div>

      <div className="sidebar-actions">
        <button className="new-collection-btn" onClick={onAddCollection}>
          + Добавить проект
        </button>
      </div>

      <div className="collections-list">
        {collections.length === 0 ? (
          <div className="no-collections">
            <p>Нет проектов</p>
            <p className="hint">Нажмите "Новый проект" чтобы создать</p>
          </div>
        ) : (
          collections.map((collection) => (
            <React.Fragment key={collection.id}>
              <div
                className={`collection-item ${collection.id === currentCollectionId ? "active" : ""}`}
                onClick={() => onCollectionClick(collection.id)}
              >
                <span className="collection-icon">📦</span>
                <span className="collection-name" style={{ flexGrow: 1 }}>{collection.name}</span>
                <span className="collection-count">{collection.imageCount}</span>
                <button
                  type="button"
                  className="collection-delete-btn"
                  title={`Удалить ${collection.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeleteCollection(collection.id);
                  }}
                >
                  🗑
                </button>
              </div>

              {collection.id === currentCollectionId && (
                <div className="active-project-workspace">
                  <button className="add-folders-btn" onClick={onAddFolders}>
                    + Добавить папки в проект
                  </button>
                  <div className="tree-container">
                    <FolderTree nodes={activeCollection?.folders} onToggle={onToggleFolder} />
                  </div>
                </div>
              )}
            </React.Fragment>
          ))
        )}
      </div>
    </aside>
  );
}

export default Sidebar;