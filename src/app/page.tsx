'use client';
import React, { useState, useEffect } from 'react';
import Sidebar, { ViewType } from '@/components/Sidebar';
import Navbar from '@/components/Navbar';
import EmergencyStopModal from '@/components/EmergencyStopModal';
import OrderModal from '@/components/OrderModal';
import ProposalModal from '@/components/ProposalModal';
import GlossaryModal from '@/components/GlossaryModal';

// Views
import DashboardView from '@/components/views/DashboardView';
import OnboardingView from '@/components/views/OnboardingView';
import VirtualPortfolioView from '@/components/views/VirtualPortfolioView';
import RealPortfolioView from '@/components/views/RealPortfolioView';
import MarketView from '@/components/views/MarketView';
import ResearchView from '@/components/views/ResearchView';
import StrategyView from '@/components/views/StrategyView';
import AgentsView from '@/components/views/AgentsView';
import OrdersView from '@/components/views/OrdersView';
import DecisionsView from '@/components/views/DecisionsView';
import AnalyticsView from '@/components/views/AnalyticsView';
import BacktestingView from '@/components/views/BacktestingView';
import RiskView from '@/components/views/RiskView';
import ReportsView from '@/components/views/ReportsView';
import NotificationsView from '@/components/views/NotificationsView';
import BrokerView from '@/components/views/BrokerView';
import PermissionsView from '@/components/views/PermissionsView';
import AdvancedWorkspaceView from '@/components/views/AdvancedWorkspaceView';
import SettingsView from '@/components/views/SettingsView';
import SystemHealthView from '@/components/views/SystemHealthView';

export default function HomePage() {
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [activePortfolioType, setActivePortfolioType] = useState<'REAL' | 'VIRTUAL'>('VIRTUAL');
  const [experienceMode, setExperienceMode] = useState<'BEGINNER' | 'ADVANCED'>('BEGINNER');
  const [emergencyStopEnabled, setEmergencyStopEnabled] = useState(false);

  // Modals state
  const [isEmergencyStopOpen, setIsEmergencyStopOpen] = useState(false);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [isProposalModalOpen, setIsProposalModalOpen] = useState(false);
  const [isGlossaryModalOpen, setIsGlossaryModalOpen] = useState(false);
  const [selectedAssetForOrder, setSelectedAssetForOrder] = useState<any | null>(null);

  // App data state
  const [portfolios, setPortfolios] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [observations, setObservations] = useState<any[]>([]);
  const [proposals, setProposals] = useState<any[]>([]);
  const [theses, setTheses] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [userSettings, setUserSettings] = useState<any | null>(null);
  const [marketSession, setMarketSession] = useState<any>({
    isOpen: true,
    session: 'REGULAR',
    currentTimeIST: '11:45 IST'
  });
  const [loading, setLoading] = useState(true);

  // Fetch all core data
  const loadData = async () => {
    try {
      const [portRes, mktRes, agentRes, propRes, setRes] = await Promise.all([
        fetch('/api/portfolios').then((r) => r.json()),
        fetch('/api/market').then((r) => r.json()),
        fetch('/api/agents').then((r) => r.json()),
        fetch('/api/proposals').then((r) => r.json()),
        fetch('/api/settings').then((r) => r.json()),
      ]);

      setPortfolios(portRes.portfolios || []);
      setPositions(portRes.positions || []);
      setLedger(portRes.ledger || []);

      setQuotes(mktRes.quotes || []);
      if (mktRes.session) setMarketSession(mktRes.session);

      setObservations(agentRes.observations || []);
      setTheses(agentRes.theses || []);
      setRuns(agentRes.runs || []);

      setProposals(propRes.proposals || []);

      if (setRes.settings) {
        setUserSettings(setRes.settings);
        setEmergencyStopEnabled(setRes.settings.emergency_stop_enabled === 1);
        if (setRes.settings.experience_mode) {
          setExperienceMode(setRes.settings.experience_mode);
        }
      }
      setPermissions(setRes.permissions || []);
    } catch (e) {
      console.error('Error loading data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 20000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleEmergencyStop = async (enable: boolean, reason: string) => {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle_emergency_stop', enable, reason })
    });
    if (res.ok) {
      setEmergencyStopEnabled(enable);
      loadData();
    }
  };

  const handleUpdateMode = async (mode: string) => {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_mode', controlMode: mode })
    });
    if (res.ok) loadData();
  };

  const handleToggleExperienceMode = async (mode: 'BEGINNER' | 'ADVANCED') => {
    setExperienceMode(mode);
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_mode', experienceMode: mode })
    });
  };

  const currentPortfolio = portfolios.find((p) => p.type === activePortfolioType) || portfolios[0] || {
    id: 'port_virt_01',
    name: 'Virtual Wealth Builder',
    type: 'VIRTUAL',
    current_cash: 25000,
    total_value: 25000,
    invested_value: 0
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 font-sans text-slate-100">
      {/* Sidebar Navigation */}
      <Sidebar
        currentView={currentView}
        onSelectView={(v) => setCurrentView(v)}
        activePortfolioType={activePortfolioType}
        experienceMode={experienceMode}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <Navbar
          activePortfolioType={activePortfolioType}
          onTogglePortfolioType={(t) => setActivePortfolioType(t)}
          experienceMode={experienceMode}
          onToggleExperienceMode={handleToggleExperienceMode}
          emergencyStopEnabled={emergencyStopEnabled}
          onOpenEmergencyStop={() => setIsEmergencyStopOpen(true)}
          onOpenOrderModal={() => {
            setSelectedAssetForOrder(null);
            setIsOrderModalOpen(true);
          }}
          onOpenProposalModal={() => setIsProposalModalOpen(true)}
          onOpenGlossaryModal={() => setIsGlossaryModalOpen(true)}
          marketSession={marketSession}
        />

        {/* Dynamic View Body */}
        <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
          {currentView === 'dashboard' && (
            <DashboardView
              data={{
                portfolios,
                positions,
                quotes,
                observations,
                proposals,
                settings: userSettings
              }}
              activePortfolioType={activePortfolioType}
              onSelectView={setCurrentView}
              onOpenOrderModal={(asset) => {
                setSelectedAssetForOrder(asset);
                setIsOrderModalOpen(true);
              }}
              onOpenProposalModal={() => setIsProposalModalOpen(true)}
              experienceMode={experienceMode}
            />
          )}

          {currentView === 'onboarding' && (
            <OnboardingView
              onSelectView={setCurrentView}
              onOpenOrderModal={() => setIsOrderModalOpen(true)}
              onOpenProposalModal={() => setIsProposalModalOpen(true)}
            />
          )}

          {currentView === 'virtual-portfolio' && (
            <VirtualPortfolioView
              portfolio={portfolios.find((p) => p.type === 'VIRTUAL')}
              positions={positions}
              ledger={ledger}
              onOpenOrderModal={(asset) => {
                setSelectedAssetForOrder(asset);
                setIsOrderModalOpen(true);
              }}
              onOpenProposalModal={() => setIsProposalModalOpen(true)}
              onRefresh={loadData}
            />
          )}

          {currentView === 'real-portfolio' && (
            <RealPortfolioView
              portfolio={portfolios.find((p) => p.type === 'REAL')}
              positions={positions}
              onSelectView={setCurrentView}
              onOpenOrderModal={() => setIsOrderModalOpen(true)}
            />
          )}

          {currentView === 'market' && (
            <MarketView
              quotes={quotes}
              session={marketSession}
              onSelectAsset={(sym) => {
                setCurrentView('research');
              }}
              onOpenOrderModal={(asset) => {
                setSelectedAssetForOrder(asset);
                setIsOrderModalOpen(true);
              }}
            />
          )}

          {currentView === 'research' && (
            <ResearchView
              initialSymbol="RELIANCE"
              onOpenOrderModal={(asset) => {
                setSelectedAssetForOrder(asset);
                setIsOrderModalOpen(true);
              }}
              onOpenProposalModal={() => setIsProposalModalOpen(true)}
            />
          )}

          {currentView === 'workspace' && (
            <AdvancedWorkspaceView
              quotes={quotes}
              onOpenOrderModal={(asset) => {
                setSelectedAssetForOrder(asset);
                setIsOrderModalOpen(true);
              }}
            />
          )}

          {currentView === 'agents' && (
            <AgentsView
              agentsData={{ runs, observations, theses }}
              onRefresh={loadData}
              onOpenProposalModal={() => setIsProposalModalOpen(true)}
            />
          )}

          {currentView === 'strategies' && (
            <StrategyView onSelectView={setCurrentView} />
          )}

          {currentView === 'orders' && (
            <OrdersView activePortfolioType={activePortfolioType} />
          )}

          {currentView === 'decisions' && (
            <DecisionsView
              activePortfolioType={activePortfolioType}
              experienceMode={experienceMode}
            />
          )}

          {currentView === 'analytics' && (
            <AnalyticsView
              portfolio={currentPortfolio}
              positions={positions}
            />
          )}

          {currentView === 'backtesting' && (
            <BacktestingView />
          )}

          {currentView === 'risk' && (
            <RiskView
              portfolio={currentPortfolio}
              permissions={permissions}
              onSelectView={setCurrentView}
              onOpenEmergencyStop={() => setIsEmergencyStopOpen(true)}
            />
          )}

          {currentView === 'reports' && (
            <ReportsView activePortfolioType={activePortfolioType} />
          )}

          {currentView === 'notifications' && (
            <NotificationsView />
          )}

          {currentView === 'broker' && (
            <BrokerView onRefresh={loadData} />
          )}

          {currentView === 'permissions' && (
            <PermissionsView
              currentControlMode={userSettings?.control_mode || 'COPILOT'}
              onUpdateMode={handleUpdateMode}
            />
          )}

          {currentView === 'settings' && (
            <SettingsView
              experienceMode={experienceMode}
              onToggleExperienceMode={handleToggleExperienceMode}
            />
          )}

          {currentView === 'system-health' && (
            <SystemHealthView />
          )}
        </main>
      </div>

      {/* Global Modals */}
      <EmergencyStopModal
        isOpen={isEmergencyStopOpen}
        isTriggered={emergencyStopEnabled}
        onClose={() => setIsEmergencyStopOpen(false)}
        onConfirm={handleToggleEmergencyStop}
      />

      <OrderModal
        isOpen={isOrderModalOpen}
        portfolio={currentPortfolio}
        assets={quotes.map((q) => ({ id: q.assetId, symbol: q.symbol, name: q.name, price: q.price }))}
        preselectedAsset={selectedAssetForOrder}
        onClose={() => setIsOrderModalOpen(false)}
        onSuccess={() => {
          loadData();
          setCurrentView('orders');
        }}
      />

      <ProposalModal
        isOpen={isProposalModalOpen}
        portfolio={currentPortfolio}
        assets={quotes.map((q) => ({ id: q.assetId, symbol: q.symbol, name: q.name }))}
        onClose={() => setIsProposalModalOpen(false)}
        onSuccess={() => {
          loadData();
          setCurrentView('decisions');
        }}
      />

      <GlossaryModal
        isOpen={isGlossaryModalOpen}
        onClose={() => setIsGlossaryModalOpen(false)}
      />
    </div>
  );
}
