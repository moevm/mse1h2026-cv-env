import "../../styles/Layout.css";

function Navbar({ currentTabId, onTabClick }) {
  const tabs = [
    { id: "dataset", label: "Датасет", icon: "📊" },
    { id: "annotation", label: "Разметка", icon: "✏️" },
    { id: "augmentation", label: "Аугментация", icon: "🔄" },
    { id: "training", label: "Обучение", icon: "🤖" },
    { id: "experiments", label: "Эксперименты", icon: "🔬" },
  ];

  return (
    <nav className="navbar">
      <div className="navbar-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab-name ${tab.id === currentTabId ? `active` : ``}`}
            onClick={() => onTabClick(tab.id)}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

export default Navbar;
