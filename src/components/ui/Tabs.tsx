import { useState, ReactNode } from 'react';

export interface Tab {
  id: string;
  label: string;
  content?: ReactNode;
}

export interface TabsProps {
  tabs: Tab[];
  defaultTab?: string;
  activeTab?: string;
  onChange?: (tabId: string) => void;
  onTabChange?: (tabId: string) => void;
  children?: ReactNode;
}

export function Tabs({ tabs, defaultTab, activeTab: controlledActiveTab, onChange, onTabChange, children }: TabsProps) {
  const [internalActiveTab, setInternalActiveTab] = useState(defaultTab || tabs[0]?.id);

  // Support both controlled and uncontrolled modes
  const activeTab = controlledActiveTab ?? internalActiveTab;

  const handleTabChange = (tabId: string) => {
    setInternalActiveTab(tabId);
    onChange?.(tabId);
    onTabChange?.(tabId);
  };

  // If children are provided, render them; otherwise use tab.content
  const activeContent = children || tabs.find((tab) => tab.id === activeTab)?.content;

  return (
    <div className="tabs">
      <div className="tabs-header">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => handleTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="tabs-content">{activeContent}</div>
    </div>
  );
}
