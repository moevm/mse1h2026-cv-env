import "../../styles/Layout.css";

function Sidebar({
  collections,
  currentCollectionId,
  onCollectionClick,
  onAddCollection,
  onDeleteCollection,
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>Проекты</h2>
      </div>

      <div className="sidebar-actions">
        <button className="new-collection-btn" onClick={onAddCollection}>
          + Новый проект
        </button>
      </div>

      <div className="collections-list">
        {collections.length === 0 ? (
          <div className="no-collections">
            <p>Нет коллекций</p>
            <p className="hint">Нажмите "Новая коллекция" чтобы создать</p>
          </div>
        ) : (
          collections.map((collection) => (
            <div
              key={collection.id}
              className={`collection-item ${collection.id === currentCollectionId ? `active` : ``}`}
              onClick={() => onCollectionClick(collection.id)}
            >
              <span className="collection-icon">📁</span>
              <span className="collection-name">{collection.name}</span>
              <span className="collection-count">{collection.imageCount}</span>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

export default Sidebar;
